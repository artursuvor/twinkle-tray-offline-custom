const path = require('path')
const { build } = require('./package.json')
module.exports = {
  ...build,
  npmRebuild: false,
  directories: { ...build.directories, output: path.resolve(__dirname, '../Twinkle-Tray-Portable') },
  win: { ...build.win, signAndEditExecutable: false }
}
