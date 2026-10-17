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

const events = {}
const calls = []
const player = {
    onEnded(handler) { events.ended = handler },
    onError(handler) { events.error = handler },
    stop() { calls.push('stop') },
    pause() { calls.push('pause') },
    play() { calls.push('play') },
    destroy() { calls.push('destroy') },
    src: ''
}
const controller = service.createAudioController(() => player)
let ended = 0
assert.strictEqual(controller.play('', {}), false)
assert.strictEqual(controller.play('https://example.test/a.mp3', { onEnded: () => { ended += 1 } }), true)
assert.strictEqual(player.src, 'https://example.test/a.mp3')
assert.strictEqual(controller.getCurrentSource(), 'https://example.test/a.mp3')
events.ended()
assert.strictEqual(ended, 1)
controller.pause()
controller.stop()
assert.strictEqual(controller.getCurrentSource(), '')
controller.destroy()
assert.deepStrictEqual(calls, ['stop', 'play', 'pause', 'stop', 'destroy'])
console.log('audio service tests: PASS')
