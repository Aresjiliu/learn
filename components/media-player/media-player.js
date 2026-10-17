Component({
    properties: {
        src: { type: String, value: '' },
        title: { type: String, value: '' },
        autoplay: { type: Boolean, value: false },
        controls: { type: Boolean, value: true },
        initialTime: { type: Number, value: 0 },
        objectFit: { type: String, value: 'contain' }
    },

    methods: {
        forward: function(name, event) {
            this.triggerEvent(name, event.detail)
        },

        onTimeUpdate: function(event) { this.forward('timeupdate', event) },
        onEnded: function(event) { this.forward('ended', event) },
        onPlay: function(event) { this.forward('play', event) },
        onPause: function(event) { this.forward('pause', event) },
        onWaiting: function(event) { this.forward('waiting', event) },
        onError: function(event) { this.forward('error', event) },
        onFullscreenChange: function(event) { this.forward('fullscreenchange', event) },
        onPlaybackRateChange: function(event) { this.forward('playbackratechange', event) },
        onProgress: function(event) { this.forward('progress', event) },
        onSeek: function(event) { this.forward('seek', event) },
        onSeekComplete: function(event) { this.forward('seekcomplete', event) }
    }
})
