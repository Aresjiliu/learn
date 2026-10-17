const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const source = fs.readFileSync('pages/index/index.js', 'utf8')
assert.ok(source.includes("加载分类失败:"))
assert.ok(source.includes("按分类加载课程失败:"))
assert.ok(source.includes("课程加载失败，请重试"))
assert.ok(source.includes('retryCourses: function'))
assert.ok(source.includes('courseLoadError'))
assert.ok(source.includes('this.setData({ currentCategory: null })'))
assert.ok(source.includes("currentCategory: null\n    })\n    this.loadCourses()"))
assert.ok(source.includes("rawCategoryId === 'null'"))
assert.ok(source.includes('beginCourseRequest: function'))
assert.ok(source.includes('requestId !== this._courseRequestId'))
assert.ok(source.includes('const requestId = (this._categoryRequestId || 0) + 1'))
assert.ok(source.includes('requestId !== this._categoryRequestId'))
assert.ok(source.includes('onUnload: function'))

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve))
}

async function runConcurrentRequestTest() {
  const categoryRequests = []
  const courseRequests = []
  const loadingState = { shown: 0, hidden: 0 }
  let pageDefinition
  const executableSource = source
    .replace(/^import \{ getCategories, getCourses \} from '..\/\.\.\/services\/course'\r?\n/m, '')
    .replace(/^import config from '..\/\.\.\/config'\r?\n/m, '')
    .replace(/^import \{ getRecentCourse \} from '..\/\.\.\/services\/playback-progress'\r?\n/m, '')

  const context = {
    Page: definition => {
      pageDefinition = definition
    },
    config: { enableContentApi: false },
    getRecentCourse: () => '',
    getCategories: () => {
      const request = createDeferred()
      categoryRequests.push(request)
      return request.promise
    },
    getCourses: () => {
      const request = createDeferred()
      courseRequests.push(request)
      return request.promise
    },
    wx: {
      showLoading: () => {
        loadingState.shown += 1
      },
      hideLoading: () => {
        loadingState.hidden += 1
      },
      showToast: () => {},
      navigateTo: () => {}
    },
    console: { error: () => {}, log: () => {} }
  }
  vm.runInNewContext(executableSource, context)

  const page = pageDefinition
  page.data = { ...page.data }
  page.setData = updates => Object.assign(page.data, updates)
  page.onLoad()
  assert.strictEqual(categoryRequests.length, 1, 'onLoad should request categories once')
  assert.strictEqual(courseRequests.length, 1, 'onLoad should request courses once')

  categoryRequests[0].resolve({ code: 503, message: 'category unavailable' })
  await flushPromises()
  assert.strictEqual(page.data.categoriesLoading, false, 'category non-200 must stop category loading')
  assert.strictEqual(page.data.categoriesLoadError, '分类加载失败，请重试', 'category non-200 must expose category error')
  assert.strictEqual(page.data.coursesLoading, true, 'pending course request must remain loading')
  assert.strictEqual(page.data.courseLoading, true, 'derived loading must include pending course request')
  assert.strictEqual(page.data.courseLoadError, '', 'category failure must not become course error')

  courseRequests[0].resolve({ code: 200, data: { courses: [] }, meta: { source: 'local-sample' } })
  await flushPromises()
  assert.strictEqual(page.data.coursesLoading, false, 'course success must stop course loading')
  assert.strictEqual(page.data.courseLoading, false, 'all completed requests must clear derived loading')
  assert.strictEqual(page.data.courseLoadError, '', 'course success must clear course error')
  assert.strictEqual(page.data.categoriesLoadError, '分类加载失败，请重试', 'course success must preserve category error')

  page.retryCategories()
  assert.strictEqual(categoryRequests.length, 2, 'category retry must only request categories')
  assert.strictEqual(courseRequests.length, 1, 'category retry must not request courses')
  categoryRequests[1].resolve({ code: 200, data: { categories: [{ id: 7, name: '教材' }] } })
  await flushPromises()
  assert.strictEqual(page.data.categoriesLoadError, '', 'successful category retry must clear category error')
  assert.strictEqual(page.data.courseLoadError, '', 'category retry must not create course error')

  page.loadCategories()
  page.loadCourses()
  assert.strictEqual(categoryRequests.length, 3, 'concurrent category request should be tracked')
  assert.strictEqual(courseRequests.length, 2, 'concurrent course request should be tracked')
  courseRequests[1].resolve({ code: 502, message: 'course unavailable' })
  await flushPromises()
  assert.strictEqual(page.data.coursesLoadError, '课程加载失败，请重试', 'course non-200 must expose course error')
  assert.strictEqual(page.data.categoriesLoadError, '', 'course failure must not become category error')
  assert.strictEqual(page.data.courseLoading, true, 'pending category request must keep derived loading active')
  categoryRequests[2].reject(new Error('category network failure'))
  await flushPromises()
  assert.strictEqual(page.data.categoriesLoadError, '分类加载失败，请重试', 'category reject must expose category error')
  assert.strictEqual(page.data.coursesLoadError, '课程加载失败，请重试', 'category reject must preserve course error')
  assert.strictEqual(page.data.courseLoadError, '课程加载失败，请重试', 'compatibility course error must come from courses only')
  assert.strictEqual(page.data.courseLoading, false, 'both concurrent requests completed must clear derived loading')

  const hiddenBeforeRace = loadingState.hidden
  page.loadCourses()
  page.loadCourses()
  assert.strictEqual(courseRequests.length, 4, 'race test should start two course requests')
  courseRequests[2].resolve({ code: 200, data: { courses: [] }, meta: { source: 'local-sample' } })
  await flushPromises()
  assert.strictEqual(page.data.courseLoading, true, 'stale request completion must not clear active loading')
  assert.strictEqual(loadingState.hidden, hiddenBeforeRace, 'stale request must not hide active loading')
  courseRequests[3].resolve({ code: 200, data: { courses: [] }, meta: { source: 'local-sample' } })
  await flushPromises()
  assert.strictEqual(page.data.courseLoading, false, 'latest request completion must clear loading')
  assert.strictEqual(loadingState.hidden, hiddenBeforeRace + 1, 'latest request should perform final loading cleanup')

  const hiddenBeforeLatestFirst = loadingState.hidden
  page.loadCourses()
  page.loadCourses()
  const staleAfterLatestFirst = courseRequests[courseRequests.length - 2]
  const latestFirstRequest = courseRequests[courseRequests.length - 1]
  latestFirstRequest.resolve({
    code: 200,
    data: { courses: [{ id: 'latest-first' }] },
    meta: { source: 'local-sample' }
  })
  await flushPromises()
  assert.strictEqual(page.data.courses[0].id, 'latest-first', 'latest course success must update visible courses')
  assert.strictEqual(page.data.courseLoading, true, 'latest request finishing first must keep loading for stale active request')
  assert.strictEqual(loadingState.hidden, hiddenBeforeLatestFirst, 'latest request finishing first must not hide shared loading')
  staleAfterLatestFirst.resolve({
    code: 200,
    data: { courses: [{ id: 'stale-after-latest' }] },
    meta: { source: 'local-sample' }
  })
  await flushPromises()
  assert.strictEqual(page.data.courses[0].id, 'latest-first', 'stale completion must not replace latest course result')
  assert.strictEqual(page.data.courseLoading, false, 'loading ends only after every active course request completes')
  assert.strictEqual(loadingState.hidden, hiddenBeforeLatestFirst + 1, 'final active course completion should hide loading once')

  page.loadCourses()
  const rejectedCourseRequest = courseRequests[courseRequests.length - 1]
  rejectedCourseRequest.reject(new Error('course network failure'))
  await flushPromises()
  assert.strictEqual(page.data.coursesLoadError, '课程加载失败，请重试', 'current course reject must expose course error')
  assert.strictEqual(page.data.courseLoading, false, 'current course reject must finish loading')

  page.loadCourses()
  page.loadCourses()
  const staleRejectedCourseRequest = courseRequests[courseRequests.length - 2]
  const currentCourseRequest = courseRequests[courseRequests.length - 1]
  staleRejectedCourseRequest.reject(new Error('stale course failure'))
  await flushPromises()
  assert.strictEqual(page.data.coursesLoadError, '', 'stale course reject must not overwrite current result')
  assert.strictEqual(page.data.courseLoading, true, 'current course request must keep loading after stale reject')
  currentCourseRequest.resolve({ code: 200, data: { courses: [{ id: 'current-course' }] }, meta: { source: 'local-sample' } })
  await flushPromises()
  assert.strictEqual(page.data.courses[0].id, 'current-course', 'current course success must update the result')
  assert.strictEqual(page.data.courseLoading, false, 'current course success must finish loading')

  page.loadCategories()
  page.loadCategories()
  const staleCategorySuccessRequest = categoryRequests[categoryRequests.length - 2]
  const currentCategoryRejectRequest = categoryRequests[categoryRequests.length - 1]
  staleCategorySuccessRequest.resolve({ code: 200, data: { categories: [{ id: 99, name: 'stale' }] } })
  await flushPromises()
  assert.strictEqual(page.data.categoriesLoading, true, 'stale category success must not stop current category loading')
  assert.notStrictEqual(page.data.categories[0] && page.data.categories[0].id, '99', 'stale category success must not update categories')
  currentCategoryRejectRequest.reject(new Error('current category failure'))
  await flushPromises()
  assert.strictEqual(page.data.categoriesLoadError, '分类加载失败，请重试', 'current category reject must expose category error')
  assert.strictEqual(page.data.categoriesLoading, false, 'current category reject must finish category loading')

  page.loadCategories()
  page.loadCategories()
  const staleCategoryRejectRequest = categoryRequests[categoryRequests.length - 2]
  const currentCategorySuccessRequest = categoryRequests[categoryRequests.length - 1]
  staleCategoryRejectRequest.reject(new Error('stale category failure'))
  await flushPromises()
  assert.strictEqual(page.data.categoriesLoadError, '', 'stale category reject must not overwrite current result')
  assert.strictEqual(page.data.categoriesLoading, true, 'current category request must remain loading after stale reject')
  currentCategorySuccessRequest.resolve({ code: 200, data: { categories: [{ id: 8, name: 'current' }] } })
  await flushPromises()
  assert.strictEqual(page.data.categories[0].id, '8', 'current category success must normalize numeric IDs')
  assert.strictEqual(page.data.categoriesLoadError, '', 'current category success must clear category error')
  assert.strictEqual(page.data.categoriesLoading, false, 'current category success must finish category loading')

  page.loadCategories()
  page.loadCourses()
  const unloadCategoryRequest = categoryRequests[categoryRequests.length - 1]
  const unloadCourseRequest = courseRequests[courseRequests.length - 1]
  page.onUnload()
  const stateAfterUnload = {
    categories: page.data.categories,
    courses: page.data.courses,
    categoriesLoadError: page.data.categoriesLoadError,
    coursesLoadError: page.data.coursesLoadError,
    categoriesLoading: page.data.categoriesLoading,
    coursesLoading: page.data.coursesLoading,
    courseLoading: page.data.courseLoading
  }
  assert.strictEqual(stateAfterUnload.categoriesLoading, false, 'onUnload must clear category loading')
  assert.strictEqual(stateAfterUnload.coursesLoading, false, 'onUnload must clear course loading')
  assert.strictEqual(stateAfterUnload.courseLoading, false, 'onUnload must clear derived loading')
  unloadCategoryRequest.resolve({ code: 200, data: { categories: [{ id: 100, name: 'late' }] } })
  unloadCourseRequest.reject(new Error('late course failure'))
  await flushPromises()
  assert.deepStrictEqual({
    categories: page.data.categories,
    courses: page.data.courses,
    categoriesLoadError: page.data.categoriesLoadError,
    coursesLoadError: page.data.coursesLoadError,
    categoriesLoading: page.data.categoriesLoading,
    coursesLoading: page.data.coursesLoading,
    courseLoading: page.data.courseLoading
  }, stateAfterUnload, 'requests completed after onUnload must not mutate page state')
}

runConcurrentRequestTest().then(() => {
  console.log('index network state tests: PASS')
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
