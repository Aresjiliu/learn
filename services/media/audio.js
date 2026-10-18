function createAudioController(createContext) {
    let context = null
    let currentSource = ''
    let generation = 0

    function releaseContext() {
        const player = context
        // Invalidate first: native stop/destroy may synchronously emit events.
        generation++
        context = null
        currentSource = ''
        if (!player) return
        try {
            player.stop()
        } finally {
            player.destroy()
        }
    }

    return {
        play: function(source, handlers = {}) {
            const audioSource = String(source || '').trim()
            if (!audioSource) return false
            releaseContext()
            const player = createContext()
            const attempt = generation
            context = player
            // Bind to this instance, never forward an old event to new handlers.
            player.onEnded(() => {
                if (attempt === generation && context === player && handlers.onEnded) handlers.onEnded()
            })
            player.onError(error => {
                if (attempt === generation && context === player && handlers.onError) handlers.onError(error)
            })
            currentSource = audioSource
            player.src = audioSource
            player.play()
            return true
        },

        pause: function() {
            if (context) context.pause()
        },

        stop: function() {
            releaseContext()
        },

        destroy: function() {
            releaseContext()
        },

        getCurrentSource: function() {
            return currentSource
        }
    }
}

const audioController = createAudioController(() => wx.createInnerAudioContext())

export { createAudioController, audioController }
