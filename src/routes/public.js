const express = require('express');
const { listRecentJobs } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const jobs = await listRecentJobs(12);
    res.render('public/home', { jobs });
  } catch (error) {
    next(error);
  }
});

router.get('/saude', (req, res) => {
  res.json({ ok: true, service: 'ParanáPOP Empregos Bot', time: new Date().toISOString() });
});

module.exports = router;
