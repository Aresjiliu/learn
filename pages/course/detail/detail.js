import request from '../../../utils/request'
import { getCourseDetail } from '../../../services/course'
import { prepareCourseWords, filterCourseWords } from '../../../services/content'
import config from '../../../config'

const dictionarySample = require('../../../data/content_samples/dictionary_words.js')
const wordFormSample = require('../../../data/content_samples/book_word_forms.js')

function isPreviewFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

Page({
  data: {
    courseId: null,
    course: null,
    chapters: [],
    activeTab: 'detail',
    isCollected: false,
    hasPurchased: false,
    words: [],
    filteredWords: [],
    visibleWords: [],
    wordPageSize: 50,
    hasMoreWords: false,
    wordQuery: '',
    wordSummary: { total: 0, mapped: 0, pending: 0, missingMeaning: 0 },
    contentModeLabel: '本地演示内容',
    courseStats: { chapterCount: 0, videoCount: 0, wordCount: 0 },
    hasPreview: false,
    loading: true,
    loadError: ''
  },

  onLoad: function(options) {
    this._isUnloaded = false
    this._loadRequestId = 0
    this.setData({
      courseId: options.id
    })
    this.loadCourseDetail()
  },

  // 加载课程详情
  loadCourseDetail: function() {
    const requestId = (this._loadRequestId || 0) + 1
    this._loadRequestId = requestId
    this.setData({ loading: true, loadError: '' })
    wx.showLoading({
      title: '加载中...'
    })
    
    getCourseDetail(this.data.courseId).then(res => {
      if (this._isUnloaded || requestId !== this._loadRequestId) return
      if (res.code === 200) {
        const courseData = res.data.course;
        const courseBookName = courseData.bookName || courseData.book_name || courseData.title || ''
        const preparedWords = prepareCourseWords(
          res.data.words || [],
          dictionarySample.words || [],
          res.data.wordForms || wordFormSample,
          res.data.mappingDecisions || [],
          { bookName: courseBookName }
        )
        const wordSummary = {
          total: preparedWords.length,
          mapped: preparedWords.filter(item => item.matchTier !== 'unmatched').length,
          pending: preparedWords.filter(item => item.matchTier === 'unmatched').length,
          missingMeaning: preparedWords.filter(item => !item.hasMeaning).length
        }
        const hasPurchased = Boolean(res.data.hasPurchased)
        const rawChapters = Array.isArray(res.data.chapters) ? res.data.chapters : []
        const chapters = rawChapters.map((chapter, chapterIndex) => ({
          ...chapter,
          rowKey: chapter.rowKey || `chapter-${chapter.id || chapterIndex}`,
          videos: (Array.isArray(chapter.videos) ? chapter.videos : []).map((video, videoIndex) => {
            const canPreview = Boolean(video.url) && (isPreviewFlag(video.isPreview) || ((video.isPreview === undefined || video.isPreview === null || video.isPreview === '') && chapterIndex === 0))
            return {
              ...video,
              rowKey: video.rowKey || `video-${video.id || `${chapterIndex}-${videoIndex}`}`,
              canPreview: Boolean(video.url) && (isPreviewFlag(video.isPreview) || ((video.isPreview === undefined || video.isPreview === null || video.isPreview === '') && chapterIndex === 0)),
              statusLabel: !video.url ? '媒体待接入' : (!hasPurchased && !canPreview ? '已锁定' : (canPreview ? '免费试听' : '可播放'))
            }
          })
        }))
        const videoCount = chapters.reduce((total, chapter) => total + chapter.videos.length, 0)
        const responseMessage = String(res.message || '')
        this.setData({
          course: {
            ...courseData,
            cover_image: courseData.cover_image
          },
          hasPurchased,
          isCollected: res.data.is_collected,
          chapters,
          hasPreview: Boolean(this.findPreviewVideo(chapters)),
          words: preparedWords,
          filteredWords: preparedWords,
          visibleWords: preparedWords.slice(0, this.data.wordPageSize),
          hasMoreWords: preparedWords.length > this.data.wordPageSize,
          wordSummary,
          contentModeLabel: responseMessage.indexOf('local sample') === 0 ? '本地演示内容' : '在线教材内容',
          courseStats: {
            chapterCount: chapters.length,
            videoCount,
            wordCount: preparedWords.length
          }
        })
      } else if (res.code === 302) {
        this.setData({ loadError: '正在跳转，请稍候…' })
        wx.showToast({
          title: res.message,
          icon: 'none',
          duration: 1500,
          success: () => {
            setTimeout(() => {
              wx.redirectTo({
                url: res.data.redirect_url
              })
            }, 1500)
          }
        })
      } else {
        throw new Error(res.message || '课程详情响应异常')
      }
    }).catch(err => {
      if (this._isUnloaded || requestId !== this._loadRequestId) return
      this.setData({ loadError: '课程内容加载失败，请检查网络后重试' })
      console.error('加载课程详情失败:', err && err.message ? err.message : 'unknown error')
    }).finally(() => {
      if (this._isUnloaded || requestId !== this._loadRequestId) return
      this.setData({ loading: false })
      wx.hideLoading()
    })
  },

  retryLoad: function() {
    this.loadCourseDetail()
  },

  // 切换标签
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      activeTab: tab
    })
  },

  loadMoreWords: function() {
    const nextEnd = this.data.visibleWords.length + this.data.wordPageSize
    this.setData({
      visibleWords: this.data.filteredWords.slice(0, nextEnd),
      hasMoreWords: nextEnd < this.data.filteredWords.length
    })
  },

  searchWords: function(event) {
    const wordQuery = event.detail.value || ''
    const filteredWords = filterCourseWords(this.data.words, wordQuery)
    this.setData({
      wordQuery,
      filteredWords,
      visibleWords: filteredWords.slice(0, this.data.wordPageSize),
      hasMoreWords: filteredWords.length > this.data.wordPageSize
    })
  },

  openWordDetail: function(event) {
    const word = event.currentTarget.dataset.word
    const wordId = event.currentTarget.dataset.wordId || ''
    const textbookId = event.currentTarget.dataset.textbookId || ''
    const meaning = event.currentTarget.dataset.wordMeaning || ''
    const wordClass = event.currentTarget.dataset.wordClass || ''
    const examples = event.currentTarget.dataset.wordExamples || ''
    if (!word) return
    wx.navigateTo({
      url: `/pages/dictionary/detail/detail?q=${encodeURIComponent(word)}&id=${encodeURIComponent(wordId)}&textbookId=${encodeURIComponent(textbookId)}&meaning=${encodeURIComponent(meaning)}&class=${encodeURIComponent(wordClass)}&examples=${encodeURIComponent(examples)}`
    })
  },

  navigateToVideo: function() {
    wx.navigateTo({
      url: `/pages/course/video/video?id=${this.data.courseId}`
    })
  },

  previewVideo: function() {
    const firstVideo = this.findPreviewVideo()
    if (!firstVideo || !firstVideo.url) {
      wx.showToast({ title: '试听媒体地址待接入', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/course/video/video?id=${this.data.courseId}&videoId=${encodeURIComponent(firstVideo.id)}`
    })
  },

  findPreviewVideo: function(chapters = this.data.chapters) {
    for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
      const videos = Array.isArray(chapters[chapterIndex].videos) ? chapters[chapterIndex].videos : []
      const preview = videos.find(video => video && video.url && this.isPlayableWithoutPurchase(video.isPreview, chapterIndex))
      if (preview) return preview
    }
    return null
  },

  openCatalogVideo: function(event) {
    const videoId = event.currentTarget.dataset.videoId
    const chapterIndex = Number(event.currentTarget.dataset.chapterIndex)
    const isPreview = event.currentTarget.dataset.isPreview
    if (!videoId) return
    if (!this.data.hasPurchased && !this.isPlayableWithoutPurchase(isPreview, chapterIndex)) {
      wx.showToast({ title: '请购买课程后观看', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/course/video/video?id=${this.data.courseId}&videoId=${encodeURIComponent(videoId)}`
    })
  },

  isPlayableWithoutPurchase: function(isPreview, chapterIndex) {
    if (isPreview === true || isPreview === 'true' || isPreview === 1 || isPreview === '1') return true
    // 旧接口没有 isPreview 时，保留首章试听兼容行为。
    return isPreview === undefined || isPreview === null || isPreview === '' ? chapterIndex === 0 : false
  },

  // 处理收藏/取消收藏
  handleCollect: function() {
    if (!config.enableRemoteWrites) {
      wx.showToast({ title: '当前为只读联调模式', icon: 'none' })
      return
    }
    if (!wx.getStorageSync('token')) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    const url = `/api/favorites/${this.data.courseId}/`
    const method = this.data.isCollected ? 'DELETE' : 'POST'

    request({
      url: url,
      method: method
    }).then(res => {
      if (res.code === 200) {
        // 更新收藏状态
        this.setData({
          isCollected: !this.data.isCollected
        })

        // 更新收藏数量
        const collectNum = wx.getStorageSync('collectNum') || 0
        wx.setStorageSync('collectNum', 
          this.data.isCollected ? collectNum + 1 : Math.max(0, collectNum - 1)
        )

        wx.showToast({
          title: this.data.isCollected ? '已收藏' : '已取消收藏',
          icon: 'success'
        })
      }
    }).catch(err => {
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
      console.error('收藏操作失败:', err && err.message ? err.message : 'unknown error')
    })
  },

  // 处理购买
  handleBuy: function() {
    if (!config.enableRemoteWrites) {
      wx.showToast({ title: '当前为只读联调模式', icon: 'none' })
      return
    }
    if (!wx.getStorageSync('token')) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认购买',
      content: `确定要购买《${this.data.course.title}》吗？`,
      success: (res) => {
        if (res.confirm) {
          this.createOrder()
        }
      }
    })
  },

  // 创建订单
  createOrder: function() {
    wx.showLoading({
      title: '正在处理...'
    })

    request({
      url: `/api/courses/${this.data.courseId}/create_order/`,
      method: 'POST'
    }).then(res => {
      if (res.code === 200) {
        // 支付成功
        wx.showToast({
          title: '购买成功',
          icon: 'success'
        })
        
        // 更新用户课程数量
        const userInfo = wx.getStorageSync('userInfo')
        if (userInfo) {
          userInfo.courseNum = (userInfo.courseNum || 0) + 1
          wx.setStorageSync('userInfo', userInfo)
        }
        
        // 延迟跳转到视频播放页
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/course/video/video?id=${this.data.courseId}`
          })
        }, 1500)
      }
    }).catch(err => {
      wx.showToast({
        title: err.message || '购买失败',
        icon: 'none'
      })
    }).finally(() => {
      wx.hideLoading()
    })
  },

  // 格式化视频时长
  formatDuration: function(seconds) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  },

  onUnload: function() {
    this._isUnloaded = true
    this._loadRequestId = (this._loadRequestId || 0) + 1
    wx.hideLoading()
  }
}) 
