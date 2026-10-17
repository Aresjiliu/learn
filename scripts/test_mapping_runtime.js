const assert = require('assert')
const fs = require('fs')
const decisions = require('../data/content_samples/mapping_decisions.js').decisions
const review = JSON.parse(fs.readFileSync('docs/phase0/first-wave-mapping-review.json', 'utf8'))
const projectionFields = [
    'bookName',
    'normalized',
    'selectedPrototype',
    'dictionaryId',
    'reviewNote',
    'reviewId',
    'decisionStatus'
]
const requiredFields = ['selectedPrototype', 'dictionaryId', 'reviewNote']
const projectReviewEntry = item => Object.fromEntries(projectionFields.map(field => {
    if (field === 'decisionStatus') return [field, 'approved']
    if (field === 'reviewId') return [field, Object.prototype.hasOwnProperty.call(item, field) ? item[field] : '']
    return [field, item[field]]
}))

const syntheticBase = {
    bookName: 'synthetic',
    normalized: 'synthetic',
    selectedPrototype: 'synthetic',
    dictionaryId: 'synthetic',
    reviewNote: 'synthetic',
    decisionStatus: 'approved'
}
assert.strictEqual(projectReviewEntry(syntheticBase).reviewId, '')
assert.strictEqual(projectReviewEntry({ ...syntheticBase, reviewId: null }).reviewId, null)

const approvedProjection = review.entries
    .filter(item => item.decisionStatus === 'approved')
    .map(item => {
        requiredFields.forEach(field => {
            assert.ok(String(item[field] || '').trim(), `approved mapping missing ${field}: ${item.reviewId || item.normalized || '<unknown>'}`)
        })
        return projectReviewEntry(item)
    })

assert.ok(Array.isArray(decisions))
assert.deepStrictEqual(decisions, approvedProjection, 'runtime mapping decisions differ from approved review projection')
decisions.forEach(item => {
    assert.strictEqual(item.decisionStatus, 'approved')
    ;['bookName', 'normalized', ...requiredFields].forEach(field => {
        assert.ok(String(item[field] || '').trim(), `approved mapping missing ${field}`)
    })
})
console.log(`mapping runtime decisions: PASS (${decisions.length} approved)`)
