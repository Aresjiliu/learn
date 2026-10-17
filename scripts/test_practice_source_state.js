const assert = require('assert')
const fs = require('fs')

const source = fs.readFileSync('pages/exam/practice/practice.js', 'utf8')
assert.ok(source.includes("String(result.meta.source || '').startsWith('local-sample')"))
assert.ok(source.includes("source: 'local-sample'"))
assert.ok(source.includes("? 'content-api' : 'local-sample'"))
console.log('practice source state tests: PASS')
