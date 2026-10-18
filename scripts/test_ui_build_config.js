const assert = require('assert')
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const json = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
const project = json('project.config.json')
const pkg = json('package.json')
const lock = json('package-lock.json')
assert.strictEqual(pkg.private, true)
assert.strictEqual(pkg.dependencies['@vant/weapp'], '1.11.7')
assert.deepStrictEqual(Object.keys(pkg.dependencies), ['@vant/weapp'])
assert.strictEqual(lock.packages['node_modules/@vant/weapp'].version, '1.11.7')
assert.strictEqual(lock.packages['node_modules/@vant/weapp'].integrity,
    'sha512-Rwn9BBnb4kHSV4XmvBicwtd42J+amEUfnFDcXJsGNPNX4a9c/DoT6YLsm4X1wB2+sQbdiQsbFBLAvGRBxCkD8g==')
assert.strictEqual(pkg.devDependencies['@vant/icons'], '3.0.1')
assert.strictEqual(lock.packages['node_modules/@vant/icons'].version, '3.0.1')
assert.strictEqual(lock.packages['node_modules/@vant/icons'].integrity,
    'sha512-/TM5NWT751o2g5BbDlFjW+gEBAtAQi/uoIZiC6dcH27s3TdIOausxcOvFC+6hHsMKXLieAYnNYSBja9hsHeqvQ==')
assert.strictEqual(project.setting.packNpmManually, true,
    'IDE configuration must identify the application manifest; CLI behavior is checked separately')
assert.deepStrictEqual(project.setting.packNpmRelationList, [{
    packageJsonPath: './package.json', miniprogramNpmDistDir: './'
}])
for (const folder of ['ui', 'node_modules']) {
    assert.ok(project.packOptions.ignore.some(item => item.type === 'folder' && item.value === folder))
}
console.log('UI dependency pin and intended IDE npm mapping: PASS')
