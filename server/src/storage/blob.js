import { put, get, del } from '@vercel/blob';

/**
 * Зберігання вмісту у Vercel Blob (на Vercel немає постійного диска).
 * За замовчуванням — приватне сховище: вміст доступний лише через API сервера.
 */
export function createBlobStorage({ access = 'private' } = {}) {
  return {
    kind: 'blob',
    async put(key, buffer, contentType) {
      const blob = await put(`files/${key}`, buffer, { access, contentType, addRandomSuffix: false });
      return blob.url;
    },
    async get(storageKey) {
      const result = await get(storageKey, { access, useCache: false });
      if (!result?.stream) throw new Error('Вміст файлу не знайдено у сховищі');
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    },
    async remove(storageKey) {
      await del(storageKey);
    },
  };
}
