function createAudioController(createContext) {
    let context = null
    let activeHandlers = {}
    let currentSource = ''

    function ensureContext() {
        if (context) return context
        context = createContext()
        context.onEnded(() => {
            if (activeHandlers.onEnded) activeHandlers.onEnded()
        })
        context.onError(error => {
            if (activeHandlers.onError) activeHandlers.onError(error)
        })
        return context
    }

    return {
        play: function(source, handlers = {}) {
            const audioSource = String(source || '').trim()
            if (!audioSource) return false
            const player = ensureContext()
            player.stop()
            activeHandlers = handlers
            currentSource = audioSource
            player.src = audioSource
            player.play()
            return true
        },

        pause: function() {
            if (context) context.pause()
        },

        stop: function() {
            if (context) context.stop()
            currentSource = ''
            activeHandlers = {}
        },

        destroy: function() {
            if (context) context.destroy()
            context = null
            currentSource = ''
            activeHandlers = {}
        },

        getCurrentSource: function() {
            return currentSource
        }
    }
}

const audioController = createAudioController(() => wx.createInnerAudioContext())

export { createAudioController, audioController }
