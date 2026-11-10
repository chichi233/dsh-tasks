import fs from 'node:fs'
import path from 'node:path'

/**
 * dsh-tasks 的 Host 半边（t123）。
 *
 * 只做一件事：把「DSH 自己的 llm 服务 + 当前默认模型」暴露成四条同源路由，
 * 让面板不必再让用户填第三方 API Key，也不必从 `dsh-app://` 页面直连第三方
 * （那条路在 Electron 里必被 CORS 拦掉）。
 *
 * 路由（全部挂在 prefix `/plugins/local/dsh-tasks` 下）：
 *   GET  /models  → { ok, selection:{provider,model}, providers:[...] }
 *   POST /ping    → { ok, provider, model, latency, text }
 *   POST /polish  → { ok, text, provider, model, usage }  body: { kind:'polish', task }
 *   POST /score   → { ok, text, provider, model, usage }  body: { kind:'score', task, fewshot? }
 *
 * 页面只传业务数据（kind / task / fewshot / 可选的 provider+model 覆盖），
 * **不传 system、不传 messages**：prompt 的真源在 Host，kind 决定用哪一条。
 *
 * 安全边界（t122 §10.8）：
 *   1. 每个请求第一件事是 `connection.requestRejection(req)`，非 undefined 按其码回 401/403，
 *      绝不自造 401，也绝不把 workspace 状态暴露给未认证请求。
 *   2. 响应体只含 { ok, code, message, text, provider, model, usage, latency }；
 *      错误 message 经 redact() 抹掉 Bearer / sk- 形态的串，且不超过 200 字符。
 *   3. 不写日志（只 console.warn 一次装配失败，不含请求内容）。
 *   4. 所有分支都 res.end()；stream 用请求内建的 AbortController，res 关闭即 abort。
 *   5. 路由用 ctx.effect 注册，dispose 时 disposer 注销 —— 卸载后四条路径回 404。
 */

/** 同源路由前缀（页面侧 DSH_AGENT_BASE 必须与此逐字一致）。 */
export const DSH_TASKS_ROUTE_PREFIX = '/plugins/local/dsh-tasks'

/** 单请求体上限（t122 §10.8：413 / AGENT_BASE）。 */
const BODY_LIMIT_BYTES = 64 * 1024

/** 单次生成上限，防止面板卡在一条永不结束的流上。 */
const GENERATE_TIMEOUT_MS = 45 * 1000
/* ping 预算：起步 256（够推理模型先想再答），空文本再 1024 重试一次 */
const PING_TOKENS = 256
const PING_TOKENS_RETRY = 1024

/** 上游错误 message 的截断长度（t122：≤200）。 */
const REDACT_LIMIT = 2000
const MESSAGE_LIMIT = 200

/**
 * 本插件调用模型时使用的会话标识。
 *
 * 为什么必须有：`opencode-go` 与 `opencode` 两个供应商的适配器会读
 * `GenerateOptions.sessionId` 并据此注入 `x-opencode-session` 请求头；
 * 缺了它上游直接回 400 `MissingSessionID`，页面上就显示「服务端错误，已重试」。
 * 该值只用于上游做会话路由，不参与业务逻辑，进程内固定一个即可。
 */
const TASK_SESSION_ID = 'dsh-tasks-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

/** 只用这 10 个错误码，与页面侧 AGENT_CODE_MESSAGE 一一对应。 */
const CODE = {
  AUTH: 'AGENT_AUTH',
  RATE: 'AGENT_RATE',
  FORMAT: 'AGENT_FORMAT',
  ENDPOINT: 'AGENT_ENDPOINT',
  SERVER: 'AGENT_SERVER',
  TIMEOUT: 'AGENT_TIMEOUT',
  NETWORK: 'AGENT_NETWORK',
  BAD_JSON: 'AGENT_BAD_JSON',
  BASE: 'AGENT_BASE',
  CONFIG: 'AGENT_CONFIG'
}

/** webServer 服务的注册名在不同装配里叫法不同，两个都试。 */
const WEB_SERVER_KEYS = ['webServer', 'hostWebServer']

/**
 * 整理通道按强度分支的步数/耗时口径（唯一真源，`polishSystemOf` 从这里取值）。
 *
 * 与页面侧的关系（t214 更正）：**不再与 `src/parts/57-agent.js` 的 `AGENT_SYSTEM_PROMPT` 逐字一致**。
 * 那边是 3–7 条的老文案，只服务 custom 档的整理通道与客户端默认兜底；本文件按 strength 生成
 * weak 3–5 / mid 6–10 / strong 11–18 的提示词（`polishSystemOf`），客户端的拆解通道
 * 也用同一套区间（`AGENT_BREAKDOWN_RANGES`，`agentBreakdownSystemPrompt`）。
 * 三处区间必须同值，改一处要同步另两处；口径文档见 `docs/stage4-foundation.md` §9.3（整理请求 schema）
 * 与 §10.6（两套 prompt 的分工）。
 */
const ACT_NOW_STRENGTH = {
  weak: { label: '弱', count: '3 到 5 条', minutes: '10 到 30 分钟' },
  mid: { label: '中', count: '6 到 10 条', minutes: '10 到 45 分钟' },
  strong: { label: '强', count: '11 到 18 条', minutes: '5 到 60 分钟' }
}

function polishStrengthOf(body) {
  const raw = body && typeof body.strength === 'string' ? body.strength : ''
  return ACT_NOW_STRENGTH[raw] ? raw : 'mid'
}

function polishSystemOf(body) {
  const conf = ACT_NOW_STRENGTH[polishStrengthOf(body)]
  return [
    '你是任务整理助手。只输出 JSON，不要输出任何解释、前后缀或代码块围栏。',
    '输出形如 {"title": "...", "steps": [{"text": "...", "minutes": 15}, ...]}。',
    'title：不超过 24 个字，动词开头，保留原意，不要加书名号或引号。',
    'steps：' + conf.count + '，按执行顺序排列，动词开头，每条不超过 40 个字。',
    'minutes：这一步预计耗时，单位分钟，取 5 到 60 之间的整数（' + conf.label + '档单步建议 ' + conf.minutes + '）。',
    '每一步必须是能立刻动手的动作，不要写「思考一下」「了解一下」这类空动作。',
    '信息不足时也要给出可执行的步骤，不要编造事实、不要写「根据…」之类的套话。'
  ].join('\n')
}
/** detail 里各字段的长度上限（t151）：上游原文只留够定位的量。 */
const SCORE_SYSTEM_PROMPT = [
  '你是任务评分助手。根据任务信息给出 0–100 的整数分数，并给一句话理由。',
  '',
  '评分口径：分数越高表示越值得优先做（影响大、紧急、与长期目标相关）；分数越低表示越可以往后放。',
  '',
  '输出要求：',
  '1. 只输出一个 JSON 对象：{"score": <0–100 的整数>, "reason": "<一句话，不超过 60 字>"}。',
  '2. score 必须是整数，不得带小数、不得带百分号、不得写成字符串。',
  '3. reason 只写这个分数的主要依据，不写建议、不写鼓励语、不重复任务标题。',
  '4. 不要输出 title、steps 或任何其他字段。',
  '',
  '共用硬规则（同本节开头三条）：不臆造、非任务返回 {"error":"not_a_task"}、只输出一个 JSON 对象。'
].join('\n')

const DETAIL_MESSAGE_LIMIT = 200
const DETAIL_TYPE_LIMIT = 64
const DETAIL_CODE_LIMIT = 64

/**
 * 把宿主错误摊平成可安全外传的 detail（t151）。
 * 只做「如实摊平 + 脱敏」：拿不到的字段直接省略，不写 null、不猜、不翻译。
 * stage：select-model（没模型）| generate（装配或上游失败）| timeout（中断/超时）| request（兜底）
 */
function errorDetail(stage, error, finishKind) {
  const detail = { stage: stage }
  const src = error && typeof error === 'object' ? error : {}
  const put = function (key, value, limit) {
    if (typeof value !== 'string') return
    const text = value.trim()
    if (text === '') return
    detail[key] = redact(text).slice(0, limit)
  }
  put('code', src.code, DETAIL_CODE_LIMIT)
  put('name', src.name, DETAIL_TYPE_LIMIT)
  const status = typeof src.status === 'number' ? src.status
    : (typeof src.statusCode === 'number' ? src.statusCode : undefined)
  if (status !== undefined && isFinite(status)) detail.upstreamStatus = status
  put('upstreamType', src.type, DETAIL_TYPE_LIMIT)
  put('upstreamMessage', src.message !== undefined ? src.message : src.description, DETAIL_MESSAGE_LIMIT)
  if (typeof finishKind === 'string' && finishKind !== '') {
    detail.finishKind = redact(finishKind).slice(0, DETAIL_TYPE_LIMIT)
  }
  return detail
}

function redact(text) {
  const raw = String(text === undefined || text === null ? '' : text)
  return raw
    .replace(/sk-[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/Bearer/gi, '[redacted]')
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, REDACT_LIMIT)
}

/** 统一写 JSON：只给这几个键，别的一律不带（避免把上游原文漏出去）。 */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload)
  })
  res.end(payload)
}

/** 失败体：{ ok:false, code, message[, detail] }，message 与 detail 均已脱敏。
 *  t151：detail 只在调用方明确传入时出现（401 这类鉴权失败不带，避免多漏内部结构）。 */
function writeFailure(res, status, code, message, detail) {
  const body = { ok: false, code: code, message: redact(message) }
  if (detail && typeof detail === 'object') body.detail = detail
  writeJson(res, status, body)
}

/** 读请求体，超过上限抛 BODY_TOO_LARGE（由调用方翻成 413）。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const done = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT_BYTES) {
        done(reject, new Error('BODY_TOO_LARGE'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => done(resolve, Buffer.concat(chunks).toString('utf8')))
    req.on('error', (error) => done(reject, error))
  })
}

/** 当前默认模型：selection 缺失时返回 undefined，由调用方翻成 AGENT_CONFIG。 */
function currentSelection(agentDefaultModel) {
  if (!agentDefaultModel || typeof agentDefaultModel.currentSelection !== 'function') return undefined
  const selection = agentDefaultModel.currentSelection()
  if (!selection || typeof selection.provider !== 'string' || typeof selection.model !== 'string') return undefined
  if (selection.provider === '' || selection.model === '') return undefined
  return { provider: selection.provider, model: selection.model }
}

/** 列出可选 provider（面板只用来做提示，缺失不影响主流程）。 */
function listProviders(llm) {
  try {
    if (llm && typeof llm.listProviders === 'function') {
      const rows = llm.listProviders()
      if (Array.isArray(rows)) {
        return rows
          .map((row) => (typeof row === 'string' ? row : row && row.id))
          .filter((id) => typeof id === 'string' && id !== '')
      }
    }
  } catch (error) {
    /* 列不出来不算失败：面板只用它做提示 */
  }
  return []
}

/**
 * 列出每个 provider 可选模型（两级下拉用）。
 * 单个 provider 失败只让它自己为空，不影响其它 provider —— 设置面板要能「至少选到能用的那个」。
 */
async function listModelsByProvider(llm, providers) {
  const out = {}
  if (!llm || typeof llm.listModels !== 'function') return out
  const tasks = providers.map(async (provider) => {
    try {
      const rows = await llm.listModels(provider)
      const list = Array.isArray(rows) ? rows : []
      out[provider] = list
        .map((row) => {
          const id = typeof row === 'string' ? row : row && (row.id || row.model)
          if (typeof id !== 'string' || id === '') return undefined
          const name = row && (row.name || row.displayName)
          return { id: id, name: typeof name === 'string' && name !== '' ? name : id }
        })
        .filter((row) => row !== undefined)
    } catch (error) {
      out[provider] = []
    }
  })
  await Promise.all(tasks)
  return out
}

/**
 * 组装一条 user 消息。
 * `createUserMessage` 属于 dsh-llm 的运行时导出；本地插件不保证能解析到它，
 * 所以先试动态导入，拿不到就退化成结构相同的普通对象（llm.stream 只读这些字段）。
 */
async function makeUserMessage(text) {
  try {
    const mod = await import('@deepseek-ai/dsh-llm')
    if (mod && typeof mod.createUserMessage === 'function') {
      return mod.createUserMessage({ content: [{ type: 'text', text: text }], source: { kind: 'user' } })
    }
  } catch (error) {
    /* 解析不到就用下面的普通对象 */
  }
  return { role: 'user', content: [{ type: 'text', text: text }] }
}

/** llm.stream 的兼容入口：优先 prepareCall（部分 provider 需要预解析），否则直接 stream。 */
async function openStream(llm, config, request) {
  const call = { provider: config.provider, model: config.model }
  if (config.maxTokens !== undefined) call.maxTokens = config.maxTokens
  if (config.temperature !== undefined) call.temperature = config.temperature
  if (config.reasoningEffort !== undefined) call.reasoningEffort = config.reasoningEffort
  if (typeof llm.prepareCall !== 'function') return llm.stream(Object.assign({}, call, request))
  const prepared = await llm.prepareCall(call, request.signal)
  return prepared.stream(Object.assign({}, prepared.config, request))
}
/** 把上游 finish.reason（对象）翻成「成功 / 超时 / 服务端错误」。 */
function classifyFinish(reason) {
  const kind = reason && typeof reason === 'object' ? reason.kind : reason
  if (kind === 'aborted') {
    return {
      ok: false,
      code: CODE.TIMEOUT,
      message: '生成被中断（超时或请求关闭）',
      detail: errorDetail('timeout', reason && reason.failure ? reason.failure : undefined, 'aborted')
    }
  }
  if (kind === 'error') {
    const failure = reason && reason.failure ? reason.failure : {}
    const message = failure && failure.message ? failure.message : '模型返回错误'
    return { ok: false, code: CODE.SERVER, message: message, detail: errorDetail('generate', failure, 'error') }
  }
  return { ok: true }
}

/**
 * 跑一次生成：收敛 text-delta，finish 定成败。
 * 返回 { ok, text, usage } 或 { ok:false, code, message }。
 */
async function generate(llm, config, request, signal) {
  let stream
  try {
    stream = await openStream(
      llm,
      config,
      Object.assign({}, request, { signal: signal, sessionId: TASK_SESSION_ID })
    )
  } catch (error) {
    const name = error && error.name ? error.name : ''
    if (name === 'AbortError') {
      return { ok: false, code: CODE.TIMEOUT, message: '生成超时', detail: errorDetail('timeout', error) }
    }
    /* t151：装配类错（INVALID_PREPARED_CALL / NO_ADAPTER）stage 仍是 generate，但 code 保留原码，
       让页面能把「配置/装配错」与「上游网络错」分开。 */
    return {
      ok: false,
      code: CODE.SERVER,
      message: error && error.message ? error.message : '模型调用失败',
      detail: errorDetail('generate', error)
    }
  }
  let text = ''
  let usage
  let finish
  try {
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      else if (chunk.type === 'usage') usage = chunk.usage
      else if (chunk.type === 'finish') finish = chunk.reason
    }
  } catch (error) {
    const name = error && error.name ? error.name : ''
    if (name === 'AbortError' || (signal && signal.aborted)) {
      return { ok: false, code: CODE.TIMEOUT, message: '生成超时', detail: errorDetail('timeout', error) }
    }
    return {
      ok: false,
      code: CODE.SERVER,
      message: error && error.message ? error.message : '生成中断',
      detail: errorDetail('generate', error)
    }
  }
  const verdict = classifyFinish(finish)
  if (!verdict.ok) return verdict
  if (text.trim() === '') {
    return {
      ok: false,
      code: CODE.SERVER,
      message: '模型没有返回任何内容',
      detail: errorDetail('generate', undefined, 'empty')
    }
  }
  return { ok: true, text: text, usage: usage }
}

/** 从 body 里取任务摘要：只接受字符串字段，长度封顶，绝不整段回传。 */
function readTask(raw) {
  const task = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const title = typeof task.title === 'string' ? task.title.slice(0, 200) : ''
  const note = typeof task.note === 'string' ? task.note.slice(0, 2000) : ''
  const project = typeof task.project === 'string' ? task.project.slice(0, 60) : ''
  return { title: title, note: note, project: project }
}

/** 页面侧 user content 的组装口径与 57-agent.js 的 agentUserContent 保持一致。 */
function userContentOf(task, kind) {
  const payload = { title: task.title }
  if (task.note !== '') payload.note = task.note
  if (task.project !== '') payload.project = task.project
  const head = kind === 'score' ? '请给下面这个任务打分。' : '请整理下面这个任务。'
  return head + '\n' + JSON.stringify(payload)
}

/** 打分通道允许页面带上 few-shot 块（样例挑选仍归页面算，Host 只做拼接）。 */
function scoreSystemOf(raw) {
  const fewshot = raw && typeof raw.fewshot === 'string' ? raw.fewshot : ''
  if (fewshot.trim() === '') return SCORE_SYSTEM_PROMPT
  return SCORE_SYSTEM_PROMPT + '\n\n' + fewshot
}

/* ------------------------------------------------------------------------- *
 * 滴答 MCP「下载」半边（t137）
 *
 * 面板的「从滴答下载」按钮打 POST /sync → 这里用官方 MCP
 * https://mcp.dida365.com（Streamable-HTTP + Bearer 口令）拉：
 *   1. initialize（拿 Mcp-Session-Id）
 *   2. tools/call list_projects
 *   3. 对每个清单 tools/call get_project_with_undone_tasks
 * 只做「下载」，不写回滴答；口令从工作区根 _secrets/dida_token.txt 读，
 * 或环境变量 DIDA_TOKEN（不写进配置、不进页面）。
 * ------------------------------------------------------------------------- */

const DIDA_MCP_URL = 'https://mcp.dida365.com/'
const DIDA_PROTO = '2025-06-18'

/** 从 cwd 向上最多 6 层找 _secrets/dida_token.txt */
function findDidaTokenFile(start) {
  let d = path.resolve(start || process.cwd())
  for (let i = 0; i < 6; i += 1) {
    const p = path.join(d, '_secrets', 'dida_token.txt')
    try {
      if (fs.existsSync(p)) return p
    } catch (error) {
      return undefined
    }
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  return undefined
}

/** 宿主进程的 cwd 不一定是工作区：cwd 走不到时按固定根再试一次 */
function didaTokenRoots() {
  const roots = []
  const envRoot = String(process.env.DSH_WORKSPACE || '').trim()
  if (envRoot) roots.push(envRoot)
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (home) roots.push(path.join(home, 'Documents', 'deepseek-harness', 'default-workspace'))
  return roots
}

function readDidaToken() {
  const env = String(process.env.DIDA_TOKEN || '').trim()
  if (env !== '') return env
  let p = findDidaTokenFile()
  if (!p) {
    for (const root of didaTokenRoots()) {
      p = findDidaTokenFile(root)
      if (p) break
    }
  }
  if (!p) throw new Error('DIDA_TOKEN_MISSING')
  return fs.readFileSync(p, 'utf8').trim()
}

/** Streamable-HTTP 的响应体：可能是纯 JSON，也可能是 SSE 的 data: 行 */
function parseMcpBody(text) {
  const t = String(text || '').trim()
  if (t.startsWith('{')) {
    try {
      return JSON.parse(t)
    } catch (error) {
      /* 落到 SSE 分支 */
    }
  }
  const lines = t.split(/\r?\n/).filter((l) => l.startsWith('data:'))
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const payload = lines[i].slice(5).trim()
    try {
      const obj = JSON.parse(payload)
      if (obj && (obj.result || obj.error)) return obj
    } catch (error) {
      /* 继续找上一条 */
    }
  }
  throw new Error('MCP_BODY_UNPARSABLE')
}

function createDidaClient(token) {
  let sid
  let id = 0
  const client = {
    async rpc(method, params, notify) {
      id += 1
      const body = { jsonrpc: '2.0', method }
      if (!notify) body.id = id
      if (params !== undefined) body.params = params
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer ' + token
      }
      if (sid) headers['Mcp-Session-Id'] = sid
      const res = await fetch(DIDA_MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) })
      const got = res.headers.get('mcp-session-id')
      if (got) sid = got
      const text = await res.text()
      if (notify) return undefined
      const msg = parseMcpBody(text)
      if (msg.error) throw new Error('MCP_ERROR:' + JSON.stringify(msg.error).slice(0, MESSAGE_LIMIT))
      return msg.result
    },
    async callTool(name, args) {
      const r = await client.rpc('tools/call', { name, arguments: args || {} })
      const items = Array.isArray(r && r.content) ? r.content : []
      return items.map((c) => {
        if (c && typeof c.text === 'string') {
          try {
            return JSON.parse(c.text)
          } catch (error) {
            return c.text
          }
        }
        return c
      })
    }
  }
  return client
}

function normalizeDidaTask(t, projectId) {
  return {
    id: String(t.id || ''),
    projectId: String(t.projectId || projectId || ''),
    title: String(t.title || '').trim(),
    content: String(t.content || ''),
    dueDate: t.dueDate || null,
    startDate: t.startDate || null,
    isAllDay: Boolean(t.isAllDay),
    priority: Number(t.priority || 0),
    status: Number(t.status || 0),
    repeatFlag: String(t.repeatFlag || ''),
    reminders: Array.isArray(t.reminders) ? t.reminders : [],
    tags: Array.isArray(t.tags) ? t.tags : [],
    items: Array.isArray(t.items) ? t.items : []
  }
}

/** 下载全部清单 + 每个清单的未完成任务（不写回滴答） */
async function completeTasks(items) {
  const out = { done: [], failed: [] }
  const list = (Array.isArray(items) ? items : []).filter(function (x) { return x && x.taskId })
  if (list.length === 0) return out
  const token = readDidaToken()
  const client = createDidaClient(token)
  await client.rpc('initialize', {
    protocolVersion: DIDA_PROTO,
    capabilities: {},
    clientInfo: { name: 'dsh-tasks-writeback', version: '1.0.0' }
  })
  await client.rpc('notifications/initialized', undefined, true)
  for (const item of list) {
    const pid = String(item.projectId || '')
    const tid = String(item.taskId || '')
    if (pid === '' || tid === '') {
      out.failed.push({ taskId: tid, error: 'MISSING_ID' })
      continue
    }
    try {
      await client.callTool('complete_task', { project_id: pid, task_id: tid })
      out.done.push(tid)
    } catch (error) {
      out.failed.push({ taskId: tid, error: String((error && error.message) || error).slice(0, MESSAGE_LIMIT) })
    }
  }
  return out
}

async function syncDownload(requestedProjects) {
  const token = readDidaToken()
  const client = createDidaClient(token)
  await client.rpc('initialize', {
    protocolVersion: DIDA_PROTO,
    capabilities: {},
    clientInfo: { name: 'dsh-tasks-sync', version: '1.0.0' }
  })
  await client.rpc('notifications/initialized', undefined, true)

  let list = Array.isArray(requestedProjects) && requestedProjects.length > 0 ? requestedProjects : null
  if (list === null) {
    const raw = await client.callTool('list_projects', {})
    list = []
    for (const item of raw) {
      if (Array.isArray(item)) list.push(...item)
      else if (item && typeof item === 'object') list.push(item)
    }
  }

  const out = { at: new Date().toISOString(), projects: [], tasks: [], errors: [] }
  for (const p of list) {
    const pid = String((p && (p.id || p.projectId)) || '')
    if (pid === '') continue
    out.projects.push({ id: pid, name: String((p && p.name) || ''), color: String((p && p.color) || '') })
    try {
      const raw = await client.callTool('get_project_with_undone_tasks', { project_id: pid })
      const payload = raw.length === 1 ? raw[0] : raw
      const tasks = (payload && (payload.tasks || payload.undone)) || payload || []
      if (Array.isArray(tasks)) {
        for (const t of tasks) if (t && t.id) out.tasks.push(normalizeDidaTask(t, pid))
      }
    } catch (error) {
      out.errors.push({ project: pid, message: String((error && error.message) || error).slice(0, MESSAGE_LIMIT) })
    }
  }
  return out
}

/**
 * 处理一次请求。八步顺序与 t122 §10.8 一致：
 * requestRejection → 405 → 413 → 400/JSON → kind → 500/CONFIG → llm 错 → 500/SERVER。
 */
async function handleRequest(ctx, req, res) {
  /* 1. 认证围栏：raw WebServer 路由不继承 Connection 的认证，必须自己问 */
  const connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
  if (connection && typeof connection.requestRejection === 'function') {
    const rejection = connection.requestRejection(req)
    if (rejection !== undefined) {
      writeFailure(res, rejection, CODE.AUTH, '未授权的请求来源')
      return
    }
  }

  /* 2. 路由与方法 */
  const url = new URL(req.url || '/', 'http://localhost')
  const rest = url.pathname.slice(DSH_TASKS_ROUTE_PREFIX.length)
  const isModels = rest === '/models'
  const isSync = rest === '/sync'
  const isWriteback = rest === '/writeback'
  const isAction = rest === '/ping' || rest === '/polish' || rest === '/score'
  if (!isModels && !isSync && !isWriteback && !isAction) {
    writeFailure(res, 404, CODE.ENDPOINT, '未知端点：' + rest)
    return
  }
  const expectMethod = isModels ? 'GET' : 'POST'
  if (req.method !== expectMethod) {
    writeFailure(res, 405, CODE.BASE, '仅支持 ' + expectMethod + ' ' + DSH_TASKS_ROUTE_PREFIX + rest)
    return
  }

  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
  const agentDefaultModel = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined

  /* GET /models：不需要模型服务也能回，只是 providers 为空 */
  if (isModels) {
    const selection = currentSelection(agentDefaultModel)
    if (selection === undefined) {
      writeFailure(res, 500, CODE.CONFIG, '当前没有可用的默认模型', { stage: 'select-model' })
      return
    }
    const providers = listProviders(llm)
    const models = await listModelsByProvider(llm, providers)
    writeJson(res, 200, { ok: true, selection: selection, providers: providers, models: models })
    return
  }

  /* 3. 读体（413） */
  let raw
  try {
    raw = await readBody(req)
  } catch (error) {
    const tooLarge = error && error.message === 'BODY_TOO_LARGE'
    writeFailure(
      res,
      tooLarge ? 413 : 400,
      tooLarge ? CODE.BASE : CODE.BAD_JSON,
      tooLarge ? '请求体超过 64KB' : '请求体读取失败'
    )
    return
  }

  /* 4. JSON 解析（400 / AGENT_BAD_JSON） */
  let body = {}
  if (raw.trim() !== '') {
    try {
      body = JSON.parse(raw)
    } catch (error) {
      writeFailure(res, 400, CODE.BAD_JSON, '请求体不是合法 JSON')
      return
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    writeFailure(res, 400, CODE.BAD_JSON, '请求体必须是 JSON 对象')
    return
  }

  /* 4.6 回写端点：本地完成后按延迟回写滴答，只做 complete_task */
  if (isWriteback) {
    try {
      const result = await completeTasks(body.items)
      writeJson(res, 200, Object.assign({ ok: true }, result))
    } catch (error) {
      const message = String((error && error.message) || error)
      const missing = message.indexOf('DIDA_TOKEN_MISSING') === 0
      writeFailure(
        res,
        missing ? 500 : 502,
        missing ? CODE.CONFIG : CODE.NETWORK,
        missing ? '缺少滴答口令：把 dida_token.txt 放到工作区 _secrets/' : '回写滴答失败：' + message.slice(0, MESSAGE_LIMIT)
      )
    }
    return
  }

  /* 4.5 下载端点：GET 不要体，POST 体里只能有 projects（可选） */
  if (isSync) {
    try {
      const result = await syncDownload(body.projects)
      writeJson(res, 200, Object.assign({ ok: true }, result))
    } catch (error) {
      const message = String((error && error.message) || error)
      const missing = message.indexOf('DIDA_TOKEN_MISSING') === 0
      writeFailure(
        res,
        missing ? 500 : 502,
        missing ? CODE.CONFIG : CODE.NETWORK,
        missing ? '缺少滴答口令：把 dida_token.txt 放到工作区 _secrets/' : '拉取滴答失败：' + message.slice(0, MESSAGE_LIMIT)
      )
    }
    return
  }

  /* 5. kind 与端点必须一致（400 / AGENT_BASE） */
  const kind = rest === '/ping' ? 'ping' : rest.slice(1)
  if (kind !== 'ping' && body.kind !== kind) {
    writeFailure(res, 400, CODE.BASE, 'kind 与端点不一致：端点 ' + rest + ' 需要 kind=' + kind)
    return
  }

  /* 6. 取模型（500 / AGENT_CONFIG）：允许页面覆盖 provider+model，缺省用默认模型 */
  const fallback = currentSelection(agentDefaultModel)
  const overrideProvider = typeof body.provider === 'string' && body.provider !== '' ? body.provider : ''
  const overrideModel = typeof body.model === 'string' && body.model !== '' ? body.model : ''
  const provider = overrideProvider !== '' ? overrideProvider : fallback ? fallback.provider : ''
  const model = overrideModel !== '' ? overrideModel : fallback ? fallback.model : ''
  if (provider === '' || model === '') {
    writeFailure(res, 500, CODE.CONFIG, '当前没有可用的默认模型', { stage: 'select-model' })
    return
  }
  if (!llm || typeof llm.stream !== 'function') {
    writeFailure(res, 500, CODE.CONFIG, '当前部署没有可用的模型服务',
      { stage: 'select-model', code: 'NO_LLM_SERVICE' })
    return
  }

  /* 7. 生成：请求内建 AbortController，res 关闭即中断 */
  const controller = new AbortController()
  const onClose = () => controller.abort()
  res.on('close', onClose)
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    if (kind === 'ping') {
      const message = await makeUserMessage('ping')
      /* 不指定 reasoningEffort：非推理模型（如 opencode-go/deepseek-v4.1-flash）声明 reasoning===undefined，
         传任何档位都会被 dsh-llm 判 UNSUPPORTED_REASONING_EFFORT。预算 256 起步，空文本再用 1024 重试一次。 */
      const pingRequest = { system: '你是一个连通性探测端点。只回一个词：pong。', messages: [message] }
      let result = await generate(llm, { provider: provider, model: model, maxTokens: PING_TOKENS }, pingRequest, controller.signal)
      if (result.ok && String(result.text || '').trim() === '') {
        result = await generate(llm, { provider: provider, model: model, maxTokens: PING_TOKENS_RETRY }, pingRequest, controller.signal)
      }
      if (!result.ok) {
        writeFailure(res, result.code === CODE.TIMEOUT ? 504 : 500, result.code, result.message, result.detail)
        return
      }
      writeJson(res, 200, {
        ok: true,
        provider: provider,
        model: model,
        latency: Date.now() - startedAt,
        text: result.text.slice(0, 40)
      })
      return
    }
    const task = readTask(body.task)
    if (task.title.trim() === '') {
      writeFailure(res, 400, CODE.BASE, 'task.title 不能为空')
      return
    }
    const message = await makeUserMessage(userContentOf(task, kind))
    const system = kind === 'score' ? scoreSystemOf(body) : polishSystemOf(body)
    const result = await generate(
      llm,
      { provider: provider, model: model, maxTokens: 800, temperature: 0.2 },
      { system: system, messages: [message] },
      controller.signal
    )
    if (!result.ok) {
      writeFailure(res, result.code === CODE.TIMEOUT ? 504 : 500, result.code, result.message, result.detail)
      return
    }
    writeJson(res, 200, {
      ok: true,
      text: result.text,
      provider: provider,
      model: model,
      usage: result.usage === undefined ? undefined : result.usage
    })
  } catch (error) {
    /* 8. 兜底：任何未预期异常都回 AGENT_SERVER，且 message / detail 均已脱敏 */
    writeFailure(res, 500, CODE.SERVER, error && error.message ? error.message : '服务端异常',
      errorDetail('request', error))
  } finally {
    clearTimeout(timer)
    if (typeof res.removeListener === 'function') res.removeListener('close', onClose)
    /* 保证所有分支都结束响应（t122 安全五条之一） */
    if (res.writableEnded === false && typeof res.end === 'function') res.end()
  }
}

/**
 * 插件入口。webless 装配里静默跳过（面板仍可用 custom 档直连）。
 *
 * 关键：**必须用 `ctx.inject` 等 webServer 就绪**，不能在 apply 里 `ctx.get('webServer')` 同步取。
 * 宿主装配顺序里 webServer 往往晚于本插件加载，apply 当下 `get` 得到 undefined，据此 return
 * 就永远不注册路由（表现为页面 fetch 非 2xx → AGENT_SERVER，且重启多少次都一样）。
 * 宿主自身的 `client-connection` / `client-modules` 都是 `ctx.inject(['webServer'], …)` 这个写法。
 */
export function apply(ctx) {
  const mount = (webCtx) => {
    const route = {
      kind: 'prefix',
      path: DSH_TASKS_ROUTE_PREFIX,
      handler: (req, res) => handleRequest(ctx, req, res)
    }
    webCtx.effect(() => webCtx.webServer.register(route), 'dsh-tasks: /plugins/local/dsh-tasks')

  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], mount)
    return
  }

  /* 兜底：没有 inject 能力的老装配，退回同步取；拿不到就确实没有 web 半区。 */
  for (const key of WEB_SERVER_KEYS) {
    const candidate = typeof ctx.get === 'function' ? ctx.get(key) : undefined
    if (candidate && typeof candidate.register === 'function') {
      mount({ webServer: candidate, effect: (fn) => ctx.effect(fn, 'dsh-tasks: route') })
      return
    }
  }
}
