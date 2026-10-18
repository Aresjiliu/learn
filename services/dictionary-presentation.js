function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function textBlocks(value) {
    const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : []
    return items.map(cleanText).filter(Boolean)
}

function presentDictionaryEntry(word = {}) {
    const headword = cleanText(word.word || word.lemma || word.word_text)
    const meaningBlocks = textBlocks(word.word_meaning_all || word.translation || word.meaning || '')
    const examples = textBlocks(word.examples || word.sentence_all || word.sentences || word.example)
    const entryId = String(word.id === undefined || word.id === null ? word.sourceId || '' : word.id)
    let matchLabel = ''
    if (['exact', 'prefix', 'substring'].includes(word.matchTier)) matchLabel = '词头匹配'
    if (word.matchTier === 'meaning') matchLabel = '释义命中'
    if (word.matchTier === 'wordForm') {
        matchLabel = word.ambiguous ? '词形候选 · 存在多个原型，请核对' : '词形匹配'
    }
    return {
        ...word,
        headword,
        wordClass: cleanText(word.word_character || word.part_of_speech || word.wordClass),
        summary: meaningBlocks.join(' '),
        meaningBlocks,
        examples,
        availableSections: [meaningBlocks.length ? 'meanings' : '', examples.length ? 'examples' : ''].filter(Boolean),
        entryId,
        rowKey: entryId || `${word.sourceId || ''}:${headword}`,
        matchLabel,
        sourceLabel: word.sourceType === 'textbook' ? '教材词' : '主词典'
    }
}

module.exports = { presentDictionaryEntry }
