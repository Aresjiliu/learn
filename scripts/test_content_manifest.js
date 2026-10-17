const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('services/content-api.js', 'utf8')
    .replace("import request from '../utils/request'", 'const request = () => Promise.reject(new Error(\'network disabled in test\'))')
    .replace("import config from '../config'", "const config = { enableContentApi: false, enableLocalSampleFallback: true, contentApiBaseUrl: 'http://local.test', contentApiBasePath: '/api/v1' }")
    .replace("import { isContentSuccess, normalizeCourseResponse, normalizeDictionaryResponse, normalizeExamResponse, normalizeExamPapersResponse } from './adapters'", 'const isContentSuccess = value => value && value.code === 200; const normalizeCourseResponse = value => value; const normalizeDictionaryResponse = value => value; const normalizeExamResponse = value => value; const normalizeExamPapersResponse = value => value')
    .replace("import { buildBookPath, buildBookWordsPath, buildBooksPath, buildCategoriesPath, buildContentManifestPath, buildDictionaryPath, buildDictionarySearchPath, buildExamPath, buildExamsPath } from './content-api-core'", 'const buildBookPath = () => \'/books/1\'; const buildBookWordsPath = () => \'/books/1/words\'; const buildBooksPath = () => \'/books\'; const buildCategoriesPath = () => \'/categories\'; const buildContentManifestPath = () => \'/content/manifest\'; const buildDictionaryPath = () => \'/dictionary/1\'; const buildDictionarySearchPath = () => \'/dictionary/search\'; const buildExamPath = () => \'/exams/1\'; const buildExamsPath = () => \'/exams\'')
    .replace("import { getLocalDictionaryDetail, getLocalDictionarySearch } from './dictionary'", 'const getLocalDictionaryDetail = () => null; const getLocalDictionarySearch = () => Promise.resolve({ code: 200, data: { words: [] } })')
    .replace("import { getLocalExamPapers, getLocalPracticeSet } from './exam'", 'const getLocalExamPapers = () => Promise.resolve({ code: 200, data: { papers: [] } }); const getLocalPracticeSet = () => Promise.resolve({ code: 200, data: { questions: [] } })')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')

const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { getContentManifest }`, context)

context.module.exports.getContentManifest().then(manifest => {
    assert.strictEqual(manifest.code, 200)
    assert.strictEqual(manifest.data.source, 'local-sample')
    assert.ok(manifest.data.capabilities.includes('book-words'))
    console.log('content manifest tests: PASS')
}).catch(error => {
    console.error(error)
    process.exitCode = 1
})
