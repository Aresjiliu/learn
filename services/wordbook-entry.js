const { prepareWordbookEntry } = require('./wordbook');

function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function buildWordbookEntry(word, context) {
    if (!word || typeof word !== 'object' || Array.isArray(word)) return null;
    const headword = cleanText(word.headword || word.word);
    const summary = [word.meaningText, word.summary, word.textbookMeaning,
        word.word_meaning_all, word.meaning, word.translation]
        .map(cleanText).find(value => value && value !== '释义待补充') || '';
    // Let the core validate stable identities and all persisted fields.
    for (const entryId of [word.id, word.entryId]) {
        const entry = prepareWordbookEntry({ sourceType: 'dictionary', entryId, headword, summary });
        if (entry) return entry;
    }
    if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
    return prepareWordbookEntry({ sourceType: 'textbook', collectionId: context.collectionId,
        sourceId: context.sourceId, headword, summary });
}

module.exports = { buildWordbookEntry };
