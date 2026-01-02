const { app, BrowserWindow } = require('electron');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // アプリのタイトルを設定
    title: "My Meeting App",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // 画面共有を許可する重要な設定
      displayCapture: true 
    }
  });

  // GitHub Pagesを読み込む
  mainWindow.loadURL('https://hirosuku0925.github.io/meeting-app/');

  // 画面が真っ白で原因がわからない時は、下の行の「//」を消すと
  // ブラウザと同じ開発者ツールが開いてエラー内容が確認できます。
  // mainWindow.webContents.openDevTools();

  // メニューバーを消す（スッキリさせる）
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});