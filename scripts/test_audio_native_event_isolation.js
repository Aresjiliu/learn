const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const audioSource = read('services/media/audio.js').replace(/^export .*$/gm, '')
const createAudioController = new Function('wx', audioSource + '\nreturn createAudioController')({})
const pageSource = read('pages/dictionary/detail/detail.js').replace(/^import .*$/gm, '')
const settle = () => new Promise(resolve => setImmediate(resolve))

function nativeHarness() {
    const contexts = []
    const controller = createAudioController(() => {
        // Each native instance retains its own listeners, even after destruction:
        // queued native events may still arrive. Never dispatch via Page handlers here.
        const listeners = {}
        const player = {
            stops: 0, destroys: 0, pauses: 0, plays: 0,
            onEnded(fn) { listeners.ended = fn },
            onError(fn) { listeners.error = fn },
            emit(event) { listeners[event]({ errMsg: 'native audio error' }) },
            stop() { this.stops++; if (this.onStop) this.onStop() },
            destroy() { this.destroys++; if (this.onDestroy) this.onDestroy() },
            pause() { this.pauses++ },
            play() { this.plays++ }
        }
        contexts.push(player)
        return player
    })
    return { contexts, controller }
}

async function pageHarness() {
    const native = nativeHarness()
    let definition
    let word
    const toasts = []
    new Function('Page', 'getLocalDictionaryDetail', 'getLocalTextbookAudioUrl',
        'getDictionaryDetail', 'audioController', 'config', 'wx', 'presentDictionaryDetail', pageSource)(
        value => { definition = value }, () => null, () => '',
        () => Promise.resolve({ data: { word } }), native.controller,
        { enableLocalDictionaryApi: true }, { showToast(options) { toasts.push(options) } },
        require('../services/dictionary-presentation').presentDictionaryDetail
    )
    const page = Object.assign({}, definition, {
        data: JSON.parse(JSON.stringify(definition.data)), updates: [],
        setData(update) { this.updates.push(update); Object.assign(this.data, update) }
    })
    const load = async (id, url) => {
        word = { id, word: id, examples: [], audioUrl: url }
        page.onLoad({ q: id, id })
        await settle()
    }
    await load('dict:1:a', 'https://audio.example.test/a.mp3')
    page.onShow()
    return Object.assign(native, { page, toasts, load })
}

const tests = []
for (const transition of ['hide/show', 'switch', 'replay']) {
    for (const sameUrl of [false, true]) {
        for (const event of ['error', 'ended']) {
            tests.push([transition + ', ' + (sameUrl ? 'same URL' : 'different URL') + ', late ' + event, async () => {
                const { page, contexts, toasts, load } = await pageHarness()
                page.playAudio()
                const oldPlayer = contexts[0]
                if (transition === 'hide/show') { page.onHide(); page.onShow() }
                const url = 'https://audio.example.test/' + (sameUrl ? 'a' : 'b') + '.mp3'
                if (transition === 'switch') await load('dict:2:b', url)
                else if (!sameUrl) page.setData({ word: page.decorateWord({ ...page.data.word, audioUrl: url }) })
                page.playAudio()
                const updates = page.updates.length
                oldPlayer.emit(event)
                assert.strictEqual(page.updates.length, updates, 'late A event must not reach B Page handlers')
                assert.strictEqual(page.data.isPlaying, true)
                assert.strictEqual(page.data.audioError, '')
                assert.strictEqual(toasts.length, 0)
                assert.strictEqual(contexts.length, 2, 'every play needs an independent native instance')
                assert.strictEqual(oldPlayer.destroys, 1, 'retired instance must be released once')
                contexts[1].emit(event)
                assert.strictEqual(page.data.isPlaying, false, 'current native event must still reach Page')
                assert.strictEqual(page.data.audioError, event === 'error' ? '音频播放失败，请重试' : '')
                page.onUnload()
                const afterUnload = page.updates.length
                contexts[1].emit('error')
                contexts[1].emit('ended')
                assert.strictEqual(page.updates.length, afterUnload)
                assert.ok(contexts.every(player => player.destroys === 1), 'unload releases all native instances')
            }])
        }
    }
}

for (const action of ['stop', 'destroy', 'replace']) {
    tests.push([action + ' invalidates before synchronous native teardown events', () => {
        const { controller, contexts } = nativeHarness()
        let callbacks = 0
        controller.play('https://audio.example.test/a.mp3', {
            onError() { callbacks++ }, onEnded() { callbacks++ }
        })
        const oldPlayer = contexts[0]
        oldPlayer.onStop = oldPlayer.onDestroy = () => {
            oldPlayer.emit('error')
            oldPlayer.emit('ended')
        }
        if (action === 'replace') controller.play('https://audio.example.test/a.mp3', {
            onError() { callbacks++ }, onEnded() { callbacks++ }
        })
        else controller[action]()
        oldPlayer.emit('error')
        oldPlayer.emit('ended')
        assert.strictEqual(callbacks, 0, 'teardown and queued events must not call any handlers')
        assert.strictEqual(oldPlayer.stops, 1)
        assert.strictEqual(oldPlayer.destroys, 1)
        if (action === 'replace') {
            contexts[1].emit('ended')
            assert.strictEqual(callbacks, 1, 'replacement handlers remain active')
        } else assert.strictEqual(controller.getCurrentSource(), '')
        controller.stop()
        controller.destroy()
        assert.ok(contexts.every(player => player.destroys === 1), 'repeated teardown does not destroy twice')
    }])
}

;(async () => {
    let failed = 0
    for (const [name, run] of tests) {
        try { await run(); console.log('PASS ' + name) }
        catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.message) }
    }
    console.log('native audio event isolation: ' + (tests.length - failed) + '/' + tests.length + ' passed')
    if (failed) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
