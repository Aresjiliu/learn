const config = {
  baseUrl: 'http://127.0.0.1:8000',
  //baseUrl: 'http://192.168.0.101:8000',
  // 本地测试视频服务：D:\software\anaconda3\python.exe scripts/serve_test_media.py
  devMediaBaseUrl: 'http://127.0.0.1:18090',
  enableLocalTestMedia: true,
  // 仅题库音频清单内、且已缓存的本地 MP3 可播放。
  enableLocalTestAudio: true,
  // 教材词音频独立于题库音频；索引仅包含本机已缓存的 MP3。
  enableLocalWordAudio: true,
  // 阶段 1 内容 API 默认关闭；完成服务部署和域名配置后再打开。
  enableContentApi: false,
  // 开发机只读完整词典；课程与题库继续使用本地已审核样本。
  enableLocalDictionaryApi: true,
  contentApiBasePath: '/api/v1',
  contentApiBaseUrl: 'http://127.0.0.1:18092',
  // 阶段 0/1 默认禁止远程写入；完成接口、鉴权和支付验收后再显式开启。
  enableRemoteWrites: false,
  enableDebugLog: false,
  appid: 'wx65c8a5b19e5b2077',
  // 仅用于本地页面验证；发布前必须关闭。
  enableLocalSampleFallback: true
}

export default config 
