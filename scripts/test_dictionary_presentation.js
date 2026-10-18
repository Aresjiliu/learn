const assert = require('assert')
const fs = require('fs')
const path = require('path')
const target = path.resolve(__dirname, '../services/dictionary-presentation.js')
assert.ok(fs.existsSync(target), 'presentation adapter must exist')
const { presentDictionaryEntry } = require(target)
const raw = { id: 'dict:17:b', word: 'всё́', word_character: 'мест.',
    word_meaning_all: '  2. 一切；\n  全部  ', examples: [' Всё хорошо.  一切都好。 '],
    sourceType: 'dictionary', audioSource: 'textbook', audioDevelopmentOnly: true }
const before = JSON.stringify(raw)
const entry = presentDictionaryEntry(raw)
assert.strictEqual(entry.headword, 'всё́')
assert.strictEqual(entry.wordClass, 'мест.')
assert.strictEqual(entry.summary, '2. 一切； 全部', 'preserve original sense numbers')
assert.deepStrictEqual(entry.meaningBlocks, ['2. 一切；', '全部'])
assert.deepStrictEqual(entry.examples, ['Всё хорошо. 一切都好。'])
assert.deepStrictEqual(entry.availableSections, ['meanings', 'examples'])
assert.strictEqual(entry.entryId, raw.id)
assert.strictEqual(entry.rowKey, raw.id)
assert.strictEqual(entry.audioDevelopmentOnly, true)
assert.strictEqual(JSON.stringify(raw), before)
assert.strictEqual(presentDictionaryEntry({ word: 'й', translation: '  字母  ' }).summary, '字母')
assert.deepStrictEqual(presentDictionaryEntry({}).availableSections, [])
assert.strictEqual(presentDictionaryEntry({ id: 0 }).entryId, '0')
for (const [matchTier, ambiguous, label] of [
    ['exact', false, '词头匹配'], ['prefix', false, '词头匹配'],
    ['wordForm', true, '词形候选 · 存在多个原型，请核对'],
    ['wordForm', false, '词形匹配'], ['meaning', false, '释义命中']
]) assert.strictEqual(presentDictionaryEntry({ matchTier, ambiguous }).matchLabel, label)
assert.strictEqual(presentDictionaryEntry({}).matchLabel, '', 'unknown match tier must not invent a hit type')
console.log('dictionary presentation: PASS')
