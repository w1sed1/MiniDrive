// Ці ключі задаються як властивості DOM: атрибут value, наприклад, не змінює вміст <textarea>.
const DOM_PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'spellcheck']);

/** Мінімальний помічник для створення DOM: h('div', { class: 'x', onclick }, ...children). */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (DOM_PROPS.has(key)) el[key] = value;
    else if (value !== false) el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const PATHS = {
  upload: 'M12 16V4m0 0l-5 5m5-5l5 5M4 20h16',
  download: 'M12 4v12m0 0l-5-5m5 5l5-5M4 20h16',
  rename: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  replace: 'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4',
  share: 'M16 11a3 3 0 100-6 3 3 0 000 6zM8 13a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  sync: 'M4 10a8 8 0 0114-4l2 2M20 14a8 8 0 01-14 4l-2-2M20 4v4h-4M4 20v-4h4',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  columns: 'M4 5h16v14H4zM10 5v14M15 5v14',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  code: 'M6 3h8l5 5v13H6zM14 3v5h5M10 12l-2 2.5 2 2.5M14 12l2 2.5-2 2.5',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 100-.01',
  text: 'M6 3h8l5 5v13H6zM14 3v5h5M9 12h6M9 15h6M9 18h4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  check: 'M5 12l5 5 9-10',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM3 21c0-4 3-6 6-6s6 2 6 6M17 11a3 3 0 100-6M21 21c0-3-2-5-4-5.5',
  cloud: 'M7 18a5 5 0 01-.8-9.9A6 6 0 0118 9a4.5 4.5 0 01-.5 9z',
  sortAsc: 'M4 6h9M4 12h6M4 18h3M17 18V6m0 0l-3 3m3-3l3 3',
  sortDesc: 'M4 6h3M4 12h6M4 18h9M17 6v12m0 0l-3-3m3 3l3-3',
};

export function icon(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
  return span;
}

/** Українська множина: plural(2, 'зміна', 'зміни', 'змін') → 'зміни'. */
export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function fileIconName(ext) {
  if (ext === '.js') return 'code';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
  if (['.txt', '.md', '.json', '.csv'].includes(ext)) return 'text';
  return 'file';
}

// ------------------------------------------------------------------ сповіщення
export function toast(text, type = 'info') {
  const box = document.getElementById('toasts');
  const el = h('div', { class: `toast toast--${type}`, role: 'status' }, text);
  box.append(el);
  setTimeout(() => el.classList.add('toast--hide'), 3600);
  setTimeout(() => el.remove(), 4000);
}

// ------------------------------------------------------------------ модальні вікна
export function openModal({ title, body, actions = [], onClose }) {
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const overlay = h(
    'div',
    { class: 'modal-overlay', onmousedown: (e) => e.target === overlay && close() },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal__head' }, h('h2', {}, title), h('button', { class: 'btn btn--icon', title: 'Закрити', onclick: close }, icon('close'))),
      h('div', { class: 'modal__body' }, body),
      actions.length
        ? h(
            'div',
            { class: 'modal__actions' },
            actions.map((a) => h('button', { class: `btn ${a.primary ? 'btn--primary' : ''}`, type: a.type ?? 'button', form: a.form, onclick: a.onClick ? () => a.onClick(close) : undefined }, a.label)),
          )
        : null,
    ),
  );
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  overlay.querySelector('input')?.focus();
  return close;
}

/** Діалог з одним полем. Повертає введений рядок або null. validate(value) → текст помилки | null. */
export function promptModal({ title, label, value = '', okLabel = 'OK', validate, selectStem = false }) {
  return new Promise((resolve) => {
    let result = null;
    const error = h('div', { class: 'field__error' });
    const input = h('input', { class: 'input', value, spellcheck: false });
    const form = h(
      'form',
      {
        id: 'prompt-form',
        onsubmit: (e) => {
          e.preventDefault();
          const v = input.value;
          const msg = validate?.(v);
          if (msg) {
            error.textContent = msg;
            input.focus();
            return;
          }
          result = v;
          close();
        },
      },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), input, error),
    );
    const close = openModal({
      title,
      body: form,
      actions: [{ label: 'Скасувати', onClick: (c) => c() }, { label: okLabel, primary: true, type: 'submit', form: 'prompt-form' }],
      onClose: () => resolve(result),
    });
    if (selectStem) {
      const dot = value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : value.length);
    }
  });
}
