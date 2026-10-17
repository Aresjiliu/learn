import config from '../config'

const examAudioManifest = require('../data/content_samples/exam_audio.js')
const cachedFiles = new Set(examAudioManifest.files || [])
const localAudioPath = /^\/exam_audio\/([0-9a-f]{32}\.mp3)$/

function resolveExamAudioQuestion(question) {
    if (!question) return question
    const raw = String(question.audioUrl || question.audio_url || '').trim()
    const match = localAudioPath.exec(raw)
    const baseUrl = String(config.devMediaBaseUrl || '').replace(/\/+$/, '')
    if (!config.enableLocalTestAudio || !match || !cachedFiles.has(match[1]) || !/^https?:\/\//i.test(baseUrl)) {
        return question
    }
    return {
        ...question,
        audioUrl: `${baseUrl}${raw}`,
        audioPlayable: true,
        audioPending: false
    }
}

export { resolveExamAudioQuestion }
