import { validateUsername } from '@minidrive/shared';
import { h, icon, openModal, toast } from './ui.js';

/** Керування доступом до файлу: список користувачів + додавання за логіном. */
export async function openShareDialog(file, onChanged) {
  const list = h('ul', { class: 'share-list' });
  const input = h('input', { class: 'input', placeholder: 'Логін користувача', spellcheck: false });
  const error = h('div', { class: 'field__error' });

  function renderList(shares) {
    list.replaceChildren(
      ...(shares.length
        ? shares.map((s) =>
            h(
              'li',
              {},
              h('span', { class: 'avatar avatar--sm' }, s.username[0].toUpperCase()),
              h('span', { class: 'share-list__name' }, s.username),
              h(
                'button',
                {
                  class: 'btn btn--ghost btn--sm',
                  onclick: async () => {
                    renderList(await window.drive.unshare(file.id, s.userId));
                    onChanged();
                  },
                },
                'Забрати доступ',
              ),
            ),
          )
        : [h('li', { class: 'share-list__empty' }, 'Поки що доступ має лише власник')]),
    );
  }

  const form = h(
    'form',
    {
      class: 'share-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const username = input.value.trim();
        const msg = validateUsername(username);
        if (msg) {
          error.textContent = msg;
          return;
        }
        try {
          renderList(await window.drive.share(file.id, username));
          input.value = '';
          error.textContent = '';
          toast(`Доступ надано: ${username}`, 'success');
          onChanged();
        } catch (err) {
          error.textContent = err.message;
        }
      },
    },
    h('div', { class: 'share-form__row' }, input, h('button', { class: 'btn btn--primary', type: 'submit' }, icon('users'), 'Надати доступ')),
    error,
  );

  openModal({
    title: `Доступ до «${file.name}»`,
    body: h('div', {}, h('p', { class: 'muted' }, 'Користувачі з доступом бачать файл у своєму диску і можуть його редагувати. Видаляти може лише власник.'), form, list),
    actions: [{ label: 'Готово', primary: true, onClick: (c) => c() }],
  });
  try {
    renderList(await window.drive.listShares(file.id));
  } catch (err) {
    error.textContent = err.message;
  }
}
