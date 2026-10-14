# MiniDrive — клієнт віддаленого диска (система типу 2, варіант 50)

Полегшена версія Google Drive: авторизація на сервері, особистий диск, перегляд атрибутів файлів,
завантаження / вивантаження / видалення, показ і приховування стовпців, синхронізація локальної папки
з віддаленою, спільний доступ і drag-n-drop.

**Варіант 50**
- тип **5**: при кліку показується вміст `.js` (як текст, з можливістю редагування) і `.png` (як зображення);
- операція **0**: сортування за назвою (зростання / спадання) і фільтр «усі файли» / «лише `.txt`, `.jpg`».

## Структура

```
shared/   спільна логіка: операції варіанту, валідація, стовпці, планувальник синхронізації, REST-клієнт
server/   REST API (Express 5, JWT, bcrypt, libSQL/SQLite або Turso, файли на диску або у Vercel Blob)
desktop/  десктоп-клієнт (Electron 44): main-процес + preload-міст + інтерфейс на vanilla JS
web/      веб-версія (React 19 + Vite 8), синхронізація через File System Access API
api/      точка входу serverless-функції для Vercel (той самий Express-застосунок)
```

## Запуск локально

```bash
npm install
npm run seed -w server     # демо-дані: olena / secret1, taras / secret1 (база створюється заново)
npm run server             # API на http://localhost:3001
npm run desktop            # десктоп-клієнт (в іншому терміналі)
npm run web                # веб-версія на http://localhost:5173
npm test                   # unit-тести (Vitest)
```

## Тести

| Файл | Що перевіряє |
|---|---|
| `shared/test/variant-operation.test.js` | **індивідуальна операція**: сортування за назвою та фільтр `.txt`/`.jpg` |
| `shared/test/sync-planner.test.js` | алгоритм двосторонньої синхронізації (конфлікти, видалення, Unicode) |
| `shared/test/validation.test.js` | валідація логіна, пароля, назви файлу; типи перегляду `.js`/`.png` |
| `server/test/api.test.js` | REST API: авторизація, завантаження, 409/overwrite, спільний доступ, ліміт розміру |
| `desktop/test/sync-engine.test.js` | синхронізація десктоп-клієнта на реальній тимчасовій папці |

## Публікація на Vercel

Один проєкт Vercel роздає веб-версію (`web/dist`) і API (`api/index.js` → `/api/*`).
Потрібні змінні середовища:

| Змінна | Звідки |
|---|---|
| `JWT_SECRET` | будь-який довгий випадковий рядок |
| `BLOB_READ_WRITE_TOKEN` | Storage → Blob → Create (Private) → Connect to project |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Marketplace → Turso → Connect to project |

```bash
vercel link
vercel env add JWT_SECRET production
vercel --prod
```

Десктоп-клієнт підключається до опублікованого сервера: у полі «Сервер» на екрані входу
вказується адреса `https://<проєкт>.vercel.app`.

Обмеження Vercel: тіло запиту до функції до ~4,5 МБ, тому на продакшні максимальний розмір файлу — 4 МБ
(`MAX_UPLOAD_MB`). Локально — 50 МБ.
