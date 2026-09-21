const express = require('express');
const { many, one, run } = require('../db');
const storage = require('../storage');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { findCluster, findMunicipality } = require('../clustersData');
const { wrap } = require('../asyncRoute');
const activity = require('../activity');

const router = express.Router();

const FOLDER_WITH_COUNT =
  'SELECT f.*, (SELECT COUNT(*)::int FROM files WHERE folder_id = f.id) AS file_count FROM folders f';

// List folders for a cluster + municipality, each with a file count.
router.get('/folders', requireAuth, wrap(async function (req, res) {
  const { cluster, municipality } = req.query;
  if (!cluster || !municipality) {
    return res.status(400).json({ error: 'cluster and municipality query params are required.' });
  }
  if (!findMunicipality(cluster, municipality)) {
    return res.status(404).json({ error: 'Unknown cluster or municipality.' });
  }
  const folders = await many(
    FOLDER_WITH_COUNT + ' WHERE f.cluster_slug = $1 AND f.municipality_slug = $2 ORDER BY f.created_at DESC',
    [cluster, municipality]
  );
  res.json({ folders: folders });
}));

// Create a title folder.
router.post('/folders', requireAuth, wrap(async function (req, res) {
  const { clusterSlug, municipalitySlug, titleNumber, sequenceNumber,
          name, location, totalArea, remarks } = req.body || {};
  if (!findMunicipality(clusterSlug, municipalitySlug)) {
    return res.status(404).json({ error: 'Unknown cluster or municipality.' });
  }
  if (!titleNumber || !sequenceNumber || !name || !location || !totalArea) {
    return res.status(400).json({ error: 'All folder fields are required.' });
  }
  const cleanRemarks = String(remarks || '').toUpperCase().trim().slice(0, 60);
  // Store area digits-only so range filtering stays reliable.
  const cleanArea = String(totalArea).replace(/[^0-9.]/g, '');

  const result = await run(
    `INSERT INTO folders
       (cluster_slug, municipality_slug, title_number, sequence_number, name, location, total_area, remarks,
        created_by, created_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      clusterSlug, municipalitySlug,
      String(titleNumber).toUpperCase().trim(),
      String(sequenceNumber).toUpperCase().trim(),
      String(name).toUpperCase().trim(),
      String(location).toUpperCase().trim(),
      cleanArea,
      cleanRemarks,
      req.session.userId || null,
      req.session.username || null
    ]
  );
  const created = result.rows[0];
  activity.log(req, 'folder.create',
    'Created folder ' + created.title_number + ' (' + created.name + ')',
    { entityType: 'folder', entityId: created.id });
  res.status(201).json({ folder: created });
}));

// Update remarks and/or the map pin.
router.patch('/folders/:id', requireAuth, wrap(async function (req, res) {
  const folder = await one('SELECT * FROM folders WHERE id = $1', [req.params.id]);
  if (!folder) return res.status(404).json({ error: 'Folder not found.' });
  const body = req.body || {};

  if (body.remarks !== undefined) {
    const remarks = String(body.remarks || '').toUpperCase().trim().slice(0, 60);
    await run('UPDATE folders SET remarks = $1 WHERE id = $2', [remarks, folder.id]);
    activity.log(req, 'folder.remarks',
      'Changed remarks on ' + folder.title_number + ' from "' +
      (folder.remarks || 'none') + '" to "' + (remarks || 'none') + '"',
      { entityType: 'folder', entityId: folder.id });
  }

  // Sending null for both clears the pin.
  if (body.latitude !== undefined || body.longitude !== undefined) {
    if (body.latitude === null && body.longitude === null) {
      await run('UPDATE folders SET latitude = NULL, longitude = NULL WHERE id = $1', [folder.id]);
      activity.log(req, 'folder.unpin', 'Removed the map pin from ' + folder.title_number,
        { entityType: 'folder', entityId: folder.id });
    } else {
      const lat = Number(body.latitude);
      const lng = Number(body.longitude);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Invalid coordinates.' });
      }
      await run('UPDATE folders SET latitude = $1, longitude = $2 WHERE id = $3', [lat, lng, folder.id]);
      activity.log(req, 'folder.pin',
        'Set the map pin on ' + folder.title_number + ' to ' + lat.toFixed(6) + ', ' + lng.toFixed(6),
        { entityType: 'folder', entityId: folder.id });
    }
  }

  res.json({ folder: await one('SELECT * FROM folders WHERE id = $1', [folder.id]) });
}));

/* Search across the province, or scoped to a cluster / municipality.
   Declared BEFORE /folders/:id so 'search' isn't read as an id. */
router.get('/folders/search', requireAuth, wrap(async function (req, res) {
  const { q, cluster, municipality, minArea, maxArea, remarks,
          titleNumber, arbName, barangay, sequenceNumber, documents } = req.query;

  const where = [];
  const params = [];
  function add(clause, value) {
    params.push(value);
    where.push(clause.replace('?', '$' + params.length));
  }

  if (cluster) add('f.cluster_slug = ?', cluster);
  if (municipality) add('f.municipality_slug = ?', municipality);
  if (remarks) add('f.remarks = ?', remarks);

  if (q && q.trim()) {
    const like = '%' + q.trim().toUpperCase() + '%';
    params.push(like);
    const p = '$' + params.length;
    where.push('(UPPER(f.title_number) LIKE ' + p + ' OR UPPER(f.name) LIKE ' + p +
               ' OR UPPER(f.location) LIKE ' + p + ' OR UPPER(f.sequence_number) LIKE ' + p + ')');
  }

  [['title_number', titleNumber], ['name', arbName],
   ['location', barangay], ['sequence_number', sequenceNumber]
  ].forEach(function (pair) {
    if (pair[1] && String(pair[1]).trim()) {
      add('UPPER(f.' + pair[0] + ') LIKE ?', '%' + String(pair[1]).trim().toUpperCase() + '%');
    }
  });

  if (documents === 'with') {
    where.push('(SELECT COUNT(*) FROM files WHERE folder_id = f.id) > 0');
  } else if (documents === 'without') {
    where.push('(SELECT COUNT(*) FROM files WHERE folder_id = f.id) = 0');
  }

  /* total_area is text and may hold commas. Strip them, and guard against
     an empty string, which Postgres would refuse to cast. */
  const areaExpr =
    "NULLIF(REGEXP_REPLACE(f.total_area, '[^0-9.]', '', 'g'), '')::numeric";
  if (minArea !== undefined && minArea !== '') {
    const n = Number(minArea);
    if (!isNaN(n)) add(areaExpr + ' >= ?', n);
  }
  if (maxArea !== undefined && maxArea !== '') {
    const n = Number(maxArea);
    if (!isNaN(n)) add(areaExpr + ' <= ?', n);
  }

  const sql = FOLDER_WITH_COUNT +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY f.created_at DESC LIMIT 500';

  const folders = await many(sql, params);

  const enriched = folders.map(function (f) {
    const c = findCluster(f.cluster_slug);
    const m = findMunicipality(f.cluster_slug, f.municipality_slug);
    return Object.assign({}, f, {
      cluster_id: c ? c.id : null,
      cluster_name: c ? c.marpo : f.cluster_slug,
      municipality_name: m ? m.name : f.municipality_slug
    });
  });

  res.json({ folders: enriched, count: enriched.length });
}));

/* ===== GOOGLE EARTH (KML) EXPORT ===== */

function xmlEscape(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function folderPlacemark(f) {
  const c = findCluster(f.cluster_slug);
  const m = findMunicipality(f.cluster_slug, f.municipality_slug);
  const area = String(f.total_area || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const desc =
    'ARB / Landholder: ' + (f.name || '') + '\n' +
    'Sequence No.: ' + (f.sequence_number || '') + '\n' +
    'Barangay: ' + (f.location || '') + '\n' +
    'Municipality: ' + (m ? m.name : f.municipality_slug) + '\n' +
    'Cluster: ' + (c ? 'Cluster ' + c.id + ' - ' + c.office : f.cluster_slug) + '\n' +
    'Total Area: ' + area + ' sqm\n' +
    'Remarks: ' + (f.remarks || 'None');

  return '  <Placemark>\n' +
    '    <name>' + xmlEscape(f.title_number) + '</name>\n' +
    '    <description>' + xmlEscape(desc) + '</description>\n' +
    (f.remarks ? '    <styleUrl>#' + xmlEscape(f.remarks.toLowerCase().replace(/[^a-z]+/g, '-')) + '</styleUrl>\n' : '') +
    '    <Point><coordinates>' + f.longitude + ',' + f.latitude + ',0</coordinates></Point>\n' +
    '  </Placemark>\n';
}

const KML_STYLES =
  '  <Style id="sold"><IconStyle><color>ff3b3bd6</color>' +
  '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon></IconStyle></Style>\n' +
  '  <Style id="recommended"><IconStyle><color>ff3ba33b</color>' +
  '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href></Icon></IconStyle></Style>\n' +
  '  <Style id="not-recommended"><IconStyle><color>ff1ea9e8</color>' +
  '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png</href></Icon></IconStyle></Style>\n' +
  '  <Style id="timberland"><IconStyle><color>ff4c8f3d</color>' +
  '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-blank.png</href></Icon></IconStyle></Style>\n';

function buildKml(docName, folders) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n' +
    '  <name>' + xmlEscape(docName) + '</name>\n' +
    KML_STYLES +
    folders.map(folderPlacemark).join('') +
    '</Document>\n</kml>\n';
}

function sendKml(res, filename, kml) {
  res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename.replace(/[^\w.\-]+/g, '_') + '"');
  res.send(kml);
}

// Batch export of every pinned record, optionally scoped.
router.get('/folders/kml', requireAuth, wrap(async function (req, res) {
  const { cluster, municipality } = req.query;
  const where = ['latitude IS NOT NULL', 'longitude IS NOT NULL'];
  const params = [];
  if (cluster) { params.push(cluster); where.push('cluster_slug = $' + params.length); }
  if (municipality) { params.push(municipality); where.push('municipality_slug = $' + params.length); }

  const folders = await many(
    'SELECT * FROM folders WHERE ' + where.join(' AND ') + ' ORDER BY title_number', params
  );
  if (folders.length === 0) {
    return res.status(404).json({ error: 'No pinned records to export yet.' });
  }

  let label = 'ILDF DAR Batangas';
  if (municipality) {
    const m = findMunicipality(cluster, municipality);
    if (m) label += ' - ' + m.name;
  } else if (cluster) {
    const c = findCluster(cluster);
    if (c) label += ' - Cluster ' + c.id;
  }
  sendKml(res, label + '.kml', buildKml(label, folders));
}));

router.get('/folders/:id/kml', requireAuth, wrap(async function (req, res) {
  const folder = await one('SELECT * FROM folders WHERE id = $1', [req.params.id]);
  if (!folder) return res.status(404).json({ error: 'Folder not found.' });
  if (folder.latitude === null || folder.longitude === null) {
    return res.status(400).json({ error: 'This record has no map pin yet.' });
  }
  sendKml(res, folder.title_number + '.kml', buildKml(folder.title_number, [folder]));
}));

// Folder detail + its files.
router.get('/folders/:id', requireAuth, wrap(async function (req, res) {
  const folder = await one('SELECT * FROM folders WHERE id = $1', [req.params.id]);
  if (!folder) return res.status(404).json({ error: 'Folder not found.' });
  const files = await many('SELECT * FROM files WHERE folder_id = $1 ORDER BY created_at DESC', [folder.id]);
  res.json({
    folder: folder,
    files: files,
    cluster: findCluster(folder.cluster_slug),
    municipality: findMunicipality(folder.cluster_slug, folder.municipality_slug)
  });
}));

// Delete a folder and every document inside it.
router.delete('/folders/:id', requireAuth, requireAdmin, wrap(async function (req, res) {
  const folder = await one('SELECT * FROM folders WHERE id = $1', [req.params.id]);
  if (!folder) return res.status(404).json({ error: 'Folder not found.' });

  const files = await many('SELECT stored_name FROM files WHERE folder_id = $1', [folder.id]);
  for (const f of files) {
    try { await storage.remove(f.stored_name); }
    catch (e) { console.error('[folders] Could not remove ' + f.stored_name + ':', e.message); }
  }
  // files rows are removed by ON DELETE CASCADE.
  await run('DELETE FROM folders WHERE id = $1', [folder.id]);
  activity.log(req, 'folder.delete',
    'Deleted folder ' + folder.title_number + ' (' + folder.name + ') and its ' +
    files.length + ' document(s)',
    { entityType: 'folder', entityId: folder.id });
  res.json({ ok: true });
}));

module.exports = router;
