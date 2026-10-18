const assert = require('assert')
const fs = require('fs')
const path = require('path')
const searchFile = path.resolve(__dirname, '../pages/dictionary/search/search.js')
const localRequire = require('module').createRequire(searchFile)
const settle = () => new Promise(resolve => setImmediate(resolve))

function harness(storage = {}, flags = {}, options = {}) {
    let definition
    let saved = storage.saved || []
    const requests = [], navigation = [], modals = [], writes = []
    new Function('Page', 'getDictionarySearch', 'config', 'wx', 'require',
        fs.readFileSync(searchFile, 'utf8').replace(/^import .*$/gm, ''))(
        value => { definition = value },
        (query, options) => new Promise((resolve, reject) => requests.push({ query, options, resolve, reject })),
        { enableContentApi: true, enableLocalWordAudio: false, ...flags }, {
            getStorageSync(key) { assert.strictEqual(key, 'dictionary_history_v1'); if (storage.readFail) throw Error('read'); return saved },
            setStorageSync(key, value) { assert.strictEqual(key, 'dictionary_history_v1'); if (storage.writeFail) throw Error('full'); saved = value; writes.push(value) },
            showModal(options) { modals.push(options) }, showToast() {},
            navigateTo(options) { navigation.push(options.url) }
        }, localRequire)
    const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), updates: [],
        setData(update) { this.updates.push(update); Object.assign(this.data, update) } }
    page.onLoad(options)
    return { page, requests, navigation, modals, writes }
}
const result = (words = [], meta = {}) => ({ data: { words }, meta })
const tests = [
    ['malformed route stays recoverable without requests or history writes', async () => {
        for (const query of ['%', '%E0%A4%A', '%FF']) {
            let session
            assert.doesNotThrow(() => { session = harness({ saved: [{ query: 'й' }] }, {}, { q: query }) })
            const { page, requests, writes } = session
            assert.strictEqual(requests.length, 0)
            assert.strictEqual(writes.length, 0)
            assert.strictEqual(page.data.query, '')
            assert.strictEqual(page.data.loading, false)
            assert.strictEqual(page.data.searched, true, 'show the existing recoverable error state')
            assert.match(page.data.loadError, /查询参数无效.*重新输入/)
            assert.deepStrictEqual(page.data.words, [])
            assert.deepStrictEqual(page.data.history, [{ key: 'й', query: 'й' }])
            page.handleInput({ detail: 'всё́' })
            assert.strictEqual(page.data.loadError, '')
            assert.strictEqual(requests.length, 0)
            page.handleSearch()
            assert.strictEqual(requests[0].query, 'всё́')
            requests[0].resolve(result([{ id: 'dict:17:b', word: 'всё́' }])); await settle()
            assert.strictEqual(page.data.words[0].entryId, 'dict:17:b')
            assert.strictEqual(page.data.loadError, '')
            assert.strictEqual(writes.length, 1)
            assert.strictEqual(page.data.history[0].query, 'всё́')
        }
    }],
    ['real result entries preserve conditional audio facts and URL safety', async () => {
        const component = fs.readFileSync(path.resolve(__dirname, '../components/dictionary-entry/index.wxml'), 'utf8')
        for (const [audioUrl, enabled, playable] of [
            ['https://example.test/a.mp3', false, true], ['http://localhost/a.mp3', false, true],
            ['/wordaudio/' + 'a'.repeat(32) + '.mp3', false, false],
            ['/wordaudio/' + 'a'.repeat(32) + '.mp3', true, true],
            ['/wordaudio/../secret.mp3', true, false], ['unverified-hash', true, false]
        ]) for (const [audioSource, audioDevelopmentOnly, labels] of [
            ['textbook', true, ['教材发音', '本地验证']], ['other', 'true', []]
        ]) {
            const { page, requests } = harness({}, { enableLocalWordAudio: enabled })
            page.handleInput({ detail: 'кот' }); page.handleSearch()
            requests[0].resolve(result([{ id: 'dict:1:a', word: 'кот', audioUrl, audioSource, audioDevelopmentOnly }])); await settle()
            const entry = page.data.words[0]
            assert.strictEqual(entry.audioPlayable, playable)
            assert.strictEqual(entry.audioSource, audioSource)
            assert.strictEqual(entry.audioDevelopmentOnly, audioDevelopmentOnly)
            const visible = []
            for (const tag of component.matchAll(/<text\b([^>]*)>(教材发音|本地验证)<\/text>/g)) {
                const condition = /wx:if="\{\{(.*?)\}\}"/.exec(tag[1])
                assert.ok(condition)
                if (new Function('entry', 'return (' + condition[1] + ')')(entry)) visible.push(tag[2])
            }
            assert.deepStrictEqual(visible, labels)
        }
    }],
    ['only explicit word arrays count as a successful response', async () => {
        for (const response of [{ data: {} }, { code: 500, data: { words: [] } }]) {
            const { page, requests, writes } = harness()
            page.handleInput({ detail: 'кот' }); page.handleSearch()
            requests[0].resolve(response); await settle()
            assert.ok(page.data.loadError, 'malformed or failed response must not look like no results')
            assert.strictEqual(writes.length, 0)
        }
    }],
    ['initial, pending, empty, error, result and total metadata are truthful', async () => {
        for (const [rawTotal, expected] of [[undefined, null], [null, null], ['', null], [' ', null], ['bad', null], [-1, null], [0, 0], ['32', 32]]) {
            const { page, requests } = harness()
            assert.strictEqual(page.data.searched, false); assert.strictEqual(page.data.loading, false)
            page.handleInput({ detail: 'дом' }); page.handleSearch()
            assert.strictEqual(page.data.loading, true); assert.strictEqual(page.data.searched, false)
            requests[0].resolve(result([], { total: rawTotal, source: 'local-sample' })); await settle()
            assert.strictEqual(page.data.searched, true); assert.strictEqual(page.data.loading, false)
            assert.strictEqual(page.data.total, expected); assert.deepStrictEqual(page.data.words, [])
            assert.strictEqual(page.data.sampleNotice, true)
        }
    }],
    ['newer first page wins over older success and failure', async () => {
        for (const outcome of ['resolve', 'reject']) {
            const { page, requests, writes } = harness()
            page.handleInput({ detail: 'кот' }); page.handleSearch()
            page.handleInput({ detail: 'дом' }); page.handleSearch()
            requests[1].resolve(result([{ id: 'new', word: 'дом' }])); await settle()
            const state = JSON.stringify(page.data), updates = page.updates.length
            requests[0][outcome](outcome === 'resolve' ? result([{ id: 'old', word: 'кот' }]) : Error('late'))
            await settle()
            assert.strictEqual(JSON.stringify(page.data), state); assert.strictEqual(page.updates.length, updates)
            assert.strictEqual(writes.length, 1)
        }
    }],
    ['failed history deletion and clear keep records, modal callback after unload is inert', async () => {
        const { page, requests, modals } = harness({ saved: [{ query: 'ё' }], writeFail: true })
        page.removeHistory({ currentTarget: { dataset: { key: 'ё' } } })
        assert.strictEqual(page.data.history.length, 1); assert.match(page.data.historyNotice, /删除失败/)
        page.clearHistory(); modals[0].success({ confirm: true })
        assert.strictEqual(page.data.history.length, 1); assert.match(page.data.historyNotice, /清空失败/)
        page.clearHistory(); page.onUnload()
        const updates = page.updates.length
        modals[1].success({ confirm: true }); assert.strictEqual(page.updates.length, updates)
        assert.strictEqual(requests.length, 0)
    }],
    ['initial history and both input payloads, no per-keystroke requests', async () => {
        const { page, requests } = harness({ saved: [{ key: 'всё́', query: 'всё́' }] })
        assert.deepStrictEqual(page.data.history, [{ key: 'всё́', query: 'всё́' }])
        page.handleInput({ detail: 'й' }); assert.strictEqual(page.data.query, 'й')
        page.handleInput({ detail: { value: 'ё' } }); assert.strictEqual(page.data.query, 'ё')
        assert.strictEqual(requests.length, 0)
    }],
    ['successful empty search records; network failure does not', async () => {
        const { page, requests, writes } = harness()
        page.handleInput({ detail: ' Всё́ ' }); page.handleSearch()
        requests[0].resolve(result()); await settle()
        assert.deepStrictEqual(page.data.history, [{ key: 'всё́', query: 'Всё́' }])
        assert.strictEqual(page.data.total, null)
        page.handleInput({ detail: 'дом' }); page.handleSearch()
        assert.deepStrictEqual(page.data.words, [])
        requests[1].reject(Error('offline')); await settle()
        assert.strictEqual(writes.length, 1)
        assert.ok(page.data.loadError)
    }],
    ['storage failures stay visible without blocking results', async () => {
        for (const storage of [{ readFail: true }, { writeFail: true }]) {
            const { page, requests } = harness(storage)
            page.handleInput({ detail: 'кот' }); page.handleSearch()
            requests[0].resolve(result([{ id: 'dict:1:a', word: 'кот' }], { total: 1 })); await settle()
            assert.strictEqual(page.data.words.length, 1)
            assert.ok(page.data.historyNotice)
            assert.deepStrictEqual(page.data.history, [])
            assert.strictEqual(page.data.loadError, '')
        }
    }],
    ['delete is isolated; clear requires modal confirmation; history re-runs query', async () => {
        const { page, requests, modals } = harness({ saved: [{ query: 'ё' }, { query: 'й' }] })
        page.removeHistory({ currentTarget: { dataset: { key: 'ё' } } })
        assert.deepStrictEqual(page.data.history, [{ key: 'й', query: 'й' }]); assert.strictEqual(requests.length, 0)
        page.clearHistory(); assert.strictEqual(page.data.history.length, 1)
        modals[0].success({ confirm: false }); assert.strictEqual(page.data.history.length, 1)
        page.clearHistory(); modals[1].success({ confirm: true }); assert.deepStrictEqual(page.data.history, [])
        page.selectQuery({ currentTarget: { dataset: { query: 'й' } } }); assert.strictEqual(requests[0].query, 'й')
        const template = fs.readFileSync(searchFile.replace('.js', '.wxml'), 'utf8')
        assert.match(template, /catchtap="removeHistory"/)
    }],
    ['changed input, clear and unload invalidate pending success and failure', async () => {
        for (const action of ['input', 'clear', 'unload']) for (const outcome of ['resolve', 'reject']) {
            const { page, requests, writes } = harness()
            page.handleInput({ detail: { value: 'кот' } }); page.handleSearch()
            if (action === 'input') page.handleInput({ detail: 'дом' })
            if (action === 'clear') page.clearSearch()
            if (action === 'unload') page.onUnload()
            const state = JSON.stringify(page.data), updates = page.updates.length
            requests[0][outcome](outcome === 'resolve' ? result([{ word: 'кот' }]) : Error('late'))
            await settle()
            assert.strictEqual(JSON.stringify(page.data), state)
            assert.strictEqual(page.updates.length, updates)
            assert.strictEqual(writes.length, 0)
        }
    }],
    ['new search removes old list and keeps stable ID through component event', async () => {
        const { page, requests, navigation } = harness()
        page.handleInput({ detail: 'всё' }); page.handleSearch()
        requests[0].resolve(result([{ id: 'dict:17:b/?&', word: 'всё́' }], { total: 1 })); await settle()
        let component
        new Function('Component', fs.readFileSync(path.resolve(__dirname, '../components/dictionary-entry/index.js'), 'utf8'))(value => { component = value })
        component.methods.open.call({ data: { entry: page.data.words[0] },
            triggerEvent(name, detail) { assert.strictEqual(name, 'open'); page.openDetail({ detail }) } })
        assert.strictEqual(navigation[0], '/pages/dictionary/detail/detail?q=' + encodeURIComponent('всё́') + '&id=' + encodeURIComponent('dict:17:b/?&'))
        page.handleInput({ detail: 'дом' }); page.handleSearch()
        assert.deepStrictEqual(page.data.words, [])
        assert.strictEqual(page.data.total, null)
    }],
    ['pagination retry retains results; version and sample changes cannot append', async () => {
        for (const changedMeta of [{ source: 'dictionary-index', contentVersion: 'v2' }, { source: 'local-sample', contentVersion: 'v1' }]) {
            const { page, requests } = harness()
            const meta = { source: 'dictionary-index', contentVersion: 'v1', total: 60 }
            page.handleInput({ detail: 'кот' }); page.handleSearch()
            requests[0].resolve(result([{ id: '1', word: 'кот' }], meta)); await settle()
            page.loadMore(); requests[1].reject(Error('offline')); await settle()
            assert.strictEqual(page.data.words.length, 1); assert.strictEqual(page.data.page, 1)
            page.retryLoad(); assert.strictEqual(requests[2].options.page, 2)
            requests[2].resolve(result([{ id: '2', word: 'коты' }], meta)); await settle()
            assert.strictEqual(page.data.words.length, 2)
            page.loadMore(); requests[3].resolve(result([{ id: '3', word: 'кот' }], changedMeta)); await settle()
            assert.strictEqual(page.data.words.length, 2); assert.match(page.data.loadError, /内容已变化/)
            page.retryLoad(); assert.strictEqual(requests[4].options.page, 1)
        }
    }]
]
;(async () => {
    let failures = 0
    for (const [name, run] of tests) {
        try { await run(); console.log('PASS ' + name) }
        catch (error) { failures++; console.error('FAIL ' + name + ': ' + error.message) }
    }
    if (failures) process.exitCode = 1
})()
