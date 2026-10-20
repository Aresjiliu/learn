const assert = require('assert')
const fs = require('fs')

function component(wx = {}, properties = {}) {
    let definition
    new Function('Component', 'wx', fs.readFileSync('components/media-player/media-player.js', 'utf8'))(value => { definition = value }, wx)
    const emitted = []
    const defaults = Object.fromEntries(Object.entries(definition.properties).map(([key, value]) => [key, value.value]))
    const instance = { ...definition.methods, data: JSON.parse(JSON.stringify(definition.data || {})),
        setData(update) { Object.assign(this.data, update) },
        properties: { ...defaults, sessionId: 'A-1', desiredRate: 1.5, ...properties },
        triggerEvent(name, detail) { emitted.push({ name, detail }) } }
    if (definition.lifetimes) definition.lifetimes.attached.call(instance)
    return { definition, instance, emitted }
}

function run() {
    const calls = []
    const { definition, instance, emitted } = component({ createVideoContext(id, scope) {
        assert.strictEqual(id, 'mediaVideo'); assert.strictEqual(scope, instance)
        return { playbackRate(rate) { calls.push(rate) }, seek(position) { calls.push(['seek', position]) } }
    } })
    instance.properties.sessionId = 'B-2'
    instance.onTimeUpdate({ detail: { currentTime: 12, sessionId: 'forged' } })
    assert.strictEqual(emitted[0].detail.sessionId, 'A-1', 'native events must carry the identity captured at attach')
    definition.lifetimes.ready.call(instance)
    assert.deepStrictEqual(calls, [1.5], 'ready applies desired rate through scoped VideoContext')
    instance.onPlay({ detail: {} })
    assert.deepStrictEqual(calls, [1.5, 1.5])
    for (const rate of [0.8, 1, 1.25, 1.5, 2]) assert.strictEqual(instance.setPlaybackRate(rate), true)
    for (const rate of [NaN, undefined, 3, '2']) assert.strictEqual(instance.setPlaybackRate(rate), false)
    assert.strictEqual(instance.seekTo(0), true)
    assert.strictEqual(instance.seekTo(-1), false)
    instance.onPlaybackRateChange({ detail: { playbackRate: 1.25 } })
    instance.onPlay({ detail: {} })
    assert.strictEqual(calls[calls.length - 1], 1.25, 'play must retain the valid native rate change')
    const before = emitted.length
    definition.lifetimes.detached.call(instance)
    instance.onTimeUpdate({ detail: { currentTime: 100 } })
    assert.strictEqual(emitted.length, before)
    assert.strictEqual(instance.setPlaybackRate(2), false)
    assert.strictEqual(instance.seekTo(1), false)
    for (const context of [{}, { playbackRate() { throw Error('unsupported') } }]) {
        const item = component({ createVideoContext() { return context } })
        item.definition.lifetimes.ready.call(item.instance)
        assert.strictEqual(item.instance.setPlaybackRate(2), false)
        assert.ok(item.emitted.some(event => event.name === 'controlerror'))
        assert.ok(!item.emitted.some(event => event.name === 'rateapplied'))
    }
    for (const mode of ['fallback-success', 'both-throw', 'missing-method']) {
        const attempts = []
        let fail = false
        const context = { playbackRate(rate) {
            attempts.push(rate)
            if (fail && (rate !== 1 || mode === 'both-throw')) throw Error('unsupported')
        } }
        const item = component({ createVideoContext() { return context } }, { desiredRate: 1.5 })
        item.definition.lifetimes.ready.call(item.instance)
        assert.strictEqual(item.instance._desiredRate, 1.5)
        const before = item.emitted.length
        fail = true
        if (mode === 'missing-method') delete context.playbackRate
        assert.strictEqual(item.instance.setPlaybackRate(2), false)
        const applied = item.emitted.slice(before).filter(event => event.name === 'rateapplied')
        assert.deepStrictEqual(applied.map(event => event.detail.rate), mode === 'fallback-success' ? [1] : [], mode + ': only a successful fallback call can confirm 1x')
        assert.strictEqual(item.instance._desiredRate, mode === 'fallback-success' ? 1 : 1.5, mode + ': failure must retain previous desired rate')
        assert.ok(item.emitted.slice(before).some(event => event.name === 'controlerror'))
        assert.deepStrictEqual(attempts, mode === 'missing-method' ? [1.5] : [1.5, 2, 1])
    }
    console.log('media player immutable session / native commands: PASS')
}
if (require.main === module) run()
module.exports = { component, run }
