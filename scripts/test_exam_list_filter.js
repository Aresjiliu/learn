const assert = require('assert')
const { filterPapers } = require('../pages/exam/list/filter')

const papers = [
    { id: 'choice-a', questionMode: 'choice' },
    { id: 'text-a', questionMode: 'text' },
    { id: 'essay', questionMode: 'essay' },
    { id: 'unknown-mode', questionMode: 'mystery' },
    { id: 'legacy-mode', questionMode: 'multiple-choice' },
    { id: 'unknown', questionMode: '' },
    { id: 'missing' }
]

assert.deepStrictEqual(filterPapers(papers, 'all'), papers)
assert.deepStrictEqual(filterPapers(papers, 'choice').map(item => item.id), ['choice-a'])
assert.deepStrictEqual(filterPapers(papers, 'text').map(item => item.id), ['text-a'])
assert.deepStrictEqual(filterPapers(papers, 'unsupported').map(item => item.id), papers.map(item => item.id))
assert.deepStrictEqual(papers.map(item => item.id), ['choice-a', 'text-a', 'essay', 'unknown-mode', 'legacy-mode', 'unknown', 'missing'])
assert.deepStrictEqual(filterPapers(null, 'all'), [])

console.log('exam list filter tests: PASS')
