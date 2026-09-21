const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { many, one, run } = require('../db');
const storage = require('../storage');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { wrap } = require('../asyncRoute');
const activity = require('../activity');

const router = express.Router();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/* Multer holds the upload in memory so it can be handed straight to R2.
   25MB is small enough that this is safe, and it avoids writing a temp file
   that would then need cleaning up. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
});

function storedNameFor(originalName) {
  const ext = path.extname(originalName || '');
  const safeExt = ext.length <= 10 ? ext : '';
  return crypto.randomUUID() + safeExt;
}

// Upload a document into a folder.
router.post('/folders/:id/files', requireAuth, upload.single('file'),
  wrap(async function (req, res) {
    const folder = await one('SELECT * FROM folders WHERE id = $1', [req.params.id]);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });

    const category = (req.body && req.body.category) || 'Uncategorized';
    const description = (req.body && req.body.description) || '';
    const storedName = storedNameFor(req.file.originalname);

    // Write the document first. If storage fails we must not leave a database
    // row pointing at a file that does not exist.
    await storage.put(storedName, req.file.buffer, req.file.mimetype);

    try {
      const result = await run(
        `INSERT INTO files
           (folder_id, title, category, description, file_name, stored_name, mime_type, file_size,
            created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          folder.id,
          req.file.originalname,
          category,
          description,
          req.file.originalname,
          storedName,
          req.file.mimetype,
          req.file.size,
          req.session.userId || null,
          req.session.username || null
        ]
      );
      const saved = result.rows[0];
      activity.log(req, 'file.upload',
        'Uploaded "' + saved.file_name + '" (' + category + ') to ' + folder.title_number,
        { entityType: 'file', entityId: saved.id });
      res.status(201).json({ file: saved });
    } catch (err) {
      // Roll back the stored object so we don't orphan it.
      try { await storage.remove(storedName); } catch (e) {}
      throw err;
    }
  })
);

/* Preview and download.

   With R2 configured we redirect to a short-lived signed URL, so the document
   travels straight from R2 to the browser: the bucket stays private, and no
   hosting egress is billed. Without R2 (local disk) we stream it ourselves. */
async function serveFile(req, res, inline) {
  const file = await one('SELECT * FROM files WHERE id = $1', [req.params.id]);
  if (!file) return res.status(404).json({ error: 'File not found.' });

  if (storage.useR2) {
    const url = await storage.signedUrl(file.stored_name, file.file_name, inline, 300);
    if (url) return res.redirect(url);
  }

  const localPath = storage.localPath(file.stored_name);
  if (!localPath || !fs.existsSync(localPath)) {
    return res.status(404).json({ error: 'File is missing from storage.' });
  }
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  const safeName = String(file.file_name || 'file').replace(/["\\]/g, '');
  res.setHeader('Content-Disposition', (inline ? 'inline' : 'attachment') + '; filename="' + safeName + '"');
  fs.createReadStream(localPath).pipe(res);
}

router.get('/files/:id/preview', requireAuth, wrap(async function (req, res) {
  await serveFile(req, res, true);
}));

router.get('/files/:id/download', requireAuth, wrap(async function (req, res) {
  await serveFile(req, res, false);
}));

router.delete('/files/:id', requireAuth, requireAdmin, wrap(async function (req, res) {
  const file = await one('SELECT * FROM files WHERE id = $1', [req.params.id]);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  try {
    await storage.remove(file.stored_name);
  } catch (e) {
    console.error('[files] Could not remove stored object:', e.message);
  }
  await run('DELETE FROM files WHERE id = $1', [file.id]);
  activity.log(req, 'file.delete',
    'Deleted document "' + file.file_name + '" (' + (file.category || 'Uncategorized') + ')',
    { entityType: 'file', entityId: file.id });
  res.json({ ok: true });
}));

// Surface multer's own errors (chiefly "file too large") as clean JSON.
router.use(function (err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'That file is larger than the 25MB limit.' });
  }
  next(err);
});

module.exports = router;
