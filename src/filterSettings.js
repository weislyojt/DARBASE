const { one, run } = require('./db');

// Every filter the search panels can offer. The admin chooses which are on;
// the choice applies to every user of the portal.
const AVAILABLE_FILTERS = [
  { key: 'keyword',        label: 'Keyword',          type: 'text',   help: 'Title no., ARB name, barangay' },
  { key: 'titleNumber',    label: 'Title Number',     type: 'text',   help: 'Match the title number only' },
  { key: 'arbName',        label: 'ARB / Landholder', type: 'text',   help: 'Match the beneficiary name only' },
  { key: 'barangay',       label: 'Barangay',         type: 'text',   help: 'Match the barangay only' },
  { key: 'sequenceNumber', label: 'Sequence Number',  type: 'digits', help: 'Match the sequence number' },
  { key: 'area',           label: 'Area Range (sqm)', type: 'range',  help: 'Min and max total area' },
  { key: 'remarks',        label: 'Remarks',          type: 'select', help: 'SOLD, RECOMMENDED, etc.' },
  { key: 'documents',      label: 'Document Status',  type: 'select', help: 'With or without uploaded files' }
];

const DEFAULT_ENABLED = ['keyword', 'area', 'remarks'];
const SETTINGS_KEY = 'enabled_filters';

async function getEnabledFilters() {
  const row = await one('SELECT value FROM app_settings WHERE key = $1', [SETTINGS_KEY]);
  if (!row) return DEFAULT_ENABLED.slice();
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return DEFAULT_ENABLED.slice();
    return parsed.filter(function (k) {
      return AVAILABLE_FILTERS.some(function (f) { return f.key === k; });
    });
  } catch (e) {
    return DEFAULT_ENABLED.slice();
  }
}

async function setEnabledFilters(keys) {
  const clean = (Array.isArray(keys) ? keys : []).filter(function (k) {
    return AVAILABLE_FILTERS.some(function (f) { return f.key === k; });
  });
  await run(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ' +
    'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [SETTINGS_KEY, JSON.stringify(clean)]
  );
  return clean;
}

module.exports = { AVAILABLE_FILTERS, DEFAULT_ENABLED, getEnabledFilters, setEnabledFilters };
