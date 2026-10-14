import { validatePassword, validateUsername } from '@minidrive/shared';
import { h, icon } from './ui.js';

/** Екран входу / реєстрації. onSuccess(session) викликається після успішної авторизації. */
export function renderLogin(root, session, onSuccess) {
  let mode = 'login';
  const errorBox = h('div', { class: 'form-error', role: 'alert' });
  const server = h('input', { class: 'input', name: 'server', value: session.serverUrl, spellcheck: false });
  const username = h('input', { class: 'input', name: 'username', autocomplete: 'username', spellcheck: false });
  const password = h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password' });
  const password2 = h('input', { class: 'input', name: 'password2', type: 'password', autocomplete: 'new-password' });
  const repeatField = h('label', { class: 'field', hidden: true }, h('span', { class: 'field__label' }, 'Повторіть пароль'), password2);
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Увійти');
  const tabs = ['login', 'register'].map((m) =>
    h('button', { type: 'button', class: 'tab', dataset: { mode: m }, onclick: () => setMode(m) }, m === 'login' ? 'Вхід' : 'Реєстрація'),
  );

  function setMode(m) {
    mode = m;
    tabs.forEach((t) => t.classList.toggle('tab--active', t.dataset.mode === m));
    repeatField.hidden = m !== 'register';
    submit.textContent = m === 'login' ? 'Увійти' : 'Створити акаунт';
    password.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    errorBox.textContent = '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    errorBox.textContent = '';
    const form = { serverUrl: server.value.trim(), username: username.value.trim(), password: password.value };
    let error = !/^https?:\/\/\S+$/.test(form.serverUrl) ? 'Адреса сервера має починатися з http:// або https://' : null;
    error ??= validateUsername(form.username);
    if (mode === 'register') {
      error ??= validatePassword(form.password);
      if (!error && form.password !== password2.value) error = 'Паролі не збігаються';
    } else if (!error && !form.password) error = 'Вкажіть пароль';
    if (error) {
      errorBox.textContent = error;
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Зачекайте…';
    try {
      onSuccess(mode === 'login' ? await window.drive.login(form) : await window.drive.register(form));
    } catch (err) {
      setMode(mode); // відновлює підпис кнопки (і очищає помилку), тому помилку показуємо після
      errorBox.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  }

  root.replaceChildren(
    h(
      'div',
      { class: 'login' },
      h('div', { class: 'login__drag' }),
      h(
        'form',
        { class: 'login__card', onsubmit: onSubmit, novalidate: true },
        h('div', { class: 'login__brand' }, h('div', { class: 'logo' }, icon('cloud', 22)), h('div', {}, h('h1', {}, 'MiniDrive'), h('p', {}, 'Десктоп-клієнт віддаленого диска'))),
        h('div', { class: 'tabs' }, tabs),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Сервер'), server),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Логін'), username),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Пароль'), password),
        repeatField,
        errorBox,
        submit,
        h('p', { class: 'login__hint' }, 'Демо-акаунти: olena / secret1, taras / secret1'),
      ),
    ),
  );
  setMode('login');
  username.focus();
}
