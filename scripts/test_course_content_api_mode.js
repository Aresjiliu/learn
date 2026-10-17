const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const mockState = { lastOptions: null }
const source = fs.readFileSync('services/course.js', 'utf8')
    .replace("import request from '../utils/request'", 'const request = () => Promise.reject(new Error(\'legacy API should not be called\'))')
    .replace("import config from '../config'", "const config = { enableContentApi: true, enableLocalSampleFallback: true, enableLocalTestMedia: true, devMediaBaseUrl: 'http://127.0.0.1:18090' }")
    .replace("import { isContentSuccess, normalizeCourseResponse } from './adapters'", 'const isContentSuccess = value => value && (value.code === 200 || value.data); const normalizeCourseResponse = value => value')
    .replace("import { getContentBookDetail, getContentBooks, getContentCategories } from './content-api'", "const getContentBookDetail = bookId => Promise.resolve({ code: 200, data: { course: { id: bookId, title: '在线俄语课程' }, words: [{ word: 'агент' }], chapters: [{ id: 'chapter-1', videos: [{ id: 'video-1', url: 'https://media.example/video.mp4' }] }] } }); const getContentCategories = () => Promise.resolve({ code: 200, data: { categories: [{ id: '3', name: '教材分类 3' }] } }); const getContentBooks = options => { mockState.lastOptions = options; if (options.query === '故障') return Promise.reject(new Error('content API unavailable')); return Promise.resolve({ code: 200, data: { books: [{ id: '1', title: '俄语课程' }] } }) }")
    .replace("const textbookSample = require('../data/content_samples/book_1_words.js')", `const textbookSample = ${fs.readFileSync('data/content_samples/book_1_words.json', 'utf8')}`)
    .replace("const audioIndex = require('../data/content_samples/book_1_audio.js')", 'const audioIndex = {}')
    .replace("const wordFormSample = require('../data/content_samples/book_word_forms.js')", `const wordFormSample = ${fs.readFileSync('data/content_samples/book_word_forms.json', 'utf8')}`)
    .replace("const mappingDecisionSample = require('../data/content_samples/mapping_decisions.js')", "const mappingDecisionSample = { decisions: [] }")
    .replace("const categorySample = require('../data/content_samples/categories.js')", `const categorySample = ${fs.readFileSync('data/content_samples/categories.json', 'utf8')}`)
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')

const context = { module: { exports: {} }, mockState }
vm.runInNewContext(`${source}\nmodule.exports = { getCategories, getCourses, getCourseDetail }`, context)
    const { getCategories, getCourses, getCourseDetail } = context.module.exports

;(async () => {
    const categories = await getCategories()
    assert.strictEqual(categories.data.categories[0].id, '3')
    const courses = await getCourses({ query: '俄语', categoryId: '3', page: 2, pageSize: 10 })
    assert.strictEqual(courses.data.books.length, 1)
    assert.deepStrictEqual(mockState.lastOptions, { query: '俄语', categoryId: '3', page: 2, pageSize: 10 })
    const detail = await getCourseDetail('1')
    assert.strictEqual(detail.data.course.title, '在线俄语课程')
    assert.strictEqual(detail.data.words[0].word, 'агент')
    assert.strictEqual(detail.data.chapters[0].videos[0].url, 'https://media.example/video.mp4')
    const fallback = await getCourses({ query: '故障', categoryId: '4' })
    assert.strictEqual(fallback.data.courses.length, 0)
    console.log('course content API mode tests: PASS')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
