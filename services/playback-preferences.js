const PREFERENCES_KEY = 'playback_preferences_v1'
const RATES = [0.8, 1, 1.25, 1.5, 2]

function getPlaybackPreferences(storage) {
    const defaults = { rate: 1, autoNext: false }
    try {
        const value = storage.getStorageSync(PREFERENCES_KEY)
        if (!value || value.version !== 1 || !RATES.includes(value.rate) || typeof value.autoNext !== 'boolean') return defaults
        return { rate: value.rate, autoNext: value.autoNext }
    } catch (error) { return defaults }
}

function savePlaybackPreferences(storage, value) {
    if (!value || !RATES.includes(value.rate) || typeof value.autoNext !== 'boolean') return false
    try {
        storage.setStorageSync(PREFERENCES_KEY, { version: 1, rate: value.rate, autoNext: value.autoNext })
        return true
    } catch (error) { return false }
}

export { getPlaybackPreferences, savePlaybackPreferences }
