const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'data');
const file = path.join(dir, 'database.json');

function ensure() {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ tickets: {}, users: {}, counters: { ticket: 0 } }, null, 2));
  }
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { tickets: {}, users: {}, counters: { ticket: 0 } };
  }
}

function save(db) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
}

function nextTicketId() {
  const db = load();
  db.counters.ticket = (db.counters.ticket || 0) + 1;
  save(db);
  return db.counters.ticket;
}

module.exports = { load, save, nextTicketId, file };
