const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const serviceSource = fs.readFileSync('services/playback-progress.js', 'utf8').replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const service = {}
vm.runInNewContext(`${serviceSource}\nObject.assign(api, { getRecentPlayback })`, { api: service })
const source = fs.readFileSync('pages/index/index.js', 'utf8').replace(/^import .*$/gm, '')
function create(values = {}, throws = false) {
    let definition
    let reads = 0
    const updates = []
    const navigation = []
    const before = JSON.stringify(values)
    const wx = {
        getStorageSync(key) { reads++; if (throws) throw new Error('private storage failure'); return values[key] },
        setStorageSync() { assert.fail('homepage must never write storage') },
        navigateTo({ url }) { navigation.push(url) },
        hideLoading() {}
    }
    vm.runInNewContext(source, {
        Page(value) { definition = value }, wx, config: {}, console,
        getRecentPlayback: service.getRecentPlayback,
        getCategories() { assert.fail('resume must not fetch categories') },
        getCourses() { assert.fail('resume must not fetch titles') }
    })
    const page = { ...definition, data: { ...definition.data }, setData(update) { updates.push(update); Object.assign(this.data, update) } }
    return { page, updates, navigation, reads: () => reads, unchanged() { assert.strictEqual(JSON.stringify(values), before) } }
}
function snapshot(record) {
    return { playback_records_v2: { version: 2, recent: { courseId: record.courseId, videoId: record.videoId }, records: [record] } }
}
const record = { courseId: 'course-1', videoId: 'video-2', position: 125.9, duration: 400, courseTitle: '俄语第一册', videoTitle: '第二课', url: 'secret-url', token: 'secret-token' }
const real = create(snapshot(record))
real.page.onShow()
assert.strictEqual(real.page.data.hasLocalProgress, true, 'real bound playback must show resume')
assert.strictEqual(real.page.data.resumeCourseTitle, record.courseTitle)
assert.strictEqual(real.page.data.resumeVideoTitle, record.videoTitle)
assert.strictEqual(real.page.data.resumePositionLabel, '02:05')
const fields = ['hasLocalProgress', 'progressId', 'progressVideoId', 'resumeCourseTitle', 'resumeVideoTitle', 'resumePositionLabel', 'resumeError'].sort()
assert.deepStrictEqual(Object.keys(real.updates[0]).sort(), fields, 'only small display whitelist enters setData')
assert.ok(!JSON.stringify(real.updates).includes('secret'))
real.unchanged()
for (const [courseId, videoId, position, label] of [[0, 0, 0, '00:00'], ['俄语 &?/' + 'c'.repeat(300), '视频 &?/' + 'v'.repeat(300), 3661, '01:01:01']]) {
    const test = create(snapshot({ courseId, videoId, position }))
    test.page.onShow()
    assert.strictEqual(test.page.data.hasLocalProgress, true)
    assert.strictEqual(test.page.data.resumeCourseTitle, '上次学习的课程')
    assert.strictEqual(test.page.data.resumeVideoTitle, '上次学习的视频')
    assert.strictEqual(test.page.data.resumePositionLabel, label)
    test.page.navigateToCourse({ currentTarget: { dataset: { id: test.page.data.progressId, videoId: test.page.data.progressVideoId, resume: true } } })
    assert.strictEqual(test.navigation.pop(), `/pages/course/video/video?id=${encodeURIComponent(courseId)}&videoId=${encodeURIComponent(videoId)}`)
    test.page.navigateToCourse({ currentTarget: { dataset: { id: courseId } } })
    assert.strictEqual(test.navigation.pop(), `/pages/course/detail/detail?id=${encodeURIComponent(courseId)}`)
    test.unchanged()
}
for (const values of [{}, { recent_course_v1: 'course-only' }]) {
    const test = create(values)
    test.page.onShow()
    assert.strictEqual(test.page.data.hasLocalProgress, false)
    assert.strictEqual(test.page.data.resumeError, '')
    test.unchanged()
}
const legacy = create({ recent_course_v1: 'c', recent_video_by_course_v1: { c: 'v' }, video_progress_v1: { v: 61 } })
legacy.page.onShow()
assert.strictEqual(legacy.page.data.resumePositionLabel, '01:01')
assert.strictEqual(legacy.page.data.resumeCourseTitle, '上次学习的课程')
legacy.unchanged()
for (const position of [-1, '12', null]) {
    const test = create({ recent_course_v1: 'c', recent_video_by_course_v1: { c: 'v' }, video_progress_v1: { v: position } })
    test.page.onShow()
    test.unchanged()
    assert.strictEqual(test.page.data.hasLocalProgress, false)
    assert.ok(test.page.data.resumeError, `bound corrupt legacy position ${JSON.stringify(position)} must show a read error`)
    assert.strictEqual(test.page.data.progressId, '')
}
for (const values of [
    { recent_course_v1: 'c', video_progress_v1: { v: -1 } },
    { recent_course_v1: 'c', recent_video_by_course_v1: { c: 'v' } },
    { recent_course_v1: 'c', recent_video_by_course_v1: { c: 'v' }, video_progress_v1: {} }
]) {
    const test = create(values)
    test.page.onShow()
    test.unchanged()
    assert.strictEqual(test.page.data.hasLocalProgress, false)
    assert.strictEqual(test.page.data.resumeError, '')
}
for (const position of [-1, '12', null]) {
    const test = create({ ...snapshot({ courseId: 'c', videoId: 'v', position: 0 }), recent_course_v1: 'c', recent_video_by_course_v1: { c: 'v' }, video_progress_v1: { v: position } })
    test.page.onShow()
    test.unchanged()
    assert.strictEqual(test.page.data.hasLocalProgress, true)
    assert.strictEqual(test.page.data.resumePositionLabel, '00:00')
    assert.strictEqual(test.page.data.resumeError, '')
}
for (const values of [ { playback_records_v2: 'corrupt' }, ...[-1, Infinity, NaN, '12', null].map(position => snapshot({ courseId: 'c', videoId: 'v', position })), snapshot({ courseId: '', videoId: 'v', position: 2 }) ]) {
    const test = create(values)
    test.page.onShow()
    assert.strictEqual(test.page.data.hasLocalProgress, false)
    assert.ok(test.page.data.resumeError, 'corruption differs visibly from empty history')
    test.unchanged()
}
const failed = create({}, true)
failed.page.onShow()
assert.ok(failed.page.data.resumeError)
assert.strictEqual(failed.page.data.hasLocalProgress, false)
assert.ok(!failed.page.data.resumeError.includes('private'))
failed.page.navigateToCourse({ currentTarget: { dataset: { id: 'usable' } } })
assert.strictEqual(failed.navigation.pop(), '/pages/course/detail/detail?id=usable')
for (const id of [undefined, null, '', '   ', false, {}, [], Infinity, NaN, '\ud800', '\udfff', 'bad\ud800value']) {
    failed.page.navigateToCourse({ currentTarget: { dataset: { id } } })
    failed.page.navigateToCourse({ currentTarget: { dataset: { id: 'usable', videoId: id, resume: true } } })
}
assert.strictEqual(failed.navigation.length, 0, 'invalid navigation identity never reaches a route')
const refreshValues = snapshot(record)
const refresh = create(refreshValues)
refresh.page.onShow()
refreshValues.playback_records_v2 = 'corrupt'
refresh.page.onShow()
assert.strictEqual(refresh.page.data.hasLocalProgress, false, 'failed reread clears stale resume')
assert.ok(refresh.page.data.resumeError)
assert.strictEqual(refresh.page.data.progressId, '')
assert.strictEqual(refresh.page.data.resumeCourseTitle, '')
delete refreshValues.playback_records_v2
refresh.page.onShow()
assert.strictEqual(refresh.page.data.resumeError, '', 'legitimate empty reread clears former error')
assert.strictEqual(refresh.page.data.hasLocalProgress, false)
refreshValues.playback_records_v2 = snapshot({ ...record, courseTitle: '  ', videoTitle: '  ' }).playback_records_v2
refresh.page.onShow()
assert.strictEqual(refresh.page.data.resumeCourseTitle, '上次学习的课程')
assert.strictEqual(refresh.page.data.resumeVideoTitle, '上次学习的视频')
real.page.onUnload()
const count = real.updates.length
const reads = real.reads()
real.page.onShow()
assert.strictEqual(real.updates.length, count, 'unloaded page cannot mutate')
assert.strictEqual(real.reads(), reads, 'unloaded page cannot read resume')
real.page.navigateToCourse({ currentTarget: { dataset: { id: 'course-1', videoId: 'video-2', resume: true } } })
assert.strictEqual(real.navigation.length, 0, 'unloaded page cannot navigate')
console.log('home resume record: PASS (real service, read-only storage, whitelist, error/empty/unload)')
