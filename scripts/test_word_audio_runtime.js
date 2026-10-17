const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const HASH = '0123456789abcdef0123456789abcdef'
const index = { '65975': `${HASH}.mp3` }
const config = { enableLocalWordAudio: true, enableLocalTestAudio: false, devMediaBaseUrl: 'http://127.0.0.1:18090', enableLocalTestMedia: false, enableContentApi: false, enableLocalSampleFallback: true }
const dictionarySample = { words: [{ id: 'main-1', word: 'агент', word_meaning_all: '代理人' }] }
const textbookSample = { words: [{ id: '65975', word: 'агент', word_meaning_all: '代理人' }, { id: '65976', word: 'академик' }] }

function loadDictionary() {
    const source = fs.readFileSync('services/dictionary.js', 'utf8')
        .replace("import config from '../config'", 'const config = globalConfig')
        .replace("const dictionarySample = require('../data/content_samples/dictionary_words.js')", 'const dictionarySample = globalDictionarySample')
        .replace("const textbookSample = require('../data/content_samples/book_1_words.js')", 'const textbookSample = globalTextbookSample')
        .replace("const audioIndex = require('../data/content_samples/book_1_audio.js')", 'const audioIndex = globalAudioIndex')
        .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
    const context = { module: { exports: {} }, globalConfig: config, globalDictionarySample: dictionarySample, globalTextbookSample: textbookSample, globalAudioIndex: index }
    vm.runInNewContext(`${source}\nmodule.exports = { getLocalDictionaryDetail, getLocalDictionarySearch }`, context)
    return context.module.exports
}

;(async () => {
    const dictionary = loadDictionary()
    const available = dictionary.getLocalDictionaryDetail('агент')
    assert.strictEqual(available.audioUrl, `http://127.0.0.1:18090/wordaudio/${HASH}.mp3`)
    assert.strictEqual(dictionary.getLocalDictionaryDetail('академик').audioUrl, undefined)
    const search = await dictionary.getLocalDictionarySearch('агент')
    assert.strictEqual(search.data.words[0].audioUrl, available.audioUrl)
    config.enableLocalWordAudio = false
    assert.strictEqual(dictionary.getLocalDictionaryDetail('агент').audioUrl, undefined)

    const detailSource = fs.readFileSync('pages/dictionary/detail/detail.js', 'utf8')
        .replace("import { getLocalDictionaryDetail } from '../../../services/dictionary'", 'const getLocalDictionaryDetail = globalLocalDetail')
        .replace("import { getDictionaryDetail } from '../../../services/content-api'", 'const getDictionaryDetail = globalRemoteDetail')
        .replace("import { audioController } from '../../../services/media/audio'", 'const audioController = globalAudioController')
        .replace("import config from '../../../config'", 'const config = globalConfig')
        .replace(/Page\(\{/, 'const pageDefinition = {')
        .replace(/\}\)\s*$/, '}')
    const events = []
    const context = { module: { exports: {} }, globalConfig: config, globalLocalDetail: id => id === '65975' ? available : null, globalRemoteDetail: () => Promise.resolve({ data: { word: { id: 'main-1', word: 'агент' } } }), globalAudioController: { play: (url, handlers) => { events.push({ url, handlers }); return true }, stop: () => events.push({ stopped: true }) }, wx: { showToast: info => events.push(info) } }
    vm.runInNewContext(`${detailSource}\nmodule.exports = pageDefinition`, context)
    const page = context.module.exports
    const instance = { ...page, data: { word: { audioUrl: available.audioUrl } }, setData(values) { Object.assign(this.data, values) } }
    instance.playAudio()
    assert.strictEqual(events[0].url, available.audioUrl)
    events[0].handlers.onEnded()
    assert.strictEqual(instance.data.isPlaying, false)
    instance.data.word = { audioUrl: available.audioUrl }
    instance.playAudio()
    events[1].handlers.onError()
    assert.strictEqual(instance.data.isPlaying, false)
    assert.ok(events.some(event => event.title === '音频播放失败'))
    instance.onUnload()
    assert.ok(events.some(event => event.stopped))

    config.enableContentApi = true
    config.enableLocalWordAudio = true
    const apiInstance = { ...page, data: { ...page.data }, setData(values) { Object.assign(this.data, values) } }
    apiInstance.onLoad({ q: 'агент', id: 'main-1', textbookId: '65975' })
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(apiInstance.data.word.audioUrl, available.audioUrl, 'API detail must retain owned textbook audio')
    assert.strictEqual(apiInstance.data.word.audioPlayable, true)
    apiInstance.onUnload()

    const courseSource = fs.readFileSync('services/course.js', 'utf8')
        .replace("import request from '../utils/request'", 'const request = () => Promise.reject(new Error("not used"))')
        .replace("import config from '../config'", 'const config = globalConfig')
        .replace("import { isContentSuccess, normalizeCourseResponse } from './adapters'", 'const isContentSuccess = () => true; const normalizeCourseResponse = value => value')
        .replace("import { getContentBookDetail, getContentBooks, getContentCategories } from './content-api'", 'const getContentBookDetail = () => Promise.resolve({ code: 200, data: { course: { id: "1" }, words: [{ id: "65975", word: "агент" }, { id: "65976", word: "академик" }] } }); const getContentBooks = () => Promise.resolve({}); const getContentCategories = () => Promise.resolve({})')
        .replace("const textbookSample = require('../data/content_samples/book_1_words.js')", 'const textbookSample = { words: [] }')
        .replace("const audioIndex = require('../data/content_samples/book_1_audio.js')", 'const audioIndex = globalAudioIndex')
        .replace("const wordFormSample = require('../data/content_samples/book_word_forms.js')", 'const wordFormSample = {}')
        .replace("const mappingDecisionSample = require('../data/content_samples/mapping_decisions.js')", 'const mappingDecisionSample = {}')
        .replace("const categorySample = require('../data/content_samples/categories.js')", 'const categorySample = {}')
        .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
    const courseContext = { module: { exports: {} }, globalConfig: config, globalAudioIndex: index }
    vm.runInNewContext(`${courseSource}\nmodule.exports = { getCourseDetail }`, courseContext)
    const course = await courseContext.module.exports.getCourseDetail('1')
    assert.strictEqual(course.data.words[0].audioUrl, `/wordaudio/${HASH}.mp3`)
    assert.strictEqual(course.data.words[1].audioUrl, undefined)
    console.log('word audio runtime tests: PASS')
})().catch(error => { console.error(error); process.exitCode = 1 })
