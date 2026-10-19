const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 1;
const PLAN_ID = /^[a-f0-9-]{36}\.(?:png|jpg|webp|gif)$/;
function assertKey(key) {
  if (typeof key !== 'string' || !/^vastu_[a-z0-9_]{1,90}$/.test(key)) throw new Error('Invalid storage key.');
}

class DesktopData {
  constructor(documents, version) {
    this.root = path.join(documents, 'Vastu');
    for (const folder of ['', 'plans', 'exports', 'backups']) fs.mkdirSync(path.join(this.root, folder), { recursive: true });
    const file = path.join(this.root, 'projects.db');
    const existing = fs.existsSync(file);
    this.db = new DatabaseSync(file);
    try {
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
      const schema = this.db.prepare('PRAGMA user_version').get().user_version;
      if (schema > SCHEMA_VERSION) throw new Error('This data was saved by a newer Vastu app. Install the newer version; your data is preserved.');
      if (schema < SCHEMA_VERSION) {
        if (existing) this.backup('before-schema-upgrade');
        this.db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
          CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
          PRAGMA user_version=1;
          COMMIT;`);
      }
      const previous = this.db.prepare("SELECT value FROM metadata WHERE key='appVersion'").get()?.value;
      if (previous && previous !== version) this.backup('before-app-update');
      this.db.prepare("INSERT INTO metadata(key,value) VALUES('appVersion',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(version);
      this.version = version;
    } catch (error) { this.db.close(); throw error; }
  }
  getItem(key) { assertKey(key); return this.db.prepare('SELECT value FROM storage WHERE key=?').get(key)?.value ?? null; }
  setItem(key, value) {
    assertKey(key);
    if (typeof value !== 'string' || Buffer.byteLength(value) > 25 * 1024 * 1024) throw new Error('Project data is too large to save.');
    this.db.prepare('INSERT INTO storage(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  }
  removeItem(key) { assertKey(key); this.db.prepare('DELETE FROM storage WHERE key=?').run(key); }
  backup(reason = 'manual') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(this.root, 'backups', `${stamp}-${reason}-${randomUUID().slice(0,8)}`);
    fs.mkdirSync(destination);
    this.db.prepare('VACUUM INTO ?').run(path.join(destination, 'projects.db'));
    // A database-only backup cannot restore projects that reference imported plans.
    fs.cpSync(path.join(this.root, 'plans'), path.join(destination, 'plans'), { recursive: true });
    return destination;
  }
  savePlan(base64, mime) {
    const extension = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif' }[mime];
    if (!extension || typeof base64 !== 'string' || base64.length > 40 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Choose a PNG, JPEG, WebP or GIF plan under 30 MB.');
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length) throw new Error('The plan image is empty.');
    const id = `${randomUUID()}.${extension}`;
    fs.writeFileSync(this.planPath(id), bytes, { flag: 'wx' });
    return `vastu-plan:${id}`;
  }
  planPath(id) {
    if (!PLAN_ID.test(id)) throw new Error('Invalid plan identifier.');
    return path.join(this.root, 'plans', id);
  }
  close() { this.db.close(); }
}
module.exports = { DesktopData, PLAN_ID };
