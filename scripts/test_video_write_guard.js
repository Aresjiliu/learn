const assert = require('assert')
const fs = require('fs')

const source = fs.readFileSync('pages/course/video/video.js', 'utf8')
assert.ok(source.includes('!config.enableRemoteWrites || !wx.getStorageSync(\'token\')'))
assert.ok(source.includes('saveVideoProgress(wx, videoId, progress)'))
console.log('video write guard tests: PASS')
