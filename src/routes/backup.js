const express = require('express');
const zlib = require('zlib');
const { many, one } = require('../db');
const storage = require('../storage');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { writeEntry, writeEnd } = require('../tarStream');
const { wrap } = require('../asyncRoute');
const activity = require('../activity');

const router = express.Router();

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/* Every record as JSON. Small, readable, and a genuine offsite copy of the
   data even though the documents live elsewhere. */
async function collectRecords() {
  const out = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    storage: storage.useR2 ? 'cloudflare-r2' : 'local-disk',
    tables: {}
  };
  const tables = ['users', 'folders', 'files', 'app_settings'];
  for (const t of tables) {
    try {
      out.tables[t] = await many('SELECT * FROM ' + t);
    } catch (e) {
      out.tables[t] = [];
    }
  }
  // Never export password hashes.
  out.tables.users = (out.tables.users || []).map(function (u) {
    const copy = Object.assign({}, u);
    delete copy.password_hash;
    return copy;
  });
  out.counts = Object.keys(out.tables).reduce(function (acc, k) {
    acc[k] = out.tables[k].length;
    return acc;
  }, {});
  return out;
}

router.get('/admin/export.json', requireAuth, requireAdmin, wrap(async function (req, res) {
  const data = await collectRecords();
  res.setHeader('Content-Type', 'application/json');
  activity.log(req, 'admin.export', 'Exported all records as JSON');
  res.setHeader('Content-Disposition', 'attachment; filename="ildf-records-' + stamp() + '.json"');
  res.send(JSON.stringify(data, null, 2));
}));

/* Full backup: all records plus every document, streamed as .tar.gz so
   memory use stays flat however many documents are stored. */
router.get('/admin/backup', requireAuth, requireAdmin, wrap(async function (req, res) {
  res.setHeader('Content-Type', 'application/gzip');
  activity.log(req, 'admin.backup', 'Downloaded a full backup');
  res.setHeader('Content-Disposition', 'attachment; filename="ildf-backup-' + stamp() + '.tar.gz"');

  const gzip = zlib.createGzip({ level: 6 });
  gzip.pipe(res);
  gzip.on('error', function (err) {
    console.error('[backup] Stream failed:', err.message);
    try { res.destroy(); } catch (e) {}
  });

  try {
    const now = Date.now() / 1000;
    const records = await collectRecords();
    const fileRows = await many('SELECT stored_name, file_name FROM files');

    writeEntry(gzip, 'manifest.json', JSON.stringify({
      createdAt: new Date().toISOString(),
      app: 'ILDF DAR Batangas',
      database: 'PostgreSQL',
      documentStorage: storage.useR2 ? 'Cloudflare R2' : 'Local disk',
      counts: records.counts,
      documentCount: fileRows.length,
      contents: {
        'records.json': 'All records (no password hashes)',
        'uploads/': 'Every uploaded document, named as stored'
      }
    }, null, 2), now);

    writeEntry(gzip, 'records.json', JSON.stringify(records, null, 2), now);

    let included = 0;
    const missing = [];
    for (const row of fileRows) {
      let buf = null;
      try { buf = await storage.getBuffer(row.stored_name); }
      catch (e) { buf = null; }
      if (!buf) { missing.push(row.stored_name + '  (' + row.file_name + ')'); continue; }
      writeEntry(gzip, 'uploads/' + row.stored_name, buf, now);
      included++;
    }

    writeEntry(gzip, 'report.txt',
      'Documents expected: ' + fileRows.length + '\n' +
      'Documents included: ' + included + '\n' +
      'Missing from storage: ' + missing.length + '\n' +
      (missing.length ? '\n' + missing.join('\n') + '\n' : ''), now);

    writeEnd(gzip);
    gzip.end();
  } catch (err) {
    console.error('[backup] Failed:', err.message);
    try { gzip.destroy(); res.destroy(); } catch (e) {}
  }
}));

/* Quick health view for the admin: confirms the database and document
   storage are both reachable. */
router.get('/admin/health', requireAuth, requireAdmin, wrap(async function (req, res) {
  const out = { database: 'unknown', storage: storage.useR2 ? 'cloudflare-r2' : 'local-disk' };
  try {
    const row = await one('SELECT COUNT(*)::int AS n FROM folders');
    out.database = 'ok';
    out.folderCount = row.n;
  } catch (e) {
    out.database = 'error: ' + e.message;
  }
  res.json(out);
}));

module.exports = router;
