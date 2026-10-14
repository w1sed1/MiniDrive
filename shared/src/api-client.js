export class ApiError extends Error {
  constructor(status, message, code = null, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function toBlob(data, type) {
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
  return new Blob([data], type ? { type } : undefined);
}

/**
 * REST-клієнт сервера MiniDrive. Використовується і десктопом (main-процес Electron),
 * і веб-версією. Токен береться через getToken() перед кожним запитом.
 */
export function createApiClient({ baseUrl = '', getToken = () => null, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const root = baseUrl.replace(/\/+$/, '');

  async function request(path, { method = 'GET', json, body, raw = false } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload = body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(json);
    }
    let res;
    try {
      res = await doFetch(root + path, { method, headers, body: payload });
    } catch {
      throw new ApiError(0, 'Сервер недоступний. Перевірте адресу та з’єднання.', 'NETWORK');
    }
    if (!res.ok) {
      let data = {};
      try {
        data = await res.json();
      } catch {
        // відповідь без JSON
      }
      throw new ApiError(res.status, data.error || `Помилка сервера (${res.status})`, data.code ?? null, data);
    }
    if (raw) return res;
    if (res.status === 204) return null;
    return res.json();
  }

  function fileForm(name, data, extra = {}) {
    const form = new FormData();
    form.append('name', name);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    form.append('file', toBlob(data), name);
    return form;
  }

  return {
    baseUrl: root,
    health: () => request('/api/health'),
    register: (username, password) => request('/api/auth/register', { method: 'POST', json: { username, password } }),
    login: (username, password) => request('/api/auth/login', { method: 'POST', json: { username, password } }),
    me: () => request('/api/auth/me').then((r) => r.user),

    listFiles: () => request('/api/files').then((r) => r.files),
    uploadFile: (name, data, { overwrite = false } = {}) =>
      request('/api/files', { method: 'POST', body: fileForm(name, data, { overwrite: overwrite ? '1' : '0' }) }).then(
        (r) => r.file,
      ),
    replaceContent: (id, name, data) =>
      request(`/api/files/${id}/content`, { method: 'PUT', body: fileForm(name, data) }).then((r) => r.file),
    downloadFile: async (id) => {
      const res = await request(`/api/files/${id}/content`, { raw: true });
      return new Uint8Array(await res.arrayBuffer());
    },
    renameFile: (id, name) => request(`/api/files/${id}`, { method: 'PATCH', json: { name } }).then((r) => r.file),
    deleteFile: (id) => request(`/api/files/${id}`, { method: 'DELETE' }),

    listShares: (id) => request(`/api/files/${id}/shares`).then((r) => r.shares),
    shareFile: (id, username) => request(`/api/files/${id}/shares`, { method: 'POST', json: { username } }).then((r) => r.shares),
    unshareFile: (id, userId) => request(`/api/files/${id}/shares/${userId}`, { method: 'DELETE' }).then((r) => r.shares),

    /** Пряме посилання на вміст із короткоживучим токеном (для <img>, перетягування на робочий стіл). */
    contentUrl: (file, { download = false } = {}) => `${root}${file.contentPath}${download ? '&download=1' : ''}`,
  };
}
