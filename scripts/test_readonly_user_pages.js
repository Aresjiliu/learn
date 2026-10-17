const assert = require('assert')
const fs = require('fs')

const files = [
    'pages/my-courses/my-courses.js',
    'pages/collections/collections.js',
    'pages/profile/profile.js'
]

for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    assert.ok(source.includes("!config.enableRemoteWrites"), `${file} 缺少只读门禁`)
}

const collections = fs.readFileSync(files[1], 'utf8')
assert.ok(collections.includes('return Promise.resolve()'))
assert.ok(fs.readFileSync(files[0], 'utf8').includes('本地只读联调模式'))
assert.ok(collections.includes('本地只读联调模式'))
assert.ok(fs.readFileSync('pages/my-courses/my-courses.wxml', 'utf8').includes('{{modeMessage}}'))
assert.ok(fs.readFileSync('pages/collections/collections.wxml', 'utf8').includes('{{modeMessage}}'))
console.log('readonly user page tests: PASS')
