import { VARIANT, formatDateTime, formatSize, previewKind } from '@minidrive/shared';
import { fileIconName, h, icon, toast } from './ui.js';

/**
 * Панель перегляду: атрибути файлу і вміст для .js (текст, можна редагувати) та .png (зображення).
 * Повертає { el, show(file) }.
 */
export function createPreview({ onSaved }) {
  const el = h('aside', { class: 'preview' });
  let current = null;
  let requestId = 0;

  function attr(label, value) {
    return [h('dt', {}, label), h('dd', {}, value ?? '—')];
  }

  function header(file) {
    return h(
      'div',
      { class: 'preview__head' },
      h('div', { class: `file-badge file-badge--${fileIconName(file.ext)}` }, icon(fileIconName(file.ext), 22)),
      h('div', { class: 'preview__title' }, h('h3', { title: file.name }, file.name), h('span', { class: 'muted' }, file.isOwner ? 'Мій файл' : `Спільний · власник ${file.owner}`)),
    );
  }

  function attributes(file) {
    return h(
      'dl',
      { class: 'attrs' },
      attr('Розмір', formatSize(file.size)),
      attr('Тип', file.ext || 'без розширення'),
      attr('Створено', formatDateTime(file.createdAt)),
      attr('Змінено', formatDateTime(file.updatedAt)),
      attr('Завантажив', file.uploadedBy),
      attr('Редагував', file.editedBy),
      attr('Власник', file.owner),
      file.isOwner ? attr('Доступ', file.shareCount ? `${file.shareCount} корист.` : 'лише я') : null,
    );
  }

  function textView(file, text) {
    const body = h('div', { class: 'preview__content' });
    const showCode = () => {
      const lines = text.split('\n');
      body.replaceChildren(
        h('div', { class: 'preview__bar' }, h('span', { class: 'muted' }, `${lines.length} рядків · UTF-8`), h('button', { class: 'btn btn--sm', onclick: edit }, icon('edit', 14), 'Редагувати')),
        h('pre', { class: 'code' }, lines.map((line) => h('code', {}, line || ' '))),
      );
    };
    const edit = () => {
      const area = h('textarea', { class: 'code-editor', spellcheck: false, value: text });
      const save = async () => {
        try {
          const updated = await window.drive.saveText(file.id, area.value);
          text = area.value;
          toast(`Збережено нову версію «${file.name}»`, 'success');
          onSaved(updated);
        } catch (e) {
          toast(e.message, 'error');
        }
      };
      body.replaceChildren(
        h('div', { class: 'preview__bar' }, h('span', { class: 'muted' }, 'Редагування'), h('div', { class: 'btn-group' }, h('button', { class: 'btn btn--sm', onclick: showCode }, 'Скасувати'), h('button', { class: 'btn btn--sm btn--primary', onclick: save }, icon('check', 14), 'Зберегти'))),
        area,
      );
      area.focus();
    };
    showCode();
    return body;
  }

  async function show(file) {
    const id = ++requestId;
    current = file;
    if (!file) {
      el.replaceChildren(h('div', { class: 'preview__empty' }, icon('file', 36), h('p', {}, 'Виберіть файл, щоб переглянути атрибути'), h('p', { class: 'muted' }, `Вміст показується для ${[...VARIANT.previewText, ...VARIANT.previewImage].join(' та ')}`)));
      return;
    }
    const kind = previewKind(file.name);
    const content = h('div', { class: 'preview__content preview__content--loading' }, kind ? 'Завантаження вмісту…' : null);
    el.replaceChildren(header(file), attributes(file), content);
    if (!kind) {
      content.className = 'preview__content preview__note';
      content.textContent = `Перегляд вмісту доступний для файлів ${[...VARIANT.previewText, ...VARIANT.previewImage].join(' і ')} (варіант 5).`;
      return;
    }
    try {
      const data = await window.drive.preview(file.id);
      if (id !== requestId) return; // користувач уже вибрав інший файл
      if (data.kind === 'text') {
        content.replaceWith(data.text === null ? h('div', { class: 'preview__note' }, 'Файл завеликий для перегляду') : textView(file, data.text));
      } else {
        const img = h('img', { src: data.dataUrl, alt: file.name });
        const info = h('span', { class: 'muted' });
        img.addEventListener('load', () => {
          info.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
        });
        content.replaceWith(h('div', { class: 'preview__content' }, h('div', { class: 'preview__bar' }, info), h('div', { class: 'image-frame' }, img)));
      }
    } catch (e) {
      if (id === requestId) content.replaceWith(h('div', { class: 'preview__note preview__note--error' }, e.message));
    }
  }

  return { el, show, get current() { return current; } };
}
