const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const state = { options: null }
const source = fs.readFileSync('services/content-api.js', 'utf8')
    .replace("import request from '../utils/request'", "const request = () => Promise.reject(new Error('content API unavailable'))")
    .replace("import config from '../config'", "const config = { enableContentApi: true, enableLocalSampleFallback: true, contentApiBasePath: '/api/v1' }")
    .replace("import { isContentSuccess, normalizeCourseResponse, normalizeDictionaryResponse, normalizeExamResponse, normalizeExamPapersResponse } from './adapters'", "const isContentSuccess = value => value && Boolean(value.data); const normalizeCourseResponse = value => value; const normalizeDictionaryResponse = value => value; const normalizeExamResponse = value => value; const normalizeExamPapersResponse = value => value")
    .replace("import { buildBookPath, buildBookWordsPath, buildBooksPath, buildCategoriesPath, buildContentManifestPath, buildDictionaryPath, buildDictionarySearchPath, buildExamPath, buildExamsPath } from './content-api-core'", "const buildBookPath = id => '/api/v1/books/' + id; const buildBookWordsPath = id => '/api/v1/books/' + id + '/words'; const buildBooksPath = () => '/api/v1/books'; const buildCategoriesPath = () => '/api/v1/categories'; const buildContentManifestPath = () => '/api/v1/content/manifest'; const buildDictionaryPath = id => '/api/v1/dictionary/' + id; const buildDictionarySearchPath = () => '/api/v1/dictionary/search'; const buildExamPath = id => '/api/v1/exams/' + id; const buildExamsPath = () => '/api/v1/exams'")
    .replace("import { getLocalDictionaryDetail, getLocalDictionarySearch } from './dictionary'", "const getLocalDictionaryDetail = () => ({}); const getLocalDictionarySearch = () => ({})")
    .replace("import { getLocalExamPapers, getLocalPracticeSet } from './exam'", "const getLocalExamPapers = () => ({}); const getLocalPracticeSet = options => { state.options = options; return Promise.resolve({ questions: [{ id: 'local-1', audioUrl: 'http://127.0.0.1:18090/exam.mp3', audioPlayable: true }], papers: [], meta: { source: 'local-sample' } }) }")
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')

const context = { module: { exports: {} }, state }
vm.runInNewContext(`${source}\nmodule.exports = { getExamPaper }`, context)

;(async () => {
    const result = await context.module.exports.getExamPaper('paper-1', { audioBaseUrl: 'http://127.0.0.1:18090' })
    assert.strictEqual(result.questions.length, 1)
    assert.strictEqual(result.meta.source, 'local-sample')
    assert.strictEqual(state.options.audioBaseUrl, 'http://127.0.0.1:18090')
    console.log('exam content API fallback tests: PASS')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
