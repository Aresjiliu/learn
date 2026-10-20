const assert = require('assert');
const fs = require('fs');
const { presentDictionaryDetail } = require('../services/dictionary-presentation');
const source = fs.readFileSync('pages/dictionary/detail/detail.js', 'utf8').replace(/^import .*$/gm, '');
const template = fs.readFileSync('pages/dictionary/detail/detail.wxml', 'utf8');
const entry = fs.readFileSync('components/dictionary-entry/index.wxml', 'utf8');
const css = fs.readFileSync('pages/dictionary/detail/detail.wxss', 'utf8');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function harness() {
    let definition;
    let word = { word: 'камера', word_character: '名 非动 单 阴 1格', word_meaning_all: '原文\n1. 完整释义', examples: ['一', '二', '三'] };
    new Function('Page', 'getLocalDictionaryDetail', 'getLocalTextbookAudioUrl', 'getDictionaryDetail', 'audioController', 'config', 'wx', 'presentDictionaryDetail', source)(
        value => { definition = value; }, () => word, () => '', () => { throw Error('unexpected API'); },
        { stop() {} }, {}, {}, presentDictionaryDetail);
    const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch); } };
    page.onLoad({ q: encodeURIComponent(word.word) });
    return { page, replace(value) { word = value; page.onLoad({ q: encodeURIComponent(value.word) }); } };
}
test('detail keeps full source while deriving a concise reliable part of speech', () => {
    const detail = presentDictionaryDetail({ word_character: '名 非动 单 阴 1格', examples: ['一', '二', '三'], meaning: '1. 原文\n2. 保留' });
    assert.strictEqual(detail.shortWordClass, '名词');
    assert.strictEqual(detail.wordClass, '名 非动 单 阴 1格');
    assert.strictEqual(detail.meaningText, '1. 原文\n2. 保留');
    assert.strictEqual(detail.hasMoreExamples, true);
    assert.strictEqual(presentDictionaryDetail({ textbookWordClass: '动 未 不及 不定' }).shortWordClass, '动词');
    assert.strictEqual(presentDictionaryDetail({ wordClass: '未知代码' }).shortWordClass, '');
    assert.strictEqual(presentDictionaryDetail({ examples: ['一', '二'] }).hasMoreExamples, false);
});
test('examples and technical metadata expand independently and reset on a new word', () => {
    const { page, replace } = harness();
    assert.strictEqual(page.data.examplesExpanded, false);
    assert.strictEqual(page.data.metadataExpanded, false);
    page.toggleExamples(); page.toggleMetadata();
    assert.strictEqual(page.data.examplesExpanded, true);
    assert.strictEqual(page.data.metadataExpanded, true);
    assert.strictEqual(page.data.word.exampleItems.length, 3);
    assert.strictEqual(page.data.word.meaningText, '原文\n1. 完整释义');
    page.toggleExamples();
    assert.strictEqual(page.data.examplesExpanded, false);
    assert.strictEqual(page.data.metadataExpanded, true);
    replace({ word: 'дом', examples: [], meaning: '新释义' });
    assert.strictEqual(page.data.examplesExpanded, false);
    assert.strictEqual(page.data.metadataExpanded, false);
    page.onUnload(); page.toggleExamples(); page.toggleMetadata();
    assert.strictEqual(page.data.examplesExpanded, false);
    assert.strictEqual(page.data.metadataExpanded, false);
});
test('template provides copyable full text, bounded examples and an explicit metadata exit', () => {
    assert.ok(!/\bselectable\b/.test(template), 'deprecated selectable must be removed');
    assert.match(template, /class="meaning" user-select="\{\{true\}\}"/);
    assert.match(entry, /<view class="entry__summary">\s*<text user-select="\{\{true\}\}">\{\{entry.summary \|\| '释义待补充'\}\}<\/text>\s*<\/view>/);
    assert.match(template, /<block wx:for="\{\{word.exampleItems\}\}" wx:key="key">\s*<text wx:if="\{\{examplesExpanded \|\| index === 0 \|\| index === 1\}\}"/);
    assert.match(template, /word.hasMoreExamples[\s\S]*?bindtap="toggleExamples"/);
    assert.match(template, /bindtap="toggleMetadata"[\s\S]*?wx:if="\{\{metadataExpanded\}\}"/);
    assert.match(template, /word.shortWordClass/);
    assert.match(css, /\.meaning-panel\s*\{[^}]*border:\s*1rpx solid/);
    assert.match(css, /\.metadata-panel\s*\{[^}]*border-top:/);
    assert.ok(!css.includes('line-clamp'), 'full meaning remains reachable until measured folding is implemented');
});
console.log('dictionary detail sections: ' + passed + '/' + passed + ' passed (not visual acceptance)');
