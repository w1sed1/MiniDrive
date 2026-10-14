import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import contentDisposition from 'content-disposition';
import { getExtension, validateFileName, validatePassword, validateUsername } from '@minidrive/shared';
import { authForContent, hashPassword, requireAuth, signContentToken, signSession, verifyPassword } from './auth.js';
import { HttpError, badRequest, conflict, forbidden, notFound, unauthorized } from './errors.js';

const MIME = {
  '.txt': 'text/plain',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
};
// Inline віддаємо лише картинки; решту — як text/plain, щоб завантажений HTML/JS не виконувався.
const INLINE_IMAGE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const TEXTUAL = new Set(['.txt', '.js', '.json', '.md', '.html', '.css', '.csv']);

const mimeFor = (name) => MIME[getExtension(name)] ?? 'application/octet-stream';
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const now = () => new Date().toISOString();

/** Multer декодує назву файлу як latin1 — повертаємо UTF-8 (кирилиця). */
function originalName(file) {
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

export function createApp({ repo, storage, config }) {
  const app = express();
  const auth = requireAuth(repo, config.jwtSecret);
  const contentAuth = authForContent(repo, config.jwtSecret);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

  app.disable('x-powered-by');
  app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '100kb' }));

  /** DTO файлу для клієнта (без службових полів сховища). */
  function toDto(file, userId) {
    const token = signContentToken(file.id, userId, config.jwtSecret);
    return {
      id: file.id,
      name: file.name,
      ext: getExtension(file.name),
      size: file.size,
      mime: file.mime,
      hash: file.hash,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      uploadedBy: file.uploadedBy,
      editedBy: file.editedBy,
      owner: file.owner,
      isOwner: file.ownerId === userId,
      shareCount: file.ownerId === userId ? file.shareCount : undefined,
      contentPath: `/api/files/${file.id}/content?t=${encodeURIComponent(token)}`,
    };
  }

  /** Файл, до якого користувач має доступ (власник або з ним поділилися). */
  async function loadAccessible(fileId, userId) {
    const file = await repo.findFileById(fileId);
    if (!file) throw notFound();
    if (file.ownerId !== userId && !(await repo.hasShare(file.id, userId))) throw notFound();
    return file;
  }

  async function loadOwned(fileId, userId, action) {
    const file = await loadAccessible(fileId, userId);
    if (file.ownerId !== userId) throw forbidden(`${action} може лише власник файлу`);
    return file;
  }

  async function replaceContent(file, buffer, userId) {
    const storageKey = await storage.put(crypto.randomUUID(), buffer, file.mime);
    const updated = await repo.updateFileContent(file.id, {
      size: buffer.length,
      mime: file.mime,
      hash: sha256(buffer),
      storageKey,
      editedBy: userId,
      updatedAt: now(),
    });
    await storage.remove(file.storageKey).catch(() => {});
    return updated;
  }

  // ---------------------------------------------------------------- службове
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, storage: storage.kind, time: now() });
  });

  // ---------------------------------------------------------------- авторизація
  app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const error = validateUsername(username) ?? validatePassword(password);
    if (error) throw badRequest(error, 'VALIDATION');
    if (await repo.findUserByUsername(username)) throw conflict('Користувач з таким логіном уже існує', 'USER_EXISTS');
    const user = await repo.createUser(username, await hashPassword(password));
    res.status(201).json({ token: signSession(user, config.jwtSecret), user: { id: user.id, username: user.username } });
  });

  app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const user = username ? await repo.findUserByUsername(username) : null;
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('Невірний логін або пароль');
    }
    res.json({ token: signSession(user, config.jwtSecret), user: { id: user.id, username: user.username } });
  });

  app.get('/api/auth/me', auth, (req, res) => {
    res.json({ user: req.user });
  });

  // ---------------------------------------------------------------- файли
  app.get('/api/files', auth, async (req, res) => {
    const files = await repo.listFilesForUser(req.user.id);
    res.json({ files: files.map((f) => toDto(f, req.user.id)) });
  });

  // Завантаження нового файлу. Якщо файл з такою назвою вже є: 409, або заміна при overwrite=1.
  app.post('/api/files', auth, upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Файл не передано', 'NO_FILE');
    const name = String(req.body?.name || originalName(req.file)).normalize('NFC');
    const error = validateFileName(name);
    if (error) throw badRequest(error, 'VALIDATION');

    const existing = await repo.findFileByName(req.user.id, name);
    if (existing) {
      if (req.body?.overwrite !== '1') {
        throw conflict(`Файл «${existing.name}» уже існує`, 'FILE_EXISTS', { fileId: existing.id });
      }
      const updated = await replaceContent(existing, req.file.buffer, req.user.id);
      return res.json({ file: toDto(updated, req.user.id), replaced: true });
    }

    const id = crypto.randomUUID();
    const mime = mimeFor(name);
    const storageKey = await storage.put(crypto.randomUUID(), req.file.buffer, mime);
    try {
      const file = await repo.insertFile({
        id,
        ownerId: req.user.id,
        name,
        size: req.file.size,
        mime,
        hash: sha256(req.file.buffer),
        storageKey,
        uploadedBy: req.user.id,
        createdAt: now(),
      });
      res.status(201).json({ file: toDto(file, req.user.id), replaced: false });
    } catch (e) {
      await storage.remove(storageKey).catch(() => {});
      if (String(e.message).includes('UNIQUE')) throw conflict(`Файл «${name}» уже існує`, 'FILE_EXISTS');
      throw e;
    }
  });

  app.get('/api/files/:id', auth, async (req, res) => {
    const file = await loadAccessible(req.params.id, req.user.id);
    res.json({ file: toDto(file, req.user.id) });
  });

  app.get('/api/files/:id/content', contentAuth, async (req, res) => {
    const file = await loadAccessible(req.params.id, req.user.id);
    const buffer = await storage.get(file.storageKey);
    const ext = getExtension(file.name);
    const download = req.query.download === '1';
    let type = 'application/octet-stream';
    if (INLINE_IMAGE.has(file.mime)) type = file.mime;
    else if (TEXTUAL.has(ext)) type = 'text/plain; charset=utf-8';
    res.set({
      'Content-Type': type,
      'Content-Length': String(buffer.length),
      'Content-Disposition': contentDisposition(file.name, { type: download ? 'attachment' : 'inline' }),
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  });

  // Редагування вмісту (нова версія файлу). Доступно власнику і тим, з ким поділилися.
  app.put('/api/files/:id/content', auth, upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Файл не передано', 'NO_FILE');
    const file = await loadAccessible(req.params.id, req.user.id);
    const updated = await replaceContent(file, req.file.buffer, req.user.id);
    res.json({ file: toDto(updated, req.user.id) });
  });

  app.patch('/api/files/:id', auth, async (req, res) => {
    const file = await loadOwned(req.params.id, req.user.id, 'Перейменовувати');
    const name = String(req.body?.name ?? '').normalize('NFC');
    const error = validateFileName(name);
    if (error) throw badRequest(error, 'VALIDATION');
    if (name === file.name) return res.json({ file: toDto(file, req.user.id) });
    const clash = await repo.findFileByName(req.user.id, name);
    if (clash && clash.id !== file.id) throw conflict(`Файл «${clash.name}» уже існує`, 'FILE_EXISTS');
    const updated = await repo.renameFile(file.id, { name, mime: mimeFor(name), editedBy: req.user.id, updatedAt: now() });
    res.json({ file: toDto(updated, req.user.id) });
  });

  app.delete('/api/files/:id', auth, async (req, res) => {
    const file = await loadOwned(req.params.id, req.user.id, 'Видаляти');
    await repo.deleteFile(file.id);
    await storage.remove(file.storageKey).catch(() => {});
    res.status(204).end();
  });

  // ---------------------------------------------------------------- спільний доступ
  app.get('/api/files/:id/shares', auth, async (req, res) => {
    const file = await loadOwned(req.params.id, req.user.id, 'Керувати доступом');
    res.json({ shares: await repo.listShares(file.id) });
  });

  app.post('/api/files/:id/shares', auth, async (req, res) => {
    const file = await loadOwned(req.params.id, req.user.id, 'Керувати доступом');
    const target = await repo.findUserByUsername(String(req.body?.username ?? '').trim());
    if (!target) throw notFound('Користувача з таким логіном не знайдено');
    if (target.id === req.user.id) throw badRequest('Не можна поділитися файлом із собою', 'SELF_SHARE');
    await repo.addShare(file.id, target.id);
    res.status(201).json({ shares: await repo.listShares(file.id) });
  });

  app.delete('/api/files/:id/shares/:userId', auth, async (req, res) => {
    const file = await loadOwned(req.params.id, req.user.id, 'Керувати доступом');
    await repo.removeShare(file.id, Number(req.params.userId));
    res.json({ shares: await repo.listShares(file.id) });
  });

  // ---------------------------------------------------------------- помилки
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Маршрут не знайдено', 'NOT_FOUND')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      const mb = Math.round(config.maxUploadBytes / 1024 / 1024);
      return res
        .status(tooBig ? 413 : 400)
        .json({ error: tooBig ? `Файл завеликий (максимум ${mb} МБ)` : err.message, code: err.code });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Некоректний JSON', code: 'BAD_JSON' });
    }
    console.error(err);
    res.status(500).json({ error: 'Внутрішня помилка сервера', code: 'INTERNAL' });
  });

  return app;
}
