import { useState } from 'react';
import { validatePassword, validateUsername } from '@minidrive/shared';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', password2: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const username = form.username.trim();
    let msg = validateUsername(username);
    if (!msg && mode === 'register') {
      msg = validatePassword(form.password) ?? (form.password !== form.password2 ? 'Паролі не збігаються' : null);
    }
    if (!msg && !form.password) msg = 'Вкажіть пароль';
    if (msg) return setError(msg);
    setBusy(true);
    setError(null);
    try {
      const res = mode === 'login' ? await api.login(username, form.password) : await api.register(username, form.password);
      onLogin(res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth__hero">
        <div className="brand brand--light">
          <span className="brand__logo">
            <Icon name="cloud" size={22} />
          </span>
          MiniDrive
        </div>
        <h1>Ваші файли — у будь-якому браузері</h1>
        <p>Завантажуйте, переглядайте та синхронізуйте файли з віддаленим диском. Перетягуйте файли прямо у вікно.</p>
        <ul className="auth__features">
          <li>Перегляд .js і .png одним кліком</li>
          <li>Сортування за назвою та фільтр .txt / .jpg</li>
          <li>Синхронізація локальної папки</li>
          <li>Спільний доступ і редагування</li>
        </ul>
      </section>
      <section className="auth__panel">
        <form className="auth__card" onSubmit={submit} noValidate>
          <h2>{mode === 'login' ? 'Вхід' : 'Створення акаунта'}</h2>
          <p className="muted">{mode === 'login' ? 'Увійдіть, щоб відкрити свій диск' : 'Логін: латиниця, цифри, «_», «.», «-»'}</p>
          <label className="field">
            <span className="field__label">Логін</span>
            <input className="input" name="username" autoComplete="username" value={form.username} onChange={set('username')} autoFocus />
          </label>
          <label className="field">
            <span className="field__label">Пароль</span>
            <input className="input" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} />
          </label>
          {mode === 'register' && (
            <label className="field">
              <span className="field__label">Повторіть пароль</span>
              <input className="input" name="password2" type="password" autoComplete="new-password" value={form.password2} onChange={set('password2')} />
            </label>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
            {busy ? 'Зачекайте…' : mode === 'login' ? 'Увійти' : 'Зареєструватися'}
          </button>
          <p className="auth__switch">
            {mode === 'login' ? 'Немає акаунта?' : 'Вже є акаунт?'}{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Зареєструватися' : 'Увійти'}
            </button>
          </p>
          <p className="auth__hint">Демо: olena / secret1, taras / secret1</p>
        </form>
      </section>
    </div>
  );
}
