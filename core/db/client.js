// ─────────────────────────────────────────────────────────────
//  core/db/client.js — Single SQLite connection
//
//  Shared across ALL platforms.
//  Never create a second connection anywhere else.
// ─────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Shared DB at root/data/ — accessible by all platforms
const DB_PATH = path.join(__dirname, '../../data/jobs.db');

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL'); // faster concurrent writes
db.pragma('synchronous = NORMAL'); // safe + fast

export default db;
