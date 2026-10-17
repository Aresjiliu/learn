const fs = require('fs')
const assert = require('assert')
const vm = require('vm')

let definition
const source = fs.readFileSync('components/media-player/media-player.js', 'utf8')
vm.runInNewContext(source, {
    Component(value) { definition = value }
})

assert.strictEqual(definition.properties.src.type.name, 'String')
assert.strictEqual(definition.properties.initialTime.type.name, 'Number')
const emitted = []
const instance = {
    forward: definition.methods.forward,
    triggerEvent(name, detail) { emitted.push({ name, detail }) }
}
definition.methods.onTimeUpdate.call(instance, { detail: { currentTime: 12 } })
definition.methods.onError.call(instance, { detail: { errMsg: 'mock' } })
assert.deepStrictEqual(emitted, [
    { name: 'timeupdate', detail: { currentTime: 12 } },
    { name: 'error', detail: { errMsg: 'mock' } }
])
console.log('media player tests: PASS')
