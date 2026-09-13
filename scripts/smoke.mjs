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
    'мысль записалась одним полем и кнопкой — Р-09',
    has(typed, 'Записано во входящие') && has(typed, 'Купить фильтр для воды') && has(typed, '1 запись'),
    line(typed, 'Во входящих'),
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
    `${line(afterShare, 'Во входящих')}; хеш ${hashAfter}`,
  )
  await send('Page.reload')
  await sleep(2000)
  const refilled = await captureField()
  check('после перезагрузки поле пустое — второй раз не принято', refilled === '', `в поле «${refilled}»`)

  // ─ Ярлыки: адрес с ?go=, а не с # (Р-16).
  await open(`${APP}?go=inbox`)
  const inboxHash = await run('location.hash')
  check(
    'ярлык «Записать» открывает входящие',
    inboxHash === '#/inbox' && (await captureField()) !== null,
    `хеш ${inboxHash}`,
  )
  await open(`${APP}?go=time`)
  const timeHash = await run('location.hash')
  check(
    'ярлык на экран, которого ещё нет, открывает главный, а не пустоту',
    timeHash === '#/' && has(await screen(), 'Сегодня'),
    `хеш ${timeHash}`,
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
    has(about, 'Версия схемы') && has(about, 'Сборка') && has(about, 'Входящие и план'),
    line(about, 'Входящие и план'),
  )
  check(
    'в «О приложении» — как установить',
    has(about, 'Установка') && (has(about, 'Установить') || has(about, 'меню браузера')),
    about.replace(/\s+/g, ' ').slice(0, 200),
  )

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

  await go('/inbox')
  const merged = await screen()
  check(
    'восстановленная запись без даты видна во входящих — Р-08',
    has(merged, 'Мысль с другого устройства') && has(merged, 'без даты') && has(merged, '3 записи'),
    line(merged, 'Во входящих'),
  )

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
    has(cached, 'Входящие') && has(cached, 'Купить фильтр для воды') && controlled === true,
    `работник ${controlled ? 'управляет' : 'не управляет'} страницей`,
  )

  await open(`${APP}?text=${encodeURIComponent('без сети')}`)
  const offlineShare = await captureField()
  check('«Поделиться» без сети тоже доезжает — Р-16', offlineShare === 'без сети', `в поле «${offlineShare}»`)
  await offline(false)
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

  const routes = ['/', '/inbox', '/time/categories', '/settings']

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
