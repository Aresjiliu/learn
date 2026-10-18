import request from '../utils/request'
import config from '../config'
import { isContentSuccess, normalizeCourseResponse } from './adapters'
import { getContentBookDetail, getContentBooks, getContentCategories } from './content-api'

const textbookSample = require('../data/content_samples/book_1_words.js')
const audioIndex = require('../data/content_samples/book_1_audio.js')
const wordFormSample = require('../data/content_samples/book_word_forms.js')
const mappingDecisionSample = require('../data/content_samples/mapping_decisions.js')
const categorySample = require('../data/content_samples/categories.js')
function withLocalWordAudio(word) {
  const filename = audioIndex[String(word.id)]
  return config.enableLocalWordAudio && /^[0-9a-f]{32}\.mp3$/.test(filename || '')
    ? { ...word, audioUrl: `/wordaudio/${filename}` }
    : word
}
const sampleWords = (textbookSample.words || []).map(withLocalWordAudio)
const sampleWordForms = wordFormSample.byWord || {}
const sampleMappingDecisions = mappingDecisionSample.decisions || []
const sampleCategories = categorySample.categories || []

const sampleVideos = Array.from({ length: 6 }, (_, index) => {
  const number = index + 1
  return {
    id: `sample-video-${number}`,
    title: `测试视频：第${number}节`,
    url: config.enableLocalTestMedia ? `${config.devMediaBaseUrl}/video/video${number}.mp4` : '',
    duration: 0,
    durationText: '--:--',
    isPreview: number <= 3
  }
})

const sampleCourse = {
  id: 'sample-book-1',
  title: '东方教材大学俄语3',
  description: '本地内容样本：用于验证课程详情、试听入口和关联词汇展示。',
  cover_image: '/images/courses/course1.png',
  wordCount: sampleWords.length,
  price: '0.00',
  original_price: '0.00',
  students_count: 0,
  categoryId: '3',
  hasPurchased: false,
  is_collected: false,
  words: sampleWords,
  wordForms: sampleWordForms,
  mappingDecisions: sampleMappingDecisions,
  chapters: [{
    id: 'sample-chapter-1',
    title: '第一单元（本地试听样本）',
    description: '使用本地测试媒体验证试听、切换和播放进度。',
    videos: sampleVideos.slice(0, 3)
  }, {
    id: 'sample-chapter-2',
    title: '第二单元（本地权限样本）',
    description: '用于验证未购买章节的访问保护；购买状态由本地样本固定为未购买。',
    videos: sampleVideos.slice(3)
  }]
}

function isSampleCourse(courseId) {
  return String(courseId) === String(sampleCourse.id)
}

function localCourseList(options = {}) {
    const query = String(options.query || '').trim().toLocaleLowerCase()
    const categoryId = String(options.categoryId || '').trim()
    const courses = query
        ? [sampleCourse].filter(item => `${item.title} ${item.description}`.toLocaleLowerCase().includes(query))
        : [sampleCourse]
  const categoryCourses = categoryId ? courses.filter(item => String(item.categoryId) === categoryId) : courses
  return {
    code: 200,
    message: 'local sample',
    data: {
      categories: sampleCategories,
      courses: categoryCourses
    }
  }
}

function getCourses(options = {}) {
  if (config.enableContentApi) {
    return getContentBooks(options).then(response => normalizeCourseResponse(response)).catch(error => {
      if (config.enableLocalSampleFallback) return localCourseList(options)
      return Promise.reject(error)
    })
  }
  if (config.enableLocalSampleFallback) return Promise.resolve(localCourseList(options))
  return Promise.reject(new Error('内容 API 未启用，且本地样本回退已关闭'))
}

function getCategories() {
  if (!config.enableContentApi && config.enableLocalSampleFallback) {
    return Promise.resolve({ code: 200, data: { categories: sampleCategories }, meta: { source: 'local-sample' } })
  }
  if (config.enableContentApi) {
    return getContentCategories().catch(() => ({ code: 200, data: { categories: [] }, meta: { source: 'content-api-fallback' } }))
  }
  return request({
    url: '/api/categories/',
    method: 'GET'
  }).then(response => isContentSuccess(response) ? response : { code: 200, data: { categories: [] } }).catch(() => ({
    code: 200,
    data: { categories: [] }
  }))
}

function getCourseDetail(courseId) {
  if (config.enableContentApi && !isSampleCourse(courseId)) {
    return getContentBookDetail(courseId).then(response => {
      const normalizedDetail = validateCourseDetail(response, courseId)
      if (!isContentSuccess(normalizedDetail)) return normalizedDetail
      if (String(courseId) !== '1' || !Array.isArray(normalizedDetail.data.words)) return normalizedDetail
      return { ...normalizedDetail, data: { ...normalizedDetail.data, words: normalizedDetail.data.words.map(withLocalWordAudio) } }
    })
  }
  if (isSampleCourse(courseId)) {
    return Promise.resolve({
      code: 200,
      message: 'local sample',
      data: {
        course: sampleCourse,
        hasPurchased: false,
        is_collected: false,
        chapters: sampleCourse.chapters,
        words: sampleWords,
        wordForms: sampleWordForms,
        mappingDecisions: sampleMappingDecisions
      }
    })
  }

  return request({
    url: `/api/courses/${courseId}/`,
    method: 'GET'
  }).then(detailResponse => {
    const normalizedDetail = validateCourseDetail(detailResponse, courseId)
    if (!isContentSuccess(normalizedDetail)) {
      return normalizedDetail
    }
    return request({
      url: `/api/courses/${courseId}/video/`,
      method: 'GET'
    }).catch(() => null).then(videoResponse => {
      // Only media transport failure is optional. Identity failures must reach
      // the page's existing loadError/retry path rather than becoming success.
      if (videoResponse && isContentSuccess(videoResponse)) {
        validateCourseOwnership(videoResponse.data, courseId)
        if (videoResponse.data && Object.prototype.hasOwnProperty.call(videoResponse.data, 'book')) {
          validateCourseIdentity(videoResponse.data.book, courseId)
        }
        if (videoResponse.data && videoResponse.data.course) {
          validateCourseDetail(videoResponse, courseId)
        }
      }
      return {
        ...normalizedDetail,
        data: {
          ...normalizedDetail.data,
          chapters: videoResponse && isContentSuccess(videoResponse) && videoResponse.data
            ? videoResponse.data.chapters || [] : [],
          words: []
        }
      }
    })
  })
}

// IDs are non-empty strings or finite numbers, compared by their exact string
// representation: 1 equals '1', but '01', whitespace and coercible objects do not.
function sameCourseId(actual, expected) {
    const valid = value => (typeof value === 'string' && value.length > 0)
        || (typeof value === 'number' && Number.isFinite(value))
    return valid(actual) && valid(expected) && String(actual) === String(expected)
}

function validateCourseOwnership(data, courseId) {
    if (!data || typeof data !== 'object') return
    for (const field of ['courseId', 'course_id', 'bookId', 'book_id']) {
        if (Object.prototype.hasOwnProperty.call(data, field) && !sameCourseId(data[field], courseId)) {
            throw new Error('课程内容身份与请求不一致')
        }
    }
    for (const field of ['chapters', 'lessons', 'videos', 'video_list', 'words']) {
        if (Array.isArray(data[field])) data[field].forEach(item => validateCourseOwnership(item, courseId))
    }
}

function validateCourseDetail(response, courseId) {
    // Check the raw identity before the adapter's id || book_id compatibility
    // fallback can hide an explicitly invalid id.
    if (isContentSuccess(response) && response.data) {
        validateCourseIdentity(response.data.course, courseId)
    }
    const normalized = normalizeCourseResponse(response)
    if (!isContentSuccess(normalized)) return normalized
    const data = normalized.data
    if (!data || !data.course || !sameCourseId(data.course.id, courseId)) {
        throw new Error('课程详情身份与请求不一致')
    }
    validateCourseOwnership(data, courseId)
    validateCourseOwnership(data.course, courseId)
    // Content API retains its source book alongside the normalized course.
    if (data.book) {
        validateCourseIdentity(data.book, courseId)
    }
    return normalized
}

function validateCourseIdentity(course, courseId) {
    const id = course && (Object.prototype.hasOwnProperty.call(course, 'id') ? course.id : course.book_id)
    if (!sameCourseId(id, courseId)) throw new Error('课程详情身份与请求不一致')
    validateCourseOwnership(course, courseId)
}

export { getCategories, getCourses, getCourseDetail, sampleCourse }
