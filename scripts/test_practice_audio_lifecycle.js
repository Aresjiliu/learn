const assert = require('assert')
const fs = require('fs')

const source = fs.readFileSync('pages/exam/practice/practice.js', 'utf8')
assert.ok(source.includes('this._isUnloaded = false'))
assert.ok(source.includes('if (!this._isUnloaded) this.setData({ isPlayingAudio: false })'))
assert.ok(source.includes('this._isUnloaded = true'))
console.log('practice audio lifecycle tests: PASS')
