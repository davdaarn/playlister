const {
  ipcMain,
  webContents
} = require('electron');

const {
  Worker
} = require('worker_threads');

const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const mm = require('music-metadata');
const sharp = require('sharp');
const util = require('util');
const Vibrant = require('node-vibrant');
const buffer = require('buffer');

import {
  datastore
} from '../../shared/datastore'


const db = datastore.getInstance();

import {
  mainAppWindow
} from '../../shared/mainAppWindow';

let win = null;

let songsToProcess = [];
let processingSongs = false;

// watchdog
let watcher = setInterval(() => {
  // console.log('watcher');
  if (songsToProcess.length > 0 && !processingSongs) {
    processingSongs = true;
    console.log(chalk.redBright('starting'), Date());
    processSongs();
  }
}, 1000);

const processSongs = () => {
  if (songsToProcess.length > 0) {

    const p = songsToProcess.pop();
    let tempPalette = {
      Vibrant: {
        _rgb: [212.49999999999997, 58.43750000000002, 42.50000000000002],
        _population: 0
      },
      DarkVibrant: {
        _rgb: [40, 11, 8],
        _population: 21,
        _hsl: [0.015625, 0.6666666666666666, 0.09411764705882353]
      },
      LightVibrant: {
        _rgb: [195, 236, 251],
        _population: 29,
        _hsl: [0.5446428571428571, 0.875, 0.8745098039215686]
      },
      Muted: {
        _rgb: [106, 143, 122],
        _population: 193,
        _hsl: [0.40540540540540543, 0.14859437751004012, 0.4882352941176471]
      },
      DarkMuted: {
        _rgb: [54, 77, 60],
        _population: 231,
        _hsl: [0.3768115942028986, 0.17557251908396945, 0.2568627450980392]
      },
      LightMuted: {
        _rgb: [153, 209, 208],
        _population: 200,
        _hsl: [0.49702380952380953, 0.37837837837837834, 0.7098039215686274]
      }
    };

    // todo song creation should not be aborted if album art is bad
    (async () => {
      try {
        const metadata = await mm.parseFile(p, {
          skipCovers: false
        });
        const {
          common,
          format
        } = metadata;

        // const cover = false;
        const cover = await mm.selectCover(common.picture);

        let image64 = null;
        let image256 = null;
        let colorPalette = null;

        if (cover) {
          image64 = await (await sharp(cover.data).resize(64, 64, {}).jpeg().toBuffer()).toString('base64');
          image256 = await (await sharp(cover.data).resize(256, 256, {}).jpeg().toBuffer()).toString('base64');

          await Vibrant.from(cover.data).getPalette().then(palette => {
            // console.log(palette);
            tempPalette = {}
            Object.keys(palette).forEach(key => {
              tempPalette[key] = {
                hex: palette[key].hex,
                rgb: palette[key].rgb,
              }
            });
            // console.log(tempPalette);
            colorPalette = tempPalette;
          });

        }

        if (!cover || !image64 || !image256) {
          let imagePath64 = path.join(__static, '/placeholder64.jpg');
          let imagePath256 = path.join(__static, '/placeholder256.jpg');
          // console.log(imagePath64);

          image64 = fs.readFileSync(imagePath64, {
            encoding: 'base64'
          });
          image256 = fs.readFileSync(imagePath256, {
            encoding: 'base64'
          });

          // console.log(file64)

          // image64 = await (await sharp(file64).resize(64, 64, {}).jpeg().toBuffer()).toString('base64');
          // image256 = await (await sharp(file256).resize(256, 256, {}).jpeg().toBuffer()).toString('base64');

          // await Vibrant.from(image256).getPalette().then(palette => {
          //   console.log(palette);

          //   Object.keys(palette).forEach(key => {
          //     tempPalette[key] = {
          //       hex: palette[key].hex,
          //       rgb: palette[key].rgb,
          //     }
          //   });
          //   // console.log(tempPalette);
          //   colorPalette = tempPalette;
          // }).catch(error => {
          //   console.log(error);
          // });
        }


        const album = common.album ? common.album : '';
        const artist = common.artist ? common.artist : '';
        const diskNumber = common.disk ? common.disk : '';
        const genre = common.genre ? common.genre : '';
        // format, // to be determined
        const length = format.duration ? format.duration : '';
        // const path = p;
        const rating = 0;
        const tags = [];
        // Todo: if title is bad, use path to get title
        const title = common.title ? common.title : '';
        const trackNumber = common.track ? common.track : '';
        const year = common.year ? common.year : '';
        const albumArt = {
          format: cover ? cover.format : null,
          image64: image64 ? image64 : null,
          image256: image256 ? image256 : null,
        }

        // Todo: better id generation
        const uid = `${title}${album}${artist}`;

        const song = {
          id: uid,
          album,
          albumArt,
          artist,
          colorPalette,
          diskNumber,
          genre,
          path: p,
          length,
          rating,
          tags,
          title,
          trackNumber,
          year
        };

        // todo: make function // processNewSong(song);
        db.songs.find({
          _id: uid
        }, (err, docs) => {
          if (err) {
            console.warn(err);
          } else if (docs.length > 1) {
            console.error("Entities should have unique id's"); // This should never happen
          } else if (docs.length === 1) {
            const exists = docs[0].songs.some(x => x.path === song.path); // check for existing file path
            if (!exists) {
              // update doc
              db.songs.update({
                  _id: uid
                }, {
                  $push: {
                    songs: song
                  }
                },
                (err, numEffected, param3, param4) => {
                  if (err) {
                    console.error('db error updating song', err);
                  } else if (numEffected === 0 || numEffected > 1) {
                    console.error('Error updating document'); // Something went wrong
                  } else {
                    // this.existingSongs++;
                    win.webContents.send('ham', `------- ${songsToProcess.length}`);
                    processSongs();
                  }
                }
              );
            } else {
              console.warn('song already in library');
              win.webContents.send('ham', `0000000 ${songsToProcess.length}`);
              processSongs();
            }
            // processSongs();
          } else {
            // insert new doc
            const songContainer = {
              _id: uid,
              songs: [song]
            };
            db.songs.insert(songContainer, (err, newDoc) => {
              if (err) {
                console.error('this should not be happening', err);
              } else {
                // this.songsAdded++;
                win.webContents.send('ham', `+++++++ ${songsToProcess.length}`);
                processSongs();
              }
            });
          }
        });
      } catch (err) {
        console.error(err.message);
        processingSongs = false;
      }
    })();
  } else {
    console.log(chalk.redBright('exiting'), Date());
    processingSongs = false;
  }
}

function runService(workerData) {
  win = mainAppWindow.getInstance();
  return new Promise((resolve, reject) => {
    const worker = new Worker('./src/main/workers/discoveryWorker.js', {
      workerData
    });

    worker.on('message', (data) => {
      // console.log(data);
      // win.webContents.send('ham', data);
      songsToProcess.push(...data.filePaths);
      return resolve('ten tons of ham burgers');
    });
    worker.on('error', (data) => {
      console.log(data);
      win.webContents.send('ham', 'hairy baby');
      return reject('oh snap!!!');
    });
    worker.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`Worker Thread stopped with exit code: ${code}`));
      } else {
        console.log(chalk.green('all done'));
      }
    });
  })
}

ipcMain.handle('FIND_SONGS', async (event, args) => {
  runService(args).then(x => {
    console.log(x);
  }).catch(err => {
    console.log(err)
  });
})

ipcMain.handle('LOAD_LIBRARY', async (even, args) => {
  let res = 'poo';
  res = await new Promise((resolve, reject) => {
    db.songs.find({}, (err, docs) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(docs);
      }
    });
  })
  return res;
})
