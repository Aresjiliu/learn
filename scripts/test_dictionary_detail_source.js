const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { presentDictionaryDetail } = require('../services/dictionary-presentation');
const detailPath = path.join(__dirname, '../pages/dictionary/detail/detail');
const source = fs.readFileSync(detailPath + '.js', 'utf8').replace(/^import .*$/gm, '');
const sampleNotice = '当前为离线样本，完整词典暂不可用';
const materialNotice = '当前为本地教材资料，完整词典暂不可用';
const settle = () => new Promise(resolve => setImmediate(resolve));
const route = (id = '66262', q = 'камера') => ({ id: encodeURIComponent(id), q: encodeURIComponent(q) });
const word = { id: '66262', word: 'камера', meaning: '原文\n完整保留', examples: ['一', '二', '三'] };
const response = (sourceName, value = word) => ({ data: { word: value }, meta: { source: sourceName } });

function harness(options = {}) {
    let definition;
    const pending = [];
    const navigation = [];
    let localCalls = 0;
    let writes = 0;
    vm.runInNewContext(source, {
        Page(value) { definition = value; },
        getDictionaryDetail(id) {
            return new Promise((resolve, reject) => pending.push({ id, resolve, reject }));
        },
        getLocalDictionaryDetail() { localCalls++; return options.local === undefined ? word : options.local; },
        getLocalTextbookAudioUrl: () => '',
        presentDictionaryDetail,
        config: { enableLocalDictionaryApi: true, ...options.config },
        audioController: { stop() {} },
        wx: { navigateTo(value) { navigation.push(value.url); }, showToast() {} }
    }, { filename: detailPath + '.js' });
    const page = {
        ...definition,
        data: JSON.parse(JSON.stringify(definition.data)),
        setData(patch) { writes++; Object.assign(this.data, patch); }
    };
    return { page, pending, navigation, get writes() { return writes; }, get localCalls() { return localCalls; } };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

for (const sourceName of ['local-sample', 'local-sample-fallback']) {
    test(sourceName + ' exposes a page notice and query-only recovery', async () => {
        const h = harness();
        const q = 'камера & ?#ё';
        h.page.onLoad(route('66262', q));
        h.pending[0].resolve(response(sourceName));
        await settle();
        assert.strictEqual(h.page.data.sourceNotice, sampleNotice);
        assert.strictEqual(h.page.data.word.id, '66262');
        assert.strictEqual(h.page.data.word.meaningText, word.meaning);
        assert.strictEqual(h.page.data.word.exampleItems.length, 3);
        h.page.queryFullDictionary();
        assert.deepStrictEqual(h.navigation, ['/pages/dictionary/search/search?q=' + encodeURIComponent(q)]);
        assert.strictEqual(h.pending.length, 1, 'recovery must only navigate, never remap an ID');
    });
}

test('dictionary-index success has no sample notice and preserves a stable ID', async () => {
    const h = harness();
    h.page.onLoad(route('dict:41:camera'));
    h.pending[0].resolve(response('dictionary-index', { ...word, id: 'dict:41:camera' }));
    await settle();
    assert.strictEqual(h.page.data.sourceNotice, '');
    assert.strictEqual(h.page.data.word.id, 'dict:41:camera');
    assert.strictEqual(h.localCalls, 0);
});

for (const online of [true, false]) {
    test((online ? 'failed request' : 'offline route') + ' labels actual local fallback as sample', async () => {
        const h = harness({ config: { enableLocalDictionaryApi: online } });
        h.page.onLoad(route());
        if (online) h.pending[0].reject(Error('offline'));
        await settle();
        assert.strictEqual(h.page.data.sourceNotice, sampleNotice);
        assert.strictEqual(h.page.data.word.id, '66262');
        assert.strictEqual(h.page.data.loadError, '');
    });
}

test('route-only textbook fields are local material, and absent fallback stays empty', async () => {
    const h = harness({ local: { word: 'unrelated' } });
    h.page.onLoad({ ...route(), meaning: encodeURIComponent('教材释义'), examples: encodeURIComponent('教材例句') });
    h.pending[0].reject(Error('offline'));
    await settle();
    assert.strictEqual(h.page.data.sourceNotice, materialNotice);
    assert.strictEqual(h.page.data.word.sourceType, 'textbook');
    assert.strictEqual(h.page.data.word.meaningText, '教材释义');
    assert.strictEqual(h.page.data.word.exampleItems[0].text, '教材例句');
    h.page.onLoad(route());
    h.pending[1].reject(Error('offline'));
    await settle();
    assert.strictEqual(h.page.data.word, null);
    assert.ok(h.page.data.loadError);
    assert.strictEqual(h.page.data.sourceNotice, '');
});

test('retry, new route and invalid route reset the notice immediately', async () => {
    const h = harness();
    h.page.onLoad(route());
    h.pending[0].resolve(response('local-sample'));
    await settle();
    assert.strictEqual(h.page.data.sourceNotice, sampleNotice);
    h.page.retryLoad();
    assert.strictEqual(h.page.data.sourceNotice, '');
    h.pending[1].resolve(response('local-sample'));
    await settle();
    h.page.onLoad(route('dict:42', 'дом'));
    assert.strictEqual(h.page.data.sourceNotice, '');
    h.pending[2].resolve(response('local-sample', { ...word, id: 'other' }));
    await settle();
    assert.ok(h.page.data.loadError);
    h.page.onLoad({ q: '%' });
    assert.strictEqual(h.page.data.sourceNotice, '');
    assert.ok(h.page.data.loadError);
});

for (const lateFailure of [false, true]) {
    test('old ' + (lateFailure ? 'rejection' : 'response') + ' cannot overwrite a newer route', async () => {
        const h = harness();
        h.page.onLoad(route());
        h.page.onLoad(route('dict:42', 'дом'));
        h.pending[1].resolve(response('dictionary-index', { id: 'dict:42', word: 'дом' }));
        await settle();
        const before = h.writes;
        if (lateFailure) h.pending[0].reject(Error('late'));
        else h.pending[0].resolve(response('local-sample'));
        await settle();
        assert.strictEqual(h.writes, before);
        assert.strictEqual(h.page.data.sourceNotice, '');
        assert.strictEqual(h.page.data.word.id, 'dict:42');
    });
}

for (const lateFailure of [false, true]) {
    test('unload blocks late ' + (lateFailure ? 'failure' : 'success') + ' and recovery navigation', async () => {
        const h = harness();
        h.page.onLoad(route());
        h.page.onUnload();
        const before = h.writes;
        if (lateFailure) h.pending[0].reject(Error('late'));
        else h.pending[0].resolve(response('local-sample'));
        await settle();
        h.page.queryFullDictionary();
        h.page.retryLoad();
        assert.strictEqual(h.writes, before);
        assert.strictEqual(h.navigation.length, 0);
        assert.strictEqual(h.pending.length, 1, 'unloaded retry must not revive the page');
    });
}

test('hide/show return retains the sample notice and recovery does not reload the sample ID', async () => {
    const h = harness();
    h.page.onLoad(route());
    h.pending[0].resolve(response('local-sample'));
    await settle();
    h.page.queryFullDictionary();
    h.page.onHide();
    h.page.queryFullDictionary();
    assert.strictEqual(h.navigation.length, 1, 'a hidden page must not navigate again');
    h.page.onShow();
    assert.strictEqual(h.page.data.sourceNotice, sampleNotice);
    assert.strictEqual(h.pending.length, 1);
    assert.strictEqual(h.page.data.word.id, '66262');
});

test('separate Page instances retain independent source and lifecycle state', async () => {
    const sample = harness();
    const indexed = harness();
    sample.page.onLoad(route());
    indexed.page.onLoad(route('dict:42', 'дом'));
    sample.pending[0].resolve(response('local-sample'));
    indexed.pending[0].resolve(response('dictionary-index', { id: 'dict:42', word: 'дом' }));
    await settle();
    sample.page.onUnload();
    indexed.page.queryFullDictionary();
    assert.strictEqual(sample.page.data.sourceNotice, sampleNotice);
    assert.strictEqual(indexed.page.data.sourceNotice, '');
    assert.strictEqual(indexed.page.data.word.id, 'dict:42');
    assert.deepStrictEqual(indexed.navigation, ['/pages/dictionary/search/search?q=' + encodeURIComponent('дом')]);
});

for (const outcome of ['reject', 'empty', 'wrong-id', 'sample-with-stable-id', 'disabled']) {
    test('stable ID ' + outcome + ' remains an explicit failure without local lookup', async () => {
        const h = harness({ config: { enableLocalDictionaryApi: outcome !== 'disabled' } });
        h.page.onLoad({ ...route('dict:missing'), meaning: encodeURIComponent('不能伪装成功') });
        if (outcome === 'reject') h.pending[0].reject(Error('offline'));
        if (outcome === 'empty') h.pending[0].resolve(response('dictionary-index', null));
        if (outcome === 'wrong-id') h.pending[0].resolve(response('dictionary-index'));
        if (outcome === 'sample-with-stable-id') h.pending[0].resolve(response('local-sample-fallback', { ...word, id: 'dict:missing' }));
        await settle();
        assert.strictEqual(h.page.data.word, null);
        assert.ok(h.page.data.loadError);
        assert.strictEqual(h.page.data.sourceNotice, '');
        assert.strictEqual(h.localCalls, 0);
    });
}

test('page template exposes notice and the recovery button above content', () => {
    const template = fs.readFileSync(detailPath + '.wxml', 'utf8');
    assert.match(template, /wx:if="\{\{sourceNotice\}\}"/);
    assert.match(template, /\{\{sourceNotice\}\}/);
    assert.match(template, /bindtap="queryFullDictionary"[^>]*>重新查询完整词典<\/button>/);
    assert.ok(template.indexOf('{{sourceNotice}}') < template.indexOf('class="word-head"'));
});

(async () => {
    let failed = 0;
    for (const { name, run } of tests) {
        try { await run(); console.log('PASS ' + name); }
        catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.message); }
    }
    console.log(`dictionary detail source: ${tests.length - failed}/${tests.length} passed`);
    if (failed) process.exitCode = 1;
})();
