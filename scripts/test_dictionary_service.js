const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('services/dictionary.js', 'utf8')
    .replace("import config from '../config'", 'const config = { enableLocalWordAudio: false }')
    .replace("const audioIndex = require('../data/content_samples/book_1_audio.js')", 'const audioIndex = {}')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} }, require: require }
vm.runInNewContext(`${source}\nmodule.exports = { searchLocalDictionary, getLocalDictionaryDetail }`, context)
const { searchLocalDictionary, getLocalDictionaryDetail } = context.module.exports

const words = [
    { word: 'абсолютный', word_meaning_all: '绝对的' },
    { word: 'агент', word_meaning_all: '代理人' },
    { word: 'дом', word_meaning_all: '房子' }
]
assert.strictEqual(searchLocalDictionary('агент', words).length, 1)
assert.strictEqual(searchLocalDictionary('绝对', words)[0].word, 'абсолютный')
assert.strictEqual(searchLocalDictionary('  ', words).length, 0)
assert.strictEqual(searchLocalDictionary('ё', [{ word: 'ёлка' }]).length, 1)
const detail = getLocalDictionaryDetail('агент', words, words)
assert.strictEqual(detail.word, 'агент')
assert.strictEqual(detail.textbookMeaning, '代理人')
assert.strictEqual(detail.examples.length, 0)
console.log('dictionary service tests: PASS')
