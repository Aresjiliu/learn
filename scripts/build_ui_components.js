// Copy the official precompiled native release, not the upstream build toolchain.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT_COMPONENTS = ['search', 'icon', 'loading']
const HASH = value => crypto.createHash('sha256').update(value).digest('hex')

function contained(root, target) {
    const relative = path.relative(root, target)
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        throw new Error('Component path outside source root')
    }
}

function collectRuntimeFiles(sourceRoot, components) {
    const root = fs.realpathSync(sourceRoot)
    const visited = new Set()
    const queue = []
    const add = filename => {
        const absolute = path.resolve(root, filename)
        contained(root, absolute)
        const real = fs.realpathSync(absolute)
        contained(root, real)
        const relative = path.relative(root, real).split(path.sep).join('/')
        if (!visited.has(relative)) { visited.add(relative); queue.push(relative) }
    }
    const addComponent = filename => {
        for (const extension of ['.js', '.json', '.wxml', '.wxss']) add(filename + extension)
    }
    const reference = (from, value, component = false) => {
        if (!value.startsWith('.')) throw new Error('Unsupported nonrelative component dependency: ' + value)
        const absolute = path.resolve(root, path.dirname(from), value)
        contained(root, absolute)
        if (component) { addComponent(path.relative(root, absolute)); return }
        const found = ['', '.js', '.json', '.wxs'].map(extension => absolute + extension)
            .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
        if (!found) throw new Error('Missing component dependency: ' + value)
        add(path.relative(root, found))
    }
    for (const name of components) {
        if (!/^[a-z][a-z-]*$/.test(name)) throw new Error('Invalid component name')
        addComponent(name + '/index')
    }
    while (queue.length) {
        const filename = queue.shift()
        const text = fs.readFileSync(path.join(root, filename), 'utf8')
        if (filename.endsWith('.json')) {
            const json = JSON.parse(text)
            for (const value of Object.values(json.usingComponents || {})) reference(filename, value, true)
        }
        const patterns = []
        if (/\.(js|wxs)$/.test(filename)) patterns.push(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)
        if (filename.endsWith('.wxss')) patterns.push(/@import\s+['"]([^'"]+)['"]/g)
        if (filename.endsWith('.wxml')) patterns.push(/<(?:wxs|import|include)\b[^>]*\bsrc=['"]([^'"]+)['"]/g)
        for (const pattern of patterns) {
            let match
            while ((match = pattern.exec(text))) reference(filename, match[1])
        }
    }
    return Array.from(visited).sort()
}

function offlineIconStyle(original, encodedFont) {
    const font = /url\(\s*['"]?(data:[^)'"\s]+)['"]?\s*\)/.exec(encodedFont)
    if (!font || !font[1].includes('base64,') || !/@font-face\s*\{[^}]+\}/.test(original)) {
        throw new Error('Verified embedded icon font not found')
    }
    const result = original.replace(/@font-face\s*\{[^}]+\}/g,
        '@font-face{font-display:auto;font-family:vant-icon;font-style:normal;font-weight:400;src:url("' + font[1] + '") format("woff2")}')
    if (/url\(\s*['"]?(?:https?:)?\/\//i.test(result)) throw new Error('Unexpected remote font URL')
    return result
}

function prepareOutput(repositoryRoot, target, expectedFiles) {
    const repository = fs.realpathSync(repositoryRoot)
    const declaredRoot = path.resolve(repositoryRoot)
    contained(declaredRoot, target)
    let checked = declaredRoot
    for (const segment of path.relative(declaredRoot, target).split(path.sep)) {
        checked = path.join(checked, segment)
        if (fs.existsSync(checked) && fs.lstatSync(checked).isSymbolicLink()) {
            throw new Error('Generated UI output ancestor is a symbolic link')
        }
    }
    let ancestor = target
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor)
    contained(repository, fs.realpathSync(ancestor))
    fs.mkdirSync(target, { recursive: true })
    const realTarget = fs.realpathSync(target)
    contained(repository, realTarget)
    const files = []
    const directories = []
    function visit(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const filename = path.join(directory, entry.name)
            if (entry.isSymbolicLink()) throw new Error('Generated UI directory contains a symbolic link')
            contained(realTarget, fs.realpathSync(filename))
            if (entry.isDirectory()) { visit(filename); directories.push(filename) }
            else files.push(filename)
        }
    }
    // Inspect the whole bounded tree before deleting anything; never follow links.
    visit(target)
    for (const filename of files) {
        const relative = path.relative(target, filename).split(path.sep).join('/')
        if (!expectedFiles.has(relative)) fs.unlinkSync(filename)
    }
    for (const directory of directories) {
        if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory)
    }
}

function buildComponents(repositoryRoot = path.resolve(__dirname, '..')) {
    const packageRoot = path.join(repositoryRoot, 'node_modules/@vant/weapp')
    const iconRoot = path.join(repositoryRoot, 'node_modules/@vant/icons')
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    const icons = JSON.parse(fs.readFileSync(path.join(iconRoot, 'package.json'), 'utf8'))
    if (metadata.version !== '1.11.7' || metadata.license !== 'MIT' || icons.version !== '3.0.1' || icons.license !== 'MIT') {
        throw new Error('Unexpected UI dependency version or license; use npm ci --ignore-scripts')
    }
    const source = path.join(packageRoot, 'lib')
    const target = path.resolve(repositoryRoot, 'miniprogram_npm/@vant/weapp')
    contained(repositoryRoot, target)
    const font = fs.readFileSync(path.join(iconRoot, 'src/encode-woff2.less'), 'utf8')
    const outputs = new Map(collectRuntimeFiles(source, ROOT_COMPONENTS).map(filename => {
        const raw = fs.readFileSync(path.join(source, filename))
        return [filename, filename === 'icon/index.wxss' ? Buffer.from(offlineIconStyle(raw.toString('utf8'), font)) : raw]
    }))
    outputs.set('LICENSE', fs.readFileSync(path.join(packageRoot, 'LICENSE')))
    outputs.set('ICONS-LICENSE', fs.readFileSync(path.join(iconRoot, 'LICENSE')))
    // Validate the complete output before replacing any generated files.
    for (const [filename, bytes] of outputs) {
        if (/\.(?:js|json|wxml|wxss|wxs)$/.test(filename) && /(?:https?:)?\/\/at\.alicdn\.com/.test(bytes.toString('utf8'))) {
            throw new Error('Runtime dependency still references a remote icon font: ' + filename)
        }
    }
    const provenance = {
        package: '@vant/weapp', version: metadata.version, iconsVersion: icons.version,
        components: ROOT_COMPONENTS, embeddedFont: true,
        files: Object.fromEntries(Array.from(outputs, ([filename, bytes]) => [filename, { bytes: bytes.length, sha256: HASH(bytes) }]))
    }
    prepareOutput(repositoryRoot, target, new Set(Array.from(outputs.keys()).concat('build-manifest.json')))
    for (const [filename, bytes] of outputs) {
        const destination = path.join(target, filename)
        contained(target, destination)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.writeFileSync(destination, bytes)
    }
    fs.writeFileSync(path.join(target, 'build-manifest.json'), JSON.stringify(provenance, null, 2) + '\n')
    return { directory: target, files: outputs.size, bytes: Array.from(outputs.values()).reduce((sum, bytes) => sum + bytes.length, 0) }
}

module.exports = { collectRuntimeFiles, offlineIconStyle, buildComponents }
if (require.main === module) console.log(JSON.stringify(buildComponents()))
