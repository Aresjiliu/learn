Component({
    properties: {
        entry: { type: Object, value: {} }
    },
    methods: {
        open: function() {
            const entry = this.data.entry
            this.triggerEvent('open', { word: entry.headword, wordId: entry.entryId })
        }
    }
})
