import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(serverRoot, 'data');

/**
 * Локально: SQLite-файл і папка з файлами в server/data.
 * На Vercel: Turso (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) і Vercel Blob (BLOB_READ_WRITE_TOKEN).
 */
export function loadConfig(env = process.env) {
  const onVercel = Boolean(env.VERCEL);
  if (onVercel) {
    // На Vercel файлова система лише для читання — потрібні зовнішні БД і сховище.
    const missing = ['JWT_SECRET', 'TURSO_DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`не задано змінні середовища: ${missing.join(', ')}`);
  }
  return {
    port: Number(env.PORT) || 3001,
    jwtSecret: env.JWT_SECRET || 'minidrive-dev-secret',
    databaseUrl: env.TURSO_DATABASE_URL || env.DATABASE_URL || `file:${path.join(dataDir, 'minidrive.db')}`,
    databaseAuthToken: env.TURSO_AUTH_TOKEN || undefined,
    storage: env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local',
    blobAccess: env.BLOB_ACCESS === 'public' ? 'public' : 'private',
    filesDir: env.FILES_DIR || path.join(dataDir, 'files'),
    // Vercel обмежує тіло запиту функції ~4,5 МБ.
    maxUploadBytes: (Number(env.MAX_UPLOAD_MB) || (onVercel ? 4 : 50)) * 1024 * 1024,
  };
}
