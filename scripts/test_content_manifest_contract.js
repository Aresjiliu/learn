const assert = require('assert')
const fs = require('fs')

const source = fs.readFileSync('services/content-api.js', 'utf8')
assert.ok(source.includes("String(response.data.contentVersion || '').trim()"))
assert.ok(source.includes('Array.isArray(response.data.capabilities)'))
assert.ok(source.includes("if (config.enableLocalSampleFallback) return localManifest()"))
console.log('content manifest contract tests: PASS')
