import { getExamPapers } from '../../../services/content-api'
const { filterPapers } = require('./filter')

Page({
    data: {
        papers: [],
        visiblePapers: [],
        activeFilter: 'all',
        filters: [
            { value: 'all', label: '全部' },
            { value: 'choice', label: '选择题' },
            { value: 'text', label: '填空题' }
        ],
        loading: true,
        loadError: '',
        loadingMore: false,
        loadMoreError: '',
        page: 1,
        pageSize: 20,
        hasMore: false,
        source: ''
    },

    onLoad: function() {
        this._isUnloaded = false
        this._loadRequestId = 0
        this.loadPapers()
    },

    loadPapers: function(page = 1, append = false) {
        if (this.data.loadingMore || (append && this.data.loading)) return
        const requestId = (this._loadRequestId || 0) + 1
        this._loadRequestId = requestId
        this.setData(append
            ? { loadingMore: true, loadMoreError: '' }
            : { loading: true, loadError: '', loadMoreError: '' })
        getExamPapers({ page, pageSize: this.data.pageSize }).then(result => {
            if (this._isUnloaded || requestId !== this._loadRequestId) return
            const papers = result.data && result.data.papers ? result.data.papers : []
            const normalizedPapers = papers.map(item => ({
                ...item,
                canPractice: item.practiceReady === true
            }))
            const allPapers = append ? this.data.papers.concat(normalizedPapers) : normalizedPapers
            const total = Number(result.meta && result.meta.total)
            const hasTotal = result.meta && result.meta.total !== undefined && Number.isFinite(total) && total >= 0
            this.setData({
                papers: allPapers,
                visiblePapers: filterPapers(allPapers, this.data.activeFilter),
                source: result.meta && result.meta.source === 'local-sample' ? '本地样本' : '在线题库',
                page,
                hasMore: hasTotal ? page * this.data.pageSize < total : papers.length >= this.data.pageSize,
                loading: false,
                loadingMore: false,
                loadError: '',
                loadMoreError: ''
            })
        }).catch(() => {
            if (this._isUnloaded || requestId !== this._loadRequestId) return
            if (append) {
                this.setData({ loadingMore: false, loadMoreError: '后续试卷加载失败，请重试' })
            } else {
                this.setData({ papers: [], visiblePapers: [], loading: false, loadError: '试卷加载失败，请检查网络后重试' })
            }
            wx.showToast({ title: '试卷加载失败', icon: 'none' })
        })
    },

    retryLoad: function() {
        if (this.data.loadMoreError) {
            this.loadPapers(this.data.page + 1, true)
            return
        }
        this.loadPapers(1, false)
    },

    loadMore: function() {
        if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return
        this.loadPapers(this.data.page + 1, true)
    },

    onReachBottom: function() {
        this.loadMore()
    },

    setPaperFilter: function(event) {
        const filter = event.currentTarget.dataset.filter
        const validFilters = ['all', 'choice', 'text']
        if (validFilters.indexOf(filter) === -1 || filter === this.data.activeFilter) return
        this.setData({
            activeFilter: filter,
            visiblePapers: filterPapers(this.data.papers, filter)
        })
    },

    openPaper: function(event) {
        const paperId = event.currentTarget.dataset.paperId
        const canPractice = event.currentTarget.dataset.canPractice
        if (canPractice === false || canPractice === 'false') {
            wx.showToast({ title: '该试卷正在审核中', icon: 'none' })
            return
        }
        if (!paperId) return
        wx.navigateTo({ url: `/pages/exam/practice/practice?paperId=${encodeURIComponent(paperId)}` })
    },

    onUnload: function() {
        this._isUnloaded = true
        this._loadRequestId = (this._loadRequestId || 0) + 1
    }
})
