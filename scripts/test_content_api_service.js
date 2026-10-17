const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('services/content-api.js', 'utf8')
    .replace("import request from '../utils/request'", `const request = options => {
        if (options.url === '/api/v1/books/1') return Promise.resolve({ code: 200, data: { book: { id: '1', title: '在线课程', chapters: [{ id: 'lesson-1', videos: [{ id: 'video-1', url: 'https://media.example/video.mp4' }] }] } } })
        if (options.url === '/api/v1/books/1/words') return Promise.resolve({ code: 200, data: { words: [{ word: 'немало' }], word_forms: { немало: [{ prototype: 'немалый' }] }, mapping_decisions: [] } })
        return Promise.reject(new Error('unexpected request: ' + options.url))
    }`)
    .replace("import config from '../config'", "const config = { enableContentApi: true, enableLocalSampleFallback: false, contentApiBasePath: '/api/v1' }")
    .replace("import { isContentSuccess, normalizeCourseResponse, normalizeDictionaryResponse, normalizeExamResponse, normalizeExamPapersResponse } from './adapters'", "const isContentSuccess = response => response && (response.code === 200 || Boolean(response.data)); const normalizeCourseResponse = response => response; const normalizeDictionaryResponse = response => response; const normalizeExamResponse = response => response; const normalizeExamPapersResponse = response => response")
    .replace("import { buildBookPath, buildBookWordsPath, buildBooksPath, buildCategoriesPath, buildContentManifestPath, buildDictionaryPath, buildDictionarySearchPath, buildExamPath, buildExamsPath } from './content-api-core'", "const buildBookPath = id => '/api/v1/books/' + id; const buildBookWordsPath = id => '/api/v1/books/' + id + '/words'; const buildBooksPath = () => '/api/v1/books'; const buildCategoriesPath = () => '/api/v1/categories'; const buildContentManifestPath = () => '/api/v1/content/manifest'; const buildDictionaryPath = id => '/api/v1/dictionary/' + id; const buildDictionarySearchPath = () => '/api/v1/dictionary/search'; const buildExamPath = id => '/api/v1/exams/' + id; const buildExamsPath = () => '/api/v1/exams'")
    .replace("import { getLocalDictionaryDetail, getLocalDictionarySearch } from './dictionary'", "const getLocalDictionaryDetail = () => ({}); const getLocalDictionarySearch = () => ({})")
    .replace("import { getLocalExamPapers, getLocalPracticeSet } from './exam'", "const getLocalExamPapers = () => ({}); const getLocalPracticeSet = () => ({})")
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')

const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { getContentBookDetail }`, context)

;(async () => {
    const result = await context.module.exports.getContentBookDetail('1')
    assert.strictEqual(result.data.course.title, '在线课程')
    assert.strictEqual(result.data.words[0].word, 'немало')
    assert.strictEqual(result.data.wordForms.немало[0].prototype, 'немалый')
    assert.strictEqual(result.data.chapters[0].videos[0].url, 'https://media.example/video.mp4')
    console.log('content API service tests: PASS')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
