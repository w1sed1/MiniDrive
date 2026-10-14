import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { createLocalStorage } from '../src/storage/local.js';

let app;
let tmp;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'minidrive-test-'));
  const repo = await openDatabase({ url: `file:${path.join(tmp, 'test.db')}` });
  const config = { jwtSecret: 'test-secret', maxUploadBytes: 1024 * 1024 };
  app = createApp({ repo, storage: createLocalStorage(path.join(tmp, 'files')), config });
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function register(username) {
  const res = await request(app).post('/api/auth/register').send({ username, password: 'secret1' }).expect(201);
  return res.body.token;
}

const upload = (token, name, content, overwrite = false) =>
  request(app)
    .post('/api/files')
    .set('Authorization', `Bearer ${token}`)
    .field('name', name)
    .field('overwrite', overwrite ? '1' : '0')
    .attach('file', Buffer.from(content), 'blob');

describe('REST API сервера', () => {
  let olena;
  let taras;

  it('реєстрація, вхід і захист маршрутів', async () => {
    olena = await register('olena');
    taras = await register('taras');
    await request(app).post('/api/auth/register').send({ username: 'olena', password: 'secret1' }).expect(409);
    await request(app).post('/api/auth/login').send({ username: 'olena', password: 'wrong' }).expect(401);
    const login = await request(app).post('/api/auth/login').send({ username: 'OLENA', password: 'secret1' }).expect(200);
    expect(login.body.user.username).toBe('olena');
    await request(app).get('/api/files').expect(401);
  });

  it('завантаження, атрибути файлу і вміст', async () => {
    const res = await upload(olena, 'Звіт.txt', 'привіт').expect(201);
    const file = res.body.file;
    expect(file).toMatchObject({ name: 'Звіт.txt', ext: '.txt', size: 12, uploadedBy: 'olena', editedBy: null, owner: 'olena', isOwner: true });
    expect(file.createdAt).toBe(file.updatedAt);

    const content = await request(app).get(`/api/files/${file.id}/content`).set('Authorization', `Bearer ${olena}`).expect(200);
    expect(content.text).toBe('привіт');
    // короткоживуче посилання з токеном файлу працює без заголовка
    await request(app).get(file.contentPath).expect(200);
  });

  it('повторне завантаження: 409, а з overwrite — нова версія і «редагував»', async () => {
    await upload(olena, 'звіт.TXT', 'x').expect(409);
    const res = await upload(olena, 'Звіт.txt', 'нова версія', true).expect(200);
    expect(res.body.replaced).toBe(true);
    expect(res.body.file.editedBy).toBe('olena');
  });

  it('спільний доступ: інший користувач бачить і редагує, але не видаляє', async () => {
    const list = await request(app).get('/api/files').set('Authorization', `Bearer ${olena}`).expect(200);
    const file = list.body.files[0];
    await request(app).get(`/api/files/${file.id}`).set('Authorization', `Bearer ${taras}`).expect(404);

    await request(app).post(`/api/files/${file.id}/shares`).set('Authorization', `Bearer ${olena}`).send({ username: 'taras' }).expect(201);
    const shared = await request(app).get('/api/files').set('Authorization', `Bearer ${taras}`).expect(200);
    expect(shared.body.files).toHaveLength(1);
    expect(shared.body.files[0]).toMatchObject({ owner: 'olena', isOwner: false });

    const edited = await request(app)
      .put(`/api/files/${file.id}/content`)
      .set('Authorization', `Bearer ${taras}`)
      .attach('file', Buffer.from('правка Тараса'), 'blob')
      .expect(200);
    expect(edited.body.file).toMatchObject({ uploadedBy: 'olena', editedBy: 'taras' });

    await request(app).delete(`/api/files/${file.id}`).set('Authorization', `Bearer ${taras}`).expect(403);
  });

  it('перейменування з валідацією і видалення власником', async () => {
    const { body } = await upload(olena, 'a.js', 'let a = 1;').expect(201);
    await request(app).patch(`/api/files/${body.file.id}`).set('Authorization', `Bearer ${olena}`).send({ name: 'bad/name' }).expect(400);
    await request(app).patch(`/api/files/${body.file.id}`).set('Authorization', `Bearer ${olena}`).send({ name: 'Звіт.txt' }).expect(409);
    const renamed = await request(app).patch(`/api/files/${body.file.id}`).set('Authorization', `Bearer ${olena}`).send({ name: 'b.js' }).expect(200);
    expect(renamed.body.file).toMatchObject({ name: 'b.js', editedBy: 'olena' });

    await request(app).delete(`/api/files/${body.file.id}`).set('Authorization', `Bearer ${olena}`).expect(204);
    await request(app).get(`/api/files/${body.file.id}`).set('Authorization', `Bearer ${olena}`).expect(404);
  });

  it('відхиляє завеликі файли', async () => {
    const res = await upload(olena, 'big.bin', Buffer.alloc(2 * 1024 * 1024)).expect(413);
    expect(res.body.error).toMatch(/завеликий/);
  });
});
