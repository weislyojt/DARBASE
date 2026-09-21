const express = require('express');
const { many, one } = require('../db');
const storage = require('../storage');
const { requireAuth } = require('../middleware/auth');
const { createZip } = require('../zipStream');
const { CATEGORIES, findCluster, findMunicipality } = require('../clustersData');
const { wrap } = require('../asyncRoute');
const activity = require('../activity');

const router = express.Router();

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 54;

function safeName(s, fallback) {
  const cleaned = String(s || '').replace(/[^\w\s.\-]/g, '').trim();
  return cleaned || fallback || 'file';
}

/* pdf-lib's standard fonts use WinAnsi encoding and throw on characters
   outside it. A single odd character in a filename would otherwise abort the
   whole merge, so everything drawn is normalised to safe text first. */
function pdfSafe(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\xFF]/g, '?');
}

function groupDigits(v) {
  return String(v || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* Orders documents by the official document-form list, so a bundle always
   reads in the same sequence as the checklist rather than upload order. */
function orderedFiles(files) {
  return files.slice().sort(function (a, b) {
    const ai = CATEGORIES.indexOf(a.category);
    const bi = CATEGORIES.indexOf(b.category);
    const aRank = ai === -1 ? CATEGORIES.length : ai;
    const bRank = bi === -1 ? CATEGORIES.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

async function loadFolder(id) {
  const folder = await one('SELECT * FROM folders WHERE id = $1', [id]);
  if (!folder) return null;
  const files = await many('SELECT * FROM files WHERE folder_id = $1', [id]);
  return {
    folder: folder,
    files: orderedFiles(files),
    cluster: findCluster(folder.cluster_slug),
    municipality: findMunicipality(folder.cluster_slug, folder.municipality_slug)
  };
}

function summaryLines(data) {
  const f = data.folder;
  return [
    ['Title Number', f.title_number],
    ['ARB / Landholder', f.name],
    ['Sequence No.', f.sequence_number],
    ['Barangay', f.location],
    ['Municipality', data.municipality ? data.municipality.name : f.municipality_slug],
    ['Cluster', data.cluster ? 'Cluster ' + data.cluster.id + ' - ' + data.cluster.office : f.cluster_slug],
    ['Total Area', groupDigits(f.total_area) + ' sqm'],
    ['Remarks', f.remarks || 'None'],
    ['Documents', String(data.files.length)]
  ];
}

/* ===== 1. ZIP: every document, originals untouched ===== */
router.get('/folders/:id/bundle.zip', requireAuth, wrap(async function (req, res) {
  const data = await loadFolder(req.params.id);
  if (!data) return res.status(404).json({ error: 'Folder not found.' });
  if (data.files.length === 0) {
    return res.status(400).json({ error: 'This folder has no documents yet.' });
  }

  const zip = createZip();
  const missing = [];
  let index = 1;

  for (const file of data.files) {
    let buf = null;
    try { buf = await storage.getBuffer(file.stored_name); } catch (e) { buf = null; }
    if (!buf) { missing.push(file.file_name); continue; }

    const prefix = String(index).padStart(2, '0');
    const category = safeName(file.category, 'Uncategorized').slice(0, 60);
    const name = safeName(file.file_name, 'document');
    zip.add(prefix + ' - ' + category + ' - ' + name, buf, new Date(file.created_at));
    index++;
  }

  // A readable index so the recipient knows what they are looking at.
  const lines = summaryLines(data).map(function (p) { return p[0] + ': ' + p[1]; });
  lines.push('', 'Generated: ' + new Date().toISOString().slice(0, 16).replace('T', ' '), '', 'CONTENTS');
  data.files.forEach(function (f, i) {
    lines.push('  ' + String(i + 1).padStart(2, '0') + '. [' + (f.category || 'Uncategorized') + '] ' + f.file_name);
  });
  if (missing.length) {
    lines.push('', 'MISSING FROM STORAGE (' + missing.length + '):');
    missing.forEach(function (m) { lines.push('  - ' + m); });
  }
  zip.add('CONTENTS.txt', lines.join('\n') + '\n');

  activity.log(req, 'file.bundle_zip',
    'Downloaded all ' + data.files.length + ' document(s) of ' + data.folder.title_number + ' as a ZIP',
    { entityType: 'folder', entityId: data.folder.id });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition',
    'attachment; filename="' + safeName(data.folder.title_number, 'folder') + ' - documents.zip"');
  zip.finish(res);
  res.end();
}));

/* ===== 2. MERGED PDF: one document containing everything mergeable =====
   PDFs are copied page by page; images become full pages. Anything else
   (Word, Excel) cannot be converted without a heavyweight office renderer,
   so those are listed on the cover page and left out. */
router.get('/folders/:id/bundle.pdf', requireAuth, wrap(async function (req, res) {
  const data = await loadFolder(req.params.id);
  if (!data) return res.status(404).json({ error: 'Folder not found.' });
  if (data.files.length === 0) {
    return res.status(400).json({ error: 'This folder has no documents yet.' });
  }

  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const merged = await PDFDocument.create();
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const bold = await merged.embedFont(StandardFonts.HelveticaBold);

  const included = [];
  const skipped = [];

  for (const file of data.files) {
    let buf = null;
    try { buf = await storage.getBuffer(file.stored_name); } catch (e) { buf = null; }
    if (!buf) { skipped.push([file.file_name, 'missing from storage']); continue; }

    const mime = String(file.mime_type || '').toLowerCase();
    try {
      if (mime === 'application/pdf') {
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(function (p) { merged.addPage(p); });
        included.push([file.file_name, file.category, pages.length + ' page(s)']);
      } else if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png') {
        const img = mime === 'image/png' ? await merged.embedPng(buf) : await merged.embedJpg(buf);
        // Fit the image inside an A4 page, preserving aspect ratio.
        const maxW = A4.width - MARGIN, maxH = A4.height - MARGIN * 2;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        const page = merged.addPage([A4.width, A4.height]);
        page.drawImage(img, {
          x: (A4.width - w) / 2,
          y: (A4.height - h) / 2 - 10,
          width: w, height: h
        });
        page.drawText(pdfSafe(file.category || 'Uncategorized').slice(0, 90), {
          x: MARGIN / 2, y: A4.height - 28, size: 8, font: font, color: rgb(0.35, 0.35, 0.35)
        });
        included.push([file.file_name, file.category, '1 page (image)']);
      } else {
        skipped.push([file.file_name, 'format cannot be merged into a PDF']);
      }
    } catch (err) {
      skipped.push([file.file_name, 'could not be read (' + err.message.slice(0, 60) + ')']);
    }
  }

  /* Cover page, inserted first. */
  const cover = merged.insertPage(0, [A4.width, A4.height]);
  let y = A4.height - MARGIN;
  const green = rgb(0.02, 0.28, 0.11);

  cover.drawText('ILDF DAR BATANGAS', { x: MARGIN, y: y, size: 10, font: bold, color: green });
  y -= 14;
  cover.drawText('Consolidated Document Bundle', { x: MARGIN, y: y, size: 9, font: font, color: rgb(0.4, 0.4, 0.4) });
  y -= 28;
  cover.drawLine({
    start: { x: MARGIN, y: y }, end: { x: A4.width - MARGIN, y: y },
    thickness: 1.5, color: green
  });
  y -= 30;

  cover.drawText(pdfSafe(data.folder.title_number), { x: MARGIN, y: y, size: 20, font: bold, color: green });
  y -= 30;

  summaryLines(data).forEach(function (pair) {
    cover.drawText(pdfSafe(pair[0]), { x: MARGIN, y: y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    cover.drawText(pdfSafe(pair[1]), { x: MARGIN + 130, y: y, size: 10, font: font, color: rgb(0.1, 0.1, 0.1) });
    y -= 17;
  });

  y -= 14;
  cover.drawText('Generated ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    { x: MARGIN, y: y, size: 8, font: font, color: rgb(0.5, 0.5, 0.5) });
  y -= 26;

  cover.drawText('INCLUDED IN THIS PDF (' + included.length + ')',
    { x: MARGIN, y: y, size: 9, font: bold, color: green });
  y -= 16;
  included.forEach(function (row, i) {
    if (y < MARGIN + 60) return;
    const label = (i + 1) + '. ' + String(row[1] || 'Uncategorized');
    cover.drawText(pdfSafe(label).slice(0, 74), { x: MARGIN, y: y, size: 8.5, font: font, color: rgb(0.15, 0.15, 0.15) });
    cover.drawText(pdfSafe(row[2]), { x: A4.width - MARGIN - 70, y: y, size: 8, font: font, color: rgb(0.45, 0.45, 0.45) });
    y -= 13;
  });

  if (skipped.length) {
    y -= 14;
    cover.drawText('NOT INCLUDED (' + skipped.length + ') - download the ZIP for these',
      { x: MARGIN, y: y, size: 9, font: bold, color: rgb(0.54, 0.23, 0.2) });
    y -= 15;
    skipped.forEach(function (row) {
      if (y < MARGIN) return;
      cover.drawText(pdfSafe('- ' + row[0] + ' (' + row[1] + ')').slice(0, 92),
        { x: MARGIN, y: y, size: 8, font: font, color: rgb(0.4, 0.3, 0.3) });
      y -= 12;
    });
  }

  const bytes = await merged.save();
  activity.log(req, 'file.bundle_pdf',
    'Downloaded a merged PDF of ' + data.folder.title_number +
    ' (' + included.length + ' included, ' + skipped.length + ' skipped)',
    { entityType: 'folder', entityId: data.folder.id });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    'attachment; filename="' + safeName(data.folder.title_number, 'folder') + ' - bundle.pdf"');
  res.send(Buffer.from(bytes));
}));

module.exports = router;
