const assert = require('assert')
const fs = require('fs')
const { loaded, event, select } = require('./test_video_learning_controls')

async function run() {
    const h = await loaded(), page = h.page
    assert.strictEqual(page.data.autoNext, false)
    page.onAutoNextChange(event(page, { value: true }))
    assert.strictEqual(page.data.autoNext, true)

    const integrated = await loaded(), live = integrated.page
    const mounted = integrated.mountPlayer()
    mounted.instance.onToggleAutoNext()
    assert.strictEqual(live.data.autoNext, true, 'actual component event reaches page and persists preference')
    assert.strictEqual(integrated.values.playback_preferences_v1.autoNext, true)
    mounted.instance.properties.autoNext = live.data.autoNext // simulate WeChat property binding
    mounted.instance.onToggleAutoNext()
    assert.strictEqual(live.data.autoNext, false)
    const oldMounted = mounted.instance
    select(live, 'B')
    oldMounted.properties.autoNext = false // old intent must differ from the current false value
    const liveWrites = integrated.writes.length
    const liveStorage = JSON.stringify(integrated.values)
    oldMounted.onToggleAutoNext()
    assert.strictEqual(live.data.autoNext, false, 'old actual component cannot change the new playback preference')
    assert.strictEqual(integrated.writes.length, liveWrites, 'old actual component cannot write preferences')
    assert.strictEqual(JSON.stringify(integrated.values), liveStorage)
    mounted.definition.lifetimes.detached.call(oldMounted)
    oldMounted.onToggleAutoNext()
    assert.strictEqual(live.data.autoNext, false, 'detached actual component is inert')
    assert.strictEqual(integrated.writes.length, liveWrites)
    assert.strictEqual(JSON.stringify(integrated.values), liveStorage)
    live.onUnload()
    assert.strictEqual(h.values.playback_preferences_v1.autoNext, true)
    const writes = h.writes.length
    for (const value of [1, 'false', null, undefined]) page.onAutoNextChange(event(page, { value }))
    assert.strictEqual(h.writes.length, writes, 'invalid booleans do not persist')

    const old = event(page, { value: false })
    select(page, 'B')
    page.onAutoNextChange(old)
    page.onAutoNextChange({ detail: { value: false } })
    assert.strictEqual(page.data.autoNext, true, 'old or absent session cannot change preferences')
    page.onAutoNextChange(event(page, { value: false }))
    assert.strictEqual(page.data.autoNext, false)
    const hidden = event(page, { value: true })
    page.onHide(); page.onAutoNextChange(hidden); page.onShow(); page.onAutoNextChange(hidden)
    assert.strictEqual(page.data.autoNext, false, 'hidden and old pre-hide instances are inert')
    h.boundary.failWrite = true
    page.onAutoNextChange(event(page, { value: true }))
    assert.strictEqual(page.data.autoNext, true, 'current preference works even if persistence fails')
    assert.strictEqual(h.values.playback_preferences_v1.autoNext, false, 'failed writes never claim persistence')
    assert.ok(h.toasts.some(item => item.title.includes('未保存')))
    const beforeUnload = event(page, { value: false })
    page.onUnload(); page.onAutoNextChange(beforeUnload)
    assert.strictEqual(page.data.autoNext, true)

    const template = fs.readFileSync('pages/course/video/video.wxml', 'utf8')
    assert.ok(template.includes('auto-next="{{autoNext}}"'))
    assert.ok(template.includes('bindautonextchange="onAutoNextChange"'))
    assert.ok(!template.includes('class="learning-controls"'), 'no separate toolbar below the video')
    assert.ok(!template.includes('bindtap="choosePlaybackRate"'), 'new controls must not open a page ActionSheet')
    assert.ok(template.includes('bindtap="retrySaveProgress"'), 'save failures remain recoverable')
    const styles = fs.readFileSync('pages/course/video/video.wxss', 'utf8')
    assert.ok(!/\.player-state\s+button|\.availability-notice\s+text/.test(styles), 'component-safe page styles must target business classes, not native tag selectors')
    assert.ok(!/^page\s*\{/m.test(styles), 'video page container already supplies the background; avoid propagated page tag rules')
    console.log('integrated player page: PASS (session guards, real preferences, failure/unload and in-player wiring)')
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { run }
