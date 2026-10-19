// Tests may inspect the runtime closure, but must never mutate the live DevTools project.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const liveOutput = path.resolve(__dirname, '../miniprogram_npm');
const methods = ['mkdirSync', 'writeFileSync', 'unlinkSync', 'rmdirSync', 'rmSync', 'copyFileSync'];
const originals = {};
function guardMutation(method, run) {
    return function(...args) {
        const target = args[method === 'copyFileSync' ? 1 : 0];
        const relative = typeof target === 'string' ? path.relative(liveOutput, path.resolve(target)) : '..';
        assert.ok(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
            'component build tests must not mutate the live miniprogram_npm: ' + method);
        return run.apply(fs, args);
    };
}
// Pure probe: reject a copy's destination before calling even a fake writer.
let copyCalls = 0;
const probeCopy = guardMutation('copyFileSync', () => { copyCalls++; });
assert.throws(() => probeCopy(__filename, path.join(liveOutput, 'blocked-test.js')), /must not mutate/);
assert.strictEqual(copyCalls, 0);
probeCopy(path.join(liveOutput, 'read-only-source.js'), path.join(require('os').tmpdir(), 'allowed-test.js'));
assert.strictEqual(copyCalls, 1, 'reading the live tree is not prohibited');
try {
    for (const method of methods) {
        originals[method] = fs[method];
        fs[method] = guardMutation(method, originals[method]);
    }
    require('./test_ui_component_build');
} finally {
    for (const method of Object.keys(originals)) fs[method] = originals[method];
}
console.log('component build tests use isolated fixtures: PASS');
