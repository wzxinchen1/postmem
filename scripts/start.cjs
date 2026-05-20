const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
  console.log('[Startup] .env loaded from:', envPath);
} else {
  console.warn('[Startup] .env not found at:', envPath);
}

process.env.HOSTNAME = '0.0.0.0';
if (process.env.PORT) {
  console.log('[Startup] Listening on 0.0.0.0:' + process.env.PORT);
} else {
  console.log('[Startup] Listening on 0.0.0.0:3000 (PORT not set in .env)');
}

console.log('[Startup] DATABASE_URL:', process.env.DATABASE_URL ? 'OK' : 'MISSING');

require('./server.js');
