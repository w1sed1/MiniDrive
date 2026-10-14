// Персональний варіант 50:
//   5 — типи файлів, вміст яких показується при кліку: .js (як текст) і .png (як зображення);
//   0 — сортування за назвою (зростання / спадання) + фільтр «усі файли» / «лише .txt, .jpg».
export const VARIANT = Object.freeze({
  code: '50',
  previewText: ['.js'],
  previewImage: ['.png'],
  filterExtensions: ['.txt', '.jpg'],
  sortField: 'name',
});

export const FILTER_ALL = 'all';
export const FILTER_VARIANT = 'variant';

export const FILTER_OPTIONS = [
  { value: FILTER_ALL, label: 'Усі файли' },
  { value: FILTER_VARIANT, label: `Лише ${VARIANT.filterExtensions.join(', ')}` },
];
