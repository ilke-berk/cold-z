// Windows Terminal UTF-8 Zorlaması
if (process.platform === 'win32') {
    try { require('child_process').execSync('chcp 65001', { stdio: 'ignore' }); } catch (e) {}
}

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

// Backend sunucusunu Electron ile birlikte başlat
require('./server.js');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

function createWindow() {
    // Dev Note: Ensure assets directory exists if using an icon
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const fs = require('fs');
    
    // Create browser window.
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 768,
        show: false,
        frame: false,
        fullscreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: fs.existsSync(iconPath) ? iconPath : undefined
    });

    // Remove the default Electron menu for a cleaner look
    Menu.setApplicationMenu(null);

    // Kapatma, küçültme ve pencere modu IPC işlemleri
    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.close();
    });

    ipcMain.on('window-maximize-toggle', () => {
        if (!mainWindow) return;
        
        // Eğer tam ekrandaysa, önce tam ekrandan çık
        if (mainWindow.isFullScreen()) {
            mainWindow.setFullScreen(false);
            // Fullscreen'den çıkınca pencere otomatik olarak normal boyuta döner
            return;
        }
        
        // Maximize ↔ Restore toggle
        if (mainWindow.isMaximized()) {
            mainWindow.restore();
        } else {
            mainWindow.maximize();
        }
    });

    // Load the index.html of the app.
    mainWindow.loadFile('index.html');

    // Show window when ready to prevent flickering
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize(); // Start maximized
    });

    // Pencere durumu değiştiğinde frontend'e bildir (ikon güncelleme için)
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-state-changed', 'maximized');
    });
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-state-changed', 'normal');
    });
    mainWindow.on('enter-full-screen', () => {
        mainWindow.webContents.send('window-state-changed', 'fullscreen');
    });
    mainWindow.on('leave-full-screen', () => {
        mainWindow.webContents.send('window-state-changed', 'normal');
    });

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) createWindow();
});
