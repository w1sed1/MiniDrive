// Тест індивідуальної операції варіанту 50 (операція 0):
// сортування за назвою (зростання / спадання) та фільтр «усі файли» / «лише .txt, .jpg».
import { describe, expect, it } from 'vitest';
import { FILTER_ALL, FILTER_VARIANT, applyView, filterByType, sortByName } from '../src/index.js';

const files = [
  { id: '1', name: 'zebra.txt' },
  { id: '2', name: 'Apple.JPG' },
  { id: '3', name: 'file10.txt' },
  { id: '4', name: 'file2.txt' },
  { id: '5', name: 'script.js' },
  { id: '6', name: 'logo.png' },
  { id: '7', name: 'Звіт.txt' },
  { id: '8', name: 'архів.zip' },
  { id: '9', name: 'notes.txt.bak' },
  { id: '10', name: 'README' },
];
const names = (list) => list.map((f) => f.name);

describe('сортування за назвою', () => {
  it('за зростанням: без урахування регістру, числа як числа, українська локаль (кирилиця перед латиницею)', () => {
    expect(names(sortByName(files, 'asc'))).toEqual([
      'архів.zip',
      'Звіт.txt',
      'Apple.JPG',
      'file2.txt',
      'file10.txt',
      'logo.png',
      'notes.txt.bak',
      'README',
      'script.js',
      'zebra.txt',
    ]);
  });

  it('за спаданням — точно обернений порядок', () => {
    expect(names(sortByName(files, 'desc'))).toEqual(names(sortByName(files, 'asc')).reverse());
  });

  it('не змінює вхідний масив', () => {
    const copy = [...files];
    sortByName(files, 'desc');
    expect(files).toEqual(copy);
  });

  it('однакові назви впорядковуються стабільно за id', () => {
    const same = [
      { id: 'b', name: 'a.txt' },
      { id: 'a', name: 'A.txt' },
    ];
    expect(sortByName(same, 'asc').map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('відхиляє невідомий напрям', () => {
    expect(() => sortByName(files, 'up')).toThrow();
  });
});

describe('фільтр за типом', () => {
  it('«усі файли» повертає все', () => {
    expect(filterByType(files, FILTER_ALL)).toHaveLength(files.length);
  });

  it('«лише .txt, .jpg» лишає тільки ці розширення (без урахування регістру)', () => {
    expect(names(filterByType(files, FILTER_VARIANT)).sort()).toEqual(
      ['Apple.JPG', 'file10.txt', 'file2.txt', 'zebra.txt', 'Звіт.txt'].sort(),
    );
  });

  it('не плутає подвійні розширення та файли без розширення', () => {
    const result = names(filterByType(files, FILTER_VARIANT));
    expect(result).not.toContain('notes.txt.bak');
    expect(result).not.toContain('README');
  });

  it('фільтр + сортування за спаданням разом', () => {
    expect(names(applyView(files, { filter: FILTER_VARIANT, sort: 'desc' }))).toEqual([
      'zebra.txt',
      'file10.txt',
      'file2.txt',
      'Apple.JPG',
      'Звіт.txt',
    ]);
  });
});
