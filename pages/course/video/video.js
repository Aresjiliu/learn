import request from '../../../utils/request'
import { getCourseDetail } from '../../../services/course'
import { shouldPersistProgress } from '../../../services/playback'
import { getVideoProgress, saveVideoProgress, saveRecentVideo } from '../../../services/playback-progress'
import config from '../../../config'

Page({
  data: {
    courseId: null,
    requestedVideoId: '',
    course: null,
    chapters: [],
    currentVideo: null,
    hasPurchased: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    nextVideo: null,
    isFullScreen: false,
    playbackRate: 1.0,
    buffered: 0,
    isSeeking: false,
    loading: true,
    loadError: '',
    playbackError: '',
    lastSavedProgress: -1
  },

  onLoad: function(options) {
    this._isUnloaded = false
    this._loadRequestId = 0
    this.setData({
      courseId: options.id,
      requestedVideoId: options.videoId || '',
      isPlaying: false,
      playbackRate: 1.0,
      loadError: '',
      playbackError: '',
      lastSavedProgress: -1,
      nextVideo: null
    })
    this.loadCourseData()
  },

  // 加载课程数据
  loadCourseData: function() {
    const requestId = (this._loadRequestId || 0) + 1
    this._loadRequestId = requestId
    this.setData({ loading: true, loadError: '' })
    // 课程详情、章节和媒体信息统一由课程适配层提供，避免页面绕过
    // 内容 API 后重新依赖旧接口；旧后端兼容逻辑集中在 services/course.js。
    const dataRequest = getCourseDetail(this.data.courseId)

    dataRequest.then(res => {
      if (this._isUnloaded || requestId !== this._loadRequestId) return
      if (res.code !== 200 || !res.data) {
        throw new Error(res.message || '课程媒体信息响应异常')
      }
      {
        const course = res.data.course || null
        const hasPurchased = Boolean(res.data.hasPurchased)
        const chapters = Array.isArray(res.data.chapters)
          ? res.data.chapters.map((chapter, chapterIndex) => ({
            ...chapter,
            rowKey: chapter.rowKey || `chapter-${chapter.id || chapterIndex}`,
            videos: Array.isArray(chapter.videos)
              ? chapter.videos.map((video, videoIndex) => ({
                ...video,
                rowKey: video.rowKey || `video-${video.id || `${chapterIndex}-${videoIndex}`}`
              }))
              : []
          }))
          : []
        chapters.forEach((chapter, chapterIndex) => {
          chapter.videos = chapter.videos.map(video => {
            const canPreview = Boolean(video.url) && this.isPlayableWithoutPurchase(video, chapterIndex)
            return {
              ...video,
              canPreview: Boolean(video.url) && this.isPlayableWithoutPurchase(video, chapterIndex),
              statusLabel: !video.url ? '媒体待接入' : (!hasPurchased && !canPreview ? '已锁定' : (canPreview ? '免费试听' : '可播放'))
            }
          })
        })
        
        // 为远程视频URL添加token；本地测试媒体不追加业务token。
        const token = wx.getStorageSync('token')
        chapters.forEach(chapter => {
          chapter.videos.forEach(video => {
            if (video.url && token && !video.url.startsWith(config.devMediaBaseUrl) && !video.url.includes('token=')) {
              video.url = `${video.url}${video.url.includes('?') ? '&' : '?'}token=${token}`
            }
          })
        })
        
        // 设置数据：未购买用户只允许初始化到有地址且可试听的视频。
        let initialVideo = null
        chapters.some((chapter, chapterIndex) => {
          const videos = Array.isArray(chapter.videos) ? chapter.videos : []
          return videos.some(video => {
            if (!video || !video.url || (!hasPurchased && !this.isPlayableWithoutPurchase(video, chapterIndex))) return false
            initialVideo = video
            return true
          })
        })
        if (this.data.requestedVideoId) {
          chapters.some((chapter, chapterIndex) => {
            const videos = Array.isArray(chapter.videos) ? chapter.videos : []
            const match = videos.find(video => String(video.id) === String(this.data.requestedVideoId))
            if (!match || !match.url || (!hasPurchased && !this.isPlayableWithoutPurchase(match, chapterIndex))) return false
            initialVideo = match
            return true
          })
        }
        this.setData({
          course,
          chapters,
          hasPurchased,
          loadError: '',
          playbackError: '',
          // 默认播放第一个视频
          currentVideo: this.withLocalProgress(initialVideo)
        })
        this.setData({ loading: false })
      }
    }).catch(err => {
      if (this._isUnloaded || requestId !== this._loadRequestId) return
      this.setData({ loading: false, loadError: '课程媒体信息加载失败，请稍后重试' })
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      console.error('加载课程数据失败:', err && err.message ? err.message : 'unknown error')
    })
  },

  withLocalProgress: function(video) {
    if (!video || !video.id) return video
    return {
      ...video,
      lastProgress: Number(video.lastProgress) || getVideoProgress(wx, video.id)
    }
  },

  // 切换视频
  switchVideo: function(e) {
    const { video, chapterIndex } = e.currentTarget.dataset
    
    // 优先使用视频级试听标记；旧接口没有该字段时兼容首章试听。
    if (!this.data.hasPurchased && !this.isPlayableWithoutPurchase(video, chapterIndex)) {
      wx.showToast({
        title: '完整课程暂未开放',
        icon: 'none'
      })
      return
    }

    // 没有可用媒体地址时，不允许播放。
    if (!video.url) {
      wx.showToast({
        title: '试听媒体地址待接入',
        icon: 'none'
      })
      return
    }

    // 确保远程视频URL包含token；本地测试视频保持原地址。
    const token = wx.getStorageSync('token')
    if (video.url && token && !video.url.startsWith(config.devMediaBaseUrl) && !video.url.includes('token=')) {
      video.url = `${video.url}${video.url.includes('?') ? '&' : '?'}token=${token}`
    }

    this.setData({
      currentVideo: this.withLocalProgress(video),
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      isSeeking: false,
      lastSavedProgress: -1,
      nextVideo: null,
      loadError: '',
      playbackError: ''
    })
  },

  isPlayableWithoutPurchase: function(video, chapterIndex) {
    if (video && (video.isPreview === true || video.isPreview === 'true' || video.isPreview === 1 || video.isPreview === '1')) return true
    return (!video || video.isPreview === undefined || video.isPreview === null || video.isPreview === '') && chapterIndex === 0
  },

  // 视频事件处理
  onVideoPlay: function() {
    wx.hideLoading()
    if (this.data.currentVideo && this.data.courseId) saveRecentVideo(wx, this.data.courseId, this.data.currentVideo.id)
    this.setData({ isPlaying: true, playbackError: '' })
  },

  onVideoPause: function() {
    this.persistVisibleProgress()
    this.setData({ isPlaying: false })
  },

  persistVisibleProgress: function() {
    if (!this.data.currentVideo || !this.data.courseId || !(this.data.currentTime > 0)) return
    saveVideoProgress(wx, this.data.currentVideo.id, this.data.currentTime)
    saveRecentVideo(wx, this.data.courseId, this.data.currentVideo.id)
  },

  onVideoBuffering: function() {
    // 只在缓冲进度小于当前播放进度时显示加载提示
    if (this.data.buffered < this.data.currentTime) {
      wx.showLoading({
        title: '加载中...'
      })
    }
  },

  onVideoError: function(e) {
    console.error('视频播放错误:', e && e.detail && e.detail.errMsg ? e.detail.errMsg : 'unknown error')
    this.setData({ playbackError: '当前视频无法播放，请检查媒体服务或切换其他视频' })
    wx.showToast({
      title: '视频播放失败',
      icon: 'none'
    })
  },

  retryPlayback: function() {
    this.setData({ playbackError: '' })
  },

  retryLoad: function() {
    this.loadCourseData()
  },

  // 记录播放进度
  onTimeUpdate: function(e) {
    if (!this.data.currentVideo) return
    
    const currentTime = e.detail.currentTime
    const videoId = this.data.currentVideo.id

    // 更新当前播放时间
    this.setData({
      currentTime: currentTime,
      duration: e.detail.duration
    })

    // 每30秒记录一次进度，且不在拖拽状态时
    if (shouldPersistProgress(currentTime, this.data.lastSavedProgress) && !this.data.isSeeking) {
      this.setData({ lastSavedProgress: Math.floor(currentTime) })
      saveVideoProgress(wx, videoId, currentTime)
      this.updateVideoProgress(currentTime)
    }
  },

  // 更新视频进度的统一方法
  updateVideoProgress: function(progress) {
    if (!this.data.currentVideo) return
    const videoId = this.data.currentVideo.id
    saveVideoProgress(wx, videoId, progress)
    saveRecentVideo(wx, this.data.courseId, videoId)
    // 阶段 0/1 只保存在本地；远程上报必须显式开启写权限。
    if (!config.enableRemoteWrites || !wx.getStorageSync('token')) return
    request({
      url: '/api/video/progress/',
      method: 'POST',
      data: {
        video_id: videoId,
        progress: Math.floor(progress)
      }
    }).catch(err => {
      console.error('保存播放进度失败:', err && err.message ? err.message : 'unknown error')
    })
  },

  // 开始拖动进度条
  onVideoSeek: function(e) {
    this.setData({ isSeeking: true })
  },

  // 拖动进度条完成
  onVideoSeekComplete: function(e) {
    this.setData({ isSeeking: false })
    // 拖拽完成时更新进度
    if (e.detail && e.detail.position !== undefined) {
      this.updateVideoProgress(e.detail.position)
    }
  },

  // 视频播放结束
  onVideoEnd: function() {
    if (this.data.currentVideo && this.data.duration > 0) {
      this.updateVideoProgress(this.data.duration)
    }
    this.setData({ nextVideo: this.findNextPlayableVideo() })
    wx.showToast({
      title: '播放完成',
      icon: 'success'
    })
  },

  findNextPlayableVideo: function() {
    if (!this.data.currentVideo) return null
    let currentFound = false
    for (let chapterIndex = 0; chapterIndex < this.data.chapters.length; chapterIndex += 1) {
      const chapter = this.data.chapters[chapterIndex]
      const videos = Array.isArray(chapter.videos) ? chapter.videos : []
      for (let videoIndex = 0; videoIndex < videos.length; videoIndex += 1) {
        const video = videos[videoIndex]
        if (currentFound && (this.data.hasPurchased || this.isPlayableWithoutPurchase(video, chapterIndex)) && video.url) return video
        if (String(video.id) === String(this.data.currentVideo.id)) currentFound = true
      }
    }
    return null
  },

  playNextVideo: function() {
    if (!this.data.nextVideo) return
    this.setData({
      currentVideo: this.withLocalProgress(this.data.nextVideo),
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      isSeeking: false,
      lastSavedProgress: -1,
      nextVideo: null,
      loadError: '',
      playbackError: ''
    })
  },

  // 全屏状态变化
  onFullScreenChange: function(e) {
    this.setData({
      isFullScreen: e.detail.fullScreen
    })
  },

  // 播放速率变化
  onPlaybackRateChange: function(e) {
    this.setData({
      playbackRate: e.detail.rate
    })
  },

  // 视频缓冲进度更新
  onVideoProgress: function(e) {
    if (e.detail && e.detail.buffered) {
      this.setData({
        buffered: e.detail.buffered
      })
    }
  },

  onUnload: function() {
    this.persistVisibleProgress()
    this._isUnloaded = true
    this._loadRequestId = (this._loadRequestId || 0) + 1
  }
}) 
