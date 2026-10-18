const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const tokenPath = path.join(root, 'styles', 'design-tokens.wxss')
const appStylesPath = path.join(root, 'app.wxss')

const requiredTokens = [
  ['--color-primary', '#1f5f8b'],
  ['--color-sky', '#eaf3f8'],
  ['--color-page-bg', '#f5f7f9'],
  ['--color-text', '#1f2933'],
  ['--color-text-secondary', '#667085'],
  ['--color-exam', '#d97706'],
  ['--color-error', '#c2413b'],
  ['--color-surface', '#ffffff'],
  ['--color-loading', '#98a2b3'],
  ['--color-empty', '#667085'],
  ['--color-locked', '#98a2b3'],
  ['--radius-card', '20rpx'],
  ['--space-page', '32rpx'],
  ['--shadow-card', '0 8rpx 24rpx rgba(31, 41, 51, 0.08)'],
  ['--font-size-page-title', '40rpx'],
  ['--font-size-section-title', '32rpx'],
  ['--font-size-body', '28rpx'],
  ['--font-size-caption', '24rpx']
]

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assertToken(source, name, value) {
  const declaration = new RegExp(`${escapeRegExp(name)}\\s*:\\s*${escapeRegExp(value)}\\s*;`)
  assert.match(source, declaration, `missing token ${name}: ${value}`)
}

function stripWxmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '')
}

function assertPageContract(contract) {
  const pagePath = path.join(root, contract.path)
  assert.ok(fs.existsSync(pagePath), `missing page contract file: ${contract.path}`)
  const rawSource = fs.readFileSync(pagePath, 'utf8')
  const source = contract.path.endsWith('.wxml') ? stripWxmlComments(rawSource) : rawSource
  for (const check of contract.checks || []) {
    assert.ok(check.pattern.test(source), `${contract.path}: missing ${check.label}`)
  }
}

function assertSourcePattern(source, pattern, filePath, label) {
  assert.ok(pattern.test(source), `${filePath}: missing ${label}`)
}

function assertSourceAbsent(source, pattern, filePath, label) {
  assert.ok(!pattern.test(source), `${filePath}: must not contain ${label}`)
}

const multilineCommentFixture = '<view>keep</view><!-- first line\nsecond line -->'
assert.strictEqual(
  stripWxmlComments(multilineCommentFixture),
  '<view>keep</view>',
  'WXML comment stripper must remove comments spanning multiple lines'
)

assert.ok(fs.existsSync(tokenPath), `missing design token file: ${path.relative(root, tokenPath)}`)
assert.ok(fs.existsSync(appStylesPath), 'missing app.wxss')

const tokenSource = fs.readFileSync(tokenPath, 'utf8')
const appStylesSource = fs.readFileSync(appStylesPath, 'utf8')
for (const [name, value] of requiredTokens) {
  assertToken(tokenSource, name, value)
}
assert.ok(
  /@import\s*["'](?:\.\/)?styles\/design-tokens\.wxss["']\s*;/.test(appStylesSource),
  'app.wxss must import styles/design-tokens.wxss'
)

const pageContracts = [{
  path: 'pages/index/index.wxml',
  checks: [
    { label: '首页标题', pattern: /<text class="page-title">俄语教材学习<\/text>/ },
    { label: '首页说明', pattern: /<text class="page-description">[^<]+<\/text>/ },
    { label: '搜索输入 handleSearch 绑定', pattern: /<input[^>]*bindconfirm="handleSearch"[^>]*>/ },
    { label: '搜索按钮 handleSearch 绑定', pattern: /<button[^>]*class="search-action"[^>]*bindtap="handleSearch"[^>]*>搜索<\/button>/ },
    { label: '练习入口路由和行为文案', pattern: /<navigator[^>]*url="\/pages\/exam\/list\/list"[^>]*class="quick-action"[^>]*>[\s\S]*?<text class="quick-action-title">练习<\/text>[\s\S]*?<\/navigator>/ },
    { label: '词典入口路由和行为文案', pattern: /<navigator[^>]*url="\/pages\/dictionary\/search\/search"[^>]*class="quick-action"[^>]*>[\s\S]*?<text class="quick-action-title">词典<\/text>[\s\S]*?<\/navigator>/ },
    { label: '我的课程入口路由和行为文案', pattern: /<navigator[^>]*url="\/pages\/my-courses\/my-courses"[^>]*class="quick-action"[^>]*>[\s\S]*?<text class="quick-action-title">我的课程<\/text>[\s\S]*?<\/navigator>/ },
    { label: '继续学习卡片受 hasLocalProgress 和 progressId 控制', pattern: /<view(?=[^>]*class="continue-card")(?=[^>]*wx:if="\{\{hasLocalProgress && progressId\}\}")[^>]*>/ },
    { label: '继续学习卡片可导航到课程', pattern: /<view(?=[^>]*class="continue-card")(?=[^>]*bindtap="navigateToCourse")(?=[^>]*data-id="\{\{progressId\}\}")[^>]*>/ },
    { label: '继续学习卡片内容', pattern: /class="continue-title">[^<]+<\/text>/ },
    { label: '教材课程分区', pattern: /<text class="section-title">教材课程<\/text>/ },
    { label: '考级题库入口', pattern: /<navigator[^>]*url="\/pages\/exam\/list\/list"[^>]*class="exam-entry"[^>]*>[\s\S]*?考级题库[\s\S]*?<\/navigator>/ },
    { label: '横向分类滚动结构', pattern: /<scroll-view[^>]*class="category-scroll"[^>]*scroll-x=/ },
    { label: '分类 switchCategory 行为绑定', pattern: /<view[^>]*class="category-tab[^"]*"[^>]*bindtap="switchCategory"[^>]*>/ },
    { label: '分类列表 wx:key 和 data-id', pattern: /<view(?=[^>]*wx:for="\{\{categories\}\}")(?=[^>]*wx:key="id")(?=[^>]*data-id="\{\{item\.id\}\}")[^>]*>/ },
    { label: 'course-card 与 navigateToCourse 同卡片绑定', pattern: /<view(?=[^>]*class="course-card")(?=[^>]*bindtap="navigateToCourse")[^>]*>/ },
    { label: '课程列表 wx:key 和 data-id', pattern: /<view(?=[^>]*wx:for="\{\{courses\}\}")(?=[^>]*wx:key="id")(?=[^>]*data-id="\{\{item\.id\}\}")[^>]*>/ },
    { label: '课程 content-status 展示', pattern: /<text class="content-status">\{\{contentModeLabel\}\}<\/text>/ },
    { label: '课程 course-state 展示', pattern: /<text class="course-state">\{\{item\.wordCount\}\}/ },
    { label: '课程安全展示说明字段', pattern: /<text class="course-description">\{\{item\.displayDescription\}\}<\/text>/ },
    { label: '加载状态卡', pattern: /<view(?=[^>]*wx:if="\{\{courseLoading\}\}")(?=[^>]*class="course-state[^"]*")[^>]*>课程加载中/ },
    { label: '失败状态 button 与 retryCourses 行为', pattern: /<button(?=[^>]*wx:elif="\{\{courseLoadError\}\}")(?=[^>]*class="course-state[^"]*")(?=[^>]*bindtap="retryCourses")[^>]*>/ },
    { label: '空状态卡', pattern: /<view(?=[^>]*wx:else)(?=[^>]*class="course-state[^"]*empty")[^>]*>暂无符合条件的教材课程<\/view>/ },
    { label: 'local-sample 条件下免费演示文案', pattern: /<text[^>]*wx:if="\{\{contentMode === 'local-sample'\}\}"[^>]*class="course-price free">免费演示<\/text>/ }
  ]
}, {
  path: 'pages/course/detail/detail.wxml',
  checks: [
    { label: '详情封面比例容器', pattern: /class="course-cover-wrap"/ },
    { label: '详情课程身份和内容状态', pattern: /class="course-identity[^\"]*"[\s\S]*?\{\{contentModeLabel\}\}/ },
    { label: '详情主行动按钮', pattern: /class="primary-action[^"]*"[\s\S]*?(navigateToVideo|previewVideo)/ },
    { label: '详情课程摘要', pattern: /class="course-summary[^\"]*"/ },
    { label: '详情章节区域', pattern: /class="chapter-section[^\"]*"/ },
    { label: '详情章节稳定键', pattern: /<view(?=[^>]*wx:for="\{\{chapters\}\}")(?=[^>]*wx:key="rowKey")[^>]*>/ },
    { label: '详情视频稳定键', pattern: /<view(?=[^>]*wx:for="\{\{item\.videos\}\}")(?=[^>]*wx:key="rowKey")[^>]*>/ },
    { label: '详情视频目录导航', pattern: /bindtap="openCatalogVideo"[\s\S]*?data-video-id="\{\{video\.id\}\}"/ },
    { label: '详情试听状态', pattern: /video\.canPreview[\s\S]*?video\.statusLabel/ },
    { label: '详情锁定状态', pattern: /!hasPurchased && !video\.canPreview/ },
    { label: '详情媒体待接入状态', pattern: /!video\.url/ },
    { label: '详情四项词汇统计', pattern: /wordSummary\.total[\s\S]*?wordSummary\.mapped[\s\S]*?wordSummary\.pending[\s\S]*?wordSummary\.missingMeaning/ },
    { label: '详情词条打开词典', pattern: /bindtap="openWordDetail"/ }
  ]
}, {
  path: 'pages/course/video/video.wxml',
  checks: [
    { label: '视频加载状态使用 player-state', pattern: /wx:if="\{\{loading\}\}"[^>]*class="player-state/ },
    { label: '视频加载失败使用 player-state error', pattern: /wx:(?:if|elif)="\{\{(?:!loading && )?loadError\}\}"[^>]*class="player-state error/ },
    { label: '播放失败使用 player-state error', pattern: /wx:(?:if|elif)="\{\{playbackError\}\}"[^>]*class="player-state error/ },
    { label: '播放失败可重试', pattern: /playbackError[\s\S]*?bindtap="retryPlayback"/ },
    { label: '视频播放器固定容器', pattern: /class="video-container"/ },
    { label: '无媒体地址状态', pattern: /class="player-state pending"[\s\S]*?媒体待接入/ },
    { label: '视频章节列表在播放器后', pattern: /video-container[\s\S]*?class="chapter-list"/ },
    { label: '视频章节稳定键', pattern: /<view(?=[^>]*wx:for="\{\{chapters\}\}")(?=[^>]*wx:key="rowKey")[^>]*>/ },
    { label: '视频项稳定键', pattern: /<view(?=[^>]*wx:for="\{\{item\.videos\}\}")(?=[^>]*wx:key="rowKey")[^>]*>/ },
    { label: '视频当前项高亮', pattern: /currentVideo[\s\S]*?active/ },
    { label: '视频锁定状态', pattern: /class="video-item[\s\S]*?locked-state/ },
    { label: '视频状态标签', pattern: /video\.statusLabel/ }
  ]
}, {
  path: 'pages/exam/list/list.wxml',
  checks: [
    { label: '题库加载、错误和空状态', pattern: /wx:if="\{\{loading\}\}"[\s\S]*?wx:elif="\{\{loadError\}\}"[\s\S]*?wx:else class="state-card empty-state"/ },
    { label: '题库错误重试事件', pattern: /bindtap="retryLoad"/ },
    { label: '题型筛选控件、活跃态与可访问状态', pattern: /wx:for="\{\{filters\}\}"[\s\S]*?wx:key="value"[\s\S]*?filter-button-active[\s\S]*?bindtap="setPaperFilter"[\s\S]*?data-filter="\{\{item\.value\}\}"[\s\S]*?aria-pressed=/ },
    { label: '试卷稳定键和练习导航数据', pattern: /<view(?=[^>]*wx:for="\{\{visiblePapers\}\}")(?=[^>]*wx:key="id")(?=[^>]*bindtap="openPaper")(?=[^>]*data-paper-id="\{\{item\.id\}\}")(?=[^>]*data-can-practice="\{\{item\.canPractice\}\}")[^>]*>/ },
    { label: '明确题型映射、未知类型待确认及题量解析音频信息', pattern: /item\.questionMode === 'choice' \? '选择题'[\s\S]*?item\.questionMode === 'text' \? '填空题' : '题型待确认'[\s\S]*?questionCount[\s\S]*?analysisReady[\s\S]*?audioReadyCount/ },
    { label: '不可练习审核原因和内容状态', pattern: /item\.canPractice[\s\S]*?class="content-status[\s\S]*?reviewReason[\s\S]*?auditReason[\s\S]*?contentStatusReason/ }
  ]
}, {
  path: 'pages/exam/practice/practice.wxml',
  checks: [
    { label: '练习加载、错误和空状态', pattern: /wx:if="\{\{loading\}\}"[\s\S]*?wx:elif="\{\{loadError\}\}"[\s\S]*?wx:else class="state-card empty-state"/ },
    { label: '选择答案事件和 data-answer', pattern: /<view(?=[^>]*wx:for="\{\{options\}\}")(?=[^>]*wx:key="\*this")(?=[^>]*bindtap="selectAnswer")(?=[^>]*data-answer="\{\{item\}\}")[^>]*>/ },
    { label: '填空输入事件', pattern: /bindinput="handleTextInput"/ },
    { label: '提交答案与答题反馈卡', pattern: /class="feedback-card[\s\S]*?bindtap="submitAnswer"/ },
    { label: '音频待接入状态', pattern: /audioPending[\s\S]*?音频资源待接入/ },
    { label: '复盘列表稳定键和答案解析', pattern: /wx:for="\{\{reviewItems\}\}"[\s\S]*?wx:key="id"[\s\S]*?standardAnswer[\s\S]*?item\.hasAnalysis/ },
    { label: '练习进度与结果操作', pattern: /bindtap="restart"[\s\S]*?currentIndex[\s\S]*?bindtap="nextQuestion"/ }
  ]
}, {
  path: 'pages/dictionary/search/search.wxml',
  checks: [
    { label: '搜索输入与查询事件', pattern: /bind:change="handleInput"[\s\S]*?bind:search="handleSearch"[\s\S]*?bindtap="handleSearch"/ },
    { label: '查询加载、错误、无结果和初始状态', pattern: /wx:if="\{\{!searched && !loading\}\}"[\s\S]*?wx:elif="\{\{loading\}\}"[\s\S]*?wx:elif="\{\{loadError\}\}"[\s\S]*?wx:elif="\{\{searched\}\}"/ },
    { label: '查询失败重试事件', pattern: /bindtap="retryLoad"/ },
    { label: '结果稳定键、详情导航与数据字段', pattern: /<dictionary-entry(?=[^>]*wx:for="\{\{words\}\}")(?=[^>]*wx:key="rowKey")(?=[^>]*bind:open="openDetail")(?=[^>]*entry="\{\{item\}\}")[^>]*\/>/ },
    { label: '样本来源和分页事件', pattern: /sampleNotice[\s\S]*?wx:elif="\{\{hasMore\}\}"[\s\S]*?bindtap="loadMore"/ }
  ]
}, {
  path: 'pages/dictionary/detail/detail.wxml',
  checks: [
    { label: '详情加载和空状态', pattern: /wx:if="\{\{loading\}\}"[\s\S]*?wx:else class="state-card empty-state"/ },
    { label: '俄语词形和来源标签', pattern: /class="word">\{\{word\.word\}\}[\s\S]*?sourceType/ },
    { label: '词性和释义安全兜底', pattern: /textbookWordClass[\s\S]*?word_character[\s\S]*?word_meaning_all[\s\S]*?释义待补充/ },
    { label: '音频播放与不可用状态', pattern: /word\.audioPlayable[\s\S]*?bindtap="playAudio"[\s\S]*?word\.audioPending[\s\S]*?暂无音频/ },
    { label: '例句稳定键', pattern: /wx:for="\{\{word\.examples\}\}"[\s\S]*?wx:key="\*this"/ }
  ]
}]
for (const contract of pageContracts) {
  assertPageContract(contract)
}

const indexWxmlSource = stripWxmlComments(fs.readFileSync(path.join(root, 'pages', 'index', 'index.wxml'), 'utf8'))
const indexJsSource = fs.readFileSync(path.join(root, 'pages', 'index', 'index.js'), 'utf8')
const indexWxssSource = fs.readFileSync(path.join(root, 'pages', 'index', 'index.wxss'), 'utf8')
const detailJsSource = fs.readFileSync(path.join(root, 'pages', 'course', 'detail', 'detail.js'), 'utf8')
const detailWxssSource = fs.readFileSync(path.join(root, 'pages', 'course', 'detail', 'detail.wxss'), 'utf8')
const videoJsSource = fs.readFileSync(path.join(root, 'pages', 'course', 'video', 'video.js'), 'utf8')
const videoWxmlSource = fs.readFileSync(path.join(root, 'pages', 'course', 'video', 'video.wxml'), 'utf8')
const videoWxssSource = fs.readFileSync(path.join(root, 'pages', 'course', 'video', 'video.wxss'), 'utf8')
const examListJsSource = fs.readFileSync(path.join(root, 'pages', 'exam', 'list', 'list.js'), 'utf8')
const examListFilterSource = fs.readFileSync(path.join(root, 'pages', 'exam', 'list', 'filter.js'), 'utf8')
const examListWxssSource = fs.readFileSync(path.join(root, 'pages', 'exam', 'list', 'list.wxss'), 'utf8')
const practiceJsSource = fs.readFileSync(path.join(root, 'pages', 'exam', 'practice', 'practice.js'), 'utf8')
const practiceWxssSource = fs.readFileSync(path.join(root, 'pages', 'exam', 'practice', 'practice.wxss'), 'utf8')
const dictionarySearchJsSource = fs.readFileSync(path.join(root, 'pages', 'dictionary', 'search', 'search.js'), 'utf8')
const dictionarySearchWxssSource = fs.readFileSync(path.join(root, 'pages', 'dictionary', 'search', 'search.wxss'), 'utf8')
const dictionaryDetailJsSource = fs.readFileSync(path.join(root, 'pages', 'dictionary', 'detail', 'detail.js'), 'utf8')
const dictionaryDetailWxssSource = fs.readFileSync(path.join(root, 'pages', 'dictionary', 'detail', 'detail.wxss'), 'utf8')
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const appRoutes = new Set((appConfig.pages || []).map(page => `/${page}`))

const handlerNames = new Set()
const handlerPattern = /\b(?:bind|catch)[a-z]+=["']([A-Za-z_$][\w$]*)["']/g
let handlerMatch
while ((handlerMatch = handlerPattern.exec(indexWxmlSource)) !== null) {
  handlerNames.add(handlerMatch[1])
}
for (const handlerName of handlerNames) {
  assertSourcePattern(
    indexJsSource,
    new RegExp(`${escapeRegExp(handlerName)}\\s*:\\s*function\\s*\\(`),
    'pages/index/index.js',
    `WXML handler ${handlerName}`
  )
}

const navigatorPattern = /<navigator\b[^>]*\burl=["']([^"']+)["']/g
let navigatorMatch
while ((navigatorMatch = navigatorPattern.exec(indexWxmlSource)) !== null) {
  const route = navigatorMatch[1].split('?')[0]
  assert.ok(appRoutes.has(route), `pages/index/index.wxml: navigator route is not registered in app.json: ${route}`)
}

assertSourcePattern(indexJsSource, /contentMode:\s*'local-sample'/, 'pages/index/index.js', 'contentMode 默认值 local-sample')
assertSourcePattern(indexJsSource, /contentModeLabel:\s*'本地演示内容'/, 'pages/index/index.js', 'contentModeLabel 默认值 本地演示内容')
assertSourcePattern(indexJsSource, /displayDescription:\s*normalizedCourse\.description\s*\|\|\s*normalizedCourse\.subtitle\s*\|\|\s*'课程内容待完善'/, 'pages/index/index.js', '课程说明安全兜底')
assertSourcePattern(indexJsSource, /navigateToCourse:\s*function[\s\S]*?`\/pages\/course\/video\/video\?id=\$\{encodeURIComponent\(courseId\)\}&videoId=\$\{encodeURIComponent\(videoId\)\}`/, 'pages/index/index.js', '继续学习视频路径')
assertSourcePattern(indexJsSource, /`\/pages\/course\/detail\/detail\?id=\$\{courseId\}`/, 'pages/index/index.js', '普通课程详情路径')
assertSourcePattern(indexWxssSource, /\.page\s*\{[\s\S]*?padding:\s*40rpx\s+var\(--space-page\)/, 'pages/index/index.wxss', '页面边距令牌')
assertSourcePattern(indexWxssSource, /\.course-card\s*\{[\s\S]*?border-radius:\s*var\(--radius-card\)[\s\S]*?box-shadow:\s*var\(--shadow-card\)/, 'pages/index/index.wxss', '课程卡圆角和阴影')
assertSourcePattern(indexWxssSource, /\.category-scroll\s*\{[\s\S]*?width:\s*100%/, 'pages/index/index.wxss', '横向分类容器样式')
assertSourcePattern(indexWxssSource, /\.course-cover-wrap\s*\{[\s\S]*?padding-bottom:\s*56\.25%/, 'pages/index/index.wxss', '课程封面比例')
assertSourcePattern(indexWxssSource, /\.content-status\s*\{/, 'pages/index/index.wxss', '内容状态标签样式')
assertSourcePattern(indexWxssSource, /\.course-state-card\s*\{/, 'pages/index/index.wxss', '课程加载/错误/空状态卡样式')
assertSourceAbsent(indexWxmlSource, /立即购买/, 'pages/index/index.wxml', '立即购买')
assertSourceAbsent(indexWxmlSource, /class=["'][^"']*banner[^"']*["']|<swiper(?:\s|>)/, 'pages/index/index.wxml', '旧大面积宣传 Banner 入口')
assertSourcePattern(detailJsSource, /navigateToVideo:\s*function[\s\S]*?pages\/course\/video\/video\?id=/, 'pages/course/detail/detail.js', '详情到视频页导航')
assertSourcePattern(detailJsSource, /previewVideo:\s*function[\s\S]*?videoId=\$\{encodeURIComponent\(firstVideo\.id\)\}/, 'pages/course/detail/detail.js', '详情试听导航')
assertSourcePattern(detailJsSource, /contentModeLabel:\s*'[^']+'/, 'pages/course/detail/detail.js', '详情内容模式展示字段')
assertSourcePattern(detailJsSource, /courseStats:\s*\{/, 'pages/course/detail/detail.js', '详情课程统计展示字段')
assertSourcePattern(detailJsSource, /statusLabel:/, 'pages/course/detail/detail.js', '详情视频状态展示字段')
assertSourcePattern(videoJsSource, /statusLabel:/, 'pages/course/video/video.js', '视频状态展示字段')
assertSourcePattern(detailWxssSource, /\.course-cover-wrap\s*\{[\s\S]*?padding-bottom:\s*56\.25%/, 'pages/course/detail/detail.wxss', '详情封面 16:9')
assertSourcePattern(detailWxssSource, /\.chapter-section\s*\{/, 'pages/course/detail/detail.wxss', '详情章节卡片样式')
assertSourcePattern(detailWxssSource, /var\(--radius-card\)/, 'pages/course/detail/detail.wxss', '详情共享圆角令牌')
assertSourcePattern(videoWxssSource, /\.video-container\s*\{[\s\S]*?height:\s*0[\s\S]*?padding-bottom:\s*56\.25%/, 'pages/course/video/video.wxss', '播放器 16:9')
assertSourcePattern(videoWxssSource, /\.player-state\.error\s*\{/, 'pages/course/video/video.wxss', '播放器错误状态样式')
assertSourcePattern(videoWxssSource, /\.locked-state\s*\{/, 'pages/course/video/video.wxss', '视频锁定状态样式')
assertSourcePattern(videoWxssSource, /\.pending-state|\.player-state\.pending\s*\{/, 'pages/course/video/video.wxss', '媒体待接入状态样式')
assertSourcePattern(videoWxmlSource, /完整课程购买暂未开放/, 'pages/course/video/video.wxml', '未接支付时的明确提示')
assertSourceAbsent(videoWxmlSource, /立即购买/, 'pages/course/video/video.wxml', '无支付能力时的购买按钮')

const routedPages = [
  ['pages/exam/list/list', examListJsSource, examListWxssSource, '题库'],
  ['pages/exam/practice/practice', practiceJsSource, practiceWxssSource, '练习'],
  ['pages/dictionary/search/search', dictionarySearchJsSource, dictionarySearchWxssSource, '词典搜索'],
  ['pages/dictionary/detail/detail', dictionaryDetailJsSource, dictionaryDetailWxssSource, '词典详情']
]
for (const [route, jsSource, wxssSource, label] of routedPages) {
  assert.ok(appRoutes.has(`/${route}`), `${label}: route must be registered in app.json`)
  if (route === 'pages/dictionary/search/search') {
    assertSourcePattern(wxssSource, /padding:\s*20rpx 32rpx 40rpx/, `${route}.wxss`, '紧凑搜索边距')
    assertSourcePattern(wxssSource, /background:\s*#fff;/, `${route}.wxss`, '白底行式结果')
    assertSourcePattern(wxssSource, /color:\s*#ed625c;/, `${route}.wxss`, '珊瑚红操作')
    require('./test_dictionary_search_behavior')
    require('./test_dictionary_component_events')
  } else {
    assertSourcePattern(wxssSource, /var\(--space-page\)/, `${route}.wxss`, '页面间距共享令牌')
    assertSourcePattern(wxssSource, /var\(--color-page-bg\)/, `${route}.wxss`, '页面背景共享令牌')
    assertSourcePattern(wxssSource, /var\(--radius-card\)/, `${route}.wxss`, '卡片圆角共享令牌')
    assertSourcePattern(wxssSource, /var\(--shadow-card\)/, `${route}.wxss`, '卡片阴影共享令牌')
    assertSourcePattern(wxssSource, /var\(--color-(?:surface|error|loading|empty)/, `${route}.wxss`, '卡片或状态共享令牌')
  }
  const pageWxml = stripWxmlComments(fs.readFileSync(path.join(root, `${route}.wxml`), 'utf8'))
  const pageHandlerPattern = /\b(?:bind|catch):?[a-z]+=["']([A-Za-z_$][\w$]*)["']/g
  let pageHandlerMatch
  while ((pageHandlerMatch = pageHandlerPattern.exec(pageWxml)) !== null) {
    assertSourcePattern(
      jsSource,
      new RegExp(`${escapeRegExp(pageHandlerMatch[1])}\\s*:\\s*function\\s*\\(`),
      `${route}.js`,
      `WXML handler ${pageHandlerMatch[1]}`
    )
  }
}
assertSourcePattern(examListJsSource, /pages\/exam\/practice\/practice\?paperId=/, 'pages/exam/list/list.js', '题库到练习页路由')
assertSourcePattern(examListJsSource, /value: 'all'[\s\S]*?value: 'choice'[\s\S]*?value: 'text'/, 'pages/exam/list/list.js', '全部、选择题和填空题筛选项')
assertSourcePattern(examListFilterSource, /questionMode === 'choice'/, 'pages/exam/list/filter.js', '仅明确 choice mode 归类为选择题')
assertSourcePattern(dictionarySearchJsSource, /pages\/dictionary\/detail\/detail\?q=/, 'pages/dictionary/search/search.js', '搜索结果到词典详情路由')

console.log(`ui contract tests: PASS (${requiredTokens.length} tokens, ${pageContracts.length} page contracts)`)
