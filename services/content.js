function normalizeWord(value) {
    return String(value || '')
        .trim()
        .toLocaleLowerCase('ru-RU')
        .normalize('NFD')
        .replace(/е\u0308/g, 'ё')
        .replace(/[\u0300-\u036f]/g, '')
}

function normalizePracticeAnswer(value) {
    return String(value || '')
        .trim()
        .toLocaleLowerCase('ru-RU')
        .replace(/ё/g, 'е')
}

function hasUsableText(value) {
    const text = String(value || '').trim()
    return Boolean(text) && !text.includes('\ufffd')
}

function relaxedWord(value) {
    return normalizeWord(value).replace(/ё/g, 'е')
}

function getDictionaryId(dictionary = {}) {
    return dictionary.sourceId || dictionary.id || dictionary.word_id || ''
}

function getQuestionOptionKeys(question = {}) {
    return ['a', 'b', 'c', 'd', 'e'].filter(key => String(question[`${key}_item`] || '').trim())
}

function normalizeWordForms(wordForms = []) {
    if (Array.isArray(wordForms)) return wordForms
    if (!wordForms || typeof wordForms !== 'object' || !wordForms.byWord) return []
    return Object.keys(wordForms.byWord).reduce((forms, word) => {
        const candidates = Array.isArray(wordForms.byWord[word]) ? wordForms.byWord[word] : []
        return forms.concat(candidates.map(item => ({ ...item, form: item.form || word })))
    }, [])
}

function resolveMediaUrl(value, baseUrl = '') {
    const raw = String(value || '').trim()
    if (!raw || /^https?:\/\//i.test(raw) || !String(baseUrl || '').trim()) return raw
    return `${String(baseUrl).replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`
}

function filterCourseWords(words = [], query = '') {
    const normalizedQuery = normalizeWord(query)
    if (!normalizedQuery) return words
    return words.filter(item => (
        normalizeWord(item.word || item.word_text).includes(normalizedQuery) ||
        String(item.displayMeaning || item.word_meaning_all || item.meaning || '').toLocaleLowerCase().includes(String(query).trim().toLocaleLowerCase())
    ))
}

function classifyWordMatch(bookWord, dictionaryWords = [], wordForms = []) {
    const exact = normalizeWord(bookWord)
    const relaxed = relaxedWord(bookWord)
    const dictionaryExact = dictionaryWords.find(item => normalizeWord(item.word || item.word_text) === exact)
    if (dictionaryExact) {
        return { tier: 'exact', confidence: 1, dictionary: dictionaryExact }
    }

    const dictionaryRelaxed = dictionaryWords.find(item => relaxedWord(item.word || item.word_text) === relaxed)
    if (dictionaryRelaxed) {
        return { tier: 'relaxed', confidence: 0.95, dictionary: dictionaryRelaxed }
    }

    const form = normalizeWordForms(wordForms).find(item => normalizeWord(item.form || item.word || item.word_text) === exact)
    if (form) {
        const prototype = dictionaryWords.find(item => normalizeWord(item.word || item.word_text) === normalizeWord(form.prototype || form.root || form.base))
        if (prototype) {
            return { tier: 'wordForm', confidence: 0.8, dictionary: prototype, source: form }
        }
    }

    return { tier: 'unmatched', confidence: 0 }
}

function findApprovedMapping(bookWord, dictionaryWords = [], decisions = []) {
    const bookName = String(bookWord.bookName || bookWord.book_name || '').trim()
    const normalized = normalizeWord(bookWord.word || bookWord.word_text)
    if (!bookName || !normalized) return null
    const decision = decisions.find(item => (
        item && item.decisionStatus === 'approved' &&
        String(item.bookName || '').trim() === bookName &&
        normalizeWord(item.normalized || item.textbookWord || '') === normalized &&
        String(item.selectedPrototype || '').trim() &&
        String(item.dictionaryId || '').trim()
    ))
    if (!decision) return null
    const dictionary = dictionaryWords.find(item => {
        const id = String(getDictionaryId(item)).trim()
        const word = normalizeWord(item.word || item.word_text)
        return id === String(decision.dictionaryId).trim() &&
            word === normalizeWord(decision.selectedPrototype)
    })
    if (!dictionary) return null
    return {
        tier: 'reviewed',
        confidence: 1,
        dictionary,
        source: decision
    }
}

function prepareCourseWords(words = [], dictionaryWords = [], wordForms = [], decisions = [], context = {}) {
    const contextBookName = String(context.bookName || context.book_name || '').trim()
    return words.map((word, index) => {
        const contextualWord = contextBookName && !String(word.bookName || word.book_name || '').trim()
            ? { ...word, bookName: contextBookName }
            : word
        const inlineDictionary = contextualWord.dictionary || contextualWord.mainDictionary || null
        const reviewed = findApprovedMapping(contextualWord, dictionaryWords, decisions)
        const classified = reviewed || classifyWordMatch(contextualWord.word || contextualWord.word_text, dictionaryWords, wordForms)
        const match = classified.tier !== 'unmatched' || !inlineDictionary
            ? classified
            : {
                tier: inlineDictionary.matchTier || 'exact',
                confidence: inlineDictionary.matchConfidence === undefined ? 0.95 : inlineDictionary.matchConfidence,
                dictionary: inlineDictionary
            }
        const dictionary = match.dictionary || {}
        const textbookMeaning = String(contextualWord.word_meaning_all || contextualWord.meaning || '').trim()
        const dictionaryMeaning = String(dictionary.word_meaning_all || dictionary.meaning || dictionary.translation || '').trim()
        const displayMeaning = textbookMeaning || dictionaryMeaning
        const sourceId = String(contextualWord.id || contextualWord.sourceId || '').trim()
        const stableWord = normalizeWord(contextualWord.word || contextualWord.word_text) || 'word'
        return {
            ...contextualWord,
            rowKey: `${sourceId || stableWord}-${index}`,
            displayMeaning,
            hasMeaning: Boolean(displayMeaning),
            matchTier: match.tier,
            matchConfidence: match.confidence,
            dictionaryId: getDictionaryId(dictionary),
            dictionaryWord: dictionary.word || dictionary.word_text || '',
            meaningSource: textbookMeaning ? 'textbook' : dictionaryMeaning ? 'dictionary' : 'missing',
            reviewId: match.source && match.source.reviewId ? match.source.reviewId : ''
        }
    })
}

function selectPracticeQuestions(questions = [], options = {}) {
    const minQuestions = options.minQuestions || 5
    const minAnswerRate = options.minAnswerRate === undefined ? 0.8 : options.minAnswerRate
    const maxTextAnswerLength = options.maxTextAnswerLength === undefined ? 80 : options.maxTextAnswerLength
    const groups = {}

    questions.forEach(question => {
        const paperId = question.paperId || question.paper_id || 'unknown'
        if (!groups[paperId]) groups[paperId] = []
        groups[paperId].push(question)
    })

    const selected = []
    let answerReadyTotal = 0
    let analysisReadyTotal = 0
    let textAnswerTotal = 0
    let choiceAnswerTotal = 0
    const papers = Object.keys(groups).map(paperId => {
        const paperQuestions = groups[paperId]
        const answerReady = paperQuestions.filter(question => {
            const answer = String(question.right_result || '').trim().toLocaleLowerCase()
            const optionKeys = getQuestionOptionKeys(question)
            const answerIsSelectable = optionKeys.length === 0 || optionKeys.includes(answer)
            const textAnswerWithinLimit = optionKeys.length > 0 || maxTextAnswerLength === null || answer.length <= maxTextAnswerLength
            return hasUsableText(question.question_content) && hasUsableText(question.right_result) && answer && answerIsSelectable && textAnswerWithinLimit
        })
        const blankQuestionCount = paperQuestions.filter(question => !String(question.question_content || '').trim()).length
        const corruptTextCount = paperQuestions.filter(question => [
            question.question_content,
            question.right_result,
            question.analysis,
            question.a_item,
            question.b_item,
            question.c_item,
            question.d_item,
            question.e_item
        ].some(value => String(value || '').includes('\ufffd'))).length
        const longTextAnswerCount = paperQuestions.filter(question => {
            const answer = String(question.right_result || '').trim()
            return getQuestionOptionKeys(question).length === 0 && maxTextAnswerLength !== null && answer.length > maxTextAnswerLength
        }).length
        const analysisReady = answerReady.filter(question => hasUsableText(question.analysis))
        const answerRate = paperQuestions.length ? answerReady.length / paperQuestions.length : 0
        const analysisRate = answerReady.length ? analysisReady.length / answerReady.length : 0
        const ready = paperQuestions.length >= minQuestions && answerRate >= minAnswerRate
        answerReadyTotal += answerReady.length
        analysisReadyTotal += analysisReady.length
        textAnswerTotal += answerReady.filter(question => getQuestionOptionKeys(question).length === 0).length
        choiceAnswerTotal += answerReady.filter(question => getQuestionOptionKeys(question).length > 0).length
        if (ready) selected.push(...answerReady.map(question => {
            const audioUrl = resolveMediaUrl(question.audioUrl || question.audio_url, options.audioBaseUrl)
            return {
            ...question,
            audioUrl,
            answerMode: getQuestionOptionKeys(question).length ? 'choice' : 'text',
            answerKey: String(question.right_result || '').trim().toLocaleLowerCase(),
            hasAnalysis: hasUsableText(question.analysis),
            qualityStatus: hasUsableText(question.analysis) ? 'analysis-ready' : 'practice-only',
            audioPlayable: /^https?:\/\//i.test(audioUrl),
            audioPending: Boolean(audioUrl) && !/^https?:\/\//i.test(audioUrl)
            }
        }))
        const reviewReasons = []
        if (paperQuestions.length < minQuestions) reviewReasons.push('题目数量不足')
        if (answerRate < minAnswerRate) reviewReasons.push('正确答案缺失率过高')
        if (blankQuestionCount) reviewReasons.push('存在空题干待审核')
        if (corruptTextCount) reviewReasons.push('存在编码损坏文本待审核')
        if (longTextAnswerCount) reviewReasons.push('存在超长文本答案待审核')
        return {
            paperId,
            totalQuestions: paperQuestions.length,
            answerReadyQuestions: answerReady.length,
            blankQuestionCount,
            corruptTextCount,
            longTextAnswerCount,
            answerRate,
            analysisReadyQuestions: analysisReady.length,
            analysisRate,
            status: ready ? 'practice-ready' : 'hold',
            analysisStatus: ready && analysisRate >= minAnswerRate ? 'analysis-ready' : 'practice-only',
            qualityStatus: ready ? (analysisRate >= minAnswerRate ? 'analysis-ready' : 'practice-only') : 'needs-review',
            reviewReasons
        }
    })

    return {
        questions: selected,
        papers,
        summary: {
            totalQuestions: questions.length,
            answerReadyQuestions: answerReadyTotal,
            analysisReadyQuestions: analysisReadyTotal,
            blankQuestionCount: papers.reduce((total, paper) => total + paper.blankQuestionCount, 0),
            corruptTextCount: papers.reduce((total, paper) => total + paper.corruptTextCount, 0),
            answerReadyTextQuestions: textAnswerTotal,
            answerReadyChoiceQuestions: choiceAnswerTotal,
            practiceReadyPapers: papers.filter(paper => paper.status === 'practice-ready').length,
            reviewPapers: papers.filter(paper => paper.status === 'hold').length
        }
    }
}

function normalizePracticeResponse(response = {}, options = {}) {
    if (Array.isArray(response.questions)) return response
    const success = response.code === 200 || (response.code === undefined && response.data && !response.error)
    if (!success || !response.data || !Array.isArray(response.data.questions)) {
        return { questions: [], papers: [] }
    }
    return selectPracticeQuestions(response.data.questions, options)
}

export { normalizeWord, normalizePracticeAnswer, classifyWordMatch, findApprovedMapping, prepareCourseWords, filterCourseWords, selectPracticeQuestions, normalizePracticeResponse, getQuestionOptionKeys, resolveMediaUrl }
