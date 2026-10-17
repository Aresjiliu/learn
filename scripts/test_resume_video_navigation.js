const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const progressSource = fs.readFileSync('services/playback-progress.js', 'utf8')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const progressContext = { module: { exports: {} } }
vm.runInNewContext(`${progressSource}\nmodule.exports = { getRecentCourse, saveRecentCourse, getRecentVideo: typeof getRecentVideo === 'function' ? getRecentVideo : undefined, saveRecentVideo: typeof saveRecentVideo === 'function' ? saveRecentVideo : undefined, getVideoProgress, saveVideoProgress }`, progressContext)
const progress = progressContext.module.exports
assert.strictEqual(typeof progress.getRecentVideo, 'function', 'resume lookup API is missing')
assert.strictEqual(typeof progress.saveRecentVideo, 'function', 'resume save API is missing')

const storageValues = {}
const navigation = []
const storage = {
    getStorageSync(key) { return storageValues[key] },
    setStorageSync(key, value) { storageValues[key] = value },
    navigateTo({ url }) { navigation.push(url) }
}

assert.strictEqual(progress.getRecentVideo(storage, 'course-1'), '')
assert.strictEqual(progress.saveRecentVideo(storage, 'course-1', 'video-2'), true)
assert.strictEqual(progress.getRecentCourse(storage), 'course-1')
assert.strictEqual(progress.getRecentVideo(storage, 'course-1'), 'video-2')
assert.strictEqual(progress.getRecentVideo(storage, 'course-2'), '')

let pageDefinition
const pageSource = fs.readFileSync('pages/index/index.js', 'utf8').replace(/^import .*$/gm, '')
vm.runInNewContext(pageSource, {
    Page: definition => { pageDefinition = definition },
    config: { enableContentApi: false },
    getRecentCourse: progress.getRecentCourse,
    getRecentVideo: progress.getRecentVideo,
    getCategories: () => Promise.resolve({ code: 200, data: { categories: [] } }),
    getCourses: () => Promise.resolve({ code: 200, data: { courses: [] } }),
    wx: storage,
    console
})
const page = { ...pageDefinition, data: { ...pageDefinition.data }, setData(update) { Object.assign(this.data, update) } }
page.onShow()
assert.strictEqual(page.data.progressVideoId, 'video-2')
page.navigateToCourse({ currentTarget: { dataset: { id: 'course-1', videoId: page.data.progressVideoId, resume: true } } })
assert.strictEqual(navigation.pop(), '/pages/course/video/video?id=course-1&videoId=video-2')
page.navigateToCourse({ currentTarget: { dataset: { id: 'course-1' } } })
assert.strictEqual(navigation.pop(), '/pages/course/detail/detail?id=course-1')

progress.saveRecentCourse(storage, 'legacy-course')
page.onShow()
assert.strictEqual(page.data.progressVideoId, '')
page.navigateToCourse({ currentTarget: { dataset: { id: 'legacy-course', videoId: '', resume: true } } })
assert.strictEqual(navigation.pop(), '/pages/course/detail/detail?id=legacy-course')
console.log('resume video navigation tests: PASS')
