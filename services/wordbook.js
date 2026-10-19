const VERSION = 1;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/;

function failure(code, cause) {
    const error = new Error('Wordbook operation failed: ' + code);
    error.code = 'WORDBOOK_' + code;
    if (cause) error.cause = cause;
    return error;
}

function text(value, limit, required) {
    if (typeof value !== 'string' || CONTROLS.test(value)) return null;
    const result = value.trim().normalize('NFC');
    if ((required && !result) || Array.from(result).length > limit) return null;
    return result;
}

function sourceId(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
    return typeof value === 'string' ? text(value, 256, true) : null;
}

// Explicit snapshot fields prevent accidental persistence of credentials or media URLs.
function snapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const headword = text(value.headword, 256, true);
    const summary = text(value.summary === undefined ? '' : value.summary, 2000, false);
    if (headword === null || summary === null) return null;
    if (value.sourceType === 'dictionary') {
        if (typeof value.entryId !== 'string' || !/^dict:[0-9]+:[a-f0-9]{16}$/.test(value.entryId)) return null;
        return { key: value.entryId, sourceType: 'dictionary', entryId: value.entryId, headword, summary };
    }
    if (value.sourceType === 'textbook') {
        const collectionId = sourceId(value.collectionId);
        const rowId = sourceId(value.sourceId);
        if (collectionId === null || rowId === null) return null;
        // JSON tuple avoids separator collisions, with a namespace distinct from dict IDs.
        return { key: 'textbook:' + JSON.stringify([collectionId, rowId]), sourceType: 'textbook',
            collectionId, sourceId: rowId, headword, summary };
    }
    return null;
}

function validTime(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function copy(records) {
    return records.map(record => ({ ...record }));
}

function createWordbook(storage, now = () => Date.now()) {
    let stored;
    try {
        stored = storage.read();
    } catch (cause) {
        throw failure('READ_FAILED', cause);
    }
    let records = [];
    let reason = '';
    // Undefined alone means absent. Unknown data must never become an empty writable book.
    if (stored !== undefined) {
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
            reason = 'corrupt-data';
        } else if (stored.version !== VERSION) {
            reason = Object.prototype.hasOwnProperty.call(stored, 'version') ? 'unsupported-version' : 'corrupt-data';
        } else if (!Array.isArray(stored.records)) {
            reason = 'corrupt-data';
        } else {
            const seen = new Set();
            stored.records.forEach(row => {
                const item = snapshot(row);
                if (!item || item.key !== row.key || !validTime(row.savedAt) || seen.has(item.key)) {
                    reason = 'corrupt-data';
                    return;
                }
                seen.add(item.key);
                records.push({ ...item, savedAt: row.savedAt });
            });
        }
    }

    function writable() {
        if (reason) throw failure('READ_ONLY');
    }

    function persist(next) {
        try {
            storage.write({ version: VERSION, records: copy(next) });
        } catch (cause) {
            throw failure('WRITE_FAILED', cause);
        }
        records = next;
    }

    return {
        status() { return { readOnly: Boolean(reason), reason }; },
        list() { return copy(records); },
        has(key) { return records.some(record => record.key === key); },
        add(value) {
            writable();
            const item = snapshot(value);
            if (!item) throw failure('INVALID_ENTRY');
            const existing = records.find(record => record.key === item.key);
            if (existing) return { ...existing };
            const savedAt = now();
            if (!validTime(savedAt)) throw failure('INVALID_TIME');
            const record = { ...item, savedAt };
            persist([record].concat(records));
            return { ...record };
        },
        remove(key) {
            writable();
            const next = records.filter(record => record.key !== key);
            if (next.length !== records.length) persist(next);
        }
    };
}

module.exports = { createWordbook };
