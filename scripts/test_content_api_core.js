const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('services/content-api-core.js', 'utf8')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { buildDictionarySearchPath, buildDictionaryPath, buildExamPath, buildExamsPath, buildBooksPath, buildCategoriesPath, buildBookPath, buildBookWordsPath, buildContentManifestPath }`, context)
const { buildDictionarySearchPath, buildDictionaryPath, buildExamPath, buildExamsPath, buildBooksPath, buildCategoriesPath, buildBookPath, buildBookWordsPath, buildContentManifestPath } = context.module.exports

assert.strictEqual(buildDictionarySearchPath('俄语 学习', 2, 20), `/api/v1/dictionary/search?q=${encodeURIComponent('俄语 学习')}&page=2&page_size=20`)
assert.strictEqual(buildDictionaryPath('word/1'), '/api/v1/dictionary/word%2F1')
assert.strictEqual(buildExamPath('paper/1'), '/api/v1/exams/paper%2F1')
assert.strictEqual(buildExamsPath(2, 10), '/api/v1/exams?page=2&page_size=10')
assert.strictEqual(buildBooksPath('俄语', 2, 10), `/api/v1/books?q=${encodeURIComponent('俄语')}&page=2&page_size=10`)
assert.strictEqual(buildBooksPath('', 1, 20, '/api/v1', '3'), '/api/v1/books?q=&page=1&page_size=20&category_id=3')
assert.strictEqual(buildCategoriesPath(), '/api/v1/categories')
assert.strictEqual(buildBookPath('1'), '/api/v1/books/1')
assert.strictEqual(buildBookWordsPath('1'), '/api/v1/books/1/words')
assert.strictEqual(buildContentManifestPath(), '/api/v1/content/manifest')
console.log('content api core tests: PASS')
