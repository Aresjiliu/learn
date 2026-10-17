const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'data', 'content_samples')
const files = [
    'dictionary_words',
    'book_1_words',
    'exam_practice_sample',
    'exam_fillin_sample',
    'exam_papers'
]

for (const name of files) {
    const jsonValue = JSON.parse(fs.readFileSync(path.join(root, `${name}.json`), 'utf8'))
    const runtimeValue = require(path.join(root, `${name}.js`))
    assert.deepStrictEqual(runtimeValue, jsonValue, `${name}.js 与 JSON 不一致`)
}

console.log('runtime sample tests: PASS')
