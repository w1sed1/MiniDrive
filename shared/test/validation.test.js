import { describe, expect, it } from 'vitest';
import { getExtension, normalizeVisibleColumns, previewKind, validateFileName, validatePassword, validateUsername } from '../src/index.js';

describe('валідація', () => {
  it('логін', () => {
    expect(validateUsername('olena')).toBeNull();
    expect(validateUsername('ol')).toMatch(/3–32/);
    expect(validateUsername('олена')).not.toBeNull();
    expect(validateUsername('')).toBe('Вкажіть логін');
  });

  it('пароль', () => {
    expect(validatePassword('secret1')).toBeNull();
    expect(validatePassword('123')).not.toBeNull();
  });

  it('назва файлу', () => {
    expect(validateFileName('Звіт 2026.txt')).toBeNull();
    expect(validateFileName('../etc/passwd')).not.toBeNull();
    expect(validateFileName('a:b.txt')).not.toBeNull();
    expect(validateFileName(' a.txt')).not.toBeNull();
    expect(validateFileName('..')).not.toBeNull();
    expect(validateFileName('x'.repeat(256))).not.toBeNull();
  });
});

describe('типи файлів варіанту (5: .js, .png)', () => {
  it('розширення', () => {
    expect(getExtension('a.Tar.GZ')).toBe('.gz');
    expect(getExtension('.env')).toBe('');
    expect(getExtension('README')).toBe('');
  });

  it('вміст показується лише для .js (текст) і .png (зображення)', () => {
    expect(previewKind('app.js')).toBe('text');
    expect(previewKind('LOGO.PNG')).toBe('image');
    expect(previewKind('photo.jpg')).toBeNull();
    expect(previewKind('notes.txt')).toBeNull();
  });

  it('стовпець «Назва» не можна приховати', () => {
    expect(normalizeVisibleColumns(['size'])).toEqual(['name', 'size']);
    expect(normalizeVisibleColumns([])).toEqual(['name']);
  });
});
