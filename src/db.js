const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL;

if (!connectionString) {
  console.error(
    '\n[db] No database connection string found.\n' +
    '     Set DATABASE_URL to your Neon (or other Postgres) connection string.\n' +
    '     In Neon: Dashboard -> your project -> Connect -> copy the POOLED\n' +
    '     connection string, then add it in Railway -> Variables as DATABASE_URL.\n'
  );
  process.exit(1);
}

// Managed Postgres (Neon, Railway, Supabase) requires TLS.
const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
  max: 8,                       // Neon free compute has limited connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

pool.on('error', function (err) {
  console.error('[db] Idle client error:', err.message);
});

/* ===== QUERY HELPERS =====
   Postgres uses $1, $2 ... placeholders rather than SQLite's ?. */

async function many(sql, params) {
  const result = await pool.query(sql, params || []);
  return result.rows;
}

async function one(sql, params) {
  const result = await pool.query(sql, params || []);
  return result.rows[0] || null;
}

async function run(sql, params) {
  const result = await pool.query(sql, params || []);
  return { rowCount: result.rowCount, rows: result.rows };
}

/* ===== SCHEMA =====
   IF NOT EXISTS throughout, so this is safe to run on every boot. */
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS folders (
      id                SERIAL PRIMARY KEY,
      cluster_slug      TEXT NOT NULL,
      municipality_slug TEXT NOT NULL,
      title_number      TEXT NOT NULL,
      sequence_number   TEXT NOT NULL,
      name              TEXT NOT NULL,
      location          TEXT NOT NULL,
      total_area        TEXT NOT NULL,
      remarks           TEXT NOT NULL DEFAULT '',
      latitude          DOUBLE PRECISION,
      longitude         DOUBLE PRECISION,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_folders_scope
      ON folders (cluster_slug, municipality_slug);

    CREATE TABLE IF NOT EXISTS files (
      id          SERIAL PRIMARY KEY,
      folder_id   INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      category    TEXT,
      description TEXT,
      file_name   TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type   TEXT,
      file_size   INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_files_folder ON files (folder_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    /* Audit trail. Deliberately never pruned: for a government records
       system the history is part of the record. Rows are tiny text. */
    CREATE TABLE IF NOT EXISTS activity_log (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER,
      username    TEXT NOT NULL,
      action      TEXT NOT NULL,
      entity_type TEXT,
      entity_id   INTEGER,
      summary     TEXT NOT NULL,
      ip          TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log (username);
  `);

  /* Attribution on records. Both the id and the name are stored: the id
     links to the account, the name survives even if that account is later
     deleted, so a record never loses its provenance. */
  await pool.query(`
    ALTER TABLE folders ADD COLUMN IF NOT EXISTS created_by INTEGER;
    ALTER TABLE folders ADD COLUMN IF NOT EXISTS created_by_name TEXT;
    ALTER TABLE files   ADD COLUMN IF NOT EXISTS created_by INTEGER;
    ALTER TABLE files   ADD COLUMN IF NOT EXISTS created_by_name TEXT;
  `);
}

/* Seeds a default admin on an empty database. */
async function seedAdmin() {
  const row = await one('SELECT COUNT(*)::int AS n FROM users');
  if (row && row.n === 0) {
    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(password, 10);
    await run(
      "INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, 'admin', 'approved')",
      [username, hash]
    );
    console.log('[db] Seeded default admin "' + username + '". Change this password after logging in.');
  }
}

async function init() {
  // Neon free compute sleeps when idle; the first connection wakes it.
  const attempts = 5;
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (i === attempts) {
        console.error('[db] Could not reach the database after ' + attempts + ' attempts.');
        throw err;
      }
      console.log('[db] Database not ready (attempt ' + i + '/' + attempts + '), retrying...');
      await new Promise(function (r) { setTimeout(r, 2000 * i); });
    }
  }
  await initSchema();
  await seedAdmin();
  console.log('[db] Postgres ready.');
}

module.exports = { pool, many, one, run, init };
