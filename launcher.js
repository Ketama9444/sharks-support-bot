const { spawn } = require('child_process');
const path = require('path');

const ROOT = __dirname;
const DATA_ROOT = process.env.DATA_ROOT || '/app/data';
const children = new Map();
let shuttingDown = false;

const apps = [
  {
    name: 'SHARKS-SUPPORT',
    script: path.join(ROOT, 'support', 'app.js'),
    env: {
      SUPPORT_DATA_DIR: process.env.SUPPORT_DATA_DIR || path.join(DATA_ROOT, 'support'),
      SUPPORT_TRANSCRIPTS_DIR: process.env.SUPPORT_TRANSCRIPTS_DIR || path.join(DATA_ROOT, 'support', 'transcripts')
    }
  },
  {
    name: 'SPY6',
    script: path.join(ROOT, 'spy6', 'index.js'),
    env: {
      DATA_DIR: process.env.SPY6_DATA_DIR || path.join(DATA_ROOT, 'spy6')
    }
  }
];

function startApp(app, delay = 0) {
  setTimeout(() => {
    if (shuttingDown) return;

    console.log(`\n[LAUNCHER] ▶ Démarrage ${app.name}`);
    const child = spawn(process.execPath, [app.script], {
      cwd: ROOT,
      env: { ...process.env, ...app.env },
      stdio: 'inherit'
    });

    children.set(app.name, child);

    child.on('exit', (code, signal) => {
      children.delete(app.name);
      if (shuttingDown) return;
      console.error(`[LAUNCHER] ⚠ ${app.name} arrêté (code=${code ?? 'null'}, signal=${signal ?? 'none'}). Redémarrage dans 5s.`);
      startApp(app, 5000);
    });

    child.on('error', err => {
      console.error(`[LAUNCHER] ❌ ${app.name}: ${err.message}`);
    });
  }, delay);
}

console.log('╔════════════════════════════════════════════╗');
console.log('║ SHARKS FA // NORTHFLANK MULTI-BOT NODE   ║');
console.log('╚════════════════════════════════════════════╝');
console.log(`[LAUNCHER] DATA_ROOT = ${DATA_ROOT}`);

for (const app of apps) startApp(app);

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[LAUNCHER] ${signal} reçu, arrêt propre...`);
  for (const child of children.values()) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
