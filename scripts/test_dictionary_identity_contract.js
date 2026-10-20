const assert = require('assert')
const fs = require('fs')
const stripImports = source => source.replace(/^import .*$/gm, '')
const settle = () => new Promise(resolve => setImmediate(resolve))
const instantiate = definition => ({
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) { Object.assign(this.data, update) }
})

async function checkIdentityAndFallback() {
    let definition
    let response = { data: { words: [
        { id: 'dict:17:a', sourceId: '17', word: 'все', audioDevelopmentOnly: true },
        { id: 'dict:17:b', sourceId: '17', word: 'все' }
    ] }, meta: { source: 'dictionary-index', contentVersion: 'v1', total: 3 } }
    const navigation = []
    new Function('Page', 'getDictionarySearch', 'config', 'wx', 'require', stripImports(fs.readFileSync('pages/dictionary/search/search.js', 'utf8')))(
        value => { definition = value }, () => Promise.resolve(response),
        { enableContentApi: true, enableLocalDictionaryApi: false },
        { navigateTo: options => navigation.push(options.url), showToast() {}, getStorageSync: () => [], setStorageSync() {} },
        require('module').createRequire(require('path').resolve('pages/dictionary/search/search.js'))
    )
    const page = instantiate(definition)
    page.onLoad({})
    page.setData({ query: 'все', pageSize: 2 })
    page.search()
    await settle()
    assert.deepStrictEqual(page.data.words.map(word => word.entryId), ['dict:17:a', 'dict:17:b'])
    assert.notStrictEqual(page.data.words[0].rowKey, page.data.words[1].rowKey)
    assert.strictEqual(page.data.audioDevelopmentNotice, true)
    page.openDetail({ currentTarget: { dataset: { word: 'все', wordId: page.data.words[1].entryId } } })
    assert.ok(navigation[0].includes('id=dict%3A17%3Ab'))
    response = { data: { words: [{ sourceId: 'sample', word: 'все' }] }, meta: { source: 'local-sample', total: 1 } }
    page.loadMore()
    await settle()
    assert.strictEqual(page.data.words.length, 2, 'a fallback page must not mix with indexed results')
    assert.strictEqual(page.data.audioDevelopmentNotice, true, 'notice still describes retained indexed results')
    assert.ok(page.data.loadError)
    page.retryLoad()
    assert.strictEqual(page.data.audioDevelopmentNotice, false, 'fresh retry removes the old notice immediately')
    await settle()
    assert.strictEqual(page.data.sampleNotice, true, 'online mode fallback must be visibly labelled')
    assert.strictEqual(page.data.page, 1)
    response = { data: { words: [{ id: 'dict:99:new', word: 'новое' }] }, meta: { source: 'dictionary-index', contentVersion: 'v1', total: 3 } }
    page.setData({ query: 'новое', hasMore: true })
    page.loadMore()
    await settle()
    assert.strictEqual(page.data.words[0].entryId, 'dict:99:new', 'changing input must start a fresh first page')
    assert.strictEqual(page.data.page, 1)
}

async function checkStableDetailFailure() {
    let definition
    let attempts = 0
    new Function('Page', 'getLocalDictionaryDetail', 'getLocalTextbookAudioUrl', 'getDictionaryDetail', 'audioController', 'config', 'wx', 'presentDictionaryDetail',
        stripImports(fs.readFileSync('pages/dictionary/detail/detail.js', 'utf8')))(
        value => { definition = value }, () => ({ word: 'unrelated local result' }), () => '',
        () => ++attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ data: { word: {
            id: 'dict:17:b', word: 'всё', word_meaning_all: '一切', audioPending: true
        } } }),
        { stop() {} }, { enableLocalDictionaryApi: true }, { showToast() {} },
        require('../services/dictionary-presentation').presentDictionaryDetail
    )
    const page = instantiate(definition)
    page.onLoad({ q: encodeURIComponent('всё'), id: 'dict:17:b' })
    await settle()
    assert.strictEqual(page.data.word, null, 'a failed stable ID must not resolve to a fuzzy sample')
    assert.ok(page.data.loadError)
    page.retryLoad()
    await settle()
    assert.strictEqual(page.data.word.id, 'dict:17:b')
    assert.strictEqual(page.data.word.audioPending, true, 'preserve server pronunciation availability')
    assert.strictEqual(page.data.loadError, '')
}

;(async () => {
    await checkIdentityAndFallback()
    await checkStableDetailFailure()
    const wxml = fs.readFileSync('pages/dictionary/search/search.wxml', 'utf8')
    assert.ok(wxml.includes('wx:key="rowKey"'))
    assert.match(wxml, /<dictionary-entry[^>]*entry="\{\{item\}\}"[^>]*bind:open="openDetail"/)
    // The actual Component event and Page navigation are exercised with an encoded stable ID.
    require('./test_dictionary_component_events')
    assert.ok(fs.readFileSync('pages/dictionary/detail/detail.wxml', 'utf8').includes('bindtap="retryLoad"'))
    console.log('dictionary identity and source contract: PASS')
})().catch(error => { console.error(error); process.exitCode = 1 })
