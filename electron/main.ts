import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#22d3ee',
      height: 30
    },
    webPreferences: {
      // vite-plugin-electron compila el preload como .mjs en dev y .js en prod
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    backgroundColor: '#09090b',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // ── Menú contextual (clic derecho) con Copiar/Pegar ──────────────────────
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const menu = new Menu();

    if (params.selectionText) {
      menu.append(new MenuItem({
        label: '✂️  Cortar',
        role: 'cut',
        enabled: params.isEditable,
      }));
      menu.append(new MenuItem({
        label: '📋  Copiar',
        role: 'copy',
      }));
    }

    menu.append(new MenuItem({
      label: '📌  Pegar',
      role: 'paste',
      enabled: params.isEditable,
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: '🔍  Seleccionar todo',
      role: 'selectAll',
      enabled: params.isEditable,
    }));

    menu.popup({ window: mainWindow! });
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC: Abrir selector de carpeta nativo ──────────────────────────────────
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Seleccionar Carpeta de Descarga'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ── IPC: Descargar video real con yt-dlp ──────────────────────────────────
ipcMain.handle('download-video', async (event, url: string, options: any) => {
  const { folder, quality, format } = options;
  const outputFolder = folder || path.join(os.homedir(), 'Downloads');

  // Construir argumentos de yt-dlp
  const args: string[] = [];

  if (format === 'audio') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    // Seleccionar calidad de video
    const qualityMap: Record<string, string> = {
      best: 'bestvideo+bestaudio/best',
      '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
    };
    args.push('-f', qualityMap[quality] ?? qualityMap['best']);
    args.push('--merge-output-format', 'mp4');
  }

  // Carpeta y nombre del archivo de salida
  args.push('-o', path.join(outputFolder, '%(title)s.%(ext)s'));
  // Progreso en formato legible por máquina
  args.push('--newline', '--progress');
  args.push(url);

  return new Promise((resolve, reject) => {
    // Buscar yt-dlp: primero rutas conocidas, luego PATH
    const candidatePaths = [
      `${os.homedir()}\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe`,
      `C:\\Program Files\\yt-dlp\\yt-dlp.exe`,
      `C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe`,
      'yt-dlp', // fallback al PATH
    ];

    let ytdlpBin = 'yt-dlp';
    for (const p of candidatePaths) {
      if (p === 'yt-dlp') { ytdlpBin = p; break; }
      if (fs.existsSync(p)) { ytdlpBin = p; break; }
    }

    const proc = spawn(ytdlpBin, args, { shell: false });
    let lastTitle = '';

    proc.stdout.on('data', (data: Buffer) => {
      const line = data.toString();

      // Parsear el título del video
      const titleMatch = line.match(/\[info\].*Destination: (.+)/);
      if (titleMatch) lastTitle = path.basename(titleMatch[1]);

      // Parsear el porcentaje de progreso
      const progressMatch = line.match(/(\d+\.\d+)%/);
      if (progressMatch && mainWindow) {
        const pct = parseFloat(progressMatch[1]);
        const speedMatch = line.match(/at\s+([\d.]+\w+\/s)/);
        const etaMatch = line.match(/ETA\s+([\d:]+)/);
        mainWindow.webContents.send('download-progress', {
          percent: pct,
          speed: speedMatch?.[1] ?? '',
          eta: etaMatch?.[1] ?? '',
          title: lastTitle,
        });
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      console.error('[yt-dlp stderr]', data.toString());
    });

    proc.on('close', (code) => {
      if (code === 0) {
        if (mainWindow) {
          mainWindow.webContents.send('download-progress', {
            percent: 100,
            speed: '',
            eta: '',
            title: lastTitle,
            done: true,
          });
        }
        resolve({ success: true });
      } else {
        reject(new Error(`yt-dlp terminó con código ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
});
