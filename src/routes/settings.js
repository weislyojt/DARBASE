const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { AVAILABLE_FILTERS, getEnabledFilters, setEnabledFilters } = require('../filterSettings');
const { getRemarksInfo, addRemark, removeRemark } = require('../remarksStore');
const { wrap } = require('../asyncRoute');
const activity = require('../activity');

const router = express.Router();

// Any signed-in user needs to know which filters to show.
router.get('/filter-settings', requireAuth, wrap(async function (req, res) {
  res.json({ available: AVAILABLE_FILTERS, enabled: await getEnabledFilters() });
}));

// Only an admin can change which filters everyone sees.
router.put('/filter-settings', requireAuth, requireAdmin, wrap(async function (req, res) {
  const enabled = await setEnabledFilters((req.body && req.body.enabled) || []);
  activity.log(req, 'settings.filters',
    'Set the search filters to: ' + (enabled.join(', ') || 'none'));
  res.json({ available: AVAILABLE_FILTERS, enabled: enabled });
}));

/* ===== REMARKS OPTIONS ===== */

router.get('/remarks', requireAuth, wrap(async function (req, res) {
  res.json(await getRemarksInfo());
}));

// Any signed-in user can add an option; it then shows for everyone.
router.post('/remarks', requireAuth, wrap(async function (req, res) {
  const result = await addRemark((req.body && req.body.value) || '');
  if (result.error) return res.status(400).json({ error: result.error });
  activity.log(req, 'settings.remark_add', 'Added the remark option "' + result.value + '"');
  res.status(201).json(result);
}));

// Admins can tidy up unused custom options.
router.delete('/remarks/:value', requireAuth, requireAdmin, wrap(async function (req, res) {
  const value = decodeURIComponent(req.params.value);
  const result = await removeRemark(value);
  if (result.error) return res.status(400).json({ error: result.error });
  activity.log(req, 'settings.remark_del', 'Deleted the remark option "' + value + '"');
  res.json(result);
}));

module.exports = router;
