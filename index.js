const express = require('express');
const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { renderMatchCard } = require('./renderMatchCard');

const execAsync = promisify(exec);
const TMP_DIR = '/tmp';

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

function shellEscape(str) {
  return `'${String(str).replace(/'/g, `'\\''`)}'`;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    const request = (currentUrl) => {
      https.get(currentUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlink(destPath, () => {});
          const redirectUrl = response.headers.location.startsWith('http')
            ? response.headers.location
            : new URL(response.headers.location, currentUrl).href;
          if (!redirectUrl.startsWith('https://')) {
            reject(new Error('Redirect URL must use HTTPS'));
            return;
          }
          request(redirectUrl);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destPath, () => {});
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (err) => {
          file.close();
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

async function cleanupFiles(...paths) {
  await Promise.all(
    paths.map((filePath) => fs.promises.unlink(filePath).catch(() => {})),
  );
}

async function createReelVideo(imagePath, audioPath, videoPath, duration) {
  const cmd = [
    'ffmpeg -y',
    '-loop 1',
    '-framerate 30',
    `-i ${shellEscape(imagePath)}`,
    `-i ${shellEscape(audioPath)}`,
    `-t ${duration}`,
    '-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"',
    '-c:v libx264',
    '-preset fast',
    '-tune stillimage',
    '-c:a aac',
    '-b:a 192k',
    '-pix_fmt yuv420p',
    '-movflags +faststart',
    '-shortest',
    shellEscape(videoPath),
  ].join(' ');

  await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
}

app.post('/create-reel', async (req, res) => {
  const { imageUrl, audioUrl, duration: rawDuration } = req.body;
  const duration = rawDuration == null ? 30 : Number(rawDuration);

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "imageUrl"' });
  }
  if (!audioUrl || typeof audioUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "audioUrl"' });
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return res.status(400).json({ error: 'Invalid "duration" — must be a positive number' });
  }
  if (!imageUrl.startsWith('https://') || !audioUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'imageUrl and audioUrl must use HTTPS' });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const imagePath = path.join(TMP_DIR, `reel-${id}.png`);
  const audioPath = path.join(TMP_DIR, `reel-${id}.mp3`);
  const videoPath = path.join(TMP_DIR, `reel-${id}.mp4`);

  try {
    await downloadFile(imageUrl, imagePath);
    await downloadFile(audioUrl, audioPath);
    await createReelVideo(imagePath, audioPath, videoPath, duration);

    const video = await fs.promises.readFile(videoPath);
    res.set('Content-Type', 'video/mp4');
    res.send(video);
  } catch (err) {
    console.error('Create reel failed:', err);
    const message = err.stderr?.trim() || err.message || 'FFmpeg failed';
    res.status(500).json({ error: message });
  } finally {
    await cleanupFiles(imagePath, audioPath, videoPath);
  }
});

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
