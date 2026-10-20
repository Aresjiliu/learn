function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function textBlocks(value) {
    const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : []
    return items.map(cleanText).filter(Boolean)
}

function presentDictionaryEntry(word = {}) {
    // Preserve the full label; only the list badge uses a known part-of-speech code.
    const wordClass = cleanText(word.word_character || word.part_of_speech || word.wordClass)
    const shortClasses = {
        'сущ.': '名词', 'м.': '名词', 'ж.': '名词', 'ср.': '名词', '名': '名词', '名词': '名词',
        'прил.': '形容词', '形': '形容词', '形容词': '形容词',
        'гл.': '动词', '动': '动词', '动词': '动词',
        'нареч.': '副词', '副': '副词', '副词': '副词',
        'мест.': '代词', '代': '代词', '代词': '代词',
        'предл.': '前置词', '前置词': '前置词',
        'союз': '连词', 'союз.': '连词', '连词': '连词',
        'част.': '语气词', '语气词': '语气词',
        'числ.': '数词', '数词': '数词', 'межд.': '感叹词', '感叹词': '感叹词'
    }
    // Compound source labels start with a standalone Chinese code. Russian labels
    // keep their exact-match contract; do not scan later grammar or meaning text.
    const firstCode = wordClass.split(' ')[0]
    const classKey = ['名', '动', '形', '副', '代'].includes(firstCode) ? firstCode : wordClass
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
        wordClass,
        shortWordClass: Object.prototype.hasOwnProperty.call(shortClasses, classKey) ? shortClasses[classKey] : '',
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

function presentDictionaryDetail(value = {}) {
    const word = value && typeof value === 'object' ? value : {}
    const firstText = values => values.find(item => typeof item === 'string' && item.trim()) || ''
    const wordClass = firstText([word.textbookWordClass, word.word_character, word.part_of_speech, word.wordClass]).trim()
    const examples = [word.examples, word.sentence_all, word.sentences, word.example]
        .map(source => (Array.isArray(source) ? source : typeof source === 'string' ? source.split(/\r?\n/) : [])
            .filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))
        .find(items => items.length > 0) || []
    return {
        ...word,
        headword: firstText([word.word, word.lemma, word.word_text]).trim(),
        wordClass,
        shortWordClass: presentDictionaryEntry({ wordClass }).shortWordClass,
        sourceLabel: word.sourceType === 'textbook' ? '教材词' : '主词典',
        meaningText: firstText([word.textbookMeaning, word.word_meaning_all, word.meaning, word.translation]) || '释义待补充',
        exampleItems: examples.map((text, index) => ({ key: `example:${index}`, text })),
        hasExamples: examples.length > 0,
        hasMoreExamples: examples.length > 2
    }
}

module.exports = { presentDictionaryEntry, presentDictionaryDetail }
