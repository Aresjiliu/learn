import request from '../../../utils/request'
import { getCourseDetail } from '../../../services/course'
import { shouldPersistProgress } from '../../../services/playback'
import { getPlaybackRecord, savePlaybackRecord } from '../../../services/playback-progress'
import { getPlaybackPreferences, savePlaybackPreferences } from '../../../services/playback-preferences'
import config from '../../../config'

const RATES = [0.8, 1, 1.25, 1.5, 2]
const isTime = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const MAX_PENDING = 32
const CHECKPOINT_RETRY_MS = 5000

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
    lastSavedProgress: -1,
    playerSessions: [],
    desiredRate: 1,
    autoNext: false,
    saveError: '',
    recordError: '',
    controlError: ''
  },

  onLoad: function(options) {
    this._isUnloaded = false
    this._hidden = false
    this._pending = new Map()
    this._deferredVideo = null
    const preferences = getPlaybackPreferences(wx)
    this._loadRequestId = 0
    this.setData({
      courseId: options.id,
      requestedVideoId: options.videoId === 0 ? '0' : String(options.videoId || ''),
      isPlaying: false,
      playbackRate: 1.0,
      desiredRate: preferences.rate,
      autoNext: preferences.autoNext,
      loadError: '',
      playbackError: '',
      lastSavedProgress: -1,
      nextVideo: null
    })
    this.loadCourseData()
  },

  // 加载课程数据
  loadCourseData: function() {
    this._rateMenuGeneration = (this._rateMenuGeneration || 0) + 1
    this._deferredVideo = null
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
        
        // 媒体地址由服务端提供公开URL或独立媒体票据，不能附加账号token。
        
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
          currentVideo: null
        })
        this.startVideo(initialVideo)
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
    if (!video || video.id === undefined || video.id === null) return video
    const result = getPlaybackRecord(wx, this.data.courseId, video.id)
    const key = JSON.stringify([String(this.data.courseId), String(video.id)])
    const pending = this._pending && this._pending.get(key)
    if (!result.ok && !this._isUnloaded) this.setData({ recordError: '本机学习记录暂不可用，可继续播放' })
    return {
      ...video,
      lastProgress: pending ? pending.position : (result.ok && result.record ? result.record.position : (isTime(video.lastProgress) ? video.lastProgress : 0))
    }
  },

  startVideo: function(video) {
    if (this._isUnloaded) return false
    this._rateMenuGeneration = (this._rateMenuGeneration || 0) + 1
    if (this._hidden) {
      this._deferredVideo = { video }
      return false
    }
    this._deferredVideo = null
    this.persistVisibleProgress()
    // Never evict a failed snapshot silently. At capacity the current session
    // remains playable; retrying storage frees room for another selection.
    const targetKey = video && JSON.stringify([String(this.data.courseId), String(video.id)])
    if (this._pending && this._pending.size >= MAX_PENDING && !this._pending.has(targetKey)) {
      this.setData({ saveError: '本机未保存记录较多，请重试保存后切换' })
      return false
    }
    const player = this.getPlayer()
    const oldSession = this._session
    this._session = null
    if (player && oldSession && player.pause) player.pause()
    this._waiting = false
    wx.hideLoading()
    this.setData({ recordError: '' })
    const currentVideo = this.withLocalProgress(video)
    const sessionId = 'playback-' + (this._sessionSequence = (this._sessionSequence || 0) + 1)
    this._session = currentVideo ? {
      sessionId, courseId: this.data.courseId, videoId: currentVideo.id,
      position: currentVideo.lastProgress, duration: 0, observed: false, played: false,
      courseTitle: this.data.course && this.data.course.title,
      videoTitle: currentVideo.title
    } : null
    this.setData({
      currentVideo,
      playerSessions: currentVideo ? [{ sessionId }] : [],
      currentTime: currentVideo ? currentVideo.lastProgress : 0,
      duration: 0, buffered: 0, isSeeking: false, isPlaying: false,
      lastSavedProgress: -1, nextVideo: null, loadError: '', playbackError: '',
      playbackRate: 1, controlError: '', isFullScreen: false
    })
    return true
  },

  acceptsEvent: function(e) {
    return Boolean(!this._isUnloaded && !this._hidden && this._session && e && e.detail &&
      e.detail.sessionId === this._session.sessionId)
  },

  getPlayer: function() {
    return typeof this.selectComponent === 'function' ? this.selectComponent('.video-player') : null
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

    this.startVideo(video)
  },

  isPlayableWithoutPurchase: function(video, chapterIndex) {
    if (video && (video.isPreview === true || video.isPreview === 'true' || video.isPreview === 1 || video.isPreview === '1')) return true
    return (!video || video.isPreview === undefined || video.isPreview === null || video.isPreview === '') && chapterIndex === 0
  },

  // 视频事件处理
  onVideoPlay: function(e) {
    if (!this.acceptsEvent(e)) return
    this._waiting = false
    wx.hideLoading()
    const firstPlay = !this._session.played
    this._session.played = true
    this.setData({ isPlaying: true, playbackError: '' })
    if (firstPlay) this.persistVisibleProgress()
  },

  onVideoPause: function(e) {
    if (!this.acceptsEvent(e)) return
    this._waiting = false
    wx.hideLoading()
    this.persistVisibleProgress()
    this.setData({ isPlaying: false })
  },

  persistVisibleProgress: function(memoryOnly = false) {
    const session = this._session
    if (!session || (!session.played && !session.observed)) return false
    const record = { courseId: session.courseId, videoId: session.videoId, position: session.position, duration: session.duration }
    for (const field of ['courseTitle', 'videoTitle']) {
      if (typeof session[field] === 'string' && Array.from(session[field]).length <= 256) record[field] = session[field]
    }
    // During retry backoff keep the latest failed snapshot without synchronous IO.
    if (memoryOnly) {
      const key = JSON.stringify([String(record.courseId), String(record.videoId)])
      if (this._pending && this._pending.has(key)) this._pending.set(key, record)
      return false
    }
    return this.saveSnapshot(record, true)
  },

  saveSnapshot: function(record, makeRecent) {
    if (!this._pending) this._pending = new Map()
    const key = JSON.stringify([String(record.courseId), String(record.videoId)])
    const result = savePlaybackRecord(wx, record, { makeRecent })
    if (result.ok) {
      this._pending.delete(key)
      if (!this._isUnloaded && this._session && String(this._session.courseId) === String(record.courseId) &&
          String(this._session.videoId) === String(record.videoId)) {
        this.setData({ lastSavedProgress: Math.floor(record.position) })
      }
    } else if (this._pending.has(key) || this._pending.size < MAX_PENDING) {
      this._pending.set(key, { ...record })
    }
    if (!this._isUnloaded) this.setData({ saveError: this._pending.size || !result.ok ? '本机学习记录保存失败，可继续播放或重试保存' : '' })
    return result.ok
  },

  retrySaveProgress: function() {
    if (this._isUnloaded || this._hidden) return
    // Old identity snapshots must never steal recent from a newer playback.
    const entries = this._pending ? Array.from(this._pending.values()) : []
    entries.forEach(record => this.saveSnapshot(record, false))
    this.persistVisibleProgress()
  },

  onVideoBuffering: function(e) {
    if (!this.acceptsEvent(e)) return
    this._waiting = true
    wx.showLoading({ title: '加载中...' })
  },

  onVideoError: function(e) {
    if (!this.acceptsEvent(e)) return
    this._waiting = false
    wx.hideLoading()
    this.persistVisibleProgress()
    const retryVideo = { ...this.data.currentVideo, lastProgress: this._session.position }
    this._session = null
    this._rateMenuGeneration = (this._rateMenuGeneration || 0) + 1
    console.error('视频播放错误:', e && e.detail && e.detail.errMsg ? e.detail.errMsg : 'unknown error')
    this.setData({ currentVideo: retryVideo, playerSessions: [], isPlaying: false, playbackError: '当前视频无法播放，请检查媒体服务或切换其他视频' })
    wx.showToast({
      title: '视频播放失败',
      icon: 'none'
    })
  },

  retryPlayback: function() {
    this.startVideo(this.data.currentVideo)
  },

  retryLoad: function() {
    this.loadCourseData()
  },

  // 记录播放进度
  onTimeUpdate: function(e) {
    if (!this.acceptsEvent(e) || !isTime(e.detail.currentTime)) return
    const currentTime = e.detail.currentTime
    if (this._waiting && currentTime > this._session.position) {
      this._waiting = false
      wx.hideLoading()
    }
    const duration = isTime(e.detail.duration) ? e.detail.duration : this._session.duration
    this._session.position = currentTime
    this._session.duration = duration
    this._session.observed = true
    this.setData({
      currentTime: currentTime,
      duration,
      isSeeking: false
    })

    // 每30秒记录一次进度，且不在拖拽状态时
    if (shouldPersistProgress(currentTime, this.data.lastSavedProgress)) {
      const key = JSON.stringify([String(this._session.courseId), String(this._session.videoId)])
      const attemptedAt = this._session.checkpointAttemptedAt
      if (this._pending && this._pending.has(key) && typeof attemptedAt === 'number' &&
          Date.now() - attemptedAt < CHECKPOINT_RETRY_MS) {
        this.persistVisibleProgress(true)
      } else {
        this.updateVideoProgress(currentTime)
      }
    }
  },

  // 更新视频进度的统一方法
  updateVideoProgress: function(progress) {
    if (this._isUnloaded || this._hidden || !this._session || !isTime(progress) || progress !== this._session.position) return
    const videoId = this.data.currentVideo.id
    this._session.checkpointAttemptedAt = Date.now()
    this.persistVisibleProgress()
    // 阶段 0/1 只保存在本地；远程上报必须显式开启写权限。
    try {
      if (!config.enableRemoteWrites || !wx.getStorageSync('token')) return
    } catch (error) { return }
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
    if (!this.acceptsEvent(e)) return
    // Native timeupdate is the only position authority; no seekcomplete lock.
  },

  // 拖动进度条完成
  onVideoSeekComplete: function(e) {
    if (!this.acceptsEvent(e)) return
  },

  // 视频播放结束
  onVideoEnd: function(e) {
    if (!this.acceptsEvent(e)) return
    this._waiting = false
    wx.hideLoading()
    if (isTime(this._session.duration) && this._session.duration > 0) {
      this._session.position = this._session.duration
      this.setData({ currentTime: this._session.duration })
    }
    this.persistVisibleProgress()
    this.setData({ isPlaying: false })
    this.setData({ nextVideo: this.findNextPlayableVideo() })
    if (this.data.autoNext && this.data.nextVideo) this.playNextVideo()
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
    this.startVideo(this.data.nextVideo)
  },

  // 全屏状态变化
  onFullScreenChange: function(e) {
    if (!this.acceptsEvent(e)) return
    this.setData({
      isFullScreen: e.detail.fullScreen
    })
  },

  // 播放速率变化
  onPlaybackRateChange: function(e) {
    if (!this.acceptsEvent(e)) return
    const rate = e.detail.playbackRate
    if (RATES.includes(rate)) this.applyRateLabel(rate)
  },

  onRateApplied: function(e) {
    if (!this.acceptsEvent(e) || !RATES.includes(e.detail.rate)) return
    this.applyRateLabel(e.detail.rate)
  },

  applyRateLabel: function(rate) {
    const changed = this.data.desiredRate !== rate
    this.setData({ playbackRate: rate, desiredRate: rate, controlError: '' })
    if (changed) this.savePreferences()
  },

  savePreferences: function() {
    if (!savePlaybackPreferences(wx, { rate: this.data.desiredRate, autoNext: this.data.autoNext })) {
      wx.showToast({ title: '学习设置未保存，本次仍可使用', icon: 'none' })
    }
  },

  choosePlaybackRate: function() {
    if (this._isUnloaded || this._hidden || !this._session || this.data.playbackError) return
    const sessionId = this._session.sessionId
    const menuGeneration = (this._rateMenuGeneration || 0) + 1
    this._rateMenuGeneration = menuGeneration
    wx.showActionSheet({
      itemList: RATES.map(rate => rate + '倍'),
      success: result => {
        if (menuGeneration !== this._rateMenuGeneration || !this.acceptsEvent({ detail: { sessionId } }) || this.data.playbackError || !Number.isInteger(result.tapIndex)) return
        const rate = RATES[result.tapIndex]
        if (!RATES.includes(rate)) return
        this._rateMenuGeneration += 1
        const player = this.getPlayer()
        if (!player || !player.setPlaybackRate || !player.setPlaybackRate(rate)) {
          this.onControlError({ detail: { sessionId, command: 'rate' } })
        }
      }
    })
  },

  rewindTenSeconds: function() {
    if (this._isUnloaded || this._hidden || !this._session || this.data.playbackError) return
    const player = this.getPlayer()
    if (!player || !player.seekTo || !player.seekTo(Math.max(0, this._session.position - 10))) {
      this.onControlError({ detail: { sessionId: this._session.sessionId, command: 'seek' } })
    }
  },

  onControlError: function(e) {
    if (!this.acceptsEvent(e)) return
    const update = { controlError: e.detail.message || '当前设备暂不支持此操作，请使用原生播放控件' }
    this.setData(update)
  },

  onAutoNextChange: function(e) {
    if (!this.acceptsEvent(e)) return
    this.toggleAutoNext(e)
  },

  toggleAutoNext: function(e) {
    if (this._isUnloaded || this._hidden || !e.detail || typeof e.detail.value !== 'boolean') return
    this.setData({ autoNext: e.detail.value })
    this.savePreferences()
  },

  // 视频缓冲进度更新
  onVideoProgress: function(e) {
    if (this.acceptsEvent(e) && isTime(e.detail.buffered)) {
      this.setData({
        buffered: e.detail.buffered
      })
    }
  },

  onHide: function() {
    this._waiting = false
    this._rateMenuGeneration = (this._rateMenuGeneration || 0) + 1
    this._hidden = true
    this.persistVisibleProgress()
    if (this._session) this._deferredVideo = {
      video: { ...this.data.currentVideo, lastProgress: this._session.position }
    }
    // Renew the native node on return: already-forwarded events must stay stale.
    this._session = null
    const player = this.getPlayer()
    if (player && player.pause) player.pause()
    wx.hideLoading()
    if (!this._isUnloaded) this.setData({ playerSessions: [], isPlaying: false, isFullScreen: false })
  },

  onShow: function() {
    if (this._isUnloaded) return
    this._hidden = false
    if (this._deferredVideo) this.startVideo(this._deferredVideo.video)
  },

  onUnload: function() {
    this._waiting = false
    this._rateMenuGeneration = (this._rateMenuGeneration || 0) + 1
    // Capture remains private while invalidation prevents synchronous pause events
    // or storage callbacks from issuing UI updates during teardown.
    this._isUnloaded = true
    this._hidden = true
    this._deferredVideo = null
    this.persistVisibleProgress()
    this._session = null
    const player = this.getPlayer()
    if (player && player.pause) player.pause()
    wx.hideLoading()
    this._loadRequestId = (this._loadRequestId || 0) + 1
  }
}) 
