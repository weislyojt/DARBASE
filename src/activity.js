const { run } = require('./db');

/* ===== ACTIVITY LOG =====
   Records who did what. Two rules govern everything here:

   1. Logging must never break a request. Every write is wrapped so that a
      logging failure is reported to the console and then ignored — losing a
      log line is bad, but failing a document upload because of one is worse.
   2. The log is append-only. Nothing in the app deletes from it, because for
      a records system the history is itself part of the record. */

// Human-readable labels, also used by the admin filter dropdown.
const ACTION_LABELS = {
  'auth.login':          'Signed in',
  'auth.login_failed':   'Failed sign-in',
  'auth.logout':         'Signed out',
  'auth.register':       'Requested an account',
  'auth.password':       'Changed their password',

  'folder.create':       'Created a folder',
  'folder.remarks':      'Changed remarks',
  'folder.pin':          'Set a map pin',
  'folder.unpin':        'Removed a map pin',
  'folder.delete':       'Deleted a folder',

  'file.upload':         'Uploaded a document',
  'file.delete':         'Deleted a document',
  'file.bundle_pdf':     'Downloaded a merged PDF',
  'file.bundle_zip':     'Downloaded a folder ZIP',

  'user.approve':        'Approved an account',
  'user.reject':         'Rejected an account',
  'user.delete':         'Deleted an account',

  'settings.filters':    'Changed search filters',
  'settings.remark_add': 'Added a remark option',
  'settings.remark_del': 'Deleted a remark option',

  'admin.backup':        'Downloaded a backup',
  'admin.export':        'Exported records'
};

function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim().slice(0, 45);
  return (req.ip || '').slice(0, 45);
}

/* Fire-and-forget. Callers do not await this. */
function log(req, action, summary, opts) {
  opts = opts || {};
  const userId = (req.session && req.session.userId) || null;
  const username = (opts.username) || (req.session && req.session.username) || 'anonymous';

  run(
    `INSERT INTO activity_log (user_id, username, action, entity_type, entity_id, summary, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, username, action, opts.entityType || null, opts.entityId || null,
     String(summary || '').slice(0, 500), clientIp(req)]
  ).catch(function (err) {
    console.error('[activity] Could not write log entry:', err.message);
  });
}

module.exports = { log, ACTION_LABELS };
