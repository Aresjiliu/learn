const assert = require('assert')
const fs = require('fs')
const path = require('path')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

// A small tag tree checks ownership/order, not rendered geometry.
function parse(source) {
    const root = { tag: 'root', attrs: {}, children: [] }, stack = [root]
    for (const token of source.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<\/?[\w-]+\b[^>]*>/g)) {
        const tag = token[0]
        if (tag.startsWith('</')) { assert.strictEqual(stack.pop().tag, tag.slice(2, -1)); continue }
        const node = { tag: /^<([\w-]+)/.exec(tag)[1], attrs: {}, children: [] }
        for (const attr of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) node.attrs[attr[1]] = attr[2]
        stack[stack.length - 1].children.push(node)
        if (!tag.endsWith('/>')) stack.push(node)
    }
    assert.strictEqual(stack.length, 1)
    return root
}
const all = node => [node].concat(...node.children.map(all))
const tree = parse(read('pages/dictionary/search/search.wxml'))
const search = all(tree).find(node => node.tag === 'van-search')
for (const name of ['left-icon', 'right-icon', 'action']) {
    assert.strictEqual(search.attrs['use-' + name + '-slot'], '{{true}}')
    assert.strictEqual(search.children.filter(node => node.attrs.slot === name).length, 1)
}
assert.strictEqual(search.attrs['bind:change'], 'handleInput')
assert.strictEqual(search.attrs.clearable, '{{false}}')
assert.strictEqual(search.children.find(node => node.attrs.slot === 'left-icon').tag, 'view', 'decorative icon has no extra button')
assert.strictEqual(search.children.find(node => node.attrs.slot === 'right-icon').attrs.bindtap, 'clearSearch')
assert.strictEqual(search.children.find(node => node.attrs.slot === 'action').attrs.bindtap, 'handleSearch')
const vendorSearch = all(parse(read('node_modules/@vant/weapp/lib/search/index.wxml')))
const field = vendorSearch.find(node => node.tag === 'van-field')
for (const name of ['left-icon', 'right-icon']) {
    assert.ok(field.children.some(node => node.tag === 'slot' && node.attrs.name === name && node.attrs.slot === name))
}
assert.ok(all(parse(read('node_modules/@vant/weapp/lib/field/index.wxml'))).some(node => node.tag === 'slot' && node.attrs.name === 'left-icon' && node.attrs.slot === 'icon'))
assert.ok(all(parse(read('node_modules/@vant/weapp/lib/cell/index.wxml'))).some(node => node.tag === 'slot' && node.attrs.name === 'icon'))
const css = read('pages/dictionary/search/search.wxss')
for (const name of ['clear-button', 'search-action']) {
    const rule = new RegExp('\\.' + name + '\\s*\\{([^}]*)\\}').exec(css)[1]
    assert.ok(!/position:\s*absolute/.test(rule))
    for (const dimension of ['width', 'height']) assert.match(rule, new RegExp(dimension + ':\\s*88rpx'))
}
assert.match(css, /\.dictionary-search-input\s*\{[^}]*min-width:\s*0/)
assert.ok(!/padding:\s*0 88rpx/.test(css))
for (const file of ['pages/dictionary/search/search.wxss', 'components/dictionary-entry/index.wxss', 'pages/dictionary/detail/detail.wxss']) {
    const styles = read(file)
    for (const font of ['PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC']) assert.ok(styles.includes('"' + font + '"'), file + ': ' + font)
    assert.ok(!/\*\s*\{[^}]*font-family/.test(styles), 'do not override icon fonts')
    if (file.startsWith('pages/')) {
        for (const rule of styles.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
            for (const selector of rule[1].trim().split(',')) {
                assert.match(selector.trim(), /^page$|^\.[\w-]+(?:::[\w-]+)?(?:\s+(?:[+>~]\s*)?\.[\w-]+(?:::[\w-]+)?)*$/,
                    file + ': use business classes or the special page selector, avoiding component WXSS tag warnings')
            }
        }
    }
}
const entries = read('components/dictionary-entry/index.wxml')
assert.ok(entries.includes('entry.shortWordClass'))
assert.ok(entries.includes("entry.matchTier === 'wordForm'"))
assert.ok(!/entry\.(wordClass|sourceLabel|audioPlayable|audioSource|audioDevelopmentOnly)/.test(entries))
assert.ok(read('pages/dictionary/search/search.wxml').includes('wx:if="{{audioDevelopmentNotice}}"'))
console.log('dictionary search slots: PASS (structure only; rendering unverified)')
