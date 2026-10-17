const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const listening = require('../data/content_samples/exam_practice_sample.json')
const fillin = require('../data/content_samples/exam_fillin_sample.json')
const directory = require('../data/content_samples/exam_papers.json')
const practiceWxml = fs.readFileSync('pages/exam/practice/practice.wxml', 'utf8')
assert.ok(practiceWxml.includes('questions[currentIndex].instruction'), 'task instruction must be visible before answering')
const source = fs.readFileSync('services/content.js', 'utf8').replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { selectPracticeQuestions }`, context)

for (const sample of [listening, fillin]) {
    assert.strictEqual(sample.questions.length, 8)
    assert.ok(sample.questions.every(q => q.instruction && !q.analysis), 'task instruction must not masquerade as answer explanation')
    const selected = context.module.exports.selectPracticeQuestions(sample.questions)
    assert.strictEqual(selected.questions.length, 8)
    assert.ok(selected.questions.every(q => q.hasAnalysis === false), 'practice feedback must not show task instruction as analysis')
    const paper = directory.papers.find(item => item.id === sample.paperId)
    assert.strictEqual(paper.explanationReadyCount, 0)
    assert.strictEqual(paper.analysisReady, false)
}
console.log('exam instruction/analysis separation: PASS')
