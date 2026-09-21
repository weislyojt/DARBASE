require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');

const db = require('./src/db');

const authRoutes = require('./src/routes/auth');
const clusterRoutes = require('./src/routes/clusters');
const folderRoutes = require('./src/routes/folders');
const fileRoutes = require('./src/routes/files');
const userRoutes = require('./src/routes/users');
const settingsRoutes = require('./src/routes/settings');
const backupRoutes = require('./src/routes/backup');
const bundleRoutes = require('./src/routes/bundle');
const activityRoutes = require('./src/routes/activity');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Railway sits behind a proxy/load balancer

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  console.warn('[server] SESSION_SECRET is not set. Set it in Railway -> Variables ' +
    'so sessions survive restarts and cannot be forged.');
}

app.use(cookieSession({
  name: 'ildf_session',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
}));

app.use('/api', authRoutes);
app.use('/api', clusterRoutes);
app.use('/api', folderRoutes);
app.use('/api', fileRoutes);
app.use('/api', userRoutes);
app.use('/api', settingsRoutes);
app.use('/api', bundleRoutes);
app.use('/api', activityRoutes);
app.use('/api', backupRoutes);

app.use(express.static(path.join(__dirname, 'public')));

// Client-side router fallback: any non-API GET request gets index.html.
app.get(/^(?!\/api).*/, function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handler.
app.use(function (err, req, res, next) {
  console.error(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is larger than the 25MB upload limit.' });
  }
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* Connect to Postgres and create the schema BEFORE accepting traffic, so the
   first request can never hit a half-initialised database. */
db.init()
  .then(function () {
    app.listen(PORT, function () {
      console.log('ILDF DAR Batangas portal listening on port ' + PORT);
    });
  })
  .catch(function (err) {
    console.error('[server] Startup failed — could not initialise the database.');
    console.error(err.message);
    process.exit(1);
  });
