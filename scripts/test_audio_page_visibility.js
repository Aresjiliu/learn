const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const pages = [
    { name: 'dictionary', file: 'pages/dictionary/detail/detail.js', play: 'playAudio', state: 'isPlaying' },
    { name: 'practice', file: 'pages/exam/practice/practice.js', play: 'playQuestionAudio', state: 'isPlayingAudio' }
]

async function createFixture(spec) {
    let definition
    let onStop = () => {}
    const plays = []
    const updates = []
    const toasts = []
    const audio = {
        stops: 0,
        play(url, handlers) {
            plays.push({ url, handlers })
            return true
        },
        stop() {
            this.stops += 1
            onStop()
        }
    }
    const question = { id: 'q1', audioPlayable: true, audioUrl: 'https://example.test/audio.mp3' }
    vm.runInNewContext(fs.readFileSync(spec.file, 'utf8').replace(/^import .*$/gm, ''), {
        Page(value) { definition = value },
        config: {},
        audioController: audio,
        getLocalPracticeSet: () => Promise.resolve({ questions: [question] }),
        resolveExamAudioQuestion: value => value,
        createSession: questionIds => ({ questionIds, answers: {}, score: 0, completedCount: 0 }),
        getQuestionOptionKeys: () => [],
        wx: { showToast: value => toasts.push(value), getStorageSync: () => null }
    }, { filename: spec.file })
    const page = {
        ...definition,
        data: JSON.parse(JSON.stringify(definition.data)),
        setData(values) {
            updates.push(values)
            Object.assign(this.data, values)
        }
    }
    const lifecycle = name => {
        if (typeof page[name] === 'function') page[name]()
    }
    page.onLoad({})
    lifecycle('onShow')
    await new Promise(resolve => setImmediate(resolve))
    if (spec.name === 'dictionary') page.data.word = { audioUrl: question.audioUrl }
    return { page, audio, plays, updates, toasts, lifecycle, onStop: callback => { onStop = callback } }
}

const cases = [
    ['visible playback still handles completion and failure', f => {
        f.page[f.spec.play]()
        assert.strictEqual(f.page.data[f.spec.state], true)
        f.plays[0].handlers.onEnded()
        assert.strictEqual(f.page.data[f.spec.state], false)
        f.page[f.spec.play]()
        f.plays[1].handlers.onError()
        assert.strictEqual(f.page.data[f.spec.state], false)
        assert.strictEqual(f.toasts.length, 1)
        if (f.spec.name === 'practice') assert.ok(f.page.data.audioError)
    }],
    ['hide stops playback and resets its indicator', f => {
        f.page[f.spec.play]()
        f.lifecycle('onHide')
        assert.strictEqual(f.audio.stops, 1, 'onHide must stop the player')
        assert.strictEqual(f.page.data[f.spec.state], false)
    }],
    ['hidden callbacks cannot write state or display errors', f => {
        f.page[f.spec.play]()
        const handlers = f.plays[0].handlers
        f.lifecycle('onHide')
        const updateCount = f.updates.length
        const error = f.page.data.audioError
        handlers.onError()
        handlers.onEnded()
        assert.strictEqual(f.updates.length, updateCount, 'hidden callbacks must not call setData')
        assert.strictEqual(f.toasts.length, 0)
        assert.strictEqual(f.page.data.audioError, error)
    }],
    ['hide guards callbacks before stopping the player', f => {
        f.page[f.spec.play]()
        f.onStop(() => {
            const updateCount = f.updates.length
            f.plays[0].handlers.onError()
            f.plays[0].handlers.onEnded()
            assert.strictEqual(f.updates.length, updateCount, 'stop-time callbacks must be ignored')
        })
        f.lifecycle('onHide')
        assert.strictEqual(f.toasts.length, 0)
        assert.strictEqual(f.page.data[f.spec.state], false)
    }],
    ['show allows fresh playback without automatically resuming', f => {
        f.page[f.spec.play]()
        f.lifecycle('onHide')
        f.lifecycle('onShow')
        assert.strictEqual(f.plays.length, 1)
        assert.strictEqual(f.page.data[f.spec.state], false)
        f.page[f.spec.play]()
        assert.strictEqual(f.plays.length, 2)
        assert.strictEqual(f.page.data[f.spec.state], true)
        f.plays[1].handlers.onError()
        assert.strictEqual(f.page.data[f.spec.state], false)
        assert.strictEqual(f.toasts.length, 1, 'visible errors must remain observable after onShow')
        f.page[f.spec.play]()
        f.plays[2].handlers.onEnded()
        assert.strictEqual(f.page.data[f.spec.state], false)
    }],
    ['unload still stops playback and ignores late callbacks', f => {
        f.page[f.spec.play]()
        const handlers = f.plays[0].handlers
        const updateCount = f.updates.length
        f.lifecycle('onUnload')
        handlers.onError()
        handlers.onEnded()
        assert.strictEqual(f.audio.stops, 1)
        assert.strictEqual(f.updates.length, updateCount, 'unload must not write page state')
        assert.strictEqual(f.toasts.length, 0)
    }]
]

;(async () => {
    let failures = 0
    for (const spec of pages) {
        for (const [name, check] of cases) {
            const fixture = await createFixture(spec)
            try {
                check({ ...fixture, spec })
                console.log(`PASS ${spec.name}: ${name}`)
            } catch (error) {
                failures += 1
                console.error(`FAIL ${spec.name}: ${name}\n${error.stack}`)
            }
        }
    }
    assert.strictEqual(failures, 0, `${failures} audio page visibility cases failed`)
    console.log('audio page visibility tests: PASS (12 cases)')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
