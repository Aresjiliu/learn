const assert = require('assert')
const fs = require('fs')
const { component } = require('./test_media_player_session')

function loadService(path, names) {
    return new Function(fs.readFileSync(path, 'utf8').replace(/export\s*\{[\s\S]*?\}\s*$/, '') + '\nreturn {' + names + '}')()
}
const records = loadService('services/playback-progress.js', 'getPlaybackRecord,savePlaybackRecord,getRecentPlayback,getVideoProgress,saveVideoProgress,saveRecentVideo')
const playback = loadService('services/playback.js', 'shouldPersistProgress')
function harness(options = {}) {
    let definition
    const values = options.values || {}
    const reads = [], writes = [], toasts = [], sheets = [], commands = [], requests = []
    const boundary = { failRead: false, failWrite: false, hideCount: 0, writeAttempts: 0, now: 100000 }
    const wx = {
        getStorageSync(key) { reads.push(key); if (boundary.failRead) throw Error('read'); return values[key] },
        setStorageSync(key, value) { boundary.writeAttempts++; if (boundary.failWrite || (options.reject && options.reject(key, value))) throw Error('write'); values[key] = JSON.parse(JSON.stringify(value)); writes.push([key, value]) },
        hideLoading() { boundary.hideCount++ }, showLoading() {}, showToast(value) { toasts.push(value) },
        showActionSheet(value) { sheets.push(value) }
    }
    const preferences = fs.existsSync('services/playback-preferences.js')
        ? loadService('services/playback-preferences.js', 'getPlaybackPreferences,savePlaybackPreferences') : {}
    const env = { Page(value) { definition = value }, wx, Date: { now: () => boundary.now }, ...records, ...playback, ...preferences,
        getCourseDetail: options.getCourseDetail || (() => Promise.resolve({ code: 200, data: { course: { title: 'Course' }, hasPurchased: false, chapters: [{ videos: [{ id: 'A', url: 'a?token=ticket', isPreview: true }, { id: 'B', url: 'b', isPreview: true }] }] } })),
        config: { enableRemoteWrites: !!options.enableRemoteWrites }, request(value) { requests.push(value); return Promise.resolve({}) }, console }
    new Function(...Object.keys(env), fs.readFileSync('pages/course/video/video.js', 'utf8').replace(/^import .*$/gm, ''))(...Object.values(env))
    let mounted
    const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
        setData(value) { assert.ok(!this._isUnloaded, 'no setData after unload'); Object.assign(this.data, value) },
        selectComponent() { return options.player || (mounted && mounted.instance) } }
    const mountPlayer = () => {
        if (mounted) mounted.definition.lifetimes.detached.call(mounted.instance)
        mounted = component({ createVideoContext() { return {
            playbackRate(rate) { commands.push(['rate', rate]) },
            seek(position) { commands.push(['seek', position]) },
            pause() { commands.push(['pause']) }
        } } }, { sessionId: page.data.playerSessions[0].sessionId, desiredRate: page.data.desiredRate, autoNext: page.data.autoNext })
        const handlers = { autonextchange: 'onAutoNextChange', rateapplied: 'onRateApplied', controlerror: 'onControlError', play: 'onVideoPlay', timeupdate: 'onTimeUpdate', pause: 'onVideoPause', ended: 'onVideoEnd', error: 'onVideoError', waiting: 'onVideoBuffering', progress: 'onVideoProgress', fullscreenchange: 'onFullScreenChange', playbackratechange: 'onPlaybackRateChange' }
        mounted.instance.triggerEvent = (name, detail) => { if (handlers[name]) page[handlers[name]]({ detail }) }
        mounted.definition.lifetimes.ready.call(mounted.instance)
        return mounted
    }
    return { page, wx, values, reads, writes, toasts, sheets, commands, requests, boundary, mountPlayer }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
function event(page, detail = {}) {
    assert.ok(page.data.playerSessions && page.data.playerSessions.length === 1, 'selection must mount one keyed playback session')
    return { detail: { sessionId: page.data.playerSessions[0].sessionId, ...detail } }
}
function select(page, id, fields = {}) { page.switchVideo({ currentTarget: { dataset: { video: { id, url: id + '?token=ticket', isPreview: true, ...fields }, chapterIndex: 0 } } }) }
async function loaded(options) { const h = harness(options); h.page.onLoad({ id: 'C' }); await settle(); return h }

async function run() {
    const tests = []
    const test = (name, fn) => tests.push([name, fn])
    test('load has no writes; first play creates real recent even at zero', async () => {
        const h = await loaded(); assert.strictEqual(h.writes.length, 0)
        h.mountPlayer(); assert.strictEqual(h.writes.length, 0, 'ready only reapplies preferences and must not write storage')
        h.page.onVideoPlay(event(h.page)); assert.strictEqual(records.getRecentPlayback(h.wx).record.position, 0)
        assert.ok(!h.writes.some(([key]) => key.endsWith('_v1')))
    })
    test('local zero and numeric identity zero win over server; media URL untouched; read errors visible', () => {
        const h = harness(); h.page.data.courseId = 0
        records.savePlaybackRecord(h.wx, { courseId: 0, videoId: 0, position: 0, duration: 80 })
        const original = { id: 0, lastProgress: 42, url: 'https://media/?token=media-ticket' }
        assert.strictEqual(h.page.withLocalProgress(original).lastProgress, 0)
        assert.strictEqual(h.page.withLocalProgress(original).url, original.url)
        h.boundary.failRead = true
        assert.strictEqual(h.page.withLocalProgress(original).lastProgress, 42)
        assert.ok(h.page.data.recordError)
        assert.strictEqual(h.page.withLocalProgress({ id: 1, lastProgress: -5 }).lastProgress, 0)
    })
    test('switch saves A before B; immutable sessions reject A, retry same id and A-B-A', async () => {
        const h = await loaded(), p = h.page
        p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 14.6, duration: 80 }))
        const oldA = event(p, { currentTime: 70, duration: 80 })
        select(p, 'B'); assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 14.6)
        const before = JSON.stringify(p.data); p.onTimeUpdate(oldA); p.onVideoPlay(oldA); p.onVideoEnd(oldA); p.onVideoError(oldA)
        assert.strictEqual(JSON.stringify(p.data), before)
        select(p, 'A'); p.onTimeUpdate(oldA); assert.strictEqual(p.data.currentTime, 14.6)
        const prior = event(p); p.retryPlayback(); assert.notStrictEqual(event(p).detail.sessionId, prior.detail.sessionId)
        p.onVideoPlay(prior); assert.strictEqual(p.data.isPlaying, false)
        p.onVideoPlay({ detail: {} }); assert.strictEqual(p.data.isPlaying, false)
    })
    test('failed A survives successful B, retries old identity without stealing recent; marker only on success', async () => {
        let failA = true
        const h = await loaded({ reject(key, value) { return key === 'playback_records_v2' && failA && value.recent.videoId === 'A' } }), p = h.page
        p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 31, duration: 80 }))
        assert.strictEqual(p.data.lastSavedProgress, -1); assert.ok(p.data.saveError)
        select(p, 'B'); p.onVideoPlay(event(p)); assert.ok(p.data.saveError)
        failA = false; p.retrySaveProgress()
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 31)
        assert.strictEqual(records.getRecentPlayback(h.wx).record.videoId, 'B'); assert.strictEqual(p.data.saveError, '')
    })
    test('retry while storage fails restores latest in-memory snapshot instead of stale server position', async () => {
        const h = await loaded(), p = h.page
        p.onVideoPlay(event(p)); h.boundary.failWrite = true
        p.onTimeUpdate(event(p, { currentTime: 17, duration: 90 }))
        p.retryPlayback(); assert.strictEqual(p.data.currentTime, 17, 'failed save must not reset the retry to the older persisted position')
        p.onVideoPlay(event(p)); h.boundary.failWrite = false; p.retrySaveProgress()
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 17)
    })
    test('pending map stays bounded without dropping snapshots; retry frees capacity', async () => {
        const h = await loaded(), p = h.page; h.boundary.failWrite = true
        for (let index = 0; index < 40; index++) { select(p, 'v' + index); p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: index + 1, duration: 100 })) }
        assert.strictEqual(p._pending.size, 32)
        assert.strictEqual(p.data.currentVideo.id, 'v31', 'capacity keeps current playback instead of dropping failed history')
        const sessionId = event(p).detail.sessionId; p.retryPlayback()
        assert.notStrictEqual(event(p).detail.sessionId, sessionId, 'full pending map must still allow retry of the same identity')
        h.boundary.failWrite = false; p.retrySaveProgress(); assert.strictEqual(p._pending.size, 0)
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'v0').record.position, 1)
        select(p, 'new'); assert.strictEqual(p.data.currentVideo.id, 'new')
    })
    test('stale course responses and unload cannot mount a player or overwrite current response', async () => {
        const pending = []
        const h = harness({ getCourseDetail() { return new Promise(resolve => pending.push(resolve)) } }), p = h.page
        p.onLoad({ id: 'C' }); p.retryLoad()
        const response = id => ({ code: 200, data: { hasPurchased: false, chapters: [{ videos: [{ id, url: id, isPreview: true }] }] } })
        pending[1](response('new')); await settle(); pending[0](response('old')); await settle(); assert.strictEqual(p.data.currentVideo.id, 'new')
        p.retryLoad(); p.onUnload(); pending[2](response('after-unload')); await settle(); assert.strictEqual(p.data.currentVideo.id, 'new')
    })
    test('oversized optional titles are omitted without truncating source or losing identity/progress', async () => {
        const h = await loaded(), p = h.page
        const longTitle = '俄'.repeat(257)
        p.data.course = { title: longTitle }; select(p, 'long', { title: longTitle })
        p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 30, duration: 80 }))
        const saved = records.getPlaybackRecord(h.wx, 'C', 'long').record
        assert.strictEqual(saved.position, 30); assert.strictEqual(saved.courseId, 'C')
        assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'courseTitle'), 'overlong optional title must be omitted, not silently shortened')
        assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'videoTitle'))
        assert.strictEqual(p.data.course.title, longTitle); assert.strictEqual(p._session.videoTitle, longTitle)
        assert.strictEqual(p.data.currentVideo.title, longTitle)
    })
    test('course response received while hidden activates on show without creating a recent record', async () => {
        let resolve
        const h = harness({ getCourseDetail: () => new Promise(done => { resolve = done }) }), p = h.page
        p.onLoad({ id: 'C', videoId: 'target' }); p.onHide()
        resolve({ code: 200, data: { chapters: [{ videos: [{ id: 'target', url: 'target', isPreview: true }] }] } })
        await settle(); assert.strictEqual(h.writes.length, 0)
        p.onShow(); assert.strictEqual(p.data.currentVideo && p.data.currentVideo.id, 'target', 'returning to pending course response must activate the selected player')
        assert.ok(p.data.playerSessions.length === 1); assert.strictEqual(h.writes.length, 0)
    })
    test('numeric zero video route selects its own playable media', async () => {
        const h = harness({ getCourseDetail: () => Promise.resolve({ code: 200, data: { chapters: [{ videos: [
            { id: 'first', url: 'first', isPreview: true }, { id: 0, url: 'zero', isPreview: true }
        ] }] } }) })
        h.page.onLoad({ id: 0, videoId: 0 }); await settle()
        assert.strictEqual(h.page.data.currentVideo.id, 0)
    })
    test('pause hide unload save latest including zero, hidden events rejected and no setData after unload', async () => {
        const h = await loaded(), p = h.page
        p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 12, duration: 80 })); p.onVideoPause(event(p))
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 12)
        p.onTimeUpdate(event(p, { currentTime: 0, duration: 80 })); const old = event(p, { currentTime: 60, duration: 80 }); p.onHide()
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 0)
        p.onTimeUpdate(old); assert.strictEqual(p.data.currentTime, 0)
        p.onShow(); p.onTimeUpdate(event(p, { currentTime: 7, duration: 80 })); p.onUnload(); p.onTimeUpdate(old); p.onVideoPlay(old)
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 7)
    })
    test('checkpoint writes once, invalid media numbers ignored, seek never fakes progress or blocks later checkpoint', async () => {
        const h = await loaded(), p = h.page; h.mountPlayer(); p.onVideoPlay(event(p))
        const n = h.writes.length; p.onTimeUpdate(event(p, { currentTime: 30, duration: 80 })); assert.strictEqual(h.writes.length, n + 1)
        p.onTimeUpdate(event(p, { currentTime: NaN, duration: Infinity })); assert.strictEqual(p.data.currentTime, 30)
        p.rewindTenSeconds(); assert.deepStrictEqual(h.commands.pop(), ['seek', 20]); assert.strictEqual(p.data.currentTime, 30)
        p.onVideoSeek(event(p)); p.onTimeUpdate(event(p, { currentTime: 60, duration: 80 })); assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 60)
        p.onTimeUpdate(event(p, { currentTime: 4, duration: 80 })); p.rewindTenSeconds(); assert.deepStrictEqual(h.commands.pop(), ['seek', 0])
    })
    test('error terminates the instance; queued media events cannot revive it before explicit retry', async () => {
        const h = await loaded(), p = h.page
        p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 12, duration: 80 }))
        const old = event(p, { currentTime: 60, duration: 80, rate: 2 })
        p.onVideoError(old)
        const state = JSON.stringify(p.data), writes = h.writes.length
        for (const handler of ['onVideoPlay', 'onTimeUpdate', 'onVideoEnd', 'onRateApplied', 'onVideoBuffering', 'onVideoPause']) p[handler](old)
        assert.strictEqual(JSON.stringify(p.data), state, 'queued events must not clear the error or change selection/progress')
        assert.strictEqual(h.writes.length, writes)
        assert.strictEqual(p.data.playerSessions.length, 0)
        p.onHide(); p.onShow(); assert.ok(p.data.playbackError, 'returning does not implicitly retry failed media')
        p.retryPlayback(); assert.notStrictEqual(event(p).detail.sessionId, old.detail.sessionId)
        assert.strictEqual(p.data.currentTime, 12)
        p.onVideoPlay(event(p)); assert.strictEqual(p.data.isPlaying, true)
    })
    test('hide/show renews media identity; queued ended cannot complete A or autoplay B', async () => {
        const h = await loaded(), p = h.page
        p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 12, duration: 80 }))
        p.toggleAutoNext({ detail: { value: true } })
        const old = event(p, { currentTime: 70, duration: 80 })
        p.onHide(); assert.strictEqual(p.data.playerSessions.length, 0)
        p.onShow(); assert.notStrictEqual(event(p).detail.sessionId, old.detail.sessionId)
        const state = JSON.stringify(p.data), writes = h.writes.length
        for (const handler of ['onVideoEnd', 'onVideoPlay', 'onTimeUpdate', 'onVideoError']) p[handler](old)
        assert.strictEqual(JSON.stringify(p.data), state)
        assert.strictEqual(h.writes.length, writes)
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 12)
        assert.strictEqual(p.data.currentVideo.id, 'A'); assert.strictEqual(p.data.currentTime, 12)
        p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 20, duration: 80 }))
        p.onVideoPause(event(p)); assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 20)
    })
    test('failed checkpoints are limited while memory stays latest and explicit saves remain immediate', async () => {
        const h = await loaded(), p = h.page
        p.onVideoPlay(event(p)); h.boundary.failWrite = true
        const before = h.boundary.writeAttempts
        for (let index = 0; index < 40; index++) {
            h.boundary.now = 100000 + index * 250
            p.onTimeUpdate(event(p, { currentTime: 30 + index / 4, duration: 80 }))
        }
        assert.strictEqual(h.boundary.writeAttempts - before, 2, 'failed automatic saves retry at most once per 5 seconds')
        assert.strictEqual(p._pending.get(JSON.stringify(['C', 'A'])).position, 39.75)
        assert.strictEqual(p.data.lastSavedProgress, 0, 'attempt clock must not masquerade as successful progress')
        p.onVideoPause(event(p)); assert.strictEqual(h.boundary.writeAttempts - before, 3)
        h.boundary.failWrite = false; p.retrySaveProgress()
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 39.75)
        assert.strictEqual(p._pending.size, 0)
    })
    for (const recovery of ['foreground', 'error-retry']) {
        for (const position of [42, 0]) {
            test(`${recovery} retains latest memory position ${position} when the saved snapshot cannot be read`, async () => {
                const h = await loaded(), p = h.page
                p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 42, duration: 80 }))
                p.onTimeUpdate(event(p, { currentTime: position, duration: 80 }))
                const old = event(p)
                if (recovery === 'foreground') p.onHide()
                else p.onVideoError(old)
                assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, position)
                assert.strictEqual(p._pending.size, 0, 'successful save must not leave a pending failure')
                h.boundary.failRead = true
                if (recovery === 'foreground') p.onShow()
                else p.retryPlayback()
                assert.strictEqual(p.data.currentTime, position, 'read failure must not rewind to the stale source progress')
                assert.ok(p.data.recordError)
                assert.notStrictEqual(event(p).detail.sessionId, old.detail.sessionId)
                h.boundary.failRead = false; p.onVideoPlay(event(p))
                assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, position, 'first play must not overwrite the saved position with a fallback zero')
            })
        }
    }
    test('rates use five native choices; only matching applied/native events change label, late callbacks rejected', async () => {
        const h = await loaded(), p = h.page
        h.mountPlayer()
        p.choosePlaybackRate(); assert.strictEqual(h.sheets[0].itemList.length, 5)
        h.sheets[0].success({ tapIndex: 3 }); assert.deepStrictEqual(h.commands.pop(), ['rate', 1.5]); assert.strictEqual(p.data.playbackRate, 1.5)
        p.onRateApplied(event(p, { rate: 1.5 })); assert.strictEqual(p.data.playbackRate, 1.5)
        p.onPlaybackRateChange(event(p, {})); p.onPlaybackRateChange(event(p, { rate: NaN })); assert.strictEqual(p.data.playbackRate, 1.5)
        p.onPlaybackRateChange(event(p, { playbackRate: 2 })); assert.strictEqual(p.data.playbackRate, 2)
        p.choosePlaybackRate(); select(p, 'B'); h.mountPlayer(); const n = h.commands.length; h.sheets[1].success({ tapIndex: 4 }); assert.strictEqual(h.commands.length, n)
        p.choosePlaybackRate(); p.onUnload(); const afterUnload = h.commands.length; h.sheets[2].success({ tapIndex: 4 }); assert.strictEqual(h.commands.length, afterUnload)
    })
    test('real component events keep original identity after property mutation, rebuild/retry and detach', async () => {
        const h = await loaded(), p = h.page
        const old = h.mountPlayer()
        old.instance.onPlay({ detail: {} }); old.instance.onTimeUpdate({ detail: { currentTime: 16, duration: 80 } })
        select(p, 'B'); old.instance.properties.sessionId = event(p).detail.sessionId
        const before = JSON.stringify(p.data)
        for (const method of ['onPlay', 'onPause', 'onTimeUpdate', 'onEnded', 'onWaiting', 'onError', 'onFullscreenChange', 'onPlaybackRateChange', 'onProgress']) old.instance[method]({ detail: { currentTime: 76, duration: 80, playbackRate: 2, fullScreen: true, buffered: 80 } })
        assert.strictEqual(JSON.stringify(p.data), before, 'mutating component properties cannot relabel old native events')
        h.mountPlayer(); select(p, 'A'); const a = h.mountPlayer(); p.retryPlayback(); const afterRetry = JSON.stringify(p.data)
        a.instance.onTimeUpdate({ detail: { currentTime: 75, duration: 80 } }); assert.strictEqual(JSON.stringify(p.data), afterRetry)
        const retried = h.mountPlayer(); retried.instance.onPlay({ detail: {} }); assert.strictEqual(p.data.isPlaying, true)
        p.onHide(); const hidden = JSON.stringify(p.data); retried.instance.onPlay({ detail: {} }); assert.strictEqual(JSON.stringify(p.data), hidden)
        p.onUnload(); retried.definition.lifetimes.detached.call(retried.instance); retried.instance.onPlay({ detail: {} })
    })
    test('unsupported native commands report failure; saved rate reapplies on rebuilt player', async () => {
        const h = await loaded({ values: { playback_preferences_v1: { version: 1, rate: 1.25, autoNext: false } } }), p = h.page
        const mounted = h.mountPlayer(); assert.deepStrictEqual(h.commands.pop(), ['rate', 1.25]); assert.strictEqual(p.data.playbackRate, 1.25)
        mounted.instance._videoContext = {}; p.choosePlaybackRate(); h.sheets[0].success({ tapIndex: 4 })
        assert.strictEqual(p.data.playbackRate, 1.25); assert.strictEqual(p.data.desiredRate, 1.25); assert.ok(p.data.controlError)
        const before = p.data.currentTime; p.rewindTenSeconds(); assert.strictEqual(p.data.currentTime, before); assert.ok(p.data.controlError)
        p.retryPlayback(); h.mountPlayer(); assert.deepStrictEqual(h.commands.pop(), ['rate', 1.25])
    })
    for (const mode of ['fallback-success', 'both-throw', 'missing-method']) {
        test('rate failure preserves last applied state unless fallback is applied: ' + mode, async () => {
            const h = await loaded(), p = h.page, mounted = h.mountPlayer()
            p.choosePlaybackRate(); h.sheets[0].success({ tapIndex: 3 })
            assert.strictEqual(p.data.playbackRate, 1.5)
            assert.strictEqual(h.values.playback_preferences_v1.rate, 1.5)
            const before = h.writes.length
            const attempts = []
            mounted.instance._videoContext = mode === 'missing-method' ? {} : { playbackRate(rate) {
                attempts.push(rate)
                if (rate === 2 || mode === 'both-throw') throw Error('unsupported')
            } }
            p.choosePlaybackRate(); h.sheets[1].success({ tapIndex: 4 })
            const expected = mode === 'fallback-success' ? 1 : 1.5
            assert.strictEqual(p.data.playbackRate, expected, 'label reflects last successful native command')
            assert.strictEqual(p.data.desiredRate, expected)
            assert.strictEqual(mounted.instance._desiredRate, expected)
            assert.strictEqual(h.values.playback_preferences_v1.rate, expected)
            assert.strictEqual(h.writes.length - before, mode === 'fallback-success' ? 1 : 0, 'failed calls do not write a false preference')
            assert.ok(p.data.controlError)
            assert.deepStrictEqual(attempts, mode === 'missing-method' ? [] : [2, 1])
        })
    }
    test('rate menu opened before hide/show cannot act on the replacement session', async () => {
        const h = await loaded(), p = h.page; h.mountPlayer()
        const sessionId = event(p).detail.sessionId
        p.choosePlaybackRate(); p.onHide(); p.onShow()
        assert.notStrictEqual(event(p).detail.sessionId, sessionId)
        const before = { commands: h.commands.length, writes: h.writes.length }
        h.sheets[0].success({ tapIndex: 4 })
        assert.strictEqual(h.commands.length, before.commands, 'hidden menu callback must not call native rate')
        assert.strictEqual(h.writes.length, before.writes, 'hidden menu callback must not change preferences')
        assert.strictEqual(p.data.playbackRate, 1)
    })
    test('newer rate menu wins; reload invalidates an outstanding menu without waiting for a new session', async () => {
        const h = await loaded(), p = h.page; h.mountPlayer()
        p.choosePlaybackRate(); p.choosePlaybackRate()
        const before = { commands: h.commands.length, writes: h.writes.length }
        h.sheets[0].success({ tapIndex: 4 })
        assert.strictEqual(h.commands.length, before.commands)
        assert.strictEqual(h.writes.length, before.writes)
        h.sheets[1].success({ tapIndex: 3 })
        assert.deepStrictEqual(h.commands[h.commands.length - 1], ['rate', 1.5])
        assert.strictEqual(p.data.playbackRate, 1.5); assert.strictEqual(h.values.playback_preferences_v1.rate, 1.5)
        p.choosePlaybackRate(); p.retryLoad()
        const afterReload = { commands: h.commands.length, writes: h.writes.length }
        h.sheets[2].success({ tapIndex: 4 })
        assert.strictEqual(h.commands.length, afterReload.commands)
        assert.strictEqual(h.writes.length, afterReload.writes)
        await settle()
    })
    test('preferences read exceptions default, whitelist writes, no fake duration at ended', async () => {
        const h = harness(); h.boundary.failRead = true; h.page.onLoad({ id: 0 }); await settle()
        const p = h.page; assert.strictEqual(p.data.autoNext, false); assert.strictEqual(p.data.desiredRate, 1); assert.ok(p.data.recordError)
        p.onVideoPlay(event(p)); p.onVideoEnd(event(p)); assert.strictEqual(p.data.duration, 0); assert.strictEqual(p.data.isPlaying, false)
        h.boundary.failRead = false; p.toggleAutoNext({ detail: { value: true } })
        assert.deepStrictEqual(Object.keys(h.values.playback_preferences_v1).sort(), ['autoNext', 'rate', 'version'])
        const position = p.data.currentTime
        for (const currentTime of [-1, '3', undefined, Infinity]) p.onTimeUpdate(event(p, { currentTime, duration: 100 }))
        assert.strictEqual(p.data.currentTime, position)
    })
    test('buffering recovers on advancing timeupdate without another play; old or invalid events cannot clear loading', async () => {
        const h = await loaded(), p = h.page
        p.onVideoPlay(event(p)); p.onTimeUpdate(event(p, { currentTime: 10, duration: 80 }))
        p.onVideoBuffering(event(p))
        const waiting = h.boundary.hideCount
        p.onTimeUpdate(event(p, { currentTime: NaN, duration: 80 }))
        p.onTimeUpdate(event(p, { currentTime: 10, duration: 80 }))
        assert.strictEqual(h.boundary.hideCount, waiting, 'invalid and stationary times do not confirm recovery')
        p.onTimeUpdate(event(p, { currentTime: 11, duration: 80 }))
        assert.strictEqual(h.boundary.hideCount, waiting + 1, 'advancing native position clears buffering without a second play')
        p.onTimeUpdate(event(p, { currentTime: 12, duration: 80 }))
        assert.strictEqual(h.boundary.hideCount, waiting + 1, 'normal updates do not repeatedly hide global loading')
        const old = event(p, { currentTime: 70, duration: 80 })
        select(p, 'B'); p.onVideoPlay(event(p)); p.onVideoBuffering(event(p))
        const nextWaiting = h.boundary.hideCount
        p.onTimeUpdate(old); assert.strictEqual(h.boundary.hideCount, nextWaiting, 'old A must not clear the B loader')
        p.onTimeUpdate(event(p, { currentTime: 1, duration: 80 }))
        assert.strictEqual(h.boundary.hideCount, nextWaiting + 1)
    })
    test('autonext defaults false and respects access; ended stops and saves valid duration; play also clears buffering', async () => {
        const h = await loaded(), p = h.page; assert.strictEqual(p.data.autoNext, false)
        p.onVideoPlay(event(p)); p.onVideoBuffering(event(p)); p.onVideoPlay(event(p)); assert.ok(h.boundary.hideCount)
        p.onTimeUpdate(event(p, { currentTime: 35, duration: 80 })); p.onVideoEnd(event(p))
        assert.strictEqual(p.data.isPlaying, false); assert.strictEqual(p.data.currentVideo.id, 'A'); assert.strictEqual(p.data.nextVideo.id, 'B')
        assert.strictEqual(records.getPlaybackRecord(h.wx, 'C', 'A').record.position, 80)
        p.toggleAutoNext({ detail: { value: true } }); p.onVideoEnd(event(p)); assert.strictEqual(p.data.currentVideo.id, 'B')
        p.data.chapters = [{ videos: [p.data.currentVideo, { id: 'locked', url: 'x', isPreview: false }] }]; p.onVideoEnd(event(p)); assert.strictEqual(p.data.currentVideo.id, 'B')
    })
    test('preferences default on corrupt/read error, write failure visible and current controls continue', async () => {
        const h = await loaded({ values: { playback_preferences_v1: { version: 99, rate: 2, autoNext: true } } }), p = h.page
        assert.strictEqual(p.data.desiredRate, 1); assert.strictEqual(p.data.autoNext, false)
        h.boundary.failWrite = true; p.toggleAutoNext({ detail: { value: true } }); assert.strictEqual(p.data.autoNext, true); assert.ok(h.toasts.length)
        p.onControlError(event(p, { command: 'rate' })); assert.ok(p.data.controlError)
        const q = await loaded({ values: { playback_preferences_v1: { version: 1, rate: 1.25, autoNext: true, token: 'discard' } } })
        assert.strictEqual(q.page.data.desiredRate, 1.25); assert.strictEqual(q.page.data.autoNext, true)
    })
    test('view mounts keyed immutable node, integrated controls and white navigation', () => {
        const wxml = fs.readFileSync('pages/course/video/video.wxml', 'utf8')
        assert.match(wxml, /<media-player[^>]*wx:for="\{\{playerSessions\}\}"[^>]*wx:key="sessionId"/)
        assert.ok(wxml.includes('session-id="{{item.sessionId}}"'))
        for (const binding of ['bindrateapplied="onRateApplied"', 'bindcontrolerror="onControlError"', 'auto-next="{{autoNext}}"', 'bindautonextchange="onAutoNextChange"', 'bindtap="retrySaveProgress"']) assert.ok(wxml.includes(binding), binding)
        assert.ok(!wxml.includes('class="learning-controls"'), 'learning controls belong inside the player, not a second page toolbar')
        const config = JSON.parse(fs.readFileSync('pages/course/video/video.json', 'utf8'))
        assert.strictEqual(config.navigationBarBackgroundColor, '#ffffff'); assert.strictEqual(config.navigationBarTextStyle, 'black')
    })
    test('locked rows retain readable text without group opacity', () => {
        const styles = fs.readFileSync('pages/course/video/video.wxss', 'utf8')
        for (const selector of ['.video-item.locked', '.video-item.locked-state']) {
            const block = styles.slice(styles.indexOf(selector + ' {')).split('}')[0]
            assert.ok(!block.includes('opacity:'), selector + ' must not reduce the contrast of its text children')
        }
        assert.match(styles, /\.video-status\.locked-state\s*\{[^}]*background:/)
        assert.match(styles, /\.locked-state\s*\{[^}]*color:\s*var\(--color-locked\)/)
    })
    let failed = 0
    for (const [name, fn] of tests) { try { await fn(); console.log('PASS ' + name) } catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.stack) } }
    console.log(`video learning controls: ${tests.length - failed}/${tests.length} passed`)
    if (failed) process.exitCode = 1
}
if (require.main === module) run()
module.exports = { harness, records, event, select, loaded, settle, loadService }
