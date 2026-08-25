const fs = require('fs');
const path = require('path');

const dir = process.env.SUPPORT_DATA_DIR
  ? path.resolve(process.env.SUPPORT_DATA_DIR)
  : path.join(__dirname, 'data');
const file = path.join(dir, 'database.json');
const seedFile = path.join(__dirname, 'seed', 'database.json');

const EMPTY_DB = { tickets: {}, users: {}, counters: { ticket: 0 } };

function ensure() {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    if (fs.existsSync(seedFile)) {
      fs.copyFileSync(seedFile, file);
      console.log(`💾 Sharks Support : base initiale copiée vers ${file}`);
    } else {
      fs.writeFileSync(file, JSON.stringify(EMPTY_DB, null, 2));
    }
  }
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

function save(db) {
  ensure();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

function nextTicketId() {
  const db = load();
  db.counters.ticket = (db.counters.ticket || 0) + 1;
  save(db);
  return db.counters.ticket;
}

module.exports = { load, save, nextTicketId, file, dir };
