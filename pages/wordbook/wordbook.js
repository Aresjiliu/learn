const { createWxWordbook } = require('../../services/wordbook-wx');

function project(record) {
    return { key: record.key, headword: record.headword, summary: record.summary,
        sourceLabel: record.sourceType === 'dictionary' ? '词典' : '教材' };
}

Page({
    data: {
        visibleRecords: [], total: null, readOnly: true, notice: '', loadError: '',
        hasMore: false, expandedKey: ''
    },

    onLoad() {
        this._disposed = false;
        this._hidden = false;
        this._records = [];
        this._confirmationEpoch = 0;
        this._book = createWxWordbook(wx);
    },

    onShow() {
        if (this._disposed) return;
        this._hidden = false;
        this.refresh();
    },

    refresh() {
        if (this._disposed || this._hidden) return;
        try {
            const state = this._book.inspect();
            this._records = state.records;
            this.setData({
                visibleRecords: [], total: state.readOnly ? null : state.records.length,
                readOnly: state.readOnly, loadError: '', expandedKey: '', hasMore: state.records.length > 0,
                notice: state.readOnly ? (state.reason === 'unsupported-version'
                    ? '记录格式暂不支持，原数据已保留，暂不可修改。'
                    : '记录校验未通过，仅展示可读取的摘要；原数据已保留，暂不可修改。') : ''
            });
            this.loadMore();
        } catch (error) {
            this._records = [];
            this.setData({ visibleRecords: [], total: null, readOnly: true, notice: '',
                loadError: '生词本读取失败，请重试；原数据未被清空。', hasMore: false, expandedKey: '' });
        }
    },

    loadMore() {
        if (this._disposed || this._hidden) return;
        const start = this.data.visibleRecords.length;
        const patch = {};
        let bytesUpperBound = 0;
        let end = start;
        while (end < this._records.length && end < start + 20) {
            const row = project(this._records[end]);
            // Three UTF-8 bytes per UTF-16 code unit is a conservative bound,
            // including escaped JSON. Keep oversized valid snapshots off one bridge batch.
            const size = JSON.stringify(row).length * 3;
            if (bytesUpperBound + size > 96 * 1024) break;
            patch[`visibleRecords[${end}]`] = row;
            bytesUpperBound += size;
            end++;
        }
        patch.hasMore = end < this._records.length;
        this.setData(patch);
    },

    findRecord(event) {
        const key = event && event.currentTarget && event.currentTarget.dataset.key;
        return this._records.find(record => record.key === key);
    },

    toggleSummary(event) {
        if (this._disposed || this._hidden) return;
        const record = this.findRecord(event);
        if (record) this.setData({ expandedKey: this.data.expandedKey === record.key ? '' : record.key });
    },

    openDetail(event) {
        if (this._disposed || this._hidden) return;
        const record = this.findRecord(event);
        if (!record) return;
        const query = `q=${encodeURIComponent(record.headword)}`;
        const suffix = record.sourceType === 'dictionary'
            ? `&id=${encodeURIComponent(record.entryId)}`
            : `&collectionId=${encodeURIComponent(record.collectionId)}&textbookId=${encodeURIComponent(record.sourceId)}&meaning=${encodeURIComponent(record.summary)}`;
        wx.navigateTo({ url: `/pages/dictionary/detail/detail?${query}${suffix}` });
    },

    requestRemove(event) {
        if (this._disposed || this._hidden || this.data.readOnly) return;
        const record = this.findRecord(event);
        if (!record) return;
        const epoch = ++this._confirmationEpoch;
        wx.showModal({
            title: '移出生词本', content: `确定移除“${record.headword}”？`, confirmColor: '#b84b45',
            success: result => {
                if (this._disposed || this._hidden || epoch !== this._confirmationEpoch) return;
                this._confirmationEpoch++;
                if (!result.confirm) return;
                try {
                    this._book.remove(record.key);
                    this.refresh();
                } catch (error) {
                    if (error.code === 'WORDBOOK_READ_FAILED' || error.code === 'WORDBOOK_READ_ONLY') {
                        this.refresh();
                        return;
                    }
                    this.setData({ loadError: '移除失败，列表未更改，请重试。' });
                }
            }
        });
    },

    onHide() { this._hidden = true; this._confirmationEpoch++; },
    onUnload() { this._disposed = true; this._confirmationEpoch++; this._records = []; }
});
