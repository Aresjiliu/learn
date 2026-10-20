const RATES = [0.8, 1, 1.25, 1.5, 2]
const validPosition = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const validDuration = value => validPosition(value) && value > 0
const clockText = value => {
    const seconds = Math.floor(validPosition(value) ? value : 0)
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

Component({
    properties: {
        sessionId: { type: String, value: '' },
        desiredRate: { type: Number, value: 1 },
        autoNext: { type: Boolean, value: false },
        src: { type: String, value: '' },
        title: { type: String, value: '' },
        autoplay: { type: Boolean, value: false },
        controls: { type: Boolean, value: true },
        initialTime: { type: Number, value: 0 },
        objectFit: { type: String, value: 'contain' }
    },

    data: {
        rates: RATES,
        appliedRate: 1,
        playing: false,
        waiting: false,
        failed: false,
        fullscreen: false,
        controlsVisible: true,
        panel: '',
        dragging: false,
        position: 0,
        previewPosition: 0,
        positionText: '0:00',
        durationText: '--:--',
        progressPercent: 0,
        canScrub: false,
        canForward: false,
        controlMessage: ''
    },

    observers: {
        controls: function(value) {
            if (this._detached) return
            this.cancelHide()
            this.cancelDrag()
            this.setData({ panel: '', controlsVisible: true })
            if (value) this.scheduleHide()
        }
    },

    lifetimes: {
        attached: function() {
            // This identity belongs to the native node, never to changing properties.
            Object.defineProperty(this, '_sessionId', { value: this.properties.sessionId })
            this._detached = false
            this._desiredRate = RATES.includes(this.properties.desiredRate) ? this.properties.desiredRate : 1
            this._observedPosition = null
            this._duration = null
            this._measureGeneration = 0
            this._hideGeneration = 0
            this._controlErrors = {}
            this._errorSequence = 0
            this._fullscreenGeneration = 0
            this._waitingSeek = null
        },
        ready: function() {
            if (this._detached) return
            try { this._videoContext = wx.createVideoContext('mediaVideo', this) } catch (error) { this._videoContext = null }
            this.setPlaybackRate(this._desiredRate)
        },
        detached: function() {
            this._detached = true
            this.cancelHide()
            this._measureGeneration++
            this._fullscreenGeneration++
            this._waitingSeek = null
            this._drag = null
            this._videoContext = null
        }
    },

    methods: {
        userEnabled: function() {
            return !this._detached && this.properties.controls !== false
        },

        cancelHide: function() {
            this._hideGeneration = (this._hideGeneration || 0) + 1
            if (this._hideTimer != null) clearTimeout(this._hideTimer)
            this._hideTimer = null
        },

        mustShow: function() {
            return !this.data.playing || this.data.waiting || this.data.failed || this.data.dragging || !!this.data.panel || !!this.data.controlMessage
        },

        scheduleHide: function() {
            this.cancelHide()
            if (!this.userEnabled() || this.mustShow() || !this.data.controlsVisible) return
            const generation = this._hideGeneration
            this._hideTimer = setTimeout(() => {
                if (this._detached || generation !== this._hideGeneration || this.mustShow()) return
                this._hideTimer = null
                this.setData({ controlsVisible: false })
            }, 3000)
            if (this._hideTimer && this._hideTimer.unref) this._hideTimer.unref()
        },

        showControls: function() {
            if (this._detached) return
            this.setData({ controlsVisible: true })
            this.scheduleHide()
        },

        recordControlError: function(command, message) {
            if (this._detached) return
            this._controlErrors[command] = { message, sequence: ++this._errorSequence }
            this.setData({ controlMessage: message, controlsVisible: true })
            this.cancelHide()
        },

        clearControlError: function(command) {
            if (this._detached || !this._controlErrors[command]) return
            delete this._controlErrors[command]
            const commands = Object.keys(this._controlErrors)
            let latest = null
            for (let index = 0; index < commands.length; index++) {
                const item = this._controlErrors[commands[index]]
                if (!latest || item.sequence > latest.sequence) latest = item
            }
            this.setData({ controlMessage: latest ? latest.message : '' })
            this.scheduleHide()
        },

        controlError: function(command, message) {
            if (this._detached) return
            this.recordControlError(command, message)
            this.forward('controlerror', { detail: { command, message } })
        },

        nativeCommand: function(command, args = []) {
            if (this._detached) return false
            try {
                if (!this._videoContext || typeof this._videoContext[command] !== 'function') throw new Error('unsupported')
                const errorSequence = this._errorSequence
                this._videoContext[command](...args)
                // A void return acknowledges the call only. A synchronous fail callback wins.
                if (errorSequence === this._errorSequence) this.clearControlError(command)
                return true
            } catch (error) {
                const labels = { play: '播放', pause: '暂停', seek: '跳转', requestFullScreen: '进入全屏', exitFullScreen: '退出全屏' }
                this.controlError(command, (labels[command] || '操作') + '未完成，请重试')
                return false
            }
        },

        forward: function(name, event) {
            if (this._detached || !this._sessionId) return
            this.triggerEvent(name, { ...(event && event.detail), sessionId: this._sessionId })
        },

        setPlaybackRate: function(rate) {
            if (this._detached || !RATES.includes(rate)) return false
            try {
                if (!this._videoContext || typeof this._videoContext.playbackRate !== 'function') throw new Error('unsupported')
                this._videoContext.playbackRate(rate)
                this._desiredRate = rate
                this.setData({ appliedRate: rate })
                this.clearControlError('rate')
                // VideoContext returns void: this confirms the call, not hardware playback.
                this.forward('rateapplied', { detail: { rate } })
                return true
            } catch (error) {
                // A failed command cannot confirm a new rate. Keep the previous
                // desired rate unless the fallback call itself succeeds.
                try {
                    if (rate !== 1 && this._videoContext && typeof this._videoContext.playbackRate === 'function') {
                        this._videoContext.playbackRate(1)
                        this._desiredRate = 1
                        this.setData({ appliedRate: 1 })
                        this.forward('rateapplied', { detail: { rate: 1 } })
                    }
                } catch (ignored) { /* retain the last successfully applied rate */ }
                this.controlError('rate', '当前设备暂不支持倍速设置')
                return false
            }
        },

        seekTo: function(position) {
            if (this._detached || typeof position !== 'number' || !Number.isFinite(position) || position < 0) return false
            const succeeded = this.nativeCommand('seek', [position])
            if (succeeded && !this._detached && this.data.waiting) {
                // Keep the previous native position until timeupdate observes the new baseline.
                this._waitingSeek = { origin: this._observedPosition }
            }
            return succeeded
        },

        pause: function() {
            return this.nativeCommand('pause')
        },

        onTimeUpdate: function(event) {
            if (this._detached) return
            const detail = (event && event.detail) || {}
            this._observedPosition = validPosition(detail.currentTime) ? detail.currentTime : null
            this._duration = validDuration(detail.duration) ? detail.duration : null
            const cancelledDrag = !this._duration && !!this._drag
            if (cancelledDrag) this.cancelDrag()
            const position = this._observedPosition == null ? 0 : this._observedPosition
            const update = {
                position,
                durationText: this._duration ? clockText(this._duration) : '--:--',
                canScrub: !!this._duration,
                canForward: !!this._duration && this._observedPosition != null
            }
            let rebased = false
            if (this.data.waiting && this._observedPosition != null) {
                if (this._waitingSeek && this._observedPosition !== this._waitingSeek.origin) {
                    this._waitingPosition = this._observedPosition
                    this._waitingSeek = null
                    rebased = true
                } else if (!this._waitingSeek && this._observedPosition < this._waitingPosition) {
                    this._waitingPosition = this._observedPosition
                    rebased = true
                }
            }
            const recovered = !rebased && !this._waitingSeek && this.data.waiting && this.data.playing && !this.data.failed &&
                this._observedPosition != null && this._observedPosition > this._waitingPosition
            if (recovered) update.waiting = false
            if (!this._drag) Object.assign(update, {
                previewPosition: position,
                positionText: clockText(position),
                progressPercent: this._duration ? Math.min(100, position / this._duration * 100) : 0
            })
            this.setData(update)
            if (recovered || cancelledDrag) this.scheduleHide()
            this.forward('timeupdate', event)
        },
        onEnded: function(event) {
            if (this._detached) return
            this.setData({ playing: false, waiting: false })
            this.showControls()
            this.forward('ended', event)
        },
        onPlay: function(event) {
            if (this._detached) return
            this._waitingSeek = null
            this.setPlaybackRate(this._desiredRate)
            if (this._detached) return
            this.setData({ playing: true, waiting: false, failed: false })
            this.clearControlError('media')
            this.showControls()
            this.forward('play', event)
        },
        onPause: function(event) {
            if (this._detached) return
            this.setData({ playing: false })
            this.showControls()
            this.forward('pause', event)
        },
        onWaiting: function(event) {
            if (this._detached) return
            this._waitingPosition = this._observedPosition == null ? 0 : this._observedPosition
            this.setData({ waiting: true })
            this.showControls()
            this.forward('waiting', event)
        },
        onError: function(event) {
            if (this._detached) return
            this.setData({ failed: true, waiting: false })
            this.recordControlError('media', '视频播放失败，请重试')
            this.showControls()
            this.forward('error', event)
        },
        onFullscreenChange: function(event) {
            if (this._detached) return
            const fullScreen = event && event.detail && event.detail.fullScreen
            if (typeof fullScreen !== 'boolean') return this.forward('fullscreenchange', event)
            this._fullscreenGeneration++
            this.setData({ fullscreen: fullScreen })
            this.clearControlError(fullScreen ? 'requestFullScreen' : 'exitFullScreen')
            this.cancelDrag()
            this.showControls()
            this.forward('fullscreenchange', event)
        },
        onPlaybackRateChange: function(event) {
            if (this._detached) return
            const rate = event && event.detail && event.detail.playbackRate
            if (RATES.includes(rate)) {
                this._desiredRate = rate
                this.setData({ appliedRate: rate })
            }
            this.forward('playbackratechange', event)
        },
        onProgress: function(event) { this.forward('progress', event) },
        onSeek: function(event) { this.forward('seek', event) },
        onSeekComplete: function(event) { this.forward('seekcomplete', event) },

        onSurfaceTap: function() {
            if (!this.userEnabled()) return
            if (this.data.panel) return this.onClosePanel()
            if (this.mustShow()) return this.showControls()
            this.setData({ controlsVisible: !this.data.controlsVisible })
            this.scheduleHide()
        },
        onControlTap: function() {
            if (this.userEnabled()) this.showControls()
        },
        onTogglePlay: function() {
            if (!this.userEnabled()) return
            this.nativeCommand(this.data.playing ? 'pause' : 'play')
            this.showControls()
        },
        onRewind: function() {
            if (!this.userEnabled() || this._observedPosition == null) return
            const position = Math.max(0, this._observedPosition - 10)
            this.seekTo(this._duration ? Math.min(this._duration, position) : position)
            this.showControls()
        },
        onForward: function() {
            if (!this.userEnabled() || !this._duration || this._observedPosition == null) return
            this.seekTo(Math.min(this._duration, this._observedPosition + 10))
            this.showControls()
        },
        onToggleFullscreen: function() {
            if (!this.userEnabled()) return
            const generation = ++this._fullscreenGeneration
            const command = this.data.fullscreen ? 'exitFullScreen' : 'requestFullScreen'
            const message = this.data.fullscreen ? '无法退出全屏，请重试' : '无法进入全屏，请重试'
            this.nativeCommand(command, [{ fail: () => {
                if (this._detached || generation !== this._fullscreenGeneration) return
                this.controlError(command, message)
            } }])
            this.showControls()
        },
        onOpenRates: function() {
            if (!this.userEnabled()) return
            this.setData({ panel: 'rates' })
            this.showControls()
        },
        onOpenSettings: function() {
            if (!this.userEnabled()) return
            this.setData({ panel: 'settings' })
            this.showControls()
        },
        onClosePanel: function() {
            if (!this.userEnabled()) return
            this.setData({ panel: '' })
            this.showControls()
        },
        onSelectRate: function(event) {
            if (!this.userEnabled()) return
            const rate = Number(event && event.currentTarget && event.currentTarget.dataset.rate)
            if (this.setPlaybackRate(rate) && !this._detached) this.setData({ panel: '' })
            this.showControls()
        },
        onToggleAutoNext: function() {
            if (!this.userEnabled()) return
            this.forward('autonextchange', { detail: { value: !this.properties.autoNext } })
            this.showControls()
        },

        touchPoint: function(event, ending) {
            const points = event && (ending ? event.changedTouches : event.touches)
            if (!points) return null
            for (let index = 0; index < points.length; index++) {
                const point = points[index]
                if ((!this._drag || point.identifier === this._drag.touchId) && Number.isFinite(point.clientX)) return point
            }
            return null
        },
        previewDrag: function() {
            const drag = this._drag
            if (this._detached || !drag || !drag.rect || !this._duration) return
            const ratio = Math.max(0, Math.min(1, (drag.x - drag.rect.left) / drag.rect.width))
            drag.position = ratio * this._duration
            this.setData({ previewPosition: drag.position, positionText: clockText(drag.position), progressPercent: ratio * 100 })
        },
        cancelDrag: function() {
            this._measureGeneration = (this._measureGeneration || 0) + 1
            this._drag = null
            if (this._detached) return
            const position = this._observedPosition == null ? 0 : this._observedPosition
            this.setData({ dragging: false, previewPosition: position, positionText: clockText(position),
                progressPercent: this._duration ? Math.min(100, position / this._duration * 100) : 0 })
        },
        onScrubStart: function(event) {
            if (!this.userEnabled() || !this._duration) return
            const point = this.touchPoint(event, false)
            if (!point) return
            this.cancelDrag()
            const generation = this._measureGeneration
            const drag = { touchId: point.identifier, x: point.clientX, rect: null, position: null }
            this._drag = drag
            this.setData({ dragging: true, controlsVisible: true })
            this.cancelHide()
            try {
                wx.createSelectorQuery().in(this).select('.media-player__track').boundingClientRect(rect => {
                    if (this._detached || this._drag !== drag || generation !== this._measureGeneration || !this.userEnabled()) return
                    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.width) || rect.width <= 0) {
                        this.cancelDrag()
                        this.controlError('seek', '暂时无法定位进度，请重试')
                        return
                    }
                    drag.rect = rect
                    this.previewDrag()
                }).exec()
            } catch (error) {
                this.cancelDrag()
                this.controlError('seek', '暂时无法定位进度，请重试')
            }
        },
        onScrubMove: function(event) {
            if (!this.userEnabled() || !this._drag) return
            const point = this.touchPoint(event, false)
            if (!point) return
            this._drag.x = point.clientX
            this.previewDrag()
        },
        onScrubEnd: function(event) {
            if (!this.userEnabled() || !this._drag) return
            const point = this.touchPoint(event, true)
            if (!point) return
            this._drag.x = point.clientX
            this.previewDrag()
            const position = this._drag.position
            this.cancelDrag()
            if (position != null) this.seekTo(position)
            this.showControls()
        },
        onScrubCancel: function(event) {
            if (!this.userEnabled() || !this._drag || !this.touchPoint(event, true)) return
            this.cancelDrag()
            this.showControls()
        }
    }
})
