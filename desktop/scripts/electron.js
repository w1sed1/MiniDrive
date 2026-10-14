// Запуск Electron без ELECTRON_RUN_AS_NODE (його виставляють VS Code та інші Electron-хости,
// і тоді Electron стартує як звичайний Node без вікон).
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, process.argv.slice(2), { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
