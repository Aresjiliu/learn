const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const progressSource = fs.readFileSync('services/playback-progress.js', 'utf8').replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const progressContext = { module: { exports: {} } }
vm.runInNewContext(`${progressSource}\nmodule.exports = { getRecentVideo, saveRecentVideo, getVideoProgress, saveVideoProgress }`, progressContext)
const progress = progressContext.module.exports
const values = {}
const wx = {
    getStorageSync(key) { return values[key] },
    setStorageSync(key, value) { values[key] = value },
    hideLoading() {}
}
let definition
const videoSource = fs.readFileSync('pages/course/video/video.js', 'utf8').replace(/^import .*$/gm, '')
vm.runInNewContext(videoSource, {
    Page(value) { definition = value },
    wx,
    getVideoProgress: progress.getVideoProgress,
    saveVideoProgress: progress.saveVideoProgress,
    saveRecentVideo: progress.saveRecentVideo,
    getCourseDetail: () => Promise.resolve({}),
    shouldPersistProgress: () => false,
    request: () => Promise.resolve({}),
    config: { enableRemoteWrites: false, devMediaBaseUrl: 'http://127.0.0.1:18090' },
    console
})

const page = {
    ...definition,
    data: { courseId: 'course-1', currentVideo: { id: 'video-2' }, currentTime: 14.6, isPlaying: true },
    setData(update) { Object.assign(this.data, update) }
}
page.onVideoPause()
assert.strictEqual(page.data.isPlaying, false)
assert.strictEqual(progress.getVideoProgress(wx, 'video-2'), 14, 'pause must preserve the latest second, even before the 30-second checkpoint')
assert.strictEqual(progress.getRecentVideo(wx, 'course-1'), 'video-2')
progress.saveVideoProgress(wx, 'video-2', 0)
page.data.currentTime = 22.8
page.onUnload()
assert.strictEqual(progress.getVideoProgress(wx, 'video-2'), 22, 'leaving the page must preserve the last visible position')
console.log('video pause progress tests: PASS')
