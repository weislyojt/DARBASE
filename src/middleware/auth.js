function requireAuth(req, res, next) {
  if (req.session && req.session.username) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated.' });
}

// Must be used after requireAuth. Only allows the request through if the
// signed-in user has the 'admin' role stored in their (signed) session cookie.
function requireAdmin(req, res, next) {
  if (req.session && req.session.username && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Admin access required.' });
}

module.exports = { requireAuth, requireAdmin };
