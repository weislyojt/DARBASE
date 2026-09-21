const express = require('express');
const bcrypt = require('bcryptjs');
const { one, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../asyncRoute');
const activity = require('../activity');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

// Public: request a new account. Created 'pending'; cannot log in until
// an admin approves it.
router.post('/register', wrap(async function (req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, dots, dashes, or underscores.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = await one('SELECT id FROM users WHERE username = $1', [username]);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  await run(
    "INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, 'user', 'pending')",
    [username, hash]
  );
  activity.log(req, 'auth.register', 'Requested an account: ' + username, { username: username });
  return res.status(201).json({
    ok: true,
    message: 'Registration submitted. An administrator must approve your account before you can sign in.'
  });
}));

router.post('/login', wrap(async function (req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const user = await one('SELECT * FROM users WHERE username = $1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    activity.log(req, 'auth.login_failed', 'Failed sign-in attempt for "' + username + '"',
      { username: username });
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Your account is awaiting admin approval.' });
  }
  if (user.status !== 'approved') {
    return res.status(403).json({ error: 'Your account does not have access. Contact an administrator.' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  activity.log(req, 'auth.login', 'Signed in');
  return res.json({ username: user.username, role: user.role });
}));

router.post('/logout', function (req, res) {
  if (req.session && req.session.username) activity.log(req, 'auth.logout', 'Signed out');
  req.session = null;
  res.json({ ok: true });
});

router.get('/session', function (req, res) {
  if (req.session && req.session.username) {
    return res.json({ loggedIn: true, username: req.session.username, role: req.session.role || 'user' });
  }
  return res.json({ loggedIn: false });
});

router.post('/change-password', requireAuth, wrap(async function (req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  const user = await one('SELECT * FROM users WHERE id = $1', [req.session.userId]);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await run('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
  activity.log(req, 'auth.password', 'Changed their password');
  res.json({ ok: true });
}));

module.exports = router;
