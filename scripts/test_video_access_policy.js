const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const { records, loadService } = require('./test_video_learning_controls')
const preferences = loadService('services/playback-preferences.js', 'getPlaybackPreferences,savePlaybackPreferences')

const source = fs.readFileSync('pages/course/video/video.js', 'utf8')
  .replace("import request from '../../../utils/request'", 'const request = () => Promise.resolve({})')
  .replace("import { getCourseDetail } from '../../../services/course'", 'const getCourseDetail = () => Promise.resolve({})')
  .replace("import { shouldPersistProgress } from '../../../services/playback'", 'const shouldPersistProgress = () => false')
  .replace(/^import .*playback-progress.*$/gm, '')
  .replace(/^import .*playback-preferences.*$/gm, '')
  .replace("import config from '../../../config'", "const config = { devMediaBaseUrl: 'http://127.0.0.1:18090', enableRemoteWrites: false }")

let definition
vm.runInNewContext(source, {
  ...records, ...preferences,
  Page(value) { definition = value },
  wx: { getStorageSync: () => '', setData: () => {} }
})

const page = { ...definition, data: { hasPurchased: false } }
assert.strictEqual(page.isPlayableWithoutPurchase({ isPreview: true }, 1), true)
assert.strictEqual(page.isPlayableWithoutPurchase({ isPreview: false }, 0), false)
assert.strictEqual(page.isPlayableWithoutPurchase({}, 0), true)
assert.strictEqual(page.isPlayableWithoutPurchase({}, 1), false)
assert.strictEqual(page.isPlayableWithoutPurchase({ isPreview: null }, 0), true)
assert.strictEqual(page.isPlayableWithoutPurchase({ isPreview: null }, 1), false)

page.data = {
  hasPurchased: false,
  currentVideo: { id: 'v1' },
  chapters: [{ videos: [
    { id: 'v1', url: 'one.mp4', isPreview: true },
    { id: 'v2', url: 'two.mp4', isPreview: true }
  ] }, { videos: [{ id: 'v3', url: 'three.mp4', isPreview: false }] }]
}
assert.strictEqual(page.findNextPlayableVideo().id, 'v2')

page.data.hasPurchased = true
assert.strictEqual(page.findNextPlayableVideo().id, 'v2')
page.data.currentVideo = { id: 'v2' }
assert.strictEqual(page.findNextPlayableVideo().id, 'v3')
assert.ok(source.includes('!hasPurchased && !this.isPlayableWithoutPurchase(match, chapterIndex)'))
assert.ok(source.includes('!video.url || (!hasPurchased && !this.isPlayableWithoutPurchase(video, chapterIndex))'))
console.log('video access policy tests: PASS')
