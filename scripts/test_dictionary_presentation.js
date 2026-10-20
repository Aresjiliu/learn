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
assert.strictEqual(entry.shortWordClass, '代词')
for (const [wordClass, expected] of [
    ['名 非动 单 阴 1格', '名词'],
    ['名 动名 单 阳 1格', '名词'],
    ['动 未 及 不定', '动词'],
    ['形 单 阴 1格', '形容词'],
    ['副 不变', '副词'],
    ['代 单 阳 1格', '代词'],
    ['名\t非动\n单 阴 1格', '名词'],
    ['动名 单 阳 1格', ''],
    ['名非动 单 阴 1格', ''],
    ['名，非动 单 阴 1格', ''],
    ['未知 名 单 阴 1格', ''],
    ['非动 单 阴 1格', '']
]) {
    const original = { id: 'compound', word_character: wordClass, word_meaning_all: '动 未 及 不定；名词释义原文' }
    const snapshot = JSON.stringify(original)
    const presented = presentDictionaryEntry(original)
    assert.strictEqual(presented.shortWordClass, expected, wordClass)
    assert.strictEqual(presented.wordClass, wordClass.replace(/\s+/g, ' ').trim())
    assert.strictEqual(presented.word_character, wordClass)
    assert.strictEqual(presented.summary, original.word_meaning_all)
    assert.strictEqual(JSON.stringify(original), snapshot)
}
assert.strictEqual(presentDictionaryEntry({ word_meaning_all: '名 非动 单 阴 1格' }).shortWordClass, '',
    'meaning text never supplies the part of speech')
for (const [wordClass, shortWordClass] of [
    ['сущ.', '名词'], ['м.', '名词'], ['ж.', '名词'], ['ср.', '名词'],
    ['прил.', '形容词'], ['гл.', '动词'], ['нареч.', '副词'], ['предл.', '前置词'],
    ['союз', '连词'], ['част.', '语气词'], ['числ.', '数词'], ['межд.', '感叹词'],
    ['名词', '名词'], ['未知；可能是动词', ''], ['м. 复杂说明', ''], ['', '']
]) {
    const original = { id: 'stable', wordClass, sourceId: 'source', sourceType: 'dictionary',
        audioUrl: 'unsafe-raw', audioDevelopmentOnly: true, word_meaning_all: '1. 原文；2. 不切分，全文保留。' }
    const presented = presentDictionaryEntry(original)
    assert.strictEqual(presented.shortWordClass, shortWordClass, wordClass)
    for (const key of Object.keys(original)) assert.strictEqual(presented[key], original[key], key)
    assert.strictEqual(presented.summary, original.word_meaning_all)
}
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
