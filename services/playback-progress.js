const STORAGE_KEY = 'video_progress_v1'
const RECENT_COURSE_KEY = 'recent_course_v1'
const RECENT_VIDEO_KEY = 'recent_video_by_course_v1'
const PLAYBACK_RECORDS_KEY = 'playback_records_v2'

function copySnapshot(value) {
    return JSON.parse(JSON.stringify(value))
}

function getRecentCourse(storage) {
    if (!storage || typeof storage.getStorageSync !== 'function') return ''
    try {
        const value = storage.getStorageSync(RECENT_COURSE_KEY)
        return typeof value === 'string' ? value : ''
    } catch (error) {
        return ''
    }
}

function saveRecentCourse(storage, courseId) {
    if (!storage || typeof storage.setStorageSync !== 'function' || !courseId) return false
    try {
        storage.setStorageSync(RECENT_COURSE_KEY, String(courseId))
        return true
    } catch (error) {
        return false
    }
}

function getRecentVideo(storage, courseId) {
    if (!storage || !courseId || typeof storage.getStorageSync !== 'function') return ''
    try {
        const videos = storage.getStorageSync(RECENT_VIDEO_KEY)
        if (!videos || typeof videos !== 'object' || Array.isArray(videos)) return ''
        const value = videos[String(courseId)]
        return typeof value === 'string' ? value : ''
    } catch (error) {
        return ''
    }
}

function saveRecentVideo(storage, courseId, videoId) {
    if (!storage || typeof storage.setStorageSync !== 'function' || !courseId || !videoId) return false
    try {
        const existing = storage.getStorageSync(RECENT_VIDEO_KEY)
        const videos = existing && typeof existing === 'object' && !Array.isArray(existing) ? copySnapshot(existing) : {}
        storage.setStorageSync(RECENT_VIDEO_KEY, { ...videos, [String(courseId)]: String(videoId) })
        return saveRecentCourse(storage, courseId)
    } catch (error) {
        return false
    }
}

function getVideoProgress(storage, videoId) {
    if (!storage || !videoId) return 0
    try {
        const values = storage.getStorageSync(STORAGE_KEY) || {}
        const progress = Number(values[String(videoId)])
        return Number.isFinite(progress) && progress > 0 ? progress : 0
    } catch (error) {
        return 0
    }
}

function saveVideoProgress(storage, videoId, progress) {
    if (!storage || !videoId) return false
    try {
        const values = copySnapshot(storage.getStorageSync(STORAGE_KEY) || {})
        const normalized = Math.max(0, Math.floor(Number(progress) || 0))
        values[String(videoId)] = normalized
        storage.setStorageSync(STORAGE_KEY, values)
        return true
    } catch (error) {
        return false
    }
}

function normalizeId(value) {
    if (typeof value === 'string') return value.trim().length > 0 ? value : null
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : null
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isTime(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function normalizeRecord(value) {
    if (!isObject(value)) return null
    const courseId = normalizeId(value.courseId)
    const videoId = normalizeId(value.videoId)
    const duration = value.duration === undefined ? 0 : value.duration
    if (courseId === null || videoId === null || !isTime(value.position) || !isTime(duration)) return null
    const result = { courseId, videoId, position: value.position, duration }
    for (const field of ['courseTitle', 'videoTitle']) {
        if (value[field] === undefined) continue
        if (typeof value[field] !== 'string' || Array.from(value[field]).length > 256) return null
        result[field] = value[field]
    }
    return result
}

function recordKey(courseId, videoId) {
    return JSON.stringify([courseId, videoId])
}

function readResult(record = null, reason = '') {
    return { ok: true, record, reason }
}

function readError(reason) {
    return { ok: false, record: null, reason }
}

// Build a fresh whitelist snapshot: no references obtained from storage escape.
function readRecords(storage) {
    if (!storage || typeof storage.getStorageSync !== 'function') return { ok: false, reason: 'storage_unavailable' }
    const value = storage.getStorageSync(PLAYBACK_RECORDS_KEY)
    if (value === '' || value === undefined) {
        return { ok: true, missing: true, snapshot: { version: 2, records: [], recent: null } }
    }
    if (!isObject(value)) return { ok: false, reason: 'corrupt_records' }
    if (value.version !== 2) return { ok: false, reason: 'unsupported_version' }
    if (!Array.isArray(value.records) || value.records.length > 200) return { ok: false, reason: 'corrupt_records' }
    const records = []
    const keys = new Set()
    for (const item of value.records) {
        const record = normalizeRecord(item)
        if (!record) return { ok: false, reason: 'corrupt_records' }
        const key = recordKey(record.courseId, record.videoId)
        if (keys.has(key)) return { ok: false, reason: 'corrupt_records' }
        keys.add(key)
        records.push(record)
    }
    if (!isObject(value.recent)) return { ok: false, reason: 'corrupt_records' }
    const courseId = normalizeId(value.recent.courseId)
    const videoId = normalizeId(value.recent.videoId)
    if (courseId === null || videoId === null) return { ok: false, reason: 'corrupt_records' }
    if (!keys.has(recordKey(courseId, videoId))) return { ok: false, reason: 'corrupt_records' }
    return { ok: true, missing: false, snapshot: { version: 2, records, recent: { courseId, videoId } } }
}

function findRecord(snapshot, courseId, videoId) {
    const key = recordKey(courseId, videoId)
    return snapshot.records.find(record => recordKey(record.courseId, record.videoId) === key) || null
}

// v1's video-only progress is usable only with both explicit ownership bindings.
function readLegacyRecord(storage, courseId, videoId) {
    const recentCourseId = normalizeId(storage.getStorageSync(RECENT_COURSE_KEY))
    if (recentCourseId === null || (courseId !== undefined && courseId !== recentCourseId)) return readResult()
    const videos = storage.getStorageSync(RECENT_VIDEO_KEY)
    if (!isObject(videos) || !Object.prototype.hasOwnProperty.call(videos, recentCourseId)) return readResult()
    const recentVideoId = normalizeId(videos[recentCourseId])
    if (recentVideoId === null || (videoId !== undefined && videoId !== recentVideoId)) return readResult()
    const progress = storage.getStorageSync(STORAGE_KEY)
    if (!isObject(progress) || !Object.prototype.hasOwnProperty.call(progress, recentVideoId)) return readResult()
    const position = progress[recentVideoId]
    if (!isTime(position)) return readResult()
    return readResult({ courseId: recentCourseId, videoId: recentVideoId, position, duration: 0, courseTitle: '', videoTitle: '' })
}

function getPlaybackRecord(storage, courseId, videoId) {
    try {
        const normalizedCourseId = normalizeId(courseId)
        const normalizedVideoId = normalizeId(videoId)
        if (normalizedCourseId === null || normalizedVideoId === null) return readError('invalid_identity')
        const state = readRecords(storage)
        if (!state.ok) return readError(state.reason)
        const record = findRecord(state.snapshot, normalizedCourseId, normalizedVideoId)
        return record ? readResult(record) : readLegacyRecord(storage, normalizedCourseId, normalizedVideoId)
    } catch (error) {
        return readError('storage_read_failed')
    }
}

function getRecentPlayback(storage) {
    try {
        const state = readRecords(storage)
        if (!state.ok) return readError(state.reason)
        if (state.missing) return readLegacyRecord(storage)
        const recent = state.snapshot.recent
        return readResult(findRecord(state.snapshot, recent.courseId, recent.videoId))
    } catch (error) {
        return readError('storage_read_failed')
    }
}

function savePlaybackRecord(storage, record, options = {}) {
    let snapshot
    try {
        const normalized = normalizeRecord(record)
        if (!normalized) return { ok: false, reason: 'invalid_record' }
        const state = readRecords(storage)
        if (!state.ok) return { ok: false, reason: state.reason }
        snapshot = state.snapshot
        const key = recordKey(normalized.courseId, normalized.videoId)
        const index = snapshot.records.findIndex(item => recordKey(item.courseId, item.videoId) === key)
        if (index < 0) {
            if (snapshot.records.length >= 200) return { ok: false, reason: 'capacity_reached' }
            snapshot.records.push(normalized)
        } else {
            snapshot.records[index] = normalized
        }
        if (!snapshot.recent || !options || options.makeRecent !== false) {
            snapshot.recent = { courseId: normalized.courseId, videoId: normalized.videoId }
        }
    } catch (error) {
        return { ok: false, reason: 'storage_read_failed' }
    }
    try {
        if (!storage || typeof storage.setStorageSync !== 'function') return { ok: false, reason: 'storage_unavailable' }
        storage.setStorageSync(PLAYBACK_RECORDS_KEY, snapshot)
        return { ok: true, reason: '' }
    } catch (error) {
        return { ok: false, reason: 'storage_write_failed' }
    }
}

export { STORAGE_KEY, RECENT_COURSE_KEY, RECENT_VIDEO_KEY, PLAYBACK_RECORDS_KEY, getRecentCourse, saveRecentCourse, getRecentVideo, saveRecentVideo, getVideoProgress, saveVideoProgress, getPlaybackRecord, getRecentPlayback, savePlaybackRecord }
