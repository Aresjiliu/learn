const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('services/playback.js', 'utf8')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { shouldPersistProgress }`, context)
const { shouldPersistProgress } = context.module.exports

assert.strictEqual(shouldPersistProgress(0, -1), true)
assert.strictEqual(shouldPersistProgress(30, -1), true)
assert.strictEqual(shouldPersistProgress(30.8, 30), false)
assert.strictEqual(shouldPersistProgress(31, 30), false)
assert.strictEqual(shouldPersistProgress(60, 30), true)
assert.strictEqual(shouldPersistProgress(61, 30), true)
assert.strictEqual(shouldPersistProgress(59, 30), false)
assert.strictEqual(shouldPersistProgress(29, -1), false)
console.log('playback service tests: PASS')
