const assert = require('assert')
const fs = require('fs')

const wxml = fs.readFileSync('pages/dictionary/search/search.wxml', 'utf8')
const source = fs.readFileSync('pages/dictionary/search/search.js', 'utf8')

assert.ok(wxml.includes('wx:if="{{loading}}"'))
assert.ok(wxml.includes('wx:elif="{{loadError}}"'))
assert.ok(wxml.includes('bindtap="retryLoad"'))
assert.ok(wxml.includes('wx:elif="{{searched && words.length}}"'))
assert.ok(wxml.includes('wx:elif="{{searched}}"'))
assert.ok(wxml.includes('sampleNotice'))
assert.ok(wxml.includes('wx:else class="state"'))
assert.ok(source.includes('if (this.data.loading || !this.data.hasMore) return'))
assert.ok(source.includes('if (!query)'))
assert.ok(source.includes('searched: false'))
assert.ok(source.includes("'词典查询失败，请检查网络后重试'"))
assert.ok(source.includes('retryLoad: function()'))
assert.ok(source.includes('const requestId = (this._searchRequestId || 0) + 1'))
assert.ok(source.includes('this._isUnloaded || requestId !== this._searchRequestId'))
assert.ok(source.includes('onUnload: function'))
console.log('dictionary search state tests: PASS')

const requests = []
let definition
new Function('Page', 'getDictionarySearch', 'config', 'wx', source.replace(/^import .*\n/gm, ''))(
    page => { definition = page },
    (query, options) => new Promise((resolve, reject) => { requests.push({ query, options, resolve, reject }) }),
    { enableLocalTestAudio: false },
    { showToast: () => {}, navigateTo: () => {} }
)
const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) { Object.assign(this.data, update) }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

async function checkAppendRetry() {
    page.onLoad({})
    page.setData({ query: 'кот' })
    page.search()
    requests[0].resolve({ data: { words: [{ word: 'кот' }] }, meta: { total: 60 } })
    await settle()
    page.loadMore()
    assert.deepStrictEqual(requests[1].options, { page: 2, pageSize: 20 })
    requests[1].reject(new Error('offline'))
    await settle()
    assert.deepStrictEqual(page.data.words.map(word => word.word), ['кот'])
    assert.strictEqual(page.data.sampleNotice, false)
    assert.strictEqual(page.data.page, 1)
    page.retryLoad()
    assert.deepStrictEqual(requests[2].options, { page: 2, pageSize: 20 }, 'retry must request failed append page')
    requests[2].resolve({ data: { words: [{ word: 'коты' }] }, meta: { total: 60 } })
    await settle()
    assert.deepStrictEqual(page.data.words.map(word => word.word), ['кот', 'коты'])
    assert.strictEqual(page.data.loadError, '')
    page.loadMore()
    requests[3].reject(new Error('offline again'))
    await settle()
    page.handleInput({ detail: { value: 'дом' } })
    page.retryLoad()
    assert.strictEqual(requests[4].query, 'дом')
    assert.deepStrictEqual(requests[4].options, { page: 1, pageSize: 20 })
    requests[4].resolve({ data: { words: [{ word: 'дом' }] }, meta: { total: 1 } })
    await settle()
    assert.deepStrictEqual(page.data.words.map(word => word.word), ['дом'])
    page.setData({ query: 'рыба' })
    page.search()
    assert.strictEqual(page.data.loading, true)
    page.setData({ query: '' })
    page.search()
    assert.strictEqual(page.data.loading, false, 'clearing query must cancel loading immediately')
    requests[5].resolve({ data: { words: [{ word: 'рыба' }] }, meta: { total: 1 } })
    await settle()
    assert.strictEqual(page.data.loading, false)
    assert.deepStrictEqual(page.data.words.map(word => word.word), [])
    console.log('dictionary append retry tests: PASS')
}

checkAppendRetry().catch(error => { console.error(error); process.exitCode = 1 })
