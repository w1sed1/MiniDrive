// Приклад JS-файлу для попереднього перегляду (варіант 5: .js показується як текст)
import { readFile } from 'node:fs/promises';

const greet = (name) => `Привіт, ${name}!`;

export async function loadConfig(path) {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text);
}

console.log(greet('MiniDrive'));
