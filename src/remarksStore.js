const { many, one, run } = require('./db');
const { REMARKS_OPTIONS } = require('./clustersData');

const SETTINGS_KEY = 'custom_remarks';

async function readCustom() {
  const row = await one('SELECT value FROM app_settings WHERE key = $1', [SETTINGS_KEY]);
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function writeCustom(list) {
  await run(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ' +
    'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [SETTINGS_KEY, JSON.stringify(list)]
  );
}

// Built-in presets, then saved custom options, then any value already on a
// record — so nothing ever disappears from the dropdown.
async function getAllRemarks() {
  const out = REMARKS_OPTIONS.slice();
  (await readCustom()).forEach(function (r) {
    if (out.indexOf(r) === -1) out.push(r);
  });
  const used = await many("SELECT DISTINCT remarks FROM folders WHERE remarks <> '' ORDER BY remarks");
  used.forEach(function (r) {
    if (out.indexOf(r.remarks) === -1) out.push(r.remarks);
  });
  return out;
}

async function getRemarksInfo() {
  const options = await getAllRemarks();
  const usage = {};
  const rows = await many(
    "SELECT remarks, COUNT(*)::int AS n FROM folders WHERE remarks <> '' GROUP BY remarks"
  );
  rows.forEach(function (r) { usage[r.remarks] = r.n; });
  return { options: options, presets: REMARKS_OPTIONS.slice(), usage: usage };
}

async function addRemark(value) {
  const clean = String(value || '').toUpperCase().trim().slice(0, 60);
  if (!clean) return { error: 'Please enter a remark.' };
  const all = await getAllRemarks();
  if (all.indexOf(clean) !== -1) return { error: 'That remark already exists.' };
  const custom = await readCustom();
  custom.push(clean);
  await writeCustom(custom);
  return Object.assign({ value: clean }, await getRemarksInfo());
}

// Only custom options can be deleted, and only when no record uses them.
async function removeRemark(value) {
  const clean = String(value || '').toUpperCase().trim();
  if (REMARKS_OPTIONS.indexOf(clean) !== -1) {
    return { error: 'Built-in remarks cannot be deleted.' };
  }
  const inUse = await one('SELECT COUNT(*)::int AS n FROM folders WHERE remarks = $1', [clean]);
  if (inUse && inUse.n > 0) {
    return { error: 'That remark is used by ' + inUse.n + ' record(s). Change those first.' };
  }
  const custom = await readCustom();
  await writeCustom(custom.filter(function (r) { return r !== clean; }));
  return await getRemarksInfo();
}

module.exports = { getAllRemarks, getRemarksInfo, addRemark, removeRemark };
