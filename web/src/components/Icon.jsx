const PATHS = {
  upload: 'M12 16V4m0 0l-5 5m5-5l5 5M4 20h16',
  download: 'M12 4v12m0 0l-5-5m5 5l5-5M4 20h16',
  rename: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  replace: 'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4',
  share: 'M9 11a4 4 0 100-8 4 4 0 000 8zM3 21c0-4 3-6 6-6s6 2 6 6M17 11a3 3 0 100-6M21 21c0-3-2-5-4-5.5',
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
  cloud: 'M7 18a5 5 0 01-.8-9.9A6 6 0 0118 9a4.5 4.5 0 01-.5 9z',
  sortAsc: 'M4 6h9M4 12h6M4 18h3M17 18V6m0 0l-3 3m3-3l3 3',
  sortDesc: 'M4 6h3M4 12h6M4 18h9M17 6v12m0 0l-3-3m3 3l3-3',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  drive: 'M4 15l4-10h8l4 10M4 15v4h16v-4M4 15h16M16 17h.01',
};

export default function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function fileIconName(ext) {
  if (ext === '.js') return 'code';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
  if (['.txt', '.md', '.json', '.csv'].includes(ext)) return 'text';
  return 'file';
}
