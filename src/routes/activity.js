const express = require('express');
const { many, one } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { ACTION_LABELS } = require('../activity');
const { wrap } = require('../asyncRoute');

const router = express.Router();

/* Read the audit trail. Admin only — the log names individuals and records
   IP addresses, so it is not something every user should browse. */
router.get('/activity', requireAuth, requireAdmin, wrap(async function (req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const before = parseInt(req.query.before, 10) || null;  // keyset pagination
  const username = req.query.user || '';
  const action = req.query.action || '';

  const where = [];
  const params = [];
  function add(clause, value) {
    params.push(value);
    where.push(clause.replace('?', '$' + params.length));
  }

  if (before) add('id < ?', before);
  if (username) add('username = ?', username);
  // 'folder' matches folder.create, folder.delete, ... as a group.
  if (action) {
    if (action.indexOf('.') === -1) add('action LIKE ?', action + '.%');
    else add('action = ?', action);
  }

  params.push(limit + 1); // fetch one extra to detect "has more"
  const rows = await many(
    'SELECT * FROM activity_log' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY id DESC LIMIT $' + params.length,
    params
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const users = await many('SELECT DISTINCT username FROM activity_log ORDER BY username');
  const total = await one('SELECT COUNT(*)::int AS n FROM activity_log');

  res.json({
    entries: page,
    hasMore: hasMore,
    nextBefore: page.length ? page[page.length - 1].id : null,
    total: total ? total.n : 0,
    users: users.map(function (u) { return u.username; }),
    labels: ACTION_LABELS
  });
}));

/* CSV export — the format an auditor will actually ask for. */
router.get('/activity.csv', requireAuth, requireAdmin, wrap(async function (req, res) {
  const rows = await many('SELECT * FROM activity_log ORDER BY id DESC LIMIT 20000');

  /* Quote everything, and neutralise formula injection: a value beginning
     with = + - @ (or a control character) is executed by Excel when the file
     is opened. Filenames and usernames reach this export, so a document
     named "=cmd|..." would otherwise become a live formula for whoever
     reviews the audit trail. Prefixing with an apostrophe makes Excel treat
     it as text; the apostrophe is not displayed in the cell. */
  function cell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  const lines = ['"Date (UTC)","User","Action","Description","Record Type","Record ID","IP Address"'];
  rows.forEach(function (r) {
    lines.push([
      cell(new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ')),
      cell(r.username),
      cell(ACTION_LABELS[r.action] || r.action),
      cell(r.summary),
      cell(r.entity_type),
      cell(r.entity_id),
      cell(r.ip)
    ].join(','));
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    'attachment; filename="ildf-activity-' +
    new Date().toISOString().slice(0, 10) + '.csv"');
  // BOM so Excel opens UTF-8 correctly.
  res.send('\uFEFF' + lines.join('\r\n') + '\r\n');
}));

module.exports = router;
