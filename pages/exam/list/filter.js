function filterPapers(papers, filter) {
    const source = Array.isArray(papers) ? papers : []
    if (filter === 'choice') {
        return source.filter(paper => paper.questionMode === 'choice')
    }
    if (filter === 'text') {
        return source.filter(paper => paper.questionMode === 'text')
    }
    return source.slice()
}

module.exports = { filterPapers }
