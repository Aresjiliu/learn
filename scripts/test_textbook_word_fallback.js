const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('pages/dictionary/detail/detail.js', 'utf8')
    .replace("import { presentDictionaryDetail } from '../../../services/dictionary-presentation'", 'const presentDictionaryDetail = detailPresenter')
    .replace("import { getLocalDictionaryDetail, getLocalTextbookAudioUrl } from '../../../services/dictionary'", "const getLocalDictionaryDetail = () => null; const getLocalTextbookAudioUrl = () => ''")
    .replace("import { getDictionaryDetail } from '../../../services/content-api'", "const getDictionaryDetail = () => Promise.reject(new Error('not found'))")
    .replace("import { audioController } from '../../../services/media/audio'", "const audioController = { stop: () => {}, play: () => false }")
    .replace("import config from '../../../config'", "const config = { enableContentApi: false, enableLocalTestMedia: false, devMediaBaseUrl: '' }")
    .replace(/Page\(\{/, 'const pageDefinition = {')
    .replace(/\}\)\s*$/, '}')

const context = { module: { exports: {} }, detailPresenter: require('../services/dictionary-presentation').presentDictionaryDetail }
vm.runInNewContext(`${source}\nmodule.exports = pageDefinition`, context)
const page = context.module.exports
const state = { data: {} }
page.setData = values => Object.assign(state.data, values)
page.onLoad.call({ ...page, setData: page.setData }, {
    q: encodeURIComponent('уникальное教材词'),
    meaning: encodeURIComponent('教材释义'),
    class: encodeURIComponent('名词'),
    examples: encodeURIComponent('Это пример.\nЕщё пример.')
})

assert.strictEqual(state.data.word.word, 'уникальное教材词')
assert.strictEqual(state.data.word.sourceType, 'textbook')
assert.strictEqual(state.data.word.textbookMeaning, '教材释义')
assert.strictEqual(state.data.word.textbookWordClass, '名词')
assert.strictEqual(JSON.stringify(Array.from(state.data.word.examples)), JSON.stringify(['Это пример.', 'Ещё пример.']))
assert.strictEqual(state.data.word.audioUrl, undefined)
console.log('textbook word fallback tests: PASS')
