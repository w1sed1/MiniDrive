import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SYNC_STATE_FILE } from '@minidrive/shared';
import { runSync } from '../src/main/sync-engine.js';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** Сервер у пам'яті з тим самим інтерфейсом, що й REST-клієнт. */
function fakeApi() {
  const files = new Map();
  let seq = 0;
  const put = (id, name, data, createdAt) => {
    const buf = Buffer.from(data);
    files.set(id, { id, name, data: buf, hash: sha(buf), isOwner: true, createdAt: createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
    return files.get(id);
  };
  return {
    files,
    seed: (name, data) => put(`f${++seq}`, name, data),
    async listFiles() {
      return [...files.values()].map(({ data, ...meta }) => meta);
    },
    async uploadFile(name, data) {
      if ([...files.values()].some((f) => f.name.toLowerCase() === name.toLowerCase())) throw Object.assign(new Error('exists'), { code: 'FILE_EXISTS' });
      return put(`f${++seq}`, name, data);
    },
    async replaceContent(id, name, data) {
      return put(id, name, data, files.get(id).createdAt);
    },
    async downloadFile(id) {
      return new Uint8Array(files.get(id).data);
    },
    async deleteFile(id) {
      files.delete(id);
    },
  };
}

let dir;
const opts = (api) => ({ api, dir, server: 'http://test', username: 'olena' });
const local = (name) => path.join(dir, name);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minidrive-sync-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('синхронізація десктоп-клієнта (реальна папка)', () => {
  it('перша синхронізація: локальні файли вивантажуються, серверні — завантажуються', async () => {
    const api = fakeApi();
    api.seed('server.js', 'console.log(1)');
    fs.writeFileSync(local('local.txt'), 'привіт');

    const res = await runSync(opts(api));

    expect(res.failed).toBe(0);
    expect(fs.readFileSync(local('server.js'), 'utf8')).toBe('console.log(1)');
    expect([...api.files.values()].map((f) => f.name).sort()).toEqual(['local.txt', 'server.js']);
    const state = JSON.parse(fs.readFileSync(local(SYNC_STATE_FILE), 'utf8'));
    expect(Object.keys(state.files).sort()).toEqual(['local.txt', 'server.js']);
  });

  it('друга синхронізація переносить видалення та зміни в обидва боки', async () => {
    const api = fakeApi();
    const remote = api.seed('a.txt', 'v1');
    fs.writeFileSync(local('b.txt'), 'b');
    await runSync(opts(api));

    fs.rmSync(local('b.txt')); // видалили локально
    await api.replaceContent(remote.id, 'a.txt', 'v2'); // змінили на сервері
    const res = await runSync(opts(api));

    expect(res.log.map((l) => [l.name, l.action])).toEqual([
      ['a.txt', 'download'],
      ['b.txt', 'delete-remote'],
    ]);
    expect(fs.readFileSync(local('a.txt'), 'utf8')).toBe('v2');
    expect([...api.files.values()].map((f) => f.name)).toEqual(['a.txt']);
  });

  it('повторна синхронізація без змін нічого не робить; приховані файли ігноруються', async () => {
    const api = fakeApi();
    fs.writeFileSync(local('.DS_Store'), 'x');
    fs.writeFileSync(local('doc.txt'), 'd');
    await runSync(opts(api));
    const res = await runSync(opts(api));
    expect(res.log).toEqual([]);
    expect([...api.files.values()].map((f) => f.name)).toEqual(['doc.txt']);
  });

  it('помилка однієї дії не зупиняє інші і не псує стан', async () => {
    const api = fakeApi();
    fs.writeFileSync(local('ok.txt'), '1');
    fs.writeFileSync(local('bad.txt'), '2');
    const upload = api.uploadFile;
    api.uploadFile = (name, data) => (name === 'bad.txt' ? Promise.reject(new Error('мережа')) : upload(name, data));
    const res = await runSync(opts(api));
    expect(res.failed).toBe(1);
    const state = JSON.parse(fs.readFileSync(local(SYNC_STATE_FILE), 'utf8'));
    expect(Object.keys(state.files)).toEqual(['ok.txt']);
  });
});
