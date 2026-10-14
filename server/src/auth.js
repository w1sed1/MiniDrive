import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { unauthorized } from './errors.js';

export const hashPassword = (password) => bcrypt.hash(password, 10);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export function signSession(user, secret) {
  return jwt.sign({ typ: 'session', username: user.username }, secret, { subject: String(user.id), expiresIn: '7d' });
}

/** Короткоживучий токен на один файл — для <img src>, посилань на скачування і drag-out. */
export function signContentToken(fileId, userId, secret) {
  return jwt.sign({ typ: 'content', fid: fileId }, secret, { subject: String(userId), expiresIn: '30m' });
}

export function verifyToken(token, secret, typ) {
  try {
    const payload = jwt.verify(token, secret);
    return payload.typ === typ ? payload : null;
  } catch {
    return null;
  }
}

function bearer(req) {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Перевіряє сесійний JWT і кладе користувача в req.user. */
export function requireAuth(repo, secret) {
  return async (req, _res, next) => {
    const payload = verifyToken(bearer(req) ?? '', secret, 'session');
    if (!payload) throw unauthorized();
    const user = await repo.findUserById(Number(payload.sub));
    if (!user) throw unauthorized('Користувача не знайдено, увійдіть знову');
    req.user = { id: user.id, username: user.username };
    next();
  };
}

/** Для вмісту файлу: або сесійний токен у заголовку, або токен файлу в ?t=. */
export function authForContent(repo, secret) {
  const session = requireAuth(repo, secret);
  return async (req, res, next) => {
    if (bearer(req)) return session(req, res, next);
    const payload = verifyToken(String(req.query.t ?? ''), secret, 'content');
    if (!payload || payload.fid !== req.params.id) throw unauthorized('Посилання недійсне або застаріло');
    req.user = { id: Number(payload.sub), username: null };
    next();
  };
}
