import { useEffect, useState } from 'react';
import { validateUsername } from '@minidrive/shared';
import { api } from '../lib/api.js';
import { Modal } from './Modal.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toasts.jsx';

export default function ShareModal({ file, onClose, onChanged }) {
  const toast = useToast();
  const [shares, setShares] = useState(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listShares(file.id).then(setShares, (e) => setError(e.message));
  }, [file.id]);

  async function add(e) {
    e.preventDefault();
    const name = username.trim();
    const msg = validateUsername(name);
    if (msg) return setError(msg);
    try {
      setShares(await api.shareFile(file.id, name));
      setUsername('');
      setError(null);
      toast(`Доступ надано: ${name}`, 'success');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(userId) {
    setShares(await api.unshareFile(file.id, userId));
    onChanged();
  }

  return (
    <Modal title={`Доступ до «${file.name}»`} onClose={onClose} footer={<button className="btn btn--primary" onClick={onClose}>Готово</button>}>
      <p className="modal__text muted">Користувачі з доступом бачать файл у своєму диску та можуть редагувати його вміст. Видаляти може лише власник.</p>
      <form className="share-form" onSubmit={add}>
        <input className="input" placeholder="Логін користувача" value={username} onChange={(e) => setUsername(e.target.value)} spellCheck={false} />
        <button className="btn btn--primary" type="submit">
          <Icon name="share" size={16} /> Надати доступ
        </button>
      </form>
      {error && <p className="field__error">{error}</p>}
      <ul className="share-list">
        <li>
          <span className="avatar avatar--sm">{file.owner[0].toUpperCase()}</span>
          <span className="grow">{file.owner}</span>
          <span className="muted">власник</span>
        </li>
        {shares?.map((s) => (
          <li key={s.userId}>
            <span className="avatar avatar--sm avatar--alt">{s.username[0].toUpperCase()}</span>
            <span className="grow">{s.username}</span>
            <button className="btn btn--ghost btn--sm" onClick={() => remove(s.userId)}>
              Забрати доступ
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
