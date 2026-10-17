import { getLocalPracticeSet } from '../../../services/exam'
import { createSession, recordAnswer } from '../../../services/practice-progress'
import { normalizePracticeResponse, normalizePracticeAnswer, getQuestionOptionKeys } from '../../../services/content'
import { audioController } from '../../../services/media/audio'
import { getExamPaper } from '../../../services/content-api'
import { resolveExamAudioQuestion } from '../../../services/exam-audio'
import config from '../../../config'

Page({
    data: {
        options: ['a', 'b', 'c', 'd'],
        questions: [],
        currentIndex: 0,
        selectedAnswer: '',
        answerInput: '',
        answerCorrect: false,
        submitted: false,
        score: 0,
        finished: false,
        loading: true,
        loadError: '',
        paperId: '',
        session: null,
        reviewItems: [],
        sessionStorageKey: 'practice_session_v1:default',
        source: 'local-sample',
        isPlayingAudio: false,
        audioError: ''
    },

    onLoad: function(options) {
        this._isUnloaded = false
        this._loadRequestId = 0
        this.paperId = options && options.paperId ? options.paperId : ''
        this.loadQuestions()
    },

    loadQuestions: function() {
        const requestId = (this._loadRequestId || 0) + 1
        this._loadRequestId = requestId
        const paperId = this.paperId
        this.setData({ loading: true, loadError: '' })
        const localPracticeOptions = {
            paperId,
            audioBaseUrl: ''
        }
        const dataRequest = config.enableContentApi && paperId
            ? getExamPaper(paperId, { audioBaseUrl: '' }).then(response => normalizePracticeResponse(response, {
                audioBaseUrl: ''
            }))
            : getLocalPracticeSet(localPracticeOptions)
        dataRequest.then(result => {
            if (this._isUnloaded || requestId !== this._loadRequestId) return
            const questions = (result.questions || []).map(resolveExamAudioQuestion)
            const questionIds = questions.map(item => String(item.id))
            const sessionStorageKey = `practice_session_v1:${paperId || 'default'}`
            const saved = wx.getStorageSync(sessionStorageKey)
            const session = this.restoreSession(saved, questionIds)
            const nextIndex = questions.findIndex(item => !session.answers[String(item.id)])
            const activeIndex = nextIndex < 0 ? 0 : nextIndex
            this.setData({
                questions,
                options: questions.length ? getQuestionOptionKeys(questions[activeIndex]) : [],
                currentIndex: activeIndex,
                score: session.score,
                finished: questions.length > 0 && session.completedCount >= questions.length,
                session,
                reviewItems: this.buildReviewItems(session, questions),
                sessionStorageKey,
                source: result.meta && String(result.meta.source || '').startsWith('local-sample')
                    ? 'local-sample'
                    : config.enableContentApi && paperId ? 'content-api' : 'local-sample',
                loading: false
            })
        }).catch(() => {
            if (this._isUnloaded || requestId !== this._loadRequestId) return
            this.setData({ questions: [], loading: false, loadError: '题目加载失败，请检查网络后重试' })
            wx.showToast({ title: '题目加载失败', icon: 'none' })
        })
    },

    retryLoad: function() {
        this.loadQuestions()
    },

    restoreSession: function(saved, questionIds) {
        if (!saved || !Array.isArray(saved.questionIds) ||
            JSON.stringify(saved.questionIds.map(id => String(id))) !== JSON.stringify(questionIds) ||
            !saved.answers || typeof saved.answers !== 'object') {
            return createSession(questionIds)
        }
        const answers = {}
        questionIds.forEach(id => {
            const answer = saved.answers[id]
            if (answer && typeof answer === 'object') {
                answers[id] = {
                    correct: Boolean(answer.correct),
                    answer: String(answer.answer || '')
                }
            }
        })
        const completedCount = Object.keys(answers).length
        const score = Object.keys(answers).filter(id => answers[id].correct).length
        return { questionIds, answers, completedCount, score }
    },

    selectAnswer: function(event) {
        if (this.data.submitted) return
        this.setData({ selectedAnswer: event.currentTarget.dataset.answer, answerInput: '' })
    },

    handleTextInput: function(event) {
        if (this.data.submitted) return
        this.setData({ selectedAnswer: event.detail.value, answerInput: event.detail.value })
    },

    playQuestionAudio: function() {
        const question = this.data.questions[this.data.currentIndex]
        if (!question || !question.audioPlayable) {
            wx.showToast({ title: '听力音频地址待接入', icon: 'none' })
            return
        }
        this.setData({ audioError: '' })
        const played = audioController.play(question.audioUrl || question.audio_url, {
            onEnded: () => {
                if (!this._isUnloaded) this.setData({ isPlayingAudio: false })
            },
            onError: () => {
                if (this._isUnloaded) return
                this.setData({ isPlayingAudio: false, audioError: '当前听力播放失败，可重试或继续作答' })
                wx.showToast({ title: '音频播放失败', icon: 'none' })
            }
        })
        this.setData({ isPlayingAudio: played })
    },

    retryQuestionAudio: function() {
        this.setData({ audioError: '' })
        this.playQuestionAudio()
    },

    submitAnswer: function() {
        const question = this.data.questions[this.data.currentIndex]
        if (!question || !this.data.selectedAnswer) {
            wx.showToast({ title: question && question.answerMode === 'text' ? '请输入答案' : '请选择答案', icon: 'none' })
            return
        }
        const isCorrect = normalizePracticeAnswer(this.data.selectedAnswer) === normalizePracticeAnswer(question.answerKey || question.right_result)
        const session = recordAnswer(this.data.session || createSession(this.data.questions.map(item => item.id)), question.id, isCorrect, this.data.selectedAnswer)
        wx.setStorageSync(this.data.sessionStorageKey, session)
        this.setData({
            submitted: true,
            answerCorrect: isCorrect,
            score: session.score,
            session,
            reviewItems: this.buildReviewItems(session)
        })
    },

    nextQuestion: function() {
        audioController.stop()
        if (this.data.currentIndex >= this.data.questions.length - 1) {
            this.setData({ finished: true, isPlayingAudio: false, audioError: '', reviewItems: this.buildReviewItems(this.data.session) })
            return
        }
        this.setData({
            currentIndex: this.data.currentIndex + 1,
            options: getQuestionOptionKeys(this.data.questions[this.data.currentIndex + 1]),
            selectedAnswer: '',
            answerInput: '',
            answerCorrect: false,
            submitted: false,
            isPlayingAudio: false,
            audioError: ''
        })
    },

    restart: function() {
        audioController.stop()
        const session = createSession(this.data.questions.map(item => item.id))
        wx.setStorageSync(this.data.sessionStorageKey, session)
        this.setData({
            currentIndex: 0,
            options: this.data.questions.length ? getQuestionOptionKeys(this.data.questions[0]) : [],
            selectedAnswer: '',
            answerInput: '',
            answerCorrect: false,
            submitted: false,
            score: 0,
            session,
            reviewItems: [],
            finished: false,
            isPlayingAudio: false,
            audioError: ''
        })
    },

    buildReviewItems: function(session, questions = this.data.questions) {
        if (!session || !session.answers) return []
        return questions
            .filter(question => session.answers[String(question.id)])
            .map((question, index) => {
                const answer = session.answers[String(question.id)]
                return {
                    ...question,
                    index: index + 1,
                    correct: Boolean(answer.correct),
                    userAnswer: answer.answer || '',
                    standardAnswer: question.answerKey || question.right_result || ''
                }
            })
    },

    onUnload: function() {
        this._isUnloaded = true
        this._loadRequestId = (this._loadRequestId || 0) + 1
        audioController.stop()
    }
})
