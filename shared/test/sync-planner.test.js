import { describe, expect, it } from 'vitest';
import { SYNC_ACTIONS as A, nextBase, planSync, readBaseState } from '../src/index.js';

const T0 = Date.parse('2026-10-01T10:00:00Z');
const loc = (name, hash, mtime = T0) => ({ name, hash, mtime });
const rem = (name, hash, updatedAt = '2026-10-01T10:00:00Z') => ({ id: `id-${name}`, name, hash, updatedAt });
const actions = (plan) => Object.fromEntries(plan.map((p) => [p.name, p.action]));

describe('планувальник синхронізації', () => {
  it('перша синхронізація: обмінюється новими файлами і нічого не видаляє', () => {
    const plan = planSync({
      local: [loc('a.txt', 'h1'), loc('same.txt', 'hs')],
      remote: [rem('b.png', 'h2'), rem('same.txt', 'hs')],
      base: null,
    });
    expect(actions(plan)).toEqual({ 'a.txt': A.UPLOAD, 'b.png': A.DOWNLOAD, 'same.txt': A.NONE });
  });

  it('змінена лише одна сторона — її версія переноситься', () => {
    const base = { 'l.txt': { name: 'l.txt', hash: 'old' }, 'r.txt': { name: 'r.txt', hash: 'old' } };
    const plan = planSync({
      local: [loc('l.txt', 'new'), loc('r.txt', 'old')],
      remote: [rem('l.txt', 'old'), rem('r.txt', 'new')],
      base,
    });
    expect(actions(plan)).toEqual({ 'l.txt': A.UPDATE_REMOTE, 'r.txt': A.DOWNLOAD });
  });

  it('конфлікт: обидві сторони змінені — перемагає новіша', () => {
    const base = { 'c.txt': { name: 'c.txt', hash: 'old' } };
    const newerLocal = planSync({
      local: [loc('c.txt', 'L', Date.parse('2026-10-02T12:00:00Z'))],
      remote: [rem('c.txt', 'R', '2026-10-02T11:00:00Z')],
      base,
    });
    expect(newerLocal[0]).toMatchObject({ action: A.UPDATE_REMOTE, reason: 'conflict-local-newer' });

    const newerRemote = planSync({
      local: [loc('c.txt', 'L', Date.parse('2026-10-02T10:00:00Z'))],
      remote: [rem('c.txt', 'R', '2026-10-02T11:00:00Z')],
      base,
    });
    expect(newerRemote[0]).toMatchObject({ action: A.DOWNLOAD, reason: 'conflict-remote-newer' });
  });

  it('видалення переноситься лише для незмінених синхронізованих файлів', () => {
    const base = {
      'gone-remote.txt': { name: 'gone-remote.txt', hash: 'h' },
      'gone-local.txt': { name: 'gone-local.txt', hash: 'h' },
      'edited-local.txt': { name: 'edited-local.txt', hash: 'h' },
    };
    const plan = planSync({
      local: [loc('gone-remote.txt', 'h'), loc('edited-local.txt', 'h2')],
      remote: [rem('gone-local.txt', 'h')],
      base,
    });
    expect(actions(plan)).toEqual({
      'gone-remote.txt': A.DELETE_LOCAL,
      'gone-local.txt': A.DELETE_REMOTE,
      'edited-local.txt': A.UPLOAD, // змінений локально файл не втрачаємо
    });
  });

  it('зіставляє назви без урахування регістру та форми Unicode', () => {
    const nfd = 'й.txt'.normalize('NFD');
    const plan = planSync({ local: [loc(nfd, 'h'), loc('README.TXT', 'x')], remote: [rem('й.txt', 'h'), rem('readme.txt', 'x')], base: null });
    expect(plan.every((p) => p.action === A.NONE)).toBe(true);
  });

  it('nextBase: зберігає хеші після дій і лишає старий запис для невдалих', () => {
    const base = { 'x.txt': { name: 'x.txt', hash: 'old' } };
    const plan = planSync({ local: [loc('a.txt', 'ha'), loc('x.txt', 'new')], remote: [rem('b.txt', 'hb'), rem('x.txt', 'old')], base });
    const next = nextBase(plan, base, new Set(['x.txt']));
    expect(next).toEqual({
      'a.txt': { name: 'a.txt', hash: 'ha' },
      'b.txt': { name: 'b.txt', hash: 'hb' },
      'x.txt': { name: 'x.txt', hash: 'old' },
    });
  });

  it('стан іншого сервера чи користувача ігнорується', () => {
    const doc = { version: 1, server: 'http://a', username: 'olena', files: { 'a.txt': { name: 'a.txt', hash: 'h' } } };
    expect(readBaseState(doc, { server: 'http://a', username: 'olena' })).toEqual(doc.files);
    expect(readBaseState(doc, { server: 'http://b', username: 'olena' })).toBeNull();
    expect(readBaseState(doc, { server: 'http://a', username: 'taras' })).toBeNull();
  });
});
