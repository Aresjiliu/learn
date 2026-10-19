const assert = require('assert')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { collectRuntimeFiles, offlineIconStyle, buildComponents } = require('./build_ui_components')
const source = path.resolve(__dirname, '../node_modules/@vant/weapp/lib')
const files = collectRuntimeFiles(source, ['search', 'icon', 'loading'])
for (const file of ['search/index.js', 'search/index.wxml', 'field/index.js',
    'cell/index.wxml', 'icon/index.wxss', 'info/index.json',
    'common/component.js', 'mixins/basic.js', 'wxs/utils.wxs', 'wxs/bem.wxs']) {
    assert.ok(files.includes(file), 'missing transitive runtime dependency: ' + file)
}
assert.ok(!files.some(file => file.startsWith('calendar/')), 'unused components must stay out')
assert.ok(!files.some(file => file.endsWith('.d.ts')), 'runtime has no type declarations')
assert.deepStrictEqual(files, files.slice().sort())
assert.throws(() => collectRuntimeFiles(source, ['../package']), /outside|invalid/i)
const original = fs.readFileSync(path.join(source, 'icon/index.wxss'), 'utf8')
const encoded = fs.readFileSync(path.resolve(__dirname, '../node_modules/@vant/icons/src/encode-woff2.less'), 'utf8')
const offline = offlineIconStyle(original, encoded)
const fontData = /base64,([^)'"\s]+)/.exec(encoded)[1]
assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(fontData, 'base64')).digest('hex'),
    '1bb4b4bd573097cb1bcd39f3430e6466979d79188bf6a787750e1f8030ce5e5e')
assert.strictEqual(original.replace(/@font-face\s*\{[^}]+\}/g, ''), offline.replace(/@font-face\s*\{[^}]+\}/g, ''),
    'all glyph mappings and non-font styles must remain byte-identical')
assert.ok(offline.includes('data:'), 'font must be embedded')
assert.ok(!/url\(\s*["']?(?:https?:)?\/\//i.test(offline), 'no remote font requests')
assert.ok(offline.includes('.van-icon-search:before'), 'icon mappings must remain')
assert.throws(() => offlineIconStyle(original, 'invalid font'), /font/i)
assert.throws(() => offlineIconStyle('invalid stylesheet', encoded), /font/i)
// Build in a disposable repository fixture. Never exercise deletion/write tests
// inside the live output watched by DevTools hot reload.
const fixtureRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'learn-ui-build-test-'))
try {
const fixturePackage = path.join(fixtureRoot, 'node_modules/@vant/weapp')
const fixtureIcons = path.join(fixtureRoot, 'node_modules/@vant/icons')
for (const filename of files) {
    const destination = path.join(fixturePackage, 'lib', filename)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(source, filename), destination)
}
for (const filename of ['package.json', 'LICENSE']) {
    fs.copyFileSync(path.resolve(source, '..', filename), path.join(fixturePackage, filename))
    fs.mkdirSync(fixtureIcons, { recursive: true })
    fs.copyFileSync(path.resolve(__dirname, '../node_modules/@vant/icons', filename), path.join(fixtureIcons, filename))
}
fs.mkdirSync(path.join(fixtureIcons, 'src'), { recursive: true })
fs.copyFileSync(path.resolve(__dirname, '../node_modules/@vant/icons/src/encode-woff2.less'), path.join(fixtureIcons, 'src/encode-woff2.less'))
const build = buildComponents(fixtureRoot)
assert.strictEqual(build.files, 47)
assert.strictEqual(build.bytes, 94242)
const manifestPath = path.join(build.directory, 'build-manifest.json')
const manifestBytes = fs.readFileSync(manifestPath)
const manifest = JSON.parse(manifestBytes)
const staleDirectory = path.join(build.directory, 'calendar')
fs.mkdirSync(staleDirectory, { recursive: true })
fs.writeFileSync(path.join(staleDirectory, 'index.js'), '// obsolete generated test artifact\n')
buildComponents(fixtureRoot)
assert.ok(!fs.existsSync(staleDirectory), 'rebuilding must remove obsolete generated components')
assert.strictEqual(manifest.version, '1.11.7')
assert.strictEqual(manifest.iconsVersion, '3.0.1')
assert.strictEqual(manifest.embeddedFont, true)
for (const [filename, evidence] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(build.directory, filename))
    assert.strictEqual(bytes.length, evidence.bytes)
    assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), evidence.sha256)
}
const actualFiles = []
function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name)
        if (entry.isDirectory()) scan(filename)
        else actualFiles.push(path.relative(build.directory, filename).split(path.sep).join('/'))
    }
}
scan(build.directory)
assert.deepStrictEqual(actualFiles.sort(), Object.keys(manifest.files).concat('build-manifest.json').sort())
buildComponents(fixtureRoot)
assert.deepStrictEqual(fs.readFileSync(manifestPath), manifestBytes, 'same inputs must produce the same manifest')
const originalLstat = fs.lstatSync
const originalUnlink = fs.unlinkSync
const originalWrite = fs.writeFileSync
try {
    // Simulate Windows junctions without creating links or touching other trees.
    for (const redirected of [build.directory, path.dirname(build.directory), path.dirname(path.dirname(build.directory))]) {
        let deletes = 0
        let writes = 0
        fs.lstatSync = filename => path.resolve(filename) === path.resolve(redirected)
            ? { isSymbolicLink: () => true }
            : originalLstat(filename)
        fs.unlinkSync = () => { deletes++ }
        fs.writeFileSync = () => { writes++ }
        assert.throws(() => buildComponents(fixtureRoot), /symbolic link/i)
        assert.strictEqual(deletes, 0, 'redirected outputs must be rejected before deleting')
        assert.strictEqual(writes, 0, 'redirected outputs must be rejected before writing')
    }
} finally {
    fs.lstatSync = originalLstat
    fs.unlinkSync = originalUnlink
    fs.writeFileSync = originalWrite
}
const staleFile = path.join(build.directory, '000-obsolete-test.js')
fs.writeFileSync(staleFile, '// obsolete generated test artifact\n')
const originalReaddir = fs.readdirSync
try {
    let deletes = 0
    let writes = 0
    fs.readdirSync = (directory, options) => {
        const entries = originalReaddir(directory, options)
        if (path.resolve(directory) === path.resolve(build.directory) && options && options.withFileTypes) {
            return entries.concat({ name: 'blocked-link', isSymbolicLink: () => true })
        }
        return entries
    }
    fs.unlinkSync = () => { deletes++ }
    fs.writeFileSync = () => { writes++ }
    assert.throws(() => buildComponents(fixtureRoot), /symbolic link/i)
    assert.strictEqual(deletes, 0, 'a later child link must prevent earlier stale file deletion')
    assert.strictEqual(writes, 0)
} finally {
    fs.readdirSync = originalReaddir
    fs.unlinkSync = originalUnlink
    fs.writeFileSync = originalWrite
}
buildComponents(fixtureRoot)
assert.ok(!fs.existsSync(staleFile))
console.log('native component dependency closure and offline font build: PASS')
} finally {
    const tempRoot = fs.realpathSync(require('os').tmpdir())
    const resolvedFixture = fs.realpathSync(fixtureRoot)
    assert.strictEqual(path.dirname(resolvedFixture), tempRoot, 'cleanup stays in the selected temp directory')
    assert.ok(path.basename(resolvedFixture).startsWith('learn-ui-build-test-'), 'cleanup only the created fixture')
    fs.rmSync(resolvedFixture, { recursive: true, force: true })
}
