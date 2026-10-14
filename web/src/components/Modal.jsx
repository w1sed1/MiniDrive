import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title="Закрити">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Діалог з одним полем; validate(value) повертає текст помилки або null. */
export function PromptModal({ title, label, initial = '', okLabel = 'OK', validate, selectStem, onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const input = inputRef.current;
    input.focus();
    const dot = initial.lastIndexOf('.');
    input.setSelectionRange(0, selectStem && dot > 0 ? dot : initial.length);
  }, [initial, selectStem]);

  async function submit(e) {
    e.preventDefault();
    const msg = validate?.(value);
    if (msg) return setError(msg);
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn btn--primary" type="submit" form="prompt-form" disabled={busy}>
            {okLabel}
          </button>
        </>
      }
    >
      <form id="prompt-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field__label">{label}</span>
          <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />
          {error && <span className="field__error">{error}</span>}
        </label>
      </form>
    </Modal>
  );
}

/** Підтвердження з довільними кнопками: buttons = [{ label, value, primary, danger }]. */
export function ChoiceModal({ title, message, buttons, checkboxLabel, onChoose }) {
  const [checked, setChecked] = useState(false);
  return (
    <Modal
      title={title}
      onClose={() => onChoose(null, false)}
      footer={buttons.map((b) => (
        <button key={b.value} className={`btn ${b.primary ? 'btn--primary' : ''} ${b.danger ? 'btn--danger' : ''}`} onClick={() => onChoose(b.value, checked)}>
          {b.label}
        </button>
      ))}
    >
      <p className="modal__text">{message}</p>
      {checkboxLabel && (
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {checkboxLabel}
        </label>
      )}
    </Modal>
  );
}
