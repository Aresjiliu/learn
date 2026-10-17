// index.js
import { getCategories, getCourses } from '../../services/course'
import config from '../../config'
import { getRecentCourse } from '../../services/playback-progress'

function resolveContentMode(response) {
  const source = response && response.meta ? String(response.meta.source || '') : ''
  const message = response ? String(response.message || '') : ''
  if (source.indexOf('local-sample') === 0 || source === 'content-api-fallback' || message.indexOf('local sample') === 0) return 'local-sample'
  if (source === 'content-api') return 'content-api'
  if (config.enableContentApi) return 'content-api'
  return 'local-sample'
}

function getContentModeLabel(contentMode) {
  return contentMode === 'content-api' ? '在线教材内容' : '本地演示内容'
}

function normalizeCategories(categories) {
  return (Array.isArray(categories) ? categories : []).map(category => {
    const normalizedCategory = category || {}
    return {
      ...normalizedCategory,
      id: normalizedCategory.id === null || normalizedCategory.id === undefined ? '' : String(normalizedCategory.id)
    }
  })
}

function normalizeCourses(courses) {
  return (Array.isArray(courses) ? courses : []).map(course => {
    const normalizedCourse = course || {}
    return {
      ...normalizedCourse,
      displayDescription: normalizedCourse.description || normalizedCourse.subtitle || '课程内容待完善'
    }
  })
}

Page({
  data: {
    categories: [],  // 改为空数组，从后端获取
    courses: [],
    currentCategory: null,  // 添加当前选中的分类
    searchQuery: '',  // 添加搜索关键词
    isSearching: false,  // 是否正在搜索中
    categoriesLoading: false,
    categoriesLoadError: '',
    coursesLoading: false,
    coursesLoadError: '',
    courseLoading: false,
    courseLoadError: '',
    hasLocalProgress: false,
    progressId: '',
    contentMode: 'local-sample',
    contentModeLabel: '本地演示内容'
  },

  onLoad: function() {
    this._isUnloaded = false
    this._courseRequestId = 0
    this._categoryRequestId = 0
    this._activeCourseLoadingCount = 0
    this.loadCategories()  // 加载分类数据
    this.loadCourses()     // 加载所有课程
  },

  onShow: function() {
    const progressId = getRecentCourse(wx)
    this.setData({ hasLocalProgress: Boolean(progressId), progressId })
  },

  // 加载分类数据
  loadCategories: function() {
    const requestId = (this._categoryRequestId || 0) + 1
    this._categoryRequestId = requestId
    this.applyRequestState({ categoriesLoading: true, categoriesLoadError: '' })
    getCategories().then(res => {
      if (this._isUnloaded || requestId !== this._categoryRequestId) return
      if (res && res.code === 200) {
        this.applyRequestState({
          categories: normalizeCategories(res.data && res.data.categories),
          categoriesLoading: false,
          categoriesLoadError: ''
        })
      } else {
        this.applyRequestState({
          categories: [],
          categoriesLoading: false,
          categoriesLoadError: '分类加载失败，请重试'
        })
      }
    }).catch(err => {
      if (this._isUnloaded || requestId !== this._categoryRequestId) return
      this.applyRequestState({
        categories: [],
        categoriesLoading: false,
        categoriesLoadError: '分类加载失败，请重试'
      })
      console.error('加载分类失败:', err && err.message ? err.message : 'unknown error')
    })
  },

  // 切换分类
  switchCategory: function(e) {
    const rawCategoryId = e.currentTarget.dataset.id
    const categoryId = rawCategoryId === null || rawCategoryId === undefined || rawCategoryId === '' || rawCategoryId === 'null'
      ? null
      : String(rawCategoryId)
    this.setData({
      currentCategory: categoryId
    })
    this.loadCoursesByCategory(categoryId)
  },

  // 根据分类加载课程
  loadCoursesByCategory: function(categoryId) {
    const requestId = this.beginCourseRequest('加载中...')
    this.applyRequestState({ coursesLoading: true, coursesLoadError: '' })

    getCourses({ categoryId }).then(res => {
      if (requestId !== this._courseRequestId) return
      if (res && res.code === 200) {
        this.applyRequestState({
          courses: normalizeCourses(res.data && res.data.courses),
          coursesLoadError: '',
          contentMode: resolveContentMode(res),
          contentModeLabel: getContentModeLabel(resolveContentMode(res))
        })
      } else {
        this.applyRequestState({
          courses: [],
          coursesLoadError: '课程加载失败，请重试'
        })
      }
    }).catch(err => {
      if (requestId !== this._courseRequestId) return
      this.applyRequestState({ courses: [], coursesLoadError: '课程加载失败，请重试' })
      wx.showToast({ title: '课程加载失败，请重试', icon: 'none' })
      console.error('按分类加载课程失败:', err && err.message ? err.message : 'unknown error')
    }).finally(() => {
      this.finishCourseRequest()
      if (requestId !== this._courseRequestId) return
    })
  },

  // 加载所有课程
  loadCourses: function() {
    const requestId = this.beginCourseRequest('加载中...')
    this.applyRequestState({ coursesLoading: true, coursesLoadError: '' })
    
    getCourses().then(res => {
      if (requestId !== this._courseRequestId) return
      if (res && res.code === 200) {
        this.applyRequestState({
          courses: normalizeCourses(res.data && res.data.courses),
          coursesLoadError: '',
          contentMode: resolveContentMode(res),
          contentModeLabel: getContentModeLabel(resolveContentMode(res))
        })
      } else {
        this.applyRequestState({
          courses: [],
          coursesLoadError: '课程加载失败，请重试'
        })
      }
    }).catch(err => {
      if (requestId !== this._courseRequestId) return
      this.applyRequestState({ courses: [], coursesLoadError: '课程加载失败，请重试' })
      console.error('加载课程失败:', err && err.message ? err.message : 'unknown error')
    }).finally(() => {
      this.finishCourseRequest()
      if (requestId !== this._courseRequestId) return
    })
  },

  applyRequestState: function(updates) {
    const categoriesLoading = updates.categoriesLoading === undefined ? this.data.categoriesLoading : updates.categoriesLoading
    const coursesLoading = updates.coursesLoading === undefined ? this.data.coursesLoading : updates.coursesLoading
    const coursesLoadError = updates.coursesLoadError === undefined ? this.data.coursesLoadError : updates.coursesLoadError
    this.setData({
      ...updates,
      courseLoading: Boolean(categoriesLoading || coursesLoading),
      courseLoadError: coursesLoadError || ''
    })
  },

  beginCourseRequest: function(loadingTitle) {
    this._courseRequestId = (this._courseRequestId || 0) + 1
    this._activeCourseLoadingCount = (this._activeCourseLoadingCount || 0) + 1
    wx.showLoading({
      title: loadingTitle || '加载中...'
    })
    return this._courseRequestId
  },

  finishCourseRequest: function() {
    this._activeCourseLoadingCount = Math.max(0, (this._activeCourseLoadingCount || 0) - 1)
    if (!this._isUnloaded) {
      this.applyRequestState({ coursesLoading: this._activeCourseLoadingCount > 0 })
    }
    if (this._activeCourseLoadingCount === 0 || this._isUnloaded) {
      wx.hideLoading()
    }
  },

  retryCourses: function() {
    if (this.data.currentCategory !== null) {
      this.loadCoursesByCategory(this.data.currentCategory)
      return
    }
    if (this.data.searchQuery.trim()) {
      this.handleSearch()
      return
    }
    this.loadCourses()
  },

  // 跳转到课程详情页
  navigateToCourse: function(e) {
    const courseId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/course/detail/detail?id=${courseId}`
    })
  },

  handleImageError: function(e) {
    const { type, index } = e.currentTarget.dataset
    console.error(`Image load failed for ${type} at index ${index}:`, e)
    
    // 设置默认图片
    if (type === 'course') {
      const courses = this.data.courses
      courses[index].cover_image = '/images/course.png'
      this.setData({ courses })
    } else if (type === 'category') {
      const categories = this.data.categories
      categories[index].icon = '/images/category/all.png'
      this.setData({ categories })
    }
  },

  // 处理搜索输入
  handleSearchInput: function(e) {
    this.setData({
      searchQuery: e.detail.value
    })
  },

  // 执行搜索
  handleSearch: function() {
    const query = this.data.searchQuery.trim()
    if (!query) {
      // 如果搜索词为空，加载所有课程
      this.setData({ currentCategory: null })
      this.loadCourses()
      return
    }

    const requestId = this.beginCourseRequest('搜索中...')

    this.applyRequestState({
      isSearching: true,
      coursesLoading: true,
      coursesLoadError: ''
    })

    getCourses({ query }).then(res => {
      if (requestId !== this._courseRequestId) return
      if (res && res.code === 200) {
        this.applyRequestState({
          courses: normalizeCourses(res.data && res.data.courses),
          currentCategory: null,  // 重置分类选择
          coursesLoadError: '',
          contentMode: resolveContentMode(res),
          contentModeLabel: getContentModeLabel(resolveContentMode(res))
        })
      } else {
        this.applyRequestState({
          courses: [],
          coursesLoadError: '课程搜索失败，请重试'
        })
      }
    }).catch(err => {
      if (requestId !== this._courseRequestId) return
      this.applyRequestState({ courses: [], coursesLoadError: '课程搜索失败，请重试' })
      console.error('搜索课程失败:', err && err.message ? err.message : 'unknown error')
      wx.showToast({
        title: '搜索失败，请重试',
        icon: 'none'
      })
    }).finally(() => {
      this.finishCourseRequest()
      if (requestId !== this._courseRequestId) return
      this.setData({
        isSearching: false
      })
    })
  },

  // 清空搜索
  clearSearch: function() {
    this.setData({
      searchQuery: '',
      isSearching: false,
      currentCategory: null
    })
    this.loadCourses()  // 重新加载所有课程
  },

  retryCategories: function() {
    this.loadCategories()
  },

  onUnload: function() {
    this.applyRequestState({ categoriesLoading: false, coursesLoading: false })
    this._isUnloaded = true
    this._courseRequestId = (this._courseRequestId || 0) + 1
    this._categoryRequestId = (this._categoryRequestId || 0) + 1
    this._activeCourseLoadingCount = 0
    wx.hideLoading()
  }
})
