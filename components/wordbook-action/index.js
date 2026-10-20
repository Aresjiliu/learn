const { createWxWordbook } = require('../../services/wordbook-wx');
const { buildWordbookEntry } = require('../../services/wordbook-entry');

Component({
    properties: {
        entry: { type: Object, value: null },
        sourceContext: { type: Object, value: null }
    },
    data: {
        eligible: false,
        saved: null,
        blocked: true,
        statusText: '',
        errorText: ''
    },
    observers: {
        'entry, sourceContext': function() {
            this.refresh();
        }
    },
    lifetimes: {
        attached: function() {
            this._active = true;
            this._hidden = false;
            this._book = createWxWordbook(wx);
            this.refresh();
        },
        detached: function() {
            this._active = false;
            this._book = null;
        }
    },
    pageLifetimes: {
        show: function() {
            this._hidden = false;
            this.refresh();
        },
        hide: function() {
            this._hidden = true;
        }
    },
    methods: {
        currentEntry: function() {
            return buildWordbookEntry(this.properties.entry, this.properties.sourceContext);
        },
        showUnavailable: function(reason) {
            const errorText = reason === 'unsupported-version' ? '生词本版本暂不支持，请重试'
                : reason === 'corrupt-data' ? '生词本数据异常，请重试' : '读取生词本失败，请重试';
            this.setData({ saved: null, blocked: true, statusText: '生词本状态暂不可用', errorText });
        },
        refresh: function() {
            if (!this._active || this._hidden) return;
            const entry = this.currentEntry();
            this.setData({ eligible: Boolean(entry), saved: null, blocked: true, errorText: '',
                statusText: entry ? '' : '词条缺少可靠身份或内容不符合保存要求，暂不能保存' });
            if (!entry) return;
            try {
                const view = this._book.inspect();
                if (view.readOnly) {
                    this.showUnavailable(view.reason);
                    return;
                }
                const saved = view.records.some(record => record.key === entry.key);
                this.setData({ saved, blocked: false, statusText: saved ? '已保存在本机' : '尚未加入生词本' });
            } catch (error) {
                this.showUnavailable();
            }
        },
        retry: function() {
            this.refresh();
        },
        toggle: function() {
            if (!this._active || this._hidden || this.data.blocked) return;
            const entry = this.currentEntry();
            if (!entry) {
                this.refresh();
                return;
            }
            let view;
            try {
                view = this._book.inspect();
            } catch (error) {
                this.showUnavailable();
                return;
            }
            if (view.readOnly) {
                this.showUnavailable(view.reason);
                return;
            }
            const saved = view.records.some(record => record.key === entry.key);
            try {
                if (saved) this._book.remove(entry.key);
                else this._book.add(entry);
                this.setData({ saved: !saved, blocked: false, errorText: '',
                    statusText: saved ? '尚未加入生词本' : '已保存在本机' });
            } catch (error) {
                if (error.code === 'WORDBOOK_READ_FAILED' || error.code === 'WORDBOOK_READ_ONLY') {
                    this.showUnavailable();
                    return;
                }
                // A failed write never changes the displayed membership.
                this.setData({ blocked: true, errorText: '保存生词本失败，请重试' });
            }
        }
    }
});
