import { getDictionarySearch } from '../../../services/content-api'
import config from '../../../config'
const { createDictionaryHistory } = require('../../../services/dictionary-history')
const { presentDictionaryEntry } = require('../../../services/dictionary-presentation')

Page({
    data: {
        query: '',
        history: [],
        historyNotice: '',
        exampleQueries: ['камера', 'дом', '学习'],
        resultQuery: '',
        total: null,
        words: [],
        searched: false,
        loadError: '',
        sampleNotice: false,
        audioDevelopmentNotice: false,
        loading: false,
        page: 1,
        pageSize: 20,
        hasMore: false
    },

    onLoad: function(options) {
        this._searchRequestId = 0
        this._isUnloaded = false
        this._history = null
        try {
            this._history = createDictionaryHistory({
                read: () => wx.getStorageSync('dictionary_history_v1'),
                write: records => wx.setStorageSync('dictionary_history_v1', records)
            })
            this.setData({ history: this._history.list(), historyNotice: '' })
        } catch (error) {
            this.setData({ historyNotice: '搜索历史读取失败，本次历史无法保存' })
        }
        if (options && options.q) {
            let query
            try {
                query = decodeURIComponent(options.q)
            } catch (error) {
                this.setData({
                    query: '', words: [], loading: false, searched: true,
                    loadError: '搜索链接中的查询参数无效，请重新输入后搜索'
                })
                return
            }
            this.setData({ query })
            this.search()
        }
    },

    handleInput: function(event) {
        const value = typeof event.detail === 'string' ? event.detail : event.detail && event.detail.value
        if (typeof value !== 'string' || value === this.data.query) return
        this._searchRequestId = (this._searchRequestId || 0) + 1
        this._failedAppendPage = 0
        this._failedAppendQuery = ''
        this.setData({ query: value, words: [], searched: false, loading: false, loadError: '', sampleNotice: false, audioDevelopmentNotice: false,
            page: 1, hasMore: false, resultQuery: '', total: null })
    },

    clearSearch: function() {
        this.setData({ query: '' })
        this.search()
    },

    selectQuery: function(event) {
        this.handleInput({ detail: event.currentTarget.dataset.query })
        this.search()
    },

    removeHistory: function(event) {
        if (!this._history) return
        try {
            this._history.remove(event.currentTarget.dataset.key)
            this.setData({ history: this._history.list(), historyNotice: '' })
        } catch (error) {
            this.setData({ historyNotice: '搜索历史删除失败，请重试' })
        }
    },

    clearHistory: function() {
        if (!this._history || !this.data.history.length) return
        wx.showModal({
            title: '清空搜索历史',
            content: '确定删除全部搜索记录？',
            confirmColor: '#ed625c',
            success: result => {
                if (!result.confirm || this._isUnloaded) return
                try {
                    this._history.clear()
                    this.setData({ history: [], historyNotice: '' })
                } catch (error) {
                    this.setData({ historyNotice: '搜索历史清空失败，请重试' })
                }
            }
        })
    },

    handleSearch: function() {
        this.search()
    },

    loadMore: function() {
        if (this.data.loading || !this.data.hasMore) return
        if (this.data.query.trim() !== this._resultQuery) {
            this.search()
            return
        }
        this.loadPage(this.data.page + 1, true)
    },

    openWordbook: function() {
        if (this._isUnloaded) return
        wx.navigateTo({ url: '/pages/wordbook/wordbook' })
    },

    openDetail: function(event) {
        const payload = event.detail && typeof event.detail.word === 'string' ? event.detail : event.currentTarget.dataset
        const word = payload.word
        const wordId = payload.wordId
        wx.navigateTo({ url: `/pages/dictionary/detail/detail?q=${encodeURIComponent(word)}&id=${encodeURIComponent(wordId || '')}` })
    },

    search: function() {
        const query = this.data.query.trim()
        this._failedAppendPage = 0
        this._failedAppendQuery = ''
        if (!query) {
            this._searchRequestId = (this._searchRequestId || 0) + 1
            this.setData({ words: [], searched: false, loadError: '', sampleNotice: false, audioDevelopmentNotice: false, loading: false, page: 1, hasMore: false, resultQuery: '', total: null })
            return
        }
        this.loadPage(1, false)
    },

    loadPage: function(page, append) {
        const requestId = (this._searchRequestId || 0) + 1
        this._searchRequestId = requestId
        const query = this.data.query.trim()
        this.setData(append ? { loading: true, loadError: '' } : {
            loading: true, loadError: '', words: [], searched: false, sampleNotice: false, audioDevelopmentNotice: false,
            hasMore: false, page: 1, total: null, resultQuery: query
        })
        getDictionarySearch(query, { page, pageSize: this.data.pageSize }).then(result => {
            if (this._isUnloaded || requestId !== this._searchRequestId) return
            if (!result || (result.code !== undefined && result.code !== 200) || !result.data || !Array.isArray(result.data.words)) {
                throw new Error('词典接口返回异常')
            }
            const meta = result.meta || {}
            const signature = `${meta.source || ''}:${meta.contentVersion || ''}`
            if (append && this._resultSignature !== signature) {
                const error = new Error('词典内容已变化，请重新查询')
                error.code = 'DICTIONARY_SOURCE_CHANGED'
                throw error
            }
            const incoming = result.data.words.map(word => ({
                ...presentDictionaryEntry(word),
                audioPlayable: this.isAudioPlayable(word)
            }))
            const words = append ? this.data.words.concat(incoming) : incoming
            const sampleNotice = /^local-sample/.test(String(meta.source || ''))
            const total = (typeof meta.total === 'number' || (typeof meta.total === 'string' && meta.total.trim()))
                && Number.isFinite(Number(meta.total)) && Number(meta.total) >= 0 ? Number(meta.total) : null
            const hasMore = total !== null
                ? page * this.data.pageSize < total
                : incoming.length >= this.data.pageSize
            this._failedAppendPage = 0
            this._failedAppendQuery = ''
            this._resultSignature = signature
            this._resultQuery = query
            this.setData({ words, searched: true, loadError: '', sampleNotice,
                audioDevelopmentNotice: words.some(word => word.audioDevelopmentOnly === true),
                page, hasMore, total, resultQuery: query })
            if (!append && this._history) {
                try {
                    this._history.record(query)
                    this.setData({ history: this._history.list(), historyNotice: '' })
                } catch (error) {
                    this.setData({ historyNotice: '搜索历史保存失败，结果仍可查看' })
                }
            }
        }).catch(error => {
            if (this._isUnloaded || requestId !== this._searchRequestId) return
            const sourceChanged = error && error.code === 'DICTIONARY_SOURCE_CHANGED'
            this._failedAppendPage = append && !sourceChanged ? page : 0
            this._failedAppendQuery = append && !sourceChanged ? query : ''
            this.setData({
                words: append ? this.data.words : [],
                searched: true,
                loadError: sourceChanged ? '词典内容已变化，请重新查询' : '词典查询失败，请检查网络后重试',
                hasMore: append && !sourceChanged ? this.data.hasMore : false
            })
            wx.showToast({ title: '查询失败', icon: 'none' })
        }).finally(() => {
            if (this._isUnloaded || requestId !== this._searchRequestId) return
            this.setData({ loading: false })
        })
    },

    retryLoad: function() {
        if (this._failedAppendPage && this._failedAppendQuery === this.data.query.trim()) {
            this.loadPage(this._failedAppendPage, true)
            return
        }
        this.search()
    },

    isAudioPlayable: function(word) {
        const raw = String(word && (word.audioUrl || word.audio_url) || '').trim()
        return /^https?:\/\//i.test(raw) || (config.enableLocalWordAudio && /^\/wordaudio\/[0-9a-f]{32}\.mp3$/.test(raw))
    },

    onUnload: function() {
        this._isUnloaded = true
        this._searchRequestId = (this._searchRequestId || 0) + 1
    }
})
