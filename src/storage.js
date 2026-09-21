/* ===== DOCUMENT STORAGE =====
   Uploaded documents live in Cloudflare R2 (S3-compatible object storage).
   If R2 is not configured, the app transparently falls back to local disk so
   it still runs — useful for local development and so a missing environment
   variable never takes the portal down. */

const fs = require('fs');
const path = require('path');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

const useR2 = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

// Local fallback location.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!useR2) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let s3 = null;
let PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl;

if (useR2) {
  const clientLib = require('@aws-sdk/client-s3');
  const presignLib = require('@aws-sdk/s3-request-presigner');
  PutObjectCommand = clientLib.PutObjectCommand;
  GetObjectCommand = clientLib.GetObjectCommand;
  DeleteObjectCommand = clientLib.DeleteObjectCommand;
  getSignedUrl = presignLib.getSignedUrl;

  s3 = new clientLib.S3Client({
    region: 'auto',
    endpoint: 'https://' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
  console.log('[storage] Using Cloudflare R2 bucket "' + R2_BUCKET + '".');
} else {
  console.log('[storage] R2 not configured — storing documents on local disk at ' + UPLOADS_DIR);
}

/* Save an uploaded document. `body` is a Buffer (multer memory storage). */
async function put(key, body, mimeType) {
  if (useR2) {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeType || 'application/octet-stream'
    }));
    return;
  }
  fs.writeFileSync(path.join(UPLOADS_DIR, key), body);
}

/* A short-lived link the browser can use to fetch the document directly from
   R2. Keeps documents private (no public bucket) and means downloads don't
   pass through the app, so no hosting egress is billed for them. */
async function signedUrl(key, filename, inline, seconds) {
  if (!useR2) return null;
  const disposition = (inline ? 'inline' : 'attachment') +
    '; filename="' + String(filename || key).replace(/"/g, '') + '"';
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ResponseContentDisposition: disposition
  }), { expiresIn: seconds || 300 });
}

/* Stream a document through the app. Used for the local-disk fallback, and
   as a backstop if a signed URL cannot be produced. */
function localPath(key) {
  return useR2 ? null : path.join(UPLOADS_DIR, key);
}

async function getBuffer(key) {
  if (!useR2) {
    const p = path.join(UPLOADS_DIR, key);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  }
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function remove(key) {
  if (useR2) {
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return;
  }
  const p = path.join(UPLOADS_DIR, key);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

async function exists(key) {
  if (!useR2) return fs.existsSync(path.join(UPLOADS_DIR, key));
  try {
    await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, Range: 'bytes=0-0' }));
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  useR2, UPLOADS_DIR, DATA_DIR,
  put, signedUrl, getBuffer, remove, exists, localPath
};
