import request from '../utils/request'
import config from '../config'
import { isContentSuccess, normalizeCourseResponse, normalizeDictionaryResponse, normalizeExamResponse, normalizeExamPapersResponse } from './adapters'
import { buildBookPath, buildBookWordsPath, buildBooksPath, buildCategoriesPath, buildContentManifestPath, buildDictionaryPath, buildDictionarySearchPath, buildExamPath, buildExamsPath } from './content-api-core'
import { getLocalDictionaryDetail, getLocalDictionarySearch } from './dictionary'
import { getLocalExamPapers, getLocalPracticeSet } from './exam'

function getDictionarySearch(query, options = {}) {
    if (!config.enableContentApi && !config.enableLocalDictionaryApi) return getLocalDictionarySearch(query, options)
    return request({
        baseUrl: config.contentApiBaseUrl,
        url: buildDictionarySearchPath(query, options.page, options.pageSize, config.contentApiBasePath),
        method: 'GET',
        skipAuth: true
    }).then(response => normalizeDictionaryResponse(response)).then(response => {
        if (!isContentSuccess(response)) throw new Error('词典接口返回异常')
        return response
    }).catch(error => {
        if (config.enableLocalSampleFallback) return getLocalDictionarySearch(query, options)
        return Promise.reject(error)
    })
}

function getDictionaryDetail(wordId) {
    if (!config.enableContentApi && !config.enableLocalDictionaryApi) {
        return Promise.resolve({
            code: 200,
            data: { word: getLocalDictionaryDetail(wordId) },
            meta: { source: 'local-sample' }
        })
    }
    return request({
        baseUrl: config.contentApiBaseUrl,
        url: buildDictionaryPath(wordId, config.contentApiBasePath),
        method: 'GET',
        skipAuth: true
    }).then(response => normalizeDictionaryResponse(response)).then(response => {
        if (!isContentSuccess(response)) throw new Error('词典详情接口返回异常')
        return response
    }).catch(error => {
        if (config.enableLocalSampleFallback) {
            return {
                code: 200,
                data: { word: getLocalDictionaryDetail(wordId) },
                meta: { source: 'local-sample-fallback' }
            }
        }
        return Promise.reject(error)
    })
}

function getContentBooks(options = {}) {
    return request({
        baseUrl: config.contentApiBaseUrl,
        url: buildBooksPath(options.query, options.page, options.pageSize, config.contentApiBasePath, options.categoryId),
        method: 'GET'
    }).then(response => {
        if (!isContentSuccess(response)) throw new Error('课程接口返回异常')
        return { code: 200, ...normalizeCourseResponse(response) }
    })
}

function getContentCategories() {
    return request({
        baseUrl: config.contentApiBaseUrl,
        url: buildCategoriesPath(config.contentApiBasePath),
        method: 'GET'
    }).then(response => {
        if (!isContentSuccess(response) || !response.data || !Array.isArray(response.data.categories)) throw new Error('分类接口返回异常')
        return response
    })
}

function getContentBookDetail(bookId) {
    return Promise.all([
        request({
            baseUrl: config.contentApiBaseUrl,
            url: buildBookPath(bookId, config.contentApiBasePath),
            method: 'GET'
        }),
        request({
            baseUrl: config.contentApiBaseUrl,
            url: buildBookWordsPath(bookId, config.contentApiBasePath),
            method: 'GET'
        })
    ]).then(([bookResponse, wordsResponse]) => {
        if (!isContentSuccess(bookResponse) || !isContentSuccess(wordsResponse)) throw new Error('课程详情接口返回异常')
        const normalized = normalizeCourseResponse({
            ...bookResponse,
            data: {
                ...bookResponse.data,
                course: bookResponse.data.book,
                words: wordsResponse.data.words,
                wordForms: wordsResponse.data.wordForms || wordsResponse.data.word_forms || wordsResponse.data.wordFormIndex || {},
                mappingDecisions: wordsResponse.data.mappingDecisions || wordsResponse.data.mapping_decisions || bookResponse.data.mappingDecisions || []
            }
        })
        return { code: 200, ...normalized, data: { ...normalized.data, hasPurchased: false, is_collected: false, chapters: normalized.data.course.chapters || [] } }
    })
}

function getExamPaper(paperId, options = {}) {
    if (!config.enableContentApi) return getLocalPracticeSet({ paperId, ...options })
    return request({
        baseUrl: config.contentApiBaseUrl,
        url: buildExamPath(paperId, config.contentApiBasePath),
        method: 'GET'
    }).then(response => normalizeExamResponse(response)).then(response => {
        if (!isContentSuccess(response)) throw new Error('试卷接口返回异常')
        return response
    }).catch(error => {
        if (config.enableLocalSampleFallback) return getLocalPracticeSet({ paperId, ...options })
        return Promise.reject(error)
    })
}

function getExamPapers(options = {}) {
    if (!config.enableContentApi) return getLocalExamPapers()
    return request({
        baseUrl: config.contentApiBaseUrl,
        url: buildExamsPath(options.page, options.pageSize, config.contentApiBasePath),
        method: 'GET'
    }).then(response => {
        const normalized = normalizeExamPapersResponse(response)
        if (!isContentSuccess(normalized)) throw new Error('试卷目录接口返回异常')
        return normalized
    }).catch(error => {
        if (config.enableLocalSampleFallback) return getLocalExamPapers()
        return Promise.reject(error)
    })
}

function getContentManifest() {
    const localManifest = () => ({
        code: 200,
        data: {
            contentVersion: 'phase1-local-20261014-media-v2',
            source: 'local-sample',
            capabilities: ['books', 'book-words', 'dictionary', 'exams', 'test-media']
        },
        meta: { source: 'local-sample' }
    })
    if (!config.enableContentApi) return Promise.resolve(localManifest())
    return request({
        baseUrl: config.contentApiBaseUrl,
        url: buildContentManifestPath(config.contentApiBasePath),
        method: 'GET'
    }).then(response => {
        if (!isContentSuccess(response) || !response.data || !String(response.data.contentVersion || '').trim() || !Array.isArray(response.data.capabilities)) {
            throw new Error('内容版本清单接口返回异常')
        }
        return response
    }).catch(error => {
        if (config.enableLocalSampleFallback) return localManifest()
        return Promise.reject(error)
    })
}

export { getContentBookDetail, getContentBooks, getContentCategories, getContentManifest, getDictionaryDetail, getDictionarySearch, getExamPaper, getExamPapers }
