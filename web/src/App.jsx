import { useEffect, useState } from 'react';
import { api, getSession, saveSession } from './lib/api.js';
import LoginPage from './components/LoginPage.jsx';
import DrivePage from './components/DrivePage.jsx';
import { useToast } from './components/Toasts.jsx';

export default function App() {
  const [session, setSession] = useState(getSession);
  const toast = useToast();

  // Перевіряємо збережений токен при старті.
  useEffect(() => {
    if (!session) return;
    api.me().catch((e) => {
      if (e.status === 401) {
        saveSession(null);
        setSession(null);
        toast('Сесія завершилась — увійдіть знову', 'error');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (res) => {
    saveSession(res);
    setSession(res);
  };
  const logout = () => {
    saveSession(null);
    setSession(null);
  };

  return session ? <DrivePage user={session.user} onLogout={logout} /> : <LoginPage onLogin={login} />;
}
