const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const clone = value => JSON.parse(JSON.stringify(value))
const settle = () => new Promise(resolve => setImmediate(resolve))
const content = fs.readFileSync(path.join(root, 'services/content.js'), 'utf8')
    .replace(/export\s*\{([^}]+)\}\s*$/, 'module.exports = {$1}')
const moduleContent = { exports: {} }
vm.runInNewContext(content, { module: moduleContent })
const { prepareCourseWords, filterCourseWords } = moduleContent.exports

// Model setData's serialization boundary and nested array paths, not Object.assign.
function applyUpdate(data, update) {
    Object.keys(update).forEach(key => {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
        let target = data
        parts.slice(0, -1).forEach((part, index) => {
            if (!target[part]) target[part] = /^\d+$/.test(parts[index + 1]) ? [] : {}
            target = target[part]
        })
        target[parts[parts.length - 1]] = update[key]
    })
}

function harness(getCourseDetail) {
    let definition
    const navigation = []
    const toasts = []
    const errors = []
    const filename = path.join(root, 'pages/course/detail/detail.js')
    const source = fs.readFileSync(filename, 'utf8').replace(/^import .*$/gm, '')
    new Function('Page', 'getCourseDetail', 'prepareCourseWords', 'filterCourseWords', 'wx', 'require', 'config', 'console', source)(
        value => { definition = value }, getCourseDetail, prepareCourseWords, filterCourseWords,
        { showLoading() {}, hideLoading() {}, showToast: value => toasts.push(value), navigateTo: value => navigation.push(value.url) },
        require('module').createRequire(filename), { enableRemoteWrites: false }, { error: (...args) => errors.push(args) }
    )
    const calls = []
    const page = {
        ...definition,
        data: clone(definition.data),
        setData(update) {
            const serialized = JSON.stringify(update)
            calls.push({ update: JSON.parse(serialized), bytes: Buffer.byteLength(serialized, 'utf8') })
            applyUpdate(this.data, JSON.parse(serialized))
        }
    }
    return { page, calls, navigation, toasts, errors }
}

function fixture() {
    const words = Array.from({ length: 1247 }, (_, index) => ({
        id: `textbook:${index}`, word: `слово${index}`, word_character: '名词',
        word_meaning_all: `${index === 1246 ? '末页独有释义' : '共同释义'}；${'完整释义。'.repeat(36)}`,
        sentence_all: `Пример ${index}. ${'完整俄汉例句。'.repeat(240)}`,
        raw_export: '原始冗余字段'.repeat(160),
        dictionary: index % 2 ? null : { id: `dict:${index}:stable`, word: `слово${index}`, raw: '冗余'.repeat(160) }
    }))
    const chapters = [{ id: 'chapter:1', title: '第一章', words, videos: [
        { id: 'preview:1', title: '试听', url: '/media/preview.mp4', durationText: '01:00', words },
        { id: 'locked:2', title: '锁定', url: '/media/locked.mp4', isPreview: false, words },
        { id: 'pending:3', title: '待接入', url: '', isPreview: true, words }
    ] }, { id: 'chapter:2', title: '第二章', words, videos: [
        { id: 'locked:4', title: '旧接口后续章节', url: '/media/later.mp4', words }
    ] }]
    return { code: 200, data: { course: { id: '1', title: '真实课程', description: '简介', words, chapters }, chapters, words, hasPurchased: false } }
}

const tests = []
function test(name, run) { tests.push({ name, run }) }
test('chapter numbering expression uses the declared loop index (template contract)', () => {
    const wxml = fs.readFileSync(path.join(root, 'pages/course/detail/detail.wxml'), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
    const loop = wxml.match(/<view\b[^>]*wx:for="\{\{chapters\}\}"[^>]*>/)
    assert.ok(loop, 'chapter loop must exist')
    const index = loop[0].match(/wx:for-index="([A-Za-z_$][\w$]*)"/)
    assert.ok(index, 'chapter loop must declare its index')
    const number = wxml.match(/<text\b[^>]*class="chapter-number"[^>]*>\s*\{\{([^}]+)\}\}\s*<\/text>/)
    assert.ok(number, 'chapter number expression must exist')
    assert.strictEqual(number[1].trim(), `${index[1]} + 1`, 'chapter number must use its declared index')
    const evaluateNumber = new Function(index[1], `return ${number[1]}`)
    assert.deepStrictEqual([0, 1, 9].map(evaluateNumber), [1, 2, 10])
})

async function loaded(response = fixture()) {
    const context = harness(() => Promise.resolve(response))
    context.page.onLoad({ id: '1' })
    await settle()
    return context
}
function assertBudget(calls) {
    calls.forEach(call => assert.ok(call.bytes < 128 * 1024, `setData ${call.bytes} bytes exceeds fixture budget`))
}

test('detail sends only course/catalog projection and true word count, no word preparation or lists', async () => {
    const response = fixture()
    const { page, calls } = await loaded(response)
    assert.deepStrictEqual(page.data.courseStats, { chapterCount: 2, videoCount: 4, wordCount: 1247 })
    for (const call of calls) {
        for (const key of ['words', 'filteredWords', 'visibleWords', 'wordSummary', 'wordQuery']) {
            assert.ok(!Object.prototype.hasOwnProperty.call(call.update, key), key + ' must not cross bridge')
        }
    }
    assert.strictEqual(page._words, undefined)
    assert.ok(!JSON.stringify(page.data).includes('sentence_all'))
    assert.ok(!JSON.stringify(page.data).includes('raw_export'))
    assert.deepStrictEqual(Object.keys(page.data.course).sort(), ['description', 'title'])
    page.data.chapters.forEach(chapter => {
        assert.deepStrictEqual(Object.keys(chapter).sort(), ['rowKey', 'title', 'videos'])
        chapter.videos.forEach(video => Object.keys(video).forEach(key => {
            assert.ok(['id', 'title', 'durationText', 'url', 'isPreview', 'rowKey', 'canPreview', 'statusLabel'].includes(key), key)
        }))
    })
    const js = fs.readFileSync(path.join(root, 'pages/course/detail/detail.js'), 'utf8')
    assert.ok(!/prepareCourseWords|dictionary_words|book_word_forms/.test(js))
    assert.ok(!/handleCollect|handleBuy|handleReview/.test(js), 'detail must not retain unused collection/purchase/review actions')
    const wxml = fs.readFileSync(path.join(root, 'pages/course/detail/detail.wxml'), 'utf8')
    assert.ok(!/visibleWords|wordSummary|searchWords|word-match/.test(wxml))
    assert.strictEqual((wxml.match(/bindtap="openVocabulary"/g) || []).length, 1)
    assert.ok(wxml.includes('wx:if="{{courseStats.wordCount > 0}}"'))
    console.log('detail max payload bytes:', Math.max(...calls.map(call => call.bytes)))
    assertBudget(calls)
})

test('vocabulary entry encodes same course ID, guards empty courses', async () => {
    const { page, navigation } = await loaded()
    const id = 'курс /?&=#%中文'
    page.setData({ courseId: id })
    page.openVocabulary()
    assert.strictEqual(navigation[0], '/pages/course/words/words?id=' + encodeURIComponent(id))
    page.setData({ 'courseStats.wordCount': 0 })
    page.openVocabulary()
    assert.strictEqual(navigation.length, 1)
})

test('projected catalog retains preview, locks, pending media and navigation identity', async () => {
    const { page, navigation, toasts } = await loaded()
    assert.strictEqual(page.data.hasPreview, true)
    assert.strictEqual(page.data.chapters[1].videos[0].canPreview, false)
    assert.strictEqual(page.data.chapters[0].videos[1].statusLabel, '已锁定')
    assert.strictEqual(page.data.chapters[0].videos[2].statusLabel, '媒体待接入')
    page.previewVideo()
    assert.ok(navigation[0].includes('id=1&videoId=preview%3A1'))
    page.openCatalogVideo({ currentTarget: { dataset: { videoId: 'locked:2', chapterIndex: 0, isPreview: false } } })
    assert.strictEqual(navigation.length, 1)
    assert.strictEqual(toasts.length, 1)
    page.setData({ hasPurchased: true })
    page.openCatalogVideo({ currentTarget: { dataset: { videoId: 'locked:2', chapterIndex: 0, isPreview: false } } })
    assert.ok(navigation[1].includes('videoId=locked%3A2'))
})

test('stale and unloaded responses never replace private records or send payloads', async () => {
    const pending = []
    const { page, calls } = harness(() => new Promise(resolve => pending.push(resolve)))
    page.onLoad({ id: '1' })
    page.retryLoad()
    const latest = fixture()
    latest.data.words = latest.data.words.slice(0, 1)
    pending[1](latest)
    await settle()
    const before = calls.length
    pending[0](fixture())
    await settle()
    assert.strictEqual(calls.length, before)
    assert.strictEqual(page.data.courseStats.wordCount, 1)
    page.retryLoad()
    page.onUnload()
    const afterUnload = calls.length
    pending[2](fixture())
    await settle()
    assert.strictEqual(calls.length, afterUnload)
})

test('empty content, failed latest request and retry retain correct page states', async () => {
    let fail = true
    const empty = { code: 200, data: { course: { title: '空课程' }, words: [], chapters: [] } }
    const { page, errors } = harness(() => fail ? Promise.reject(new Error('offline')) : Promise.resolve(empty))
    page.onLoad({ id: '1' })
    await settle()
    assert.strictEqual(page.data.loading, false)
    assert.ok(page.data.loadError)
    assert.strictEqual(errors.length, 1)
    fail = false
    page.retryLoad()
    assert.strictEqual(page.data.loading, true)
    assert.strictEqual(page.data.loadError, '')
    await settle()
    assert.strictEqual(page.data.loading, false)
    assert.strictEqual(page.data.loadError, '')
    assert.strictEqual(page.data.hasPreview, false)
    assert.strictEqual(page.data.courseStats.wordCount, 0)
})
;(async () => {
    let failed = 0
    for (const { name, run } of tests) {
        try { await run(); console.log(`PASS ${name}`) } catch (error) {
            failed += 1
            console.error(`FAIL ${name}: ${error.message}`)
        }
    }
    console.log(`course detail payload: ${tests.length - failed}/${tests.length} passed (Page execution; not DevTools rendering)`)
    if (failed) process.exitCode = 1
})()
