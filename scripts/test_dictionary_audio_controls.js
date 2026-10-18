const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const source = read('pages/dictionary/detail/detail.js').replace(/^import .*$/gm, '')
const wxml = read('pages/dictionary/detail/detail.wxml')
const wxss = read('pages/dictionary/detail/detail.wxss')
const settle = () => new Promise(resolve => setImmediate(resolve))

async function harness(overrides = {}, onStop = () => {}, getDetail) {
    let definition
    let responseWord = Object.assign({
        id: 'dict:1:a', word: 'дом', examples: [],
        audioUrl: 'https://audio.example.test/verified.mp3',
        audioSource: 'textbook', audioDevelopmentOnly: true
    }, overrides)
    const plays = []
    const toasts = []
    let stops = 0
    new Function('Page', 'getLocalDictionaryDetail', 'getLocalTextbookAudioUrl',
        'getDictionaryDetail', 'audioController', 'config', 'wx', source)(
        value => { definition = value }, () => null, () => '',
        getDetail || (() => Promise.resolve({ data: { word: responseWord } })),
        {
            play(url, handlers) { plays.push({ url, handlers }); return true },
            stop() { stops++; onStop(plays) }
        },
        { enableLocalDictionaryApi: true, enableLocalWordAudio: false, enableLocalTestAudio: false },
        { showToast(options) { toasts.push(options) } }
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
    return { page, plays, toasts, load, stopCount: () => stops }
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
    ...['local', 'empty'].flatMap(route => ['resolve', 'reject'].map(outcome => [
        'pending remote → ' + route + ' ignores old ' + outcome,
        async () => {
            let complete
            let requests = 0
            const { page } = await harness({}, undefined, () => {
                if (++requests === 1) return Promise.resolve({ data: { word: { id: 'dict:1:a', word: 'дом' } } })
                return new Promise((resolve, reject) => { complete = outcome === 'resolve' ? resolve : reject })
            })
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
            assert.deepStrictEqual(sourceLabels(search, 'entry', presentDictionaryEntry(page.data.word)), expected)
        }
    }],
    ['icon, accessible name, touch target and visible retry bindings', async () => {
        assert.match(wxml, /<button[^>]*class="audio-button[^\"]*"[^>]*bindtap="playAudio"[^>]*aria-label="[^\"]+"[^>]*>/)
        assert.match(wxml, /class="speaker-icon"[\s\S]*?class="speaker-icon__body"[\s\S]*?class="speaker-icon__cone"[\s\S]*?class="speaker-icon__wave"/)
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
