import config from '../config'

const request = (options) => {
  const method = String(options.method || 'GET').toUpperCase()
  if (method !== 'GET' && !config.enableRemoteWrites) {
    return Promise.reject(new Error('remote writes are disabled in the current environment'))
  }
  const token = wx.getStorageSync('token')
  
  return new Promise((resolve, reject) => {
    const baseUrl = String(options.baseUrl || config.baseUrl || '').replace(/\/+$/, '')
    const path = String(options.url || '').replace(/^\/+/, '')
    const requestPath = String(options.url || '')
    const fullUrl = `${baseUrl}/${path}`
    
    const debug = Boolean(config.enableDebugLog)
    if (debug) {
      console.log('Making request to:', fullUrl)
      console.log('Request method:', options.method)
    }
    
    wx.request({
      url: fullUrl,
      method: method,
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (debug) console.log('Response status:', res.statusCode)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('token')
          wx.removeStorageSync('userInfo')
          
          if (!requestPath.includes('/login/')) {
            wx.showToast({
              title: '请先登录',
              icon: 'none',
              success: () => {
                wx.switchTab({
                  url: '/pages/profile/profile'
                })
              }
            })
          }
          reject(res.data)
        } else {
          reject(res.data)
        }
      },
      fail: (error) => {
        if (debug) console.error('Request failed:', error.errMsg || 'unknown error')
        let errorMsg = '网络请求失败'
        if (error.errMsg) {
          if (debug) console.error('Error message:', error.errMsg)
          if (error.errMsg.includes('fail')) {
            errorMsg = '服务器连接失败，请检查网络设置'
          }
          if (error.errMsg.includes('timeout')) {
            errorMsg = '请求超时，请重试'
          }
        }
        reject({
          code: -1,
          message: errorMsg,
          requestInfo: {
            url: fullUrl,
            method: options.method
          }
        })
      },
      complete: (res) => {
        if (debug) console.log('Request complete:', res.statusCode)
      },
      timeout: 10000
    })
  })
}

export default request 
