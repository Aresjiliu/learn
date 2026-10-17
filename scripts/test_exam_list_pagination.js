const assert = require('assert')
const fs = require('fs')
const { filterPapers } = require('../pages/exam/list/filter')

const source = fs.readFileSync('pages/exam/list/list.js', 'utf8').replace(/^import .*\n/m, '')
const requests = []
let definition
new Function('Page', 'getExamPapers', 'require', 'wx', source)(
    page => { definition = page },
    options => new Promise((resolve, reject) => { requests.push({ options, resolve, reject }) }),
    () => ({ filterPapers }),
    { showToast: () => {}, navigateTo: () => {} }
)

function instance() {
    return {
        ...definition,
        data: JSON.parse(JSON.stringify(definition.data)),
        setData(update) { Object.assign(this.data, update) }
    }
}

const settle = () => new Promise(resolve => setImmediate(resolve))
const paper = (id, questionMode, practiceReady = true) => ({ id, title: id, questionMode, practiceReady })

async function run() {
    const page = instance()
    page.onLoad()
    assert.deepStrictEqual(requests[0].options, { page: 1, pageSize: 20 })
    const firstPage = [paper('a', 'choice'), paper('review', 'text', false)]
    for (let index = 2; index < 20; index++) firstPage.push(paper(`choice-${index}`, 'choice'))
    requests[0].resolve({ data: { papers: firstPage }, meta: { total: 21 } })
    await settle()
    assert.strictEqual(page.data.hasMore, true)
    page.setPaperFilter({ currentTarget: { dataset: { filter: 'text' } } })
    assert.deepStrictEqual(page.data.visiblePapers.map(item => item.id), ['review'])
    assert.strictEqual(page.data.visiblePapers[0].canPractice, false)
    page.setPaperFilter({ currentTarget: { dataset: { filter: 'choice' } } })
    assert.strictEqual(page.data.visiblePapers.length, 19)
    page.setPaperFilter({ currentTarget: { dataset: { filter: 'text' } } })

    page.loadMore()
    assert.deepStrictEqual(requests[1].options, { page: 2, pageSize: 20 })
    page.loadMore()
    assert.strictEqual(requests.length, 2, 'loading blocks duplicate requests')
    requests[1].reject(new Error('offline'))
    await settle()
    assert.strictEqual(page.data.papers.length, 20)
    assert.deepStrictEqual(page.data.visiblePapers.map(item => item.id), ['review'])
    assert.strictEqual(page.data.page, 1)
    assert.ok(page.data.loadMoreError)

    page.retryLoad()
    assert.deepStrictEqual(requests[2].options, { page: 2, pageSize: 20 })
    requests[2].resolve({ data: { papers: [paper('b', 'text')] }, meta: { total: 21 } })
    await settle()
    assert.strictEqual(page.data.papers.length, 21)
    assert.deepStrictEqual(page.data.visiblePapers.map(item => item.id), ['review', 'b'])
    assert.strictEqual(page.data.hasMore, false)
    assert.strictEqual(page.data.loadMoreError, '')
    assert.strictEqual(page.openPaper({ currentTarget: { dataset: { paperId: 'review', canPractice: false } } }), undefined)

    const unknownAudit = instance()
    unknownAudit.onLoad()
    requests[3].resolve({ data: { papers: [{ id: 'unknown', title: '待核验', questionMode: 'choice' }] }, meta: { total: 1 } })
    await settle()
    assert.strictEqual(unknownAudit.data.visiblePapers[0].canPractice, false, 'missing audit flag must fail closed')

    const emptyFilterPage = instance()
    emptyFilterPage.onLoad()
    requests[4].resolve({ data: { papers: firstPage.map(item => ({ ...item, questionMode: 'choice' })) }, meta: { total: 21 } })
    await settle()
    emptyFilterPage.setPaperFilter({ currentTarget: { dataset: { filter: 'text' } } })
    assert.strictEqual(emptyFilterPage.data.visiblePapers.length, 0)
    assert.strictEqual(emptyFilterPage.data.hasMore, true, 'empty current filter does not hide later pages')
    emptyFilterPage.loadMore()
    assert.deepStrictEqual(requests[5].options, { page: 2, pageSize: 20 })
    requests[5].resolve({ data: { papers: [paper('late-text', 'text')] }, meta: { total: 21 } })
    await settle()
    assert.deepStrictEqual(emptyFilterPage.data.visiblePapers.map(item => item.id), ['late-text'])
    console.log('exam list pagination tests: PASS')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
