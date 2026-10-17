const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('services/exam-audio.js', 'utf8')
    .replace("import config from '../config'", 'const config = runtimeConfig')
    .replace("const examAudioManifest = require('../data/content_samples/exam_audio.js')", 'const examAudioManifest = runtimeManifest')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = {
    module: { exports: {} },
    runtimeConfig: { enableLocalTestAudio: true, devMediaBaseUrl: 'http://127.0.0.1:18090' },
    runtimeManifest: { files: ['0123456789abcdef0123456789abcdef.mp3'] }
}
vm.runInNewContext(`${source}\nmodule.exports = { resolveExamAudioQuestion }`, context)
const { resolveExamAudioQuestion } = context.module.exports
const known = { id: '121', audioUrl: '/exam_audio/0123456789abcdef0123456789abcdef.mp3', audioPlayable: false, audioPending: true }
const available = resolveExamAudioQuestion(known)
assert.strictEqual(available.audioUrl, 'http://127.0.0.1:18090/exam_audio/0123456789abcdef0123456789abcdef.mp3')
assert.strictEqual(available.audioPlayable, true)
assert.strictEqual(available.audioPending, false)
assert.strictEqual(known.audioPlayable, false, 'resolver must not mutate input')

const missing = resolveExamAudioQuestion({ ...known, audioUrl: '/exam_audio/abcdef0123456789abcdef0123456789.mp3' })
assert.strictEqual(missing.audioPlayable, false)
assert.strictEqual(missing.audioPending, true)
const external = resolveExamAudioQuestion({ ...known, audioUrl: 'https://media.example/audio.mp3', audioPlayable: true, audioPending: false })
assert.strictEqual(external.audioUrl, 'https://media.example/audio.mp3')
context.runtimeConfig.enableLocalTestAudio = false
assert.strictEqual(resolveExamAudioQuestion(known).audioPlayable, false)
assert.strictEqual(resolveExamAudioQuestion({ ...known, audioUrl: '/exam_audio/../secret.mp3' }).audioPlayable, false)

const pageSource = fs.readFileSync('pages/exam/practice/practice.js', 'utf8')
assert.ok(pageSource.includes('map(resolveExamAudioQuestion)'), 'practice page must resolve every loaded question')
assert.ok(!pageSource.includes('config.enableLocalTestAudio ? config.devMediaBaseUrl'), 'unmapped relative paths cannot be globally marked playable')
console.log('exam audio resolver tests: PASS')
