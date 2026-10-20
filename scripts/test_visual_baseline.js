// Task3a static contract; does not certify rendered glyphs or device appearance.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const expectedTokens = {
    "color-primary": "#b84b45",
    "color-accent": "#ed625c",
    "color-primary-soft": "#fff0ee",
    "color-sky": "var(--color-primary-soft)",
    "color-page-bg": "#f7f7f5",
    "color-text": "#232326",
    "color-text-secondary": "#67676f",
    "color-border": "#e6e6e3",
    "color-surface": "#ffffff",
    "color-exam": "#9a5505",
    "color-exam-soft": "#fff7ed",
    "color-error": "#c2413b",
    "color-error-soft": "#fff3f2",
    "color-success": "#256b42",
    "color-success-border": "#3b8c5a",
    "color-success-soft": "#effaf3",
    "color-loading": "#98a2b3",
    "color-empty": "#67676f",
    "color-locked": "#67676f",
    "radius-card": "16rpx",
    "space-page": "32rpx",
    "shadow-card": "0 2rpx 8rpx rgba(35, 35, 38, 0.04)",
    "font-size-page-title": "40rpx",
    "font-size-section-title": "32rpx",
    "font-size-body": "28rpx",
    "font-size-caption": "24rpx"
};
const dependencyHashes = {
    "package.json": "2520958616f57448f31717fd37d6fc825add5614764206c071720583dc433b8e",
    "package-lock.json": "ad58ca5f4eeb556a93df4699fae2f9e9711f92df40f75d9b3ad4a133f3167dd1"
};
const originalPages = [
    "pages/index/index",
    "pages/profile/profile",
    "pages/course/detail/detail",
    "pages/my-courses/my-courses",
    "pages/course/video/video",
    "pages/collections/collections",
    "pages/exam/list/list",
    "pages/exam/practice/practice",
    "pages/dictionary/search/search",
    "pages/dictionary/detail/detail",
    "pages/orders/orders",
    "pages/settings/settings",
    "pages/statement/statement",
    "pages/client/client",
    "pages/course/words/words"
];
const originalTabs = [
    {
        "pagePath": "pages/index/index",
        "text": "课程",
        "iconPath": "images/course.png",
        "selectedIconPath": "images/course-active.png"
    },
    {
        "pagePath": "pages/profile/profile",
        "text": "我的",
        "iconPath": "images/profile.png",
        "selectedIconPath": "images/profile-active.png"
    }
];
const styleFiles = [
    'pages/profile/profile.wxss',
    'components/dictionary-entry/index.wxss',
    'pages/collections/collections.wxss',
    'pages/exam/list/list.wxss',
    'pages/course/words/words.wxss',
    'pages/my-courses/my-courses.wxss',
    'pages/exam/practice/practice.wxss'
];
const tokens = read('styles/design-tokens.wxss');
const appStyles = read('app.wxss');
const app = JSON.parse(read('app.json'));
let failures = 0;
let checks = 0;

function check(name, run) {
    checks += 1;
    try {
        run();
        console.log('PASS ' + name);
    } catch (error) {
        failures += 1;
        console.error('FAIL ' + name + ': ' + error.message);
    }
}

function block(source, selector) {
    const rule = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '').match(/[^{}]+\{[^{}]*\}/g) || [];
    const match = rule.find(item => item.split('{')[0].trim() === selector);
    assert.ok(match, 'missing selector ' + selector);
    return match.slice(match.indexOf('{') + 1, -1);
}

// WCAG sRGB relative luminance; calculate from actual source colors, not snapshots.
function relativeLuminance(hex) {
    assert.match(hex, /^#[0-9a-f]{6}$/i, 'expected opaque six-digit sRGB color');
    const channels = [1, 3, 5].map(offset => {
        const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first, second) {
    const luminances = [relativeLuminance(first), relativeLuminance(second)];
    return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
}

function tokenColor(name) {
    const declaration = tokens.match(new RegExp('--' + name + '\\s*:\\s*(#[0-9a-f]{6})\\s*;', 'i'));
    assert.ok(declaration, 'missing color token ' + name);
    return declaration[1];
}

function ruleColor(source, selector, property) {
    const declaration = block(source, selector).match(new RegExp('(?:^|;)\\s*' + property + '\\s*:\\s*([^;]+);'));
    assert.ok(declaration, selector + ': missing ' + property);
    const value = declaration[1].trim();
    const token = value.match(/^var\(--([\w-]+)\)$/);
    return token ? tokenColor(token[1]) : value;
}

function assertReadable(label, foreground, background) {
    const ratio = contrastRatio(foreground, background);
    console.log('contrast ' + label + ': ' + ratio.toFixed(3) + ':1');
    assert.ok(ratio >= 4.5, label + ': ' + ratio.toFixed(3) + ':1 is below 4.5:1');
}

check('review labels are readable text rather than disabled controls', () => {
    const source = read('pages/exam/list/list.wxss');
    assertReadable('locked label / actual background',
        ruleColor(source, '.content-status.locked', 'color'),
        ruleColor(source, '.content-status.locked', 'background'));
    assertReadable('review title / containing notice',
        ruleColor(source, '.review-title', 'color'),
        ruleColor(source, '.review-notice', 'background'));
});

check('warning text meets 4.5:1 on white and its actual soft background', () => {
    assertReadable('warning / white', tokenColor('color-exam'), tokenColor('color-surface'));
    const source = read('pages/exam/practice/practice.wxss');
    assertReadable('question type / actual background',
        ruleColor(source, '.question-type', 'color'),
        ruleColor(source, '.question-type', 'background'));
});

check('normal-size primary text and white button labels meet 4.5:1 contrast', () => {
    assert.strictEqual(contrastRatio('#000000', '#ffffff'), 21, 'black/white reference');
    assert.strictEqual(contrastRatio('#ffffff', '#ffffff'), 1, 'identical color reference');
    const entry = read('components/dictionary-entry/index.wxss');
    const fallback = entry.match(/var\(--color-primary,\s*(#[0-9a-f]{6})\)/i);
    assert.ok(fallback, 'isolated entry must retain its primary color fallback');
    const pairs = [
        ['button label / primary', tokenColor('color-surface'), tokenColor('color-primary')],
        ['primary / soft panel', tokenColor('color-primary'), tokenColor('color-primary-soft')],
        ['primary / page', tokenColor('color-primary'), tokenColor('color-page-bg')],
        ['tab label / tab background', app.tabBar.selectedColor, app.tabBar.backgroundColor],
        ['isolated entry fallback / surface', fallback[1], tokenColor('color-surface')]
    ];
    for (const [label, foreground, background] of pairs) {
        const ratio = contrastRatio(foreground, background);
        console.log('contrast ' + label + ': ' + ratio.toFixed(3) + ':1');
        assert.ok(ratio >= 4.5, label + ': ' + ratio.toFixed(3) + ':1 is below 4.5:1');
    }
});

check('approved palette, compatibility alias, dimensions and quiet shadow', () => {
    const declarations = {};
    tokens.replace(/--([\w-]+)\s*:\s*([^;]+);/g, (_, name, value) => {
        declarations[name] = value.trim().toLowerCase();
        return _;
    });
    for (const [name, value] of Object.entries(expectedTokens)) {
        assert.strictEqual(declarations[name], value, '--' + name);
    }
});

check('native navigation and tab text', () => {
    assert.strictEqual(app.window.navigationBarBackgroundColor.toLowerCase(), '#ffffff');
    assert.strictEqual(app.window.navigationBarTextStyle, 'black');
    assert.strictEqual(app.window.backgroundColor.toLowerCase(), '#f7f7f5');
    assert.strictEqual(app.tabBar.selectedColor.toLowerCase(), '#b84b45');
    assert.strictEqual(app.tabBar.color.toLowerCase(), '#67676f');
    assert.strictEqual(app.tabBar.backgroundColor.toLowerCase(), '#ffffff');
});

check('all existing routes and tab assets remain registered', () => {
    assert.deepStrictEqual(app.pages.slice(0, originalPages.length), originalPages);
    assert.deepStrictEqual(app.pages.slice(originalPages.length), ['pages/wordbook/wordbook']);
    assert.strictEqual(new Set(app.pages).size, app.pages.length, 'routes must remain unique');
    assert.deepStrictEqual(app.tabBar.list, originalTabs);
    originalPages.forEach(route => assert.ok(fs.existsSync(path.join(root, route + '.wxml')), route));
});

check('global page baseline and system font inheritance', () => {
    assert.match(appStyles, /@import\s+["']styles\/design-tokens.wxss["']/);
    const page = block(appStyles, 'page');
    assert.match(page, /background:\s*var\(--color-page-bg\)/);
    assert.match(page, /color:\s*var\(--color-text\)/);
    assert.match(page, /font-size:\s*var\(--font-size-body\)/);
    assert.match(appStyles, /font-family:\s*var\(--font-family-system\)/);
    assert.match(tokens, /--font-family-base:[^;]*"Microsoft YaHei"[^;]*"Segoe UI"[^;]*Arial[^;]*sans-serif/);
    assert.match(tokens, /--font-family-system:\s*var\(--font-family-base\)/);
    const entry = block(read('components/dictionary-entry/index.wxss'), '.entry');
    const base = tokens.match(/--font-family-base:\s*([^;]+);/);
    const local = entry.match(/font-family:\s*var\(--font-family-base,\s*([^;]+)\);/);
    assert.ok(local, 'entry must use the shared font token with a complete local fallback');
    assert.strictEqual(local[1].trim(), base[1].trim(), 'isolated fallback must match the base system stack');
});

check('app styles avoid native control tag selectors in component contexts', () => {
    const source = appStyles.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '');
    const rules = source.match(/[^{}]+\{[^{}]*\}/g) || [];
    for (const rule of rules) {
        const selectors = rule.split('{')[0].split(',').map(selector => selector.trim());
        for (const selector of selectors) {
            assert.doesNotMatch(selector, /(?:^|[\s>+~])(?:button|input|textarea)(?=$|[\s>+~.#\[:])/i,
                'native control tag selector can warn in component WXSS: ' + selector);
        }
    }
    for (const selector of ['.auth-btn', '.primary-button', '.answer-input', '.word-search']) {
        const rule = rules.find(item => item.split('{')[0].split(',').some(value => value.trim() === selector));
        assert.ok(rule, 'missing business control font selector ' + selector);
        assert.match(rule.slice(rule.indexOf('{') + 1), /font-family:\s*var\(--font-family-base\)\s*;/);
    }
});

check('scoped styles use tokens without legacy blue or gray backgrounds', () => {
    for (const file of styleFiles) {
        const source = read(file);
        assert.doesNotMatch(source, /#(?:1296db|1f5f8b|eaf3f8|dceef8)\b|rgba\(31,\s*95,\s*139/i, file);
        assert.doesNotMatch(source, /#(?:f5f5f5|f5f7f9|f2f4f7|f7f8fa|f7f7f7|fafafa)\b/i, file);
        assert.match(source, /var\(--color-/, file);
        assert.doesNotMatch(source, /@font-face|url\s*\(|@import/i, file);
    }
    assert.doesNotMatch(tokens + appStyles, /@font-face|url\s*\(/i);
});

check('profile headers stay light with dark text and coral button', () => {
    const source = read('pages/profile/profile.wxss');
    ['.login-section', '.user-info-box'].forEach(selector => {
        assert.match(block(source, selector), /background:\s*var\(--color-surface\)/);
    });
    ['.login-tip', '.nickname'].forEach(selector => {
        assert.match(block(source, selector), /color:\s*var\(--color-text\)/);
    });
    assert.match(block(source, '.auth-btn'), /background:\s*var\(--color-primary\)/);
    assert.match(block(source, '.auth-btn'), /color:\s*var\(--color-surface\)/);
});

check('error, success and locked semantics stay separate', () => {
    const practice = read('pages/exam/practice/practice.wxss');
    assert.match(block(practice, '.option.correct'), /border-color:\s*var\(--color-success-border\)/);
    assert.match(block(practice, '.feedback-correct'), /color:\s*var\(--color-success\)/);
    assert.match(block(practice, '.option.wrong'), /border-color:\s*var\(--color-error\)/);
    assert.match(block(practice, '.feedback-wrong'), /color:\s*var\(--color-error\)/);
    assert.match(block(read('pages/exam/list/list.wxss'), '.content-status.locked'), /color:\s*var\(--color-locked\)/);
});

check('long dictionary words wrap and summaries occupy at most two lines', () => {
    const source = read('components/dictionary-entry/index.wxss');
    assert.match(block(source, '.entry__heading'), /flex-wrap:\s*wrap\s*;/);
    const headword = block(source, '.entry__headword');
    assert.match(headword, /min-width:\s*0\s*;/);
    assert.match(headword, /max-width:\s*100%\s*;/);
    assert.match(headword, /overflow-wrap:\s*(?:anywhere|break-word)\s*;/);
    assert.match(headword, /word-break:\s*break-word\s*;/);
    const summary = block(source, '.entry__summary');
    assert.match(summary, /display:\s*-webkit-box\s*;/);
    assert.match(summary, /-webkit-line-clamp:\s*2\s*;/);
    assert.match(summary, /-webkit-box-orient:\s*vertical\s*;/);
    assert.match(summary, /overflow:\s*hidden\s*;/);
});

check('list containers allow document scrolling without fixed height or clipping', () => {
    const containers = [
        ['pages/exam/list/list.wxss', '.page'],
        ['pages/exam/list/list.wxss', '.paper-list'],
        ['pages/course/words/words.wxss', '.vocabulary-page'],
        ['pages/my-courses/my-courses.wxss', '.my-courses'],
        ['pages/my-courses/my-courses.wxss', '.course-list'],
        ['pages/collections/collections.wxss', '.collections-page'],
        ['pages/collections/collections.wxss', '.course-list']
    ];
    for (const [file, selector] of containers) {
        const declarations = block(read(file), selector);
        assert.doesNotMatch(declarations, /(?:^|;)\s*(?:height|max-height)\s*:/, file + ' ' + selector);
        assert.doesNotMatch(declarations, /(?:^|;)\s*overflow(?:-y)?:\s*(?:hidden|clip)\b/, file + ' ' + selector);
    }
});

function assertElement(file, tag, attributes) {
    const source = read(file).replace(/<!--[\s\S]*?-->/g, '');
    const elements = source.match(new RegExp('<' + tag + '\\b[^>]*>', 'g')) || [];
    assert.ok(elements.some(element => attributes.every(pattern => pattern.test(element))),
        file + ': missing ' + tag + ' with ' + attributes.join(', '));
}

check('stable list rows retain navigation, filtering, retry and pagination bindings', () => {
    const exam = 'pages/exam/list/list.wxml';
    assertElement(exam, 'view', [/wx:for="\{\{visiblePapers\}\}"/, /wx:key="id"/, /bindtap="openPaper"/, /data-paper-id="\{\{item.id\}\}"/, /data-can-practice="\{\{item.canPractice\}\}"/]);
    assertElement(exam, 'button', [/bindtap="setPaperFilter"/, /data-filter="\{\{item.value\}\}"/, /aria-pressed=/]);
    assertElement(exam, 'button', [/bindtap="loadMore"/]);
    assertElement(exam, 'button', [/bindtap="retryLoad"/]);
    const words = 'pages/course/words/words.wxml';
    assertElement(words, 'view', [/wx:key="rowKey"/, /bindtap="openWordDetail"/, /data-row-key="\{\{item.rowKey\}\}"/]);
    assertElement(words, 'input', [/bindinput="searchWords"/]);
    assertElement(words, 'button', [/bindtap="loadMoreWords"/]);
    assertElement('components/dictionary-entry/index.wxml', 'view', [/class="entry"/, /bindtap="open"/, /role="button"/]);
    assertElement('pages/my-courses/my-courses.wxml', 'view', [/wx:key="id"/, /bindtap="navigateToVideo"/, /data-id="\{\{item.id\}\}"/]);
    assertElement('pages/collections/collections.wxml', 'view', [/wx:key="id"/, /bindtap="navigateToDetail"/, /data-id="\{\{item.id\}\}"/]);
    assertElement('pages/collections/collections.wxml', 'view', [/catchtap="handleUncollect"/, /data-id="\{\{item.id\}\}"/]);
    const practice = 'pages/exam/practice/practice.wxml';
    assertElement(practice, 'view', [/wx:key="\*this"/, /bindtap="selectAnswer"/, /data-answer="\{\{item\}\}"/]);
    assertElement(practice, 'input', [/bindinput="handleTextInput"/]);
    assertElement(practice, 'button', [/bindtap="submitAnswer"/]);
    assertElement(practice, 'button', [/bindtap="nextQuestion"/]);
});

check('no dependency or lockfile change', () => {
    ['package.json', 'package-lock.json'].forEach(file => {
        assert.strictEqual(crypto.createHash('sha256').update(read(file)).digest('hex'), dependencyHashes[file], file);
    });
});

if (failures) {
    console.error('visual baseline: FAIL (' + failures + ' groups)');
    process.exitCode = 1;
} else {
    console.log('visual baseline: PASS (' + checks + ' groups; static checks only)');
}
