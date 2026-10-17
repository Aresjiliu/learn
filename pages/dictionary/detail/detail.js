import { getLocalDictionaryDetail, getLocalTextbookAudioUrl } from '../../../services/dictionary'
import { getDictionaryDetail } from '../../../services/content-api'
import { audioController } from '../../../services/media/audio'
import config from '../../../config'

Page({
    data: {
        query: '',
        word: null,
        loading: true,
        isPlaying: false
    },

    onLoad: function(options) {
        this._isUnloaded = false
        this._detailRequestId = 0
        const query = options && options.q ? decodeURIComponent(options.q) : ''
        const textbookMeaning = options && options.meaning ? decodeURIComponent(options.meaning) : ''
        const textbookWordClass = options && options.class ? decodeURIComponent(options.class) : ''
        const textbookExamples = options && options.examples
            ? decodeURIComponent(options.examples).split(/\r?\n|#/).map(item => item.trim()).filter(Boolean)
            : []
        this.setData({ query })
        if (!query.trim()) {
            this.setData({ word: null, loading: false })
            return
        }
        const wordId = options && options.id ? decodeURIComponent(options.id) : ''
        const textbookId = options && options.textbookId ? decodeURIComponent(options.textbookId) : ''
        if (config.enableContentApi && wordId) {
            const requestId = (this._detailRequestId || 0) + 1
            this._detailRequestId = requestId
            getDictionaryDetail(wordId).then(result => {
                if (this._isUnloaded || requestId !== this._detailRequestId) return
                const word = result && result.data && result.data.word
                if (!word) throw new Error('词典详情为空')
                const audioUrl = getLocalTextbookAudioUrl(textbookId)
                this.setData({ word: this.decorateWord(audioUrl ? { ...word, audioUrl } : word, { textbookMeaning: word.word_meaning_all, textbookWordClass: word.word_character, examples: textbookExamples }), loading: false })
            }).catch(() => {
                if (this._isUnloaded || requestId !== this._detailRequestId) return
                const localWord = getLocalDictionaryDetail(query)
                this.setData({
                    word: this.decorateWord(localWord || {
                        word: query,
                        sourceType: 'textbook',
                        textbookMeaning,
                        textbookWordClass,
                        examples: textbookExamples
                    }),
                    loading: false
                })
            })
            return
        }
        const localWord = getLocalDictionaryDetail(query)
        this.setData({
            word: this.decorateWord(localWord ? { ...localWord, examples: textbookExamples.length ? textbookExamples : localWord.examples } : {
                word: query,
                sourceType: 'textbook',
                textbookMeaning,
                textbookWordClass,
                examples: textbookExamples
            }),
            loading: false
        })
    },

    resolveAudioUrl: function(value) {
        const raw = String(value || '').trim()
        const isWordAudio = /^\/wordaudio\/[0-9a-f]{32}\.mp3$/.test(raw)
        if (!raw || /^https?:\/\//i.test(raw) || !(isWordAudio ? config.enableLocalWordAudio : config.enableLocalTestAudio)) return raw
        return `${String(config.devMediaBaseUrl || '').replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`
    },

    isAudioPlayable: function(word) {
        const raw = String(word && (word.audioUrl || word.audio_url) || '').trim()
        return /^https?:\/\//i.test(raw) || (config.enableLocalWordAudio && /^\/wordaudio\/[0-9a-f]{32}\.mp3$/.test(raw)) || (config.enableLocalTestAudio && Boolean(raw))
    },

    decorateWord: function(word, extra = {}) {
        const audioPlayable = this.isAudioPlayable(word)
        const rawAudio = String(word && (word.audioUrl || word.audio_url) || '').trim()
        return { ...word, ...extra, audioPlayable, audioPending: Boolean(rawAudio) && !audioPlayable }
    },

    playAudio: function() {
        const audioUrl = this.resolveAudioUrl(this.data.word && (this.data.word.audioUrl || this.data.word.audio_url))
        if (!audioUrl) {
            wx.showToast({ title: '暂无音频', icon: 'none' })
            return
        }
        if (!/^https?:\/\//i.test(audioUrl)) {
            wx.showToast({ title: '音频资源待接入', icon: 'none' })
            return
        }
        const played = audioController.play(audioUrl, {
            onEnded: () => {
                if (!this._isUnloaded) this.setData({ isPlaying: false })
            },
            onError: () => {
                if (this._isUnloaded) return
                this.setData({ isPlaying: false })
                wx.showToast({ title: '音频播放失败', icon: 'none' })
            }
        })
        this.setData({ isPlaying: played })
    },

    onUnload: function() {
        this._isUnloaded = true
        this._detailRequestId = (this._detailRequestId || 0) + 1
        audioController.stop()
    }
})
