const assert = require('assert');
const { createDictionaryHistory } = require('../services/dictionary-history');

let passed = 0;

function test(name, run) {
    run();
    passed += 1;
    console.log('PASS ' + name);
}

function fixture(initial) {
    const writes = [];
    const storage = {
        read() { return initial; },
        write(records) { writes.push(records); }
    };
    return { storage, writes, history: createDictionaryHistory(storage) };
}

test('newest first, trim, case preserved and duplicate moved to front', () => {
    const { history, writes } = fixture([]);
    history.record(' Дом ');
    history.record('Кот');
    history.record('ДОМ');
    assert.deepStrictEqual(history.list(), [
        { key: 'дом', query: 'ДОМ' }, { key: 'кот', query: 'Кот' }
    ]);
    assert.deepStrictEqual(writes[2], history.list());
});

test('twenty record limit is persisted, including duplicate updates', () => {
    const { history, writes } = fixture([]);
    for (let i = 0; i < 25; i += 1) history.record('word' + i);
    assert.strictEqual(history.list().length, 20);
    assert.strictEqual(writes[24].length, 20);
    assert.strictEqual(writes[24][19].query, 'word5');
    history.record('WORD5');
    assert.strictEqual(writes[25].length, 20);
    assert.strictEqual(history.list()[0].query, 'WORD5');
});

test('remove missing does not write; remove existing and clear persist', () => {
    const { history, writes } = fixture([{ query: 'Дом' }, { query: 'Кот' }]);
    history.remove('missing');
    assert.strictEqual(writes.length, 0);
    history.remove('дом');
    assert.deepStrictEqual(history.list(), [{ key: 'кот', query: 'Кот' }]);
    assert.deepStrictEqual(writes[0], history.list());
    history.clear();
    history.clear();
    assert.deepStrictEqual(history.list(), []);
    assert.deepStrictEqual(writes.slice(1), [[], []]);
});

test('corrupt roots restore empty without writing', () => {
    [undefined, null, false, 3, '{}', {}, { records: [] }].forEach(value => {
        const { history, writes } = fixture(value);
        assert.deepStrictEqual(history.list(), []);
        assert.strictEqual(writes.length, 0);
    });
});

test('restore validates each record, recomputes keys and keeps first duplicate', () => {
    const { history } = fixture([
        null, 'Дом', 3, [], {}, { query: 1 }, { query: '' },
        { query: 'x\u0000' }, { query: 'a'.repeat(65) },
        { key: 'forged', query: ' ДоМ ' }, { key: 'other', query: 'дом' },
        { key: 'дом', query: 'Кот', extra: { ignored: true } }
    ]);
    assert.deepStrictEqual(history.list(), [
        { key: 'дом', query: 'ДоМ' }, { key: 'кот', query: 'Кот' }
    ]);
});

test('restored oversized history is capped and next write persists actual cap', () => {
    const { history, writes } = fixture(Array.from({ length: 25 }, (_, i) => ({ query: 'w' + i })));
    assert.strictEqual(history.list().length, 20);
    assert.strictEqual(history.list()[19].query, 'w19');
    history.record('new');
    assert.strictEqual(writes[0].length, 20);
    assert.strictEqual(writes[0][19].query, 'w18');
});

test('NFC equivalence deduplicates query and key', () => {
    const { history } = fixture([]);
    history.record(' Е\u0308ЛКА ');
    history.record('ёлка');
    history.record('И\u0306');
    assert.deepStrictEqual(history.list(), [
        { key: 'й', query: 'Й' }, { key: 'ёлка', query: 'ёлка' }
    ]);
});

test('yo, short i and combining stress remain distinct', () => {
    const { history } = fixture([]);
    ['е', 'ё', 'и', 'й', 'дом', 'до\u0301м'].forEach(query => history.record(query));
    assert.strictEqual(history.list().length, 6);
    assert.strictEqual(history.list()[0].key, 'до\u0301м');
});

test('invalid inputs never write, including controls before trim', () => {
    const { history, writes } = fixture([]);
    [undefined, null, 7, {}, [], '', '   ', 'a'.repeat(65), '😀'.repeat(65)].forEach(query => history.record(query));
    for (let code = 0; code <= 159; code += 1) {
        if (code <= 31 || code >= 127) history.record(String.fromCharCode(code) + 'word');
    }
    assert.deepStrictEqual(history.list(), []);
    assert.strictEqual(writes.length, 0);
});

test('one through sixty four NFC Unicode characters accepted', () => {
    const { history, writes } = fixture([]);
    [' Я ', 'я'.repeat(64), '😀'.repeat(64), 'Е\u0308'.repeat(64)].forEach(query => history.record(query));
    assert.strictEqual(writes.length, 4);
    assert.strictEqual(history.list()[0].query, 'Ё'.repeat(64));
});

test('read errors are identifiable and preserve original cause', () => {
    const cause = new Error('read denied');
    assert.throws(() => createDictionaryHistory({
        read() { throw cause; },
        write() { assert.fail('must not write'); }
    }), error => error.code === 'DICTIONARY_HISTORY_READ_FAILED' && error.cause === cause);
});

test('failed record, remove and clear keep committed memory and expose write errors', () => {
    const cause = new Error('quota');
    const history = createDictionaryHistory({
        read() { return [{ query: 'Дом' }]; },
        write(records) {
            records.push({ key: 'bad', query: 'bad' });
            throw cause;
        }
    });
    [() => history.record('Кот'), () => history.remove('дом'), () => history.clear()].forEach(action => {
        assert.throws(action, error => error.code === 'DICTIONARY_HISTORY_WRITE_FAILED' && error.cause === cause);
        assert.deepStrictEqual(history.list(), [{ key: 'дом', query: 'Дом' }]);
    });
});

test('external list, original read data and write arrays cannot mutate service', () => {
    const initial = [{ query: 'Дом' }];
    const { history, writes } = fixture(initial);
    initial[0].query = 'bad';
    initial.push({ query: 'bad' });
    const listed = history.list();
    listed[0].query = 'bad';
    listed[0].key = 'bad';
    listed.push({ key: 'bad', query: 'bad' });
    assert.deepStrictEqual(history.list(), [{ key: 'дом', query: 'Дом' }]);
    history.record('Кот');
    writes[0][0].query = 'bad';
    writes[0].length = 0;
    assert.deepStrictEqual(history.list(), [
        { key: 'кот', query: 'Кот' }, { key: 'дом', query: 'Дом' }
    ]);
});

console.log('dictionary history tests: PASS (' + passed + '/' + passed + ')');
