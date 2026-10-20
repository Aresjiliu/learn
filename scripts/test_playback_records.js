const fs = require('fs')
const assert = require('assert')
const vm = require('vm')

const names = ['STORAGE_KEY', 'RECENT_COURSE_KEY', 'RECENT_VIDEO_KEY', 'PLAYBACK_RECORDS_KEY',
    'getRecentCourse', 'saveRecentCourse', 'getRecentVideo', 'saveRecentVideo',
    'getVideoProgress', 'saveVideoProgress', 'getPlaybackRecord', 'getRecentPlayback', 'savePlaybackRecord']
const source = fs.readFileSync('services/playback-progress.js', 'utf8').replace(/export\s*\{[\s\S]*?\}\s*$/, '')
const context = { module: { exports: {} } }
vm.runInNewContext(`${source}\nmodule.exports = {${names.map(name => `${name}: typeof ${name} === 'undefined' ? undefined : ${name}`).join(',')}}`, context)
const api = context.module.exports
const key = 'playback_records_v2'
const plain = value => JSON.parse(JSON.stringify(value))
const record = (courseId = 'c', videoId = 'v', position = 12) => ({ courseId, videoId, position, duration: 0 })
function fixture(values = {}) {
    return {
        values, writes: [],
        getStorageSync(name) { return this.values[name] },
        setStorageSync(name, value) { this.writes.push(name); this.values[name] = value }
    }
}
function legacy(position) {
    if (arguments.length === 0) position = 23
    return fixture({
        [api.RECENT_COURSE_KEY]: 'c',
        [api.RECENT_VIDEO_KEY]: { c: 'v', other: 'v' },
        [api.STORAGE_KEY]: { v: position }
    })
}
function root(records, recent = { courseId: 'c', videoId: 'v' }) {
    return { version: 2, records, recent }
}
function expectRead(result, expected) {
    assert.strictEqual(result.ok, true)
    assert.strictEqual(typeof result.reason, 'string')
    assert.deepStrictEqual(plain(result.record), expected)
}
function expectFailure(result) {
    assert.strictEqual(result.ok, false)
    assert.strictEqual(typeof result.reason, 'string')
    assert.ok(result.reason.length > 0)
}
const tests = []
function test(name, run) { tests.push({ name, run }) }

test('exports the v2 storage contract', () => {
    assert.strictEqual(api.PLAYBACK_RECORDS_KEY, key)
    for (const name of names.slice(-3)) assert.strictEqual(typeof api[name], 'function')
})
test('wx missing values are empty and reads never write', () => {
    for (const missing of ['', undefined]) {
        const storage = fixture({ [key]: missing })
        expectRead(api.getPlaybackRecord(storage, 'c', 'v'), null)
        expectRead(api.getRecentPlayback(storage), null)
        assert.deepStrictEqual(storage.writes, [])
        assert.strictEqual(api.savePlaybackRecord(storage, record()).ok, true)
    }
})
test('saves a whitelist snapshot and returns the most recent record', () => {
    const storage = fixture()
    const input = { ...record(), courseTitle: '俄语', videoTitle: '第一课', mediaURL: 'secret', token: 'secret', course: { token: 'secret' } }
    assert.strictEqual(api.savePlaybackRecord(storage, input).ok, true)
    const expected = { ...record(), courseTitle: '俄语', videoTitle: '第一课' }
    assert.deepStrictEqual(plain(storage.values[key]), root([expected]))
    expectRead(api.getRecentPlayback(storage), expected)
    assert.deepStrictEqual(storage.writes, [key])
})
test('course identity and JSON tuple keys prevent collisions', () => {
    const storage = fixture()
    const pairs = [['a', 'v'], ['b', 'v'], ['a:b', 'c'], ['a', 'b:c'], ['__proto__', 'constructor']]
    pairs.forEach(([c, v], index) => assert.strictEqual(api.savePlaybackRecord(storage, record(c, v, index)).ok, true))
    pairs.forEach(([c, v], index) => expectRead(api.getPlaybackRecord(storage, c, v), record(c, v, index)))
    assert.strictEqual(storage.values[key].records.length, pairs.length)
})
test('numeric zero IDs normalize to strings and share identity with string IDs', () => {
    const storage = fixture()
    assert.strictEqual(api.savePlaybackRecord(storage, { courseId: 0, videoId: 0, position: 0 }).ok, true)
    expectRead(api.getPlaybackRecord(storage, 0, 0), record('0', '0', 0))
    assert.strictEqual(api.savePlaybackRecord(storage, record('0', '0', 3)).ok, true)
    assert.strictEqual(storage.values[key].records.length, 1)
    expectRead(api.getRecentPlayback(storage), record('0', '0', 3))
})
test('last actual position including zero wins instead of maximum', () => {
    const storage = fixture()
    for (const position of [70, 12.5, 0]) {
        assert.strictEqual(api.savePlaybackRecord(storage, record('c', 'v', position)).ok, true)
        expectRead(api.getPlaybackRecord(storage, 'c', 'v'), record('c', 'v', position))
    }
})
test('retrying A after successful B can update A without taking over recent B', () => {
    const storage = fixture()
    assert.strictEqual(api.savePlaybackRecord(storage, record('a', 'first', 10)).ok, true)
    assert.strictEqual(api.savePlaybackRecord(storage, record('b', 'second', 20)).ok, true)
    const previous = storage.values[key]
    assert.strictEqual(api.savePlaybackRecord(storage, record('a', 'first', 15), { makeRecent: false }).ok, true)
    expectRead(api.getPlaybackRecord(storage, 'a', 'first'), record('a', 'first', 15))
    expectRead(api.getRecentPlayback(storage), record('b', 'second', 20))
    assert.deepStrictEqual(plain(storage.values[key]), root([
        record('a', 'first', 15), record('b', 'second', 20)
    ], { courseId: 'b', videoId: 'second' }))
    assert.deepStrictEqual(plain(previous), root([
        record('a', 'first', 10), record('b', 'second', 20)
    ], { courseId: 'b', videoId: 'second' }))
})
test('makeRecent false initializes a missing root and can add records without changing recent', () => {
    const storage = fixture()
    assert.strictEqual(api.savePlaybackRecord(storage, record(), { makeRecent: false }).ok, true)
    expectRead(api.getRecentPlayback(storage), record())
    assert.strictEqual(api.savePlaybackRecord(storage, record('other', 'next'), { makeRecent: false }).ok, true)
    expectRead(api.getRecentPlayback(storage), record())
    expectRead(api.getPlaybackRecord(storage, 'other', 'next'), record('other', 'next'))
})
test('only explicit makeRecent false suppresses the default recent update', () => {
    const storage = fixture()
    for (const options of [undefined, {}, { makeRecent: true }, { makeRecent: 0 }, { makeRecent: 'false' }]) {
        api.savePlaybackRecord(storage, record('a', 'first'))
        assert.strictEqual(api.savePlaybackRecord(storage, record('b', 'second'), options).ok, true)
        expectRead(api.getRecentPlayback(storage), record('b', 'second'))
    }
})
test('duration defaults to zero and does not clamp actual position', () => {
    const storage = fixture()
    assert.strictEqual(api.savePlaybackRecord(storage, { courseId: 'c', videoId: 'v', position: 50.5 }).ok, true)
    expectRead(api.getRecentPlayback(storage), record('c', 'v', 50.5))
    assert.strictEqual(api.savePlaybackRecord(storage, { ...record(), duration: 2.5 }).ok, true)
    expectRead(api.getRecentPlayback(storage), { ...record(), duration: 2.5 })
})
test('rejects invalid inputs atomically', () => {
    const invalid = [null, [], {}, { ...record(), position: undefined }]
    for (const field of ['courseId', 'videoId']) {
        for (const value of [null, undefined, {}, [], true, NaN, Infinity, -Infinity]) invalid.push({ ...record(), [field]: value })
    }
    for (const field of ['position', 'duration']) {
        for (const value of [-1, NaN, Infinity, -Infinity, '3', null, {}, true]) invalid.push({ ...record(), [field]: value })
    }
    for (const field of ['courseTitle', 'videoTitle']) {
        for (const value of [null, 3, {}, '😀'.repeat(257)]) invalid.push({ ...record(), [field]: value })
    }
    for (const input of invalid) {
        const storage = fixture({ [key]: root([record()]) })
        const before = plain(storage.values)
        expectFailure(api.savePlaybackRecord(storage, input))
        assert.deepStrictEqual(storage.values, before)
        assert.deepStrictEqual(storage.writes, [])
    }
})
test('title limit counts Unicode codepoints without cropping', () => {
    const storage = fixture()
    const input = { ...record(), courseTitle: '😀'.repeat(256), videoTitle: '' }
    assert.strictEqual(api.savePlaybackRecord(storage, input).ok, true)
    expectRead(api.getRecentPlayback(storage), input)
    expectFailure(api.savePlaybackRecord(storage, { ...input, courseTitle: input.courseTitle + 'x' }))
    expectRead(api.getRecentPlayback(storage), input)
})
test('invalid lookup IDs return errors without writes', () => {
    const storage = fixture()
    for (const id of [null, undefined, {}, [], true, NaN, Infinity]) {
        expectFailure(api.getPlaybackRecord(storage, id, 'v'))
        expectFailure(api.getPlaybackRecord(storage, 'c', id))
    }
    assert.deepStrictEqual(storage.writes, [])
})
test('empty and whitespace IDs are rejected while nonblank IDs retain exact identity', () => {
    for (const id of ['', ' ', '\t\r\n', '\u3000', '\u00a0']) {
        const storage = fixture()
        for (const field of ['courseId', 'videoId']) {
            expectFailure(api.savePlaybackRecord(storage, { ...record(), [field]: id }))
        }
        expectFailure(api.getPlaybackRecord(storage, id, 'v'))
        expectFailure(api.getPlaybackRecord(storage, 'c', id))
        assert.deepStrictEqual(storage.writes, [])
    }
    const storage = fixture()
    const spaced = record(' c ', '\tv\n')
    assert.strictEqual(api.savePlaybackRecord(storage, spaced).ok, true)
    expectRead(api.getPlaybackRecord(storage, ' c ', '\tv\n'), spaced)
    expectRead(api.getPlaybackRecord(storage, 'c', 'v'), null)
    expectRead(api.getRecentPlayback(storage), spaced)
})
test('blank stored identities are corrupt and never overwritten', () => {
    const corrupt = [
        root([{ ...record(), courseId: '' }]),
        root([{ ...record(), videoId: '\t ' }]),
        root([record()], { courseId: ' ', videoId: 'v' }),
        root([record()], { courseId: 'c', videoId: '' })
    ]
    for (const value of corrupt) {
        const storage = legacy()
        storage.values[key] = value
        const before = plain(storage.values)
        expectFailure(api.getPlaybackRecord(storage, 'c', 'v'))
        expectFailure(api.getRecentPlayback(storage))
        expectFailure(api.savePlaybackRecord(storage, record()))
        assert.deepStrictEqual(storage.values, before)
        assert.deepStrictEqual(storage.writes, [])
    }
})
test('dangling recent pointers are corrupt and never overwritten', () => {
    const corrupt = [
        root([record()], { courseId: 'missing', videoId: 'v' }),
        root([record()], { courseId: 'c', videoId: 'missing' }),
        root([])
    ]
    for (const value of corrupt) {
        const storage = legacy()
        storage.values[key] = value
        const before = plain(storage.values)
        for (const result of [api.getPlaybackRecord(storage, 'c', 'v'), api.getRecentPlayback(storage)]) {
            expectFailure(result)
            assert.strictEqual(result.record, null)
        }
        expectFailure(api.savePlaybackRecord(storage, record()))
        assert.deepStrictEqual(storage.values, before)
        assert.deepStrictEqual(storage.writes, [])
    }
})
test('corrupt and unknown v2 roots are read-only and block legacy fallback', () => {
    const corrupt = [null, false, 0, 'bad', [], {}, { version: 3, records: [] },
        { version: '2', records: [] }, { version: 2, records: {} },
        root([record(), record()]), root([record(0, 0), record('0', '0')]),
        root([{ ...record(), position: '4' }]), root([{ ...record(), duration: -1 }]),
        root([{ ...record(), videoTitle: 'x'.repeat(257) }]),
        root([record()], 'bad'), root([record()], { courseId: null, videoId: 'v' }),
        root(Array.from({ length: 201 }, (_, i) => record('c', String(i))))]
    for (const value of corrupt) {
        const storage = legacy()
        storage.values[key] = value
        const before = plain(storage.values)
        for (const result of [api.getPlaybackRecord(storage, 'c', 'v'), api.getRecentPlayback(storage)]) {
            expectFailure(result)
            assert.strictEqual(result.record, null)
        }
        expectFailure(api.savePlaybackRecord(storage, record()))
        assert.deepStrictEqual(storage.values, before)
        assert.deepStrictEqual(storage.writes, [])
    }
})
test('capacity permits updates but refuses a 201st distinct record without eviction', () => {
    const storage = fixture()
    for (let i = 0; i < 200; i++) assert.strictEqual(api.savePlaybackRecord(storage, record('c', String(i))).ok, true)
    const before = plain(storage.values)
    expectFailure(api.savePlaybackRecord(storage, record('c', 'overflow')))
    assert.deepStrictEqual(plain(storage.values), before)
    assert.strictEqual(storage.writes.length, 200)
    assert.strictEqual(api.savePlaybackRecord(storage, record('c', '0', 0)).ok, true)
    assert.strictEqual(storage.values[key].records.length, 200)
    expectRead(api.getRecentPlayback(storage), record('c', '0', 0))
})
test('input, returned records, and saved snapshots have no shared mutable references', () => {
    const storage = fixture()
    const input = record()
    api.savePlaybackRecord(storage, input)
    const first = storage.values[key]
    input.position = 99
    const read = api.getPlaybackRecord(storage, 'c', 'v')
    read.record.position = 100
    const recent = api.getRecentPlayback(storage)
    recent.record.courseTitle = 'mutated'
    expectRead(api.getPlaybackRecord(storage, 'c', 'v'), record())
    api.savePlaybackRecord(storage, record('other', 'next'))
    storage.values[key].records[0].position = 456
    assert.deepStrictEqual(plain(first), root([record()]))
})
test('read failures and missing storage methods never escape', () => {
    const throwing = { getStorageSync() { throw new Error('read failure') }, setStorageSync() { throw new Error('must not write') } }
    for (const storage of [null, {}, { getStorageSync: 4 }, throwing]) {
        expectFailure(api.getPlaybackRecord(storage, 'c', 'v'))
        expectFailure(api.getRecentPlayback(storage))
        expectFailure(api.savePlaybackRecord(storage, record()))
    }
    const noWriter = { getStorageSync() { return '' } }
    expectFailure(api.savePlaybackRecord(noWriter, record()))
})
test('write failure cannot mutate the existing snapshot even if writer mutates its argument', () => {
    const stored = root([record()])
    const storage = {
        getStorageSync() { return stored },
        setStorageSync(name, value) {
            value.records[0].position = 999
            value.recent.courseId = 'mutated'
            throw new Error('quota')
        }
    }
    expectFailure(api.savePlaybackRecord(storage, record('c', 'v', 2)))
    assert.deepStrictEqual(stored, root([record()]))
})
test('legacy fallback requires both exact bindings and valid numeric position', () => {
    for (const position of [0, 23.5]) {
        const storage = legacy(position)
        const expected = { ...record('c', 'v', position), courseTitle: '', videoTitle: '' }
        expectRead(api.getPlaybackRecord(storage, 'c', 'v'), expected)
        expectRead(api.getRecentPlayback(storage), expected)
        expectRead(api.getPlaybackRecord(storage, 'other', 'v'), null)
        expectRead(api.getPlaybackRecord(storage, 'c', 'other'), null)
        assert.deepStrictEqual(storage.writes, [])
    }
    for (const value of ['23', undefined, null, -1, Infinity, NaN, true]) {
        const storage = legacy(value)
        const before = { ...storage.values, [api.STORAGE_KEY]: { v: value } }
        for (const result of [api.getPlaybackRecord(storage, 'c', 'v'), api.getRecentPlayback(storage)]) {
            expectFailure(result)
            assert.strictEqual(result.reason, 'corrupt_legacy_progress')
            assert.strictEqual(result.record, null)
        }
        assert.deepStrictEqual(storage.values, before)
        assert.deepStrictEqual(storage.writes, [])
    }
    for (const name of [api.RECENT_COURSE_KEY, api.RECENT_VIDEO_KEY]) {
        const storage = legacy()
        delete storage.values[name]
        expectRead(api.getPlaybackRecord(storage, 'c', 'v'), null)
        expectRead(api.getRecentPlayback(storage), null)
    }
})
for (const position of [-1, '12', null]) {
    test(`bound legacy position ${JSON.stringify(position)} reports corruption without mutation`, () => {
        const storage = legacy(position)
        const before = plain(storage.values)
        const results = [api.getRecentPlayback(storage), api.getPlaybackRecord(storage, 'c', 'v')]
        assert.deepStrictEqual(storage.values, before, 'reading corrupt legacy progress must not mutate storage')
        assert.deepStrictEqual(storage.writes, [])
        for (const result of results) {
            assert.deepStrictEqual(plain(result), { ok: false, record: null, reason: 'corrupt_legacy_progress' })
        }
    })
}
test('unbound or missing legacy progress stays legitimate empty history', () => {
    const values = [
        {},
        { [api.RECENT_COURSE_KEY]: 'c', [api.STORAGE_KEY]: { v: -1 } },
        { [api.RECENT_VIDEO_KEY]: { c: 'v' }, [api.STORAGE_KEY]: { v: -1 } },
        { [api.RECENT_COURSE_KEY]: 'c', [api.RECENT_VIDEO_KEY]: { c: 'v' } }
    ]
    for (const progress of [null, '', false, [], {}, { other: -1 }]) {
        values.push({ [api.RECENT_COURSE_KEY]: 'c', [api.RECENT_VIDEO_KEY]: { c: 'v' }, [api.STORAGE_KEY]: progress })
    }
    for (const value of values) {
        const storage = fixture(value)
        const before = plain(value)
        expectRead(api.getRecentPlayback(storage), null)
        expectRead(api.getPlaybackRecord(storage, 'c', 'v'), null)
        assert.deepStrictEqual(storage.values, before)
        assert.deepStrictEqual(storage.writes, [])
    }
    const storage = legacy(-1)
    expectRead(api.getPlaybackRecord(storage, 'other', 'v'), null)
    expectRead(api.getPlaybackRecord(storage, 'c', 'other'), null)
    assert.deepStrictEqual(storage.writes, [])
})
test('valid v2 zero bypasses corrupt legacy progress entirely', () => {
    for (const position of [-1, '12', null]) {
        const storage = legacy(position)
        storage.values[key] = root([record('c', 'v', 0)])
        const before = plain(storage.values)
        const reads = []
        const get = storage.getStorageSync
        storage.getStorageSync = function (name) { reads.push(name); return get.call(this, name) }
        expectRead(api.getRecentPlayback(storage), record('c', 'v', 0))
        expectRead(api.getPlaybackRecord(storage, 'c', 'v'), record('c', 'v', 0))
        assert.deepStrictEqual(reads, [key, key])
        assert.deepStrictEqual(storage.values, before)
        assert.deepStrictEqual(storage.writes, [])
    }
})
test('legacy fallback accepts zero IDs but never inherited map entries', () => {
    const storage = fixture({ [api.RECENT_COURSE_KEY]: 0, [api.RECENT_VIDEO_KEY]: { 0: 0 }, [api.STORAGE_KEY]: { 0: 0 } })
    expectRead(api.getPlaybackRecord(storage, 0, 0), { ...record('0', '0', 0), courseTitle: '', videoTitle: '' })
    const inherited = legacy()
    inherited.values[api.STORAGE_KEY] = Object.create({ v: 9 })
    expectRead(api.getRecentPlayback(inherited), null)
    inherited.values[api.STORAGE_KEY] = { v: 9 }
    inherited.values[api.RECENT_VIDEO_KEY] = Object.create({ c: 'v' })
    expectRead(api.getRecentPlayback(inherited), null)
})
test('v2 zero wins; absent requested v2 record may use exactly bound legacy; recent prefers v2', () => {
    const storage = legacy()
    storage.values[key] = root([record('c', 'v', 0)])
    expectRead(api.getPlaybackRecord(storage, 'c', 'v'), record('c', 'v', 0))
    storage.values[key] = root([record('new', 'next', 4)], { courseId: 'new', videoId: 'next' })
    expectRead(api.getPlaybackRecord(storage, 'c', 'v'), { ...record(), position: 23, courseTitle: '', videoTitle: '' })
    expectRead(api.getPlaybackRecord(storage, 'other', 'v'), null)
    expectRead(api.getRecentPlayback(storage), record('new', 'next', 4))
    const old = plain(storage.values)
    api.savePlaybackRecord(storage, record())
    for (const name of [api.STORAGE_KEY, api.RECENT_COURSE_KEY, api.RECENT_VIDEO_KEY]) assert.deepStrictEqual(storage.values[name], old[name])
    assert.deepStrictEqual(storage.writes, [key])
})
test('legacy fallback storage exceptions return read errors', () => {
    for (const failing of [api.RECENT_COURSE_KEY, api.RECENT_VIDEO_KEY, api.STORAGE_KEY]) {
        const storage = legacy()
        const get = storage.getStorageSync
        storage.getStorageSync = function (name) { if (name === failing) throw new Error('read'); return get.call(this, name) }
        expectFailure(api.getPlaybackRecord(storage, 'c', 'v'))
        expectFailure(api.getRecentPlayback(storage))
        assert.deepStrictEqual(storage.writes, [])
    }
})
test('v2 reads prefer their own record even when all legacy storage reads throw', () => {
    const storage = fixture({ [key]: root([record('c', 'v', 0)]) })
    const get = storage.getStorageSync
    storage.getStorageSync = function (name) {
        if (name !== key) throw new Error('legacy unavailable')
        return get.call(this, name)
    }
    expectRead(api.getPlaybackRecord(storage, 'c', 'v'), record('c', 'v', 0))
    expectRead(api.getRecentPlayback(storage), record('c', 'v', 0))
    assert.deepStrictEqual(storage.writes, [])
})
test('failed storage reads prevent all snapshot writes', () => {
    const writes = []
    const storage = {
        getStorageSync() { throw new Error('read') },
        setStorageSync(name) { writes.push(name) }
    }
    expectFailure(api.savePlaybackRecord(storage, record()))
    assert.strictEqual(api.saveVideoProgress(storage, 'v', 2), false)
    assert.strictEqual(api.saveRecentVideo(storage, 'c', 'v'), false)
    assert.deepStrictEqual(writes, [])
})
test('legacy APIs retain normal behavior and return defaults/false on storage exceptions', () => {
    const storage = fixture()
    assert.strictEqual(api.saveRecentVideo(storage, 'c', 'v'), true)
    assert.strictEqual(api.getRecentCourse(storage), 'c')
    assert.strictEqual(api.getRecentVideo(storage, 'c'), 'v')
    assert.strictEqual(api.saveVideoProgress(storage, 'v', 31.9), true)
    assert.strictEqual(api.getVideoProgress(storage, 'v'), 31)
    for (const broken of [null, {}, { getStorageSync() { throw new Error('read') }, setStorageSync() { throw new Error('write') } }]) {
        assert.strictEqual(api.getRecentCourse(broken), '')
        assert.strictEqual(api.getRecentVideo(broken, 'c'), '')
        assert.strictEqual(api.getVideoProgress(broken, 'v'), 0)
        assert.strictEqual(api.saveRecentCourse(broken, 'c'), false)
        assert.strictEqual(api.saveRecentVideo(broken, 'c', 'v'), false)
        assert.strictEqual(api.saveVideoProgress(broken, 'v', 1), false)
    }
})
test('legacy writes use defensive deep copies on success and failure', () => {
    for (const fail of [false, true]) {
        const progress = { v: 5, nested: { value: 1 } }
        const videos = { c: 'v', nested: { value: 1 } }
        const storage = fixture({ [api.STORAGE_KEY]: progress, [api.RECENT_VIDEO_KEY]: videos })
        storage.setStorageSync = function (name, value) {
            if (value && value.nested) value.nested.value = 9
            if (fail) throw new Error('write')
            this.values[name] = value
        }
        assert.strictEqual(api.saveVideoProgress(storage, 'v', 10), !fail)
        assert.strictEqual(api.saveRecentVideo(storage, 'c', 'next'), !fail)
        assert.deepStrictEqual(progress, { v: 5, nested: { value: 1 } })
        assert.deepStrictEqual(videos, { c: 'v', nested: { value: 1 } })
    }
})

let failures = 0
for (const { name, run } of tests) {
    try { run(); console.log(`PASS ${name}`) } catch (error) {
        failures++
        console.error(`FAIL ${name}: ${error.message}`)
    }
}
console.log(`playback records tests: ${tests.length - failures}/${tests.length} PASS`)
if (failures) process.exitCode = 1
