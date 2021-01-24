'use strict'

import {
  app,
  protocol,
  BrowserWindow,
  WebContents
} from 'electron';

import {
  createProtocol
} from 'vue-cli-plugin-electron-builder/lib';

import installExtension, {
  VUEJS_DEVTOOLS
} from 'electron-devtools-installer';



const isDevelopment = process.env.NODE_ENV !== 'production';
const drivelist = require('drivelist');
const electron = require('electron');
const mm = require('music-metadata');
const util = require('util');
const NodeID3 = require('node-id3');
const NodeID3Promise = require('node-id3').Promise;
const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const sharp = require('sharp');
const {
  ipcMain,
  webContents
} = require('electron');
const ipc = electron.ipcMain;
const DataStore = require('nedb');
const {
  Worker
} = require('worker_threads');
const {
  logStuff
} = require('./utils/test');


// handlers
import './app';

import {
  mainAppWindow
} from './shared/mainAppWindow';


ipcMain.handle('getPathToAppData', async (event, args) => {
  return app.getPath('appData');
})

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    secure: true,
    standard: true
  }
}])

async function createWindow() {
  // Create the browser window.
  let win = mainAppWindow.getInstance();
  win.menuBarVisible = false;

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) {
      win.webContents.openDevTools();
    }
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
  }

}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  // const appData = app.getPath('appData');
  // const db = {};
  // db.playlists = new DataStore({
  //   filename: `${appData}/playlister/db/playlists.db`,
  //   autoload: true
  // });
  // db.songs = new DataStore({
  //   filename: `${appData}/playlister/db/songs.db`,
  //   autoload: true
  // });

  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS_DEVTOOLS)
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }

  const protocolName = 'safe-file-protocol'

  protocol.registerFileProtocol(protocolName, (request, callback) => {
    const url = request.url.replace(`${protocolName}://`, '')
    try {
      return callback(decodeURIComponent(url))
    } catch (error) {
      // Handle the error as needed
      console.error(error)
    }
  })

  createWindow();
  // new Worker('./worker.js');
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}
