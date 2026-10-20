const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const path = require('path')
const { createRequire } = require('module')

const js = fs.readFileSync('pages/course/words/words.js', 'utf8')
const wxml = fs.readFileSync('pages/course/words/words.wxml', 'utf8')
const detailJs = fs.readFileSync('pages/course/detail/detail.js', 'utf8')
const detailWxml = fs.readFileSync('pages/course/detail/detail.wxml', 'utf8')
assert.ok(detailJs.includes('openVocabulary: function'))
assert.ok(detailWxml.includes('bindtap="openVocabulary"'))
assert.ok(!detailJs.includes('prepareCourseWords'))
assert.ok(!detailWxml.includes('openWordDetail'))
assert.ok(js.includes('openWordDetail: function'))
assert.ok(js.includes('/pages/dictionary/detail/detail?q='))
assert.ok(wxml.includes('bindtap="openWordDetail"'))
assert.ok(wxml.includes('wx:key="rowKey"'))
assert.ok(wxml.includes('data-row-key="{{item.rowKey}}"'))
assert.ok(js.includes('record.dictionaryId'))
assert.ok(js.includes('record.id'))
assert.ok(js.includes('textbookId=${encodeURIComponent(textbookId)}'))
assert.ok(js.includes('collectionId=${encodeURIComponent(this.data.courseId)}'))
assert.ok(!wxml.includes('item.dictionaryId || item.sourceId'))
assert.ok(!wxml.includes('data-word-meaning='))
assert.ok(!wxml.includes('data-word-examples='))
assert.ok(js.includes('record.displayMeaning'))
assert.ok(js.includes('record.sentence_all'))
assert.ok(js.includes('meaning=${encodeURIComponent(meaning)}'))
assert.ok(js.includes('examples=${encodeURIComponent(examples)}'))
let page
const navigation = []
vm.runInNewContext(js.replace(/^import .*$/gm, ''), {
    Page(value) { page = value },
    require: createRequire(path.resolve('pages/course/words/words.js')),
    wx: { navigateTo(value) { navigation.push(value.url) } }
})
for (const collectionId of [0, 'book &/?#']) {
    page.data.courseId = collectionId
    page._wordsByRowKey = { zero: { id: 0, word: 'дом', displayMeaning: '房屋' } }
    page.openWordDetail({ currentTarget: { dataset: { rowKey: 'zero' } } })
    const query = new URL('https://fixture.invalid' + navigation[navigation.length - 1]).searchParams
    assert.strictEqual(query.get('collectionId'), String(collectionId))
    assert.strictEqual(query.get('textbookId'), '0')
    assert.strictEqual(query.get('id'), '', 'textbook identity must never become a guessed dictionary ID')
}
console.log('course word dictionary link tests: PASS')
