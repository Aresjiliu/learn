function buildDictionarySearchPath(query, page = 1, pageSize = 20, basePath = '/api/v1') {
    const params = [
        `q=${encodeURIComponent(String(query || '').trim())}`,
        `page=${Math.max(1, Number(page) || 1)}`,
        `page_size=${Math.min(100, Math.max(1, Number(pageSize) || 20))}`
    ]
    return `${basePath}/dictionary/search?${params.join('&')}`
}

function buildDictionaryPath(wordId, basePath = '/api/v1') {
    return `${basePath}/dictionary/${encodeURIComponent(String(wordId))}`
}

function buildBooksPath(query = '', page = 1, pageSize = 20, basePath = '/api/v1', categoryId = '') {
    const params = [
        `q=${encodeURIComponent(String(query || '').trim())}`,
        `page=${Math.max(1, Number(page) || 1)}`,
        `page_size=${Math.min(100, Math.max(1, Number(pageSize) || 20))}`
    ]
    if (String(categoryId || '').trim()) params.push(`category_id=${encodeURIComponent(String(categoryId).trim())}`)
    return `${basePath}/books?${params.join('&')}`
}

function buildCategoriesPath(basePath = '/api/v1') {
    return `${basePath}/categories`
}

function buildExamPath(paperId, basePath = '/api/v1') {
    return `${basePath}/exams/${encodeURIComponent(String(paperId))}`
}

function buildExamsPath(page = 1, pageSize = 20, basePath = '/api/v1') {
    return `${basePath}/exams?page=${Math.max(1, Number(page) || 1)}&page_size=${Math.min(100, Math.max(1, Number(pageSize) || 20))}`
}

function buildBookPath(bookId, basePath = '/api/v1') {
    return `${basePath}/books/${encodeURIComponent(String(bookId))}`
}

function buildBookWordsPath(bookId, basePath = '/api/v1') {
    return `${buildBookPath(bookId, basePath)}/words`
}

function buildContentManifestPath(basePath = '/api/v1') {
    return `${basePath}/content/manifest`
}

export { buildDictionarySearchPath, buildDictionaryPath, buildBooksPath, buildCategoriesPath, buildExamPath, buildExamsPath, buildBookPath, buildBookWordsPath, buildContentManifestPath }
