const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const scraper = require('./scraper');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'games.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

const SYNC_INTERVAL_HOURS = 6;

const tokens = new Set();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== DATA HELPERS ==========
function readGames() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeGames(games) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(games, null, 2), 'utf8');
  pushToGitHub().catch(err => console.log(`[GitHub] Push failed: ${err.message}`));
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { hadoantv: { username: '', password: '' }, linkneverdie: { username: '', password: '' } };
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// ========== GITHUB AUTO-PUSH ==========
async function pushToGitHub() {
  const config = readConfig();
  const gh = config.github;
  if (!gh || !gh.token || !gh.repo) return;

  const filePath = 'data/games.json';
  const apiUrl = `https://api.github.com/repos/${gh.repo}/contents/${filePath}`;
  const headers = {
    'Authorization': `token ${gh.token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GameHub-Server',
  };

  // Get current file SHA
  let sha = null;
  try {
    const existing = await axios.get(apiUrl, { headers, params: { ref: gh.branch || 'main' } });
    sha = existing.data.sha;
  } catch {}

  // Push updated content
  const content = fs.readFileSync(DATA_FILE, 'utf8');
  const encoded = Buffer.from(content).toString('base64');

  await axios.put(apiUrl, {
    message: `Update games.json - ${new Date().toLocaleString('vi-VN')}`,
    content: encoded,
    sha,
    branch: gh.branch || 'main',
  }, { headers });

  console.log('[GitHub] Pushed games.json successfully');
}

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ========== AUTH ==========
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(32).toString('hex');
    tokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
});

app.post('/api/logout', authMiddleware, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  tokens.delete(token);
  res.json({ ok: true });
});

// ========== GAMES CRUD ==========
app.get('/api/games', (req, res) => {
  res.json(readGames());
});

app.get('/api/games/:id', (req, res) => {
  const games = readGames();
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

app.post('/api/games', authMiddleware, (req, res) => {
  const games = readGames();
  const game = {
    id: crypto.randomBytes(8).toString('hex'),
    name: req.body.name,
    image: req.body.image || '',
    releaseDate: req.body.releaseDate || '',
    genres: req.body.genres || [],
    source: req.body.source || 'linkneverdie.com',
    parts: req.body.parts || [],
    description: req.body.description || '',
    notepadUrl: req.body.notepadUrl || '',
    autoSync: req.body.autoSync || false,
    lastSync: null,
    syncStatus: null,
    createdAt: new Date().toISOString()
  };
  games.unshift(game);
  writeGames(games);
  res.json(game);
});

app.put('/api/games/:id', authMiddleware, (req, res) => {
  const games = readGames();
  const idx = games.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Game not found' });

  games[idx] = {
    ...games[idx],
    name: req.body.name ?? games[idx].name,
    image: req.body.image ?? games[idx].image,
    releaseDate: req.body.releaseDate ?? games[idx].releaseDate,
    genres: req.body.genres ?? games[idx].genres,
    source: req.body.source ?? games[idx].source,
    parts: req.body.parts ?? games[idx].parts,
    description: req.body.description ?? games[idx].description,
    notepadUrl: req.body.notepadUrl ?? games[idx].notepadUrl,
    autoSync: req.body.autoSync ?? games[idx].autoSync,
  };
  writeGames(games);
  res.json(games[idx]);
});

app.delete('/api/games/:id', authMiddleware, (req, res) => {
  let games = readGames();
  games = games.filter(g => g.id !== req.params.id);
  writeGames(games);
  res.json({ ok: true });
});

// ========== SOURCE CREDENTIALS CONFIG ==========
app.get('/api/config', authMiddleware, (req, res) => {
  const config = readConfig();
  res.json({
    hadoantv: { username: config.hadoantv?.username || '', hasPassword: !!config.hadoantv?.password },
    linkneverdie: { username: config.linkneverdie?.username || '', hasPassword: !!config.linkneverdie?.password },
    github: { repo: config.github?.repo || '', hasToken: !!config.github?.token, branch: config.github?.branch || 'main' },
    syncIntervalHours: SYNC_INTERVAL_HOURS,
  });
});

app.put('/api/config', authMiddleware, (req, res) => {
  const config = readConfig();
  if (req.body.hadoantv) {
    config.hadoantv = {
      username: req.body.hadoantv.username || config.hadoantv?.username || '',
      password: req.body.hadoantv.password || config.hadoantv?.password || '',
    };
  }
  if (req.body.linkneverdie) {
    config.linkneverdie = {
      username: req.body.linkneverdie.username || config.linkneverdie?.username || '',
      password: req.body.linkneverdie.password || config.linkneverdie?.password || '',
    };
  }
  if (req.body.github) {
    config.github = {
      repo: req.body.github.repo || config.github?.repo || '',
      token: req.body.github.token || config.github?.token || '',
      branch: req.body.github.branch || config.github?.branch || 'main',
    };
  }
  writeConfig(config);
  res.json({ ok: true });
});

// ========== SYNC ==========
let syncInProgress = false;

// Sync single game
app.post('/api/games/:id/sync', authMiddleware, async (req, res) => {
  try {
    const games = readGames();
    const game = games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!game.notepadUrl) return res.status(400).json({ error: 'Game has no notepad URL' });

    // Ensure logged in
    await ensureLoggedIn(game.source);

    const result = await scraper.syncGame(game);
    const freshGames = readGames();
    const idx = freshGames.findIndex(g => g.id === req.params.id);
    if (idx !== -1) {
      if (result.success) {
        freshGames[idx].parts = result.parts;
        freshGames[idx].lastSync = result.syncedAt;
        freshGames[idx].syncStatus = 'success';
      } else {
        freshGames[idx].syncStatus = 'error: ' + result.error;
      }
      writeGames(freshGames);
      res.json(freshGames[idx]);
    } else {
      res.status(404).json({ error: 'Game disappeared during sync' });
    }
  } catch (err) {
    scraper.log(`Sync endpoint error: ${err.message}`);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

// Sync all games with autoSync enabled
app.post('/api/sync-all', authMiddleware, async (req, res) => {
  try {
    if (syncInProgress) return res.status(409).json({ error: 'Sync already in progress' });
    const results = await runSyncAll();
    res.json(results);
  } catch (err) {
    scraper.log(`Sync-all endpoint error: ${err.message}`);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

// Get sync status
app.get('/api/sync-status', authMiddleware, (req, res) => {
  const games = readGames();
  const syncGames = games.filter(g => g.notepadUrl).map(g => ({
    id: g.id,
    name: g.name,
    autoSync: g.autoSync,
    lastSync: g.lastSync,
    syncStatus: g.syncStatus,
    notepadUrl: g.notepadUrl,
  }));
  res.json({ inProgress: syncInProgress, games: syncGames });
});

async function ensureLoggedIn(source) {
  try {
    const config = readConfig();
    if (source === 'hadoantv.com' && config.hadoantv?.username && config.hadoantv?.password) {
      await scraper.hadoantvLogin(config.hadoantv.username, config.hadoantv.password);
    } else if (source === 'linkneverdie.com' && config.linkneverdie?.username && config.linkneverdie?.password) {
      await scraper.linkneverdiLogin(config.linkneverdie.username, config.linkneverdie.password);
    }
  } catch (err) {
    scraper.log(`Login error (non-fatal): ${err.message}`);
  }
}

async function runSyncAll() {
  if (syncInProgress) return { error: 'Already in progress' };
  syncInProgress = true;
  scraper.log('=== Starting sync all ===');

  const results = { synced: 0, failed: 0, skipped: 0, details: [] };

  try {
    const games = readGames();
    const toSync = games.filter(g => g.notepadUrl && g.autoSync);

    if (toSync.length === 0) {
      scraper.log('No games to sync');
      results.skipped = games.length;
      return results;
    }

    // Login to sources
    const sources = [...new Set(toSync.map(g => g.source))];
    for (const source of sources) {
      await ensureLoggedIn(source);
    }

    // Sync each game
    for (const game of toSync) {
      const result = await scraper.syncGame(game);
      const freshGames = readGames();
      const idx = freshGames.findIndex(g => g.id === game.id);

      if (idx !== -1) {
        if (result.success) {
          freshGames[idx].parts = result.parts;
          freshGames[idx].lastSync = result.syncedAt;
          freshGames[idx].syncStatus = 'success';
          results.synced++;
          results.details.push({ id: game.id, name: game.name, status: 'success', parts: result.parts.length });
        } else {
          freshGames[idx].syncStatus = 'error: ' + result.error;
          results.failed++;
          results.details.push({ id: game.id, name: game.name, status: 'error', error: result.error });
        }
        writeGames(freshGames);
      }

      // Small delay between games to be polite
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    scraper.log(`Sync all error: ${err.message}`);
  } finally {
    syncInProgress = false;
    scraper.log(`=== Sync complete: ${results.synced} ok, ${results.failed} failed ===`);
  }

  return results;
}

// ========== SCHEDULED SYNC ==========
setInterval(() => {
  scraper.log('Scheduled sync triggered');
  runSyncAll().catch(err => scraper.log(`Scheduled sync error: ${err.message}`));
}, SYNC_INTERVAL_HOURS * 60 * 60 * 1000);

// ========== CATCH-ALL ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Auto-sync every ${SYNC_INTERVAL_HOURS} hours`);
});
