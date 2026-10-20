import { getCourseDetail } from '../../../services/course'
import { prepareCourseWords, filterCourseWords } from '../../../services/content'

const dictionarySample = require('../../../data/content_samples/dictionary_words.js')
const wordFormSample = require('../../../data/content_samples/book_word_forms.js')

// Only fields rendered by the word list cross the setData bridge.
function projectWord(word) {
    return {
        rowKey: word.rowKey,
        id: word.id,
        dictionaryId: word.dictionaryId,
        word: word.word,
        word_character: word.word_character,
        displayMeaning: word.displayMeaning,
        matchTier: word.matchTier
    }
}

Page({
    data: {
        courseId: '',
        courseTitle: '',
        contentModeLabel: '',
        visibleWords: [],
        wordPageSize: 50,
        wordQuery: '',
        hasMoreWords: false,
        resultCount: 0,
        wordSummary: { total: 0, mapped: 0, pending: 0, missingMeaning: 0 },
        loading: true,
        loadError: ''
    },

    onLoad: function(options = {}) {
        this._isUnloaded = false
        this._loadRequestId = 0
        this.setData({ courseId: options.id === undefined ? '' : options.id })
        this.loadWords()
    },

    loadWords: function() {
        const requestId = (this._loadRequestId || 0) + 1
        this._loadRequestId = requestId
        this._words = []
        this._filteredWords = []
        this._wordsByRowKey = Object.create(null)
        this.setData({
            loading: true, loadError: '', courseTitle: '', contentModeLabel: '',
            visibleWords: [], hasMoreWords: false, resultCount: 0,
            wordSummary: { total: 0, mapped: 0, pending: 0, missingMeaning: 0 }
        })
        const id = this.data.courseId
        if (!((typeof id === 'string' && id.length > 0) || (typeof id === 'number' && Number.isFinite(id)))) {
            this.setData({ loading: false, loadError: '缺少课程信息，请返回课程选择' })
            return
        }
        getCourseDetail(id).then(res => {
            if (this._isUnloaded || requestId !== this._loadRequestId) return
            if (!res || res.code !== 200 || !res.data || !res.data.course) {
                throw new Error('课程词汇响应异常')
            }
            const course = res.data.course
            const preparedWords = prepareCourseWords(
                Array.isArray(res.data.words) ? res.data.words : [],
                dictionarySample.words || [],
                res.data.wordForms || wordFormSample,
                res.data.mappingDecisions || [],
                { bookName: course.bookName || course.book_name || course.title || '' }
            )
            this._words = preparedWords
            this._filteredWords = filterCourseWords(preparedWords, this.data.wordQuery)
            preparedWords.forEach(word => { this._wordsByRowKey[word.rowKey] = word })
            this.setData({
                courseTitle: course.title || course.bookName || course.book_name || '',
                contentModeLabel: String(res.message || '').indexOf('local sample') === 0 ? '本地演示内容' : '在线教材内容',
                visibleWords: this._filteredWords.slice(0, this.data.wordPageSize).map(projectWord),
                hasMoreWords: this._filteredWords.length > this.data.wordPageSize,
                resultCount: this._filteredWords.length,
                wordSummary: {
                    total: preparedWords.length,
                    mapped: preparedWords.filter(item => item.matchTier !== 'unmatched').length,
                    pending: preparedWords.filter(item => item.matchTier === 'unmatched').length,
                    missingMeaning: preparedWords.filter(item => !item.hasMeaning).length
                }
            })
        }).catch(error => {
            if (this._isUnloaded || requestId !== this._loadRequestId) return
            this.setData({ loadError: '课程词汇加载失败，请检查网络后重试' })
            console.error('加载课程词汇失败:', error && error.message ? error.message : 'unknown error')
        }).finally(() => {
            if (this._isUnloaded || requestId !== this._loadRequestId) return
            this.setData({ loading: false })
        })
    },

    retryLoad: function() {
        this.loadWords()
    },

    loadMoreWords: function() {
        const filteredWords = this._filteredWords || []
        const start = this.data.visibleWords.length
        const nextEnd = Math.min(start + this.data.wordPageSize, filteredWords.length)
        if (start >= nextEnd) return
        const update = { hasMoreWords: nextEnd < filteredWords.length }
        for (let index = start; index < nextEnd; index += 1) {
            update[`visibleWords[${index}]`] = projectWord(filteredWords[index])
        }
        this.setData(update)
    },

    searchWords: function(event) {
        const wordQuery = event.detail.value || ''
        const filteredWords = filterCourseWords(this._words || [], wordQuery)
        this._filteredWords = filteredWords
        this.setData({
            wordQuery,
            resultCount: filteredWords.length,
            visibleWords: filteredWords.slice(0, this.data.wordPageSize).map(projectWord),
            hasMoreWords: filteredWords.length > this.data.wordPageSize
        })
    },

    openWordDetail: function(event) {
        const dataset = event.currentTarget.dataset
        const record = this._wordsByRowKey && this._wordsByRowKey[dataset.rowKey]
        const word = record ? record.word : dataset.word
        const wordId = (record ? record.dictionaryId : dataset.wordId) || ''
        const sourceId = record ? record.id : dataset.textbookId
        const textbookId = sourceId === undefined || sourceId === null ? '' : sourceId
        const meaning = (record ? record.displayMeaning : dataset.wordMeaning) || ''
        const wordClass = (record ? record.word_character : dataset.wordClass) || ''
        const examples = (record ? record.sentence_all : dataset.wordExamples) || ''
        if (!word) return
        wx.navigateTo({
            url: `/pages/dictionary/detail/detail?q=${encodeURIComponent(word)}&id=${encodeURIComponent(wordId)}&textbookId=${encodeURIComponent(textbookId)}&collectionId=${encodeURIComponent(this.data.courseId)}&meaning=${encodeURIComponent(meaning)}&class=${encodeURIComponent(wordClass)}&examples=${encodeURIComponent(examples)}`
        })
    },

    backToCourse: function() {
        const id = this.data.courseId
        const validId = value => (typeof value === 'string' && value.length > 0)
            || (typeof value === 'number' && Number.isFinite(value))
        if (!validId(id)) {
            wx.switchTab({ url: '/pages/index/index' })
            return
        }
        const pages = getCurrentPages()
        const previous = pages[pages.length - 2]
        const previousId = previous && previous.data && previous.data.courseId
        if (previous && previous.route === 'pages/course/detail/detail'
            && validId(previousId) && String(previousId) === String(id)) {
            wx.navigateBack({ delta: 1 })
            return
        }
        wx.redirectTo({ url: `/pages/course/detail/detail?id=${encodeURIComponent(id)}` })
    },

    onUnload: function() {
        this._isUnloaded = true
        this._loadRequestId = (this._loadRequestId || 0) + 1
    }
})
