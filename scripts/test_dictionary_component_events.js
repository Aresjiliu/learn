const assert = require('assert')
const fs = require('fs')
const path = require('path')
const base = path.resolve(__dirname, '../components/dictionary-entry/index')
assert.ok(fs.existsSync(base + '.js'), 'entry Component must exist')
let definition
new Function('Component', fs.readFileSync(base + '.js', 'utf8'))(value => { definition = value })
assert.strictEqual(definition.properties.entry.type, Object)
const events = []
const entry = { entryId: 'dict:17:b/?&', headword: 'всё́' }
definition.methods.open.call({ data: { entry }, triggerEvent: (...args) => events.push(args) })
assert.deepStrictEqual(events, [['open', { word: 'всё́', wordId: 'dict:17:b/?&' }]])
const template = fs.readFileSync(base + '.wxml', 'utf8')
assert.match(template, /bindtap="open"/)
assert.match(template, /entry.headword/)
assert.match(template, /entry.summary/)
assert.match(template, /entry.matchLabel/)
assert.doesNotMatch(template, /entry\.(?:audioPlayable|audioPending|audioUrl|audio_url|audioSource|audioDevelopmentOnly)|可听发音|音频待接入|教材发音|本地验证/,
    'clean result rows omit audio labels; audio facts remain covered by Page behavior and safety tests')
assert.match(fs.readFileSync(path.resolve(__dirname, '../pages/dictionary/search/search.wxml'), 'utf8'),
    /<text\b[^>]*wx:if="\{\{audioDevelopmentNotice\}\}"[^>]*>当前结果中的部分发音仅供本地开发验证。<\/text>/,
    'development-only audio notice belongs to the search page')
console.log('dictionary component events: PASS')
