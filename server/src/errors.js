export class HttpError extends Error {
  constructor(status, message, code = null, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (msg, code) => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Потрібна авторизація') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg) => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Файл не знайдено') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg, code, extra) => new HttpError(409, msg, code, extra);
