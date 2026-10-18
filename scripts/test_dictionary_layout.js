const assert = require('assert')
const fs = require('fs')
const read = file => fs.readFileSync(require('path').join(__dirname, '..', file), 'utf8')
const detail = read('pages/dictionary/detail/detail.wxml')
const search = read('pages/dictionary/search/search.wxml')
const detailCss = read('pages/dictionary/detail/detail.wxss')
const searchCss = read('pages/dictionary/search/search.wxss')
const entry = read('components/dictionary-entry/index.wxml')
const entryCss = read('components/dictionary-entry/index.wxss')

// Structural regression checks only: these do not replace DevTools/device visual acceptance.
assert.match(detail, /class="word-title-row"[\s\S]*?class="word-identity"[\s\S]*?class="audio-button/)
assert.match(detail, /class="word-metadata"[\s\S]*?audioSource[\s\S]*?audioDevelopmentOnly/)
assert.match(detail, /<text class="section-label">词性<\/text>/)
assert.match(detail, /class="meaning" selectable/)
assert.match(detailCss, /\.word-title-row\s*\{[^}]*display:\s*flex;/)
assert.match(detailCss, /\.word-identity\s*\{[^}]*min-width:\s*0;/)
assert.match(detailCss, /\.audio-button\s*\{[^}]*flex-shrink:\s*0;/)
assert.match(search, /class="results-heading"/)
assert.match(search, /<dictionary-entry[^>]*entry="\{\{item\}\}"/)
assert.match(entry, /class="entry__metadata"[\s\S]*?audioPlayable[\s\S]*?audioSource[\s\S]*?audioDevelopmentOnly/)
assert.match(search, /搜索历史[\s\S]*?示例查询/)
assert.match(entryCss, /\.entry__metadata\s*\{[^}]*flex-wrap:\s*wrap;/)
assert.match(entryCss, /\.entry__summary\s*\{[^}]*-webkit-line-clamp:\s*2;/)
assert.match(entryCss, /\.entry__headword\s*\{[^}]*overflow-wrap:\s*anywhere;/)
assert.match(searchCss, /padding:\s*20rpx 32rpx 40rpx/)
assert.match(searchCss, /env\(safe-area-inset-bottom\)/)
const iconButtonRule = /\.icon-button\s*\{([^}]*)\}/.exec(searchCss)[1]
const clearButtonRule = /\.clear-button\s*\{([^}]*)\}/.exec(searchCss)[1]
const historyRemoveRule = /\.history-remove\s*\{([^}]*)\}/.exec(searchCss)[1]
const rpxSize = (rule, property) => Number(new RegExp('(?:^|;)\\s*' + property + ':\\s*(\\d+)rpx').exec(rule)[1])
assert.deepStrictEqual([
    rpxSize(clearButtonRule, 'width'), rpxSize(iconButtonRule, 'height'),
    rpxSize(historyRemoveRule, 'width'), rpxSize(historyRemoveRule, 'height')
], [88, 88, 88, 88], 'clear and history delete outer targets must both be 88rpx square')
assert.match(searchCss, /\.dictionary-search-input\s*\{[^}]*padding:\s*0 88rpx 0 88rpx;/,
    'reserve exactly the icon target widths without excessive input padding')
assert.match(clearButtonRule, /right:\s*104rpx;/, 'keep the clear target inside the search field')
assert.match(searchCss, /\.search-action\s*\{[^}]*width:\s*88rpx;/)
assert.match(searchCss, /\.search-bar\s*\{[^}]*gap:\s*16rpx;/)
// Dynamic event, presentation and Page state evidence replaces the old card-only layout contract.
require('./test_dictionary_component_events')
require('./test_dictionary_presentation')
assert.ok(!search.includes('含可播放音频'), 'avoid a full extra row for the audio availability label')
console.log('dictionary layout structural checks: PASS (not visual acceptance)')
