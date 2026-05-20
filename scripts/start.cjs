const path = require('path');
const dotenv = require('dotenv');

// Load .env from the same directory as this script, regardless of working directory
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('[Startup] .env loaded from:', path.join(__dirname, '.env'));
console.log('[Startup] DATABASE_URL:', process.env.DATABASE_URL ? 'OK' : 'MISSING');

// Delegate to the actual Next.js standalone server
require('./server.js');
