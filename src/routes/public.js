const express = require('express');
const { listRecentJobs } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const jobs = await listRecentJobs(12);
    res.render('public/home', { jobs });
  } catch (error) {
    console.error('Falha ao carregar vagas na home. Renderizando home sem vagas para manter o app online:', error.message);
    res.render('public/home', { jobs: [] });
  }
});

module.exports = router;
