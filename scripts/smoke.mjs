/**
 * Прогон собранного приложения в настоящем браузере.
 *
 * Зачем он есть. Тестов React-экранов в проекте нет и не будет: сломанный
 * экран виден в тот же день, а тесты экранов — самый хрупкий их вид. Но
 * «виден в тот же день» — это день, потраченный на выяснение, вместо минуты
 * до пуша. Этот скрипт закрывает разрыв: он не проверяет вёрстку и не
 * заменяет тесты расчёта, он отвечает на один вопрос — открывается ли
 * приложение и не падает ли оно на обычном пути.
 *
 * Почему не Playwright. Ради одного сценария он тянет свой Chromium
 * и сотню мегабайт в devDependencies. Здесь — уже установленный браузер
 * и протокол отладки поверх WebSocket, встроенного в Node 22+.
 * Ни одной зависимости.
 *
 * Данные не трогает: браузер запускается с пустым временным профилем,
 * и IndexedDB у него свой. На базу в твоём обычном браузере он повлиять
 * не может.
 *
 * Запуск: `npm run smoke`. Собирает сам, поэтому проверяет ровно тот код,
 * который лежит в `src/` сейчас. Падает с ненулевым кодом, если браузер
 * сообщил об ошибке или проверка не сошлась.
 *
 * Обвязка — из «Дневников» как есть (Р-11); сценарий — этого проекта.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { build, preview } from 'vite'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Копия настоящих данных для прогона экранов:
 * `npm run smoke -- --data <файл>`. Путь — от того места, где набрали
 * команду. Нет ключа — обычный сценарий.
 */
const DATA_AT = process.argv.indexOf('--data')
const DATA =
  DATA_AT === -1 ? null : resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[DATA_AT + 1] ?? '')

/** Адрес собранного приложения. Заполняется, когда поднимется сервер. */
let APP = ''

/** Свой порт отладки, чтобы не столкнуться с открытым браузером. */
const DEBUG_PORT = 9333

/**
 * Где искать браузер. Годится любой на Chromium: Chrome, Edge, Chromium.
 * Свой путь задаётся переменной CHROME_PATH.
 */
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Отладочный вывод: `SMOKE_DEBUG=1 npm run smoke`. Без переменной молчит. */
const debug = (text) => {
  if (process.env.SMOKE_DEBUG) console.log(`[debug] ${text}`)
}

// ─── Запуск ────────────────────────────────────────────────────────────────

function findBrowser() {
  const found = BROWSERS.find((path) => path && existsSync(path))
  if (!found) {
    throw new Error(
      'Браузер на Chromium не найден. Укажите путь в переменной CHROME_PATH.',
    )
  }
  return found
}

/**
 * Поднимает просмотр собранного приложения.
 *
 * Через API Vite, а не отдельным процессом `npm run preview`: на Windows
 * Node не запускает `.cmd` без оболочки, а с оболочкой ругается на
 * аргументы. Заодно адрес берётся у самого сервера — вместе с `base`
 * из vite.config.ts, и держать его копию здесь не нужно.
 */
async function startServer() {
  // Собираем сами, а не полагаемся на dist от прошлого раза. Прогон,
  // который молча проверяет вчерашнюю сборку, хуже отсутствующего:
  // он показывает зелёное на сломанном коде.
  await build({ root: ROOT, logLevel: 'warn' })

  const server = await preview({ root: ROOT })
  const url = server.resolvedUrls?.local?.[0]
  if (!url) {
    await server.close()
    throw new Error('Сервер просмотра не назвал адрес')
  }

  APP = url
  return server
}

/** Адрес вкладки в протоколе отладки. */
async function pageSocket() {
  for (let i = 0; i < 40; i++) {
    try {
      const tabs = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json())
      const page = tabs.find((tab) => tab.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Браузер ещё не открыл порт.
    }
    await sleep(250)
  }
  throw new Error('Браузер не отдал порт отладки')
}

// ─── Разговор с браузером ──────────────────────────────────────────────────

/** Ошибки, о которых сообщил сам браузер. Любая из них валит прогон. */
const problems = []

/** Проверки сценария: что должно было оказаться на экране. */
const checks = []

function check(what, passed, seen = '') {
  checks.push({ what, passed, seen })
}

let socket
let seq = 0
const waiting = new Map()

function connect(url) {
  socket = new WebSocket(url)

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)

    if (message.id !== undefined) {
      waiting.get(message.id)?.(message)
      waiting.delete(message.id)
      return
    }

    // Запрос страницы к GitHub — отвечает подставной репозиторий прогона.
    if (message.method === 'Fetch.requestPaused') {
      void onGitHub(message.params)
      return
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      problems.push(details.exception?.description ?? details.text)
    }

    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      problems.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
    }
  }

  return new Promise((done, fail) => {
    socket.onopen = done
    socket.onerror = fail
  })
}

function send(method, params = {}) {
  const id = ++seq
  return new Promise((done) => {
    waiting.set(id, (message) => done(message.result))
    socket.send(JSON.stringify({ id, method, params }))
  })
}

/**
 * Выполняет выражение на странице.
 *
 * Исключение здесь — тоже ошибка прогона: если сценарий не нашёл кнопку,
 * значит экран не тот, каким его считали.
 */
async function run(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    problems.push(result.exceptionDetails.exception?.description ?? 'ошибка в сценарии')
    return null
  }
  return result.result.value
}

/**
 * Помощники, доступные внутри каждого шага сценария.
 *
 * `set` пишет в поле так, как это делает человек: React слушает не
 * присваивание `value`, а событие с нативного сеттера. `blur` через
 * focusout по той же причине — обычный blur не всплывает, и onBlur
 * его не увидит.
 */
const HELPERS = `
  const set = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const blur = (el) => {
    el.blur()
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  }
  const byText = (tag, label) =>
    [...document.querySelectorAll(tag)].find((el) => el.textContent.trim() === label)
  const startsWith = (tag, prefix) =>
    [...document.querySelectorAll(tag)].find((el) => el.textContent.trim().startsWith(prefix))
`

const act = (body) => run(`(() => {${HELPERS}\n${body}\n})()`)

/** Текст всего экрана. По нему и делаются проверки. */
const screen = () => run('document.querySelector("#root")?.innerText ?? ""')

/**
 * Есть ли на экране такой текст.
 *
 * Сравнение без учёта регистра и неразрывных пробелов. Заголовки блоков
 * рисуются капителью средствами CSS, и `innerText` отдаёт их прописными;
 * суммы пишутся с неразрывным пробелом между разрядами. Ни то ни другое
 * к смыслу проверки отношения не имеет, а ловушка тут злая: проверка вида
 * «этого текста больше нет» проходит ложно просто потому, что регистр
 * оказался другим.
 */
function has(text, needle) {
  const flat = (value) => value.replace(/\u00A0/g, ' ').toLowerCase()
  return flat(text).includes(flat(needle))
}

/** Переход по хеш-роутингу с ожиданием перерисовки. */
async function go(hash) {
  await run(`location.hash = ${JSON.stringify(hash)}`)
  await sleep(700)
}

/** Разворачивает блок по заголовку, если он свёрнут. */
async function unfold(title) {
  await act(`
    const button = [...document.querySelectorAll('.fold__btn')]
      .find((el) => el.textContent.trim() === ${JSON.stringify(title)})
    if (button?.getAttribute('aria-expanded') === 'false') button.click()
  `)
  await sleep(400)
}

/**
 * Полная загрузка страницы по адресу — как её открывает Android из
 * «Поделиться» или ярлыка. Адрес должен отличаться от текущего не только
 * хешем: иначе браузер сменит хеш без загрузки, и приём проверен не будет.
 */
async function open(url) {
  await send('Page.navigate', { url })
  await sleep(2000)
}

/** Сеть вкл/выкл — для проверки работы из кеша service worker. */
async function offline(on) {
  await send('Network.enable')
  await send('Network.emulateNetworkConditions', {
    offline: on,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
}

/** Значение поля захвата во входящих. Null — поля на экране нет. */
const captureField = () => run(`document.querySelector('textarea[name=text]')?.value ?? null`)

// ─── Подставной GitHub ─────────────────────────────────────────────────────

/**
 * Репозиторий данных в памяти прогона (Этап 2). Запросы страницы
 * к api.github.com перехватываются протоколом отладки и обслуживаются
 * здесь: сеть не нужна, настоящий репозиторий не трогается.
 *
 * Отвечает теми кодами, что GitHub: 409 «Git Repository is empty» у пустого
 * репозитория — ровно на нём споткнулась первая интеграция «Дневников»,
 * 422 на сдвиг ветки не с головы, 401 на чужой токен. Отпечаток файла —
 * настоящий git blob sha: по нему приложение решает, что скачивать
 * и что отправлять.
 */
const GOOD_TOKEN = 'github_pat_smoke'
const REPO = 'me/deluvremya-data'
const TOKEN_EXPIRES = '2027-09-01 12:00:00 +0300'

const github = {
  /** Голова ветки main. Null — в репозитории ни одного коммита. */
  head: null,
  /** sha коммита → { tree, parent, message } */
  commits: new Map(),
  /** sha дерева → Map путь → sha файла */
  trees: new Map(),
  /** sha файла → содержимое */
  blobs: new Map(),
  /** Токен не принимается — 401 на всё. */
  reject: false,
  /** Связи нет — запрос обрывается, как без сети. */
  down: false,
  seq: 0,
}

function blobSha(content) {
  const body = Buffer.from(content, 'utf8')
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex')
}

function nextSha(kind) {
  github.seq += 1
  return createHash('sha1').update(`${kind}:${github.seq}`).digest('hex')
}

function putBlob(content) {
  const sha = blobSha(content)
  github.blobs.set(sha, content)
  return sha
}

function putTree(files) {
  const sha = nextSha('tree')
  github.trees.set(sha, files)
  return sha
}

function putCommit(tree, parent, message) {
  const sha = nextSha('commit')
  github.commits.set(sha, { tree, parent, message })
  return sha
}

/** Файлы дерева — по sha дерева или коммита: GitHub принимает оба. */
function filesAt(sha) {
  return github.trees.get(sha) ?? github.trees.get(github.commits.get(sha)?.tree) ?? new Map()
}

/** Файлы на голове ветки: путь → содержимое. */
function repoFiles() {
  return Object.fromEntries([...filesAt(github.head)].map(([path, sha]) => [path, github.blobs.get(sha)]))
}

/** Записи файла на голове ветки. Нет файла — пусто, не JSON — null. */
function repoRecords(path) {
  try {
    return JSON.parse(repoFiles()[path] ?? '[]')
  } catch {
    return null
  }
}

function commitCount() {
  let count = 0
  for (let sha = github.head; sha; sha = github.commits.get(sha)?.parent ?? null) count += 1
  return count
}

/** Коммит «с другого устройства» — прямо в ветку, мимо приложения. */
function commitFromOtherDevice(changes) {
  const files = new Map(filesAt(github.head))
  for (const [path, records] of Object.entries(changes)) {
    files.set(path, putBlob(`${JSON.stringify(records, null, 2)}\n`))
  }
  github.head = putCommit(putTree(files), github.head, 'Другое устройство')
}

/** Ответ на запрос приложения: { status, body }. */
function answer(request, text) {
  const auth = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1]
  if (github.reject || auth !== `Bearer ${GOOD_TOKEN}`) return { status: 401, body: { message: 'Bad credentials' } }

  const method = request.method
  const path = new URL(request.url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '')
  const data = text ? JSON.parse(text) : {}
  let match

  if (method === 'GET' && path === '') {
    return {
      status: 200,
      body: { full_name: REPO, private: true, default_branch: 'main', permissions: { push: true } },
    }
  }

  if (method === 'GET' && path === '/git/ref/heads/main') {
    return github.head
      ? { status: 200, body: { object: { sha: github.head } } }
      : { status: 409, body: { message: 'Git Repository is empty.' } }
  }

  if (method === 'PUT' && path.startsWith('/contents/')) {
    if (github.head) return { status: 422, body: { message: 'Invalid request. "sha" wasn\'t supplied.' } }
    const file = decodeURIComponent(path.slice('/contents/'.length))
    const content = Buffer.from(data.content, 'base64').toString('utf8')
    github.head = putCommit(putTree(new Map([[file, putBlob(content)]])), null, data.message)
    return { status: 201, body: { commit: { sha: github.head } } }
  }

  if (method === 'GET' && (match = /^\/git\/trees\/(\w+)$/.exec(path))) {
    const files = filesAt(match[1])
    // Как у GitHub: с recursive=1 в дереве и каталоги — приложение их отбрасывает.
    const dirs = [...new Set([...files.keys()].filter((each) => each.includes('/')).map((each) => each.split('/')[0]))]
    return {
      status: 200,
      body: {
        tree: [
          ...dirs.map((dir) => ({ path: dir, sha: nextSha('dir'), type: 'tree' })),
          ...[...files].map(([file, sha]) => ({ path: file, sha, type: 'blob' })),
        ],
        truncated: false,
      },
    }
  }

  if (method === 'GET' && (match = /^\/git\/blobs\/(\w+)$/.exec(path))) {
    const content = github.blobs.get(match[1])
    return content === undefined
      ? { status: 404, body: { message: 'Not Found' } }
      : { status: 200, body: { content: Buffer.from(content, 'utf8').toString('base64'), encoding: 'base64' } }
  }

  if (method === 'POST' && path === '/git/trees') {
    const files = new Map(filesAt(data.base_tree))
    for (const entry of data.tree) files.set(entry.path, putBlob(entry.content))
    return { status: 201, body: { sha: putTree(files) } }
  }

  if (method === 'POST' && path === '/git/commits') {
    return { status: 201, body: { sha: putCommit(data.tree, data.parents[0] ?? null, data.message) } }
  }

  if (method === 'PATCH' && path === '/git/refs/heads/main') {
    const commit = github.commits.get(data.sha)
    if (!commit || commit.parent !== github.head) {
      return { status: 422, body: { message: 'Update is not a fast forward' } }
    }
    github.head = data.sha
    return { status: 200, body: { object: { sha: data.sha } } }
  }

  return { status: 404, body: { message: `Подставной GitHub не знает ${method} ${path}` } }
}

const CORS = [
  { name: 'Access-Control-Allow-Origin', value: '*' },
  { name: 'Access-Control-Expose-Headers', value: 'github-authentication-token-expiration' },
]

/**
 * Перехваченный запрос. Отвечает всегда: запрос без ответа повис бы,
 * и прогон ждал бы его молча.
 */
async function onGitHub({ requestId, request }) {
  debug(`перехвачен ${request.method} ${request.url}`)
  if (github.down) {
    await send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' })
    return
  }

  if (request.method === 'OPTIONS') {
    await send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 204,
      responseHeaders: [
        ...CORS,
        { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, PUT' },
        { name: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type, Accept, X-GitHub-Api-Version' },
      ],
    })
    return
  }

  let reply
  let text = ''
  try {
    text =
      request.postData ??
      (request.postDataEntries ?? []).map((entry) => Buffer.from(entry.bytes ?? '', 'base64').toString('utf8')).join('')
    reply = answer(request, text)
  } catch (failure) {
    reply = { status: 500, body: { message: `Подставной GitHub упал: ${failure}` } }
  }
  debug(`github ${request.method} ${request.url} → ${reply.status}; тело ${text.length}, hasPostData ${request.hasPostData}`)

  await send('Fetch.fulfillRequest', {
    requestId,
    responseCode: reply.status,
    responseHeaders: [
      ...CORS,
      { name: 'Content-Type', value: 'application/json; charset=utf-8' },
      { name: 'github-authentication-token-expiration', value: TOKEN_EXPIRES },
    ],
    body: Buffer.from(JSON.stringify(reply.body), 'utf8').toString('base64'),
  })
}

/** Месяц `ГГГГ-ММ` по часам этого компьютера — как `today()` в приложении. */
function localMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Сценарий ──────────────────────────────────────────────────────────────

/**
 * Обычный путь человека на каркасе Этапа 0: поставить, записать мысль,
 * поделиться ссылкой, открыть ярлык, забрать копию, вернуть её, открыть
 * без сети.
 */
async function scenario() {
  await send('Runtime.enable')
  await send('Page.enable')
  // Скачанное — во временный профиль, который удаляется после прогона.
  // Без этого безголовый Chrome клал выгрузку в «Загрузки» человека.
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: profile })

  // ─ Манифест и base (Р-06). Главный тихий риск каркаса: сборка зелёная,
  // страница белая. Проверяется собранное, а не исходник.
  const base = new URL(APP).pathname
  check('приложение отдаётся по /DeluVremya/', base === '/DeluVremya/', APP)

  const manifest = await fetch(new URL('manifest.webmanifest', APP)).then((r) => r.json())
  const shortcutIcons = (manifest.shortcuts ?? []).flatMap((each) => each.icons ?? [])
  const paths = [
    manifest.id,
    manifest.start_url,
    manifest.scope,
    manifest.share_target?.action,
    ...manifest.icons.map((icon) => icon.src),
    ...(manifest.shortcuts ?? []).map((each) => each.url),
    ...shortcutIcons.map((icon) => icon.src),
  ]
  const outside = paths.filter((path) => typeof path !== 'string' || !path.startsWith(base))
  check(
    'в манифесте id, start_url, scope, иконки, share и ярлыки — под /DeluVremya/',
    outside.length === 0,
    outside.join(', '),
  )

  const icons = [...new Set([...manifest.icons, ...shortcutIcons].map((icon) => icon.src))]
  const served = await Promise.all(
    icons.map((src) => fetch(new URL(src, APP)).then((r) => `${src} ${r.status}`)),
  )
  check('иконки манифеста отдаются', served.every((each) => each.endsWith(' 200')), served.join('; '))

  const share = manifest.share_target
  check(
    'share_target — GET на корень с title, text, url — Р-16',
    share?.method === 'GET' &&
      share.action === base &&
      share.params?.title === 'title' &&
      share.params?.text === 'text' &&
      share.params?.url === 'url',
    JSON.stringify(share),
  )
  check(
    'ярлыки «Записать», «План дня», «Учесть время» — Р-09',
    (manifest.shortcuts ?? []).map((each) => each.name).join(', ') === 'Записать, План дня, Учесть время',
    (manifest.shortcuts ?? []).map((each) => `${each.name} ${each.url}`).join('; '),
  )

  // ─ Первый запуск: приветствие; «Понятно» убирает его насовсем.
  await open(APP)
  const start = await screen()
  check('главный экран открылся', has(start, 'Сегодня'), start.replace(/\s+/g, ' ').slice(0, 80))
  check(
    'на пустой базе — приветствие с установкой',
    has(start, 'С чего начать') && has(start, 'Установка'),
    start.replace(/\s+/g, ' ').slice(0, 160),
  )
  await act(`byText('button', 'Понятно')?.click()`)
  await sleep(400)
  await send('Page.reload')
  await sleep(2000)
  check('«Понятно» убирает приветствие и после перезапуска', !has(await screen(), 'С чего начать'))

  // ─ Входящие руками: одно поле и кнопка (Р-09).
  await go('/inbox')
  await act(`
    set(document.querySelector('textarea[name=text]'), 'Купить фильтр для воды');
    byText('button', 'Записать')?.click();
  `)
  await sleep(700)
  const typed = await screen()
  check(
    'запись одним полем и кнопкой, вид не тронут — дело — Р-09, Р-13',
    has(typed, 'Записано: дело') && has(typed, 'Купить фильтр для воды') && has(typed, '1 запись'),
    `${line(typed, 'Записано')}; ${line(typed, 'запис')}`,
  )

  // ─ «Поделиться» (Р-16): Android открывает корень с параметрами.
  const title = 'Статья про сон'
  const link = 'https://example.com/son?a=1&b=2'
  await open(`${APP}?title=${encodeURIComponent(title)}&text=${encodeURIComponent(link)}`)
  const landed = await run(`({
    hash: location.hash,
    search: location.search,
    value: document.querySelector('textarea[name=text]')?.value ?? null,
  })`)
  check(
    'поделились — открылись входящие, заголовок и ссылка подставлены — Р-16',
    landed?.value === `${title}\n${link}` && String(landed?.hash).startsWith('#/inbox'),
    JSON.stringify(landed),
  )
  check('строка адреса очищена от ?title и ?text', landed?.search === '', `search «${landed?.search}»`)

  await act(`byText('button', 'Записать')?.click()`)
  await sleep(700)
  const afterShare = await screen()
  const hashAfter = await run('location.hash')
  check(
    'расшаренное записалось, ?shared из адреса ушёл',
    has(afterShare, 'example.com/son') && has(afterShare, '2 записи') && hashAfter === '#/inbox',
    `${line(afterShare, 'записи')}; хеш ${hashAfter}`,
  )
  await send('Page.reload')
  await sleep(2000)
  const refilled = await captureField()
  check('после перезагрузки поле пустое — второй раз не принято', refilled === '', `в поле «${refilled}»`)

  // ─ Ярлыки: адрес с ?go=, а не с # (Р-16).
  await open(`${APP}?go=inbox`)
  const inboxHash = await run('location.hash')
  const focused = await run(`document.activeElement?.getAttribute('name') ?? ''`)
  check(
    'ярлык «Записать» открывает заметки с курсором в поле, ?write из адреса ушёл',
    inboxHash === '#/inbox' && focused === 'text',
    `хеш ${inboxHash}; в фокусе «${focused}»`,
  )
  await open(`${APP}?go=time`)
  const timeHash = await run('location.hash')
  check(
    'ярлык «Учесть время» открывает экран времени — Р-16',
    timeHash === '#/time' && has(await screen(), 'Окно дня'),
    `хеш ${timeHash}`,
  )
  await open(`${APP}?go=nowhere`)
  const unknownHash = await run('location.hash')
  check(
    'ярлык на незнакомый экран открывает главный, а не пустоту',
    unknownHash === '#/' && has(await screen(), 'Сегодня'),
    `хеш ${unknownHash}`,
  )

  // ─ Категории (Этап 1, п. 1): стартовый набор заводится сам и правится.
  await go('/time/categories')
  const starter = await screen()
  check(
    'стартовые категории заведены сами, с кнопками',
    has(starter, 'Чтение') && has(starter, 'Прочее') && has(starter, '+30'),
    starter.replace(/\s+/g, ' ').slice(0, 160),
  )

  await act(`
    set(document.querySelector('input[name=category]'), 'Покер');
    byText('button', 'Добавить')?.click();
  `)
  await sleep(700)
  const added = await screen()
  check(
    'новая категория встаёт в конец списка',
    has(added, 'Покер') && added.indexOf('Покер') > added.indexOf('Прочее'),
    line(added, 'Покер'),
  )

  await act(`
    set(document.querySelector('input[name=category]'), ' покер ');
    byText('button', 'Добавить')?.click();
  `)
  await sleep(500)
  check('двойник названия не заводится', has(await screen(), 'Такая категория уже есть'))

  await act(`byText('button', 'Покер')?.click()`)
  await sleep(400)
  await act(`
    set(document.querySelector('input[name=minutes]'), '45');
    byText('button', 'Добавить кнопку')?.click();
  `)
  await sleep(700)
  await act(`document.querySelector('[aria-label="Покер — выше"]')?.click()`)
  await sleep(700)
  const moved = await screen()
  check(
    'у категории своя кнопка, сдвиг вверх меняет порядок',
    has(moved, '+45') && moved.indexOf('Покер') < moved.indexOf('Прочее'),
    line(moved, 'Покер'),
  )

  await act(`byText('button', 'В архив')?.click()`)
  await sleep(700)
  const archived = await screen()
  check(
    'категория уходит в архив, из списка пропадает',
    !has(archived, 'Покер') && has(archived, 'Архив'),
    line(archived, 'Архив'),
  )

  // ─ Учёт времени (Этап 1, пп. 2 и 5): тап — блок, итог сразу, «Отменить».
  await go('/time')
  await act(`byText('button', 'Чтение +30')?.click()`)
  await sleep(700)
  await act(`byText('button', 'Чтение +30')?.click()`)
  await sleep(700)
  const tapped = await screen()
  check(
    'два тапа по «Чтение +30» — час чтения, итог сразу — Р-20',
    has(tapped, 'Учтено 1 ч · 2 блока') && has(tapped, 'Отменить'),
    line(tapped, 'Учтено'),
  )

  await act(`byText('button', 'Отменить')?.click()`)
  await sleep(700)
  const undone = await screen()
  check(
    '«Отменить» снимает последний блок',
    has(undone, 'Учтено 30 мин · 1 блок') && !has(undone, 'Отменить'),
    line(undone, 'Учтено'),
  )
  // До начала окна дня неучтённого нет, и строки о нём тоже.
  const beforeWindow = new Date().getHours() < 8
  check(
    'неучтённое — от прошедшей части окна дня — Р-21',
    has(undone, 'Окно дня') && (beforeWindow || has(undone, 'из прошедших')),
    line(undone, 'Неучтено'),
  )

  await act(`document.querySelector('[aria-label^="Убрать: Чтение"]')?.click()`)
  await sleep(700)
  check('блок снимается из списка дня', has(await screen(), 'За день ничего не учтено'))

  await go('/')
  await act(`byText('button', 'Прогулка +30')?.click()`)
  await sleep(700)
  const today = await screen()
  check(
    'кнопки и итог — и на «Сегодня»',
    has(today, 'Учтено 30 мин · 1 блок') && has(today, 'Записано: Прогулка'),
    line(today, 'Учтено'),
  )

  // ─ Таймер (Этап 1, п. 3): настройка устройства, блок — днём начала (Р-18, Р-19).
  await go('/time')
  await act(`byText('button', 'Старт')?.click()`)
  await sleep(700)
  const started = await screen()
  check('таймер запускается и виден идущим', has(started, 'Идёт: Зарядка'), line(started, 'Идёт'))

  await go('/')
  await send('Page.reload')
  await sleep(2000)
  check('идущий таймер виден на «Сегодня» и переживает перезапуск — Р-18', has(await screen(), 'Идёт: Зарядка'))

  await go('/time')
  await act(`byText('button', 'Стоп')?.click()`)
  await sleep(500)
  // Прогон идёт секунды: минут ноль, и запись отвергается с причиной.
  await act(`byText('button', 'Записать')?.click()`)
  await sleep(500)
  check('меньше минуты не записывается, причина названа', has(await screen(), 'от одной до'))
  await act(`
    set(document.querySelector('input[name=timer-minutes]'), '25');
    byText('button', 'Записать')?.click();
  `)
  await sleep(700)
  const stopped = await screen()
  check(
    'остановленный таймер — блок с поправленными минутами',
    has(stopped, 'Записано: Зарядка, 25 мин') && has(stopped, 'Учтено 55 мин · 2 блока') && !has(stopped, 'Идёт:'),
    line(stopped, 'Учтено'),
  )

  // ─ Задним числом: минуты по своей истории, «вчера», дата названа.
  await unfold('Задним числом')
  const suggested = await run(`document.querySelector('input[name=block-minutes]')?.value ?? null`)
  check('ввод задним числом подставляет минуты по своей истории', suggested === '25', `в поле «${suggested}»`)
  await act(`byText('button', 'вчера')?.click()`)
  await sleep(300)
  await act(`
    document.querySelector('input[name=block-minutes]').closest('form').querySelector('button[type=submit]').click();
  `)
  await sleep(700)
  const retro = await screen()
  check(
    'блок на вчера записан, дата названа, в сегодняшний итог не лёг',
    has(retro, 'Записано на') && has(retro, 'Учтено 55 мин · 2 блока'),
    line(retro, 'Записано на'),
  )

  // ─ Правка блока из списка дня (Р-20).
  await act(`startsWith('button', 'Прогулка ·')?.click()`)
  await sleep(400)
  await act(`
    const input = [...document.querySelectorAll('input[name=block-minutes]')].find((el) => el.value === '30');
    set(input, '40');
    byText('button', 'Сохранить')?.click();
  `)
  await sleep(700)
  const edited = await screen()
  check('блок правится тапом по нему в списке дня', has(edited, 'Учтено 1 ч 5 мин · 2 блока'), line(edited, 'Учтено'))

  // ─ Фоновая активность (Этап 1, п. 4): поле блока, сумму не удваивает.
  // Выбор в списке React слушает событием change, а не input.
  const pick = (name, value) => `
    const field = document.querySelector('select[name=${name}]');
    set(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('change', { bubbles: true }));
  `
  await act(pick('block-category', 'cat:ютуб'))
  await sleep(300)
  await act(`
    ${pick('block-bg', 'cat:шахматы')}
    set(document.querySelector('input[name=block-minutes]'), '60');
  `)
  await sleep(300)
  await act(`
    document.querySelector('select[name=block-bg]').closest('form').querySelector('button[type=submit]').click();
  `)
  await sleep(700)
  const background = await screen()
  check(
    'фоновая — отдельной строкой, в сумму дня не входит — п. 4',
    has(background, 'Учтено 2 ч 5 мин · 3 блока') && has(background, 'Фоном, в сумму не входит: Шахматы 1 ч'),
    line(background, 'Фоном, в сумму'),
  )
  check('в списке дня у блока видна фоновая', has(background, 'Ютуб · 1 ч · фоном Шахматы'), line(background, 'фоном Шахматы'))

  // ─ Удаление категории (Р-22): пустая — после подтверждения, с блоками —
  // только переносом. Подтверждение в безголовом браузере некому нажать.
  await go('/time/categories')
  await act(`
    set(document.querySelector('input[name=category]'), 'Лишняя');
    byText('button', 'Добавить')?.click();
  `)
  await sleep(700)
  await act(`byText('button', 'Лишняя')?.click()`)
  await sleep(400)
  await act(`window.confirm = () => true; byText('button', 'Удалить')?.click()`)
  await sleep(700)
  const emptied = await screen()
  check('пустая категория удаляется — и из списка, и не в архив', !has(emptied, 'Лишняя'), line(emptied, 'Лишняя'))

  await act(`byText('button', 'Шахматы')?.click()`)
  await sleep(400)
  await act(`byText('button', 'Удалить')?.click()`)
  await sleep(400)
  const asked = await screen()
  check(
    'категорию с блоками удалить можно только переносом',
    has(asked, 'записано 1 блок') && has(asked, 'Перенести и удалить'),
    line(asked, 'записано'),
  )
  await act(pick('move-target', 'cat:прочее'))
  await sleep(300)
  await act(`byText('button', 'Перенести и удалить')?.click()`)
  await sleep(700)
  check('категория с блоками удалена после переноса', !has(await screen(), 'Шахматы'))

  // Архивную — прямо из архива, возвращать ради этого незачем.
  await unfold('Архив')
  await act(`window.confirm = () => true; document.querySelector('[aria-label="Удалить категорию «Покер»"]')?.click()`)
  await sleep(700)
  check('архивная категория удаляется прямо из архива', !has(await screen(), 'Покер'))
  await go('/time')
  const transferred = await screen()
  check(
    'блоки перешли в выбранную — и фоновая тоже',
    has(transferred, 'Ютуб · 1 ч · фоном Прочее') && has(transferred, 'Фоном, в сумму не входит: Прочее 1 ч'),
    line(transferred, 'фоном Прочее'),
  )

  // ─ Прошлый день (Р-25): листается стрелкой, день — в адресе, кнопки
  // пишут в показанный день. Вчера лежит блок «задним числом» выше.
  const timerFold = () =>
    run(`[...document.querySelectorAll('.fold__btn')].some((el) => el.textContent.trim() === 'Таймер')`)
  await act(`document.querySelector('[aria-label="Предыдущий день"]')?.click()`)
  await sleep(700)
  const yesterday = await screen()
  const yesterdayHash = await run('location.hash')
  const yesterdayTimer = await timerFold()
  check(
    '«‹» — вчерашний день: его блоки, подпись над кнопками, без таймера — Р-25',
    /day=\d{4}-\d{2}-\d{2}/.test(String(yesterdayHash)) &&
      has(yesterday, 'Учтено 25 мин · 1 блок') &&
      has(yesterday, 'Кнопки записывают на') &&
      yesterdayTimer === false,
    `${yesterdayHash}; ${line(yesterday, 'Учтено')}; таймер ${yesterdayTimer ? 'есть' : 'нет'}`,
  )

  await act(`byText('button', 'Чтение +30')?.click()`)
  await sleep(700)
  await send('Page.reload')
  await sleep(2000)
  const reloaded = await screen()
  check(
    'тап на вчерашнем пишет во вчера, перезагрузка остаётся на нём',
    has(reloaded, 'Учтено 55 мин · 2 блока') && has(reloaded, 'Кнопки записывают на'),
    line(reloaded, 'Учтено'),
  )

  await act(`document.querySelector('[aria-label="Следующий день"]')?.click()`)
  await sleep(700)
  const back = await screen()
  check(
    '«›» — снова сегодня, вчерашний тап сюда не лёг',
    has(back, 'Учтено 2 ч 5 мин · 3 блока') && (await timerFold()) === true && (await run('location.hash')) === '#/time',
    line(back, 'Учтено'),
  )

  await go('/time?day=2099-01-01')
  check('будущий день в адресе — сегодня', has(await screen(), 'Учтено 2 ч 5 мин · 3 блока'))

  // ─ Заметка блока: пишется в правке, видна в списке дня.
  await act(`startsWith('button', 'Прогулка ·')?.click()`)
  await sleep(400)
  await act(`
    const form = [...document.querySelectorAll('input[name=block-minutes]')].find((el) => el.value === '40').closest('form');
    set(form.querySelector('textarea[name=block-note]'), 'по набережной');
    form.querySelector('button[type=submit]').click();
  `)
  await sleep(700)
  const noted = await screen()
  check(
    'заметка блока пишется в правке и видна в списке дня',
    has(noted, 'по набережной') && has(noted, 'Учтено 2 ч 5 мин · 3 блока'),
    line(noted, 'набережной'),
  )

  // ─ Настройки: разделы свёрнуты оглавлением, у свёрнутой копии — итог.
  // Шестерёнка живёт в шапке «Сегодня».
  await go('/')
  await act(`document.querySelector('[aria-label="Настройки"]')?.click()`)
  await sleep(700)
  const settings = await screen()
  check(
    'настройки открываются шестерёнкой, разделы свёрнуты',
    has(settings, 'О приложении') && has(settings, 'Экспорт и импорт') && !has(settings, 'Версия схемы'),
    settings.replace(/\s+/g, ' ').slice(0, 160),
  )
  check('у свёрнутого «Экспорт и импорт» видно, что копии нет', has(settings, 'копии нет'))

  await unfold('О приложении')
  const about = await screen()
  check(
    'в «О приложении» — схема, сборка и что лежит в базе',
    has(about, 'Версия схемы') && has(about, 'Сборка') && has(about, 'Заметки и план'),
    line(about, 'Заметки и план'),
  )
  check(
    'в «О приложении» — как установить',
    has(about, 'Установка') && (has(about, 'Установить') || has(about, 'меню браузера')),
    about.replace(/\s+/g, ' ').slice(0, 200),
  )

  // ─ Напоминание о незаполненном дне (Р-24). Фоновую проверку браузер
  // вне установленного приложения не даёт; «Проверить сейчас» — тот же
  // расчёт, что у service worker. За сегодня блоки есть — напоминать не о чем.
  const granted = await grantNotifications()
  await unfold('Напоминания')
  await act(`byText('button', 'Проверить сейчас')?.click()`)
  await sleep(1500)
  const reminders = await screen()
  check(
    'напоминания: «Проверить сейчас» доходит, за учтённый день напоминать не о чем — Р-24',
    granted && has(reminders, 'Напоминать не о чем — за сегодня время уже учтено'),
    line(reminders, 'Напомина'),
  )

  // ─ Названия экранов (Р-26): по умолчанию «Учёт», своё — из настроек,
  // сразу во вкладке и в заголовке, без перезапуска.
  const tabs = () => run(`[...document.querySelectorAll('.tab')].map((el) => el.textContent.trim()).join(', ')`)
  const defaults = await tabs()
  check('вкладки по умолчанию — «Сегодня», «Учёт», «Заметки» — Р-32', defaults === 'Сегодня, Учёт, Заметки', defaults)
  await unfold('Названия экранов')
  await act(`
    set(document.querySelector('input[name=screen-time]'), 'Хронометраж');
    byText('button', 'Сохранить')?.click();
  `)
  await sleep(700)
  const renamed = await tabs()
  await go('/time')
  const renamedHead = await run(`document.querySelector('h1')?.textContent ?? ''`)
  check(
    'своё название — сразу во вкладке и в заголовке экрана',
    renamed === 'Сегодня, Хронометраж, Заметки' && renamedHead === 'Хронометраж',
    `${renamed}; заголовок «${renamedHead}»`,
  )
  await go('/settings')
  await act(`byText('button', 'Вернуть по умолчанию')?.click()`)
  await sleep(700)
  const restored = await tabs()
  check('«Вернуть по умолчанию» возвращает названия', restored === defaults, restored)

  // ─ Копия файлом: туда и обратно.
  await unfold('Экспорт и импорт')
  await act(`byText('button', 'Сохранить в файл')?.click()`)
  await sleep(1500)
  check('копия сохраняется в файл', has(await screen(), 'Файл сохранён'))

  const saved = readdirSync(profile).find((name) => /^deluvremya-\d{4}-\d{2}-\d{2}\.json$/.test(name))
  let snapshot = null
  try {
    snapshot = saved ? JSON.parse(readFileSync(join(profile, saved), 'utf8')) : null
  } catch {
    snapshot = null
  }
  check(
    'в файле копии — схема и обе записи, токена нет',
    snapshot?.schemaVersion === 1 &&
      snapshot?.data?.notes?.length === 2 &&
      !JSON.stringify(snapshot).includes('syncToken'),
    saved ?? `файла нет: ${readdirSync(profile).filter((name) => name.endsWith('.json')).join(', ')}`,
  )

  // Запись с другого устройства, без даты: её загрузка — тем же путём, что
  // у человека, «Восстановить из копии».
  const restore = join(profile, 'restore.json')
  writeFileSync(
    restore,
    JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-01-15T10:00:00.000Z',
      data: {
        notes: [
          {
            id: 'from-file',
            updatedAt: '2026-01-15T10:00:00.000Z',
            text: 'Мысль с другого устройства',
            kind: 'thought',
            capturedOn: null,
            plannedFor: null,
            status: 'open',
          },
        ],
      },
    }),
  )
  const { root } = await send('DOM.getDocument')
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
  await send('DOM.setFileInputFiles', { nodeId, files: [restore] })
  await sleep(1000)
  check('копия восстанавливается из файла', has(await screen(), 'Загружено записей: 1'))

  // ─ Импорт записей (Этап 1, п. 6): свой формат, сводка до записи,
  // только добавляет. Новая категория, повтор уже загруженного, кривая дата.
  await unfold('Импорт записей')
  const importFile = JSON.stringify({
    format: 'deluvremya-import',
    version: 1,
    time: [
      { date: '2026-02-03', category: 'Бег', minutes: 30 },
      { date: '2026-02-03', category: 'чтение', minutes: 45, background: 'Ютуб' },
      { date: '2026-02-03', category: 'Чтение', minutes: 45 },
      { date: '03.02.2026', category: 'Чтение', minutes: 20 },
    ],
  })
  await act(`
    set(document.querySelector('.import__text'), ${JSON.stringify(importFile)});
    byText('button', 'Разобрать')?.click();
  `)
  await sleep(700)
  const planned = await screen()
  check(
    'импорт: до записи — что добавится, что уже есть, что не разобрано',
    has(planned, 'Добавится: 2 блока времени, 1 категория') &&
      has(planned, 'пропущено, не перезаписано: 1') &&
      has(planned, 'Не разобрано — в базу не попадёт: 1') &&
      has(planned, 'не ГГГГ-ММ-ДД'),
    `${line(planned, 'Добавится')}; ${line(planned, 'Не разобрано')}`,
  )
  await act(`startsWith('button', 'Загрузить')?.click()`)
  await sleep(1000)
  check('импорт пишет по кнопке', has(await screen(), 'Загружено записей: 3'))
  // К дню месяцы назад — полем даты, а не сотней тапов «‹» (Р-27).
  await go('/time')
  await act(`set(document.querySelector('input[name=day]'), '2026-02-03')`)
  await sleep(700)
  const imported = await screen()
  const pickedHash = await run('location.hash')
  check(
    'импортированный день открывается полем даты, фоновая — отдельно — Р-27',
    pickedHash === '#/time?day=2026-02-03' &&
      has(imported, 'Учтено 1 ч 15 мин · 2 блока') &&
      has(imported, 'Фоном, в сумму не входит: Ютуб 45 мин'),
    `${pickedHash}; ${line(imported, 'Учтено')}`,
  )
  await go('/settings')

  await go('/inbox')
  const merged = await screen()
  check(
    'восстановленная запись без даты видна в неразобранном — Р-08',
    has(merged, 'Мысль с другого устройства') && has(merged, 'без даты') && has(merged, '3 записи'),
    line(merged, 'записи'),
  )

  await notesScenario()

  await syncScenario()

  // ─ Service worker: без него нет ни офлайна, ни автообновления.
  const worker = await run(`Promise.race([
    navigator.serviceWorker.ready.then((r) => r.active?.state ?? 'нет'),
    new Promise((done) => setTimeout(() => done('не дождался'), 5000)),
  ])`)
  check('service worker встал и активен', worker === 'activated', `состояние ${worker}`)

  // ─ Без сети. Проверяется и то, что страницу отдал работник: иначе при
  // непойманном офлайне проверка прошла бы на обычной загрузке из сети.
  await offline(true)
  await open(`${APP}?go=inbox`)
  const cached = await screen()
  const controlled = await run('navigator.serviceWorker.controller !== null')
  check(
    'без сети приложение открывается из кеша, записи на месте',
    has(cached, 'Заметки') && has(cached, 'Купить фильтр для воды') && controlled === true,
    `работник ${controlled ? 'управляет' : 'не управляет'} страницей`,
  )

  await open(`${APP}?text=${encodeURIComponent('без сети')}`)
  const offlineShare = await captureField()
  check('«Поделиться» без сети тоже доезжает — Р-16', offlineShare === 'без сети', `в поле «${offlineShare}»`)
  await offline(false)
}

/** Месяц словом, как его ищут: «сентябрь». По часам этого компьютера — как `today()`. */
const MONTH_WORDS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

/**
 * Заметки (Этап 3): вид при записи, замысел и его дело (Р-31), поиск
 * и отбор, карточка — «Сделано», «Отменить», смена вида, «Удалить» (Р-30).
 * На входе в неразобранном три записи: фильтр, ссылка про сон и мысль
 * без даты с другого устройства.
 */
async function notesScenario() {
  await go('/inbox')
  const field = `document.querySelector('textarea[name=text]')`
  const pressed = () =>
    run(`[...document.querySelectorAll('form [aria-pressed=true]')].map((el) => el.textContent.trim()).join(', ')`)
  const openCard = (text) => act(`startsWith('.note__main', ${JSON.stringify(text)})?.click()`)
  const search = (query) => act(`set(document.querySelector('input[name=search]'), ${JSON.stringify(query)})`)

  // ─ Вид при записи — тапом и не обязателен; после записи снова «Дело» (Р-13).
  await act(`byText('button', 'Мысль')?.click()`)
  await sleep(300)
  await act(`
    set(${field}, 'Думается лучше на ходу');
    byText('button', 'Записать')?.click();
  `)
  await sleep(700)
  const thought = await screen()
  const kindAfter = await pressed()
  check(
    'мысль записывается тапом по виду; после записи вид снова «Дело» — Р-13',
    has(thought, 'Записано: мысль') && has(thought, 'мысль · сегодня') && kindAfter === 'Дело',
    `${line(thought, 'Записано')}; выбран «${kindAfter}»`,
  )

  await act(`byText('button', 'Замысел')?.click()`)
  await sleep(300)
  await act(`
    set(${field}, 'Выучить испанский');
    byText('button', 'Записать')?.click();
  `)
  await sleep(700)
  const goal = await screen()
  check(
    'замысел — своим блоком, в неразобранное не попадает — Р-31',
    has(goal, 'Выучить испанский') && has(goal, 'дел пока нет') && has(goal, '4 записи'),
    `${line(goal, 'дел пока')}; ${line(goal, 'записи')}`,
  )

  // ─ Дело относится к замыслу в своей карточке.
  await openCard('Купить фильтр для воды')
  await sleep(400)
  await act(`
    const select = document.querySelector('select[name=note-goal]');
    const option = [...select.options].find((each) => each.textContent.trim() === 'Выучить испанский');
    set(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  `)
  await sleep(700)
  const linked = await screen()
  check(
    'дело относится к замыслу в своей карточке; у замысла — сколько дел — Р-31',
    has(linked, 'к замыслу «Выучить испанский»') && has(linked, '1 дело, сделано 0'),
    `${line(linked, 'к замыслу')}; ${line(linked, 'дело,')}`,
  )

  // ─ Поиск: слова в любом порядке, название замысла, месяц словом.
  await search('воды фильтр')
  await sleep(500)
  const byWords = await screen()
  check(
    'поиск: слова в любом порядке; скрытое названо числом',
    has(byWords, 'Показано 1 из 4') && has(byWords, 'Купить фильтр для воды') && !has(byWords, 'Думается'),
    line(byWords, 'Показано'),
  )
  await search(`испанский ${MONTH_WORDS[new Date().getMonth()]}`)
  await sleep(500)
  const byGoal = await screen()
  check(
    'дело находится по названию своего замысла и по месяцу словом',
    has(byGoal, 'Показано 1 из 4') && has(byGoal, 'Купить фильтр для воды'),
    line(byGoal, 'Показано'),
  )
  await search('')
  await sleep(300)

  // ─ Отбор по виду.
  await act(`startsWith('button', 'Мысли')?.click()`)
  await sleep(500)
  const thoughts = await screen()
  check(
    'чип «Мысли» — только мысли, остальное названо числом',
    has(thoughts, 'Показано 2 из 4') && has(thoughts, 'Думается лучше на ходу') && !has(thoughts, 'example.com/son'),
    line(thoughts, 'Показано'),
  )
  await act(`startsWith('button', 'Все')?.click()`)
  await sleep(300)

  // ─ «Сделано» и «Отменить»: карточка фильтра всё ещё открыта.
  await act(`byText('button', 'Сделано')?.click()`)
  await sleep(700)
  const finished = await screen()
  check(
    '«Сделано» убирает дело из неразобранного и засчитывается замыслу — Р-30',
    has(finished, 'Сделано — убрано из «Неразобранное»') && has(finished, '1 дело, сделано 1') && has(finished, '3 записи'),
    `${line(finished, 'убрано')}; ${line(finished, 'дело,')}`,
  )
  await act(`byText('button', 'Отменить')?.click()`)
  await sleep(700)
  const undone = await screen()
  check(
    '«Отменить» возвращает дело на место',
    has(undone, 'Купить фильтр для воды') && has(undone, '4 записи') && has(undone, '1 дело, сделано 0'),
    `${line(undone, 'записи')}; ${line(undone, 'дело,')}`,
  )

  // ─ Вид меняется потом, в карточке; удаление — после подтверждения.
  await openCard('Думается лучше на ходу')
  await sleep(400)
  // С «const», а не со скобки: строка «[…» склеилась бы с концом помощников.
  await act(`
    const chip = [...document.querySelectorAll('.note__card button[aria-pressed]')]
      .find((el) => el.textContent.trim() === 'Замысел');
    chip?.click();
  `)
  await sleep(700)
  const goalsBlock = await run(
    `[...document.querySelectorAll('.fold__btn')].find((el) => el.textContent.trim() === 'Замыслы')?.closest('section')?.innerText ?? ''`,
  )
  const regrouped = await screen()
  check(
    'вид меняется потом, в карточке: мысль стала замыслом и ушла в его блок',
    has(goalsBlock, 'Думается лучше на ходу') && has(regrouped, '3 записи'),
    `${line(regrouped, 'записи')}; в замыслах: ${goalsBlock.replace(/\s+/g, ' ').slice(0, 80)}`,
  )
  await act(`window.confirm = () => true; byText('button', 'Удалить')?.click()`)
  await sleep(700)
  const removed = await screen()
  check(
    '«Удалить» после подтверждения убирает запись',
    !has(removed, 'Думается лучше на ходу') && has(removed, 'Выучить испанский'),
    line(removed, 'Выучить'),
  )

  await notesImportScenario()
}

/**
 * Импорт заметок (Этап 3, п. 5): свой раздел формата, дата необязательна,
 * месяц без числа — в отчёт, совпавшее с записанным — пропускается.
 * Загруженное встаёт по дню записи, а не по id: у него id — момент импорта.
 */
async function notesImportScenario() {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  await go('/settings')
  await unfold('Экспорт и импорт')
  await unfold('Импорт записей')
  const file = JSON.stringify({
    format: 'deluvremya-import',
    version: 1,
    notes: [
      { text: 'Старая мысль из блокнота', kind: 'thought' },
      { text: 'Починить полку', date: '2026-03-12' },
      { text: 'Купить фильтр для воды', date: today },
      { text: 'Только месяц', date: '2026-03' },
    ],
  })
  await act(`
    set(document.querySelector('.import__text'), ${JSON.stringify(file)});
    byText('button', 'Разобрать')?.click();
  `)
  await sleep(700)
  const planned = await screen()
  check(
    'импорт заметок: без даты принимается, совпавшее пропускается, месяц без числа — в отчёт — Р-08',
    // Причина целиком: слова «только месяц» есть и в тексте самой записи.
    has(planned, 'Добавится: 2 заметки') &&
      has(planned, 'пропущено, не перезаписано: 1') &&
      has(planned, 'только месяц; не пиши её'),
    `${line(planned, 'Добавится')}; ${line(planned, 'Только месяц')}`,
  )
  await act(`startsWith('button', 'Загрузить')?.click()`)
  await sleep(1000)
  check('импорт заметок пишет по кнопке', has(await screen(), 'Загружено записей: 2'))

  await go('/inbox')
  const listed = await screen()
  const at = (text) => listed.indexOf(text)
  const order = ['Купить фильтр для воды', 'Март 2026', 'Починить полку', 'Без даты', 'Старая мысль из блокнота'].map(at)
  check(
    'загруженное — по дню записи, а не по id: март ниже сегодняшних, без даты — в конце',
    order.every((place, index) => place !== -1 && (index === 0 || place > (order[index - 1] ?? -1))),
    order.join(' < '),
  )

  // Проход синхронизации идёт через пять секунд после последней записи.
  // Без паузы он срабатывает сразу после ввода токена в сценарии
  // синхронизации и опережает кнопку «Синхронизировать», которую тот
  // проверяет. Пусть отработает здесь, пока синхронизация выключена.
  await sleep(6000)
}

/**
 * Синхронизация (Этап 2) на подставном GitHub: включить, завести пустой
 * репозиторий, отправить; тихий повтор; коммит другого устройства с
 * одноимённой категорией (Р-29); отказ токена; обрыв связи и очередь.
 * В конце синхронизация выключается — дальше сценарий прежний.
 */
async function syncScenario() {
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.github.com/*' }] })
  const syncNow = async (wait = 2500) => {
    await act(`byText('button', 'Синхронизировать')?.click()`)
    await sleep(wait)
    return screen()
  }

  await go('/settings')
  await unfold('Синхронизация')
  const off = await screen()
  check(
    'синхронизация по умолчанию выключена — данные только в браузере',
    has(off, 'данные живут только в этом браузере'),
    line(off, 'выключен'),
  )

  await act(`document.querySelector('.check input')?.click()`)
  await sleep(500)
  await act(`
    set(document.querySelector('input[placeholder="владелец/репозиторий"]'), ${JSON.stringify(REPO)});
    const token = document.querySelector('input[type=password]');
    set(token, ${JSON.stringify(GOOD_TOKEN)});
    blur(token);
  `)
  await sleep(500)
  await act(`byText('button', 'Проверить доступ')?.click()`)
  await sleep(1500)
  const access = await screen()
  check(
    '«Проверить доступ»: репозиторий найден, приватный, запись разрешена; срок токена — из ответа',
    has(access, `Репозиторий ${REPO} найден, приватный, запись разрешена`) &&
      has(access, 'Токен действует до') &&
      has(access, 'Сохранён в этом браузере'),
    `${line(access, 'Репозиторий')}; ${line(access, 'Токен действует')}`,
  )

  // ─ Первый проход: пустой репозиторий заводится сам, дальше — один коммит.
  // Синхронизацию включили без перезапуска: проход на старте видел её
  // выключенной. Первое нажатие обязано пойти в сеть, а не ответить
  // «не заполнены» — ровно так ошибка в `syncNow` и была поймана.
  const first = await syncNow(3000)
  debug(`экран после первого прохода:\n${first}`)
  const paths = Object.keys(repoFiles()).sort()
  const month = localMonth()
  check(
    'пустой репозиторий заведён сам, всё ушло одним коммитом — Р-32',
    commitCount() === 2 && has(first, 'отправлено файлов') && has(first, 'Всё отправлено'),
    `коммитов ${commitCount()}; ${line(first, 'отправлено файлов')}`,
  )
  const expected = ['meta.json', 'categories.json', 'presets.json', 'templates.json', 'reviews.json',
    'time/2026-02.json', `time/${month}.json`, `notes/${month}.json`, 'notes/undated.json']
  check(
    'раскладка по месяцам, годовых файлов нет — Р-28',
    expected.every((path) => paths.includes(path)) && !paths.some((path) => /^(time|notes)\/\d{4}\.json$/.test(path)),
    paths.join(', '),
  )
  check(
    'импортированный февраль — в своём файле целиком',
    repoRecords('time/2026-02.json')?.length === 2,
    `в time/2026-02.json записей ${repoRecords('time/2026-02.json')?.length}`,
  )

  const quiet = await syncNow()
  check('повтор без правок — ни одного коммита', commitCount() === 2 && has(quiet, 'Всё и так совпадает'), `коммитов ${commitCount()}`)

  // ─ Другое устройство: своя «Бег» с другим id и блок в ней (Р-29).
  const later = new Date(Date.now() + 60_000).toISOString()
  commitFromOtherDevice({
    'categories.json': [
      ...repoRecords('categories.json'),
      { id: 'phone-run', updatedAt: later, name: 'Бег', order: 99, kind: 'useful' },
    ],
    'time/2026-02.json': [
      ...repoRecords('time/2026-02.json'),
      { id: 'phone-block', updatedAt: later, date: '2026-02-03', categoryId: 'phone-run', minutes: 15 },
    ],
  })
  const pulled = await syncNow()
  check('коммит другого устройства влит', has(pulled, 'получено записей 2'), line(pulled, 'получено'))

  // Слияние ждёт секунду тишины, его запись уезжает сама через пять.
  await sleep(8000)
  const tomb = repoRecords('categories.json')?.find((each) => each.id === 'phone-run')
  const block = repoRecords('time/2026-02.json')?.find((each) => each.id === 'phone-block')
  check(
    'одноимённая слита и уехала обратно: надгробие с movedTo, блок у оставшейся — Р-29',
    tomb?.deleted === true && tomb?.movedTo === 'cat:бег' && block?.categoryId === 'cat:бег',
    JSON.stringify({ tomb, block }),
  )
  await go('/time/categories')
  const runs = await run(`[...document.querySelectorAll('button')].filter((el) => el.textContent.trim() === 'Бег').length`)
  check('в списке категорий одна «Бег»', runs === 1, `кнопок «Бег»: ${runs}`)
  await go('/time?day=2026-02-03')
  const day = await screen()
  check('блок другого устройства — в своём дне', has(day, 'Учтено 1 ч 30 мин · 3 блока'), line(day, 'Учтено'))

  // ─ Токен не принят: причина словами, точка на шестерёнке красная.
  github.reject = true
  await go('/settings')
  const rejected = await syncNow()
  await go('/')
  const red = await run(`document.querySelector('.gear .dot--error') !== null`)
  check(
    'токен не принят — причина словами и красная точка на шестерёнке',
    has(rejected, 'Токен не принят') && red === true,
    `${line(rejected, 'Токен не принят')}; точка ${red ? 'есть' : 'нет'}`,
  )
  github.reject = false

  // ─ Связи нет: запись ждёт в очереди и доезжает, когда связь вернулась.
  github.down = true
  const before = repoRecords(`time/${month}.json`)?.length ?? 0
  await go('/time')
  await act(`byText('button', 'Прогулка +30')?.click()`)
  await sleep(6500)
  await go('/')
  const queued = await run(`document.querySelector('.gear .dot') !== null`)
  await go('/settings')
  const waiting = await screen()
  check(
    'без связи правка ждёт в очереди, точка горит',
    queued === true && has(waiting, 'Ждут отправки: 1'),
    `${line(waiting, 'Ждут отправки')}; точка ${queued ? 'есть' : 'нет'}`,
  )

  github.down = false
  const sent = await syncNow()
  const after = repoRecords(`time/${month}.json`)?.length ?? 0
  await go('/')
  const dark = await run(`document.querySelector('.gear .dot') === null`)
  check(
    'связь вернулась — очередь доехала, точка погасла',
    after === before + 1 && has(sent, 'Всё отправлено') && dark === true,
    `в time/${month}.json было ${before}, стало ${after}; ${line(sent, 'отправлен')}`,
  )

  await go('/settings')
  await act(`document.querySelector('.check input')?.click()`)
  await sleep(500)
  await send('Fetch.disable')
}

/**
 * Разрешение на уведомления для адреса приложения. Без него проверка
 * напоминания упирается в вопрос о разрешении, на который в безголовом
 * браузере некому ответить. Понадобится с напоминаниями (Р-14).
 *
 * Выдаётся из сессии самой вкладки. Через отдельное соединение с браузером
 * не работает, и молча: без контекста ответ «ok», а вкладка по-прежнему
 * видит «не спрашивали»; с контекстом вкладки браузер отвечает, что такого
 * контекста не знает. Проверено в «Дневниках» на Chrome из прогона.
 */
async function grantNotifications() {
  const reply = await send('Browser.grantPermissions', {
    origin: new URL(APP).origin,
    permissions: ['notifications'],
  })
  // Ответ с ошибкой приходит без `result` — `send` отдаёт undefined.
  return reply !== undefined
}

/** Строка экрана с образцом внутри. Для внятного отчёта о непрошедшем. */
function line(text, part) {
  const flat = (value) => value.replace(/\u00A0/g, ' ')
  return flat(text)
    .split('\n')
    .find((each) => each.toLowerCase().includes(part.toLowerCase())) ?? ''
}

// ─── Копия настоящих данных ────────────────────────────────────────────────

/** Разворачивает все свёрнутые блоки, вложенные тоже: они появляются после внешних. */
async function unfoldAll() {
  for (let round = 0; round < 3; round++) {
    await act(`document.querySelectorAll('.fold__btn[aria-expanded="false"]').forEach((el) => el.click())`)
    await sleep(400)
  }
}

/**
 * Экраны на копии настоящих данных. Копия загружается тем же путём, что
 * у человека, — «Восстановить из копии», — и каждый экран открывается со
 * всеми развёрнутыми блоками: ошибка на кривой записи прячется именно
 * в свёрнутом. Условие прохода прежнее — ни одной ошибки в консоли.
 *
 * Данные остаются во временном профиле браузера и удаляются вместе с ним.
 */
async function dataScenario(file) {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('DOM.enable')

  await send('Page.navigate', { url: APP })
  await sleep(2000)

  await go('/settings')
  await unfold('Экспорт и импорт')
  // Поле копии: у него в списке типов есть text/plain.
  const field = await send('Runtime.evaluate', {
    expression: `document.querySelector('input[type=file][accept*="text/plain"]')`,
  })
  const objectId = field?.result?.objectId
  check('поле «Восстановить из копии» найдено', Boolean(objectId))
  if (!objectId) return

  await send('DOM.setFileInputFiles', { files: [file], objectId })
  await sleep(3000)
  const restored = await screen()
  const loaded = /Загружено записей: (\d+)/.exec(restored.replace(/ /g, ' '))
  check('копия загрузилась через «Восстановить из копии»', loaded !== null, loaded?.[0] ?? restored.slice(0, 160))

  const routes = ['/', '/time', '/inbox', '/time/categories', '/settings']

  for (const route of routes) {
    await go(route)
    await unfoldAll()
    const text = await screen()
    check(
      `${route} — открылся на настоящих данных, всё развёрнуто`,
      text.trim().length > 0 && !has(text, 'База не открылась') && !has(text, 'не прочитались'),
      text.replace(/\s+/g, ' ').slice(0, 80),
    )
  }
}

// ─── Прогон ────────────────────────────────────────────────────────────────

let server
let browser
let profile

try {
  if (DATA !== null && !existsSync(DATA)) throw new Error(`Файла копии нет: ${DATA}`)
  server = await startServer()
  profile = mkdtempSync(join(tmpdir(), 'deluvremya-smoke-'))
  browser = spawn(
    findBrowser(),
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      // Пустой временный профиль: своей базы у прогона нет и быть не должно.
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  await connect(await pageSocket())
  await (DATA === null ? scenario() : dataScenario(DATA))
} catch (failure) {
  problems.push(failure instanceof Error ? failure.message : String(failure))
} finally {
  socket?.close()
  browser?.kill()
  await server?.close()
}

// Браузер отпускает профиль не мгновенно, и на Windows удаление сразу
// после kill падает с EPERM. Не удалось — не беда: это папка во временных.
await sleep(500)
if (profile) {
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    // Останется до следующей уборки временных файлов.
  }
}

const failed = checks.filter((each) => !each.passed)

for (const each of checks) {
  console.log(`${each.passed ? '  ok' : 'НЕТ '} ${each.what}${each.seen ? ` — ${each.seen}` : ''}`)
}

if (problems.length > 0) {
  console.log('\nБраузер сообщил об ошибках:')
  for (const problem of problems) console.log(`  ${problem}`)
}

const bad = failed.length > 0 || problems.length > 0
console.log(
  bad
    ? `\nПрогон не прошёл: проверок ${checks.length}, не сошлось ${failed.length}, ошибок ${problems.length}`
    : `\nПрогон прошёл: ${checks.length} проверок, ошибок нет`,
)

process.exit(bad ? 1 : 0)
