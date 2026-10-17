import { getDictionarySearch } from '../../../services/content-api'
import config from '../../../config'

Page({
    data: {
        query: '',
        words: [],
        searched: false,
        loadError: '',
        sampleNotice: false,
        loading: false,
        page: 1,
        pageSize: 20,
        hasMore: false
    },

    onLoad: function(options) {
        this._searchRequestId = 0
        this._isUnloaded = false
        if (options && options.q) {
            const query = decodeURIComponent(options.q)
            this.setData({ query })
            this.search()
        }
    },

    handleInput: function(event) {
        this.setData({ query: event.detail.value })
    },

    handleSearch: function() {
        this.search()
    },

    loadMore: function() {
        if (this.data.loading || !this.data.hasMore) return
        this.loadPage(this.data.page + 1, true)
    },

    openDetail: function(event) {
        const word = event.currentTarget.dataset.word
        const wordId = event.currentTarget.dataset.wordId
        wx.navigateTo({ url: `/pages/dictionary/detail/detail?q=${encodeURIComponent(word)}&id=${encodeURIComponent(wordId || '')}` })
    },

    search: function() {
        const query = this.data.query.trim()
        this._failedAppendPage = 0
        this._failedAppendQuery = ''
        if (!query) {
            this._searchRequestId = (this._searchRequestId || 0) + 1
            this.setData({ words: [], searched: false, loadError: '', sampleNotice: false, loading: false, page: 1, hasMore: false })
            return
        }
        this.loadPage(1, false)
    },

    loadPage: function(page, append) {
        const requestId = (this._searchRequestId || 0) + 1
        this._searchRequestId = requestId
        const query = this.data.query.trim()
        this.setData({ loading: true, loadError: '' })
        getDictionarySearch(query, { page, pageSize: this.data.pageSize }).then(result => {
            if (this._isUnloaded || requestId !== this._searchRequestId) return
            const incoming = (result.data.words || []).map(word => ({
                ...word,
                audioPlayable: this.isAudioPlayable(word)
            }))
            const words = append ? this.data.words.concat(incoming) : incoming
            const meta = result.meta || {}
            const sampleNotice = /^local-sample/.test(String(meta.source || '')) && Boolean(config.enableLocalDictionaryApi)
            const total = Number(meta.total)
            const hasMore = Number.isFinite(total) && total >= 0
                ? page * this.data.pageSize < total
                : incoming.length >= this.data.pageSize
            this._failedAppendPage = 0
            this._failedAppendQuery = ''
            this.setData({ words, searched: true, loadError: '', sampleNotice, page, hasMore })
        }).catch(() => {
            if (this._isUnloaded || requestId !== this._searchRequestId) return
            this._failedAppendPage = append ? page : 0
            this._failedAppendQuery = append ? query : ''
            this.setData({
                words: append ? this.data.words : [],
                searched: true,
                loadError: '词典查询失败，请检查网络后重试',
                hasMore: append ? this.data.hasMore : false
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
