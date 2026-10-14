import { createLocalStorage } from './local.js';
import { createBlobStorage } from './blob.js';

export function createStorage(config) {
  return config.storage === 'blob' ? createBlobStorage({ access: config.blobAccess }) : createLocalStorage(config.filesDir);
}
