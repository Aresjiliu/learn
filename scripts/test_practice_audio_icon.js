const assert = require('assert')
const fs = require('fs')

const wxml = fs.readFileSync('pages/exam/practice/practice.wxml', 'utf8')
const wxss = fs.readFileSync('pages/exam/practice/practice.wxss', 'utf8')

assert.match(wxml, /<button[^>]*class="audio-button[^\"]*"[^>]*bindtap="playQuestionAudio"[^>]*aria-label="[^"]+"[^>]*>/, 'audio control must remain tappable and named')
assert.match(wxml, /<view class="speaker-icon"[^>]*>[\s\S]*?<view class="speaker-icon__body"><\/view>[\s\S]*?<view class="speaker-icon__cone"><\/view>[\s\S]*?<view class="speaker-icon__wave"><\/view>[\s\S]*?<\/view>/, 'audio control must render a speaker symbol')
assert.ok(!wxml.includes("{{isPlayingAudio ? '播放中…' : '播放听力'}}"), 'audio control should not render a text label as its visible content')
assert.match(wxss, /\.audio-button\s*\{[^}]*width:\s*88rpx;[^}]*height:\s*88rpx;/, 'icon control needs an approximately 44px tap target')
assert.match(wxss, /\.speaker-icon__wave\s*\{/, 'speaker icon needs a sound-wave shape')
console.log('practice audio icon contract: PASS')
