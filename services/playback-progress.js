const STORAGE_KEY = 'video_progress_v1'
const RECENT_COURSE_KEY = 'recent_course_v1'

function getRecentCourse(storage) {
    if (!storage || typeof storage.getStorageSync !== 'function') return ''
    const value = storage.getStorageSync(RECENT_COURSE_KEY)
    return typeof value === 'string' ? value : ''
}

function saveRecentCourse(storage, courseId) {
    if (!storage || typeof storage.setStorageSync !== 'function' || !courseId) return false
    storage.setStorageSync(RECENT_COURSE_KEY, String(courseId))
    return true
}

function getVideoProgress(storage, videoId) {
    if (!storage || !videoId) return 0
    const values = storage.getStorageSync(STORAGE_KEY) || {}
    const progress = Number(values[String(videoId)])
    return Number.isFinite(progress) && progress > 0 ? progress : 0
}

function saveVideoProgress(storage, videoId, progress) {
    if (!storage || !videoId) return false
    const values = storage.getStorageSync(STORAGE_KEY) || {}
    const normalized = Math.max(0, Math.floor(Number(progress) || 0))
    values[String(videoId)] = normalized
    storage.setStorageSync(STORAGE_KEY, values)
    return true
}

export { STORAGE_KEY, RECENT_COURSE_KEY, getRecentCourse, saveRecentCourse, getVideoProgress, saveVideoProgress }
