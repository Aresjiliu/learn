const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'data', 'content_samples')
const files = [
    'dictionary_words.json',
    'book_1_words.json',
    'book_word_forms.json',
    'exam_practice_sample.json',
    'exam_fillin_sample.json',
    'exam_papers.json'
]

for (const file of files) {
    const source = path.join(root, file)
    const target = source.replace(/\.json$/, '.js')
    const value = JSON.parse(fs.readFileSync(source, 'utf8'))
    fs.writeFileSync(target, `module.exports = ${JSON.stringify(value)}\n`, 'utf8')
}

console.log(`generated ${files.length} runtime sample modules`)
