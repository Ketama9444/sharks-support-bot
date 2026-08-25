const fs = require('fs');
const path = require('path');

// En local: ./data
// Sur Northflank: configure DATA_DIR=/app/data et monte un volume persistant sur /app/data.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const DEFAULT_STATE = {
  setupGuildId: null,
  categoryId: null,
  owners: [],
  targets: []
};

function normalizeState(raw) {
  const state = {
    setupGuildId: raw?.setupGuildId || null,
    categoryId: raw?.categoryId || null,
    owners: Array.isArray(raw?.owners) ? raw.owners : [],
    targets: Array.isArray(raw?.targets) ? raw.targets : []
  };

  state.owners = [...new Set(
    state.owners
      .map(v => String(v || '').trim())
      .filter(v => /^\d{15,22}$/.test(v))
  )];

  state.targets = state.targets
    .filter(t => t && /^\d{15,22}$/.test(String(t.userId || '')))
    .map(t => ({
      userId: String(t.userId),
      username: t.username || null,
      globalName: t.globalName || null,
      channelId: t.channelId || null,
      webhookId: t.webhookId || null,
      webhookToken: t.webhookToken || null,
      addedBy: t.addedBy || null,
      addedAt: t.addedAt || new Date().toISOString()
    }));

  return state;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  try {
    ensureDataDir();
    if (!fs.existsSync(STATE_FILE)) {
      fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
      return structuredClone(DEFAULT_STATE);
    }
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return normalizeState(parsed);
  } catch (err) {
    console.error('❌ Impossible de lire state.json :', err.message);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  ensureDataDir();
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalizeState(state), null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

module.exports = { loadState, saveState, STATE_FILE, DATA_DIR };
