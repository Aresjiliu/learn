import request from '../../utils/request'
import config from '../../config'

Page({
  data: {
    userInfo: null,
    studyDays: 0,
    courseNum: 0,
    collectNum: 0
  },

  onLoad: function() {
    this.checkLoginStatus()
  },

  onShow: function() {
    if (this.data.userInfo) {
      this.updateUserStats()
    }
  },

  checkLoginStatus: function() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')
    if (token && userInfo) {
      this.setData({ 
        userInfo
      })
      this.updateUserStats()
    }
  },

  updateUserStats: function() {
    if (!config.enableRemoteWrites) {
      this.setData({
        studyDays: wx.getStorageSync('studyDays') || 0,
        courseNum: wx.getStorageSync('courseNum') || 0,
        collectNum: wx.getStorageSync('collectNum') || 0
      })
      return Promise.resolve()
    }
    return request({
      url: '/api/user/stats/',
      method: 'GET'
    }).then(res => {
      if (res.code === 200) {
        const { studyDays, courseNum, collectNum } = res.data
        this.setData({
          studyDays,
          courseNum,
          collectNum
        })
        // 更新本地存储
        wx.setStorageSync('studyDays', studyDays)
        wx.setStorageSync('courseNum', courseNum)
        wx.setStorageSync('collectNum', collectNum)
      }
    }).catch(err => {
      console.error('获取用户统计数据失败:', err && err.message ? err.message : 'unknown error')
    })
  },

  handleUserLogin: function(e) {
    if (!config.enableRemoteWrites) {
      wx.showToast({ title: '当前为只读联调模式，暂不登录', icon: 'none' })
      return
    }
    if (!e.detail.userInfo) {
      wx.showToast({
        title: '登录失败，请允许授权',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '登录中...'
    })

    // 先获取code
    wx.login({
      success: (res) => {
        if (res.code) {
          // 发送登录请求
          request({
            url: '/api/login/',
            method: 'POST',
            data: {
              code: res.code,
              userInfo: e.detail.userInfo
            }
          }).then(res => {
            if (res.code === 200) {
              // 保存token和用户信息
              wx.setStorageSync('token', res.data.token)
              wx.setStorageSync('userInfo', res.data.userInfo)
              
              this.setData({
                userInfo: res.data.userInfo
              })

              wx.showToast({
                title: '登录成功',
                icon: 'success'
              })
            } else {
              throw new Error(res.message)
            }
          }).catch(err => {
            console.error('Login API error:', err && err.message ? err.message : 'unknown error')
            wx.showToast({
              title: err.message || '登录失败，请重试',
              icon: 'none'
            })
          }).finally(() => {
            wx.hideLoading()
          })
        } else {
          wx.hideLoading()
          wx.showToast({
            title: '获取授权码失败',
            icon: 'none'
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({
          title: '微信登录失败',
          icon: 'none'
        })
      }
    })
  },

  // 页面跳转
  navigateTo: function(e) {
    const url = e.currentTarget.dataset.url
    
    // 如果未登录且不是商家声明和客服页面，则提示登录
    if (!this.data.userInfo && 
        url !== '/pages/statement/statement' && 
        url !== '/pages/client/client') {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    wx.navigateTo({ url })
  }
}) 
