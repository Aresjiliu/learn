# 原生 UI 组件基线

## 已锁定依赖

- 运行组件：`@vant/weapp@1.11.7`，MIT，官方 npm integrity 见根目录 package-lock.json。
- 构建字体：开发依赖 `@vant/icons@3.0.1`，MIT；仅使用其已内嵌 WOFF2 字体，不在小程序运行时加载 Node 包。
- 不使用 Vue、TypeScript 业务工程、Taro、Uni-app 或第二套 UI 基础库。

## 安装和可复现构建

```powershell
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run build:ui
node scripts/test_ui_build_config.js
node scripts/test_ui_component_build.js
```

安装脚本关闭，不执行上游 prepare/upload。构建从官方发布物的 `lib/` 复制原生预编译运行文件，通过 JS/WXS require、组件 JSON、WXSS import 与 WXML 引用递归取依赖。当前入口 Search、Icon、Loading；后续实际需要 Tab 等时再扩展入口清单与测试。

输出：`D:/project/learn/miniprogram_npm/@vant/weapp/`，47 个运行/许可文件、94,242 字节，另有逐文件 SHA-256 构建清单。目录不提交 Git，克隆后先安装/构建；保留两份 MIT 许可证。相同输入重建产物清单一致。当前未承诺跨版本自动兼容，升级依赖必须审查构建解析规则与测试。

页面使用：

```json
{
    "usingComponents": {
        "van-search": "/miniprogram_npm/@vant/weapp/search/index",
        "van-icon": "/miniprogram_npm/@vant/weapp/icon/index",
        "van-loading": "/miniprogram_npm/@vant/weapp/loading/index"
    }
}
```

图标原 CSS 有远程字体，构建时只将 font-face 换为同版本官方 icons 包的内嵌 WOFF2，保留图标字符映射；生成文件不再引用远程字体。静态断网检查不替代 iOS/Android 冷启动实际渲染。

## 为什么不直接用 CLI build-npm

本机 CLI 1.06.2409140 提供 build-npm，但实跑会扫描已忽略的 `data/generated/wechat-tools/node_modules`，因旧 qrcode-terminal 八进制转义报错；配置手动 npm 映射后仍复现。没有修改旧依赖，也没有将 CLI 返回码0误当构建成功。

当前改用 Vant 官方 README 允许的预编译组件拷贝模式，增加可复现的依赖闭包和离线字体处理；不依赖 IDE 的嵌套包扫描。IDE npm 手动映射保留为意图配置，不声称该 CLI 已遵守映射。不要直接覆盖已处理字体的生成目录。

## 包体和验收边界

ui/、node_modules/、package.json、package-lock.json、导出数据、音视频及工具目录排除上传包；组件基线时预计运行包1.229MiB，M1接入后为180文件/1,296,815字节/1.237MiB，项目预算1.8MiB，由 `scripts/check_runtime_package.py` 门禁检查。这是本地文件估算，不是微信上传包实测。

本轮基线测试与产物检查不证明页面已接入组件、微信 WXML 已真实编译或 UI 视觉通过。搜索与详情按重建设计分片接入，并逐页补截图和原生事件验收。

### 后续本地原生语法编译证据

2026-10-18 已用本机工具内 `code/package.nw/node_modules/wcc-exec/wcc.exe` 编译 pages/、components/、miniprogram_npm/ 的全部 WXML/WXS，输出159,848字节，并确认包含新版搜索页、词条组件与Vant Search。WXSS编译器每次以一个样式为根、其余样式为导入依赖，25个根逐一通过；不能只把 app.wxss 编译通过说成全项目样式通过。输出均留 data/generated/。

工具核心版本为本机捆绑版本（WXML核心20211229、CLI20230804，WXSS核心20200724），不是微信完整应用运行或基础库3.17.4的真机验证。sandbox直接运行遇系统DLL重定位错误，允许本地进程权限后可执行；全程离线、未调用preview/upload。

自动化Tool.getInfo可达而App当前页/截图超时。系统PrintWindow可捕获真实开发工具画面，但当前首页截图不代表新版词典已视觉通过；多尺寸词典截图仍需补齐。
