const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const config = { enableContentApi: false, enableLocalDictionaryApi: true, enableLocalSampleFallback: true, contentApiBaseUrl: 'http://127.0.0.1:18091', contentApiBasePath: '/api/v1' }
const calls = []
const request = options => {
    calls.push(options)
    return Promise.resolve({ code: 200, data: { words: [{ sourceId: '42', word: 'привет' }] }, meta: { source: 'local-export-index', total: 1 } })
}
const imports = {
    request,
    config,
    isContentSuccess: response => response.code === 200,
    normalizeCourseResponse: response => response,
    normalizeDictionaryResponse: response => response,
    normalizeExamResponse: response => response,
    normalizeExamPapersResponse: response => response,
    getLocalDictionarySearch: () => Promise.resolve({ code: 200, data: { words: [] }, meta: { source: 'local-sample' } }),
    getLocalDictionaryDetail: () => null,
    getLocalExamPapers: () => Promise.resolve({ code: 200, data: { papers: [] } }),
    getLocalPracticeSet: () => Promise.resolve({ code: 200, data: { questions: [] } })
}
for (const name of ['buildBookPath', 'buildBookWordsPath', 'buildBooksPath', 'buildCategoriesPath', 'buildContentManifestPath', 'buildDictionaryPath', 'buildDictionarySearchPath', 'buildExamPath', 'buildExamsPath']) imports[name] = (...parts) => '/api/v1/' + name + '/' + parts.join('/')
let source = fs.readFileSync('services/content-api.js', 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export \{.*\}\s*$/gm, '')
const context = { ...imports, module: { exports: {} }, Promise }
vm.runInNewContext(`${source}\nmodule.exports = { getDictionarySearch, getDictionaryDetail, getExamPapers }`, context)

;(async () => {
    const result = await context.module.exports.getDictionarySearch('привет')
    assert.strictEqual(result.data.words[0].word, 'привет')
    assert.strictEqual(calls.length, 1, 'dictionary-only mode must call the API')
    assert.strictEqual(calls[0].baseUrl, config.contentApiBaseUrl)
    await context.module.exports.getDictionaryDetail('42')
    assert.strictEqual(calls.length, 2, 'dictionary detail must use the API too')
    await context.module.exports.getExamPapers()
    assert.strictEqual(calls.length, 2, 'exam source must remain local')
    console.log('dictionary API mode tests: PASS')
})().catch(error => { console.error(error); process.exitCode = 1 })
