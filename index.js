const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { renderMatchCard } = require('./renderMatchCard');

const app = express();
const PORT = process.env.PORT || 3000;

const PUPPETEER_LAUNCH_OPTIONS = {
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ],
};

app.use(express.json({ limit: '50mb' }));

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function screenshotHtml(html) {
  const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTIONS);
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

async function renderReelGraphic(html, pngPath) {
  const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTIONS);
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: pngPath, type: 'png' });
  } finally {
    try {
      await browser.close();
    } catch {
      // Browser may already be closed if Chrome crashed
    }
  }
}

function getAudioDuration(audioPath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);

    let output = '';
    ffprobe.stdout.on('data', (chunk) => { output += chunk; });
    ffprobe.on('error', () => resolve(30));
    ffprobe.on('close', (code) => {
      if (code !== 0) {
        resolve(30);
        return;
      }
      const duration = parseFloat(output.trim());
      resolve(Number.isFinite(duration) && duration > 0 ? Math.ceil(duration) : 30);
    });
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
    });
  });
}

function buildReelHTML({ team1, team2, score, topic, language, isEnglish }) {
  const safeTeam1 = escapeHtml(team1);
  const safeTeam2 = escapeHtml(team2);
  const safeScore = escapeHtml(score);
  const safeTopic = escapeHtml(topic || '');

  const bgGradient = isEnglish
    ? 'linear-gradient(160deg, #0a0f1e 0%, #0d2137 40%, #0a3d2f 100%)'
    : 'linear-gradient(160deg, #1a0a0a 0%, #2d1a0a 40%, #3d0a0a 100%)';

  const accentColor = isEnglish ? '#00e5ff' : '#ff6b35';
  const accentColor2 = isEnglish ? '#00ff88' : '#ffb347';

  const langLabel = isEnglish ? 'ENGLISH' : 'తెలుగు';
  const resultLabel = isEnglish ? 'FULL TIME' : 'పోటీ ముగిసింది';
  const followLabel = isEnglish ? 'Follow @pitchside.in' : '@pitchside.in ని ఫాలో చేయండి';
  const hashtagTeam1 = escapeHtml(team1.replace(/\s/g, ''));
  const hashtagTeam2 = escapeHtml(team2.replace(/\s/g, ''));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Roboto:wght@300;400;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1080px;
    height: 1920px;
    background: ${bgGradient};
    font-family: 'Roboto', sans-serif;
    overflow: hidden;
    position: relative;
  }

  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at 20% 20%, ${accentColor}15 0%, transparent 50%),
      radial-gradient(circle at 80% 80%, ${accentColor2}15 0%, transparent 50%);
  }

  .accent-bar {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 8px;
    background: linear-gradient(90deg, ${accentColor}, ${accentColor2});
  }

  .container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 80px 60px;
  }

  .top-meta {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 60px;
  }

  .brand {
    font-family: 'Oswald', sans-serif;
    font-size: 38px;
    font-weight: 700;
    color: white;
    letter-spacing: 2px;
  }

  .brand span { color: ${accentColor}; }

  .lang-badge {
    background: ${accentColor}25;
    border: 1px solid ${accentColor}60;
    color: ${accentColor};
    font-size: 26px;
    font-weight: 700;
    padding: 10px 28px;
    border-radius: 50px;
    letter-spacing: 3px;
  }

  .competition {
    font-size: 30px;
    font-weight: 300;
    color: rgba(255,255,255,0.55);
    letter-spacing: 4px;
    text-transform: uppercase;
    margin-bottom: 20px;
    text-align: center;
    max-width: 100%;
    line-height: 1.3;
  }

  .full-time-badge {
    background: linear-gradient(90deg, ${accentColor}, ${accentColor2});
    color: #000;
    font-family: 'Oswald', sans-serif;
    font-size: 28px;
    font-weight: 700;
    padding: 12px 48px;
    border-radius: 50px;
    letter-spacing: 4px;
    margin-bottom: 80px;
  }

  .score-card {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 32px;
    padding: 70px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 60px;
    backdrop-filter: blur(10px);
  }

  .team {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    flex: 1;
  }

  .team-name {
    font-family: 'Oswald', sans-serif;
    font-size: 52px;
    font-weight: 600;
    color: white;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 2px;
    line-height: 1.1;
  }

  .score-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0 20px;
    flex-shrink: 0;
  }

  .score {
    font-family: 'Oswald', sans-serif;
    font-size: 140px;
    font-weight: 700;
    background: linear-gradient(180deg, ${accentColor}, ${accentColor2});
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1;
    letter-spacing: -4px;
  }

  .vs-label {
    font-size: 26px;
    color: rgba(255,255,255,0.3);
    letter-spacing: 4px;
    margin-top: -10px;
  }

  .bottom {
    margin-top: auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .hashtags {
    font-size: 26px;
    color: ${accentColor}90;
    text-align: center;
    line-height: 1.8;
    letter-spacing: 1px;
  }

  .follow {
    font-size: 30px;
    color: rgba(255,255,255,0.5);
    letter-spacing: 2px;
  }

  .bottom-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 6px;
    background: linear-gradient(90deg, ${accentColor2}, ${accentColor});
  }
</style>
</head>
<body>
<div class="accent-bar"></div>
<div class="container">
  <div class="top-meta">
    <div class="brand">PITCH<span>SIDE</span>.in</div>
    <div class="lang-badge">${langLabel}</div>
  </div>

  <div class="competition">${safeTopic}</div>
  <div class="full-time-badge">${resultLabel}</div>

  <div class="score-card">
    <div class="team">
      <div class="team-name">${safeTeam1}</div>
    </div>
    <div class="score-box">
      <div class="score">${safeScore}</div>
      <div class="vs-label">VS</div>
    </div>
    <div class="team">
      <div class="team-name">${safeTeam2}</div>
    </div>
  </div>

  <div class="bottom">
    <div class="hashtags">#Football #Pitchside #${hashtagTeam1} #${hashtagTeam2}</div>
    <div class="follow">${followLabel}</div>
  </div>
</div>
<div class="bottom-bar"></div>
</body>
</html>`;
}

app.post('/create-reel', async (req, res) => {
  const { team1, team2, score, topic, language, mp3_base64 } = req.body;

  if (!team1 || !team2 || !score || !mp3_base64) {
    return res.status(400).json({
      error: 'Missing required fields: team1, team2, score, mp3_base64',
    });
  }

  const lang = language || 'English';
  if (lang !== 'English' && lang !== 'Telugu') {
    return res.status(400).json({ error: 'language must be "English" or "Telugu"' });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  const mp3Path = path.join(tmpDir, 'voice.mp3');
  const pngPath = path.join(tmpDir, 'card.png');
  const mp4Path = path.join(tmpDir, 'reel.mp4');

  try {
    await fs.promises.writeFile(mp3Path, Buffer.from(mp3_base64, 'base64'));

    const durationSec = await getAudioDuration(mp3Path);
    const fadeOutStart = Math.max(0, durationSec - 1);
    const isEnglish = lang === 'English';
    const html = buildReelHTML({ team1, team2, score, topic, language: lang, isEnglish });

    await renderReelGraphic(html, pngPath);

    await runFfmpeg([
      '-loop', '1',
      '-framerate', '30',
      '-i', pngPath,
      '-i', mp3Path,
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-t', String(durationSec),
      '-af', `afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOutStart}:d=1`,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
      '-movflags', '+faststart',
      '-y',
      mp4Path,
    ]);

    const mp4Buffer = await fs.promises.readFile(mp4Path);

    res.json({
      mp4_base64: mp4Buffer.toString('base64'),
      duration_sec: durationSec,
    });
  } catch (err) {
    console.error('[create-reel] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create reel' });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
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
