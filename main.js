// Windows Terminal UTF-8 Zorlaması
if (process.platform === 'win32') {
    try { require('child_process').execSync('chcp 65001', { stdio: 'ignore' }); } catch (e) {}
}

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Backend sunucusunu Electron ile birlikte başlat.
// server.js yalnızca doğrudan çalıştırılınca port açar; Electron'dan start() ile
// başlatılır ve sunucu dinlemeye geçince port ile çözülen bir Promise döner.
// Arayüz (app.html — Kontrol Odası) file:// ile değil, bu sunucudan
// http://localhost:PORT üzerinden yüklenir: /api/* çağrıları göreli kalır.
const serverReady = require('./server.js').start();

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

async function createWindow() {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        // Kontrol Odası'nın kendi pencere düğmeleri yok: yerel çerçeve kullanılır
        // (eski arayüzdeki çerçevesiz pencere + IPC düğmeleri kaldırıldı).
        frame: true,
        autoHideMenuBar: true,
        backgroundColor: '#0b1117',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
        icon: fs.existsSync(iconPath) ? iconPath : undefined
    });

    Menu.setApplicationMenu(null);

    // Dış bağlantılar (mevzuat linkleri vb.) uygulama penceresinde değil tarayıcıda açılsın
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    const port = await serverReady;
    await mainWindow.loadURL(`http://localhost:${port}/app.html`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });
    // loadURL çözüldüğünde ready-to-show çoktan geçmiş olabilir
    if (!mainWindow.isVisible()) { mainWindow.show(); mainWindow.maximize(); }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});
