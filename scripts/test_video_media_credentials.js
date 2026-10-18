const assert = require('assert')
const fs = require('fs')

const source = fs.readFileSync('pages/course/video/video.js', 'utf8').replace(/^import .*$/gm, '')
const businessToken = 'fixture-business-token-never-for-media'
const urls = [
    'https://media.example.test/course/video.mp4',
    'https://media.example.test/video.mp4?quality=720',
    'https://media.example.test/video.mp4?signature=abc%2B123&token=media-ticket#chapter',
    'http://127.0.0.1:18090/video/video1.mp4',
    'http://127.0.0.1:18090.evil.test/video.mp4',
    'https://other.example.test/video.mp4#part-one'
]
const settle = () => new Promise(resolve => setImmediate(resolve))
const tests = []

function harness(mediaUrls, enableRemoteWrites = false) {
    let definition
    const reads = []
    const writes = []
    const requests = []
    const response = {
        code: 200,
        data: { course: { id: 'course-1' }, hasPurchased: false,
            chapters: [{ id: 'chapter-1', videos: mediaUrls.map((url, index) => ({ id: `v${index}`, url, isPreview: true })) }] }
    }
    new Function('Page', 'request', 'getCourseDetail', 'shouldPersistProgress',
        'getVideoProgress', 'saveVideoProgress', 'saveRecentVideo', 'config', 'wx', source)(
        value => { definition = value }, options => { requests.push(options); return Promise.resolve({}) },
        () => Promise.resolve(response), () => false,
        () => 0, () => {}, () => {},
        { enableRemoteWrites, devMediaBaseUrl: 'http://127.0.0.1:18090' },
        { getStorageSync(key) { reads.push(key); return key === 'token' ? businessToken : '' },
            setStorageSync(key, value) { writes.push([key, value]) }, showToast() {}, hideLoading() {} }
    )
    const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
        setData(update) { Object.assign(this.data, update) } }
    return { page, reads, writes, requests, response }
}

for (const enableRemoteWrites of [false, true]) {
    tests.push([`initial media preserves source URLs without reading account credentials (writes=${enableRemoteWrites})`, async () => {
        const { page, reads, writes, requests, response } = harness(urls, enableRemoteWrites)
        const before = JSON.stringify(response)
        page.onLoad({ id: 'course-1' })
        await settle()
        assert.strictEqual(page.data.loading, false)
        assert.deepStrictEqual(page.data.chapters[0].videos.map(video => video.url), urls)
        assert.strictEqual(page.data.currentVideo.url, urls[0])
        assert.ok(!reads.includes('token'), 'loading media must not read the account token')
        assert.deepStrictEqual(writes, [])
        assert.deepStrictEqual(requests, [])
        assert.strictEqual(JSON.stringify(response), before)
    }])
    tests.push([`switching preserves external and signed URLs without mutation (writes=${enableRemoteWrites})`, () => {
        const { page, reads, requests } = harness([], enableRemoteWrites)
        for (const url of urls) {
            const video = { id: 'target', url, isPreview: true }
            const before = JSON.stringify(video)
            Object.freeze(video)
            page.switchVideo({ currentTarget: { dataset: { video, chapterIndex: 0 } } })
            assert.strictEqual(page.data.currentVideo.url, url)
            assert.strictEqual(JSON.stringify(video), before, 'input dataset must not be mutated')
        }
        assert.ok(!reads.includes('token'), 'switching media must not read the account token')
        assert.deepStrictEqual(requests, [])
    }])
}

tests.push(['locked media remains locked and next video preserves its media ticket', () => {
    const { page, reads } = harness([])
    page.data.currentVideo = { id: 'current', url: urls[0] }
    const locked = { id: 'locked', url: urls[1], isPreview: false }
    page.switchVideo({ currentTarget: { dataset: { video: locked, chapterIndex: 0 } } })
    assert.strictEqual(page.data.currentVideo.id, 'current')
    page.data.nextVideo = { id: 'next', url: urls[2], isPreview: true }
    page.playNextVideo()
    assert.strictEqual(page.data.currentVideo.url, urls[2])
    assert.ok(!reads.includes('token'))
}])

;(async () => {
    let failures = 0
    for (const [name, run] of tests) {
        try { await run(); console.log(`PASS ${name}`) }
        catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`) }
    }
    console.log(`video media credentials: ${tests.length - failures}/${tests.length} passed`)
    if (failures) process.exitCode = 1
})()
