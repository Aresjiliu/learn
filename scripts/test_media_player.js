const assert = require('assert')
const { component } = require('./test_media_player_session')
const { definition, instance, emitted } = component()
assert.strictEqual(definition.properties.src.type.name, 'String')
assert.strictEqual(definition.properties.initialTime.type.name, 'Number')
instance.onTimeUpdate({ detail: { currentTime: 12 } })
instance.onError({ detail: { errMsg: 'mock' } })
assert.deepStrictEqual(emitted, [
    { name: 'timeupdate', detail: { currentTime: 12, sessionId: 'A-1' } },
    { name: 'error', detail: { errMsg: 'mock', sessionId: 'A-1' } }
])
console.log('media player tests: PASS')
