const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let botProcess;

function createWindow(){
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0b0b0f',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadURL('http://localhost:3000/dashboard');
}

function startBot(){
  const cwd = __dirname;
  botProcess = spawn(process.execPath, ['bot.js'], { cwd, stdio: 'inherit' });
}

app.whenReady().then(()=>{
  startBot();
  createWindow();

  app.on('activate', ()=>{
    if(BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', ()=>{
  if(process.platform !== 'darwin') app.quit();
});

app.on('quit', ()=>{
  try{ botProcess && botProcess.kill(); } catch {}
});
