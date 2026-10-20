const { createWordbook } = require('./wordbook');

const STORAGE_KEY = 'wordbook_guest_v1';

function createWxWordbook(platform, now = () => Date.now()) {
    const storage = {
        read() {
            const info = platform.getStorageInfoSync();
            if (!info || !Array.isArray(info.keys)) {
                throw new Error('Invalid storage keys');
            }
            const keys = info.keys;
            for (let index = 0; index < keys.length; index += 1) {
                if (typeof keys[index] !== 'string') {
                    throw new Error('Invalid storage key');
                }
            }
            if (keys.indexOf(STORAGE_KEY) === -1) return undefined;
            const value = platform.getStorageSync(STORAGE_KEY);
            // Only a missing key is absent; present undefined must block writes.
            return value === undefined ? null : value;
        },
        write(value) {
            platform.setStorageSync(STORAGE_KEY, value);
        }
    };

    return {
        inspect() {
            const book = createWordbook(storage, now);
            const status = book.status();
            return { records: book.list(), readOnly: status.readOnly, reason: status.reason };
        },
        add(entry) {
            return createWordbook(storage, now).add(entry);
        },
        remove(key) {
            return createWordbook(storage, now).remove(key);
        }
    };
}

module.exports = { createWxWordbook };
