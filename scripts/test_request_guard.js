const fs = require('fs')
const vm = require('vm')
const assert = require('assert')

const source = fs.readFileSync('utils/request.js', 'utf8')
    .replace("import config from '../config'", "const config = { enableRemoteWrites: false, enableDebugLog: false, baseUrl: 'http://local.test' }")
    .replace('export default request', 'module.exports = request')
let requestCount = 0
let requestedUrl = ''
let responseStatus = 200
let authorization = ''
const context = {
    module: { exports: {} },
    wx: {
        getStorageSync: () => 'private-user-token',
        request: options => {
            requestCount += 1
            requestedUrl = options.url
            authorization = options.header.Authorization
            options.success({ statusCode: responseStatus, data: { code: responseStatus } })
        },
        removeStorageSync: () => {},
        showToast: () => {},
        switchTab: () => {}
    },
    console
}
vm.runInNewContext(source, context)
const request = context.module.exports

;(async () => {
    await assert.rejects(request({ url: '/write', method: 'POST' }), /remote writes are disabled/)
    assert.strictEqual(requestCount, 0)
    const response = await request({ baseUrl: 'http://local.test/', url: '/read', method: 'GET' })
    assert.strictEqual(response.code, 200)
    assert.strictEqual(requestCount, 1)
    assert.strictEqual(requestedUrl, 'http://local.test/read')
    assert.strictEqual(authorization, 'Bearer private-user-token')
    await request({ baseUrl: 'http://local.test', url: '/public-dictionary', method: 'GET', skipAuth: true })
    assert.strictEqual(authorization, '', 'public local dictionary must not receive a user token')
    responseStatus = 201
    const created = await request({ baseUrl: 'http://local.test', url: '/created', method: 'GET' })
    assert.strictEqual(created.code, 201)
    responseStatus = 204
    const empty = await request({ baseUrl: 'http://local.test', url: '/empty', method: 'GET' })
    assert.strictEqual(empty.code, 204)
    console.log('request guard tests: PASS')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
