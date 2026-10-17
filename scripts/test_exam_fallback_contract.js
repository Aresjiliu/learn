const assert = require('assert')
const fs = require('fs')

const api = fs.readFileSync('services/content-api.js', 'utf8')
const page = fs.readFileSync('pages/exam/practice/practice.js', 'utf8')
assert.ok(api.includes('function getExamPaper(paperId, options = {})'))
assert.ok(api.includes('getLocalPracticeSet({ paperId, ...options })'))
assert.ok(page.includes('getExamPaper(paperId, { audioBaseUrl:'))
console.log('exam fallback contract tests: PASS')
