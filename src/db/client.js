// ─────────────────────────────────────────────────────────────
//  Single better-sqlite3 connection — import this everywhere
//  Never create a second connection anywhere else
// ─────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/naukri.db');

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL'); // faster writes
db.pragma('synchronous = NORMAL'); // safe + fast

export default db;
