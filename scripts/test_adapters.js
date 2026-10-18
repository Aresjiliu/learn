const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('services/adapters.js', 'utf8')
    .replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = { normalizeCourseResponse, normalizeDictionaryResponse, normalizeExamResponse, normalizeExamPapersResponse, normalizeCourseWord, isContentSuccess }`, context)
const { normalizeCourseResponse, normalizeDictionaryResponse, normalizeExamResponse, isContentSuccess, normalizeExamPapersResponse, normalizeCourseWord } = context.module.exports

const course = normalizeCourseResponse({
    code: 200,
    data: { courses: [{ id: 1, name: '大学俄语', cover_url: '/cover.png', word_count: 20 }] }
})
assert.strictEqual(course.data.courses[0].title, '大学俄语')
assert.strictEqual(course.data.courses[0].cover_image, '/cover.png')
assert.strictEqual(course.data.courses[0].wordCount, 20)
assert.strictEqual(course.data.courses[0].price, '0.00')
assert.strictEqual(course.data.courses[0].students_count, 0)
for (const id of [0, '0', false, null, '', undefined]) {
    const normalized = normalizeCourseResponse({ data: { course: { id, book_id: 1 } } })
    assert.strictEqual(normalized.data.course.id, id, 'explicit course ID must survive normalization')
}
assert.strictEqual(normalizeCourseResponse({ data: { course: { id: 0 } } }).data.course.id, 0)
assert.strictEqual(normalizeCourseResponse({ data: { course: { book_id: 0 } } }).data.course.id, 0)
assert.strictEqual(normalizeCourseResponse({ data: { courses: [{ id: 0 }] } }).data.courses[0].id, 0)
const courseWord = normalizeCourseWord({ word_id: 9, word_text: 'дом', meaning: '房子', word_character_zh: '名词', sentences: 'Это дом.' })
assert.strictEqual(courseWord.id, 9)
assert.strictEqual(courseWord.word, 'дом')
assert.strictEqual(courseWord.word_meaning_all, '房子')
assert.strictEqual(courseWord.word_character, '名词')
assert.strictEqual(courseWord.sentence_all, 'Это дом.')
const courseWithWords = normalizeCourseResponse({ data: { words: [{ word_text: 'море', word_id: 10 }] } })
assert.strictEqual(courseWithWords.data.words[0].word, 'море')
assert.strictEqual(normalizeCourseWord({ word: 'дом', example: ['Первый.', 'Второй.'] }).sentence_all, 'Первый.\nВторой.')
const mediaCourse = normalizeCourseResponse({ data: { courses: [{ id: 5, lessons: [{ lesson_id: 'l1', video_list: [{ video_id: 'v1', video_name: '试听', video_url: '/v.mp4', is_preview: 'false' }, { video_uuid: 'v2', title: '试看', preview: 1 }] }] }] } })
assert.strictEqual(mediaCourse.data.courses[0].chapters[0].id, 'l1')
assert.strictEqual(mediaCourse.data.courses[0].chapters[0].videos[0].id, 'v1')
assert.strictEqual(mediaCourse.data.courses[0].chapters[0].videos[0].url, '/v.mp4')
assert.strictEqual(mediaCourse.data.courses[0].chapters[0].videos[0].isPreview, 'false')
assert.strictEqual(mediaCourse.data.courses[0].chapters[0].videos[1].isPreview, 1)
assert.strictEqual(isContentSuccess({ data: { courses: [] }, meta: {} }), true)
const books = normalizeCourseResponse({ data: { books: [{ id: 4, name: '教材', cover_url: '/book.png' }] }, meta: {} })
assert.strictEqual(books.data.courses[0].title, '教材')
assert.strictEqual(books.data.courses[0].original_price, '0.00')

const dictionary = normalizeDictionaryResponse({
    code: 200,
    data: { word: { id: 2, word: 'дом', translation: '房子', part_of_speech: '名词', audio_url: '/a.mp3' } }
})
assert.strictEqual(dictionary.data.word.word_meaning_all, '房子')
assert.strictEqual(dictionary.data.word.word_character, '名词')
assert.strictEqual(dictionary.data.word.audioUrl, '/a.mp3')
assert.strictEqual(normalizeDictionaryResponse({ data: { word: { word: 'дом', translation: '房子' } }, meta: {} }).data.word.word_meaning_all, '房子')

const exam = normalizeExamResponse({
    code: 200,
    data: { questions: [{ id: 3, content: '题干', answer: 'b', explanation: '解析' }] }
})
assert.strictEqual(exam.data.questions[0].question_content, '题干')
assert.strictEqual(exam.data.questions[0].right_result, 'b')
assert.strictEqual(exam.data.questions[0].analysis, '解析')
assert.strictEqual(normalizeExamResponse({ data: { questions: [{ content: '题干', answer: 'a' }] }, meta: {} }).data.questions[0].right_result, 'a')
const audioExam = normalizeExamResponse({ data: { questions: [{ id: 4, audio_url: '/a.mp3', exam_question_type: '1', translate: '译文' }] } })
assert.strictEqual(audioExam.data.questions[0].audioUrl, '/a.mp3')
assert.strictEqual(audioExam.data.questions[0].questionType, '1')
assert.strictEqual(audioExam.data.questions[0].translate, '译文')
const legacyExam = normalizeExamResponse({ data: { questions: [{ question_id: 5, question_text: '旧题干', correct_answer: 'c', analysis_text: '旧解析', option_a: '甲', option_c: '丙' }] } })
assert.strictEqual(legacyExam.data.questions[0].id, 5)
assert.strictEqual(legacyExam.data.questions[0].question_content, '旧题干')
assert.strictEqual(legacyExam.data.questions[0].right_result, 'c')
assert.strictEqual(legacyExam.data.questions[0].c_item, '丙')
const papers = normalizeExamPapersResponse({ data: { papers: [{ paper_uuid: 'p1', paper_name: '试卷', question_count: 8, question_mode: 'text', practice_ready: 1 }] }, meta: {} })
assert.strictEqual(papers.data.papers[0].id, 'p1')
assert.strictEqual(papers.data.papers[0].title, '试卷')
assert.strictEqual(papers.data.papers[0].questionCount, 8)
assert.strictEqual(papers.data.papers[0].practiceReady, true)
assert.strictEqual(papers.data.papers[0].questionMode, 'text')
assert.strictEqual(normalizeExamPapersResponse({ data: { papers: [{ practice_ready: '0' }] }, meta: {} }).data.papers[0].practiceReady, false)
assert.strictEqual(normalizeExamPapersResponse({ data: { papers: [{ practiceReady: 'false', analysisReady: 'true' }] }, meta: {} }).data.papers[0].practiceReady, false)
assert.strictEqual(normalizeExamPapersResponse({ data: { papers: [{ practiceReady: 'false', analysisReady: 'true' }] }, meta: {} }).data.papers[0].analysisReady, true)
assert.strictEqual(normalizeExamPapersResponse({ data: { papers: [{ title: '旧接口' }] }, meta: {} }).data.papers[0].practiceReady, undefined)
console.log('adapter tests: PASS')
