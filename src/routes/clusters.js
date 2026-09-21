const express = require('express');
const { CLUSTERS, CATEGORIES } = require('../clustersData');
const { getAllRemarks } = require('../remarksStore');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../asyncRoute');

const router = express.Router();

router.get('/clusters', requireAuth, wrap(async function (req, res) {
  res.json({
    clusters: CLUSTERS,
    categories: CATEGORIES,
    remarksOptions: await getAllRemarks()
  });
}));

module.exports = router;
