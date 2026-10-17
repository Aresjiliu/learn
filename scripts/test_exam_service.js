const fs = require('fs')
const vm = require('vm')
const assert = require('assert')

const contentSource = fs.readFileSync('services/content.js', 'utf8')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const examSource = fs.readFileSync('services/exam.js', 'utf8')
    .replace("import { normalizePracticeResponse } from './content'", '')
    .replace("const sampleExam = require('../data/content_samples/exam_practice_sample.js')", `const sampleExam = ${fs.readFileSync('data/content_samples/exam_practice_sample.json', 'utf8')}`)
    .replace("const fillinExam = require('../data/content_samples/exam_fillin_sample.js')", `const fillinExam = ${fs.readFileSync('data/content_samples/exam_fillin_sample.json', 'utf8')}`)
    .replace("const samplePapers = require('../data/content_samples/exam_papers.js')", `const samplePapers = ${fs.readFileSync('data/content_samples/exam_papers.json', 'utf8')}`)
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} } }
vm.runInNewContext(`${contentSource}\n${examSource}\nmodule.exports = { getLocalPracticeSet, getLocalExamPapers }`, context)
const { getLocalPracticeSet, getLocalExamPapers } = context.module.exports

;(async () => {
    const papers = await getLocalExamPapers()
    assert.strictEqual(papers.data.papers.length, 2)
    const listening = await getLocalPracticeSet({ paperId: '50cda4cb21244f00b72f3c31ec3b7020' })
    assert.strictEqual(listening.questions.length, 8)
    const fillin = await getLocalPracticeSet({ paperId: '112df13e3990437b8cd021c79fc18b3c' })
    assert.strictEqual(fillin.questions.length, 8)
    assert.strictEqual(fillin.questions[0].answerMode, 'text')
    assert.notStrictEqual(listening.questions[0].answerMode, fillin.questions[0].answerMode)
    const listeningWithMedia = await getLocalPracticeSet({ paperId: '50cda4cb21244f00b72f3c31ec3b7020', audioBaseUrl: 'http://127.0.0.1:18090' })
    assert.strictEqual(listeningWithMedia.questions[0].audioUrl, 'http://127.0.0.1:18090/exam_audio/36246e049c0e40e6b7aff17af88e7c0f.mp3')
    assert.strictEqual(listeningWithMedia.questions[0].audioPlayable, true)
    const unknown = await getLocalPracticeSet({ paperId: 'missing' })
    assert.strictEqual(unknown.questions.length, 0)
    console.log('exam service tests: PASS')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
