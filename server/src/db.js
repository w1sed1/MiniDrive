import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS files (
     id TEXT PRIMARY KEY,
     owner_id INTEGER NOT NULL REFERENCES users(id),
     name TEXT NOT NULL,
     name_key TEXT NOT NULL,
     size INTEGER NOT NULL,
     mime TEXT NOT NULL,
     hash TEXT NOT NULL,
     storage_key TEXT NOT NULL,
     uploaded_by INTEGER NOT NULL REFERENCES users(id),
     edited_by INTEGER REFERENCES users(id),
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     UNIQUE (owner_id, name_key)
   )`,
  `CREATE TABLE IF NOT EXISTS shares (
     file_id TEXT NOT NULL REFERENCES files(id),
     user_id INTEGER NOT NULL REFERENCES users(id),
     created_at TEXT NOT NULL,
     PRIMARY KEY (file_id, user_id)
   )`,
];

/** Ключ унікальності назви: без урахування регістру (у т.ч. кирилиці) і форми Unicode. */
export const nameKey = (name) => String(name).normalize('NFC').toLowerCase();

const FILE_SELECT = `
  SELECT f.*, o.username AS owner_name, u.username AS uploader_name, e.username AS editor_name,
         (SELECT COUNT(*) FROM shares s WHERE s.file_id = f.id) AS share_count
  FROM files f
  JOIN users o ON o.id = f.owner_id
  JOIN users u ON u.id = f.uploaded_by
  LEFT JOIN users e ON e.id = f.edited_by`;

function mapUser(row) {
  return row ? { id: Number(row.id), username: row.username, passwordHash: row.password_hash, createdAt: row.created_at } : null;
}

function mapFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: Number(row.owner_id),
    name: row.name,
    size: Number(row.size),
    mime: row.mime,
    hash: row.hash,
    storageKey: row.storage_key,
    uploadedBy: row.uploader_name,
    editedBy: row.editor_name ?? null,
    owner: row.owner_name,
    shareCount: Number(row.share_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Доступ до даних (users / files / shares) поверх libSQL: локальний SQLite-файл або Turso. */
export class Repository {
  constructor(client) {
    this.client = client;
  }

  async one(sql, args = []) {
    const rs = await this.client.execute({ sql, args });
    return rs.rows[0] ?? null;
  }

  async all(sql, args = []) {
    const rs = await this.client.execute({ sql, args });
    return rs.rows;
  }

  async run(sql, args = []) {
    return this.client.execute({ sql, args });
  }

  // ---- users
  async createUser(username, passwordHash) {
    const now = new Date().toISOString();
    const rs = await this.run('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)', [username, passwordHash, now]);
    return this.findUserById(Number(rs.lastInsertRowid));
  }

  async findUserByUsername(username) {
    return mapUser(await this.one('SELECT * FROM users WHERE username = ?', [username]));
  }

  async findUserById(id) {
    return mapUser(await this.one('SELECT * FROM users WHERE id = ?', [id]));
  }

  // ---- files
  /** Власні файли користувача + файли, якими з ним поділилися. */
  async listFilesForUser(userId) {
    const rows = await this.all(
      `${FILE_SELECT} WHERE f.owner_id = ? OR f.id IN (SELECT file_id FROM shares WHERE user_id = ?)`,
      [userId, userId],
    );
    return rows.map(mapFile);
  }

  async findFileById(id) {
    return mapFile(await this.one(`${FILE_SELECT} WHERE f.id = ?`, [id]));
  }

  async findFileByName(ownerId, name) {
    return mapFile(await this.one(`${FILE_SELECT} WHERE f.owner_id = ? AND f.name_key = ?`, [ownerId, nameKey(name)]));
  }

  async insertFile(f) {
    await this.run(
      `INSERT INTO files (id, owner_id, name, name_key, size, mime, hash, storage_key, uploaded_by, edited_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [f.id, f.ownerId, f.name, nameKey(f.name), f.size, f.mime, f.hash, f.storageKey, f.uploadedBy, f.createdAt, f.createdAt],
    );
    return this.findFileById(f.id);
  }

  async updateFileContent(id, { size, mime, hash, storageKey, editedBy, updatedAt }) {
    await this.run(
      'UPDATE files SET size = ?, mime = ?, hash = ?, storage_key = ?, edited_by = ?, updated_at = ? WHERE id = ?',
      [size, mime, hash, storageKey, editedBy, updatedAt, id],
    );
    return this.findFileById(id);
  }

  async renameFile(id, { name, mime, editedBy, updatedAt }) {
    await this.run(
      'UPDATE files SET name = ?, name_key = ?, mime = ?, edited_by = ?, updated_at = ? WHERE id = ?',
      [name, nameKey(name), mime, editedBy, updatedAt, id],
    );
    return this.findFileById(id);
  }

  async deleteFile(id) {
    await this.client.batch(
      [
        { sql: 'DELETE FROM shares WHERE file_id = ?', args: [id] },
        { sql: 'DELETE FROM files WHERE id = ?', args: [id] },
      ],
      'write',
    );
  }

  // ---- shares
  async hasShare(fileId, userId) {
    return Boolean(await this.one('SELECT 1 FROM shares WHERE file_id = ? AND user_id = ?', [fileId, userId]));
  }

  async listShares(fileId) {
    const rows = await this.all(
      `SELECT s.user_id, u.username, s.created_at FROM shares s JOIN users u ON u.id = s.user_id
       WHERE s.file_id = ? ORDER BY u.username`,
      [fileId],
    );
    return rows.map((r) => ({ userId: Number(r.user_id), username: r.username, createdAt: r.created_at }));
  }

  async addShare(fileId, userId) {
    await this.run('INSERT OR IGNORE INTO shares (file_id, user_id, created_at) VALUES (?, ?, ?)', [fileId, userId, new Date().toISOString()]);
  }

  async removeShare(fileId, userId) {
    await this.run('DELETE FROM shares WHERE file_id = ? AND user_id = ?', [fileId, userId]);
  }
}

export async function openDatabase({ url, authToken }) {
  if (url.startsWith('file:')) {
    const filePath = url.startsWith('file://') ? fileURLToPath(url) : url.slice('file:'.length);
    if (filePath !== ':memory:') fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const client = createClient({ url, authToken });
  await client.batch(SCHEMA, 'write');
  return new Repository(client);
}
