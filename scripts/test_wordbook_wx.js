const assert = require('assert');
const { createWxWordbook } = require('../services/wordbook-wx');
const { createWordbook } = require('../services/wordbook');

const KEY = 'wordbook_guest_v1';
const word = {
    sourceType: 'dictionary', entryId: 'dict:1:0123456789abcdef',
    headword: 'камера', summary: '房间；照相机'
};
const other = { ...word, entryId: 'dict:1:fedcba9876543210' };
let passed = 0;

function test(name, run) {
    run();
    passed += 1;
    console.log('PASS ' + name);
}

function code(run, expected, cause) {
    assert.throws(run, error => error.code === expected &&
        (cause === undefined || error.cause === cause));
}

function fixture(initial, present = false) {
    let stored = initial;
    let exists = present;
    let writes = 0;
    const calls = [];
    const faults = {};
    const platform = {
        getStorageInfoSync() {
            calls.push(['info']);
            if (faults.info) throw faults.info;
            if (Object.prototype.hasOwnProperty.call(faults, 'metadata')) return faults.metadata;
            return { keys: exists ? ['token', KEY, 'account'] : ['token', 'account'] };
        },
        getStorageSync(key) {
            calls.push(['get', key]);
            assert.strictEqual(key, KEY);
            if (faults.read) throw faults.read;
            return stored;
        },
        setStorageSync(key, value) {
            calls.push(['set', key]);
            assert.strictEqual(key, KEY);
            if (faults.write) throw faults.write;
            stored = value;
            exists = true;
            writes += 1;
        }
    };
    const book = createWxWordbook(platform, () => 1000);
    return { platform, book, calls, faults, value: () => stored, writes: () => writes };
}

function assertProtected(initial, reason, records = []) {
    const f = fixture(initial, true);
    assert.deepStrictEqual(f.book.inspect(), { records, readOnly: true, reason });
    code(() => f.book.add(word), 'WORDBOOK_READ_ONLY');
    code(() => f.book.remove(word.entryId), 'WORDBOOK_READ_ONLY');
    assert.strictEqual(f.writes(), 0);
    assert.strictEqual(f.value(), initial);
}

test('missing key is empty and never calls getStorageSync', () => {
    const f = fixture('unrelated stale value');
    assert.deepStrictEqual(f.book.inspect(), { records: [], readOnly: false, reason: '' });
    assert.strictEqual(f.book.remove('missing'), undefined);
    assert.deepStrictEqual(f.calls, [['info'], ['info']]);
    assert.strictEqual(f.writes(), 0);
    const saved = f.book.add(word);
    assert.deepStrictEqual(f.calls, [['info'], ['info'], ['info'], ['set', KEY]]);
    assert.deepStrictEqual(saved, { key: word.entryId, ...word, savedAt: 1000 });
    assert.deepStrictEqual(f.value(), { version: 1, records: [saved] });
});

test('present undefined and other invalid roots remain read-only', () => {
    [undefined, '', null, false, 0, 'bad', [], {}].forEach(value => {
        assertProtected(value, 'corrupt-data');
    });
});

test('invalid metadata fails reads before fetching values or writing', () => {
    const sparse = new Array(1);
    [undefined, null, {}, { keys: null }, { keys: KEY }, { keys: {} },
        { keys: [KEY, 0] }, { keys: [undefined] }, { keys: sparse }].forEach(metadata => {
        const f = fixture();
        f.faults.metadata = metadata;
        code(() => f.book.inspect(), 'WORDBOOK_READ_FAILED');
        code(() => f.book.add(word), 'WORDBOOK_READ_FAILED');
        code(() => f.book.remove(word.entryId), 'WORDBOOK_READ_FAILED');
        assert.deepStrictEqual(f.calls, [['info'], ['info'], ['info']]);
    });
});

test('info and value read exceptions preserve core errors and snapshots', () => {
    ['info', 'read'].forEach(operation => {
        const initial = { version: 1, records: [] };
        const f = fixture(initial, true);
        const cause = new Error(operation + ' unavailable');
        f.faults[operation] = cause;
        code(() => f.book.inspect(), 'WORDBOOK_READ_FAILED', cause);
        code(() => f.book.add(word), 'WORDBOOK_READ_FAILED', cause);
        code(() => f.book.remove(word.entryId), 'WORDBOOK_READ_FAILED', cause);
        assert.strictEqual(f.writes(), 0);
        assert.strictEqual(f.value(), initial);
        delete f.faults[operation];
        assert.deepStrictEqual(createWxWordbook(f.platform).inspect().records, []);
    });
});

test('unknown versions stay untouched without writes', () => {
    [2, 0, '1'].forEach(version => assertProtected({ version, records: [] }, 'unsupported-version'));
});

test('corrupt rows preserve valid core snapshots read-only', () => {
    const saved = { key: word.entryId, ...word, savedAt: 1000 };
    assertProtected({ version: 1, records: [saved, { broken: true }] }, 'corrupt-data', [saved]);
    assertProtected({ version: 1, records: [saved, saved] }, 'corrupt-data', [saved]);
});

test('two adapters interleave additions and removals without losing records', () => {
    const f = fixture();
    const second = createWxWordbook(f.platform, () => 2000);
    const firstSaved = f.book.add(word);
    const secondSaved = second.add(other);
    assert.deepStrictEqual(f.book.inspect().records, [secondSaved, firstSaved]);
    assert.strictEqual(f.book.remove(firstSaved.key), undefined);
    const thirdSaved = second.add({ ...word, entryId: 'dict:2:0123456789abcdef' });
    assert.deepStrictEqual(f.book.inspect().records, [thirdSaved, secondSaved]);
    second.remove(secondSaved.key);
    assert.deepStrictEqual(f.book.inspect().records, [thirdSaved]);
    assert.strictEqual(f.writes(), 5);
});

test('each operation reloads protection after an external version change', () => {
    const f = fixture();
    f.book.inspect();
    const future = { version: 2, records: [] };
    f.platform.setStorageSync(KEY, future);
    code(() => f.book.add(word), 'WORDBOOK_READ_ONLY');
    code(() => f.book.remove(word.entryId), 'WORDBOOK_READ_ONLY');
    assert.strictEqual(f.book.inspect().reason, 'unsupported-version');
    assert.strictEqual(f.writes(), 1);
    assert.strictEqual(f.value(), future);
});

test('failed add and remove leave the original snapshot readable by another adapter', () => {
    const f = fixture();
    const saved = f.book.add(word);
    const second = createWxWordbook(f.platform);
    const before = f.value();
    const cause = new Error('quota');
    f.faults.write = cause;
    code(() => f.book.add(other), 'WORDBOOK_WRITE_FAILED', cause);
    assert.deepStrictEqual(second.inspect().records, [saved]);
    code(() => f.book.remove(saved.key), 'WORDBOOK_WRITE_FAILED', cause);
    assert.deepStrictEqual(second.inspect().records, [saved]);
    assert.strictEqual(f.value(), before);
    assert.strictEqual(f.writes(), 1);
    delete f.faults.write;
    second.add(other);
    assert.strictEqual(f.book.inspect().records.length, 2);
});

test('stable IDs preserve homographs and duplicates follow core semantics', () => {
    const f = fixture();
    const saved = f.book.add(word);
    assert.deepStrictEqual(f.book.add({ ...word, summary: 'changed' }), saved);
    f.book.add(other);
    assert.strictEqual(f.writes(), 2);
    assert.strictEqual(f.book.inspect().records.length, 2);
    f.book.remove('missing');
    assert.strictEqual(f.writes(), 2);
});

test('textbook collection and source numeric zero retain core identity', () => {
    const f = fixture();
    const entry = { sourceType: 'textbook', collectionId: 0, sourceId: 0, headword: 'ноль' };
    const expected = createWordbook({ read() {}, write() {} }, () => 1000).add(entry);
    assert.deepStrictEqual(f.book.add(entry), expected);
    assert.strictEqual(expected.collectionId, '0');
    assert.strictEqual(expected.sourceId, '0');
    f.book.add({ ...entry, collectionId: 1 });
    assert.strictEqual(f.book.inspect().records.length, 2);
});

test('oversized summaries and other core limits reject without writes', () => {
    const f = fixture();
    [{ ...word, summary: 'x'.repeat(2001) }, { ...word, headword: 'x'.repeat(257) },
        { ...word, entryId: 'unstable' }, { ...word, headword: 'bad\u0000word' }]
        .forEach(entry => code(() => f.book.add(entry), 'WORDBOOK_INVALID_ENTRY'));
    assert.strictEqual(f.writes(), 0);
    const saved = f.book.add({ ...word, summary: 'я'.repeat(2000) });
    assert.strictEqual(saved.summary.length, 2000);
    code(() => createWxWordbook(f.platform, () => NaN).add(other), 'WORDBOOK_INVALID_TIME');
    assert.strictEqual(f.writes(), 1);
});

test('only whitelisted snapshots persist and only the fixed key is accessed', () => {
    const f = fixture();
    const saved = f.book.add({ ...word, token: 'secret', account: 'private',
        audioUrl: 'https://media/audio', videoUrl: 'https://media/video',
        media: { url: 'https://media/private' }, savedAt: 999, key: 'forged' });
    assert.deepStrictEqual(saved, { key: word.entryId, ...word, savedAt: 1000 });
    assert.deepStrictEqual(f.value(), { version: 1, records: [saved] });
    assert.deepStrictEqual(f.book.inspect().records, [saved]);
    f.book.remove(saved.key);
    assert.deepStrictEqual(f.value(), { version: 1, records: [] });
    assert.deepStrictEqual(f.calls, [
        ['info'], ['set', KEY], ['info'], ['get', KEY],
        ['info'], ['get', KEY], ['set', KEY]
    ]);
});

test('default clock returns a valid current core timestamp', () => {
    const f = fixture();
    const before = Date.now();
    const saved = createWxWordbook(f.platform).add(word);
    assert.ok(Number.isSafeInteger(saved.savedAt));
    assert.ok(saved.savedAt >= before && saved.savedAt <= Date.now());
});

console.log('wordbook-wx: ' + passed + '/' + passed + ' passed');
