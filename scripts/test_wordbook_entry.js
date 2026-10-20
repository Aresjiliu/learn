const assert = require('assert');
const fs = require('fs');
const path = require('path');

assert.ok(fs.existsSync(path.join(__dirname, '../services/wordbook-entry.js')), 'wordbook entry bridge must exist');
const { buildWordbookEntry } = require('../services/wordbook-entry');
const { prepareWordbookEntry, createWordbook } = require('../services/wordbook');
const id = 'dict:181123:c6612fa04f6e73bc';
const word = { id, headword: ' камера ', meaningText: ' 房间\n  摄影机 ' };
let passed = 0;
function test(name, run) {
    run();
    passed++;
    console.log('PASS ' + name);
}

test('core exposes the existing snapshot validator', () => {
    assert.strictEqual(typeof prepareWordbookEntry, 'function');
    assert.strictEqual(prepareWordbookEntry({}), null);
});
test('stable dictionary identity wins over textbook context and strips private fields', () => {
    const input = { ...word, token: 'secret', audioUrl: 'https://private', metadata: { token: 'secret' } };
    const context = { collectionId: 'book', sourceId: 7 };
    const before = JSON.stringify([input, context]);
    const entry = buildWordbookEntry(input, context);
    assert.deepStrictEqual(entry, { key: id, sourceType: 'dictionary', entryId: id, headword: 'камера', summary: '房间 摄影机' });
    assert.deepStrictEqual(prepareWordbookEntry(entry), entry);
    assert.strictEqual(JSON.stringify([input, context]), before);
});
test('stable entryId and word fallback use core validation', () => {
    assert.strictEqual(buildWordbookEntry({ entryId: id, word: 'дом', meaning: '房屋' }).key, id);
    assert.strictEqual(buildWordbookEntry({ id: 123, entryId: id, word: 'дом' }).key, id);
});
test('numeric sample identity and matching headword never manufacture dictionary identity', () => {
    for (const sampleId of [0, 181123, '181123', 'dict:1:ABCDEF1234567890', 'dict:1:short']) {
        assert.strictEqual(buildWordbookEntry({ ...word, id: sampleId }), null);
    }
});
test('textbook requires both explicit context identities, including numeric zero', () => {
    const entry = buildWordbookEntry({ id: 99, word: 'дом' }, { collectionId: 0, sourceId: 0 });
    assert.deepStrictEqual(entry, { key: 'textbook:["0","0"]', sourceType: 'textbook', collectionId: '0', sourceId: '0', headword: 'дом', summary: '' });
    for (const context of [null, {}, { collectionId: 0 }, { sourceId: 0 }, { collectionId: '', sourceId: 0 }, { collectionId: 0, sourceId: -1 }]) {
        assert.strictEqual(buildWordbookEntry({ id: 99, word: 'дом', collectionId: 1, sourceId: 99 }, context), null);
    }
});
test('summary selects real nonblank strings and collapses whitespace without truncation', () => {
    for (const field of ['meaningText', 'summary', 'textbookMeaning', 'word_meaning_all', 'meaning', 'translation']) {
        assert.strictEqual(buildWordbookEntry({ id, word: 'дом', [field]: ' 一\t 二\n三 ' }).summary, '一 二 三');
    }
    assert.strictEqual(buildWordbookEntry({ id, word: 'дом', meaningText: ' ', summary: { token: 'secret' }, meaning: '房屋' }).summary, '房屋');
    assert.strictEqual(buildWordbookEntry({ id, word: 'дом', meaningText: '释义待补充' }).summary, '');
});
test('core rejects length overflow instead of silently shortening source text', () => {
    assert.strictEqual(buildWordbookEntry({ ...word, meaningText: '字'.repeat(2001) }), null);
    assert.strictEqual(buildWordbookEntry({ ...word, headword: '字'.repeat(257) }), null);
    assert.strictEqual(buildWordbookEntry({ ...word, meaningText: '字'.repeat(2000) }).summary.length, 2000);
});
test('invalid inputs, control text and unreliable context are rejected', () => {
    for (const input of [null, undefined, [], 'дом', {}, { id, word: '' }, { ...word, headword: 'a\u0000b' }]) {
        assert.strictEqual(buildWordbookEntry(input), null);
    }
    assert.strictEqual(buildWordbookEntry({ word: 'дом' }, { collectionId: {}, sourceId: 0 }), null);
});
test('real core stores only prepared whitelist and duplicate add preserves savedAt', () => {
    let stored;
    let clock = 10;
    const book = createWordbook({ read: () => stored, write: value => { stored = value; } }, () => clock++);
    const entry = buildWordbookEntry({ ...word, audio_url: 'private', token: 'secret', savedAt: 0 });
    book.add(entry);
    book.add(entry);
    assert.strictEqual(stored.records.length, 1);
    assert.strictEqual(stored.records[0].savedAt, 10);
    assert.deepStrictEqual(Object.keys(stored.records[0]).sort(), ['key', 'sourceType', 'entryId', 'headword', 'summary', 'savedAt'].sort());
});
console.log(`wordbook entry: ${passed}/${passed} passed`);
