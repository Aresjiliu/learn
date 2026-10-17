const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('services/practice-progress.js', 'utf8')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { createSession, recordAnswer }`, context)
const { createSession, recordAnswer } = context.module.exports

let session = createSession(['1', '2'])
session = recordAnswer(session, '1', true)
assert.strictEqual(session.score, 1)
assert.strictEqual(session.completedCount, 1)
assert.strictEqual(session.answers['1'].answer, '')
session = recordAnswer(session, '1', false)
assert.strictEqual(session.score, 1)
assert.strictEqual(session.completedCount, 1)
session = recordAnswer(session, '2', false)
assert.strictEqual(session.score, 1)
assert.strictEqual(session.completedCount, 2)
console.log('practice progress tests: PASS')
