// Local-only DevTools smoke test. Requires CLI auto --auto-port 9420 and the indexed API.
const assert = require('assert')
const path = require('path')
const automator = require(path.resolve(process.env.WECHAT_AUTOMATOR_MODULE || 'data/generated/wechat-tools/node_modules/miniprogram-automator'))

async function waitForData(page, predicate, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const data = await page.data()
        if (predicate(data)) return data
        await new Promise(resolve => setTimeout(resolve, 150))
    }
    throw new Error('Timed out waiting for dictionary page state')
}

;(async () => {
    let stage = 'connect'
    const timeout = setTimeout(() => { console.error('DevTools smoke timed out at: ' + stage); process.exit(1) }, 45000)
    let miniProgram
    const exceptions = []
    const consoleErrors = []
    const mark = value => { stage = value; console.log('[devtools] ' + stage) }
    try {
        miniProgram = await automator.connect({ wsEndpoint: process.env.WECHAT_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' })
        miniProgram.on('exception', error => exceptions.push(error))
        miniProgram.on('console', message => {
            if (message.level === 'error' || message.type === 'error') consoleErrors.push(message)
        })
        mark('systemInfo')
        const system = await miniProgram.systemInfo()
        mark('open search')
        const search = await miniProgram.reLaunch('/pages/dictionary/search/search?q=' + encodeURIComponent('привет'))
        mark('wait search results')
        const searchData = await waitForData(search, data => !data.loading && data.searched)
        assert.strictEqual(searchData.loadError, '')
        assert.strictEqual(searchData.sampleNotice, false)
        assert.ok(searchData.words.length > 0)
        const selectedId = searchData.words[0].entryId
        assert.ok(selectedId.startsWith('dict:'))
        const searchImage = path.resolve('data/generated/devtools-dictionary-search.png')
        mark('search screenshot')
        await miniProgram.screenshot({ path: searchImage })
        const first = await search.$('.word-card')
        assert.ok(first, 'compiled search WXML must render a result card')
        await first.tap()
        mark('open detail')
        const detail = await miniProgram.currentPage()
        assert.strictEqual(detail.path, 'pages/dictionary/detail/detail')
        const detailData = await waitForData(detail, data => !data.loading)
        assert.strictEqual(detailData.loadError, '')
        assert.strictEqual(detailData.word.id, selectedId)
        const detailImage = path.resolve('data/generated/devtools-dictionary-detail.png')
        await miniProgram.screenshot({ path: detailImage })
        assert.strictEqual(exceptions.length, 0, JSON.stringify(exceptions))
        assert.strictEqual(consoleErrors.length, 0, JSON.stringify(consoleErrors))
        console.log(JSON.stringify({ status: 'pass', model: system.model,
            windowWidth: system.windowWidth, windowHeight: system.windowHeight,
            resultCount: searchData.words.length, selectedId, consoleErrors,
            screenshots: [searchImage, detailImage] }))
    } finally {
        clearTimeout(timeout)
        if (miniProgram) await miniProgram.disconnect()
    }
})().catch(error => { console.error(error); process.exitCode = 1 })
