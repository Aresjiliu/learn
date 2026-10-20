const assert = require('assert')
const fs = require('fs')

let passed = 0
function test(name, action) {
    if (process.argv[2] && !name.includes(process.argv[2])) return
    try { action(); passed++; console.log('PASS ' + name) }
    catch (error) { console.error('FAIL ' + name); throw error }
}

function player(properties = {}, broken = {}) {
    let definition
    const calls = []
    const events = []
    const timers = new Map()
    const rects = []
    let nextTimer = 0
    let instance
    const context = {}
    for (const name of ['play', 'pause', 'seek', 'playbackRate', 'requestFullScreen', 'exitFullScreen']) {
        context[name] = (...args) => {
            calls.push([name, ...args])
            if (broken[name]) throw Error('native failed')
        }
    }
    const wx = {
        createVideoContext(id, scope) { assert.strictEqual(scope, instance); return context },
        createSelectorQuery() {
            return { in(scope) { assert.strictEqual(scope, instance); return this },
                select(selector) { assert.strictEqual(selector, '.media-player__track'); return this },
                boundingClientRect(callback) { rects.push(callback); return this }, exec() {} }
        }
    }
    new Function('Component', 'wx', 'setTimeout', 'clearTimeout', fs.readFileSync('components/media-player/media-player.js', 'utf8'))(
        value => { definition = value }, wx,
        (callback, delay) => {
            assert.strictEqual(delay, 3000)
            const id = ++nextTimer
            timers.set(id, () => { timers.delete(id); callback() })
            return id
        },
        id => timers.delete(id))
    const defaults = Object.fromEntries(Object.entries(definition.properties).map(([key, value]) => [key, value.value]))
    instance = { ...definition.methods, properties: { ...defaults, sessionId: 'session-A', ...properties },
        data: JSON.parse(JSON.stringify(definition.data || {})),
        setData(update) { Object.assign(this.data, update) },
        triggerEvent(name, detail) { events.push({ name, detail }) } }
    definition.lifetimes.attached.call(instance)
    definition.lifetimes.ready.call(instance)
    return { instance, definition, calls, events, timers, rects,
        detach() { definition.lifetimes.detached.call(instance) } }
}
const time = (item, currentTime, duration) => item.instance.onTimeUpdate({ detail: { currentTime, duration } })
const touch = (identifier, clientX) => ({ touches: [{ identifier, clientX }], changedTouches: [{ identifier, clientX }] })

test('custom controls live inside the native video with native controls disabled', () => {
    const wxml = fs.readFileSync('components/media-player/media-player.wxml', 'utf8')
    assert.ok(wxml.includes('controls="{{false}}"'), 'native controls must be disabled')
    assert.ok(wxml.indexOf('<cover-view') > wxml.indexOf('<video'))
    assert.ok(wxml.lastIndexOf('</cover-view>') < wxml.indexOf('</video>'))
    assert.ok(wxml.includes('wx:if="{{controls}}"'))
    assert.ok(wxml.includes('autoNext'))
    assert.ok(!wxml.includes('slider'))
})
test('cover-view track contains its thumb without unsupported visible overflow', () => {
    const css = fs.readFileSync('components/media-player/media-player.wxss', 'utf8')
    assert.ok(!/overflow(?:-[xy])?\s*:\s*visible/.test(css))
    const track = css.match(/\.media-player__track\s*\{([^}]+)\}/)[1]
    assert.ok(/height:\s*22rpx/.test(track), 'track box contains the full 22rpx thumb')
})
test('relative seeks use observed position and clamp without faking timeupdate', () => {
    const p = player(); time(p, 7, 80)
    p.instance.onRewind(); p.instance.onForward()
    assert.deepStrictEqual(p.calls.filter(c => c[0] === 'seek'), [['seek', 0], ['seek', 17]])
    assert.strictEqual(p.instance.data.position, 7)
    time(p, 77, 80); p.instance.onForward()
    assert.deepStrictEqual(p.calls[p.calls.length - 1], ['seek', 80])
})
test('unknown and invalid duration disable forward and percentage seeking', () => {
    for (const duration of [undefined, NaN, Infinity, 0, -1, '80']) {
        const p = player(); time(p, 7, duration)
        p.instance.onForward(); p.instance.onScrubStart(touch(1, 30))
        assert.strictEqual(p.rects.length, 0)
        assert.ok(!p.calls.some(c => c[0] === 'seek'))
        p.instance.onRewind()
        assert.deepStrictEqual(p.calls[p.calls.length - 1], ['seek', 0])
    }
})
test('only timeupdate establishes position; invalid position cannot issue relative seeks', () => {
    const p = player(); time(p, 7, 80)
    p.instance.onSeek({ detail: { currentTime: 50 } })
    p.instance.onSeekComplete({ detail: { currentTime: 60 } })
    p.instance.onForward()
    assert.deepStrictEqual(p.calls[p.calls.length - 1], ['seek', 17])
    time(p, NaN, 80); const before = p.calls.length
    p.instance.onForward(); p.instance.onRewind()
    assert.strictEqual(p.calls.length, before)
})
test('drag previews then seeks once on end and uses latest matching touch', () => {
    const p = player(); time(p, 7, 80)
    p.instance.onScrubStart(touch(4, 20))
    p.instance.onScrubMove(touch(4, 70))
    p.rects[0]({ left: 10, width: 100 })
    assert.strictEqual(p.instance.data.previewPosition, 48)
    assert.ok(!p.calls.some(c => c[0] === 'seek'))
    p.instance.onScrubEnd(touch(4, 110))
    assert.deepStrictEqual(p.calls[p.calls.length - 1], ['seek', 80])
    assert.strictEqual(p.instance.data.position, 7)
})
test('cancel, ended touches, old measurement generations and foreign touch IDs cannot seek', () => {
    const p = player(); time(p, 7, 80)
    p.instance.onScrubStart(touch(1, 20)); p.instance.onScrubCancel(touch(1, 20))
    p.instance.onScrubStart(touch(2, 30)); p.rects[0]({ left: 0, width: 100 })
    assert.strictEqual(p.instance.data.previewPosition, 7)
    p.rects[1]({ left: 0, width: 100 })
    p.instance.onScrubEnd(touch(3, 100))
    assert.ok(!p.calls.some(c => c[0] === 'seek'))
    p.instance.onScrubCancel(touch(2, 30))
    p.instance.onScrubStart(touch(5, 50)); p.instance.onScrubEnd(touch(5, 70))
    p.rects[2]({ left: 0, width: 100 })
    assert.ok(!p.calls.some(c => c[0] === 'seek'))
})
test('playing hides after 3s; pause waiting errors drag and panels hold controls', () => {
    const p = player(); p.instance.onPlay({ detail: {} })
    assert.strictEqual(p.timers.size, 1)
    Array.from(p.timers.values())[0]()
    assert.strictEqual(p.instance.data.controlsVisible, false)
    p.instance.onSurfaceTap(); assert.strictEqual(p.instance.data.controlsVisible, true)
    p.instance.onOpenSettings(); assert.strictEqual(p.timers.size, 0)
    p.instance.onSurfaceTap(); assert.strictEqual(p.instance.data.controlsVisible, true)
    assert.strictEqual(p.instance.data.panel, '', 'blank surface dismisses the panel')
    assert.strictEqual(p.timers.size, 1)
    for (const method of ['onPause', 'onWaiting', 'onError', 'onEnded']) {
        p.instance[method]({ detail: {} })
        assert.strictEqual(p.instance.data.controlsVisible, true)
        assert.strictEqual(p.timers.size, 0)
        p.instance.onSurfaceTap(); assert.strictEqual(p.instance.data.controlsVisible, true)
        p.instance.onPlay({ detail: {} })
    }
    time(p, 7, 80); p.instance.onScrubStart(touch(1, 50))
    assert.strictEqual(p.timers.size, 0)
})
test('play and fullscreen state require native events; fullscreen uses same context', () => {
    const p = player(); p.instance.onTogglePlay()
    assert.strictEqual(p.instance.data.playing, false)
    assert.deepStrictEqual(p.calls[p.calls.length - 1], ['play'])
    p.instance.onPlay({ detail: {} }); p.instance.onTogglePlay()
    assert.strictEqual(p.instance.data.playing, true)
    assert.deepStrictEqual(p.calls[p.calls.length - 1], ['pause'])
    p.instance.onToggleFullscreen(); assert.strictEqual(p.instance.data.fullscreen, false)
    assert.strictEqual(p.calls[p.calls.length - 1][0], 'requestFullScreen')
    p.instance.onFullscreenChange({ detail: { fullScreen: true } }); p.instance.onToggleFullscreen()
    const exit = p.calls[p.calls.length - 1]
    assert.strictEqual(exit[0], 'exitFullScreen')
    assert.strictEqual(typeof exit[1].fail, 'function')
})
test('five rate choices confirm native calls and show failures inside video', () => {
    const p = player()
    for (const rate of [0.8, 1, 1.25, 1.5, 2]) {
        p.instance.onSelectRate({ currentTarget: { dataset: { rate } } })
        assert.strictEqual(p.instance.data.appliedRate, rate)
        assert.deepStrictEqual(p.calls[p.calls.length - 1], ['playbackRate', rate])
    }
    for (const command of ['play', 'pause', 'seek', 'playbackRate', 'requestFullScreen', 'exitFullScreen']) {
        const failed = player({}, { [command]: true }); time(failed, 7, 80)
        if (command === 'pause') failed.instance.onPlay({ detail: {} })
        if (command === 'exitFullScreen') failed.instance.onFullscreenChange({ detail: { fullScreen: true } })
        const action = { play: 'onTogglePlay', pause: 'onTogglePlay', seek: 'onForward', playbackRate: 'onSelectRate',
            requestFullScreen: 'onToggleFullscreen', exitFullScreen: 'onToggleFullscreen' }[command]
        failed.instance[action]({ currentTarget: { dataset: { rate: 2 } } })
        assert.ok(failed.instance.data.controlMessage, command + ' must show in-video error')
    }
})
test('autoNext is controlled by property and emits immutable session identity', () => {
    const p = player({ autoNext: false }); p.instance.properties.sessionId = 'changed'
    p.instance.onToggleAutoNext()
    assert.deepStrictEqual(p.events[p.events.length - 1], { name: 'autonextchange', detail: { value: true, sessionId: 'session-A' } })
    assert.strictEqual(p.instance.properties.autoNext, false)
    p.instance.properties.autoNext = true; p.instance.onToggleAutoNext()
    assert.strictEqual(p.events[p.events.length - 1].detail.value, false)
})
test('controls=false disables all user controls and gestures but retains external guarded API', () => {
    const p = player({ controls: false }); time(p, 7, 80)
    const before = p.calls.length
    for (const action of ['onTogglePlay', 'onRewind', 'onForward', 'onToggleFullscreen', 'onToggleAutoNext', 'onOpenSettings', 'onOpenRates', 'onSurfaceTap']) p.instance[action]()
    p.instance.onSelectRate({ currentTarget: { dataset: { rate: 2 } } }); p.instance.onScrubStart(touch(1, 20))
    assert.strictEqual(p.calls.length, before); assert.strictEqual(p.rects.length, 0)
    assert.ok(!p.events.some(e => e.name === 'autonextchange'))
    assert.strictEqual(p.instance.seekTo(2), true)
})
test('detach rejects every late native event, command, timer and rectangle callback', () => {
    const p = player(); time(p, 7, 80); p.instance.onPlay({ detail: {} })
    const lateTimer = Array.from(p.timers.values())[0]
    p.instance.onScrubStart(touch(1, 20)); p.detach()
    const before = JSON.stringify(p.instance.data); const count = p.calls.length; const events = p.events.length
    for (const action of ['onPlay', 'onPause', 'onWaiting', 'onError', 'onEnded', 'onTimeUpdate', 'onFullscreenChange', 'onPlaybackRateChange', 'onProgress', 'onSeek', 'onSeekComplete']) p.instance[action]({ detail: { currentTime: 70, duration: 80, fullScreen: true, playbackRate: 2 } })
    p.instance.onForward(); p.instance.onTogglePlay(); p.instance.onToggleFullscreen(); p.instance.onToggleAutoNext()
    p.instance.onScrubEnd(touch(1, 80)); p.rects[0]({ left: 0, width: 100 }); lateTimer()
    assert.strictEqual(JSON.stringify(p.instance.data), before)
    assert.strictEqual(p.calls.length, count); assert.strictEqual(p.events.length, events); assert.strictEqual(p.timers.size, 0)
})
test('advancing native time recovers buffering and starts a fresh hide deadline', () => {
    const p = player(); time(p, 7, 80); p.instance.onPlay({ detail: {} }); p.instance.onWaiting({ detail: {} })
    time(p, 7, 80); assert.strictEqual(p.instance.data.waiting, true)
    time(p, NaN, 80); assert.strictEqual(p.instance.data.waiting, true)
    time(p, 8, 80)
    assert.strictEqual(p.instance.data.waiting, false)
    assert.strictEqual(p.timers.size, 1)
})
test('disabling controls invalidates in-flight drag and all existing hide callbacks', () => {
    const p = player(); time(p, 7, 80); p.instance.onPlay({ detail: {} })
    const timer = Array.from(p.timers.values())[0]
    p.instance.onScrubStart(touch(1, 20)); p.instance.properties.controls = false
    p.definition.observers.controls.call(p.instance, false)
    const before = JSON.stringify(p.instance.data)
    p.rects[0]({ left: 0, width: 100 }); timer()
    assert.strictEqual(JSON.stringify(p.instance.data), before)
    assert.strictEqual(p.instance.data.dragging, false)
})
test('missing track rectangles give in-video feedback and never commit a seek', () => {
    const p = player(); time(p, 7, 80); p.instance.onScrubStart(touch(1, 20))
    p.rects[0](null); p.instance.onScrubEnd(touch(1, 80))
    assert.ok(p.instance.data.controlMessage)
    assert.ok(!p.calls.some(call => call[0] === 'seek'))
})
test('synchronous page teardown during rate confirmation cannot revive old play or panel state', () => {
    for (const action of ['onPlay', 'onSelectRate']) {
        const p = player(); let snapshot
        p.instance.triggerEvent = name => {
            if (name === 'rateapplied') { p.detach(); snapshot = JSON.stringify(p.instance.data) }
        }
        p.instance[action]({ detail: {}, currentTarget: { dataset: { rate: 2 } } })
        assert.strictEqual(JSON.stringify(p.instance.data), snapshot)
        assert.strictEqual(p.timers.size, 0)
    }
})
test('P2 rewind clamps to known duration even when observed position exceeds it', () => {
    const p = player(); time(p, 100, 80)
    p.instance.onRewind()
    assert.deepStrictEqual(p.calls[p.calls.length - 1], ['seek', 80])
    assert.strictEqual(p.instance.data.position, 100, 'command does not confirm actual position')
})
test('P2 successful commands clear only their own failures without confirming playback or position', () => {
    const broken = { seek: true }
    const p = player({}, broken); time(p, 7, 80); p.instance.onPlay({ detail: {} })
    p.instance.onForward(); assert.ok(p.instance.data.controlMessage)
    broken.seek = false; p.instance.onForward()
    assert.strictEqual(p.instance.data.controlMessage, '', 'successful retry clears seek command error')
    assert.strictEqual(p.instance.data.position, 7, 'successful seek call is not observed position')
    time(p, 8, 80); assert.strictEqual(p.instance.mustShow(), false)
    assert.strictEqual(p.timers.size, 1)
    broken.seek = true; p.instance.onForward()
    const seekMessage = p.instance.data.controlMessage
    p.instance.setPlaybackRate(2); assert.strictEqual(p.instance.data.controlMessage, seekMessage)
    p.instance.onTogglePlay(); assert.strictEqual(p.instance.data.controlMessage, seekMessage)
    assert.strictEqual(p.instance.data.playing, true, 'pause command does not confirm native pause')
    p.instance.onError({ detail: { errMsg: 'native media failed' } })
    const mediaMessage = p.instance.data.controlMessage
    broken.seek = false; p.instance.onForward(); p.instance.setPlaybackRate(1.25)
    assert.strictEqual(p.instance.data.controlMessage, mediaMessage, 'unrelated success preserves native media error')
    assert.strictEqual(p.instance.data.failed, true)
    p.instance.onPlay({ detail: {} })
    assert.strictEqual(p.instance.data.controlMessage, '', 'actual play event may recover media error')
    broken.playbackRate = true; p.instance.setPlaybackRate(2)
    const rateMessage = p.instance.data.controlMessage
    p.instance.seekTo(20); assert.strictEqual(p.instance.data.controlMessage, rateMessage)
    broken.playbackRate = false; p.instance.setPlaybackRate(2)
    assert.strictEqual(p.instance.data.controlMessage, '')
    assert.strictEqual(p.instance.data.position, 8)
    broken.seek = true; p.instance.seekTo(30)
    const earlierSeekMessage = p.instance.data.controlMessage
    broken.playbackRate = true; p.instance.setPlaybackRate(2)
    broken.playbackRate = false; p.instance.setPlaybackRate(2)
    assert.strictEqual(p.instance.data.controlMessage, earlierSeekMessage, 'clearing newer error must reveal unresolved older command error')
    broken.seek = false; p.instance.seekTo(30)
    p.instance._videoContext.requestFullScreen = options => options.fail()
    p.instance.onToggleFullscreen()
    assert.ok(p.instance.data.controlMessage, 'synchronous native fail callback cannot be cleared by void return')
    p.instance._videoContext.requestFullScreen = () => {}
    p.instance.onToggleFullscreen()
    assert.strictEqual(p.instance.data.controlMessage, '')
    assert.strictEqual(p.instance.data.fullscreen, false, 'successful call still waits for native fullscreen event')
})
test('P2 narrow rate and option targets retain a 44px minimum on both axes', () => {
    const css = fs.readFileSync('components/media-player/media-player.wxss', 'utf8').split('@media')[0]
    const rule = css.match(/\.media-player__rate,\s*\.media-player__option\s*\{([^}]+)\}/)[1]
    assert.ok(/min-height:\s*44px/.test(rule), '320px viewport must retain a 44px target height')
    assert.ok(/min-width:\s*44px/.test(rule), 'five rate options must retain a 44px target width')
})
test('compact popovers use five equal targets without a title or close row', () => {
    const wxml = fs.readFileSync('components/media-player/media-player.wxml', 'utf8')
    const css = fs.readFileSync('components/media-player/media-player.wxss', 'utf8')
    assert.ok(!wxml.includes('media-player__panel-head'), 'popover has no oversized header')
    assert.ok(!wxml.includes('catchtap="onClosePanel"'))
    const panel = css.match(/\.media-player__panel\s*\{([^}]+)\}/)[1]
    assert.ok(/width:\s*244px/.test(panel))
    assert.ok(/max-width:\s*calc\(100% - 16px\)/.test(panel))
    assert.ok(/right:\s*8px/.test(panel))
    assert.ok(!/\bleft\s*:/.test(panel), 'popover anchors at the right instead of spanning the video')
    assert.ok(/bottom:\s*60px/.test(panel), 'popover clears the 52px bar by 8px')
})
test('compact bar has one 52px band with progress and time sharing a 44px center column', () => {
    const wxml = fs.readFileSync('components/media-player/media-player.wxml', 'utf8')
    const css = fs.readFileSync('components/media-player/media-player.wxss', 'utf8')
    const rule = name => css.match(new RegExp('\\.media-player__' + name + '\\s*\\{([^}]+)\\}'))[1]
    assert.ok(/height:\s*52px/.test(rule('bar-backdrop')))
    assert.ok(/height:\s*52px/.test(rule('bottom')))
    assert.ok(/height:\s*44px/.test(rule('track-hit')))
    assert.ok(/flex:\s*1/.test(rule('track-hit')))
    assert.ok(/flex-direction:\s*column/.test(rule('track-hit')))
    assert.ok(/min-width:\s*0/.test(rule('track-hit')))
    assert.ok(/height:\s*44px/.test(rule('row')))
    const rowStart = wxml.indexOf('class="media-player__row"')
    const play = wxml.indexOf('catchtap="onTogglePlay"', rowStart)
    const trackHit = wxml.indexOf('class="media-player__track-hit', rowStart)
    const time = wxml.indexOf('class="media-player__time"', trackHit)
    const track = wxml.indexOf('class="media-player__track"', time)
    const rates = wxml.indexOf('catchtap="onOpenRates"', track)
    assert.ok(rowStart >= 0 && play > rowStart && trackHit > play && time > trackHit && track > time && rates > track)
    assert.ok(!wxml.includes('media-player__spacer'), 'center column itself consumes remaining row width')
    assert.ok(wxml.includes('{{positionText}} / {{durationText}}'))
    assert.ok(!wxml.includes('media-player__timeline'), 'time shares the single button row')
    assert.ok(!wxml.includes('☷'))
    assert.strictEqual((wxml.match(/class="media-player__dot"/g) || []).length, 3)
    assert.strictEqual((wxml.match(/class="media-player__corner media-player__corner--/g) || []).length, 4)
})
test('blank surface closes either popover while paused or waiting and never issues a native command', () => {
    for (const state of ['paused', 'waiting']) {
        const p = player()
        if (state === 'waiting') {
            p.instance.onPlay({ detail: {} })
            p.instance.onWaiting({ detail: {} })
        }
        for (const method of ['onOpenRates', 'onOpenSettings']) {
            p.instance[method](); const before = p.calls.length
            p.instance.onSurfaceTap()
            assert.strictEqual(p.instance.data.panel, '')
            assert.strictEqual(p.instance.data.controlsVisible, true)
            assert.strictEqual(p.calls.length, before)
        }
    }
})
test('native build compatibility avoids Object.values and an unbundled Babel helper', () => {
    const source = fs.readFileSync('components/media-player/media-player.js', 'utf8')
    assert.ok(!/Object\s*\.\s*values\s*\(/.test(source), 'DevTools rewrites Object.values to missing @babel/runtime/helpers/objectValues')
    assert.ok(!source.includes('@babel/runtime'), 'component must not import unbundled runtime helpers')
    const p = player()
    p.instance.controlError('seek', 'seek failed')
    p.instance.controlError('pause', 'pause failed')
    p.instance.controlError('rate', 'rate failed')
    p.instance.clearControlError('rate')
    assert.strictEqual(p.instance.data.controlMessage, 'pause failed')
    p.instance.clearControlError('seek')
    assert.strictEqual(p.instance.data.controlMessage, 'pause failed')
    p.instance.clearControlError('pause')
    assert.strictEqual(p.instance.data.controlMessage, '')
})
test('review fullscreen generations reject superseded confirmed and detached async failures for entry and exit', () => {
    for (const fullScreen of [true, false]) {
        const p = player(); p.instance.onPlay({ detail: {} })
        p.instance.onFullscreenChange({ detail: { fullScreen: !fullScreen } })
        const command = fullScreen ? 'requestFullScreen' : 'exitFullScreen'
        const requests = []
        p.instance._videoContext[command] = options => requests.push(options)
        p.instance.onToggleFullscreen(); p.instance.onToggleFullscreen()
        assert.strictEqual(typeof requests[0].fail, 'function', command + ' supports asynchronous failure feedback')
        requests[0].fail()
        assert.strictEqual(p.instance.data.controlMessage, '', 'older request cannot cancel the current hide timer')
        assert.strictEqual(p.timers.size, 1)
        requests[1].fail()
        assert.ok(p.instance.data.controlMessage, 'latest active request reports failure')
        assert.strictEqual(p.timers.size, 0)
        p.instance.onFullscreenChange({ detail: { fullScreen } })
        assert.strictEqual(p.instance.data.controlMessage, '', 'native confirmation clears only the matching command failure')
        assert.strictEqual(p.timers.size, 1)
        const before = JSON.stringify(p.instance.data); const events = p.events.length
        requests[0].fail(); requests[1].fail()
        assert.strictEqual(JSON.stringify(p.instance.data), before)
        assert.strictEqual(p.events.length, events)
        assert.strictEqual(p.timers.size, 1)
        p.instance.onFullscreenChange({ detail: { fullScreen: !fullScreen } })
        p.instance.onToggleFullscreen(); const latest = requests[2]
        p.detach(); const detached = JSON.stringify(p.instance.data)
        latest.fail()
        assert.strictEqual(JSON.stringify(p.instance.data), detached)
        assert.strictEqual(p.timers.size, 0)
    }
})
test('review waiting seek rebases on native time and recovers only after new observed advancement', () => {
    for (const mode of ['rewind', 'forward', 'drag', 'external']) {
        const p = player(); time(p, 70, 100); p.instance.onPlay({ detail: {} }); p.instance.onWaiting({ detail: {} })
        const target = mode === 'forward' ? 80 : 60
        if (mode === 'rewind') p.instance.onRewind()
        if (mode === 'forward') p.instance.onForward()
        if (mode === 'external') p.instance.seekTo(target)
        if (mode === 'drag') {
            p.instance.onScrubStart(touch(1, 60)); p.rects[0]({ left: 0, width: 100 })
            p.instance.onScrubEnd(touch(1, 60))
        }
        assert.strictEqual(p.instance.data.position, 70, mode + ': command cannot fake progress')
        assert.strictEqual(p.instance.data.waiting, true)
        p.instance.onWaiting({ detail: {} })
        time(p, 70, 100); time(p, NaN, 100)
        time(p, target, 100)
        assert.strictEqual(p.instance.data.waiting, true, mode + ': first native seek position is a baseline, not advancement')
        assert.strictEqual(p.timers.size, 0)
        time(p, target + 1, 100)
        assert.strictEqual(p.instance.data.waiting, false, mode + ': advancement from the new baseline recovers buffering')
        assert.strictEqual(p.timers.size, 1)
    }
    const broken = { seek: true }
    const failed = player({}, broken); time(failed, 70, 100)
    failed.instance.onPlay({ detail: {} }); failed.instance.onWaiting({ detail: {} })
    assert.strictEqual(failed.instance.seekTo(60), false)
    time(failed, 71, 100)
    assert.strictEqual(failed.instance.data.waiting, false, 'failed seek cannot defer actual buffering recovery')
    assert.ok(failed.instance.data.controlMessage, 'buffering recovery must retain failed seek feedback')
})
test('review duration invalidation cancels drag and restores hiding after the final native update', () => {
    const p = player(); time(p, 7, 80); p.instance.onPlay({ detail: {} })
    p.instance.onScrubStart(touch(1, 20)); const rectangle = p.rects[0]
    assert.strictEqual(p.timers.size, 0)
    time(p, 8, NaN)
    assert.strictEqual(p.instance.data.dragging, false)
    assert.strictEqual(p.instance.mustShow(), false)
    assert.strictEqual(p.timers.size, 1, 'native cancellation must restore an idle deadline')
    time(p, 9, 80)
    rectangle({ left: 0, width: 100 })
    assert.strictEqual(p.instance.data.position, 9)
    assert.strictEqual(p.instance.data.previewPosition, 9)
    assert.strictEqual(p.timers.size, 1)
    Array.from(p.timers.values())[0]()
    assert.strictEqual(p.instance.data.controlsVisible, false)
    assert.ok(!p.calls.some(call => call[0] === 'seek'))
})
console.log('media player controls: ' + passed + ' PASS')
