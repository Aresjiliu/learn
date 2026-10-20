const assert = require('assert');
const fs = require('fs');
const path = require('path');
const filename = path.resolve(__dirname, '../pages/wordbook/wordbook.js');
assert.ok(fs.existsSync(filename), 'a real local wordbook Page must exist');
const { createWxWordbook } = require('../services/wordbook-wx');
const clone = value => JSON.parse(JSON.stringify(value));
const entry = index => ({ sourceType: 'dictionary', entryId: `dict:${index}:0123456789abcdef`,
    headword: `слово${index}`, summary: '已保存的离线释义\u0301' });

function harness(count = 0) {
    const values = new Map();
    const faults = {};
    const navigation = [];
    const modals = [];
    const updates = [];
    const wx = {
        getStorageInfoSync() { if (faults.read) throw Error('read'); return { keys: [...values.keys()] }; },
        getStorageSync(key) { return values.get(key); },
        setStorageSync(key, value) { if (faults.write) throw Error('quota'); values.set(key, clone(value)); },
        navigateTo(options) { navigation.push(options.url); },
        showModal(options) { modals.push(options); }
    };
    const book = createWxWordbook(wx, () => 1000);
    for (let index = 0; index < count; index++) book.add(entry(index));
    let definition;
    new Function('Page', 'wx', 'require', fs.readFileSync(filename, 'utf8'))(
        value => { definition = value; }, wx, require('module').createRequire(filename));
    const page = { ...definition, data: clone(definition.data), setData(patch) {
        updates.push(clone(patch));
        Object.keys(patch).forEach(key => {
            const match = /^visibleRecords\[(\d+)\]$/.exec(key);
            if (match) this.data.visibleRecords[Number(match[1])] = clone(patch[key]);
            else this.data[key] = clone(patch[key]);
        });
    } };
    page.onLoad();
    page.onShow();
    return { page, book, values, faults, navigation, modals, updates };
}

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
const event = key => ({ currentTarget: { dataset: { key } } });

test('guest book shows true counts and bounded incremental pages', () => {
    const h = harness(45);
    assert.strictEqual(h.page.data.total, 45);
    assert.strictEqual(h.page.data.visibleRecords.length, 20);
    h.page.loadMore();
    assert.strictEqual(h.page.data.visibleRecords.length, 40);
    assert.ok(!Object.hasOwn(h.updates[h.updates.length - 1], 'visibleRecords'));
    h.page.loadMore();
    assert.strictEqual(h.page.data.visibleRecords.length, 45);
    assert.strictEqual(h.page.data.hasMore, false);
    assert.strictEqual(new Set(h.page.data.visibleRecords.map(row => row.key)).size, 45);
    h.updates.forEach(update => assert.ok(Buffer.byteLength(JSON.stringify(update)) < 128 * 1024));
});
test('maximum valid snapshots are split by bytes rather than all twenty at once', () => {
    const h = harness();
    for (let index = 0; index < 40; index++) h.book.add({ ...entry(index),
        headword: '词'.repeat(256), summary: '义'.repeat(2000) });
    h.page.onShow();
    assert.ok(h.page.data.visibleRecords.length < 20, 'maximum snapshots must reduce the batch size');
    while (h.page.data.hasMore) h.page.loadMore();
    assert.strictEqual(h.page.data.visibleRecords.length, 40);
    h.updates.forEach(update => assert.ok(Buffer.byteLength(JSON.stringify(update)) < 128 * 1024));
});
test('empty book differs from read failure and unknown format', () => {
    const h = harness();
    assert.strictEqual(h.page.data.total, 0);
    assert.strictEqual(h.page.data.loadError, '');
    h.faults.read = true;
    h.page.refresh();
    assert.strictEqual(h.page.data.total, null);
    assert.strictEqual(h.page.data.readOnly, true);
    assert.ok(h.page.data.loadError);
    h.faults.read = false;
    const future = { version: 99, records: [entry(2)] };
    h.values.set('wordbook_guest_v1', future);
    h.page.refresh();
    assert.strictEqual(h.page.data.total, null);
    assert.strictEqual(h.page.data.readOnly, true);
    assert.ok(h.page.data.notice);
    h.page.requestRemove(event(entry(2).entryId));
    assert.strictEqual(h.modals.length, 0);
    assert.strictEqual(h.values.get('wordbook_guest_v1'), future);
});
test('corrupt book exposes recovered summaries without a false authoritative total', () => {
    const h = harness(1);
    h.values.get('wordbook_guest_v1').records.push({ broken: true });
    const before = clone(h.values.get('wordbook_guest_v1'));
    h.page.refresh();
    assert.strictEqual(h.page.data.total, null);
    assert.strictEqual(h.page.data.visibleRecords.length, 1);
    assert.strictEqual(h.page.data.readOnly, true);
    assert.deepStrictEqual(h.values.get('wordbook_guest_v1'), before);
});
test('remove requires confirmation, persists, and failed writes keep the list', () => {
    const h = harness(2);
    const key = entry(1).entryId;
    h.page.requestRemove(event(key));
    h.modals[0].success({ confirm: false });
    assert.strictEqual(h.book.inspect().records.length, 2);
    h.page.requestRemove(event(key));
    h.faults.write = true;
    h.modals[1].success({ confirm: true });
    assert.strictEqual(h.page.data.total, 2);
    assert.ok(h.page.data.loadError);
    h.faults.write = false;
    h.page.requestRemove(event(key));
    h.modals[2].success({ confirm: true });
    assert.strictEqual(h.page.data.total, 1);
    assert.strictEqual(h.book.inspect().records.length, 1);
    h.page.onShow();
    assert.strictEqual(h.page.data.total, 1);
});
test('dictionary links retain stable IDs and textbook links retain source zero', () => {
    const h = harness(1);
    h.page.openDetail(event(entry(0).entryId));
    assert.ok(h.navigation[0].includes('id=' + encodeURIComponent(entry(0).entryId)));
    const saved = h.book.add({ sourceType: 'textbook', collectionId: 0, sourceId: 0, headword: 'ё & ?#', summary: '教材摘要' });
    h.page.onShow();
    h.page.openDetail(event(saved.key));
    const query = new URL('https://fixture.invalid' + h.navigation[1]).searchParams;
    assert.strictEqual(query.get('q'), 'ё & ?#');
    assert.strictEqual(query.get('collectionId'), '0');
    assert.strictEqual(query.get('textbookId'), '0');
    assert.strictEqual(query.get('meaning'), '教材摘要');
    assert.strictEqual(query.has('id'), false);
});
test('offline summaries expand without API requests and reset on reload', () => {
    const h = harness(1);
    h.page.toggleSummary(event(entry(0).entryId));
    assert.strictEqual(h.page.data.expandedKey, entry(0).entryId);
    assert.strictEqual(h.page.data.visibleRecords[0].summary, entry(0).summary.normalize('NFC'));
    h.page.toggleSummary(event(entry(0).entryId));
    assert.strictEqual(h.page.data.expandedKey, '');
    h.page.onShow();
    assert.strictEqual(h.page.data.expandedKey, '');
});
test('hidden and unloaded pages ignore actions and delayed deletion confirmation', () => {
    for (const method of ['onHide', 'onUnload']) {
        const h = harness(1);
        h.page.requestRemove(event(entry(0).entryId));
        h.page[method]();
        const before = h.updates.length;
        h.modals[0].success({ confirm: true });
        h.page.requestRemove(event(entry(0).entryId));
        h.page.openDetail(event(entry(0).entryId));
        h.page.toggleSummary(event(entry(0).entryId));
        h.page.loadMore();
        h.page.refresh();
        assert.strictEqual(h.updates.length, before);
        assert.strictEqual(h.book.inspect().records.length, 1);
        assert.strictEqual(h.navigation.length, 0);
    }
});
test('returning to the page never revives an earlier deletion confirmation', () => {
    const h = harness(1);
    h.page.requestRemove(event(entry(0).entryId));
    h.page.onHide();
    h.page.onShow();
    h.modals[0].success({ confirm: true });
    assert.strictEqual(h.book.inspect().records.length, 1);
    h.page.requestRemove(event(entry(0).entryId));
    h.modals[1].success({ confirm: false });
    h.modals[1].success({ confirm: true });
    assert.strictEqual(h.book.inspect().records.length, 1);
});
test('a storage fault during confirmed deletion becomes unknown instead of a stale count', () => {
    const h = harness(1);
    h.page.requestRemove(event(entry(0).entryId));
    h.faults.read = true;
    h.modals[0].success({ confirm: true });
    assert.strictEqual(h.page.data.total, null);
    assert.strictEqual(h.page.data.readOnly, true);
    assert.ok(h.page.data.loadError);
    h.faults.read = false;
    assert.strictEqual(h.book.inspect().records.length, 1);
});
test('wordbook has a registered guest route and a usable dictionary entry', () => {
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf8'));
    assert.ok(config.pages.includes('pages/wordbook/wordbook'));
    const searchFile = path.resolve(__dirname, '../pages/dictionary/search/search.js');
    let definition;
    const navigation = [];
    new Function('Page', 'wx', 'require', fs.readFileSync(searchFile, 'utf8').replace(/^import .*$/gm, ''))(
        value => { definition = value; }, { navigateTo: options => navigation.push(options.url) },
        require('module').createRequire(searchFile));
    definition.openWordbook.call({ _isUnloaded: false });
    definition.openWordbook.call({ _isUnloaded: true });
    assert.deepStrictEqual(navigation, ['/pages/wordbook/wordbook']);
    assert.match(fs.readFileSync(searchFile.replace(/\.js$/, '.wxml'), 'utf8'), /bindtap="openWordbook"/);
});
test('detail can reach the local book without reviving hidden or unloaded pages', () => {
    const file = path.resolve(__dirname, '../pages/dictionary/detail/detail.js');
    let definition;
    const navigation = [];
    new Function('Page', 'wx', fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, ''))(
        value => { definition = value; }, { navigateTo: options => navigation.push(options.url) });
    definition.openWordbook.call({ _isUnloaded: false, _isHidden: false });
    definition.openWordbook.call({ _isUnloaded: true, _isHidden: false });
    definition.openWordbook.call({ _isUnloaded: false, _isHidden: true });
    assert.deepStrictEqual(navigation, ['/pages/wordbook/wordbook']);
    assert.match(fs.readFileSync(file.replace(/\.js$/, '.wxml'), 'utf8'), /bindtap="openWordbook"/);
});
console.log(`wordbook Page: ${passed}/${passed} passed (not visual acceptance)`);
