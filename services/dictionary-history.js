const MAX_RECORDS = 20;
const MAX_QUERY_LENGTH = 64;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;

function normalizeRecord(query) {
    if (typeof query !== 'string' || CONTROL_CHARACTERS.test(query)) return null;
    const normalized = query.trim().normalize('NFC');
    const length = Array.from(normalized).length;
    if (length < 1 || length > MAX_QUERY_LENGTH) return null;
    return {
        key: normalized.toLocaleLowerCase('ru-RU'),
        query: normalized
    };
}

function copyRecords(records) {
    return records.map(record => ({ key: record.key, query: record.query }));
}

function storageError(operation, cause) {
    const error = new Error('Dictionary history storage ' + operation + ' failed');
    error.code = 'DICTIONARY_HISTORY_' + operation.toUpperCase() + '_FAILED';
    error.cause = cause;
    return error;
}

// Construction reads once. Recovery does not write; mutations persist the cleaned,
// capped list. A successful synchronous write is required before memory changes.
function createDictionaryHistory(storage) {
    let stored;
    try {
        stored = storage.read();
    } catch (cause) {
        throw storageError('read', cause);
    }

    let records = [];
    const seen = new Set();
    if (Array.isArray(stored)) {
        for (const item of stored) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
            const record = normalizeRecord(item.query);
            if (!record || seen.has(record.key)) continue;
            seen.add(record.key);
            records.push(record);
            if (records.length === MAX_RECORDS) break;
        }
    }

    function persist(nextRecords) {
        try {
            storage.write(copyRecords(nextRecords));
        } catch (cause) {
            throw storageError('write', cause);
        }
        records = nextRecords;
    }

    return {
        list() {
            return copyRecords(records);
        },
        record(query) {
            const record = normalizeRecord(query);
            if (!record) return;
            const nextRecords = [record].concat(records.filter(item => item.key !== record.key));
            persist(nextRecords.slice(0, MAX_RECORDS));
        },
        remove(key) {
            const nextRecords = records.filter(item => item.key !== key);
            if (nextRecords.length === records.length) return;
            persist(nextRecords);
        },
        clear() {
            persist([]);
        }
    };
}

module.exports = { createDictionaryHistory };
