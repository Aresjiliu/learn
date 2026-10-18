const fs = require('fs')
const assert = require('assert')
const vm = require('vm')

const source = fs.readFileSync('services/media/audio.js', 'utf8')
    .replace(/const audioController[\s\S]*?\n\nexport[\s\S]*$/, '')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
let service
const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { createAudioController }`, context)
service = context.module.exports

const calls = []
const players = []
const controller = service.createAudioController(() => {
    const events = {}
    const player = {
        events,
        onEnded(handler) { events.ended = handler },
        onError(handler) { events.error = handler },
        stop() { calls.push('stop') },
        pause() { calls.push('pause') },
        play() { calls.push('play') },
        destroy() { calls.push('destroy') },
        src: ''
    }
    players.push(player)
    return player
})
let ended = 0
assert.strictEqual(controller.play('', {}), false)
assert.strictEqual(players.length, 0, 'empty input must not allocate a native context')
assert.strictEqual(controller.play('https://example.test/a.mp3', { onEnded: () => { ended += 1 } }), true)
const player = players[0]
assert.strictEqual(player.src, 'https://example.test/a.mp3')
assert.strictEqual(controller.getCurrentSource(), 'https://example.test/a.mp3')
player.events.ended()
assert.strictEqual(ended, 1)
controller.pause()
controller.stop()
assert.strictEqual(controller.getCurrentSource(), '')
player.events.ended()
assert.strictEqual(ended, 1, 'stop invalidates queued events')
controller.destroy()
assert.deepStrictEqual(calls, ['play', 'pause', 'stop', 'destroy'])
assert.strictEqual(controller.play('https://example.test/b.mp3', { onEnded: () => { ended += 1 } }), true)
assert.strictEqual(players.length, 2, 'play after teardown creates a fresh native context')
assert.strictEqual(players[1].src, 'https://example.test/b.mp3')
player.events.ended()
assert.strictEqual(ended, 1)
players[1].events.ended()
assert.strictEqual(ended, 2)
controller.destroy()
assert.strictEqual(controller.getCurrentSource(), '')
assert.deepStrictEqual(calls, ['play', 'pause', 'stop', 'destroy', 'play', 'stop', 'destroy'])
console.log('audio service tests: PASS')
