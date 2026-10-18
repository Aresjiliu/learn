const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const HASH = '0123456789abcdef0123456789abcdef'
const config = {
    enableLocalWordAudio: true, enableLocalDictionaryApi: true,
    enableLocalTestAudio: false, devMediaBaseUrl: 'http://127.0.0.1:18090'
}
const textbookWords = [
    { id: '1', word: 'агент' }, { id: '2', word: 'йод' },
    { id: '3', word: 'ёлка' }, { id: '4', word: 'до\u0301м' }
]
const dictionaryWords = [
    { id: 'dict:1:a', word: 'агент' }, { id: 'dict:2:a', word: 'иод' },
    { id: 'dict:3:a', word: 'елка' }, { id: 'dict:4:a', word: 'дом', audioUrl: 'https://verified.example.test/own.mp3' }
]
const dictionarySource = fs.readFileSync('services/dictionary.js', 'utf8')
    .replace(/^import config from .*$/m, 'const config = runtimeConfig')
    .replace("const dictionarySample = require('../data/content_samples/dictionary_words.js')", 'const dictionarySample = { words: dictionaryWords }')
    .replace("const textbookSample = require('../data/content_samples/book_1_words.js')", 'const textbookSample = { words: textbookWords }')
    .replace("const audioIndex = require('../data/content_samples/book_1_audio.js')", 'const audioIndex = fixtureIndex')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} }, runtimeConfig: config, dictionaryWords, textbookWords,
    fixtureIndex: Object.fromEntries(textbookWords.map(word => [word.id, `${HASH}.mp3`])) }
vm.runInNewContext(`${dictionarySource}\nmodule.exports = { getLocalTextbookAudioUrl, buildLocalDictionaryWords, getLocalDictionaryDetail }`, context)
const dictionary = context.module.exports
const url = `http://127.0.0.1:18090/wordaudio/${HASH}.mp3`
const tests = []
const test = (name, run) => tests.push({ name, run })

test('textbook ID without expected headword is not an audio identity', () => {
    assert.strictEqual(dictionary.getLocalTextbookAudioUrl('1'), '')
})
test('unrelated route headword cannot claim textbook audio', () => {
    assert.strictEqual(dictionary.getLocalTextbookAudioUrl('1', 'дом'), '')
    assert.strictEqual(dictionary.getLocalTextbookAudioUrl('missing', 'агент'), '')
})
test('strict matching accepts case, NFC and stress but preserves yo and short i', () => {
    for (const [id, word] of [['1', ' АГЕНТ '], ['2', 'и\u0306од'], ['3', 'е\u0308лка'], ['4', 'ДОМ']]) {
        assert.strictEqual(dictionary.getLocalTextbookAudioUrl(id, word), url)
    }
    for (const [id, word] of [['2', 'иод'], ['3', 'елка'], ['1', 'агентство'], ['1', '']]) {
        assert.strictEqual(dictionary.getLocalTextbookAudioUrl(id, word), '')
    }
})
test('automatic local lookup never assigns yo or short-i audio to another word', () => {
    const words = dictionary.buildLocalDictionaryWords()
    for (const id of ['dict:2:a', 'dict:3:a']) {
        assert.strictEqual(words.find(word => word.id === id).audioUrl, undefined)
    }
    assert.strictEqual(words.find(word => word.id === 'dict:1:a').audioUrl, url)
})
test('local enrichment does not overwrite an existing entry audio URL', () => {
    const word = dictionary.buildLocalDictionaryWords().find(word => word.id === 'dict:4:a')
    assert.strictEqual(word.audioUrl, 'https://verified.example.test/own.mp3')
})
test('strict local headword wins over an earlier fuzzy candidate', () => {
    for (const query of ['йод', 'ёлка', 'до\u0301м']) {
        const word = dictionary.getLocalDictionaryDetail(query)
        const expected = query === 'до\u0301м' ? 'дом' : query
        assert.strictEqual(word.word, expected)
    }
})

const detailSource = fs.readFileSync('pages/dictionary/detail/detail.js', 'utf8').replace(/^import .*$/gm, '')
async function loadPage(word, route = {}) {
    let definition
    const requests = []
    const plays = []
    new Function('Page', 'getLocalDictionaryDetail', 'getLocalTextbookAudioUrl', 'getDictionaryDetail',
        'audioController', 'config', 'wx', 'presentDictionaryDetail', detailSource)(
        value => { definition = value }, () => null,
        (...args) => { requests.push(args); return dictionary.getLocalTextbookAudioUrl(...args) },
        () => Promise.resolve({ data: { word } }), { stop() {}, play(url) { plays.push(url); return true } }, config, { showToast() {} },
        require('../services/dictionary-presentation').presentDictionaryDetail
    )
    const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
        setData(update) { Object.assign(this.data, update) } }
    page.onLoad({ id: word.id, q: encodeURIComponent(word.word), textbookId: '1', ...route })
    await new Promise(resolve => setImmediate(resolve))
    return { page, requests, plays }
}
test('API audio remains authoritative even with another textbook ID', async () => {
    for (const field of ['audioUrl', 'audio_url']) {
        const audio = 'https://verified.example.test/api.mp3'
        const { page } = await loadPage({ id: 'dict:1:a', word: 'агент', [field]: audio })
        assert.strictEqual(page.data.word.audioUrl || page.data.word.audio_url, audio)
    }
})
test('unplayable primary audio does not mask a playable secondary API URL', async () => {
    const audio = 'https://verified.example.test/secondary.mp3'
    for (const primary of ['unverified-ref', '   ', '/unrecognized/path.mp3']) {
        const { page, requests, plays } = await loadPage({ id: 'dict:1:a', word: 'агент', audioUrl: primary, audio_url: audio })
        assert.strictEqual(requests.length, 0, 'API playable candidates must be checked before textbook fallback')
        assert.strictEqual(page.data.word.audioPlayable, true)
        page.playAudio()
        assert.deepStrictEqual(plays, [audio])
    }
})
test('API word without audio cannot borrow an unrelated textbook pronunciation', async () => {
    const { page } = await loadPage({ id: 'dict:2:a', word: 'дом' })
    assert.strictEqual(page.data.word.audioPlayable, false)
    assert.ok(!page.data.word.audioUrl)
})
test('valid textbook fallback uses the returned API headword, not route text', async () => {
    const { page, requests } = await loadPage({ id: 'dict:1:a', word: 'агент' }, { q: 'агента' })
    assert.strictEqual(page.data.word.audioUrl, url)
    assert.deepStrictEqual(requests[0], ['1', 'агент'])
})
test('disabled local audio cannot be reintroduced by a route', async () => {
    config.enableLocalWordAudio = false
    try {
        assert.strictEqual(dictionary.getLocalTextbookAudioUrl('1', 'агент'), '')
        const { page } = await loadPage({ id: 'dict:1:a', word: 'агент' })
        assert.strictEqual(page.data.word.audioPlayable, false)
    } finally { config.enableLocalWordAudio = true }
})

;(async () => {
    let failures = 0
    for (const { name, run } of tests) {
        try { await run(); console.log(`PASS ${name}`) }
        catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`) }
    }
    console.log(`dictionary audio identity: ${tests.length - failures}/${tests.length} passed`)
    if (failures) process.exitCode = 1
})()
