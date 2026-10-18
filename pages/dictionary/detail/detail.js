import { getLocalDictionaryDetail, getLocalTextbookAudioUrl } from '../../../services/dictionary'
import { getDictionaryDetail } from '../../../services/content-api'
import { audioController } from '../../../services/media/audio'
import config from '../../../config'

Page({
    data: {
        query: '',
        word: null,
        loading: true,
        loadError: '',
        isPlaying: false,
        audioError: ''
    },

    onLoad: function(options) {
        const requestId = (this._detailRequestId || 0) + 1
        this._detailRequestId = requestId
        const hadAudioAttempt = Boolean(this._audioAttemptId)
        this._audioAttemptId = (this._audioAttemptId || 0) + 1
        if (hadAudioAttempt) audioController.stop()
        this._isUnloaded = false
        this._routeOptions = options || {}
        const query = options && options.q ? decodeURIComponent(options.q) : ''
        const textbookMeaning = options && options.meaning ? decodeURIComponent(options.meaning) : ''
        const textbookWordClass = options && options.class ? decodeURIComponent(options.class) : ''
        const textbookExamples = options && options.examples
            ? decodeURIComponent(options.examples).split(/\r?\n|#/).map(item => item.trim()).filter(Boolean)
            : []
        this.setData({ query, word: null, loading: true, loadError: '', isPlaying: false, audioError: '' })
        if (!query.trim()) {
            this.setData({ word: null, loading: false })
            return
        }
        const wordId = options && options.id ? decodeURIComponent(options.id) : ''
        const textbookId = options && options.textbookId ? decodeURIComponent(options.textbookId) : ''
        if ((config.enableContentApi || config.enableLocalDictionaryApi) && wordId) {
            getDictionaryDetail(wordId).then(result => {
                if (this._isUnloaded || requestId !== this._detailRequestId) return
                const word = result && result.data && result.data.word
                if (!word) throw new Error('词典详情为空')
                if (wordId.startsWith('dict:') && word.id !== wordId) throw new Error('词条身份不一致')
                const audioUrl = getLocalTextbookAudioUrl(textbookId)
                this.setData({ word: this.decorateWord(audioUrl ? { ...word, audioUrl } : word, { textbookMeaning: textbookMeaning || word.textbookMeaning || word.word_meaning_all, textbookWordClass: textbookWordClass || word.textbookWordClass || word.word_character, examples: textbookExamples }), loading: false })
            }).catch(() => {
                if (this._isUnloaded || requestId !== this._detailRequestId) return
                if (wordId.startsWith('dict:')) {
                    this.setData({ word: null, loading: false, loadError: '词条加载失败，请检查网络后重试' })
                    return
                }
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
        if (wordId.startsWith('dict:')) {
            this.setData({ word: null, loading: false, loadError: '完整词典暂不可用，请稍后重试' })
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

    retryLoad: function() {
        this.onLoad(this._routeOptions)
    },

    resolveAudioUrl: function(value) {
        const raw = String(value || '').trim()
        const isWordAudio = /^\/wordaudio\/[0-9a-f]{32}\.mp3$/.test(raw)
        if (!raw || /^https?:\/\//i.test(raw) || !(isWordAudio ? config.enableLocalWordAudio : config.enableLocalTestAudio)) return raw
        return `${String(config.devMediaBaseUrl || '').replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`
    },

    isAudioPlayable: function(word) {
        const raw = String(word && (word.audioUrl || word.audio_url) || '').trim()
        return /^https?:\/\//i.test(raw) || (config.enableLocalWordAudio && /^\/wordaudio\/[0-9a-f]{32}\.mp3$/.test(raw))
    },

    decorateWord: function(word, extra = {}) {
        const audioPlayable = this.isAudioPlayable(word)
        const rawAudio = String(word && (word.audioUrl || word.audio_url) || '').trim()
        return { ...word, ...extra, audioPlayable, audioPending: !audioPlayable && (Boolean(rawAudio) || Boolean(word && word.audioPending)) }
    },

    playAudio: function() {
        if (this._isUnloaded || this._isHidden) return
        const audioUrl = this.resolveAudioUrl(this.data.word && (this.data.word.audioUrl || this.data.word.audio_url))
        if (!audioUrl) {
            wx.showToast({ title: '暂无音频', icon: 'none' })
            return
        }
        if (!/^https?:\/\//i.test(audioUrl)) {
            wx.showToast({ title: '音频资源待接入', icon: 'none' })
            return
        }
        const attemptId = (this._audioAttemptId || 0) + 1
        this._audioAttemptId = attemptId
        this.setData({ audioError: '' })
        const played = audioController.play(audioUrl, {
            onEnded: () => {
                if (this._isHidden || attemptId !== this._audioAttemptId) return
                if (!this._isUnloaded) this.setData({ isPlaying: false })
            },
            onError: () => {
                if (this._isUnloaded || this._isHidden || attemptId !== this._audioAttemptId) return
                this.setData({ isPlaying: false, audioError: '音频播放失败，请重试' })
                wx.showToast({ title: '音频播放失败', icon: 'none' })
            }
        })
        this.setData({ isPlaying: played })
    },

    onShow: function() {
        this._isHidden = false
    },

    onHide: function() {
        this._isHidden = true
        this._audioAttemptId = (this._audioAttemptId || 0) + 1
        audioController.stop()
        this.setData({ isPlaying: false })
    },

    onUnload: function() {
        this._isUnloaded = true
        this._audioAttemptId = (this._audioAttemptId || 0) + 1
        // Clear local teardown state without updating an unloaded view.
        this.data.audioError = ''
        this._detailRequestId = (this._detailRequestId || 0) + 1
        audioController.stop()
    }
})
