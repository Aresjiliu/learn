const fs = require('fs')
const vm = require('vm')
const assert = require('assert')

const dictionarySample = JSON.parse(fs.readFileSync('data/content_samples/dictionary_words.json', 'utf8'))
const textbookSample = JSON.parse(fs.readFileSync('data/content_samples/book_1_words.json', 'utf8'))
const source = fs.readFileSync('services/dictionary.js', 'utf8')
    .replace("import config from '../config'", 'const config = { enableLocalWordAudio: false }')
    .replace("const audioIndex = require('../data/content_samples/book_1_audio.js')", 'const audioIndex = {}')
    .replace("const dictionarySample = require('../data/content_samples/dictionary_words.js')", `const dictionarySample = ${JSON.stringify(dictionarySample)}`)
    .replace("const textbookSample = require('../data/content_samples/book_1_words.js')", `const textbookSample = ${JSON.stringify(textbookSample)}`)
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} }, console }
vm.runInNewContext(`${source}\nmodule.exports = { searchLocalDictionary, getLocalDictionarySearch, getLocalDictionaryDetail, buildLocalDictionaryWords }`, context)
const { getLocalDictionarySearch, getLocalDictionaryDetail, buildLocalDictionaryWords } = context.module.exports

;(async () => {
    const words = buildLocalDictionaryWords()
    assert.ok(words.length >= textbookSample.words.length)
    assert.strictEqual(words.find(item => item.word === 'агент').sourceType, 'dictionary')
    const textbookHit = await getLocalDictionarySearch('Астрахань', { page: 1, pageSize: 20 })
    assert.ok(textbookHit.data.words.some(item => item.word === 'Астрахань' && item.sourceType === 'textbook'))
    assert.strictEqual(textbookHit.meta.source, 'local-sample')
    assert.ok(getLocalDictionaryDetail('Астрахань').examples.length >= 0)
    assert.strictEqual(getLocalDictionaryDetail(words.find(item => item.word === 'агент').sourceId).word, 'агент')
    console.log('dictionary tests: PASS')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
