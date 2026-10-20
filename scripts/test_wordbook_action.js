const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { createWxWordbook } = require('../services/wordbook-wx');
const { presentDictionaryDetail } = require('../services/dictionary-presentation');
const componentPath = path.join(__dirname, '../components/wordbook-action/index.js');
assert.ok(fs.existsSync(componentPath), 'real wordbook action component must exist');
const source = fs.readFileSync(componentPath, 'utf8');
const id = 'dict:181123:c6612fa04f6e73bc';
const otherId = 'dict:42:0123456789abcdef';
const word = { id, headword: 'камера', meaningText: '房间', audioUrl: 'private-url', token: 'secret', metadata: { private: true } };
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const plain = value => JSON.parse(JSON.stringify(value));

function harness(initial) {
    let stored = clone(initial);
    let present = arguments.length > 0;
    let definition;
    let reads = 0;
    let writes = 0;
    const fail = { read: false, readAt: 0, valueRead: false, write: false };
    const platform = {
        getStorageInfoSync() {
            reads++;
            if (fail.read || reads === fail.readAt) throw Error('read failure');
            return { keys: present ? ['wordbook_guest_v1'] : [] };
        },
        getStorageSync() {
            if (fail.valueRead) throw Error('value read failure');
            return clone(stored);
        },
        setStorageSync(key, value) {
            assert.strictEqual(key, 'wordbook_guest_v1');
            writes++;
            if (fail.write) throw Error('quota');
            stored = clone(value);
            present = true;
        }
    };
    // One evaluation, multiple instances: module scope and definition are shared as in WeChat.
    vm.runInNewContext(source, { require: createRequire(componentPath), wx: platform, Component(value) { definition = value; } }, { filename: componentPath });
    function instance(entry = word, sourceContext = null) {
        const c = {
            data: clone(definition.data), properties: { entry, sourceContext }, updates: 0,
            setData(patch) { this.updates++; Object.assign(this.data, plain(patch)); }
        };
        Object.keys(definition.methods).forEach(key => { c[key] = definition.methods[key].bind(c); });
        c.change = (entryValue, context = null) => {
            c.properties.entry = entryValue;
            c.properties.sourceContext = context;
            definition.observers['entry, sourceContext'].call(c, entryValue, context);
        };
        c.attach = () => definition.lifetimes.attached.call(c);
        c.detach = () => definition.lifetimes.detached.call(c);
        c.hide = () => definition.pageLifetimes.hide.call(c);
        c.show = () => definition.pageLifetimes.show.call(c);
        c.attach();
        return c;
    }
    return { instance, fail, platform, get value() { return stored; }, get reads() { return reads; }, get writes() { return writes; }, definition };
}

let passed = 0;
function test(name, run) {
    run(); passed++; console.log('PASS ' + name);
}
test('attached reads actual state, toggle persists and removes through real adapter', () => {
    const h = harness(); const c = h.instance();
    assert.strictEqual(c.data.saved, false);
    assert.strictEqual(c.data.blocked, false);
    c.toggle();
    assert.strictEqual(c.data.saved, true);
    assert.strictEqual(h.value.records[0].key, id);
    assert.deepStrictEqual(Object.keys(h.value.records[0]).sort(), ['key', 'sourceType', 'entryId', 'headword', 'summary', 'savedAt'].sort());
    c.toggle();
    assert.strictEqual(c.data.saved, false);
    assert.strictEqual(h.value.records.length, 0);
});
test('two instances in the same VM isolate entries and preserve interleaved additions/removals', () => {
    const h = harness(); const a = h.instance(); const b = h.instance({ ...word, id: otherId });
    a.toggle(); b.toggle();
    assert.deepStrictEqual(h.value.records.map(row => row.key).sort(), [id, otherId].sort());
    a.toggle();
    assert.deepStrictEqual(h.value.records.map(row => row.key), [otherId]);
    assert.strictEqual(b.data.saved, true);
});
test('click inspects latest shared state instead of duplicating a stale addition', () => {
    const h = harness(); const a = h.instance(); const b = h.instance();
    a.toggle(); const timestamp = h.value.records[0].savedAt;
    b.show(); a.show();
    assert.strictEqual(h.value.records[0].savedAt, timestamp);
    assert.strictEqual(h.writes, 1);
    const stale = h.instance();
    b.toggle();
    assert.strictEqual(stale.data.saved, true);
    stale.toggle();
    assert.strictEqual(stale.data.saved, true);
    assert.strictEqual(h.value.records.length, 1);
    const unseen = h.instance();
    unseen.toggle();
    a.toggle(); // a still displays saved, but latest state is absent: add, not remove.
    assert.strictEqual(h.value.records.length, 1);
});
test('duplicate adapter addition and component refresh do not reset savedAt', () => {
    const h = harness(); const book = createWxWordbook(h.platform, () => 123);
    book.add({ sourceType: 'dictionary', entryId: id, headword: 'камера', summary: '房间' });
    const c = h.instance();
    createWxWordbook(h.platform, () => 999).add({ sourceType: 'dictionary', entryId: id, headword: 'камера' });
    c.show(); c.change(word);
    assert.strictEqual(c.data.saved, true);
    assert.strictEqual(h.value.records[0].savedAt, 123);
    assert.strictEqual(h.writes, 1);
});
test('observer changes word/context and clears prior saved/error state', () => {
    const h = harness(); const c = h.instance(); c.toggle();
    c.change({ ...word, id: otherId });
    assert.strictEqual(c.data.saved, false);
    c.change({ word: 'дом', id: 1 }, { collectionId: 0, sourceId: 0 });
    c.toggle();
    assert.strictEqual(h.value.records[0].key, 'textbook:["0","0"]');
    c.change({ word: 'дом', id: 1 }, { collectionId: 0, sourceId: 1 });
    assert.strictEqual(c.data.saved, false);
    c.change(null);
    assert.strictEqual(c.data.eligible, false);
    assert.strictEqual(c.data.saved, null);
});
test('missing identity hides action with explanation and never accesses storage', () => {
    const h = harness(); const c = h.instance({ id: 12, word: 'камера', audioUrl: 'playable' });
    assert.strictEqual(c.data.eligible, false);
    assert.ok(c.data.statusText);
    c.toggle(); c.retry();
    assert.strictEqual(h.reads, 0);
    assert.strictEqual(h.writes, 0);
});
test('hidden/unloaded clicks and observers cannot read, write or update; show resumes', () => {
    const h = harness(); const c = h.instance();
    c.hide();
    const before = [h.reads, h.writes, c.updates];
    c.toggle(); c.retry(); c.change({ ...word, id: otherId });
    assert.deepStrictEqual([h.reads, h.writes, c.updates], before);
    c.show(); c.toggle();
    assert.strictEqual(h.value.records[0].key, otherId);
    c.detach();
    const after = [h.reads, h.writes, c.updates];
    c.toggle(); c.retry(); c.show(); c.change(word);
    assert.deepStrictEqual([h.reads, h.writes, c.updates], after);
});
test('one instance detaching does not disable another instance', () => {
    const h = harness(); const a = h.instance(); const b = h.instance({ ...word, id: otherId });
    a.detach(); b.toggle();
    assert.strictEqual(b.data.saved, true);
    assert.strictEqual(h.value.records[0].key, otherId);
});
test('read failure shows unknown state, disables toggle, and visible retry recovers', () => {
    const h = harness(); h.fail.read = true; const c = h.instance();
    assert.strictEqual(c.data.saved, null);
    assert.strictEqual(c.data.blocked, true);
    assert.ok(c.data.errorText);
    c.toggle();
    assert.strictEqual(h.writes, 0);
    h.fail.read = false; c.retry();
    assert.strictEqual(c.data.saved, false);
    assert.strictEqual(c.data.errorText, '');
    c.toggle(); assert.strictEqual(c.data.saved, true);
});
test('latest inspect failure blocks mutation even after a successful earlier read', () => {
    const h = harness(); const c = h.instance(); h.fail.read = true; c.toggle();
    assert.strictEqual(c.data.saved, null);
    assert.strictEqual(c.data.blocked, true);
    assert.strictEqual(h.writes, 0);
});
for (const alreadySaved of [false, true]) {
    test('adapter reread failure during ' + (alreadySaved ? 'remove' : 'add') + ' becomes unknown, never an empty book', () => {
        const h = harness(); const c = h.instance();
        if (alreadySaved) c.toggle();
        const before = clone(h.value); const writes = h.writes;
        h.fail.readAt = h.reads + 2; // inspect succeeds; real adapter's mutation read fails.
        c.toggle();
        assert.strictEqual(c.data.saved, null);
        assert.strictEqual(c.data.blocked, true);
        assert.ok(c.data.errorText);
        assert.deepStrictEqual(h.value, before);
        assert.strictEqual(h.writes, writes);
        c.retry();
        assert.strictEqual(c.data.saved, alreadySaved);
    });
}
test('value read failure becomes unknown and retry restores actual membership', () => {
    const h = harness(); const c = h.instance(); c.toggle();
    h.fail.valueRead = true; c.show();
    assert.strictEqual(c.data.saved, null);
    assert.ok(c.data.errorText);
    h.fail.valueRead = false; c.retry();
    assert.strictEqual(c.data.saved, true);
});
test('unknown version introduced after attachment blocks latest click without overwriting', () => {
    const h = harness(); const c = h.instance();
    const future = { version: 9, records: [], private: 'preserve' };
    h.platform.setStorageSync('wordbook_guest_v1', future);
    const writes = h.writes;
    c.toggle();
    assert.strictEqual(c.data.saved, null);
    assert.strictEqual(c.data.blocked, true);
    assert.deepStrictEqual(h.value, future);
    assert.strictEqual(h.writes, writes);
});
for (const damaged of [null, '', undefined, { version: 9, records: [] }, { version: 1, records: [{}] }, { version: 1, records: [{ key: id }] }]) {
    test('unknown/corrupt storage stays unknown and unchanged: ' + JSON.stringify(damaged), () => {
        const h = harness(damaged); const c = h.instance();
        assert.strictEqual(c.data.saved, null);
        assert.strictEqual(c.data.blocked, true);
        assert.ok(c.data.errorText);
        assert.ok(!/未加入|0词/.test(c.data.statusText));
        c.toggle(); c.retry();
        assert.strictEqual(h.writes, 0);
        assert.deepStrictEqual(h.value, damaged);
    });
}
for (const alreadySaved of [false, true]) {
    test('write failure preserves displayed state on ' + (alreadySaved ? 'remove' : 'add') + ' and retry recovers', () => {
        const h = harness(); const c = h.instance();
        if (alreadySaved) c.toggle();
        const before = clone(h.value); const status = c.data.statusText;
        h.fail.write = true; c.toggle();
        assert.strictEqual(c.data.saved, alreadySaved);
        assert.strictEqual(c.data.statusText, status);
        assert.ok(c.data.errorText);
        assert.deepStrictEqual(h.value, before);
        h.fail.write = false; c.retry(); c.toggle();
        assert.strictEqual(c.data.saved, !alreadySaved);
    });
}
test('component uses only services and exposes compact accessible local UI', () => {
    const template = fs.readFileSync(componentPath.replace('.js', '.wxml'), 'utf8');
    const style = fs.readFileSync(componentPath.replace('.js', '.wxss'), 'utf8');
    const config = JSON.parse(fs.readFileSync(componentPath.replace('.js', '.json'), 'utf8'));
    assert.strictEqual(config.component, true);
    assert.ok(!/getStorage|setStorage|wordbook_guest|request\(|https?:|dict:|JSON\.stringify/.test(source));
    assert.match(template, /wx:if="\{\{eligible\}\}"/);
    assert.match(template, /disabled="\{\{blocked\}\}"/);
    assert.match(template, /aria-label=/);
    assert.match(template, /aria-pressed=/);
    assert.match(template, /加入生词本/);
    assert.match(template, /已加入/);
    assert.match(template, /仅保存在本机/);
    assert.match(template, /bind:tap="retry"/);
    assert.match(template, /errorText/);
    assert.match(style, /min-height:\s*88rpx/);
    assert.match(style, /var\(--color-(primary|accent)/);
    assert.ok(!/navigateTo|switchTab/.test(source));
});
test('component styles use BEM classes without tag, ID or attribute selectors', () => {
    const template = fs.readFileSync(componentPath.replace('.js', '.wxml'), 'utf8');
    const style = fs.readFileSync(componentPath.replace('.js', '.wxss'), 'utf8');
    const rules = style.match(/[^{}]+\{[^{}]*\}/g) || [];
    assert.ok(rules.length > 0);
    for (const rule of rules) {
        for (const selector of rule.slice(0, rule.indexOf('{')).split(',')) {
            assert.match(selector.trim(), /^\.wordbook-action(?:__[a-z-]+)?(?:::after)?$/, 'class-only BEM selector required: ' + selector.trim());
        }
    }
    assert.match(template, /class="wordbook-action__button \{\{blocked \? 'wordbook-action__button--disabled' : ''\}\}"/);
    assert.match(template, /<text wx:if="\{\{blocked \|\| !eligible\}\}" class="wordbook-action__status-text">\{\{statusText\}\}<\/text>/);
    assert.match(style, /\.wordbook-action__button--disabled\s*\{/);
    assert.match(style, /\.wordbook-action__status-text/);
    assert.match(template, /disabled="\{\{blocked\}\}"/);
});
test('normal writable UI shows only local notice while blocked or ineligible UI keeps status', () => {
    const template = fs.readFileSync(componentPath.replace('.js', '.wxml'), 'utf8');
    assert.match(template, /<text wx:if="\{\{blocked \|\| !eligible\}\}" class="wordbook-action__status-text">\{\{statusText\}\}<\/text>/);
    assert.match(template, /<text class="wordbook-action__local">仅保存在本机<\/text>/);
    const h = harness(); const c = h.instance();
    assert.strictEqual(c.data.statusText, '尚未加入生词本');
    assert.strictEqual(c.data.blocked || !c.data.eligible, false);
    c.toggle();
    assert.strictEqual(c.data.statusText, '已保存在本机');
    assert.strictEqual(c.data.blocked || !c.data.eligible, false);
    h.fail.read = true; c.retry();
    assert.ok(c.data.statusText);
    assert.strictEqual(c.data.blocked || !c.data.eligible, true);
    c.change({ id: 123, word: 'дом' });
    assert.ok(c.data.statusText);
    assert.strictEqual(c.data.blocked || !c.data.eligible, true);
});
test('detail registers component and passes entry/context immediately after word header', () => {
    const base = path.join(__dirname, '../pages/dictionary/detail/detail');
    const template = fs.readFileSync(base + '.wxml', 'utf8');
    const config = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
    assert.strictEqual(config.usingComponents['wordbook-action'], '/components/wordbook-action/index');
    assert.match(template, /<wordbook-action entry="\{\{word\}\}" source-context="\{\{wordbookContext\}\}"\s*\/>/);
    assert.ok(template.indexOf('<wordbook-action') > template.indexOf('class="word-head"'));
    assert.ok(template.indexOf('<wordbook-action') < template.indexOf('class="word-section"'));
});
test('detail builds explicit route context including zero and clears it on new/bad routes', () => {
    const file = path.join(__dirname, '../pages/dictionary/detail/detail.js');
    let definition;
    vm.runInNewContext(fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, ''), {
        Page(value) { definition = value; }, presentDictionaryDetail,
        config: {}, audioController: { stop() {} }, getLocalDictionaryDetail: () => ({ word: 'дом' }),
        getLocalTextbookAudioUrl: () => ''
    });
    const page = { ...definition, data: clone(definition.data), setData(patch) { Object.assign(this.data, plain(patch)); } };
    assert.strictEqual(page.data.wordbookContext, null);
    for (const zero of [0, '0']) {
        page.onLoad({ q: 'дом', collectionId: zero, textbookId: zero });
        assert.deepStrictEqual(page.data.wordbookContext, { collectionId: '0', sourceId: '0' });
    }
    page.onLoad({ q: 'дом', collectionId: encodeURIComponent('book &/?'), textbookId: 'row%2F0' });
    assert.deepStrictEqual(page.data.wordbookContext, { collectionId: 'book &/?', sourceId: 'row/0' });
    page.onLoad({ q: '%' });
    assert.strictEqual(page.data.wordbookContext, null);
    assert.strictEqual(page.data.word, null);
    page.onLoad({ q: 'дом', collectionId: 'book' });
    assert.strictEqual(page.data.wordbookContext, null);
    page.onLoad({ q: '', collectionId: 'book', textbookId: 'row' });
    assert.strictEqual(page.data.wordbookContext, null);
});
console.log(`wordbook action: ${passed}/${passed} passed`);
