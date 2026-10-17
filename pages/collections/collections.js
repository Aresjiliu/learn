import request from '../../utils/request'
import config from '../../config'

Page({
  data: {
    courses: [],
    modeMessage: ''
  },

  onLoad: function() {
    this.loadCollections()
  },

  onShow: function() {
    this.loadCollections()  // 每次显示页面时重新加载，以更新收藏状态
  },

  // 加载收藏的课程
  loadCollections: function() {
    if (!config.enableRemoteWrites) {
      this.setData({ courses: [], modeMessage: '当前为本地只读联调模式，暂不加载个人收藏' })
      return Promise.resolve()
    }
    return request({
      url: '/api/favorites/',
      method: 'GET'
    }).then(res => {
      if (res.code === 200) {
        this.setData({
          courses: res.data.courses,
          modeMessage: ''
        })
      }
    }).catch(err => {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      console.error('加载收藏课程失败:', err && err.message ? err.message : 'unknown error')
    })
  },

  // 取消收藏
  handleUncollect: function(e) {
    if (!config.enableRemoteWrites) {
      wx.showToast({ title: '当前为只读联调模式', icon: 'none' })
      return
    }
    const courseId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '提示',
      content: '确定取消收藏该课程吗？',
      success: (res) => {
        if (res.confirm) {
          request({
            url: `/api/favorites/${courseId}/`,
            method: 'DELETE'
          }).then(res => {
            if (res.code === 200) {
              // 更新收藏数量
              const collectNum = wx.getStorageSync('collectNum')
              if (collectNum > 0) {
                wx.setStorageSync('collectNum', collectNum - 1)
              }
              
              // 从列表中移除
              this.setData({
                courses: this.data.courses.filter(course => course.id !== courseId)
              })
              
              wx.showToast({
                title: '已取消收藏',
                icon: 'success'
              })
            }
          }).catch(err => {
            wx.showToast({
              title: '操作失败',
              icon: 'none'
            })
            console.error('取消收藏失败:', err && err.message ? err.message : 'unknown error')
          })
        }
      }
    })
  },

  // 跳转到课程详情
  navigateToDetail: function(e) {
    const courseId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/course/detail/detail?id=${courseId}`
    })
  },

  // 跳转到首页
  navigateToIndex: function() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.loadCollections().then(() => {
      wx.stopPullDownRefresh()
    })
  }
}) 
