const express = require('express');
const { many, one, run } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { wrap } = require('../asyncRoute');
const activity = require('../activity');

const router = express.Router();

// List every account (pending, approved, rejected). Admin only.
router.get('/users', requireAuth, requireAdmin, wrap(async function (req, res) {
  const users = await many(
    "SELECT id, username, role, status, created_at FROM users " +
    "ORDER BY (status = 'pending') DESC, created_at DESC"
  );
  res.json({ users: users });
}));

router.post('/users/:id/approve', requireAuth, requireAdmin, wrap(async function (req, res) {
  const user = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  await run("UPDATE users SET status = 'approved' WHERE id = $1", [user.id]);
  activity.log(req, 'user.approve', 'Approved the account "' + user.username + '"',
    { entityType: 'user', entityId: user.id });
  res.json({ ok: true });
}));

// Reject keeps the row, so the username stays taken and there is a record.
router.post('/users/:id/reject', requireAuth, requireAdmin, wrap(async function (req, res) {
  const user = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  await run("UPDATE users SET status = 'rejected' WHERE id = $1", [user.id]);
  activity.log(req, 'user.reject', 'Rejected the account "' + user.username + '"',
    { entityType: 'user', entityId: user.id });
  res.json({ ok: true });
}));

router.delete('/users/:id', requireAuth, requireAdmin, wrap(async function (req, res) {
  const user = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.id === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account while signed in.' });
  }
  if (user.role === 'admin') {
    const row = await one(
      "SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND status = 'approved'"
    );
    if (row.n <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining admin account.' });
    }
  }
  await run('DELETE FROM users WHERE id = $1', [user.id]);
  activity.log(req, 'user.delete', 'Deleted the account "' + user.username + '"',
    { entityType: 'user', entityId: user.id });
  res.json({ ok: true });
}));

module.exports = router;
