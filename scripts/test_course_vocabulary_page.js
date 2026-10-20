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

function harness(getCourseDetail, environment = {}) {
    let definition
    const navigation = []
    const toasts = []
    const errors = []
    const filename = path.join(root, 'pages/course/words/words.js')
    const source = fs.readFileSync(filename, 'utf8').replace(/^import .*$/gm, '')
    new Function('Page', 'getCourseDetail', 'prepareCourseWords', 'filterCourseWords', 'wx', 'require', 'config', 'console', 'getCurrentPages', source)(
        value => { definition = value }, getCourseDetail, prepareCourseWords, filterCourseWords,
        { showLoading() {}, hideLoading() {}, showToast: value => toasts.push(value), navigateTo: value => navigation.push(value.url), redirectTo: value => navigation.push(value.url), switchTab: value => navigation.push(value.url), ...environment.wx },
        require('module').createRequire(filename), { enableRemoteWrites: false }, { error: (...args) => errors.push(args) },
        environment.getCurrentPages || (() => [])
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
async function loaded(response = fixture()) {
    const context = harness(() => Promise.resolve(response))
    context.page.onLoad({ id: '1' })
    await settle()
    return context
}
function assertBudget(calls) {
    calls.forEach(call => assert.ok(call.bytes < 128 * 1024, `setData ${call.bytes} bytes exceeds fixture budget`))
}

test('real detail-to-words-to-course methods keep one course instance after four round trips', async () => {
    const stack = []
    const actions = []
    const detailRoute = 'pages/course/detail/detail'
    let detailDefinition
    const source = fs.readFileSync(path.join(root, detailRoute + '.js'), 'utf8').replace(/^import .*$/gm, '')
    const createDetail = id => ({
        ...detailDefinition, route: detailRoute,
        data: { ...clone(detailDefinition.data), courseId: id, courseStats: { chapterCount: 2, videoCount: 4, wordCount: 1247 } }
    })
    const wx = {
        navigateTo(options) {
            const url = new URL(options.url, 'https://fixture.invalid')
            assert.strictEqual(url.pathname, '/pages/course/words/words')
            const context = harness(() => Promise.resolve(fixture()), { wx, getCurrentPages: () => stack })
            context.page.route = 'pages/course/words/words'
            stack.push(context.page)
            context.page.onLoad({ id: url.searchParams.get('id') })
        },
        redirectTo(options) {
            actions.push('redirectTo')
            const id = new URL(options.url, 'https://fixture.invalid').searchParams.get('id')
            stack.splice(stack.length - 1, 1, createDetail(id))
        },
        navigateBack(options) {
            actions.push('navigateBack')
            assert.strictEqual(options.delta, 1)
            stack.splice(stack.length - options.delta, options.delta)
        }
    }
    new Function('Page', 'wx', source)(value => { detailDefinition = value }, wx)
    const original = createDetail('1')
    stack.push(original)
    for (let visit = 0; visit < 4; visit += 1) {
        stack[stack.length - 1].openVocabulary()
        await settle()
        stack[stack.length - 1].backToCourse()
    }
    assert.strictEqual(stack.length, 1, 'four round trips must not leave five same-course detail instances')
    assert.strictEqual(stack[0], original, 'return must reuse the original detail Page')
    assert.deepStrictEqual(actions, Array(4).fill('navigateBack'))
})

test('return checks immediate previous route and strict valid ID, including zero, with failure page reachable', async () => {
    const detailRoute = 'pages/course/detail/detail'
    const cases = [
        { id: '1', previous: { route: detailRoute, data: { courseId: 1 } }, method: 'navigateBack' },
        { id: 0, previous: { route: detailRoute, data: { courseId: '0' } }, method: 'navigateBack' },
        { id: '0', previous: { route: detailRoute, data: { courseId: 0 } }, method: 'navigateBack' },
        { id: '1', previous: { route: detailRoute, data: { courseId: '01' } }, method: 'redirectTo' },
        { id: '1', previous: { route: detailRoute, data: { courseId: ' 1 ' } }, method: 'redirectTo' },
        { id: '1', previous: { route: detailRoute, data: { courseId: 2 } }, method: 'redirectTo' },
        { id: '0', previous: { route: detailRoute, data: { courseId: false } }, method: 'redirectTo' },
        { id: '1', previous: { route: detailRoute, data: { courseId: { toString: () => '1' } } }, method: 'redirectTo' },
        { id: '1', previous: { route: detailRoute }, method: 'redirectTo' },
        { id: '1', previous: { route: 'pages/course/video/video', data: { courseId: '1' } }, method: 'redirectTo' },
        { id: 'курс /?&=#%中文', method: 'redirectTo' },
        { id: '', previous: { route: detailRoute, data: { courseId: '' } }, method: 'switchTab' },
        { id: null, method: 'switchTab' },
        { id: undefined, method: 'switchTab' },
        { id: false, method: 'switchTab' },
        { id: NaN, method: 'switchTab' }
    ]
    for (const item of cases) {
        const stack = item.previous ? [item.previous] : []
        const navigation = []
        const wx = {}
        for (const method of ['navigateBack', 'redirectTo', 'switchTab']) {
            wx[method] = options => {
                navigation.push({ method, options })
                if (method === 'navigateBack') stack.pop()
            }
        }
        const { page } = harness(() => Promise.reject(new Error('offline')), { wx, getCurrentPages: () => stack })
        page.route = 'pages/course/words/words'
        stack.push(page)
        page.onLoad({ id: item.id })
        await settle()
        assert.ok(page.data.loadError, 'return must remain accessible on failed or missing-ID load')
        page.backToCourse()
        assert.strictEqual(navigation.length, 1)
        assert.strictEqual(navigation[0].method, item.method, String(item.id))
        if (item.method === 'navigateBack') assert.deepStrictEqual(navigation[0].options, { delta: 1 })
        if (item.method === 'redirectTo') assert.strictEqual(navigation[0].options.url, '/pages/course/detail/detail?id=' + encodeURIComponent(item.id))
        if (item.method === 'switchTab') assert.strictEqual(navigation[0].options.url, '/pages/index/index')
    }
})

test('1247 raw rows: initial/search payload budget and full-source private storage', async () => {
    const response = fixture()
    const { page, calls } = await loaded(response)
    const initialBytes = Math.max(...calls.map(call => call.bytes))
    page.searchWords({ detail: { value: '共同释义' } })
    const searchBytes = calls[calls.length - 1].bytes
    console.log(`payload bytes: initial=${initialBytes}, search=${searchBytes}`)
    assertBudget(calls)
    assert.strictEqual(page.data.words, undefined)
    assert.strictEqual(page.data.filteredWords, undefined)
    assert.strictEqual(page._words.length, 1247)
    assert.strictEqual(page._filteredWords.length, 1246)
    assert.strictEqual(page._words[0].sentence_all, response.data.words[0].sentence_all)
    assert.strictEqual(page._words[0].raw_export, response.data.words[0].raw_export)
    assert.strictEqual(page.data.visibleWords.length, 50)
    assert.strictEqual(page.data.visibleWords[0].displayMeaning, response.data.words[0].word_meaning_all)
    assert.deepStrictEqual(page.data.wordSummary, { total: 1247, mapped: 624, pending: 623, missingMeaning: 0 })
    assert.strictEqual(page.data.courseTitle, '真实课程')
    assert.strictEqual(page.data.contentModeLabel, '在线教材内容')
    assert.strictEqual(page.data.resultCount, 1246)
    const allowed = ['rowKey', 'word', 'word_character', 'displayMeaning', 'matchTier', 'dictionaryId', 'id']
    page.data.visibleWords.forEach(word => Object.keys(word).forEach(key => assert.ok(allowed.includes(key), key)))
    assert.strictEqual(page.data.course, undefined)
    assert.strictEqual(page.data.chapters, undefined)
})
test('append paths reconstruct all pages, keep prefix, stop at 1247; search spans full set', async () => {
    const { page, calls } = await loaded()
    const prefix = clone(page.data.visibleWords)
    page.loadMoreWords()
    const append = calls[calls.length - 1].update
    assert.ok(!Object.hasOwnProperty.call(append, 'visibleWords'), 'must not resend accumulated array')
    assert.strictEqual(Object.keys(append).filter(key => /^visibleWords\[\d+\]$/.test(key)).length, 50)
    assert.strictEqual(page.data.visibleWords.length, 100)
    assert.deepStrictEqual(page.data.visibleWords.slice(0, 50), prefix)
    while (page.data.hasMoreWords) page.loadMoreWords()
    assert.strictEqual(page.data.visibleWords.length, 1247)
    assert.strictEqual(new Set(page.data.visibleWords.map(word => word.rowKey)).size, 1247)
    assert.strictEqual(page.data.visibleWords[1246].id, 'textbook:1246')
    page.loadMoreWords()
    assert.strictEqual(page.data.visibleWords.length, 1247)
    page.searchWords({ detail: { value: '末页独有释义' } })
    assert.strictEqual(page.data.visibleWords.length, 1)
    assert.strictEqual(page.data.visibleWords[0].id, 'textbook:1246')
    assert.strictEqual(page.data.hasMoreWords, false)
    page.searchWords({ detail: { value: 'no-such-word' } })
    assert.strictEqual(page.data.visibleWords.length, 0)
    page.loadMoreWords()
    assert.strictEqual(page.data.visibleWords.length, 0)
    page.searchWords({ detail: { value: '' } })
    assert.strictEqual(page.data.visibleWords.length, 50)
    assert.strictEqual(page.data.hasMoreWords, true)
    page.searchWords({ detail: { value: '共同释义' } })
    page.loadMoreWords()
    assert.strictEqual(page.data.visibleWords.length, 100)
    assert.strictEqual(page.data.visibleWords[99].id, 'textbook:99')
    assert.strictEqual(page.data.wordSummary.total, 1247, 'search must not replace full-course statistics')
    assertBudget(calls.slice(3))
})

test('row click resolves full original text and distinct stable IDs after search/append; legacy dataset works', async () => {
    const response = fixture()
    const { page, navigation } = await loaded(response)
    page.loadMoreWords()
    for (const index of [50, 51]) {
        const word = page.data.visibleWords[index]
        page.openWordDetail({ currentTarget: { dataset: { rowKey: word.rowKey } } })
        const query = new URL(navigation[navigation.length - 1], 'https://fixture.invalid').searchParams
        assert.strictEqual(query.get('q'), response.data.words[index].word)
        assert.strictEqual(query.get('id'), index % 2 ? '' : `dict:${index}:stable`)
        assert.strictEqual(query.get('textbookId'), `textbook:${index}`)
        assert.strictEqual(query.get('meaning'), response.data.words[index].word_meaning_all)
        assert.strictEqual(query.get('examples'), response.data.words[index].sentence_all)
    }
    page.searchWords({ detail: { value: '末页独有释义' } })
    page.openWordDetail({ currentTarget: { dataset: { rowKey: page.data.visibleWords[0].rowKey } } })
    assert.strictEqual(new URL(navigation[navigation.length - 1], 'https://fixture.invalid').searchParams.get('textbookId'), 'textbook:1246')
    page.openWordDetail({ currentTarget: { dataset: { word: 'старое', wordId: 'dict:legacy', textbookId: 'legacy', wordMeaning: '旧释义', wordExamples: '旧例句' } } })
    assert.ok(navigation[navigation.length - 1].includes('id=dict%3Alegacy'))
    const wxml = fs.readFileSync(path.join(root, 'pages/course/words/words.wxml'), 'utf8')
    assert.ok(wxml.includes('data-row-key="{{item.rowKey}}"'))
    assert.ok(!wxml.includes('data-word-examples='))
    assert.ok(!wxml.includes('data-word-meaning='))
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
    assert.strictEqual(page._words.length, 1)
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
    assert.strictEqual(page.data.visibleWords.length, 0)
    assert.strictEqual(page._words.length, 0)
    assert.strictEqual(page.data.hasMoreWords, false)
    assert.deepStrictEqual(page.data.wordSummary, { total: 0, mapped: 0, pending: 0, missingMeaning: 0 })
})
test('direct route uses exact ID; missing ID makes no request; errors never show another course', async () => {
    const ids = []
    let reject = false
    const context = harness(id => {
        ids.push(id)
        return reject ? Promise.reject(new Error('unknown course')) : Promise.resolve(fixture())
    })
    context.page.onLoad({})
    await settle()
    assert.strictEqual(ids.length, 0)
    assert.ok(context.page.data.loadError)
    context.page.retryLoad()
    assert.strictEqual(ids.length, 0)
    context.page.backToCourse()
    assert.strictEqual(context.navigation.pop(), '/pages/index/index')
    const id = 'курс /?&=#%中文'
    context.page.onLoad({ id })
    await settle()
    assert.deepStrictEqual(ids, [id])
    context.page.backToCourse()
    assert.strictEqual(context.navigation[0], '/pages/course/detail/detail?id=' + encodeURIComponent(id))
    reject = true
    context.page.retryLoad()
    await settle()
    assert.strictEqual(context.page.data.visibleWords.length, 0)
    assert.strictEqual(context.page.data.courseTitle, '')
    assert.ok(context.page.data.loadError)
    assert.deepStrictEqual(ids, [id, id])
})

test('explicit local sample keeps truthful course title/count/label and input records are read-only', async () => {
    const response = fixture()
    response.message = 'local sample'
    const freeze = (value, seen = new Set()) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return
        seen.add(value)
        Object.keys(value).forEach(key => freeze(value[key], seen))
        Object.freeze(value)
    }
    freeze(response)
    const { page } = await loaded(response)
    assert.strictEqual(page.data.courseTitle, '真实课程')
    assert.strictEqual(page.data.wordSummary.total, 1247)
    assert.strictEqual(page.data.contentModeLabel, '本地演示内容')
    page.searchWords({ detail: { value: '末页独有释义' } })
    assert.strictEqual(page.data.visibleWords.length, 1)
    assert.strictEqual(response.data.words[1246].word_meaning_all, page.data.visibleWords[0].displayMeaning)
})

test('late failures and unload rejections are inert; retry reapplies active full-set query', async () => {
    const pending = []
    const { page, calls, errors } = harness(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
    page.onLoad({ id: '1' })
    page.searchWords({ detail: { value: '末页独有释义' } })
    page.retryLoad()
    pending[1].resolve(fixture())
    await settle()
    assert.strictEqual(page.data.visibleWords[0].id, 'textbook:1246')
    assert.strictEqual(page.data.resultCount, 1)
    const count = calls.length
    pending[0].reject(new Error('stale failure'))
    await settle()
    assert.strictEqual(calls.length, count)
    assert.strictEqual(errors.length, 0)
    page.retryLoad()
    page.onUnload()
    const countAfterUnload = calls.length
    pending[2].reject(new Error('unloaded failure'))
    await settle()
    assert.strictEqual(calls.length, countAfterUnload)
    assert.strictEqual(errors.length, 0)
})

test('vocabulary route keeps white native navigation and accessible empty/error/return UI', () => {
    const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
    assert.strictEqual(app.pages.filter(route => route === 'pages/course/words/words').length, 1)
    const config = JSON.parse(fs.readFileSync(path.join(root, 'pages/course/words/words.json'), 'utf8'))
    assert.strictEqual(config.navigationBarTitleText, '配套词汇')
    assert.strictEqual(config.navigationBarBackgroundColor, '#ffffff')
    assert.strictEqual(config.navigationBarTextStyle, 'black')
    const wxml = fs.readFileSync(path.join(root, 'pages/course/words/words.wxml'), 'utf8')
    for (const value of ['courseTitle', 'wordSummary.total', 'contentModeLabel', 'resultCount', 'retryLoad', 'backToCourse', 'searchWords', 'loadMoreWords', 'openWordDetail']) assert.ok(wxml.includes(value), value)
    assert.ok(wxml.includes('暂无配套词汇'))
    assert.ok(wxml.includes('没有找到匹配词汇'))
    assert.ok(!/wordSummary\.(mapped|pending|missingMeaning)/.test(wxml))
})

test('real offline course service: explicit sample works; unknown course never falls back to it', async () => {
    const filename = path.join(root, 'services/course.js')
    const source = fs.readFileSync(filename, 'utf8')
        .replace(/^import .*$/gm, '')
        .replace(/export\s*\{[^}]+\}\s*$/, '')
    const requests = []
    const getDetail = new Function('require', 'config', 'request', source + '\nreturn getCourseDetail')(
        require('module').createRequire(filename),
        { enableContentApi: false, enableLocalSampleFallback: true, enableLocalTestMedia: false },
        options => {
            requests.push(options.url)
            return Promise.reject(new Error('unknown course'))
        }
    )
    const { page, calls } = harness(getDetail)
    page.onLoad({ id: 'sample-book-1' })
    await settle()
    assert.strictEqual(requests.length, 0)
    assert.strictEqual(page.data.courseTitle, '东方教材大学俄语3')
    assert.strictEqual(page.data.wordSummary.total, 1247)
    assert.strictEqual(page.data.contentModeLabel, '本地演示内容')
    assert.strictEqual(page.data.visibleWords.length, 50)
    const initial = Math.max(...calls.map(call => call.bytes))
    page.searchWords({ detail: { value: '' } })
    console.log('bundled sample vocabulary payload bytes:', JSON.stringify({ initial, search: calls[calls.length - 1].bytes }))
    assertBudget(calls)
    page.setData({ courseId: 'unknown-course' })
    page.retryLoad()
    await settle()
    assert.deepStrictEqual(requests, ['/api/courses/unknown-course/'])
    assert.strictEqual(page.data.courseTitle, '')
    assert.strictEqual(page.data.visibleWords.length, 0)
    assert.ok(page.data.loadError)
})

;(async () => {
    let failed = 0
    for (const { name, run } of tests) {
        try { await run(); console.log(`PASS ${name}`) } catch (error) {
            failed += 1
            console.error(`FAIL ${name}: ${error.message}`)
        }
    }
    console.log(`course vocabulary page: ${tests.length - failed}/${tests.length} passed (Page execution; not DevTools rendering)`)
    if (failed) process.exitCode = 1
})()
