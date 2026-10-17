import request from '../../utils/request'
import config from '../../config'

Page({
  data: {
    courses: [],
    modeMessage: ''
  },

  onLoad: function() {
    this.loadMyCourses()
  },

  onShow: function() {
    this.loadMyCourses()
  },

  // 加载已购课程
  loadMyCourses: function() {
    if (!wx.getStorageSync('token')) {
      this.setData({ courses: [], modeMessage: '登录后可查看已购课程' })
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    if (!config.enableRemoteWrites) {
      this.setData({ courses: [], modeMessage: '当前为本地只读联调模式，暂不加载个人购买记录' })
      return Promise.resolve()
    }

    return request({
      url: '/api/user/courses/',
      method: 'GET'
    }).then(res => {
      if (res.code === 200) {
        this.setData({
          courses: res.data.courses,
          modeMessage: ''
        })
      }
    })
  },

  // 跳转到视频播放页
  navigateToVideo: function(e) {
    const courseId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/course/video/video?id=${courseId}`
    })
  },

  // 图片加载错误处理
  handleImageError: function(e) {
    const index = e.currentTarget.dataset.index
    const courses = this.data.courses
    courses[index].cover_image = '/images/course.png'
    this.setData({ courses })
  }
}) 
