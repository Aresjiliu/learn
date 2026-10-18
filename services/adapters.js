function normalizeVideo(video = {}) {
    const preview = video.isPreview === undefined
        ? (video.is_preview === undefined ? video.preview : video.is_preview)
        : video.isPreview
    return {
        ...video,
        id: video.id || video.video_id || video.video_uuid,
        title: video.title || video.name || video.video_name || '',
        url: video.url || video.video_url || video.media_url || '',
        durationText: video.durationText || video.duration_text || '',
        isPreview: preview
    }
}

function normalizeChapter(chapter = {}) {
    return {
        ...chapter,
        id: chapter.id || chapter.chapter_id || chapter.lesson_id,
        title: chapter.title || chapter.name || chapter.lesson_name || '',
        videos: Array.isArray(chapter.videos)
            ? chapter.videos.map(normalizeVideo)
            : Array.isArray(chapter.video_list) ? chapter.video_list.map(normalizeVideo) : []
    }
}

function normalizeCourse(course = {}) {
    return {
        ...course,
        id: Object.prototype.hasOwnProperty.call(course, 'id') ? course.id : course.book_id,
        title: course.title || course.name || course.book_name || '',
        cover_image: course.cover_image || course.cover_url || course.book_cover_img || '',
        wordCount: course.wordCount === undefined ? course.word_count : course.wordCount,
        price: course.price === undefined ? (course.member_price === undefined ? '0.00' : course.member_price) : course.price,
        original_price: course.original_price === undefined ? (course.price === undefined ? '0.00' : course.price) : course.original_price,
        students_count: course.students_count === undefined ? (course.student_count || 0) : course.students_count,
        chapters: Array.isArray(course.chapters)
            ? course.chapters.map(normalizeChapter)
            : Array.isArray(course.lessons) ? course.lessons.map(normalizeChapter) : []
    }
}

function normalizeCourseWord(word = {}) {
    const examples = word.sentence_all || word.sentences || word.example || ''
    return {
        ...word,
        id: word.id || word.word_id || word.book_word_id,
        word: word.word || word.word_text || word.lemma || '',
        word_meaning_all: word.word_meaning_all || word.meaning || word.translation || '',
        word_character: word.word_character || word.word_character_zh || word.part_of_speech || '',
        sentence_all: Array.isArray(examples) ? examples.join('\n') : examples
    }
}

function isContentSuccess(response = {}) {
    return response.code === 200 || (response.code === undefined && Boolean(response.data) && !response.error)
}

function normalizeCourseResponse(response = {}) {
    if (!isContentSuccess(response) || !response.data) return response
    const data = response.data
    return {
        ...response,
        data: {
            ...data,
            course: data.course ? normalizeCourse(data.course) : data.course,
            words: Array.isArray(data.words) ? data.words.map(normalizeCourseWord) : data.words,
            courses: Array.isArray(data.courses)
                ? data.courses.map(normalizeCourse)
                : Array.isArray(data.books) ? data.books.map(normalizeCourse) : data.courses
        }
    }
}

function normalizeDictionaryWord(word = {}) {
    return {
        ...word,
        id: word.id || word.word_id,
        word: word.word || word.lemma || word.word_text || '',
        word_meaning_all: word.word_meaning_all || word.translation || word.meaning || '',
        word_character: word.word_character || word.part_of_speech || '',
        audioUrl: word.audioUrl || word.audio_url || ''
    }
}

function normalizeDictionaryResponse(response = {}) {
    if (!isContentSuccess(response) || !response.data) return response
    const data = response.data
    return {
        ...response,
        data: {
            ...data,
            word: data.word ? normalizeDictionaryWord(data.word) : data.word,
            words: Array.isArray(data.words) ? data.words.map(normalizeDictionaryWord) : data.words
        }
    }
}

function normalizeExamQuestion(question = {}) {
    const optionValue = key => question[`${key}_item`] || question[`option_${key}`] || question[`option${key.toUpperCase()}`] || question[key] || ''
    return {
        ...question,
        id: question.id || question.question_id,
        questionType: question.questionType || question.question_type || question.exam_question_type || '',
        originalTextUuid: question.originalTextUuid || question.original_text_uuid || question.exam_original_text_uuid || '',
        audioUrl: question.audioUrl || question.audio_url || question.audio || '',
        question_content: question.question_content || question.content || question.question || question.question_text || '',
        right_result: question.right_result || question.answer || question.correct_answer || question.correctAnswer || '',
        analysis: question.analysis || question.explanation || question.analysis_text || '',
        translate: question.translate || question.translation || '',
        point: question.point || '',
        a_item: optionValue('a'),
        b_item: optionValue('b'),
        c_item: optionValue('c'),
        d_item: optionValue('d'),
        e_item: optionValue('e')
    }
}

function normalizeExamResponse(response = {}) {
    if (!isContentSuccess(response) || !response.data) return response
    const data = response.data
    return {
        ...response,
        data: {
            ...data,
            questions: Array.isArray(data.questions) ? data.questions.map(normalizeExamQuestion) : data.questions
        }
    }
}

function normalizeExamPaper(paper = {}) {
    const toBoolean = value => value === true || value === 1 || value === '1' || value === 'true'
    const normalizeFlag = value => value === undefined || value === null || value === '' ? undefined : toBoolean(value)
    const practiceReady = paper.practiceReady === undefined ? paper.practice_ready : paper.practiceReady
    const analysisReady = paper.analysisReady === undefined ? paper.analysis_ready : paper.analysisReady
    return {
        ...paper,
        id: paper.id || paper.paper_id || paper.paper_uuid,
        title: paper.title || paper.name || paper.paper_name || '未命名试卷',
        questionCount: paper.questionCount === undefined ? paper.question_count : paper.questionCount,
        answerReadyCount: paper.answerReadyCount === undefined ? paper.answer_ready_count : paper.answerReadyCount,
        explanationReadyCount: paper.explanationReadyCount === undefined ? paper.explanation_ready_count : paper.explanationReadyCount,
        audioReadyCount: paper.audioReadyCount === undefined ? paper.audio_ready_count : paper.audioReadyCount,
        questionMode: paper.questionMode || paper.question_mode || '',
        practiceReady: normalizeFlag(practiceReady),
        analysisReady: normalizeFlag(analysisReady)
    }
}

function normalizeExamPapersResponse(response = {}) {
    if (!isContentSuccess(response) || !response.data) return response
    return {
        ...response,
        data: {
            ...response.data,
            papers: Array.isArray(response.data.papers) ? response.data.papers.map(normalizeExamPaper) : response.data.papers
        }
    }
}

export { isContentSuccess, normalizeCourseResponse, normalizeDictionaryResponse, normalizeExamResponse, normalizeExamPaper, normalizeExamPapersResponse, normalizeVideo, normalizeChapter, normalizeCourseWord }
