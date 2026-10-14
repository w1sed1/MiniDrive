import { renderDrive } from './components/drive.js';
import { renderLogin } from './components/login.js';
import { toast } from './components/ui.js';

const root = document.getElementById('app');
let cleanup = null;

function show(session) {
  cleanup?.();
  cleanup = null;
  if (session.user) {
    cleanup = renderDrive(root, session, {
      onLogout: async () => show(await window.drive.logout()),
    });
  } else {
    renderLogin(root, session, show);
  }
}

window.drive.on('session:expired', async () => {
  toast('Сесія завершилась — увійдіть знову', 'error');
  show(await window.drive.getSession());
});

// Файли, кинуті повз зону завантаження, не повинні відкриватися у вікні.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

show(await window.drive.getSession());
