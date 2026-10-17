const fs = require('fs')
const assert = require('assert')
const vm = require('vm')

const source = fs.readFileSync('services/playback-progress.js', 'utf8')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { STORAGE_KEY, RECENT_COURSE_KEY, getRecentCourse, saveRecentCourse, getVideoProgress, saveVideoProgress }`, context)
const { STORAGE_KEY, RECENT_COURSE_KEY, getRecentCourse, saveRecentCourse, getVideoProgress, saveVideoProgress } = context.module.exports
const values = {}
const storage = {
    getStorageSync(key) { return values[key] },
    setStorageSync(key, value) { values[key] = value }
}
assert.strictEqual(getVideoProgress(storage, 'video-1'), 0)
assert.strictEqual(getRecentCourse(storage), '')
assert.strictEqual(saveRecentCourse(storage, 'course-1'), true)
assert.strictEqual(values[RECENT_COURSE_KEY], 'course-1')
assert.strictEqual(getRecentCourse(storage), 'course-1')
assert.strictEqual(saveVideoProgress(storage, 'video-1', 31.9), true)
assert.strictEqual(getVideoProgress(storage, 'video-1'), 31)
assert.strictEqual(values[STORAGE_KEY]['video-1'], 31)
assert.strictEqual(saveVideoProgress(storage, 'video-1', -5), true)
assert.strictEqual(getVideoProgress(storage, 'video-1'), 0)
console.log('playback progress tests: PASS')
