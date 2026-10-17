function createSession(questionIds = []) {
    return {
        questionIds: questionIds.map(id => String(id)),
        answers: {},
        score: 0,
        completedCount: 0
    }
}

function recordAnswer(session, questionId, correct, answer = '') {
    const id = String(questionId)
    if (session.answers[id]) return session
    return {
        ...session,
        answers: {
            ...session.answers,
            [id]: { correct: Boolean(correct), answer: String(answer || '') }
        },
        score: session.score + (correct ? 1 : 0),
        completedCount: session.completedCount + 1
    }
}

export { createSession, recordAnswer }
