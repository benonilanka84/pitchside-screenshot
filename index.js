const express = require('express');
const puppeteer = require('puppeteer');
const { renderMatchCard } = require('./renderMatchCard');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

async function screenshotHtml(html) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#card');
    await page.evaluate(() => document.fonts.ready);

    return Buffer.from(await page.screenshot({ type: 'png' }));
  } finally {
    try {
      await browser.close();
    } catch {
      // Browser may already be closed if Chrome crashed
    }
  }
}

app.post('/screenshot', async (req, res) => {
  const { html } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "html" in request body' });
  }

  try {
    const image = await screenshotHtml(html);
    res.set('Content-Type', 'image/png');
    res.send(image);
  } catch (err) {
    console.error('Screenshot failed:', err);
    res.status(500).json({ error: 'Screenshot failed' });
  }
});

app.post('/match-result', async (req, res) => {
  const {
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    competition,
    matchDate,
  } = req.body;

  if (!homeTeam || !awayTeam || homeScore == null || awayScore == null || !competition || !matchDate) {
    return res.status(400).json({
      error: 'Required fields: homeTeam, awayTeam, homeScore, awayScore, competition, matchDate',
    });
  }

  try {
    const html = renderMatchCard({
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      competition,
      matchDate,
    });
    const image = await screenshotHtml(html);
    res.set('Content-Type', 'image/png');
    res.send(image);
  } catch (err) {
    console.error('Match result screenshot failed:', err);
    res.status(500).json({ error: 'Screenshot failed' });
  }
});

app.listen(PORT, () => console.log(`Screenshot service running on port ${PORT}`));
