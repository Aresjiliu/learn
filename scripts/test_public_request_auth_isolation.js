const fs = require('fs')
const path = require('path')
const vm = require('vm')
const assert = require('assert')

// Load the real request module; replace only its module syntax and config boundary.
const source = fs.readFileSync(path.join(__dirname, '../utils/request.js'), 'utf8')
    .replace("import config from '../config'", 'const config = testConfig')
    .replace('export default request', 'module.exports = request')

function loadRequest({ token = 'fixture-token', storageError = null } = {}) {
    const storage = new Map([['token', token], ['userInfo', { id: 'fixture-user' }]])
    const calls = { reads: [], removals: [], toasts: [], tabs: [], requests: [] }
    const context = {
        module: { exports: {} },
        testConfig: {
            baseUrl: 'https://fixture.invalid',
            enableRemoteWrites: false,
            enableDebugLog: false
        },
        wx: {
            getStorageSync(key) {
                calls.reads.push(key)
                if (storageError) throw storageError
                return storage.get(key)
            },
            removeStorageSync(key) {
                calls.removals.push(key)
                storage.delete(key)
            },
            showToast(options) {
                calls.toasts.push(options)
                options.success()
            },
            switchTab(options) {
                calls.tabs.push(options)
            },
            request(options) {
                calls.requests.push(options)
            }
        }
    }
    vm.runInNewContext(source, context, { filename: 'utils/request.js' })
    return { request: context.module.exports, storage, calls }
}

function assertNoSessionEffects(harness) {
    assert.deepStrictEqual(harness.calls.removals, [], 'must not delete session storage')
    assert.deepStrictEqual(harness.calls.toasts, [], 'must not show login toast')
    assert.deepStrictEqual(harness.calls.tabs, [], 'must not navigate to profile')
    assert.strictEqual(harness.storage.size, 2)
}

const tests = []
function test(name, run) {
    tests.push({ name, run })
}

test('public 401 rejects its payload without clearing the existing session', async () => {
    const harness = loadRequest()
    const payload = { code: 401, message: 'public endpoint denied' }
    const pending = harness.request({ url: '/dictionary/search', skipAuth: true })
    const rejected = assert.rejects(pending, error => error === payload)
    harness.calls.requests[0].success({ statusCode: 401, data: payload })
    await rejected
    assertNoSessionEffects(harness)
    assert.strictEqual(harness.storage.get('token'), 'fixture-token')
    assert.strictEqual(harness.storage.get('userInfo').id, 'fixture-user')
    assert.deepStrictEqual(harness.calls.reads, [])
    assert.strictEqual(harness.calls.requests[0].header.Authorization, '')
})

for (const storageMode of ['present', 'missing', 'throws']) {
    for (const statusCode of [200, 401]) {
        test(`public ${statusCode} never reads token storage (${storageMode})`, async () => {
            const harness = loadRequest({
                token: storageMode === 'missing' ? '' : 'fixture-token',
                storageError: storageMode === 'throws' ? new Error('fixture storage unavailable') : null
            })
            const payload = { code: statusCode }
            const pending = harness.request({ url: '/content/words', skipAuth: true })
            const outcome = statusCode === 401
                ? assert.rejects(pending, error => error === payload)
                : pending.then(data => assert.strictEqual(data, payload))
            assert.strictEqual(harness.calls.requests.length, 1)
            assert.strictEqual(harness.calls.requests[0].header.Authorization, '')
            harness.calls.requests[0].success({ statusCode, data: payload })
            await outcome
            assert.deepStrictEqual(harness.calls.reads, [], 'public requests must not read token')
            assertNoSessionEffects(harness)
        })
    }
}

for (const token of ['fixture-token', '']) {
    test(`protected 401 preserves existing logout behavior (${token ? 'token present' : 'token missing'})`, async () => {
        const harness = loadRequest({ token })
        const payload = { code: 401 }
        const pending = harness.request({ url: '/courses' })
        const rejected = assert.rejects(pending, error => error === payload)
        assert.deepStrictEqual(harness.calls.reads, ['token'])
        assert.strictEqual(harness.calls.requests[0].header.Authorization, token ? `Bearer ${token}` : '')
        harness.calls.requests[0].success({ statusCode: 401, data: payload })
        await rejected
        assert.deepStrictEqual(harness.calls.removals, ['token', 'userInfo'])
        assert.strictEqual(harness.storage.size, 0)
        assert.strictEqual(harness.calls.toasts.length, 1)
        assert.strictEqual(harness.calls.toasts[0].title, '请先登录')
        assert.strictEqual(harness.calls.tabs.length, 1)
        assert.strictEqual(harness.calls.tabs[0].url, '/pages/profile/profile')
    })
}

test('protected token read failure keeps its existing synchronous error boundary', () => {
    const storageError = new Error('fixture storage unavailable')
    const harness = loadRequest({ storageError })
    assert.throws(() => harness.request({ url: '/courses' }), error => error === storageError)
    assert.deepStrictEqual(harness.calls.reads, ['token'])
    assert.strictEqual(harness.calls.requests.length, 0)
    assertNoSessionEffects(harness)
})

test('protected login 401 still clears storage without toast or navigation', async () => {
    const harness = loadRequest()
    const payload = { code: 401 }
    const pending = harness.request({ url: '/login/password' })
    const rejected = assert.rejects(pending, error => error === payload)
    harness.calls.requests[0].success({ statusCode: 401, data: payload })
    await rejected
    assert.deepStrictEqual(harness.calls.removals, ['token', 'userInfo'])
    assert.strictEqual(harness.calls.toasts.length, 0)
    assert.strictEqual(harness.calls.tabs.length, 0)
})

for (const skipAuth of [true, false]) {
    for (const statusCode of [200, 201, 204, 299, 400, 500]) {
        test(`${skipAuth ? 'public' : 'protected'} ${statusCode} keeps response semantics`, async () => {
            const harness = loadRequest()
            const payload = { code: statusCode }
            const pending = harness.request({
                url: '/words', baseUrl: 'https://content.invalid///', skipAuth
            })
            const outcome = statusCode < 300
                ? pending.then(data => assert.strictEqual(data, payload))
                : assert.rejects(pending, error => error === payload)
            const sent = harness.calls.requests[0]
            assert.strictEqual(sent.url, 'https://content.invalid/words')
            assert.strictEqual(sent.method, 'GET')
            assert.strictEqual(sent.timeout, 10000)
            assert.strictEqual(sent.header.Authorization, skipAuth ? '' : 'Bearer fixture-token')
            sent.success({ statusCode, data: payload })
            await outcome
            assertNoSessionEffects(harness)
        })
    }
    for (const method of ['POST', 'put', 'PATCH', 'DELETE']) {
        test(`${skipAuth ? 'public' : 'protected'} ${method} stays blocked when remote writes are disabled`, async () => {
            const harness = loadRequest({ storageError: new Error('must not reach storage') })
            await assert.rejects(harness.request({ url: '/write', method, skipAuth }), /remote writes are disabled/)
            assert.deepStrictEqual(harness.calls.reads, [])
            assert.strictEqual(harness.calls.requests.length, 0)
            assertNoSessionEffects(harness)
        })
    }
    for (const [errMsg, message] of [
        ['', '网络请求失败'],
        ['request:fail connection refused', '服务器连接失败，请检查网络设置'],
        ['request:fail timeout', '请求超时，请重试']
    ]) {
        test(`${skipAuth ? 'public' : 'protected'} failure keeps error mapping (${errMsg || 'unspecified'})`, async () => {
            const harness = loadRequest()
            const pending = harness.request({ url: '/words', method: 'GET', skipAuth })
            const rejected = assert.rejects(pending, error => {
                assert.strictEqual(error.code, -1)
                assert.strictEqual(error.message, message)
                assert.strictEqual(error.requestInfo.url, 'https://fixture.invalid/words')
                assert.strictEqual(error.requestInfo.method, 'GET')
                return true
            })
            harness.calls.requests[0].fail({ errMsg })
            await rejected
            assertNoSessionEffects(harness)
        })
    }
}

;(async () => {
    let failed = 0
    for (const { name, run } of tests) {
        try {
            await run()
            console.log(`PASS ${name}`)
        } catch (error) {
            failed += 1
            console.error(`FAIL ${name}\n${error.stack}`)
        }
    }
    console.log(`public request auth isolation: ${tests.length - failed}/${tests.length} passed; ${failed} failed`)
    if (failed) process.exitCode = 1
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
