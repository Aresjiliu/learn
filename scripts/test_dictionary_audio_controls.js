const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const source = read('pages/dictionary/detail/detail.js').replace(/^import .*$/gm, '')
const wxml = read('pages/dictionary/detail/detail.wxml')
const wxss = read('pages/dictionary/detail/detail.wxss')
const settle = () => new Promise(resolve => setImmediate(resolve))

async function harness(overrides = {}, onStop = () => {}, getDetail, localDetail = () => null) {
    let definition
    let responseWord = Object.assign({
        id: 'dict:1:a', word: 'дом', examples: [],
        audioUrl: 'https://audio.example.test/verified.mp3',
        audioSource: 'textbook', audioDevelopmentOnly: true
    }, overrides)
    const plays = []
    const toasts = []
    const runtimeConfig = { enableLocalDictionaryApi: true, enableLocalWordAudio: false, enableLocalTestAudio: false }
    let stops = 0
    new Function('Page', 'getLocalDictionaryDetail', 'getLocalTextbookAudioUrl',
        'getDictionaryDetail', 'audioController', 'config', 'wx', 'presentDictionaryDetail', source)(
        value => { definition = value }, localDetail, () => '',
        getDetail || (() => Promise.resolve({ data: { word: responseWord } })),
        {
            play(url, handlers) { plays.push({ url, handlers }); return true },
            stop() { stops++; onStop(plays) }
        },
        runtimeConfig,
        { showToast(options) { toasts.push(options) } },
        require('../services/dictionary-presentation').presentDictionaryDetail
    )
    const page = Object.assign({}, definition, {
        data: JSON.parse(JSON.stringify(definition.data)),
        updates: [],
        setData(update) { this.updates.push(update); Object.assign(this.data, update) }
    })
    const load = async word => {
        if (word) responseWord = word
        page.onLoad({ q: encodeURIComponent(responseWord.word), id: responseWord.id })
        await settle()
    }
    await load()
    page.onShow()
    return { page, plays, toasts, load, runtimeConfig, stopCount: () => stops }
}

// Evaluate source-label bindings against the real Page data, without a WXML runtime dependency.
function sourceLabels(template, name, word) {
    const labels = []
    const tags = /<text\b([^>]*)>(教材发音|本地验证)<\/text>/g
    let match
    while ((match = tags.exec(template))) {
        const condition = /wx:if="\{\{([\s\S]*?)\}\}"/.exec(match[1])
        assert.ok(condition, 'source labels must be conditional')
        if (new Function(name, 'return (' + condition[1] + ')')(word)) labels.push(match[2])
    }
    return labels
}

const tests = [
    ...['local', 'failed API'].flatMap(mode => [
        [mode + ' rejects unrelated fallback and uses only trusted route content', async () => {
            for (const [query, candidate] of [['дом', 'домашний'], ['все', 'всё'], ['и', 'й'], ['и', 'и\u0306'], ['е', 'е\u0308'], ['дом', ''], ['дом', null]]) {
                const { page } = await harness({}, undefined, () => Promise.reject(new Error('offline')),
                    () => candidate === null ? null : ({ word: candidate, word_meaning_all: '错词释义', examples: ['错词例句'], audioUrl: 'https://audio.example.test/wrong.mp3' }))
                const route = { q: encodeURIComponent(query), ...(mode === 'failed API' ? { id: 'book:1' } : {}) }
                for (const fields of [{}, { meaning: '%20', class: '%20', examples: '%20' }]) {
                    page.onLoad({ ...route, ...fields })
                    await settle()
                    assert.strictEqual(page.data.word, null, query + ' must not resolve to ' + candidate)
                    assert.strictEqual(page.data.loading, false)
                    if (mode === 'failed API') assert.ok(page.data.loadError)
                }
                for (const fields of [{ meaning: encodeURIComponent('教材义') }, { class: encodeURIComponent('教材词性') }, { examples: encodeURIComponent('教材例句') }]) {
                    page.onLoad({ ...route, ...fields })
                    await settle()
                    assert.strictEqual(page.data.word.headword, query)
                    assert.strictEqual(page.data.word.sourceType, 'textbook')
                    assert.strictEqual(page.data.word.sourceLabel, '教材词')
                    assert.strictEqual(page.data.word.audioPlayable, false)
                    assert.strictEqual(page.data.word.meaningText, fields.meaning ? '教材义' : '释义待补充')
                    assert.strictEqual(page.data.word.wordClass, fields.class ? '教材词性' : '')
                    assert.deepStrictEqual(page.data.word.exampleItems.map(item => item.text), fields.examples ? ['教材例句'] : [])
                }
            }
        }],
        [mode + ' accepts only exact normalized headwords preserving yo and short i', async () => {
            for (const [query, candidate] of [['ДОМ', 'до\u0301м'], ['дом', ' ДО\u0341М '], ['всё', 'ВСЕ\u0308'], ['йод', 'И\u0306ОД'], ['ёлка', 'е\u0308лка'], ['мир', 'ми\u0300р']]) {
                const { page } = await harness({}, undefined, () => Promise.reject(new Error('offline')),
                    () => ({ word: candidate, word_meaning_all: '正确本地义', examples: [], sentence_all: 'Это дом.' }))
                page.onLoad({ q: encodeURIComponent(query), ...(mode === 'failed API' ? { id: 'book:1' } : {}) })
                await settle()
                assert.ok(page.data.word, query + ' should match ' + candidate)
                assert.strictEqual(page.data.word.headword, candidate.trim())
                assert.strictEqual(page.data.word.meaningText, '正确本地义')
                assert.deepStrictEqual(page.data.word.exampleItems.map(item => item.text), ['Это дом.'])
            }
        }]
    ]),
    ['blank API route fields preserve server textbook meaning and class', async () => {
        const { page } = await harness({
            textbookMeaning: '教材义', textbookWordClass: '教材词性',
            word_meaning_all: '主释义', word_character: '主词性'
        })
        for (const blank of ['', ' ', ' \t\n ']) {
            page.onLoad({ q: 'дом', id: 'dict:1:a', meaning: encodeURIComponent(blank), class: encodeURIComponent(blank) })
            await settle()
            assert.strictEqual(page.data.word.textbookMeaning, '教材义')
            assert.strictEqual(page.data.word.textbookWordClass, '教材词性')
            assert.strictEqual(page.data.word.meaningText, '教材义')
            assert.strictEqual(page.data.word.wordClass, '教材词性')
        }
        page.onLoad({ q: 'дом', id: 'dict:1:a', meaning: encodeURIComponent('新教材义'), class: encodeURIComponent('新教材词性') })
        await settle()
        assert.strictEqual(page.data.word.meaningText, '新教材义')
        assert.strictEqual(page.data.word.wordClass, '新教材词性')
    }],
    ...['unavailable', 'unload'].flatMap(transition => ['resolve', 'reject'].map(outcome => [
        'pending remote → ' + transition + ' ignores old ' + outcome,
        async () => {
            let complete
            let requests = 0
            const { page, runtimeConfig } = await harness({}, undefined, () => {
                if (++requests === 1) return Promise.resolve({ data: { word: { id: 'dict:1:a', word: 'дом' } } })
                return new Promise((resolve, reject) => { complete = outcome === 'resolve' ? resolve : reject })
            })
            page.onLoad({ q: 'дом', id: 'dict:1:a' })
            if (transition === 'unload') page.onUnload()
            else {
                runtimeConfig.enableLocalDictionaryApi = false
                page.onLoad({ q: 'мир', id: 'dict:2:b' })
                assert.strictEqual(page.data.word, null)
                assert.ok(page.data.loadError)
            }
            const updates = page.updates.length
            const state = JSON.stringify(page.data)
            complete(outcome === 'resolve' ? { data: { word: { id: 'dict:1:a', word: 'дом' } } } : new Error('late failure'))
            await settle()
            assert.strictEqual(page.updates.length, updates)
            assert.strictEqual(JSON.stringify(page.data), state)
        }
    ])),
    ['textbook route fields take priority over local dictionary fields', async () => {
        const { page } = await harness({}, undefined, undefined, () => ({ word: 'дом', word_meaning_all: '词典释义', word_character: '词典词性', examples: ['词典例句'] }))
        page.onLoad({ q: 'дом', meaning: encodeURIComponent('教材释义'), class: encodeURIComponent('教材词性'), examples: encodeURIComponent('教材例句') })
        assert.strictEqual(page.data.word.meaningText, '教材释义')
        assert.strictEqual(page.data.word.wordClass, '教材词性')
        assert.deepStrictEqual(page.data.word.exampleItems.map(item => item.text), ['教材例句'])
    }],
    ['stable identity mismatch and empty service response never become another word', async () => {
        for (const word of [null, { id: 'dict:wrong:id', word: '错词' }]) {
            const { page } = await harness({}, undefined, () => Promise.resolve({ data: { word } }))
            assert.strictEqual(page.data.word, null)
            assert.ok(page.data.loadError)
        }
    }],
    ['service examples survive and nonempty textbook examples override', async () => {
        const { page } = await harness({ examples: ['服务例句'] })
        assert.deepStrictEqual(page.data.word.examples, ['服务例句'])
        page.onLoad({ q: 'дом', id: 'dict:1:a', examples: encodeURIComponent('教材例句') })
        await settle()
        assert.deepStrictEqual(page.data.word.examples, ['教材例句'])
        page.onLoad({ q: 'дом', id: 'dict:1:a', examples: '%20' })
        await settle()
        assert.deepStrictEqual(page.data.word.examples, ['服务例句'])
    }],
    ['malformed route fields recover without requesting a different entry', async () => {
        for (const field of ['q', 'id', 'textbookId', 'meaning', 'class', 'examples']) {
            let requests = 0
            let finish
            const { page, plays } = await harness({}, undefined, () => {
                requests++
                return requests === 1 ? Promise.resolve({ data: { word: { id: 'dict:1:a', word: 'дом', audioUrl: 'https://audio.example.test/a.mp3' } } }) : new Promise(resolve => { finish = resolve })
            })
            page.playAudio()
            page.onLoad({ q: 'дом', id: 'dict:1:a' })
            assert.doesNotThrow(() => page.onLoad({ q: 'дом', id: 'dict:1:a', [field]: '%' }))
            assert.strictEqual(requests, 2)
            assert.strictEqual(page.data.loading, false)
            assert.strictEqual(page.data.word, null)
            assert.ok(page.data.loadError)
            const updates = page.updates.length
            plays[0].handlers.onError()
            finish({ data: { word: { id: 'dict:1:a', word: '旧词' } } })
            await settle()
            assert.strictEqual(page.updates.length, updates)
            page.onLoad({ q: 'дом', id: 'dict:1:a' })
            finish({ data: { word: { id: 'dict:1:a', word: 'дом' } } })
            await settle()
            assert.strictEqual(page.data.loadError, '')
        }
    }],
    ...['local', 'empty'].flatMap(route => ['resolve', 'reject'].map(outcome => [
        'pending remote → ' + route + ' ignores old ' + outcome,
        async () => {
            let complete
            let requests = 0
            const { page } = await harness({}, undefined, () => {
                if (++requests === 1) return Promise.resolve({ data: { word: { id: 'dict:1:a', word: 'дом' } } })
                return new Promise((resolve, reject) => { complete = outcome === 'resolve' ? resolve : reject })
            }, query => ({ word: query, word_meaning_all: '真实本地义' }))
            page.onLoad({ q: 'дом', id: 'dict:1:a' })
            page.onLoad(route === 'local' ? { q: 'мир' } : {})
            assert.strictEqual(page.data.word && page.data.word.word, route === 'local' ? 'мир' : null)
            const state = JSON.stringify(page.data)
            const updates = page.updates.length
            complete(outcome === 'resolve'
                ? { data: { word: { id: 'dict:1:a', word: 'дом', audioUrl: 'https://audio.example.test/old.mp3' } } }
                : new Error('late request failure'))
            await settle()
            assert.strictEqual(JSON.stringify(page.data), state, 'old request must not overwrite the new route')
            assert.strictEqual(page.updates.length, updates, 'old request must not update the new view')
        }
    ])),
    ['failure → retry → ended', async () => {
        const { page, plays, toasts } = await harness()
        page.playAudio()
        assert.strictEqual(plays[0].url, page.data.word.audioUrl, 'use the absolute server URL unchanged')
        assert.strictEqual(page.data.isPlaying, true)
        plays[0].handlers.onError()
        assert.strictEqual(page.data.isPlaying, false)
        assert.strictEqual(page.data.audioError, '音频播放失败，请重试')
        assert.strictEqual(toasts[toasts.length - 1].title, '音频播放失败')
        page.playAudio()
        assert.strictEqual(page.data.audioError, '', 'retry clears the visible error')
        assert.strictEqual(page.data.isPlaying, true)
        plays[0].handlers.onError()
        assert.strictEqual(page.data.audioError, '', 'an old attempt must not fail the retry')
        plays[0].handlers.onEnded()
        assert.strictEqual(page.data.isPlaying, true, 'an old attempt must not end the retry')
        plays[1].handlers.onEnded()
        assert.strictEqual(page.data.isPlaying, false)
        assert.strictEqual(page.data.audioError, '')
    }],
    ['hide protects state, including after show', async () => {
        const { page, plays, toasts, stopCount } = await harness()
        page.playAudio()
        page.onHide()
        const updates = page.updates.length
        plays[0].handlers.onError()
        plays[0].handlers.onEnded()
        assert.strictEqual(page.updates.length, updates)
        assert.strictEqual(toasts.length, 0)
        assert.strictEqual(page.data.isPlaying, false)
        assert.ok(stopCount() > 0)
        page.onShow()
        page.playAudio()
        plays[0].handlers.onError()
        assert.strictEqual(page.data.audioError, '', 'hidden attempt stays invalid after show')
        assert.strictEqual(page.data.isPlaying, true)
        plays[1].handlers.onEnded()
        assert.strictEqual(page.data.isPlaying, false)
    }],
    ['new entry clears failure and invalidates old callbacks', async () => {
        const { page, plays, load, stopCount } = await harness()
        page.playAudio()
        plays[0].handlers.onError()
        await load({ id: 'dict:2:b', word: 'мир', examples: [], audioUrl: 'http://localhost:18092/audio/new.mp3' })
        assert.strictEqual(page.data.audioError, '')
        assert.strictEqual(page.data.isPlaying, false)
        page.playAudio()
        const updates = page.updates.length
        plays[0].handlers.onError()
        plays[0].handlers.onEnded()
        assert.strictEqual(page.updates.length, updates)
        assert.strictEqual(page.data.isPlaying, true)
        const stops = stopCount()
        await load({ id: 'dict:3:c', word: 'лес', examples: [] })
        assert.ok(stopCount() > stops, 'switching entries stops active playback')
        assert.strictEqual(page.data.isPlaying, false)
        page.setData({ audioError: 'previous failure' })
        page.onLoad({})
        assert.strictEqual(page.data.audioError, '', 'empty routes also clear errors')
    }],
    ['onLoad invalidates the old attempt before stop emits a synchronous error', async () => {
        let stopErrors = 0
        const { page, toasts, load } = await harness({}, plays => {
            if (!plays.length) return
            stopErrors++
            plays[plays.length - 1].handlers.onError()
        })
        page.playAudio()
        const updates = page.updates.length
        await load({ id: 'dict:2:b', word: 'мир', examples: [] })
        assert.strictEqual(stopErrors, 1, 'stop must synchronously invoke the captured old callback')
        assert.strictEqual(toasts.length, 0, 'switching entries must not toast an old playback error')
        assert.ok(page.updates.slice(updates).every(update => !update.audioError),
            'the old callback must not transiently write an error before onLoad clears state')
        assert.strictEqual(page.data.audioError, '')
        assert.strictEqual(page.data.isPlaying, false)
        assert.strictEqual(page.data.word.id, 'dict:2:b')
    }],
    ['unload clears error without setData and ignores callbacks', async () => {
        const { page, plays, toasts } = await harness()
        page.playAudio()
        plays[0].handlers.onError()
        const updates = page.updates.length
        const toastCount = toasts.length
        page.onUnload()
        assert.strictEqual(page.data.audioError, '')
        plays[0].handlers.onError()
        plays[0].handlers.onEnded()
        assert.strictEqual(page.updates.length, updates)
        assert.strictEqual(toasts.length, toastCount)
    }],
    ['empty and unverified audio retain original states', async () => {
        for (const [audioUrl, pending, toast] of [
            ['', false, '暂无音频'], ['unverified-hash', true, '音频资源待接入']
        ]) {
            const { page, plays, toasts } = await harness({ audioUrl })
            assert.strictEqual(page.data.word.audioPlayable, false)
            assert.strictEqual(page.data.word.audioPending, pending)
            page.playAudio()
            assert.strictEqual(plays.length, 0)
            assert.strictEqual(toasts[0].title, toast)
        }
    }],
    ['source labels reflect exact server fields', async () => {
        const search = read('components/dictionary-entry/index.wxml')
        const { presentDictionaryEntry } = require('../services/dictionary-presentation')
        for (const [fields, expected] of [
            [{ audioSource: 'textbook', audioDevelopmentOnly: true }, ['教材发音', '本地验证']],
            [{ audioSource: 'textbook', audioDevelopmentOnly: false }, ['教材发音']],
            [{ audioSource: 'other', audioDevelopmentOnly: true }, ['本地验证']],
            [{ audioSource: 'other', audioDevelopmentOnly: 'true' }, []],
            [{ audioSource: undefined, audioDevelopmentOnly: undefined }, []]
        ]) {
            const { page } = await harness(fields)
            assert.deepStrictEqual(sourceLabels(wxml, 'word', page.data.word), expected)
            assert.deepStrictEqual(sourceLabels(search, 'entry', presentDictionaryEntry(page.data.word)), [],
                'list rows omit audio source labels; detail source labels retain the exact conditions above')
        }
        assert.doesNotMatch(search, /entry\.(?:sourceLabel|audioPlayable|audioPending|audioUrl|audio_url|audioSource|audioDevelopmentOnly)|entry__metadata/,
            'clean list rows do not render source or audio metadata')
    }],
    ['icon, accessible name, touch target and visible retry bindings', async () => {
        assert.match(wxml, /<button[^>]*class="audio-button[^\"]*"[^>]*bindtap="playAudio"[^>]*aria-label="[^\"]+"[^>]*>/)
        assert.match(wxml, /<van-icon name="volume-o"[^>]*aria-hidden="true"/)
        assert.ok(!wxml.includes('speaker-icon'))
        const components = JSON.parse(read('pages/dictionary/detail/detail.json')).usingComponents
        assert.strictEqual(components['van-icon'], '/miniprogram_npm/@vant/weapp/icon/index')
        assert.match(read('node_modules/@vant/weapp/dist/icon/index.wxss'), /\.van-icon-volume-o:before/)
        assert.match(read('miniprogram_npm/@vant/weapp/icon/index.wxss'), /\.van-icon-volume-o:before/)
        assert.ok(!wxml.includes("{{isPlaying ? '播放中…' : '播放发音'}}"))
        assert.match(wxss, /\.audio-button\s*\{[^}]*width:\s*88rpx;[^}]*height:\s*88rpx;/)
        assert.match(wxml, /wx:if="\{\{audioError\}\}"[\s\S]*?\{\{audioError\}\}[\s\S]*?bindtap="playAudio"[^>]*>重新播放<\/button>/)
        assert.match(wxss, /\.audio-retry\s*\{[^}]*min-height:\s*88rpx;/)
        assert.ok(wxml.includes('wx:if="{{word.audioPending}}"'))
        assert.ok(wxml.includes('wx:if="{{!word.audioPlayable && !word.audioPending}}"'))
    }]
]

;(async () => {
    let failed = 0
    for (const [name, run] of tests) {
        try {
            await run()
            console.log('PASS ' + name)
        } catch (error) {
            failed++
            console.error('FAIL ' + name + '\n' + error.message)
        }
    }
    console.log('dictionary audio controls: ' + (tests.length - failed) + '/' + tests.length + ' passed')
    if (failed) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
