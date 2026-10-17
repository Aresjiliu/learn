import { normalizePracticeResponse } from './content'

const sampleExam = require('../data/content_samples/exam_practice_sample.js')
const fillinExam = require('../data/content_samples/exam_fillin_sample.js')
const samplePapers = require('../data/content_samples/exam_papers.js')
const localExams = [sampleExam, fillinExam]

function getLocalPracticeSet(options = {}) {
    const exam = options.paperId
        ? localExams.find(item => String(item.paperId) === String(options.paperId))
        : sampleExam
    if (!exam) {
        return Promise.resolve({ questions: [], papers: [], summary: { totalQuestions: 0, practiceReadyPapers: 0, reviewPapers: 0 }, meta: { source: 'local-sample' } })
    }
    return Promise.resolve({
        ...normalizePracticeResponse({
        code: 200,
        data: { questions: exam.questions }
        }, options),
        meta: { source: 'local-sample' }
    })
}

function getLocalExamPapers() {
    return Promise.resolve({ code: 200, data: { papers: samplePapers.papers }, meta: { source: 'local-sample' } })
}

export { getLocalPracticeSet, getLocalExamPapers }
