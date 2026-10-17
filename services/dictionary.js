import config from '../config'
const dictionarySample = require('../data/content_samples/dictionary_words.js')
const textbookSample = require('../data/content_samples/book_1_words.js')
const audioIndex = require('../data/content_samples/book_1_audio.js')

function withLocalWordAudio(word, textbook) {
    if (!word || !textbook || !config.enableLocalWordAudio) return word
    const filename = audioIndex[String(textbook.id)]
    if (!filename || !/^[0-9a-f]{32}\.mp3$/.test(filename)) return word
    const baseUrl = String(config.devMediaBaseUrl || '').replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(baseUrl)) return word
    return { ...word, audioUrl: `${baseUrl}/wordaudio/${filename}` }
}

function buildLocalDictionaryWords() {
    const dictionaryWords = (dictionarySample.words || []).map(item => ({ ...item, sourceType: 'dictionary' }))
    const known = new Set(dictionaryWords.map(item => normalizeQuery(item.word || item.lemma)))
    const textbookByWord = new Map((textbookSample.words || []).map(item => [normalizeQuery(item.word), item]))
    const textbookWords = (textbookSample.words || [])
        .filter(item => {
            const key = normalizeQuery(item.word || item.lemma)
            return key && !known.has(key)
        })
        .map(item => ({ ...item, sourceType: 'textbook' }))
    return dictionaryWords.concat(textbookWords).map(item => {
        return withLocalWordAudio(item, textbookByWord.get(normalizeQuery(item.word || item.lemma)))
    })
}

function normalizeQuery(value) {
    return String(value || '')
        .trim()
        .toLocaleLowerCase('ru-RU')
        .normalize('NFD')
        .replace(/е\u0308/g, 'ё')
        .replace(/[\u0300-\u036f]/g, '')
}

function searchLocalDictionary(query, words = dictionarySample.words || []) {
    const normalizedQuery = normalizeQuery(query)
    if (!normalizedQuery) return []
    return words.filter(item => {
        const word = normalizeQuery(item.word || item.lemma)
        const meaning = String(item.word_meaning_all || item.translation || item.meaning || '').toLocaleLowerCase('zh-CN')
        return word.includes(normalizedQuery) || meaning.includes(String(query).trim().toLocaleLowerCase('zh-CN'))
    })
}

function getLocalDictionarySearch(query, options = {}) {
    const allWords = searchLocalDictionary(query, buildLocalDictionaryWords())
    const page = Math.max(1, Number(options.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20))
    const start = (page - 1) * pageSize
    return Promise.resolve({
        code: 200,
        data: { words: allWords.slice(start, start + pageSize) },
        meta: { source: 'local-sample', page, page_size: pageSize, total: allWords.length }
    })
}

function getLocalDictionaryDetail(query, words = buildLocalDictionaryWords(), textbookWords = textbookSample.words || []) {
    const queryText = String(query || '').trim()
    const matchById = queryText
        ? words.find(item => String(item.sourceId || item.id || item.word_id || '').trim() === queryText)
        : null
    const match = matchById || searchLocalDictionary(queryText, words)[0]
    if (!match) return null
    const normalized = normalizeQuery(match.word || match.lemma)
    const textbook = textbookWords.find(item => normalizeQuery(item.word) === normalized)
    const examples = String(textbook && textbook.sentence_all || '')
        .split(/\r?\n|#/)
        .map(item => item.trim())
        .filter(Boolean)
    return withLocalWordAudio({
        ...match,
        textbookMeaning: textbook ? textbook.word_meaning_all || '' : '',
        textbookWordClass: textbook ? textbook.word_character || '' : '',
        examples
    }, textbook)
}

export { searchLocalDictionary, getLocalDictionarySearch, getLocalDictionaryDetail, buildLocalDictionaryWords }
