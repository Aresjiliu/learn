const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const tests = []
function test(name, run) { tests.push({ name, run }) }

// Exercise the real course service, content API composition and adapters;
// replace only transport/config and unrelated dictionary/exam dependencies.
function loadCourse(options, transport) {
    const config = {
        enableContentApi: false, enableLocalSampleFallback: false,
        enableLocalTestMedia: false, enableLocalWordAudio: false,
        devMediaBaseUrl: 'http://127.0.0.1:18090', contentApiBasePath: '/api/v1',
        ...options
    }
    const calls = []
    const cache = {}
    function load(file) {
        if (cache[file]) return cache[file]
        const filename = path.join(root, file + '.js')
        const imports = specifier => {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
            if (target === 'config') return config
            if (target === 'utils/request') return request => {
                calls.push(request.url)
                return Promise.resolve().then(() => transport(request.url))
            }
            if (target === 'services/dictionary' || target === 'services/exam') return {}
            return load(target)
        }
        const source = fs.readFileSync(filename, 'utf8')
            .replace(/import\s+(.+?)\s+from\s+'([^']+)'/g, (_, binding, specifier) =>
                `const ${binding} = imports('${specifier}')`)
            .replace(/export\s*\{([^}]+)\}\s*$/, 'module.exports = {$1}')
        const module = { exports: {} }
        vm.runInNewContext(source, {
            module, imports, require: specifier => require(path.resolve(path.dirname(filename), specifier))
        }, { filename, timeout: 1000 })
        cache[file] = module.exports
        return module.exports
    }
    return { ...load('services/course'), calls }
}

function responseFor(url, id = 1) {
    if (url.endsWith('/words')) return { code: 200, data: { words: [{ id: 'word-a', word: 'слово', book_id: id }] } }
    if (url.endsWith('/video/')) return { code: 200, data: { chapters: [{ id: 'chapter-a', course_id: id, videos: [] }] } }
    const course = { id, title: 'Requested course', chapters: [{ id: 'chapter-a', book_id: id, videos: [] }] }
    return { code: 200, data: url.startsWith('/api/v1/') ? { book: course } : { course } }
}

for (const enableContentApi of [false, true]) {
    for (const enableLocalSampleFallback of [false, true]) {
        const flags = { enableContentApi, enableLocalSampleFallback }
        const label = JSON.stringify(flags)
        test(`transport failure never returns sample ${label}`, async () => {
            const failure = new Error('offline')
            const service = loadCourse(flags, () => { throw failure })
            await assert.rejects(service.getCourseDetail('1'), error => error === failure)
        })
        test(`unsuccessful detail never returns sample ${label}`, async () => {
            const service = loadCourse(flags, () => ({ code: 503, message: 'unavailable' }))
            const result = await service.getCourseDetail('1').catch(() => null)
            assert.ok(!result || result.code !== 200)
        })
        for (const id of [undefined, null, '', '2', 'sample-book-1', true, {}, '01', ' 1 ']) {
            test(`reject mismatched/missing identity ${String(id)} ${label}`, async () => {
                // Explicit undefined must not activate the fixture's default parameter.
                const invalid = loadCourse(flags, url => {
                    const response = responseFor(url, id)
                    if (!url.endsWith('/words') && !url.endsWith('/video/')) {
                        (response.data.book || response.data.course).id = id
                    }
                    return response
                })
                await assert.rejects(invalid.getCourseDetail('1'))
            })
        }
        test(`same course numeric/string identity and owned content ${label}`, async () => {
            const service = loadCourse(flags, url => responseFor(url))
            const response = await service.getCourseDetail('1')
            assert.strictEqual(String(response.data.course.id), '1')
            assert.strictEqual(response.data.chapters[0].id, 'chapter-a')
            assert.strictEqual(response.data.words.length, enableContentApi ? 1 : 0)
            assert.ok(!JSON.stringify(response).includes('sample-book-1'))
        })
        for (const enableLocalTestMedia of [false, true]) {
            test(`explicit sample remains available media=${enableLocalTestMedia} ${label}`, async () => {
                const service = loadCourse({ ...flags, enableLocalTestMedia }, () => { throw new Error('unexpected network') })
                const response = await service.getCourseDetail('sample-book-1')
                assert.strictEqual(response.data.course.id, 'sample-book-1')
                assert.strictEqual(response.data.words.length, 1247)
                assert.strictEqual(Boolean(response.data.chapters[0].videos[0].url), enableLocalTestMedia)
                assert.strictEqual(service.calls.length, 0)
            })
        }
    }
    for (const field of ['chapters', 'words']) {
        test(`reject foreign ${field} ownership contentApi=${enableContentApi}`, async () => {
            const service = loadCourse({ enableContentApi }, url => {
                const response = responseFor(url)
                if (field === 'words' && url.endsWith('/words')) response.data.words[0].book_id = 2
                if (field === 'words' && !enableContentApi && !url.endsWith('/video/')) response.data.words = [{ id: 3, course_id: 2 }]
                if (field === 'chapters' && url.endsWith('/video/')) response.data.chapters[0].course_id = 2
                if (field === 'chapters' && response.data.book) response.data.book.chapters[0].book_id = 2
                return response
            })
            await assert.rejects(service.getCourseDetail('1'))
        })
    }
}

for (const enableContentApi of [false, true]) {
    for (const requestedId of [0, '0']) {
        for (const identity of [{ id: 0 }, { id: '0' }, { book_id: 0 }, { id: 0, book_id: '0' }]) {
            test(`zero ID request=${JSON.stringify(requestedId)} identity=${JSON.stringify(identity)} contentApi=${enableContentApi}`, async () => {
                const service = loadCourse({ enableContentApi }, url => {
                    const response = responseFor(url, 0)
                    if (!url.endsWith('/words') && !url.endsWith('/video/')) {
                        const course = response.data.book || response.data.course
                        delete course.id
                        Object.assign(course, identity)
                    }
                    return response
                })
                const result = await service.getCourseDetail(requestedId)
                assert.strictEqual(String(result.data.course.id), '0')
                assert.strictEqual(result.data.chapters[0].id, 'chapter-a')
                assert.strictEqual(result.data.words.length, enableContentApi ? 1 : 0)
            })
        }
        for (const id of [false, null, '', undefined, 1]) {
            test(`zero alias cannot hide dirty/conflicting ID=${String(id)} request=${JSON.stringify(requestedId)} contentApi=${enableContentApi}`, async () => {
                const service = loadCourse({ enableContentApi, enableLocalSampleFallback: true }, url => {
                    const response = responseFor(url, 0)
                    if (!url.endsWith('/words') && !url.endsWith('/video/')) {
                        Object.assign(response.data.book || response.data.course, { id, book_id: 0 })
                    }
                    return response
                })
                await assert.rejects(service.getCourseDetail(requestedId))
            })
        }
    }
}

for (const videoFailure of ['reject', 'non-success']) {
    test(`legacy ${videoFailure} video retains normalized same-course empty media`, async () => {
        const service = loadCourse({}, url => {
            if (url.endsWith('/video/')) {
                if (videoFailure === 'reject') throw new Error('video offline')
                return { code: 503 }
            }
            return { code: 200, data: { course: { book_id: 1, book_name: 'Legacy course' } } }
        })
        const response = await service.getCourseDetail('1')
        assert.strictEqual(response.data.course.id, 1)
        assert.strictEqual(response.data.course.title, 'Legacy course')
        assert.strictEqual(response.data.chapters.length, 0)
        assert.strictEqual(response.data.words.length, 0)
    })
}

for (const location of ['envelope', 'course', 'book', 'video']) {
    test(`legacy video rejects foreign identity in ${location}`, async () => {
        const service = loadCourse({ enableLocalSampleFallback: true }, url => {
            const response = responseFor(url)
            if (url.endsWith('/video/')) {
                if (location === 'envelope') response.data.course_id = 2
                if (location === 'course') response.data.course = { id: 2 }
                if (location === 'book') response.data.book = { id: 2 }
                if (location === 'video') response.data.chapters[0].videos = [{ id: 'foreign-video', bookId: 2 }]
            }
            return response
        })
        await assert.rejects(service.getCourseDetail('1'))
    })
}

for (const enableLocalSampleFallback of [false, true]) {
    for (const field of ['course_id', 'courseId', 'book_id', 'bookId']) {
        test(`content words rejects foreign envelope ${field} fallback=${enableLocalSampleFallback}`, async () => {
            const service = loadCourse({ enableContentApi: true, enableLocalSampleFallback }, url => {
                const response = responseFor(url)
                if (url.endsWith('/words')) response.data[field] = 2
                return response
            })
            await assert.rejects(service.getCourseDetail('1'))
        })
    }
    test(`content words accepts equivalent envelope identity fallback=${enableLocalSampleFallback}`, async () => {
        const service = loadCourse({ enableContentApi: true, enableLocalSampleFallback }, url => {
            const response = responseFor(url)
            if (url.endsWith('/words')) response.data.course_id = '1'
            return response
        })
        const response = await service.getCourseDetail(1)
        assert.strictEqual(response.data.words[0].book_id, 1)
    })
}

for (const enableContentApi of [false, true]) {
    for (const id of [false, null, '', undefined]) {
        test(`explicit dirty id cannot use book_id alias id=${String(id)} contentApi=${enableContentApi}`, async () => {
            const service = loadCourse({ enableContentApi, enableLocalSampleFallback: true }, url => {
                const response = responseFor(url)
                if (!url.endsWith('/words') && !url.endsWith('/video/')) {
                    Object.assign(response.data.book || response.data.course, { id, book_id: 1 })
                }
                return response
            })
            await assert.rejects(service.getCourseDetail('1'))
        })
    }
    test(`absent id remains compatible with book_id alias contentApi=${enableContentApi}`, async () => {
        const service = loadCourse({ enableContentApi }, url => {
            const response = responseFor(url)
            if (!url.endsWith('/words') && !url.endsWith('/video/')) {
                const course = response.data.book || response.data.course
                delete course.id
                course.book_id = 1
            }
            return response
        })
        assert.strictEqual((await service.getCourseDetail('1')).data.course.id, 1)
    })
}

for (const wordsFailure of ['reject', 'non-success']) {
    test(`content words ${wordsFailure} cannot mix valid book with sample words`, async () => {
        const service = loadCourse({ enableContentApi: true, enableLocalSampleFallback: true }, url => {
            if (url.endsWith('/words')) {
                if (wordsFailure === 'reject') throw new Error('words offline')
                return { code: 503 }
            }
            return responseFor(url)
        })
        await assert.rejects(service.getCourseDetail('1'))
    })
}

function copyAndFreeze(value) {
    if (!value || typeof value !== 'object') return value
    const copy = Array.isArray(value) ? [] : {}
    for (const key of Object.keys(value)) copy[key] = copyAndFreeze(value[key])
    Object.freeze(value)
    return copy
}

const ownerConflicts = ['courseId', 'course_id', 'bookId', 'book_id'].map(field => ({
    name: field, owner: { [field]: 2 }
}))
for (const entity of ['book', 'course']) {
    ownerConflicts.push({ name: `${entity}.id`, owner: { [entity]: { id: 2, course_id: 2 } } })
    for (const id of [false, null, '', undefined]) {
        ownerConflicts.push({ name: `${entity}.dirtyId=${String(id)}`, owner: { [entity]: { id, book_id: 1 } } })
    }
    for (const field of ['courseId', 'course_id', 'bookId', 'book_id']) {
        ownerConflicts.push({ name: `${entity}.${field}`, owner: { [entity]: { id: 1, [field]: 2 } } })
    }
}

for (const envelope of ['book', 'words']) {
    for (const { name, owner } of ownerConflicts) {
        test(`raw ${envelope} envelope rejects ${name} without mutation`, async () => {
            const book = responseFor('/api/v1/books/1')
            const words = responseFor('/api/v1/books/1/words')
            Object.assign(envelope === 'book' ? book.data : words.data, owner)
            const originals = { book, words }
            const before = copyAndFreeze(originals)
            const service = loadCourse({ enableContentApi: true, enableLocalSampleFallback: true }, url =>
                url.endsWith('/words') ? words : book)
            await assert.rejects(service.getCourseDetail('1'))
            assert.deepStrictEqual(originals, before)
        })
    }
    test(`raw ${envelope} envelope accepts matching aliases and unrelated word IDs without mutation`, async () => {
        const book = responseFor('/api/v1/books/1')
        const words = responseFor('/api/v1/books/1/words')
        Object.assign(envelope === 'book' ? book.data : words.data, {
            courseId: 1, course_id: '1', bookId: '1', book_id: 1,
            book: { book_id: 1, courseId: '1' },
            course: { id: '1', book_id: 1, course_id: '1' }
        })
        const originals = { book, words }
        const before = copyAndFreeze(originals)
        const service = loadCourse({ enableContentApi: true }, url => url.endsWith('/words') ? words : book)
        const result = await service.getCourseDetail('1')
        assert.strictEqual(String(result.data.course.id), '1')
        assert.strictEqual(result.data.words[0].id, 'word-a')
        assert.deepStrictEqual(originals, before)
    })
}

test('content book 1 retains configured local word audio', async () => {
    const audioIndex = require('../data/content_samples/book_1_audio.js')
    const wordId = Object.keys(audioIndex)[0]
    for (const enableLocalWordAudio of [false, true]) {
        const service = loadCourse({ enableContentApi: true, enableLocalWordAudio }, url => {
            const response = responseFor(url)
            if (url.endsWith('/words')) response.data.words = [{ id: wordId, word: 'слово' }]
            return response
        })
        const response = await service.getCourseDetail('1')
        assert.strictEqual(response.data.words[0].audioUrl, enableLocalWordAudio ? `/wordaudio/${audioIndex[wordId]}` : undefined)
    }
})

;(async () => {
    let failed = 0
    for (const { name, run } of tests) {
        try { await run() } catch (error) {
            failed += 1
            console.error(`FAIL ${name}: ${error.message}`)
        }
    }
    console.log(`course identity fallback: ${tests.length - failed}/${tests.length} passed`)
    if (failed) process.exitCode = 1
})()
