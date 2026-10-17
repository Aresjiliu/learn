const config = {
  baseUrl: 'http://127.0.0.1:8000',
  //baseUrl: 'http://192.168.0.101:8000',
  // 本地测试视频服务：D:\software\anaconda3\python.exe scripts/serve_test_media.py
  devMediaBaseUrl: 'http://127.0.0.1:18090',
  enableLocalTestMedia: true,
  // 当前仅登记了字母发音/音效，题库 exam_audio 尚未完成逐题映射。
  enableLocalTestAudio: false,
  // 教材词音频独立于题库音频；索引仅包含本机已缓存的 MP3。
  enableLocalWordAudio: true,
  // 阶段 1 内容 API 默认关闭；完成服务部署和域名配置后再打开。
  enableContentApi: false,
  contentApiBasePath: '/api/v1',
  contentApiBaseUrl: 'http://127.0.0.1:18091',
  // 阶段 0/1 默认禁止远程写入；完成接口、鉴权和支付验收后再显式开启。
  enableRemoteWrites: false,
  enableDebugLog: false,
  appid: 'wx65c8a5b19e5b2077',
  // 仅用于本地页面验证；发布前必须关闭。
  enableLocalSampleFallback: true
}

export default config 
