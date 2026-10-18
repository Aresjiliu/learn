import { getLocalDictionaryDetail, getLocalTextbookAudioUrl } from '../../../services/dictionary'
import { getDictionaryDetail } from '../../../services/content-api'
import { audioController } from '../../../services/media/audio'
import config from '../../../config'
import { presentDictionaryDetail } from '../../../services/dictionary-presentation'

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
        let route
        try {
            route = {}
            for (const field of ['q', 'meaning', 'class', 'examples', 'id', 'textbookId']) {
                route[field] = options && options[field] ? decodeURIComponent(options[field]) : ''
            }
        } catch (error) {
            this.setData({ query: '', word: null, loading: false, loadError: '词条链接无效，请返回搜索后重试', isPlaying: false, audioError: '' })
            return
        }
        const query = route.q
        const textbookMeaning = route.meaning
        const textbookWordClass = route.class
        const textbookExamples = route.examples.split(/\r?\n|#/).map(item => item.trim()).filter(Boolean)
        const textbookFields = {
            ...(textbookMeaning.trim() ? { textbookMeaning } : {}),
            ...(textbookWordClass.trim() ? { textbookWordClass } : {}),
            ...(textbookExamples.length ? { examples: textbookExamples } : {})
        }
        this.setData({ query, word: null, loading: true, loadError: '', isPlaying: false, audioError: '' })
        if (!query.trim()) {
            this.setData({ word: null, loading: false })
            return
        }
        const wordId = route.id
        const textbookId = route.textbookId
        if ((config.enableContentApi || config.enableLocalDictionaryApi) && wordId) {
            getDictionaryDetail(wordId).then(result => {
                if (this._isUnloaded || requestId !== this._detailRequestId) return
                const word = result && result.data && result.data.word
                if (!word) throw new Error('词典详情为空')
                if (wordId.startsWith('dict:') && word.id !== wordId) throw new Error('词条身份不一致')
                const audioUrl = this.isAudioPlayable(word) ? '' : getLocalTextbookAudioUrl(textbookId, word.word || word.lemma || word.word_text)
                this.setData({ word: this.decorateWord(audioUrl ? { ...word, audioUrl } : word, textbookFields), loading: false })
            }).catch(() => {
                if (this._isUnloaded || requestId !== this._detailRequestId) return
                if (wordId.startsWith('dict:')) {
                    this.setData({ word: null, loading: false, loadError: '词条加载失败，请检查网络后重试' })
                    return
                }
                const localWord = this.resolveLocalWord(query, textbookFields)
                this.setData({
                    word: localWord,
                    loading: false,
                    loadError: localWord ? '' : '词条加载失败，请检查网络后重试'
                })
            })
            return
        }
        if (wordId.startsWith('dict:')) {
            this.setData({ word: null, loading: false, loadError: '完整词典暂不可用，请稍后重试' })
            return
        }
        const localWord = this.resolveLocalWord(query, textbookFields)
        this.setData({
            word: localWord,
            loading: false
        })
    },

    resolveLocalWord: function(query, textbookFields) {
        const localWord = getLocalDictionaryDetail(query)
        // Remove stress marks only; preserve the diaeresis in ё and breve in й.
        const identity = value => value.normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC').trim().toLowerCase()
        const headword = presentDictionaryDetail(localWord).headword
        if (headword && identity(headword) === identity(query)) {
            return this.decorateWord(localWord, textbookFields)
        }
        if (Object.keys(textbookFields).length) {
            return this.decorateWord({ word: query, sourceType: 'textbook' }, textbookFields)
        }
        return null
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

    selectAudioUrl: function(word) {
        return [word && word.audioUrl, word && word.audio_url]
            .filter(value => typeof value === 'string').map(value => value.trim())
            .find(raw => /^https?:\/\//i.test(raw) || (config.enableLocalWordAudio && /^\/wordaudio\/[0-9a-f]{32}\.mp3$/.test(raw))) || ''
    },

    isAudioPlayable: function(word) {
        return Boolean(this.selectAudioUrl(word))
    },

    decorateWord: function(word, extra = {}) {
        const audioPlayable = this.isAudioPlayable(word)
        const rawAudio = String(word && (word.audioUrl || word.audio_url) || '').trim()
        return presentDictionaryDetail({ ...word, ...extra, audioPlayable, audioPending: !audioPlayable && (Boolean(rawAudio) || Boolean(word && word.audioPending)) })
    },

    playAudio: function() {
        if (this._isUnloaded || this._isHidden) return
        const word = this.data.word
        const audioUrl = this.resolveAudioUrl(this.selectAudioUrl(word) || (word && (word.audioUrl || word.audio_url)))
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
