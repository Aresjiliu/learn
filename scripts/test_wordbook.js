const assert = require('assert');
const fs = require('fs');
const path = require('path');
assert.ok(fs.existsSync(path.join(__dirname, '../services/wordbook.js')), 'wordbook storage service must exist');
const { createWordbook } = require('../services/wordbook');
let passed = 0;
function test(name, run) { run(); passed += 1; console.log('PASS ' + name); }
const word = { sourceType: 'dictionary', entryId: 'dict:1:0123456789abcdef', headword: 'камера', summary: '房间；照相机' };
function fixture(initial) {
    let stored = initial;
    let fail = false;
    let writes = 0;
    const storage = { read() { return stored; }, write(value) { if (fail) throw new Error('quota'); stored = value; writes += 1; } };
    return { book: createWordbook(storage, () => 1000), storage, value: () => stored,
        writes: () => writes, fail() { fail = true; } };
}
function code(run, expected) { assert.throws(run, error => error.code === expected); }
test('new book saves a versioned offline snapshot and restores', () => {
    const f = fixture();
    const record = f.book.add(word);
    assert.strictEqual(record.savedAt, 1000);
    assert.strictEqual(f.value().version, 1);
    assert.deepStrictEqual(createWordbook(f.storage).list(), [record]);
    assert.strictEqual(f.book.has(record.key), true);
});
test('duplicate stable identity is idempotent and homographs remain separate', () => {
    const f = fixture();
    f.book.add(word);
    f.book.add({ ...word, summary: 'changed' });
    assert.strictEqual(f.writes(), 1);
    assert.strictEqual(f.book.list()[0].summary, word.summary);
    f.book.add({ ...word, entryId: 'dict:1:fedcba9876543210' });
    assert.strictEqual(f.book.list().length, 2);
});
test('textbook source identity is scoped and supports numeric zero', () => {
    const f = fixture();
    const item = { sourceType: 'textbook', collectionId: 0, sourceId: 0, headword: 'камера', summary: '' };
    f.book.add(item);
    f.book.add({ ...item, collectionId: 'other' });
    f.book.add(word);
    assert.strictEqual(new Set(f.book.list().map(row => row.key)).size, 3);
});
test('remove persists; missing remove never writes', () => {
    const f = fixture();
    const saved = f.book.add(word);
    f.book.remove('missing');
    assert.strictEqual(f.writes(), 1);
    f.book.remove(saved.key);
    assert.deepStrictEqual(f.book.list(), []);
    assert.deepStrictEqual(f.value().records, []);
});
test('storage write failure preserves memory and persisted snapshot', () => {
    const f = fixture();
    const saved = f.book.add(word);
    const before = JSON.stringify(f.value());
    f.fail();
    code(() => f.book.remove(saved.key), 'WORDBOOK_WRITE_FAILED');
    code(() => f.book.add({ ...word, entryId: 'dict:2:0123456789abcdef' }), 'WORDBOOK_WRITE_FAILED');
    assert.strictEqual(JSON.stringify(f.value()), before);
    assert.deepStrictEqual(f.book.list(), [saved]);
});
test('input, result, list and write payload cannot mutate internal records', () => {
    const f = fixture();
    const input = { ...word, token: 'never-save' };
    const saved = f.book.add(input);
    input.headword = 'changed'; saved.headword = 'changed';
    f.book.list()[0].headword = 'changed';
    f.value().records[0].headword = 'changed';
    assert.strictEqual(f.book.list()[0].headword, word.headword);
    assert.strictEqual(f.book.list()[0].token, undefined);
});
test('unknown versions remain untouched and mutation is blocked', () => {
    const seed = fixture(); const valid = seed.book.add(word);
    [[{ future: true }], [valid]].forEach(records => {
        const initial = { version: 2, records };
        const f = fixture(initial);
        assert.strictEqual(f.book.status().reason, 'unsupported-version');
        assert.deepStrictEqual(f.book.list(), []); // Unknown semantics: not an authoritative count.
        code(() => f.book.add(word), 'WORDBOOK_READ_ONLY');
        assert.strictEqual(f.writes(), 0);
        assert.strictEqual(f.value(), initial);
    });
});
test('corrupt rows recover valid snapshots read-only without silent loss', () => {
    const seed = fixture(); seed.book.add(word);
    const f = fixture({ version: 1, records: [seed.book.list()[0], { broken: true }] });
    assert.strictEqual(f.book.list().length, 1);
    assert.strictEqual(f.book.status().reason, 'corrupt-data');
    code(() => f.book.remove(f.book.list()[0].key), 'WORDBOOK_READ_ONLY');
    assert.strictEqual(f.writes(), 0);
});
test('corrupt root cannot be overwritten', () => {
    [null, [], {}, 'bad', false].forEach(initial => {
        const f = fixture(initial);
        code(() => f.book.add(word), 'WORDBOOK_READ_ONLY');
        assert.strictEqual(f.writes(), 0);
    });
});
test('read exceptions are explicit and do not write', () => {
    code(() => createWordbook({ read() { throw new Error('unavailable'); }, write() { assert.fail(); } }), 'WORDBOOK_READ_FAILED');
});
test('invalid identity, text, length and clock are rejected without writes', () => {
    const f = fixture();
    [null, {}, { ...word, entryId: '1' }, { ...word, headword: ' ' },
        { ...word, summary: 'x'.repeat(2001) }, { ...word, headword: 'x'.repeat(257) },
        { ...word, headword: 'bad\u0000word' }, { ...word, sourceType: 'unknown' },
        { sourceType: 'textbook', collectionId: false, sourceId: 1, headword: 'a' }]
        .forEach(item => code(() => f.book.add(item), 'WORDBOOK_INVALID_ENTRY'));
    assert.strictEqual(f.writes(), 0);
    code(() => createWordbook(f.storage, () => NaN).add(word), 'WORDBOOK_INVALID_TIME');
});
test('forged stored identity, timestamp and duplicate rows block writes', () => {
    const seed = fixture(); const record = seed.book.add(word);
    [{ ...record, key: 'forged' }, { ...record, savedAt: -1 }].forEach(row => {
        const f = fixture({ version: 1, records: [row] });
        assert.strictEqual(f.book.list().length, 0);
        assert.strictEqual(f.book.status().readOnly, true);
    });
    const f = fixture({ version: 1, records: [record, record] });
    assert.strictEqual(f.book.list().length, 1);
    assert.strictEqual(f.book.status().readOnly, true);
});
console.log('wordbook: ' + passed + '/' + passed + ' passed');
