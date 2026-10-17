const fs = require('fs')
const vm = require('vm')
const assert = require('assert')

function loadService() {
    const source = fs.readFileSync('services/content.js', 'utf8')
        .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
    const context = { module: { exports: {} } }
    vm.runInNewContext(`${source}\nmodule.exports = { normalizeWord, normalizePracticeAnswer, classifyWordMatch, findApprovedMapping, prepareCourseWords, filterCourseWords, selectPracticeQuestions, normalizePracticeResponse, getQuestionOptionKeys, resolveMediaUrl }`, context)
    return context.module.exports
}

const { normalizeWord, normalizePracticeAnswer, classifyWordMatch, findApprovedMapping, prepareCourseWords, filterCourseWords, selectPracticeQuestions, normalizePracticeResponse, getQuestionOptionKeys, resolveMediaUrl } = loadService()

assert.strictEqual(normalizeWord(' ЁЛКА '), 'ёлка')
assert.strictEqual(normalizePracticeAnswer(' Ёлка '), 'елка')
assert.strictEqual(resolveMediaUrl('/audio/q1.mp3', 'http://127.0.0.1:18090'), 'http://127.0.0.1:18090/audio/q1.mp3')
assert.strictEqual(resolveMediaUrl('https://media.example/q1.mp3', 'http://127.0.0.1:18090'), 'https://media.example/q1.mp3')
assert.strictEqual(getQuestionOptionKeys({ a_item: 'A', b_item: '', c_item: 'C' }).join(','), 'a,c')
assert.strictEqual(filterCourseWords([
    { word: 'площадь', word_meaning_all: '广场' },
    { word: 'дом', word_meaning_all: '房子' }
], '广场').length, 1)
assert.strictEqual(classifyWordMatch('ёлка', [{ word: 'ёлка' }]).tier, 'exact')
assert.strictEqual(classifyWordMatch('ёлка', [{ word: 'ёлка' }]).confidence, 1)
assert.strictEqual(classifyWordMatch('ёлка', [{ word: 'елка', sourceId: '1' }]).tier, 'relaxed')
assert.strictEqual(classifyWordMatch('домами', [{ word: 'дом' }], [{ form: 'домами', prototype: 'дом' }]).tier, 'wordForm')
assert.strictEqual(classifyWordMatch('немало', [{ word: 'немалый' }], {
    byWord: { немало: [{ prototype: 'немалый', sourceId: '1' }] }
}).tier, 'wordForm')
const preparedWords = prepareCourseWords([
    { id: 1, word: 'ёлка', word_meaning_all: '' },
    { id: 2, word: 'домами', word_meaning_all: '房屋（复数工具格）' }
], [{ word: 'елка', word_meaning_all: '云杉' }, { word: 'дом', word_meaning_all: '房子' }], [{ form: 'домами', prototype: 'дом' }])
assert.strictEqual(preparedWords[0].matchTier, 'relaxed')
assert.strictEqual(preparedWords[0].displayMeaning, '云杉')
assert.strictEqual(preparedWords[0].dictionaryId, '')
assert.strictEqual(preparedWords[0].meaningSource, 'dictionary')
assert.ok(preparedWords[0].rowKey)
assert.notStrictEqual(preparedWords[0].rowKey, preparedWords[1].rowKey)
assert.strictEqual(preparedWords[1].matchTier, 'wordForm')
assert.strictEqual(preparedWords[1].displayMeaning, '房屋（复数工具格）')
assert.strictEqual(preparedWords[1].meaningSource, 'textbook')
const inlinePrepared = prepareCourseWords([
    { id: 3, word: 'море', word_meaning_all: '', dictionary: { sourceId: '99', word: 'море', meaning: '海', matchTier: 'exact' } }
], [], [])
assert.strictEqual(inlinePrepared[0].matchTier, 'exact')
assert.strictEqual(inlinePrepared[0].dictionaryId, '99')
assert.strictEqual(inlinePrepared[0].displayMeaning, '海')

const reviewedDictionary = [{ id: '77', word: 'площадь', word_meaning_all: '广场' }]
const reviewedDecision = [{
    reviewId: '教材:площади',
    bookName: '首发教材',
    normalized: 'площади',
    decisionStatus: 'approved',
    selectedPrototype: 'площадь',
    dictionaryId: '77',
    reviewNote: '上下文确认'
}]
assert.strictEqual(findApprovedMapping({ bookName: '首发教材', word: 'площади' }, reviewedDictionary, reviewedDecision).tier, 'reviewed')
const reviewedWords = prepareCourseWords([
    { bookName: '首发教材', word: 'площади', word_meaning_all: '' }
], reviewedDictionary, [], reviewedDecision)
assert.strictEqual(reviewedWords[0].matchTier, 'reviewed')
assert.strictEqual(reviewedWords[0].dictionaryId, '77')
assert.strictEqual(reviewedWords[0].reviewId, '教材:площади')
assert.strictEqual(findApprovedMapping({ bookName: '首发教材', word: 'площади' }, reviewedDictionary, [{ ...reviewedDecision[0], decisionStatus: 'pending' }]), null)
assert.strictEqual(findApprovedMapping({ bookName: '首发教材', word: 'площади' }, [{ id: '88', word: 'площадь' }], reviewedDecision), null)
const contextualReviewed = prepareCourseWords([
    { word: 'площади', word_meaning_all: '' }
], reviewedDictionary, [], reviewedDecision, { bookName: '首发教材' })
assert.strictEqual(contextualReviewed[0].matchTier, 'reviewed')
assert.strictEqual(contextualReviewed[0].bookName, '首发教材')
const duplicateKeyWords = prepareCourseWords([
    { word: 'один' },
    { word: 'один' }
], [], [])
assert.notStrictEqual(duplicateKeyWords[0].rowKey, duplicateKeyWords[1].rowKey)

const result = selectPracticeQuestions([
    { id: 1, paperId: 10, question_content: '题目1', right_result: 'A', analysis: '' },
    { id: 2, paperId: 10, question_content: '题目2', right_result: '', analysis: '解析' },
    { id: 3, paperId: 10, question_content: '题目3', right_result: 'B', analysis: '解析' },
    { id: 4, paperId: 10, question_content: '题目4', right_result: 'C', analysis: '解析' },
    { id: 5, paperId: 10, question_content: '题目5', right_result: 'D', analysis: '解析' },
    { id: 6, paperId: 10, question_content: '题目6', right_result: 'E', analysis: '解析' }
], { minQuestions: 5, minAnswerRate: 0.8 })
assert.strictEqual(result.questions.length, 5)
assert.strictEqual(result.papers[0].status, 'practice-ready')
assert.strictEqual(result.papers[0].analysisStatus, 'analysis-ready')
assert.strictEqual(result.papers[0].qualityStatus, 'analysis-ready')
assert.strictEqual(result.papers[0].reviewReasons.length, 0)
assert.strictEqual(result.questions[0].hasAnalysis, false)
assert.strictEqual(result.questions[0].qualityStatus, 'practice-only')
assert.strictEqual(result.questions[0].audioPlayable, false)
assert.strictEqual(result.questions[0].audioPending, false)
assert.strictEqual(result.questions[0].answerKey, 'a')
assert.strictEqual(result.questions[0].answerMode, 'text')
assert.strictEqual(result.summary.practiceReadyPapers, 1)
assert.strictEqual(result.summary.reviewPapers, 0)
assert.strictEqual(result.summary.answerReadyTextQuestions, 5)
assert.strictEqual(result.summary.answerReadyChoiceQuestions, 0)
const invalidAnswer = selectPracticeQuestions([
    { id: 1, paperId: 11, question_content: '题目', a_item: 'A', b_item: 'B', right_result: 'c' }
], { minQuestions: 1, minAnswerRate: 1 })
assert.strictEqual(invalidAnswer.questions.length, 0)
assert.strictEqual(invalidAnswer.papers[0].reviewReasons.includes('正确答案缺失率过高'), true)
const blankStem = selectPracticeQuestions([
    { id: 1, paperId: 15, question_content: '   ', right_result: '答案' },
    { id: 2, paperId: 15, question_content: '有效题目', right_result: '答案' }
], { minQuestions: 1, minAnswerRate: 0.5 })
assert.strictEqual(blankStem.questions.length, 1)
assert.strictEqual(blankStem.papers[0].blankQuestionCount, 1)
assert.strictEqual(blankStem.summary.blankQuestionCount, 1)
assert.strictEqual(blankStem.papers[0].reviewReasons.includes('存在空题干待审核'), true)
const corruptAnalysis = selectPracticeQuestions([
    { id: 1, paperId: 16, question_content: '有效题目', right_result: '答案', analysis: '解析�乱码' }
], { minQuestions: 1, minAnswerRate: 1 })
assert.strictEqual(corruptAnalysis.questions.length, 1)
assert.strictEqual(corruptAnalysis.questions[0].hasAnalysis, false)
assert.strictEqual(corruptAnalysis.papers[0].corruptTextCount, 1)
assert.strictEqual(corruptAnalysis.summary.corruptTextCount, 1)
assert.strictEqual(corruptAnalysis.papers[0].reviewReasons.includes('存在编码损坏文本待审核'), true)
const fillInReady = selectPracticeQuestions([
    { id: 1, paperId: 13, question_content: '填入正确形式', right_result: 'положил' }
], { minQuestions: 1, minAnswerRate: 1 })
assert.strictEqual(fillInReady.questions[0].answerMode, 'text')
assert.strictEqual(fillInReady.summary.answerReadyTextQuestions, 1)
const longText = selectPracticeQuestions([
    { id: 1, paperId: 14, question_content: '异常长答案', right_result: 'это искусственно длинный текстовый ответ для проверки фильтрации учебного контента и ручной проверки качества перед публикацией в приложении' }
], { minQuestions: 1, minAnswerRate: 1 })
assert.strictEqual(longText.questions.length, 0)
assert.strictEqual(longText.papers[0].longTextAnswerCount, 1)
assert.strictEqual(longText.papers[0].reviewReasons.includes('存在超长文本答案待审核'), true)
const audioReady = selectPracticeQuestions([
    { id: 1, paperId: 12, question_content: '听力题', a_item: 'A', b_item: 'B', right_result: ' A ', audioUrl: 'https://example.test/a.mp3' }
], { minQuestions: 1, minAnswerRate: 1 })
assert.strictEqual(audioReady.questions[0].audioPlayable, true)
assert.strictEqual(audioReady.questions[0].answerKey, 'a')
const relativeAudio = selectPracticeQuestions([
    { id: 2, paperId: 12, question_content: '相对音频', a_item: 'A', right_result: 'a', audioUrl: '/audio/q2.mp3' }
], { minQuestions: 1, minAnswerRate: 1, audioBaseUrl: 'http://127.0.0.1:18090' })
assert.strictEqual(relativeAudio.questions[0].audioUrl, 'http://127.0.0.1:18090/audio/q2.mp3')
assert.strictEqual(relativeAudio.questions[0].audioPlayable, true)
assert.deepStrictEqual(normalizePracticeResponse({ code: 200, data: { questions: result.questions } }).questions, result.questions)
assert.strictEqual(normalizePracticeResponse({ code: 500, data: {} }).questions.length, 0)
assert.strictEqual(normalizePracticeResponse({ data: { questions: result.questions }, meta: {} }).questions.length, 5)
assert.strictEqual(normalizePracticeResponse(result).questions.length, result.questions.length)
console.log('content service tests: PASS')
