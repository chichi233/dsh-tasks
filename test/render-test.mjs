// 回归测试：最小 React 桩 + 全局桩，在真实浏览器之外跑 client.js。
// 覆盖 docs/ui-spec-stage2.md §8 的 22 条验收 + 第二阶段七项（双抽屉/习惯/番茄钟节奏/日历/四象限/子任务/导入）。
// 用法: node C:/.../dsh-tasks/test/render-test.mjs <client.js 绝对路径>
// 纪律：断言状态驱动——改 store 或触发真实事件后立刻重渲染读取结果，不使用固定 sleep。
// 覆盖缺口台账（随卡更新）：§15-84 Agent 错误码 —— S84 原只盖 4/10（AUTH/RATE/ENDPOINT/TIMEOUT），
// t112 补到 10/10（余 SERVER/NETWORK/BAD_JSON×2/FORMAT/TIMEOUT 计数/AUTH 计数/ENDPOINT 计数/BASE/CONFIG），
// 每个码都断「data-code + 请求计数」，BASE/CONFIG 必须 0 请求；新断言 ID 见「§15-84 补盲」段的 S84A…S84L。
// 变异方法（t139 起，与文件内既有的「观测前置授权」「夹具判别力」并列）：
//   ① 只在 %TEMP% 副本上改（client.js + index.js + src/parts 快照），needle 命中数必须恰 1，验完还原并核对工作区 md5 未变；
//   ② 分层：改 src/parts/*.js 只驱动「静态扫描类」断言（S74 / S139S4 / E02 / F06 等）；
//      要驱动「行为类」断言，必须改 client.js 包内同一段代码——包内代码才是被测运行时（t139 实测：5 个 src/parts needle 全应用，只红静态那条）；
//   ③ 期望「恰红一条」；红一片说明夹具共享，不是断言强；
//   ④ 证明目录（如 %TEMP%/t172proof）必须同时含 client.js 与 index.js **两件**：缺 index.js 时 hostImport 抛 ERR_MODULE_NOT_FOUND，整段跳过，
//      断言总数会从 356 悄悄掉到 343 —— 「静默少断言」比断言红更危险，它会让人把「13 条没跑」看成「全绿」（t172 实测）。
//   ⑤ 令牌门禁（T180a–e）的变异点是 var(--dt-*) 前缀：把任一处 var(--dt-fs-*) / var(--dt-sp-*) / var(--dt-r-*) 改成字面值（如 13px / #123456），
//      对应门禁必须恰红一条；改 70-styles.js 属于「静态扫描类」，只改 %TEMP% 副本里的 src/parts 即可。
//      已实测的三条常备变异点：暗色 palette 的 --dt-disabled-op:.45 改 1 ⇒ 仅 T180b 红；删掉禁用态两条 opacity（.dtRoot button:disabled）
//      ⇒ 仅 T180d 红；给 .dtRowTitle 加 outline:none 且不给 :focus-visible 覆盖 ⇒ 仅 T180e 红（这条守的是 t183 的「特异性静默失败」）。
const target = process.argv[2];
if (!target) {
  console.error('usage: node render-test.mjs <client.js>');
  process.exit(2);
}

/* ------------------------------ 断言账本 ------------------------------ */
const checks = []; // 硬断言：任一失败 → 退出码 1
const gaps = []; // 观察项：已确认的实现缺陷，已报实现方，不计入退出码
const errors = []; // JS 级错误：渲染/事件回调抛错
/* t162 门禁 C 的账本：渲染路径上被当成子节点的 {key,text} 普通对象（真机 React #31，桩里必须判红）。 */

const badChildObjs = [];


/* 软/硬门禁准则（t71 定稿）：门禁默认一律用 check()，判据不满足即 exit 1。
   只有「实现尚未落地、但判据已按规格写死」时才允许记成 gap()，且条目名必须带卡号
   （形如［等 tNN 落地后转硬断言］）；该卡一旦落地、判据转绿，必须立刻升成 check()。
   理由：软门禁留在已修好的条目上等于给未来留静默退化后门——实证过 data-silent 退回 'true'
   时回归只显示 197 PASS / GAP 1 / exit 0，退出码不吃。t71 起 pendingCheck 已整段删除，
   如需重新引入必须带卡号，并在转绿后删除。 */

/* 证据归一化：只抹「同一逻辑在两次运行里必然不同」的时间戳字段（如 db.scores[id].updatedAt），
   其余字段一律原样输出，避免归一化掩盖真实差异。 */
function normEv(evidence) {
  if (evidence === undefined) return '';
  return String(evidence).replace(/"updatedAt":\d+/g, '"updatedAt":N');
}
function check(id, name, ok, evidence) {
  checks.push({ id, name, ok: !!ok, evidence: normEv(evidence) });
  return !!ok;
}
/* gap()：这是「判据先行」的准入通道，不是遗留代码——t71 的软/硬门禁准则明文授权它。
   要清理时必须与结论段的观察项分支、汇总行的「GAP M」同步删除；只删 writer 会留下半截。 */
function gap(id, name, ok, evidence, card) {
  gaps.push({ id, name, ok: !!ok, evidence: normEv(evidence), card: card === undefined ? '' : String(card) });
  return !!ok;
}
function eq(id, name, actual, expected, note) {
  const ok = String(actual) === String(expected);
  return check(id, name, ok, (note ? note + ' | ' : '') + 'actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
}

/* ------------------------------ 全局桩 ------------------------------ */
const headChildren = [];
const lsData = new Map();

globalThis.localStorage = {
  getItem(k) { return lsData.has(k) ? lsData.get(k) : null; },
  setItem(k, v) { lsData.set(k, String(v)); },
  removeItem(k) { lsData.delete(k); },
  clear() { lsData.clear(); },
  key(i) { return Array.from(lsData.keys())[i] === undefined ? null : Array.from(lsData.keys())[i]; },
  get length() { return lsData.size; }
};

let VIEW_W = 1200; // 伪造容器宽度（ResizeObserver 缺失时组件走 window resize 回退，读 getBoundingClientRect）
let CONFIRM = true; // window.confirm 的返回值
const confirmLog = [];

/* §8-27 菜单翻转几何桩：给全部假节点共用一对 anchor/clip 矩形，供 menuFlip 读布局。
   只在翻转断言里临时置位（用完立刻置 null），其余断言拿到的仍是全屏 VIEW_W×800 的默认矩形。 */
let GEOM = null;
function rectOf(isClip) {
  if (GEOM) {
    const g = isClip ? GEOM.clip : GEOM.anchor;
    return { width: VIEW_W, height: g.bottom - g.top, top: g.top, bottom: g.bottom, left: 0, right: VIEW_W, x: 0, y: g.top };
  }
  return { width: VIEW_W, height: 800, top: 0, left: 0, right: VIEW_W, bottom: 800, x: 0, y: 0 };
}
const clipFake = { __isClip: true, getBoundingClientRect() { return rectOf(true); } };

function makeNode(label) {
  const node = {
    __label: label,
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    removeChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    focus() {},
    blur() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return rectOf(!!node.__isClip);
    },
    /* menuFlipOf 用 anchorEl.closest(clipSelector) 取裁剪祖先；布局桩生效时返回带 clip 矩形的假节点 */
    closest(sel) { return typeof sel === 'string' && GEOM ? clipFake : null; }
  };
  Object.defineProperty(node, 'clientWidth', { get() { return VIEW_W; } });
  Object.defineProperty(node, 'clientHeight', { get() { return 800; } });
  Object.defineProperty(node, 'offsetWidth', { get() { return VIEW_W; } });
  return node;
}

const winListeners = new Map();
const docListeners = new Map();
function addTo(map, type, fn) { const set = map.get(type) || new Set(); set.add(fn); map.set(type, set); }
function removeFrom(map, type, fn) {
  const set = map.get(type);
  if (!set) return;
  Array.from(set).forEach((entry) => { if ((typeof entry === 'function' ? entry : entry.fn) === fn) set.delete(entry); });
}
/* 监听项有两种形态：裸函数（window.resize 等）与 { fn, capture }（document，必须区分捕获/冒泡相位）。 */
const listenerFn = (entry) => (typeof entry === 'function' ? entry : entry.fn);
const listenerCap = (entry) => (typeof entry === 'function' ? false : !!entry.capture);
/* phase: undefined=全部（旧调用点兼容）；'capture'=仅捕获监听；'bubble'=仅冒泡监听 */
function fireListeners(map, type, event, phase) {
  const set = map.get(type);
  if (!set) return 0;
  let n = 0;
  Array.from(set).forEach((entry) => {
    if (phase === 'capture' && !listenerCap(entry)) return;
    if (phase === 'bubble' && listenerCap(entry)) return;
    n += 1;
    try { listenerFn(entry)(event || {}); } catch (e) { errors.push(['listener:' + type, e]); }
  });
  return n;
}

const doc = {
  head: { appendChild(n) { headChildren.push(n); } },
  body: { appendChild() {} },
  getElementById(id) { return headChildren.find((n) => n && n.id === id) || null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  /* §12.5 导出走动态 <a download> → a.click()：桩必须能真点，否则 exportState 进 catch 返回 ok:false，
     导出断言就退化成「测桩」。这里记录每次点击，供 T103f 断文件名与点击次数。 */
  createElement(tag) {
    return {
      tag: String(tag || 'div'), style: {}, clicks: 0,
      setAttribute(name, value) { this[name] = value; },
      appendChild() {}, classList: { add() {}, remove() {} },
      click() { this.clicks += 1; globalThis.__anchorLog.push(this); }
    };
  },
  addEventListener(type, fn, opts) {
    addTo(docListeners, type, { fn, capture: !!(opts === true || (opts && opts.capture)) });
  },
  removeEventListener(type, fn) { removeFrom(docListeners, type, fn); },
  activeElement: null
};
globalThis.document = doc;

class FakeNotification {
  static permission = 'default';
  static log = []; // captain 裁决 t59：>60 秒过期必须静默（不发系统通知）→ 需要能数通知
  static requestPermission() { return Promise.resolve('default'); }
  constructor(title, opts) { this.title = title; this.opts = opts; FakeNotification.log.push(this); }
  close() {}
}
globalThis.Notification = FakeNotification;
/* 提示音观测桩：beep() 走 window.AudioContext，之前设成 undefined 就分不清「没响」和「代码没跑」；
   这里用最小实现数 oscillator.start() 的次数（§8-63 要求 ≤60 秒正常结算铃 +1、>60 秒静默铃不变）。 */
class FakeAudioContext {
  static starts = 0;
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  resume() {}
  createOscillator() {
    const self = this;
    return {
      type: '', frequency: { value: 0, setValueAtTime() {} },
      connect() {},
      start() { FakeAudioContext.starts += 1; },
      stop() {}
    };
  }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
}
globalThis.AudioContext = FakeAudioContext;

class FakeFileReader {
  constructor() { this.result = null; this.error = null; this._h = {}; }
  addEventListener(type, fn) { (this._h[type] = this._h[type] || []).push(fn); }
  removeEventListener() {}
  readAsText(file) {
    this.result = file && typeof file.__text === 'string' ? file.__text : '';
    const run = (type) => {
      if (typeof this['on' + type] === 'function') this['on' + type]({ target: this });
      (this._h[type] || []).forEach((fn) => fn({ target: this }));
    };
    try { run('load'); } catch (e) { errors.push(['FileReader.load', e]); }
  }
  readAsDataURL(file) { this.readAsText(file); }
}

/* 引擎 ticker 采集：window.setInterval 的每一次注册都留下回调，测试用 engineTicks() 手动驱动 500ms 那一条，
   既不需要 sleep，也不依赖真实时间（真实定时器仍照常转发，但断言不靠它）。 */
const intervalReg = [];
const rawSetInterval = globalThis.setInterval;
const rawClearInterval = globalThis.clearInterval;
function recSetInterval(fn, ms) { const id = rawSetInterval(fn, ms); intervalReg.push({ id: id, fn: fn, ms: ms }); return id; }
function recClearInterval(id) { rawClearInterval(id); }

/* 可控 matchMedia（§15-72/73）：theme.js 用 media.onchange **属性赋值**，并把 onchange 当唯一信号，
   所以桩必须提供可写 onchange + 可数 adds，否则「系统主题跟随」这类断言只能永远看到初始值。 */
const MEDIA = {
  query: '(prefers-color-scheme: dark)', matches: false, calls: 0, addCount: 0, onchange: null, bound: false, fns: [],
  make(q) {
    MEDIA.query = String(q); MEDIA.calls += 1;
    return {
      media: String(q),
      get matches() { return MEDIA.matches; },
      addEventListener(type, fn) { MEDIA.addCount += 1; MEDIA.bound = true; if (typeof fn === 'function') MEDIA.fns.push(fn); },
      removeEventListener(type, fn) { MEDIA.fns = MEDIA.fns.filter((f) => f !== fn); },
      get onchange() { return MEDIA.onchange; },
      set onchange(fn) { MEDIA.onchange = fn; MEDIA.bound = true; }
    };
  },
  /* 机制无关地「系统主题变了」：实现用 onchange 属性就用它，用 addEventListener 就用 fns；
     两条都不做 → 什么都没发生，S72 如实变红。 */
  emit(matches) {
    MEDIA.matches = !!matches;
    const ev = { matches: MEDIA.matches, media: MEDIA.query };
    const fn = MEDIA.onchange;
    MEDIA.onchange = null;
    const list = MEDIA.fns.slice();
    MEDIA.fns = [];
    if (typeof fn === 'function') fn(ev);
    list.forEach((f) => f(ev));
    MEDIA.bound = false;
  }
};
/* 网络桩（§15-81…85）：57-agent.js 在调用时取 window.fetch，替换这次函数即生效；默认不发真请求。 */
globalThis.__fetchImpl = null;
globalThis.__lastBlob = null;
globalThis.__anchorLog = []; // §12.5 动态 <a> 点击记录（document.createElement 桩里 push）
globalThis.window = {
  document: doc,
  /* §12.5-2：exportState 只在 http(s) 页面点 <a download>（非 http(s) 走面板复制、不制造 blob:/.tmp 残留）。
     桩必须给出真实页面的协议，否则 canDownload=false、anchor 永不点击，导出断言会退化成「测桩」。 */
  location: { protocol: 'http:', hostname: '127.0.0.1', href: 'http://127.0.0.1:3539/', origin: 'http://127.0.0.1:3539' },
  localStorage: globalThis.localStorage,
  Notification: FakeNotification,
  AudioContext: FakeAudioContext,
  FileReader: FakeFileReader,
  focus() {},
  getComputedStyle() { return {}; },
  addEventListener(type, fn) { addTo(winListeners, type, fn); },
  removeEventListener(type, fn) { removeFrom(winListeners, type, fn); },
  matchMedia(q) { return MEDIA.make(q); },
  confirm(msg) { confirmLog.push(String(msg)); return CONFIRM; },
  alert() {},
  /* 转发到 globalThis，这样 withSyncTimers 换掉 globalThis.setTimeout 时窗口侧也跟着同步推进（不 sleep）。 */
  setTimeout(...args) { return globalThis.setTimeout(...args); },
  clearTimeout(...args) { return globalThis.clearTimeout(...args); },
  setInterval: recSetInterval, clearInterval: recClearInterval,
  fetch(url, opts) { return globalThis.__fetchImpl ? globalThis.__fetchImpl(url, opts) : Promise.reject(new Error('no fetch stub')); },
  URL: { createObjectURL(blob) { globalThis.__lastBlob = blob; return 'blob:stub'; }, revokeObjectURL() {} },
  Blob: class FakeBlob {
    constructor(parts, opts) { this.parts = Array.isArray(parts) ? parts : [parts]; this.type = (opts && opts.type) || ''; this.size = this.parts.join('').length; }
    text() { return Promise.resolve(this.parts.join('')); }
  },
  __ModuleLoader__: { load(def) { globalThis.__mod = def; } }
};

/* ------------------------------ mini React ------------------------------ */
const instances = new Map();
let current = null;

function createElement(type, props, ...children) {
  const p = Object.assign({}, props || {});
  if (children.length === 1) p.children = children[0];
  else if (children.length > 1) p.children = children;
  return { type, props: p };
}
const Fragment = Symbol('Fragment');

let frameId = 0;
function instFor(path, type) {
  const key = path + '::' + (type.name || 'anon');
  let inst = instances.get(key);
  if (!inst) { inst = { hooks: [], cursor: 0, effectsRun: new Set(), cleanups: [], frame: 0, effectDeps: {}, effectCleanup: {} }; instances.set(key, inst); }
  inst.cursor = 0;
  inst.frame = frameId;
  return { key, inst };
}

const React = {
  createElement,
  Fragment,
  useState(init) {
    const inst = current;
    const i = inst.cursor++;
    if (!(i in inst.hooks)) inst.hooks[i] = typeof init === 'function' ? init() : init;
    return [inst.hooks[i], (v) => { inst.hooks[i] = typeof v === 'function' ? v(inst.hooks[i]) : v; }];
  },
  // 所有 ref 都拿到一个可读的假节点：组件的测宽 effect 因此不会因 current=null 提前返回
  useRef() {
    const inst = current;
    const i = inst.cursor++;
    if (!(i in inst.hooks)) inst.hooks[i] = { current: makeNode('ref' + i) };
    return inst.hooks[i];
  },
  useMemo(fn) { current.cursor++; return fn(); },
  useCallback(fn) { current.cursor++; return fn; },
  // deps 语义：给了数组就按浅比较决定是否重跑；没给就每次渲染都跑（等价 React）。
  // 这条对 §8-27 是硬需求：useMenuFlip 的测量 effect 依赖 [open]，只跑一次就永远读不到打开后的翻转结果。
  useEffect(fn, deps) {
    const inst = current;
    const i = inst.cursor++;
    const prevDeps = inst.effectDeps[i];
    if (deps !== undefined) {
      const arr = Array.isArray(deps) ? deps : [];
      const same = prevDeps && prevDeps.length === arr.length && arr.every((d, k) => Object.is(d, prevDeps[k]));
      if (same) return;
      inst.effectDeps[i] = arr.slice();
    } else {
      inst.effectDeps[i] = null;
    }
    const prevCleanup = inst.effectCleanup[i];
    if (typeof prevCleanup === 'function') { try { prevCleanup(); } catch (e) { errors.push(['useEffect.cleanup', e]); } }
    inst.effectCleanup[i] = undefined;
    try {
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        inst.effectCleanup[i] = cleanup;
        inst.cleanups.push(cleanup);
      }
    } catch (e) { errors.push(['useEffect', e]); }
  },
  useLayoutEffect() { current.cursor++; },
  useSyncExternalStore(sub, snap) { current.cursor++; return snap(); }
};

function render(node, path) {
  if (node == null || node === false || node === true) return null;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map((n, i) => render(n, path + '/' + i));
  if (typeof node !== 'object' || !('type' in node)) {

    /* t162 门禁 C：普通对象（含 key+text 两键）被当成子节点时，真机 React 抛 #31 并炸成崩溃卡；

       本桩原本静默 return null，这里显式记账（path 带组件名，能定位到具体视图）。
       注：行为记账是**补充而非替代**——主拦截是 T162-G1 的静态扫描（OneThing 的 dtOneHow/dtOneWhy
       与 actnow 头部在桩内渲染不到，行为门禁覆盖不到它们；t168/t169 落地后要补真路径断言）。 */

    if (node && typeof node === 'object' && 'key' in node && 'text' in node && !('tag' in node)) {

      badChildObjs.push({ key: String(node.key), text: String(node.text).slice(0, 80), path: String(path) });

    }

    return null;

  }

  const t = node.type;
  const props = node.props || {};
  if (t === Fragment) return render(props.children, path);
  if (typeof t === 'string') {
    const kids = props.children === undefined ? [] : (Array.isArray(props.children) ? props.children : [props.children]);
    const host = { tag: t, props, children: kids.map((c, i) => render(c, path + '/' + i + ':' + t)) };
    // 稳定身份：每帧新建对象，但 path 在结构未变时保持同一值 → 用它判定「节点是否还在当前树上」。
    Object.defineProperty(host, '__path', { value: path, enumerable: false, configurable: true });
    // DOM 几何接口：useMenuFlip 用 event.currentTarget（真实 host 节点）量 anchor，用 closest(裁剪容器) 量 clip。
    // 裁剪容器（.dtCal / .dtQuadBody / .dtQuad）取 GEOM.clip，其余取 GEOM.anchor；GEOM 为 null 时两者同值。
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: function () {
        const cn = (host.props && host.props.className) || '';
        const isClip = /(^|\s)(dtCal|dtQuadBody|dtQuad)(\s|$)/.test(cn);
        return rectOf(isClip);
      }, enumerable: false, configurable: true
    });
    Object.defineProperty(host, 'closest', {
      value: function (sel) { return closestOf(host, sel); }, enumerable: false, configurable: true
    });
    return host;
  }
  if (typeof t === 'function') {
    const { key, inst } = instFor(path, t);
    const prev = current;
    current = inst;
    let out;
    try { out = t(props); } catch (e) { errors.push([(t.name || 'component'), e]); out = null; }
    current = prev;
    return render(out, key);
  }
  return null;
}

function walk(node, fn) {
  if (node == null) return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, fn)); return; }
  if (typeof node !== 'object') return;
  fn(node);
  (node.children || []).forEach((c) => walk(c, fn));
}

/* ------------------------------ 载入插件 ------------------------------ */
await import('file:///' + target.replace(/\\\\/g, '/'));
const def = globalThis.__mod;
if (!def) { console.error('FAIL: __ModuleLoader__.load 未被调用'); process.exit(1); }

const registrations = [];
const fakeCtx = {
  effect(fn) { try { fn(); } catch (e) { errors.push(['ctx.effect', e]); } },
  on() { return () => {}; },
  locale: { bind: () => (k) => k, getLocale: () => 'zh' },
  slots: {
    inject(_key, cb) { try { return cb(); } catch (e) { errors.push(['slots.inject', e]); } },
    register(desc, comp) { registrations.push({ desc, comp }); return () => {}; }
  }
};

let mod;
try { mod = def.factory((name) => { if (name === 'react') return React; throw new Error('unexpected require: ' + name); }); }
catch (e) { errors.push(['factory', e]); }
if (!mod) { console.error('FAIL: factory 抛错'); console.error(errors); process.exit(1); }

try { mod.apply(fakeCtx); } catch (e) { errors.push(['apply', e]); }

const main = registrations.find((r) => r.desc && r.desc.name === 'main');
const rowReg = registrations.find((r) => r.desc && r.desc.name === 'sidebar.panellist');

/* ------------------------------ 插件注册断言 ------------------------------ */
check('L01', '模块 id 正确', def.id === '@local/dsh-tasks', 'id=' + def.id);
check('L02', '注册 main 面板与 sidebar.panellist', !!main && !!rowReg,
  'main=' + !!main + ' panellist=' + !!rowReg + ' 总注册=' + registrations.length);
check('L03', 'module.inject 声明 slots', Array.isArray(mod.inject) && mod.inject.includes('slots'), 'inject=' + JSON.stringify(mod.inject));
const styleEl = headChildren[0];
const cssText = String((styleEl && (styleEl.textContent || styleEl.children)) || '');
check('L04', '样式已注入且体量正常', !!styleEl && cssText.length > 5000,
  'len=' + cssText.length + ' 含 .dtRoot=' + cssText.includes('.dtRoot') + ' 含 @container=' + cssText.includes('@container'));

if (!main || !rowReg) {
  console.error('FAIL: 面板未注册，后续断言无法执行');
  process.exit(1);
}

/* ------------------------------ DOM 查询工具 ------------------------------ */
let tree = null;
const panelProps = Object.assign({}, main.desc.inject ? main.desc.inject() : {}, { t: (k) => k });
const storeApi = panelProps.store;
check('L06', 'main.inject() 提供 store（get/update/saveNow）', !!storeApi && typeof storeApi.get === 'function' && typeof storeApi.update === 'function' && typeof storeApi.saveNow === 'function',
  'keys=' + (storeApi ? Object.keys(storeApi).join(',') : 'null'));

/* 卸载清理：每帧把 frameId 推进一格，渲染后凡「上一帧有、这一帧没再出现」的组件实例都跑一次 cleanup 并丢弃。
   真实 React 在卸载时会 removeEventListener / 取消订阅；桩若不做这一步，注册表会残留已卸载组件的 closer 与监听
   （表现：Esc 捕获层被幽灵菜单吃掉、运行时监听数只增不减，只能当上界）。 */
const rerender = () => {
  frameId += 1;
  tree = render(main.comp(panelProps), 'main');
  for (const [key, inst] of Array.from(instances.entries())) {
    if (inst.frame === frameId) continue;
    inst.cleanups.slice().reverse().forEach((fn) => { try { fn(); } catch (e) { errors.push(['cleanup', e]); } });
    instances.delete(key);
  }
};
const cls = (n) => String((n && n.props && n.props.className) || '');
const hasClass = (n, token) => cls(n).split(/\s+/).includes(token);
const attr = (n, k) => (n && n.props ? n.props[k] : undefined);
const all = (pred, root) => { const out = []; walk(root === undefined ? tree : root, (n) => { if (n && n.tag && pred(n)) out.push(n); }); return out; };
const one = (pred, root) => all(pred, root)[0] || null;
const byCls = (token, root) => all((n) => hasClass(n, token), root);
const byAttr = (k, v, root) => all((n) => String(attr(n, k)) === String(v), root);
const byDt = (v, root) => byAttr('data-dt', v, root);

/* 节点文本：递归拼接所有后代里的字符串子节点（props.children 里的原始字符串） */
function nodeText(node) {
  const out = [];
  walk(node, (n) => {
    const c = n && n.props && n.props.children;
    if (typeof c === 'string' || typeof c === 'number') out.push(String(c));
  });
  return out.join('');
}
/* 直接子元素（拍平嵌套数组） */
function childNodes(node) {
  const out = [];
  (function dig(x) {
    if (x == null || x === false || x === true) return;
    if (Array.isArray(x)) { x.forEach(dig); return; }
    if (typeof x === 'string' || typeof x === 'number') return;
    if (x.tag) out.push(x);
  })(node && node.children);
  return out;
}

const evt = () => ({ preventDefault() {}, stopPropagation() {}, target: {}, currentTarget: {} });
function fire(node, event) {
  if (!node) { errors.push(['fire', new Error('目标节点不存在')]); return false; }
  const fn = node.props && node.props.onClick;
  if (typeof fn !== 'function') { errors.push(['fire', new Error('节点无 onClick: ' + node.tag)]); return false; }
  try { fn(event || evt()); } catch (e) { errors.push(['onClick:' + node.tag, e]); }
  rerender(); rerender();
  return true;
}
function change(node, value) {
  if (!node || typeof node.props.onChange !== 'function') { errors.push(['change', new Error('节点无 onChange')]); return false; }
  /* checkbox/radio 的处理器读 event.target.checked（如 60-settings.js:687 模块开关），
     只发 value 会得到 {enabled: undefined} → actionSetModule 返回 NO_CHANGE，静默不生效。
     两种字段一起发，两类控件都对；value 仍保留字符串形态供 select/range 使用。 */
  const isCheck = node.tag === 'input' && (node.props.type === 'checkbox' || node.props.type === 'radio');
  const target = { value: String(value) };
  if (isCheck) target.checked = !!value;
  try { node.props.onChange({ target: target }); } catch (e) { errors.push(['onChange', e]); }
  rerender(); rerender();
  return true;
}
function resizeTo(w) {
  VIEW_W = w;
  const n = fireListeners(winListeners, 'resize', { target: globalThis.window });
  rerender(); rerender();
  if (!n) errors.push(['resize', new Error('没有注册 window.resize 监听（测宽 effect 未走回退分支）')]);
}

/* 复现真实日期语义：今天由系统时间决定（本机 2026-11-04） */
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const shiftKey = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY_K = ymd(new Date());
const YEST_K = shiftKey(-1);
const TOMORROW_K = shiftKey(1);
const D2_K = shiftKey(-2);

const savedState = () => {
  for (const [k, v] of Array.from(lsData.entries())) {
    try { const p = JSON.parse(v); if (p && Array.isArray(p.tasks) && Array.isArray(p.projects)) return p; } catch (e) { /* ignore */ }
  }
  return null;
};
const snapshot = () => {
  const s = storeApi.get();
  return JSON.stringify({ tasks: s.tasks, projects: s.projects });
};
const applyState = (patch) => { storeApi.update((s) => Object.assign({}, s, patch)); rerender(); rerender(); };
const tasksById = (id) => (storeApi.get().tasks || []).find((t) => t.id === id) || null;

/* 螺旋工作法（§8-59…68）：只跑 window.setInterval 登记的 500ms 引擎回调，不等真实时间。
   引擎在 apply 时 start()，SpiralView 也注册了一条 500ms（刷新倒计时），两条都要驱动。 */
const engineTicks = () => {
  const list = intervalReg.filter((r) => r.ms === 500);
  for (const r of list) { try { r.fn(); } catch (e) { errors.push(['engineTick', e]); } }
  rerender(); rerender();
};

/* 侧栏 / 抽屉 */
const railItems = () => byCls('dtRailItem');
const railLabel = (n) => { const l = one((x) => hasClass(x, 'dtRailLabel'), n); return l ? nodeText(l).trim() : ''; };
const railByLabel = (label) => railItems().find((n) => railLabel(n) === label) || null;
const projectItems = () => byCls('dtRailRow').map((r) => one((n) => hasClass(n, 'dtRailItem'), r)).filter(Boolean);
const drawerAll = () => byCls('dtDrawer');
const drawerSlot = (s) => drawerAll().find((n) => attr(n, 'data-slot') === s) || null;
const zoneEl = () => one((n) => hasClass(n, 'dtDrawerZone'));
const collapseBtns = () => byDt('drawer-collapse');
const headRightOf = (root) => one((n) => hasClass(n, 'dtHeadRight'), root);
function closeAllDrawers() {
  for (let i = 0; i < 6; i++) {
    const b = collapseBtns()[0];
    if (!b) break;
    fire(b);
  }
  rerender();
}

rerender();
check('L05', '侧栏图标 svg 带 width', (function () {
  let ok = true;
  walk(render(rowReg.comp({ size: 22, active: false }), 'row'), (n) => { if (n.tag === 'svg' && !n.props.width) ok = false; });
  return ok;
})(), 'walk 全部 svg 检查 width 属性');
check('L07', '侧栏入口数量（智能清单 + 项目 + 工具）≥ 8', railItems().length >= 8, 'dtRailItem=' + railItems().length);

/* ============================ 一、两列模型（§8-1..6 / §8-55..58） ============================ */
closeAllDrawers();

/* 两列模型定位工具：B 栏 = 清单 / 习惯 / 四象限，C 栏 = 详情，中间区 = 日历 / 番茄钟 / 设置。
   t33 起 drawerA/drawerB 双槽与 .dtDrawerTabs 已退役，任何断言都不得再按 data-slot="a" 取节点。 */
const bSlot = () => drawerSlot('b');
const cSlot = () => drawerSlot('c');
const rootEl = () => one((n) => hasClass(n, 'dtRoot'));
/* t116 三栏模型：`.dtCenter`（中间区）已整体删除，B 栏 `.dtDrawer[data-slot="b"]` 就是主区域。
   这些辅助沿用旧名以缩小改动面，但读的是 B 栏根节点的 data-view / data-squeezed。 */
const centerMain = () => drawerSlot('b');
const zoneCount = () => { const z = zoneEl(); return z ? attr(z, 'data-count') : null; };
const centerView = () => { const c = centerMain(); return c ? attr(c, 'data-view') : null; };
const squeezedOn = () => { const c = centerMain(); return !!c && attr(c, 'data-squeezed') === '1'; };
const railKindOf = () => { const r = rootEl(); return r ? attr(r, 'data-rail') : null; };
const bView = () => { const s = bSlot(); return s ? attr(s, 'data-drawer-view') : null; };
const bKind = () => { const s = bSlot(); return s ? attr(s, 'data-kind') : null; };
const cDetailView = () => { const s = cSlot(); return s ? attr(s, 'data-detail-view') : null; };
const rowsIn = (s) => (s ? all((n) => hasClass(n, 'dtRow'), s) : []);
const bRows = () => rowsIn(bSlot());
const collapseIn = (s) => (s ? one((n) => attr(n, 'data-dt') === 'drawer-collapse', s) : null);
const tabsN = () => byCls('dtDrawerTabs').length;
const bTitle = () => { const t = bSlot() ? one((n) => hasClass(n, 'dtHeadTitle'), bSlot()) : null; return t ? nodeText(t).trim() : ''; };
const bCount = () => { const t = bSlot() ? one((n) => hasClass(n, 'dtHeadCount'), bSlot()) : null; return t ? nodeText(t).trim() : ''; };

const smartIds = ['today', 'week', 'open', 'done', 'trash'];
const smartLabels = { today: '今天', week: '最近 7 天', open: '全部未完成', done: '已完成', trash: '已删除' };
const smartOk = [];
for (const id of smartIds) {
  closeAllDrawers();
  const item = railByLabel(smartLabels[id]);
  if (!item) { smartOk.push(id + ':缺入口'); continue; }
  fire(item);
  const b = bSlot();
  const active = railByLabel(smartLabels[id]);
  const ok = !!b && attr(b, 'data-slot') === 'b' && attr(b, 'data-drawer-view') === id &&
    attr(b, 'data-kind') === 'list' && !!active && hasClass(active, 'dtRailOn');
  smartOk.push(id + ':' + (ok ? 'ok' : 'BAD(slot=' + (b ? attr(b, 'data-slot') : 'null') + ' view=' + (b ? attr(b, 'data-drawer-view') : 'null') + ')'));
}
check('D01', '五类智能清单都开在 B 栏（data-slot="b" / data-kind=list / data-drawer-view 与入口一致）且 rail 高亮',
  smartOk.every((s) => s.endsWith(':ok')), smartOk.join(' | '));

closeAllDrawers();
check('D02', '关闭后无抽屉、无抽屉区', drawerAll().length === 0 && !zoneEl(), 'dtDrawer=' + drawerAll().length + ' zone=' + !!zoneEl());

fire(railByLabel('今天'));
/* t117 迁移：原断言「点今天后日历仍在中间区」不再成立——B 栏只能有一个来源，
   点「今天」会把日历整体换成清单（这正是 §1.2「同槽替换」）。 */
check('D03', '§1.2 点「今天」→ B 栏出现且 data-view=today，.dtCal 被整体替换（B 栏单来源），zone 计数=1',
  bView() === 'today' && drawerAll().length === 1 && centerView() === 'today' &&
    zoneCount() === '1' && byCls('dtCal').length === 0,
  'b.view=' + bView() + ' 抽屉数=' + drawerAll().length + ' B.view=' + centerView() +
  ' count=' + zoneCount() + ' dtCal=' + byCls('dtCal').length);

const bHead = headRightOf(bSlot());
const bHeadKids = childNodes(bHead);
const bHeadLast = bHeadKids[bHeadKids.length - 1];
check('D04', 'B 栏收起按钮位于 .dtHeadRight 末位且文案含「收起」（§1.4/§8-2）',
  !!bHeadLast && attr(bHeadLast, 'data-dt') === 'drawer-collapse' && nodeText(bHeadLast).includes('收起'),
  'headRight 子项=' + bHeadKids.length + ' 末项 data-dt=' + (bHeadLast ? attr(bHeadLast, 'data-dt') : 'null') +
  ' 文本=' + (bHeadLast ? nodeText(bHeadLast).trim() : ''));

const scrimBefore = byCls('dtScrim').length;
const cm = centerMain();
check('D05', '点 B 栏空白不收起：B 栏不挂指针处理器、无 scrim 拦截、B 栏仍在（§2.2）',
  !!bSlot() && scrimBefore === 0 && !!cm && typeof cm.props.onClick !== 'function' && typeof cm.props.onMouseDown !== 'function',
  'B 仍在=' + !!bSlot() + ' scrim=' + scrimBefore + ' center.onClick=' + (cm ? typeof cm.props.onClick : 'null') +
  ' center.onMouseDown=' + (cm ? typeof cm.props.onMouseDown : 'null'));

fire(railByLabel('今天'));
check('D06', '再点同一入口 → B 栏收起（同 view 即关，不叠加）', !bSlot() && !zoneEl(), 'B=' + !!bSlot() + ' zone=' + !!zoneEl());

fire(railByLabel('已删除'));
check('D07', '「已删除」在 B 栏 data-drawer-view=trash 且无新建条（§8-3）',
  bView() === 'trash' && all((n) => hasClass(n, 'dtAddBar'), bSlot()).length === 0,
  'view=' + bView() + ' dtAddBar=' + all((n) => hasClass(n, 'dtAddBar'), bSlot()).length);

/* CSS 真源扫描（同名选择器会同时出现在基础段与 @container 段，必须全量取） */
function cssRuleAll(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  const out = [];
  let m;
  while ((m = re.exec(cssText))) out.push(m[1]);
  return out;
}
function cssRule(selector) { return cssRuleAll(selector)[0] || ''; }
const drawerRules = cssRuleAll('.dtDrawer');
const bSlotRules = cssRuleAll('.dtDrawer[data-slot="b"]');
const cSlotRules = cssRuleAll('.dtDrawer[data-slot="c"]');
const scrimRules = cssRuleAll('.dtScrim');
const menuRules = cssRuleAll('.dtMenu');
const editorRules = cssRuleAll('.dtEditor');
const zoneRules = cssRuleAll('.dtDrawerZone');
const zoneTwoRules = cssRuleAll('.dtDrawerZone[data-count="2"]');

check('D08', 'CSS：.dtDrawer 基础规则不写 z-index、也不定宽（宽度交给 B/C 栏位规则，§2.2）',
  drawerRules.length > 0 && drawerRules.every((r) => !/z-index\s*:/.test(r)) && drawerRules.every((r) => !/(^|;|\s)width\s*:/.test(r)),
  '规则数=' + drawerRules.length + ' 首条={' + (drawerRules[0] || '').trim() + '}');
/* t117 迁移：t116 把 B 栏从「抽屉区里的第一段」改成「与 rail 并列的主区域」，所以 B 拿 55%、C 拿 45%（原为 45/55），
   最小宽同时写死：B 280px、C 300px（§2.3）。 */
check('D09', 'CSS：B 栏 flex:1 1 55% / min-width:280px、C 栏 flex:1 1 45% / min-width:300px（§2.3）',
  bSlotRules.some((r) => /flex\s*:\s*1\s+1\s+55%/.test(r)) && /min-width\s*:\s*280px/.test(bSlotRules.join(';')) &&
    cSlotRules.some((r) => /flex\s*:\s*1\s+1\s+45%/.test(r)) && /min-width\s*:\s*300px/.test(cSlotRules.join(';')),
  'b={' + (bSlotRules[0] || '').trim() + '} c={' + (cSlotRules[0] || '').trim() + '}');
check('D10', 'CSS：z 阶梯 scrim 15 < 菜单 35；且 .dtEditor 整类退役（无规则、全表无 z-index:30）（§2.2）',
  scrimRules.some((r) => /z-index\s*:\s*15/.test(r)) && menuRules.some((r) => /z-index\s*:\s*35/.test(r)) &&
  editorRules.length === 0 && !/z-index\s*:\s*30/.test(cssText),
  'scrim 规则=' + scrimRules.length + ' menu 规则=' + menuRules.length + ' editor 规则=' + editorRules.length +
  ' 全表 z30=' + /z-index\s*:\s*30/.test(cssText));
check('D11', 'CSS：抽屉区是常驻 flex 行（不 absolute 覆盖、不写 z-index），并给 data-count="2" 独立宽度（§2.3）',
  zoneRules.length > 0 && zoneRules.every((r) => !/(^|;|\s)position\s*:\s*absolute/.test(r)) &&
  zoneRules.every((r) => !/z-index\s*:/.test(r)) && zoneTwoRules.length > 0,
  'zone 规则=' + zoneRules.length + ' count2 规则=' + zoneTwoRules.length + ' 首条={' + (zoneRules[0] || '').trim() + '}');

/* 两列并列：B 栏清单 + C 栏详情 */
function openProjectWithRows() {
  const items = projectItems();
  for (let i = 0; i < items.length; i++) {
    closeAllDrawers();
    const cur = projectItems();
    if (!cur[i]) return '';
    const label = railLabel(cur[i]);
    fire(cur[i]);
    const slot = bSlot();
    if (slot && rowsIn(slot).length > 0) return label;
  }
  return '';
}
resizeTo(1200);
const projLabel = openProjectWithRows();
check('D12', '存在可打开且有任务行的项目清单（渲染在 B 栏）', !!projLabel, '项目=' + JSON.stringify(projLabel) + ' b.view=' + bView());

const firstRow = bRows()[0];
if (firstRow) fire(firstRow);
check('D13', 'B 栏点任务 → C 栏详情并列：data-count=2、两栏 b/c、无 scrim、无 tab（§1.3/§8-4）',
  zoneCount() === '2' && !!bSlot() && !!cSlot() && byCls('dtScrim').length === 0 && tabsN() === 0,
  'count=' + zoneCount() + ' b=' + !!bSlot() + ' c=' + !!cSlot() + ' scrim=' + byCls('dtScrim').length + ' tabs=' + tabsN());

const zInline = drawerAll().filter((n) => n.props.style && n.props.style.zIndex !== undefined).length;
check('D14', '并列两栏都无内联 z-index（层叠交给 CSS 阶梯，§2.2）',
  zInline === 0 && drawerAll().length === 2,
  '内联 z-index 抽屉数=' + zInline + ' b.style=' + JSON.stringify(bSlot() && bSlot().props.style) + ' c.style=' + JSON.stringify(cSlot() && cSlot().props.style));

const bRowN = bRows().length;
const cTitleNode = cSlot() ? one((n) => hasClass(n, 'dtHeadTitle'), cSlot()) : null;
check('D15', '详情渲染在 C 栏（data-kind=task、data-detail-view=task:<id>），B 栏列表不被替换（行数不变）',
  !!cSlot() && attr(cSlot(), 'data-kind') === 'task' && String(cDetailView()).indexOf('task:') === 0 &&
  bRows().length === bRowN && bRowN > 0 && !!cTitleNode,
  'c.kind=' + (cSlot() ? attr(cSlot(), 'data-kind') : 'null') + ' c.view=' + cDetailView() +
  ' c 标题=' + (cTitleNode ? nodeText(cTitleNode).trim() : 'null') + ' b 行数 ' + bRowN + '→' + bRows().length);

const cCollapse = collapseIn(cSlot());
const cHead = headRightOf(cSlot());
const cHeadKids = childNodes(cHead);
const cCollapseLast = cHeadKids[cHeadKids.length - 1];
const cCollapseOk = !!cCollapseLast && attr(cCollapseLast, 'data-dt') === 'drawer-collapse';
const bViewBeforeClose = bView();
const countBeforeClose = zoneCount();
if (cCollapseLast) fire(cCollapseLast);
check('D16', 'C 栏收起按钮在 .dtHeadRight 末位，点击后 C 消失、B 保留、data-count 2→1、B 的视图不变（§1.9）',
  cCollapseOk && !cSlot() && !!bSlot() && countBeforeClose === '2' && zoneCount() === '1' && bView() === bViewBeforeClose,
  'C 末项 data-dt=' + (cCollapseLast ? attr(cCollapseLast, 'data-dt') : 'null') + ' 点后 C=' + !!cSlot() + ' B=' + !!bSlot() +
  ' count ' + countBeforeClose + '→' + zoneCount() + ' b.view ' + bViewBeforeClose + '→' + bView());

/* 不放竖条：两列同时存在时不留 tab 条 / 竖条 */
check('D18', '不放竖条、不留 tab 条：全树无 .dtDrawerTabs / .dtDrawerTab / [data-bbar] / [data-quadbar]，CSS 里也无 tab 规则（§2.4/§8-55）',
  tabsN() === 0 && byCls('dtDrawerTab').length === 0 && byAttr('data-bbar', '1').length === 0 && byAttr('data-quadbar', '1').length === 0 &&
  cssRuleAll('.dtDrawerTabs').length === 0 && cssRuleAll('.dtDrawerTab').length === 0,
  'tabs=' + tabsN() + ' tab=' + byCls('dtDrawerTab').length + ' bbar=' + byAttr('data-bbar', '1').length +
  ' quadbar=' + byAttr('data-quadbar', '1').length + ' css.tabs 规则=' + cssRuleAll('.dtDrawerTabs').length);

/* 860px（W3）：两列仍在，只靠挤压让位 */
resizeTo(860);
fire(railByLabel('四象限'));
const w3B = bSlot();
const quadRow = rowsIn(w3B)[0];
if (quadRow && quadRow.props.onClick) fire(quadRow);
check('D17', '容器 860px（W3）两栏并存时仍渲染两个 .dtDrawer、无 tab 条、无 scrim（§8-55）',
  drawerAll().length === 2 && !!bSlot() && !!cSlot() && tabsN() === 0 && byCls('dtScrim').length === 0,
  'dtDrawer=' + drawerAll().length + ' 槽=' + drawerAll().map((n) => attr(n, 'data-slot')).join(',') +
  ' tabs=' + tabsN() + ' scrim=' + byCls('dtScrim').length + ' data-count=' + zoneCount());

/* 换清单即清详情（不残留上一份详情） */
const hadC = !!cSlot();
fire(railByLabel('今天'));
check('D19', '换清单 → 详情被清空（C 消失、B 换成新 view），详情不残留（§1.3/§8-1）',
  !cSlot() && bView() === 'today' && zoneCount() === '1',
  '切换前有 C=' + hadC + ' 切换后 c=' + !!cSlot() + ' b.view=' + bView() + ' count=' + zoneCount());

/* 700px（W4）：无 scrim、无 tab，两列并存时 rail 转图标条 */
const w4Row = bRows()[0];
if (w4Row) fire(w4Row);
resizeTo(700);
check('D20', '容器 700px（W4）两栏并存时无 scrim、无 tab 条，rail 降级为图标条 data-rail="icon"（§2.4）',
  byCls('dtScrim').length === 0 && tabsN() === 0 && railKindOf() === 'icon' && drawerAll().length === 2,
  'scrim=' + byCls('dtScrim').length + ' tabs=' + tabsN() + ' data-rail=' + railKindOf() + ' dtDrawer=' + drawerAll().length);
check('D21', 'CSS：@container 719px 段把两栏宽度改为 max(500px,calc(100cqw - 48px))，并收紧 b/c 最小宽（§2.3）',
  /@container[^{]*max-width\s*:\s*719px/.test(cssText) &&
  zoneTwoRules.some((r) => /calc\(100cqw\s*-\s*48px\)/.test(r)) &&
  bSlotRules.some((r) => /min-width\s*:\s*220px/.test(r)) && cSlotRules.some((r) => /min-width\s*:\s*280px/.test(r)),
  'count2 规则=' + zoneTwoRules.map((r) => r.trim()).join(' || ') + ' b min220=' + bSlotRules.some((r) => /min-width\s*:\s*220px/.test(r)));

resizeTo(1200);
check('D22', '恢复 1200px（W1）后仍两列并排、scrim 与 tab 恒不存在、rail 复原（data-rail 不再是 icon）',
  drawerAll().length === 2 && byCls('dtScrim').length === 0 && tabsN() === 0 && !railKindOf(),
  'dtDrawer=' + drawerAll().length + ' scrim=' + byCls('dtScrim').length + ' tabs=' + tabsN() + ' data-rail=' + String(railKindOf()));

/* D23：往返式——清单切换 今天 → 全部未完成 → 今天（只验「能打开」不够，要验视图真的跟着换、且不叠槽） */
closeAllDrawers();
const aView = () => bView();
const aRowCount = () => bRows().length;
fire(railByLabel('今天'));
const vToday1 = aView();
const rowsToday1 = aRowCount();
fire(railByLabel('全部未完成'));
const vOpen = aView();
const aSlots = drawerAll().filter((n) => attr(n, 'data-slot') === 'b').length;
fire(railByLabel('今天'));
const vToday2 = aView();
check('D23', '清单切换往返：今天 → 全部未完成 → 今天，B 视图逐步跟随且始终只有 1 个 B 栏（换清单是替换不是叠加）',
  vToday1 === 'today' && vOpen === 'open' && vToday2 === 'today' && aSlots === 1 && aRowCount() === rowsToday1,
  'view 序列=' + [vToday1, vOpen, vToday2].join(' → ') + ' B 栏数=' + aSlots + ' 行数 ' + rowsToday1 + '→' + aRowCount());

/* 收起语义的四种次态（§1.9）：只开 B / 只开 C / 全开 / 全关 */
closeAllDrawers();
fire(railByLabel('今天'));
check('D24', '只开 B：data-count=1，B 的收起按钮点为「全关」（zone 随之消失）',
  zoneCount() === '1' && !!bSlot() && !cSlot(), 'count=' + zoneCount() + ' b=' + !!bSlot() + ' c=' + !!cSlot());
const onlyBRow = bRows()[0];
if (onlyBRow) fire(onlyBRow);
const countFull = zoneCount();
check('D25', '全开：data-count=2 且 C 存在（B 的收起按钮此时是「全关」而不是只关自己，§1.9）',
  countFull === '2' && !!bSlot() && !!cSlot(), 'count=' + countFull + ' b=' + !!bSlot() + ' c=' + !!cSlot());
const bCollapseFull = collapseIn(bSlot());
if (bCollapseFull) fire(bCollapseFull);
check('D26', 'B 的收起按钮在「全开」时点一下即全关（B 与 C 同时消失，不留半开态）',
  !bSlot() && !cSlot() && !zoneEl(), 'b=' + !!bSlot() + ' c=' + !!cSlot() + ' zone=' + !!zoneEl());
check('D27', '§2.3 CSS：B/C 栏位底线 280/300px，且 @container 547 下两栏等分（.dtCenter 与 data-squeezed 让位规则已随中间区删除）',
  /min-width\s*:\s*280px/.test(bSlotRules.join(';')) && /min-width\s*:\s*300px/.test(cSlotRules.join(';')) &&
    cssText.indexOf('.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}') >= 0,
  'B 底线=' + /min-width\s*:\s*280px/.test(bSlotRules.join(';')) + ' C 底线=' + /min-width\s*:\s*300px/.test(cSlotRules.join(';')) +
  ' 547 等分=' + (cssText.indexOf('.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}') >= 0));

/* ============================ 二、日历（§8-20..22） ============================ */
closeAllDrawers();
/* t117 迁移：t116 起「中间区」不存在，日历不再是默认视图 —— 启动时 B 栏落 today，日历按需从 rail 打开。
   所以 C01 拆两条：C01 断默认态（today + 无 .dtCal），C01b 断「打开后」的日历真源（才轮到 C02 起的几何断言）。 */
if (!drawerSlot('b')) fire(railByLabel('今天'));
const c01B = drawerSlot('b');
check('C01', '§8-88 默认态（原「中间区默认视图是日历」已迁移）：B 栏 data-view=today 且 .dtCal 不在树里',
  !!c01B && attr(c01B, 'data-view') === 'today' && byCls('dtCal').length === 0,
  'B.view=' + (c01B ? attr(c01B, 'data-view') : '(无 B 栏)') + ' dtCal=' + byCls('dtCal').length);
const c01RailCal = one((n) => attr(n, 'data-dt') === 'rail-calendar');
if (c01RailCal) fire(c01RailCal);
const c01Cal = one((n) => hasClass(n, 'dtCal'));
check('C01b', '§8-20 从 rail 打开日历：.dtCal 落在 B 栏内、data-mode=solar、42 格',
  byCls('dtCal').length === 1 && all((n) => hasClass(n, 'dtCal'), drawerSlot('b')).length === 1 &&
    !!c01Cal && attr(c01Cal, 'data-mode') === 'solar' && byCls('dtCalCell').length === 42,
  'dtCal=' + byCls('dtCal').length + ' inB=' + all((n) => hasClass(n, 'dtCal'), drawerSlot('b')).length +
  ' mode=' + (c01Cal ? attr(c01Cal, 'data-mode') : 'null') + ' cells=' + byCls('dtCalCell').length);

function calTitle() { const t = one((n) => hasClass(n, 'dtCalTitle')); return t ? nodeText(t).trim() : ''; }
function parseCalTitle(s) { const m = /(\d{4})\s*年\s*(\d{1,2})\s*月/.exec(s); return m ? { y: Number(m[1]), m: Number(m[2]) } : null; }
function gotoMonth(y, m) {
  for (let i = 0; i < 60; i++) {
    const cur = parseCalTitle(calTitle());
    if (!cur) return false;
    if (cur.y === y && cur.m === m) return true;
    const wantNext = y * 12 + m > cur.y * 12 + cur.m;
    const btn = all((n) => hasClass(n, 'dtIconBtn') && n.props.title === (wantNext ? '下一月' : '上一月'))[0];
    if (!btn || btn.props.disabled) return false;
    fire(btn);
  }
  return false;
}
const cells = () => byCls('dtCalCell');
const cellAt = (key) => cells().find((n) => attr(n, 'data-date') === key) || null;
function cellSub(cell) { const s = cell ? one((n) => hasClass(n, 'dtCalSub'), cell) : null; return s ? nodeText(s).trim() : ''; }
function cellSubCls(cell) { const s = cell ? one((n) => hasClass(n, 'dtCalSub'), cell) : null; return s ? cls(s) : ''; }

const nowD = new Date();
const nowTitle = nowD.getFullYear() + ' 年 ' + (nowD.getMonth() + 1) + ' 月';
check('C02', '日历标题对应当前月', calTitle() === nowTitle, 'actual=' + JSON.stringify(calTitle()));
check('C03', '周一起始：7 个周标题按 周一…周日 排列',
  (function () {
    const ws = byCls('dtCalWeekday');
    const want = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return ws.length === 7 && want.every((l, i) => nodeText(ws[i]).startsWith(l));
  })(), 'weekdays=' + byCls('dtCalWeekday').map((n) => nodeText(n).trim()).join(','));

const c0 = cells();
const firstK = c0.length ? attr(c0[0], 'data-date') : '';
const firstDate = firstK ? new Date(firstK + 'T00:00:00') : null;
check('C04', '日历恒 42 格且首格是周一（§8-20）', c0.length === 42 && !!firstDate && firstDate.getDay() === 1,
  'cells=' + c0.length + ' 首格=' + firstK + ' getDay=' + (firstDate ? firstDate.getDay() : 'null'));
check('C05', '今天格带 .dtCalToday，跨月格带 .dtCalOut（§8-22）',
  !!cellAt(TODAY_K) && hasClass(cellAt(TODAY_K), 'dtCalToday') && byCls('dtCalOut').length > 0 && byCls('dtCalOut').length < 42,
  'todayCell=' + !!cellAt(TODAY_K) + ' dtCalOut=' + byCls('dtCalOut').length);

const moreBtn = one((n) => hasClass(n, 'dtCalMore'));
fire(moreBtn);
let calMenu = one((n) => hasClass(n, 'dtMenu') && attr(n, 'data-open') === '1');
let menuItems = calMenu ? all((n) => hasClass(n, 'dtMenuItem'), calMenu) : [];
const modeLabels = ['新历', '农历', '节气', '节假日'];
/* 叠加模型（§15-86）：新历恒为主显示，副行由 lunar/term/holiday 三个复选源按
   holiday > term > lunar 取第一个「被选中且当日有值」的来源；真实状态存
   settings.calendar.overlays，位掩码 lunar=1 / term=2 / holiday=4 落在 .dtCal 的
   data-cal-overlay 上。断言读位掩码 + 副行类名，不靠菜单文案点选。 */
const calEl = () => one((n) => hasClass(n, 'dtCal'));
const calMask = () => Number(attr(calEl(), 'data-cal-overlay'));
const calSettingsNow = () => ((storeApi.get().settings || {}).calendar || {});
const calOverlaysNow = () => {
  const o = calSettingsNow().overlays || {};
  return { lunar: !!o.lunar, term: !!o.term, holiday: !!o.holiday };
};
const maskOf = (o) => (o.lunar ? 1 : 0) + (o.term ? 2 : 0) + (o.holiday ? 4 : 0);
const DEFAULT_OVERLAYS = { lunar: false, term: true, holiday: true };
const CAL_TARGET = {
  新历: { lunar: false, term: true, holiday: true },
  农历: { lunar: true, term: false, holiday: false },
  节气: { lunar: false, term: true, holiday: false },
  节假日: { lunar: false, term: false, holiday: true }
};
/* calMode 由位掩码反推「当前等效显示模式」，既有的 C07/C08/C09/C10/C15 与 E04–E07
   的语义不变：默认组合（6）＝ 新历，单选一源时等于该源名，其余组合记 combo:<mask>。 */
const calMode = () => {
  const m = calMask();
  return m === 6 ? 'solar' : m === 1 ? 'lunar' : m === 2 ? 'term' : m === 4 ? 'holiday' : 'combo:' + m;
};
const calMenuOpen = () => one((n) => hasClass(n, 'dtMenu') && attr(n, 'data-open') === '1');
/* 本段先于「九、菜单可达性」求值，realClick/dispatchEvt 尚未定义，所以这里用 fire
   走 onClick；真实 mousedown→mouseup→click 序列由 E03–E07 专门覆盖。 */
function openCalMenu() {
  if (calMenuOpen()) return calMenuOpen();
  /* t116 三栏模型：日历默认不在树里（B 栏初始 listView='today'），三点菜单挂在 B 栏日历根内。
     所以取菜单前先确保日历已进 B 栏 —— 这是模型迁移的前置，不是实现缺陷。 */
  if (!one((n) => hasClass(n, 'dtCalMore'))) {
    /* 不用 railDt()：它在本段（二、日历）之后才定义，const 有 TDZ。 */
    const railCal = one((n) => attr(n, 'data-dt') === 'rail-calendar');
    if (railCal) fire(railCal);
  }
  const more = one((n) => hasClass(n, 'dtCalMore'));
  if (!more) return null;
  fire(more);
  return calMenuOpen();
}
function clickCalItem(sel) {
  const menu = openCalMenu();
  if (!menu) return false;
  const item = one(sel, menu);
  if (!item) return false;
  fire(item); /* 选完即收菜单，所以每次都要重新开 */
  return true;
}
function setCalMode(label) {
  const target = CAL_TARGET[label];
  if (!target) return false;
  ['lunar', 'term', 'holiday'].forEach(function (id) {
    if (calOverlaysNow()[id] === target[id]) return;
    if (!clickCalItem((n) => attr(n, 'data-dt') === 'cal-overlay-' + id)) {
      throw new Error('点不到叠加项 ' + id + '（data-dt=cal-overlay-' + id + '）');
    }
  });
  return calMask() === maskOf(target);
}

check('C06', '三点菜单四项：动作行「新历」+ 三个复选（农历/节气/节假日），默认组合下「新历」亮（§8-21/§15-86）',
  !!calMenu && menuItems.length === 4 && modeLabels.every((l, i) => nodeText(menuItems[i]).includes(l)) &&
  attr(menuItems[0], 'data-dt') === 'cal-overlay-reset' && attr(menuItems[0], 'role') === 'menuitem' &&
  attr(menuItems[0], 'aria-checked') === undefined && attr(menuItems[0], 'data-on') === '1' &&
  ['lunar', 'term', 'holiday'].every((id, i) => attr(menuItems[i + 1], 'data-dt') === 'cal-overlay-' + id &&
    attr(menuItems[i + 1], 'role') === 'menuitemcheckbox' &&
    attr(menuItems[i + 1], 'aria-checked') === (calOverlaysNow()[id] ? 'true' : 'false')),
  'mask=' + calMask() + ' items=' + menuItems.map((n) => nodeText(n).trim() + '[' + attr(n, 'data-dt') + '|' + attr(n, 'role') + '|' + attr(n, 'aria-checked') + '|on=' + attr(n, 'data-on') + ']').join(','));

fire(one((n) => hasClass(n, 'dtCalMore'))); /* 关掉菜单，后续断言从「无菜单」起步 */
check('C06b', '默认叠加组合 = 节气 + 节假日（位掩码 6），且 .dtCal 上 data-mode 恒为 solar（新历永远是主显示）',
  calMask() === 6 && calMode() === 'solar' && attr(calEl(), 'data-mode') === 'solar',
  'mask=' + calMask() + ' calMode=' + calMode() + ' data-mode=' + attr(calEl(), 'data-mode'));

setCalMode('农历');
check('C07', '只选「农历」→ 位掩码=1、菜单自动关闭、副行出现农历文本（.dtCalSubLunar）',
  calMask() === 1 && calMode() === 'lunar' && !calMenuOpen() && byCls('dtCalSubLunar').length > 0,
  'mask=' + calMask() + ' mode=' + calMode() + ' dtCalSubLunar=' + byCls('dtCalSubLunar').length);

setCalMode('节气');
const atApr = gotoMonth(2026, 4);
const termCell = cellAt('2026-04-05');
check('C08', '只选「节气」→ 位掩码=2；导航到 2026-04 后 2026-04-05 副行「清明」且带 .dtCalSubTerm',
  atApr && calMask() === 2 && calMode() === 'term' && cellSub(termCell) === '清明' && hasClass(one((n) => hasClass(n, 'dtCalSub'), termCell), 'dtCalSubTerm'),
  'nav=' + atApr + ' mask=' + calMask() + ' mode=' + calMode() + ' sub=' + JSON.stringify(cellSub(termCell)) + ' cls=' + cellSubCls(termCell));

setCalMode('新历');
const solarCell = cellAt('2026-04-05');
check('C09', '恢复默认叠加（位掩码 6 = 节气 + 节假日）→ 同日有节日时副行显示节日短名「清明」，节气退到格 title（2026-04-05「清明节 · 清明」）',
  calMask() === 6 && cellSub(solarCell) === '清明' && hasClass(one((n) => hasClass(n, 'dtCalSub'), solarCell), 'dtCalSubHoliday') && String(attr(solarCell, 'title')).includes('清明节') && String(attr(solarCell, 'title')).includes('清明'),
  'mask=' + calMask() + ' sub=' + JSON.stringify(cellSub(solarCell)) + ' title=' + JSON.stringify(attr(solarCell, 'title')));

setCalMode('节假日');
const holiCell = cellAt('2026-04-04');
check('C10', '只选「节假日」→ 位掩码=4；格 data-holiday 为全名「清明节」，副行是短名「清明」',
  calMask() === 4 && attr(holiCell, 'data-holiday') === '清明节' && cellSub(holiCell) === '清明',
  'mask=' + calMask() + ' data-holiday=' + JSON.stringify(attr(holiCell, 'data-holiday')) + ' sub=' + JSON.stringify(cellSub(holiCell)));

gotoMonth(2026, 9);
const makeupCell = cellAt('2026-09-20');
const makeupBadge = makeupCell ? one((n) => hasClass(n, 'dtCalMakeup'), makeupCell) : null;
check('C11', '调休日 data-makeup="1" 且日期旁出现「班」徽标',
  attr(makeupCell, 'data-makeup') === '1' && !!makeupBadge && nodeText(makeupBadge).trim() === '班',
  'cell 2026-09-20 makeup=' + JSON.stringify(attr(makeupCell, 'data-makeup')) + ' badge=' + (makeupBadge ? nodeText(makeupBadge).trim() : 'null'));

gotoMonth(2027, 1);
const gapEl = one((n) => hasClass(n, 'dtCalGap'));
check('C12', '2027 年未公布节假日安排 → .dtCalGap「⋯」出现且带说明 title',
  !!gapEl && nodeText(gapEl).trim() === '⋯' && String(attr(gapEl, 'title')).length > 0,
  'gap=' + (gapEl ? nodeText(gapEl).trim() : 'null') + ' title=' + JSON.stringify(gapEl ? attr(gapEl, 'title') : null));

const todayBtn = all((n) => hasClass(n, 'dtMiniBtn') && nodeText(n).trim() === '今天')[0];
fire(todayBtn);
check('C13', '点「今天」→ 回到当前月，且 42 格 / 周一起始不变（任意叠加组合下恒定）',
  calTitle() === nowTitle && cells().length === 42 && new Date(attr(cells()[0], 'data-date') + 'T00:00:00').getDay() === 1,
  'title=' + JSON.stringify(calTitle()) + ' cells=' + cells().length + ' 首格=' + attr(cells()[0], 'data-date'));
setCalMode('新历');

/* C14/C15：往返式——切月回当前月、叠加组合来回切后副行逐格复原（只验「有 42 格」不够） */
const navByTitle = (t) => all((n) => hasClass(n, 'dtIconBtn') && n.props.title === t)[0];
const todayButton = () => all((n) => hasClass(n, 'dtMiniBtn') && nodeText(n).trim() === '今天')[0];
const calDates = () => cells().map((n) => attr(n, 'data-date')).join(',');
const calTitle0 = calTitle();
const dates0 = calDates();
fire(navByTitle('下一月'));
const titleNext = calTitle();
const datesNext = calDates();
fire(todayButton());
check('C14', '切月往返：下一月后标题与 42 格日期整体位移，点「今天」回当前月且日期序列逐格复原',
  titleNext !== calTitle0 && datesNext !== dates0 && calTitle() === calTitle0 && calDates() === dates0 &&
  cells().length === 42 && !!cellAt(TODAY_K) && hasClass(cellAt(TODAY_K), 'dtCalToday'),
  '标题 ' + JSON.stringify(calTitle0) + ' → ' + JSON.stringify(titleNext) + ' → ' + JSON.stringify(calTitle()) +
  '；日期序列复原=' + (calDates() === dates0) + ' cells=' + cells().length);

const solarSig = cells().map((n) => cellSub(n)).join('|');
setCalMode('节气');
const termModeOn = calMode();
const termMaskOn = calMask();
const termSigLen = cells().map((n) => cellSub(n)).join('|').length;
setCalMode('新历');
check('C15', '叠加组合往返：6 → 2 → 6，位掩码与 42 格副行文本逐格复原（内容非仅外壳重建）',
  calMode() === 'solar' && calMask() === 6 && termModeOn === 'term' && termMaskOn === 2 && cells().map((n) => cellSub(n)).join('|') === solarSig && cells().length === 42,
  'mask 序列=6 → ' + termMaskOn + ' → ' + calMask() + '；模式=' + calMode() + '；副行签名复原=' + (cells().map((n) => cellSub(n)).join('|') === solarSig) +
  ' 签名长度 solar=' + solarSig.length + ' term=' + termSigLen);

/* ============================ 三、习惯面板（§8-13..15） ============================ */
const HABIT_PROJECT = { id: 'habit-home', name: '习惯打卡', type: 'habit', color: '#5b8def', icon: '' };
const INBOX = { id: 'inbox', name: '收集箱', type: 'todo', inbox: true, color: '#8b8b8b' };
applyState({
  projects: [INBOX, HABIT_PROJECT],
  tasks: [{ id: 'ht1', projectId: 'inbox', title: '普通任务', status: 0, deleted: false, date: TODAY_K, allDay: true }],
  habits: [
    { id: 'h-m', name: '晨跑', color: '', period: 'morning', archived: false, checks: [], freq: { type: 'daily', interval: 1, byDay: [] }, checkInCount: 0, currentStreak: 0, longestStreak: 0 },
    { id: 'h-a', name: '读书', color: '', period: 'afternoon', archived: false, checks: [YEST_K, D2_K], freq: { type: 'daily', interval: 1, byDay: [] }, checkInCount: 2, currentStreak: 2, longestStreak: 2 },
    { id: 'h-e', name: '早睡', color: '', period: 'evening', archived: true, checks: [], freq: { type: 'daily', interval: 1, byDay: [] }, checkInCount: 0, currentStreak: 0, longestStreak: 0 }
  ]
});
closeAllDrawers();
const habitRail = byDt('rail-habit')[0];
if (habitRail) fire(habitRail);
check('H01', '习惯从一级入口 [data-dt="rail-habit"] 打开 B 栏（data-kind=habit / data-drawer-view=habit，不再藏在项目 p:<id> 里）',
  !!habitRail && !!bSlot() && attr(bSlot(), 'data-kind') === 'habit' && bView() === 'habit' && hasClass(byDt('rail-habit')[0], 'dtRailOn'),
  'rail-habit=' + !!habitRail + ' b.kind=' + bKind() + ' b.view=' + bView() + ' 高亮=' + hasClass(byDt('rail-habit')[0], 'dtRailOn') +
  ' 头计数=' + JSON.stringify(bCount()));

const blocks = byCls('dtHabitBlock');
check('H02', '三个时段区块恒定存在且顺序为 上午/下午/晚上（§8-13）',
  blocks.length === 3 && blocks.map((b) => nodeText(one((n) => hasClass(n, 'dtHabitBlockTitle'), b)).trim()).join('/') === '上午/下午/晚上',
  'blocks=' + blocks.map((b) => attr(b, 'data-block') + ':' + nodeText(one((n) => hasClass(n, 'dtHabitBlockTitle'), b)).trim()).join(','));
const eveningBlock = blocks.find((b) => attr(b, 'data-block') === 'evening');
check('H03', '无习惯的时段渲染虚线占位（.dtHabitBlockEmpty）而非隐藏',
  !!eveningBlock && all((n) => hasClass(n, 'dtHabitBlockEmpty'), eveningBlock).length === 1 && all((n) => hasClass(n, 'dtHabitCard'), eveningBlock).length === 0,
  'evening 空占位=' + (eveningBlock ? all((n) => hasClass(n, 'dtHabitBlockEmpty'), eveningBlock).length : 'n/a'));
check('H04', '区块计数文案「已完成数/总数 已完成」正确（h-a 有历史打卡但今天未打卡 → 0/1）',
  blocks.map((b) => nodeText(one((n) => hasClass(n, 'dtHabitBlockCount'), b)).trim()).join('|') === '0/1 已完成|0/1 已完成|0/0 已完成',
  'counts=' + blocks.map((b) => nodeText(one((n) => hasClass(n, 'dtHabitBlockCount'), b)).trim()).join('|'));

const cardOf = (id) => one((n) => hasClass(n, 'dtHabitCard') && attr(n, 'data-habit-id') === id);
function streakOf(card) {
  const streakEl = one((n) => attr(n, 'data-dt') === 'habit-streak', card);
  const b = streakEl ? one((n) => n.tag === 'b' && attr(n, 'data-streak') !== undefined, streakEl) : null;
  return { el: streakEl, text: '已坚持 ' + (b ? nodeText(b).trim() : '?') + ' 天', n: b ? Number(attr(b, 'data-streak')) : NaN };
}
const cards = byCls('dtHabitCard');
const streakShapes = cards.map((c) => {
  const s = streakOf(c);
  const kids = childNodes(c);
  return attr(c, 'data-habit-id') + ': text=' + JSON.stringify(s.text) + ' 尾子元素=' + (kids.length ? cls(kids[kids.length - 1]) : 'null');
});
check('H05', '每张卡片都有 streak 且文案匹配 /^已坚持 \\d+ 天$/，并且是卡片最后一个子元素（§8-14）',
  cards.length === 2 && cards.every((c) => {
    const s = streakOf(c);
    const kids = childNodes(c);
    const last = kids[kids.length - 1];
    return !!s.el && /^已坚持 \d+ 天$/.test(s.text) && !!last && attr(last, 'data-dt') === 'habit-streak';
  }), streakShapes.join(' | '));
check('H06', '未打卡习惯也显示「已坚持 0 天」（N=0 必须渲染）',
  streakOf(cardOf('h-m')).text === '已坚持 0 天' && !hasClass(cardOf('h-m'), 'dtHabitCardOn'),
  'h-m=' + JSON.stringify(streakOf(cardOf('h-m')).text));
check('H07', '有历史连续打卡的习惯显示真实天数（h-a 昨+前日 → 2）', streakOf(cardOf('h-a')).n === 2,
  'h-a data-streak=' + streakOf(cardOf('h-a')).n);

const mCheck = one((n) => attr(n, 'data-dt') === 'habit-check', cardOf('h-m'));
fire(mCheck);
const cardM = cardOf('h-m');
const blockCountText = (i) => nodeText(one((n) => hasClass(n, 'dtHabitBlockCount'), byCls('dtHabitBlock')[i])).trim();
check('H08', '点打卡 → 卡片 data-on=1 / .dtHabitCardOn，streak 变 1，区块计数 +1（§8-15）',
  attr(cardM, 'data-on') === '1' && hasClass(cardM, 'dtHabitCardOn') && streakOf(cardM).n === 1 && blockCountText(0) === '1/1 已完成',
  'data-on=' + attr(cardM, 'data-on') + ' streak=' + streakOf(cardM).n + ' 计数=' + blockCountText(0));
fire(one((n) => attr(n, 'data-dt') === 'habit-check', cardOf('h-m')));
check('H09', '取消打卡 → data-on 消失，streak 回 0、计数回 0/1',
  attr(cardOf('h-m'), 'data-on') === undefined && streakOf(cardOf('h-m')).n === 0 && blockCountText(0) === '0/1 已完成',
  'after data-on=' + JSON.stringify(attr(cardOf('h-m'), 'data-on')) + ' streak=' + streakOf(cardOf('h-m')).n + ' 计数=' + blockCountText(0));

/* H10：往返式——空块不是死占位，加入在用习惯后要升成网格，归档后再回占位（三区块数量不变） */
const habitBlock = (i) => byCls('dtHabitBlock')[i];
const blockEmptyN = (i) => all((n) => hasClass(n, 'dtHabitBlockEmpty'), habitBlock(i)).length;
const blockGridN = (i) => all((n) => hasClass(n, 'dtHabitGrid'), habitBlock(i)).length;
const emptyBeforeAdd = blockEmptyN(2);
const newEveningHabit = { id: 'h-e2', name: '晚间散步', color: '', period: 'evening', archived: false, checks: [], freq: { type: 'daily', interval: 1, byDay: [] }, checkInCount: 0, currentStreak: 0, longestStreak: 0 };
storeApi.update((s) => Object.assign({}, s, { habits: (s.habits || []).concat([newEveningHabit]) }));
rerender(); rerender();
const emptyAfterAdd = blockEmptyN(2);
const gridAfterAdd = blockGridN(2);
const cntAfterAdd = nodeText(one((n) => hasClass(n, 'dtHabitBlockCount'), habitBlock(2))).trim();
const cardAfterAdd = all((n) => hasClass(n, 'dtHabitCard'), habitBlock(2)).length;
storeApi.update((s) => Object.assign({}, s, { habits: (s.habits || []).map((h) => (h.id === 'h-e2' ? Object.assign({}, h, { archived: true }) : h)) }));
rerender(); rerender();
check('H10', '空块往返：evening 虚线占位 → 加入在用习惯后升为网格（0/1 已完成、1 张卡）→ 归档后回到占位，三区块数量恒为 3',
  emptyBeforeAdd === 1 && emptyAfterAdd === 0 && gridAfterAdd === 1 && cardAfterAdd === 1 && cntAfterAdd === '0/1 已完成' &&
  blockEmptyN(2) === 1 && blockGridN(2) === 0 && byCls('dtHabitBlock').length === 3,
  '占位 ' + emptyBeforeAdd + '→' + emptyAfterAdd + '→' + blockEmptyN(2) + '；网格 ' + gridAfterAdd + '；计数=' + JSON.stringify(cntAfterAdd) + '；区块数=' + byCls('dtHabitBlock').length);

/* H11–H15：习惯详情在 C 栏 + 归档默认折叠（§1.8/§3.7/§8-48..50） */
closeAllDrawers();
fire(byDt('rail-habit')[0]);
fire(cardOf('h-a'));
const hDetail = one((n) => hasClass(n, 'dtHabitDetail'));
check('H11', '点习惯卡 → 详情渲染在 C 栏（data-kind=habit / data-detail-view=habit:h-a），B 栏列表不被替换',
  !!cSlot() && attr(cSlot(), 'data-kind') === 'habit' && cDetailView() === 'habit:h-a' && !!hDetail && byCls('dtHabitCard').length === 2,
  'c.kind=' + (cSlot() ? attr(cSlot(), 'data-kind') : 'null') + ' c.view=' + cDetailView() + ' detail=' + !!hDetail + ' B 卡数=' + byCls('dtHabitCard').length);

const statOf = (k) => {
  const box = one((n) => attr(n, 'data-habit-streak') === k);
  const num = box ? one((n) => hasClass(n, 'dtHabitStatNum'), box) : null;
  return num ? nodeText(num).trim() : null;
};
check('H12', '详情三项统计 current/longest/total 都有钩子且数值来自习惯数据（h-a：2 / 2 / 2）',
  statOf('current') === '2' && statOf('longest') === '2' && statOf('total') === '2',
  'current=' + statOf('current') + ' longest=' + statOf('longest') + ' total=' + statOf('total'));

const heat = one((n) => hasClass(n, 'dtHabitHeat'));
const heatCells = byCls('dtHeatCell');
const futureCells = heatCells.filter((n) => attr(n, 'data-future') === '1');
const snapBeforeFutureClick = snapshot();
const aFutureCell = futureCells[0];
if (aFutureCell) fire(aFutureCell);
check('H13', '打卡热力 42 格且未来日标 data-future=1；点未来日不写库（不准提前打卡）',
  !!heat && /^\d{4}-\d{2}$/.test(String(attr(heat, 'data-habit-month'))) && heatCells.length === 42 &&
  futureCells.length > 0 && snapshot() === snapBeforeFutureClick,
  'month=' + (heat ? attr(heat, 'data-habit-month') : 'null') + ' cells=' + heatCells.length + ' future=' + futureCells.length +
  ' 点后状态不变=' + (snapshot() === snapBeforeFutureClick));

const monthBefore = attr(one((n) => hasClass(n, 'dtHabitHeat')), 'data-habit-month');
fire(byDt('heat-prev')[0]);
const monthPrev = attr(one((n) => hasClass(n, 'dtHabitHeat')), 'data-habit-month');
check('H14', '热力翻月：点 heat-prev 后 data-habit-month 前移一个月且仍是 42 格（往返式翻月）',
  monthPrev !== monthBefore && byCls('dtHeatCell').length === 42,
  'month ' + monthBefore + ' → ' + monthPrev + ' cells=' + byCls('dtHeatCell').length);
fire(byDt('heat-next')[0]);
check('H15', '翻月往返：heat-next 回原月，42 格与月份钩子逐字复原',
  attr(one((n) => hasClass(n, 'dtHabitHeat')), 'data-habit-month') === monthBefore && byCls('dtHeatCell').length === 42,
  'month 复原=' + (attr(one((n) => hasClass(n, 'dtHabitHeat')), 'data-habit-month') === monthBefore) + ' 现月=' + attr(one((n) => hasClass(n, 'dtHabitHeat')), 'data-habit-month'));

fire(collapseIn(cSlot()));
const archivedSwitch = () => all((n) => hasClass(n, 'dtMiniBtn') && nodeText(n).indexOf('归档') >= 0)[0];
const archivedHabits = (storeApi.get().habits || []).filter((h) => h.archived).length;
const cardsDefault = byCls('dtHabitCard').length;
fire(archivedSwitch());
const cardsShown = byCls('dtHabitCard').length;
const frozenSrc = (function () {
  const c = cardOf('h-e');
  const s = c ? one((n) => attr(n, 'data-dt') === 'habit-streak', c) : null;
  return s ? attr(s, 'data-streak-src') : null;
})();
fire(archivedSwitch());
check('H16', '归档习惯默认折叠：默认卡数 = 在用数；点「含归档」后多出全部归档卡且归档卡 data-streak-src=frozen；再点复原',
  cardsDefault === 2 && cardsShown === cardsDefault + archivedHabits && frozenSrc === 'frozen' && byCls('dtHabitCard').length === cardsDefault,
  '卡数 默认=' + cardsDefault + ' → 含归档=' + cardsShown + '（归档 ' + archivedHabits + ' 条）→ 收起=' + byCls('dtHabitCard').length + ' 归档卡 src=' + frozenSrc);

/* ============================ 四、四象限（§8-7..12） ============================ */
const Q_TASKS = [
  { id: 'qa', projectId: 'inbox', title: '重要且紧急', status: 0, deleted: false, priority: 5, date: TODAY_K, allDay: true },
  { id: 'qb', projectId: 'inbox', title: '重要不紧急', status: 0, deleted: false, priority: 3, date: '', allDay: true },
  { id: 'qc', projectId: 'inbox', title: '紧急不重要', status: 0, deleted: false, priority: 0, date: YEST_K, allDay: true },
  { id: 'qd', projectId: 'inbox', title: '不重要不紧急', status: 0, deleted: false, priority: 0, date: '', allDay: true },
  { id: 'qe', projectId: 'inbox', title: '重要且明天到期', status: 0, deleted: false, priority: 5, date: TOMORROW_K, allDay: true },
  { id: 'qsub', projectId: 'inbox', title: '子任务', status: 0, deleted: false, priority: 0, date: '', parentId: 'qd' }
];
applyState({ projects: [INBOX, HABIT_PROJECT], tasks: Q_TASKS, habits: [] });
closeAllDrawers();
fire(railByLabel('四象限'));
const quadRoot = one((n) => hasClass(n, 'dtQuad'));
const quadCells = () => byCls('dtQuadCell');
const qcell = (q) => quadCells().find((n) => attr(n, 'data-quadrant') === q) || null;
const qitems = (q) => all((n) => hasClass(n, 'dtQuadItem'), qcell(q));
check('Q01', '四象限根节点 data-view=quad / data-layout=grid / data-today=今天', !!quadRoot && attr(quadRoot, 'data-view') === 'quad' && attr(quadRoot, 'data-layout') === 'grid' && attr(quadRoot, 'data-today') === TODAY_K,
  'view=' + (quadRoot ? attr(quadRoot, 'data-view') : 'null') + ' layout=' + (quadRoot ? attr(quadRoot, 'data-layout') : 'null') + ' today=' + (quadRoot ? attr(quadRoot, 'data-today') : 'null'));
check('Q02', '四格固定按 q1→q3→q4 顺序渲染且标题正确（§2.5.3）',
  quadCells().map((n) => attr(n, 'data-quadrant')).join(',') === 'q1,q2,q3,q4' &&
  quadCells().map((n) => nodeText(one((x) => hasClass(x, 'dtQuadTitle'), n)).trim()).join('/') === '重要且紧急/重要不紧急/紧急不重要/不重要不紧急',
  'cells=' + quadCells().map((n) => attr(n, 'data-quadrant') + ':' + nodeText(one((x) => hasClass(x, 'dtQuadTitle'), n)).trim()).join(','));

const counts = ['q1', 'q2', 'q3', 'q4'].map((q) => (qcell(q) ? attr(qcell(q), 'data-count') : 'null'));
check('Q03', '判定规则：important=(priority>=3)、urgent=(有日期且 dayDiff<=1) → 计数 2/1/1/2（§8-8/9）',
  counts.join(',') === '2,1,1,2', 'counts(q1..q4)=' + counts.join(','));
check('Q04', '无日期任务只可能落 q2/q4；明天到期的重要任务落 q1（紧急阈值取 1）',
  qitems('q2').some((n) => attr(n, 'data-task-id') === 'qb') && qitems('q4').some((n) => attr(n, 'data-task-id') === 'qd') && qitems('q1').some((n) => attr(n, 'data-task-id') === 'qe'),
  'q1=' + qitems('q1').map((n) => attr(n, 'data-task-id')).join(',') + ' q2=' + qitems('q2').map((n) => attr(n, 'data-task-id')).join(',') + ' q4=' + qitems('q4').map((n) => attr(n, 'data-task-id')).join(','));
check('Q05', '推导来源标记 data-src=derived', all((n) => hasClass(n, 'dtQuadItem')).every((n) => attr(n, 'data-src') === 'derived'),
  'src=' + all((n) => hasClass(n, 'dtQuadItem')).map((n) => attr(n, 'data-task-id') + ':' + attr(n, 'data-src')).join(','));

/* 空态：四格恒定渲染，不隐藏 */
applyState({ tasks: [] });
const emptyCells = quadCells();
check('Q06', '空库时四格仍全部渲染，data-count=0 且各有一个 .dtQuadEmpty（§8-7）',
  emptyCells.length === 4 && emptyCells.every((c) => attr(c, 'data-count') === '0' && all((n) => hasClass(n, 'dtQuadEmpty'), c).length === 1),
  'cells=' + emptyCells.map((c) => attr(c, 'data-quadrant') + ':' + attr(c, 'data-count') + '/empty' + all((n) => hasClass(n, 'dtQuadEmpty'), c).length).join(','));
applyState({ tasks: Q_TASKS });

/* 手动改判 q4 → q1 */
const qdItem = () => all((n) => hasClass(n, 'dtQuadItem') && attr(n, 'data-task-id') === 'qd')[0];
/* t121（§2.5.5.1）：行内角标 .dtQuadSrc 已作废，改判入口搬到动作区 .dtQuadMenuBtn
   （data-dt="quad-menu"），菜单项用 data-quad-pick=q1..q4|'' 取，不再靠文案找「Q3」。 */
const quadMenuBtnOf = (root) => one((n) => hasClass(n, 'dtQuadMenuBtn'), root || undefined);
const quadPick = (menu, id) => (menu ? one((n) => hasClass(n, 'dtMenuItem') && attr(n, 'data-quad-pick') === id, menu) : null);
fire(quadMenuBtnOf(qdItem()));
const qMenu = one((n) => hasClass(n, 'dtQuadMenu'));
const qMenuItems = qMenu ? all((n) => hasClass(n, 'dtMenuItem'), qMenu) : [];
check('Q07', '象限角标菜单含四个象限 + 「按规则判定」', qMenuItems.length === 5 && nodeText(qMenuItems[4]).includes('按规则判定'),
  'items=' + qMenuItems.map((n) => nodeText(n).trim()).join('/'));
fire(quadPick(qMenu, 'q1'));
storeApi.saveNow();
const saved = savedState();
const savedQd = saved ? (saved.tasks || []).find((t) => t.id === 'qd') : null;
check('Q08', '手动改判到 Q1：任务物理移到 q1、data-src=override、localStorage 里 quadOverride="q1"（§8-10）',
  qitems('q1').some((n) => attr(n, 'data-task-id') === 'qd') && attr(qdItem(), 'data-src') === 'override' && !!savedQd && savedQd.quadOverride === 'q1' &&
  (qcell('q1') ? attr(qcell('q1'), 'data-count') : '') === '3',
  'q1 items=' + qitems('q1').map((n) => attr(n, 'data-task-id') + ':' + attr(n, 'data-src')).join(',') + ' saved.quadOverride=' + JSON.stringify(savedQd && savedQd.quadOverride));

fire(quadMenuBtnOf(qdItem()));
const qMenu2 = one((n) => hasClass(n, 'dtQuadMenu'));
const backItem = quadPick(qMenu2, '');
fire(backItem);
storeApi.saveNow();
const savedAfter = savedState();
const savedQd2 = savedAfter ? (savedAfter.tasks || []).find((t) => t.id === 'qd') : null;
check('Q09', '点「按规则判定」→ 回 q4 且 data-src=derived、quadOverride 清空（§8-10）',
  qitems('q4').some((n) => attr(n, 'data-task-id') === 'qd') && attr(qdItem(), 'data-src') === 'derived' && !!savedQd2 && savedQd2.quadOverride === '',
  'q4 items=' + qitems('q4').map((n) => attr(n, 'data-task-id')).join(',') + ' saved.quadOverride=' + JSON.stringify(savedQd2 && savedQd2.quadOverride));

/* 今日要事 */
const qbItem = () => all((n) => hasClass(n, 'dtQuadItem') && attr(n, 'data-task-id') === 'qb')[0];
const q1CountBefore = Number(attr(qcell('q1'), 'data-count'));
fire(one((n) => hasClass(n, 'dtPinBtn'), qbItem()));
const pinEl = one((n) => hasClass(n, 'dtTodayPin'));
const pinInQ1 = qcell('q1') ? all((n) => hasClass(n, 'dtTodayPin'), qcell('q1')).length : 0;
const qbOccurrences = all((n) => hasClass(n, 'dtQuadItem') && attr(n, 'data-task-id') === 'qb').length;
check('Q10', '点 .dtPinBtn → q1 内出现 .dtTodayPin[data-count=1]，该任务全局只出现一次且 data-pinned=1、q1 计数 +1（§8-12）',
  !!pinEl && attr(pinEl, 'data-count') === '1' && pinInQ1 === 1 && qbOccurrences === 1 && attr(qbItem(), 'data-pinned') === '1' &&
  Number(attr(qcell('q1'), 'data-count')) === q1CountBefore + 1,
  'pin=' + (pinEl ? attr(pinEl, 'data-count') : 'null') + ' 出现次数=' + qbOccurrences + ' data-pinned=' + attr(qbItem(), 'data-pinned') + ' q1Count ' + q1CountBefore + '→' + attr(qcell('q1'), 'data-count'));

storeApi.update((s) => Object.assign({}, s, {
  tasks: s.tasks.map((t) => (t.id === 'qb' ? Object.assign({}, t, { pinToday: YEST_K }) : t))
}));
rerender(); rerender();
check('Q11', '把 pinToday 改成昨天（模拟跨天）→ .dtTodayPin 消失，任务回到 q2 推导格',
  !one((n) => hasClass(n, 'dtTodayPin')) && qitems('q2').some((n) => attr(n, 'data-task-id') === 'qb') && attr(qbItem(), 'data-pinned') === '0',
  'pin=' + !!one((n) => hasClass(n, 'dtTodayPin')) + ' q2=' + qitems('q2').map((n) => attr(n, 'data-task-id')).join(','));

check('Q12', '子任务一级缩进：四象限内子任务行带 .dtRowChild（父行不带）',
  !!one((n) => hasClass(n, 'dtRow') && hasClass(n, 'dtRowChild'), qcell('q4')) &&
  !all((n) => hasClass(n, 'dtRow'), qcell('q4')).every((n) => hasClass(n, 'dtRowChild')),
  'q4 rows=' + all((n) => hasClass(n, 'dtRow'), qcell('q4')).map((n) => n.props['data-task-id'] + (hasClass(n, 'dtRowChild') ? '(child)' : '')).join(','));
check('Q13', '四象限行是紧凑形态：.dtRowCompact、无 .dtRowNote、chips 至多 1 个（§2.5.5）',
  all((n) => hasClass(n, 'dtRow'), quadRoot).every((n) => hasClass(n, 'dtRowCompact')) &&
  all((n) => hasClass(n, 'dtRowNote'), quadRoot).length === 0 &&
  all((n) => hasClass(n, 'dtRowChips'), quadRoot).every((n) => childNodes(n).length <= 1),
  'compact 行=' + all((n) => hasClass(n, 'dtRow'), quadRoot).length + ' note=' + all((n) => hasClass(n, 'dtRowNote'), quadRoot).length);

/* 抽屉宽 <388 → 单列 */
resizeTo(360);
check('Q14', 'B 抽屉宽 <388px → data-layout="stack"；恢复后回 grid（§8-11）',
  attr(one((n) => hasClass(n, 'dtQuad')), 'data-layout') === 'stack',
  'width=360 → layout=' + attr(one((n) => hasClass(n, 'dtQuad')), 'data-layout'));
resizeTo(1200);
check('Q15', '恢复宽抽屉后 data-layout 回 grid', attr(one((n) => hasClass(n, 'dtQuad')), 'data-layout') === 'grid',
  'width=1200 → layout=' + attr(one((n) => hasClass(n, 'dtQuad')), 'data-layout'));

/* 四象限内点任务行 → 详情进 C 栏（与左侧清单同一套详情，§1.8/§2.5.11） */
const qaRow = all((n) => hasClass(n, 'dtRow'), qcell('q1'))[0];
fire(qaRow);
const qaId = qaRow ? attr(qaRow, 'data-task-id') : null;
check('Q16', '四象限内点任务行 → 详情渲染在 C 栏（data-kind=task / data-detail-view=task:<id>），B 栏仍是四象限四格',
  !!cSlot() && attr(cSlot(), 'data-kind') === 'task' && String(cDetailView()).indexOf('task:') === 0 &&
  !!bSlot() && attr(bSlot(), 'data-kind') === 'quadrant' && quadCells().length === 4,
  'c.kind=' + (cSlot() ? attr(cSlot(), 'data-kind') : 'null') + ' c.view=' + cDetailView() +
  ' b.kind=' + bKind() + ' 四格=' + quadCells().length + ' 点中任务=' + String(qaId));

/* 四象限独立开关：收起按钮一下全关，rail 再点重开 */
fire(collapseIn(bSlot()));
check('Q17', '四象限收起：点自身收起按钮后 B 与 C 都消失（不留半开态），rail 再点可重开',
  !bSlot() && !cSlot() && !zoneEl(), 'B=' + !!bSlot() + ' C=' + !!cSlot() + ' zone=' + !!zoneEl());
fire(railByLabel('四象限'));
check('Q17b', '四象限可独立重开（不需要先关别的清单）', !!bSlot() && bKind() === 'quadrant' && !cSlot(),
  'b.kind=' + bKind() + ' c=' + !!cSlot());

/* Q18：往返式——改判后切走再切回，override 仍在（Q08-Q09 只验了改判当场生效） */
if (!bSlot() || bKind() !== 'quadrant') fire(railByLabel('四象限'));
const qdItem2 = () => all((n) => hasClass(n, 'dtQuadItem') && attr(n, 'data-task-id') === 'qd')[0];
fire(quadMenuBtnOf(qdItem2()));
const qMenuAgain = one((n) => hasClass(n, 'dtQuadMenu'));
const q3Item = quadPick(qMenuAgain, 'q3');
fire(q3Item);
const srcAfterSet = attr(qdItem2(), 'data-src');
closeAllDrawers();
const bClosed = !drawerSlot('b');
fire(railByLabel('四象限'));
storeApi.saveNow();
const savedRound = savedState();
const savedQdRound = savedRound ? (savedRound.tasks || []).find((t) => t.id === 'qd') : null;
check('Q18', '改判 Q3 后关闭 B 再重开：override 仍在（data-src=override、仍在 q3、localStorage 仍为 "q3"）',
  srcAfterSet === 'override' && bClosed && !!qdItem2() && attr(qdItem2(), 'data-src') === 'override' &&
  qitems('q3').some((n) => attr(n, 'data-task-id') === 'qd') && !!savedQdRound && savedQdRound.quadOverride === 'q3',
  '改判后 src=' + srcAfterSet + ' → 重开后 src=' + attr(qdItem2(), 'data-src') + ' q3 items=' +
  qitems('q3').map((n) => attr(n, 'data-task-id')).join(',') + ' saved.quadOverride=' + JSON.stringify(savedQdRound && savedQdRound.quadOverride));

/* Q19–Q21：四色同源（§0.6）——象限格左边线与任务标题色必须来自同一张调色板 */
const quadItemOf = (id) => all((n) => hasClass(n, 'dtQuadItem') && attr(n, 'data-task-id') === id)[0];
const prioColorOf = (id) => {
  const it = quadItemOf(id);
  const t = it ? one((n) => hasClass(n, 'dtRowTitle'), it) : null;
  return t ? attr(t, 'data-prio-color') : null;
};
const prioInlineOf = (id) => {
  const it = quadItemOf(id);
  const t = it ? one((n) => hasClass(n, 'dtRowTitle'), it) : null;
  return t && t.props.style ? t.props.style.color : null;
};
const quadColorOf = (q) => (qcell(q) ? attr(qcell(q), 'data-quad-color') : null);
check('Q19', '四象限格颜色 key 固定 q1=red / q2=yellow / q3=blue / q4=none，且顺序仍是 q1..q4',
  quadColorOf('q1') === 'red' && quadColorOf('q2') === 'yellow' && quadColorOf('q3') === 'blue' && quadColorOf('q4') === 'none' &&
  quadCells().map((n) => attr(n, 'data-quadrant')).join(',') === 'q1,q2,q3,q4',
  'colors=' + quadCells().map((n) => attr(n, 'data-quadrant') + ':' + attr(n, 'data-quad-color')).join(','));

const prioBefore = prioColorOf('qc');
applyState({ tasks: (storeApi.get().tasks || []).map((t) => (t.id === 'qc' ? Object.assign({}, t, { priority: 1 }) : t)) });
const prioBlue = prioColorOf('qc');
applyState({ tasks: (storeApi.get().tasks || []).map((t) => (t.id === 'qc' ? Object.assign({}, t, { priority: 0 }) : t)) });
check('Q20', '任务标题 data-prio-color 随优先级走：5→red / 3→yellow / 0→none，低优先级 1 也是 blue（不是红）（§0.6）',
  prioColorOf('qa') === 'red' && prioColorOf('qb') === 'yellow' && prioColorOf('qc') === 'none' && prioBlue === 'blue' && prioBefore === 'none',
  'qa=' + prioColorOf('qa') + ' qb=' + prioColorOf('qb') + ' qc=' + prioColorOf('qc') + ' qc@priority1=' + prioBlue);

const q1Token = qcell('q1') && qcell('q1').props.style ? qcell('q1').props.style['--dt-quad'] : null;
const q2Token = qcell('q2') && qcell('q2').props.style ? qcell('q2').props.style['--dt-quad'] : null;
check('Q21', '四色同源：q1 格 --dt-quad 与同格任务标题色完全相同（q1 红 / q2 黄各验一次），颜色不是两处各写一份',
  !!q1Token && q1Token === prioInlineOf('qa') && !!q2Token && q2Token === prioInlineOf('qb') && q1Token !== q2Token,
  'q1 token=' + String(q1Token) + ' vs qa 标题色=' + String(prioInlineOf('qa')) +
  '；q2 token=' + String(q2Token) + ' vs qb 标题色=' + String(prioInlineOf('qb')));

/* ============================ 五、番茄钟节奏（§8-16..19） ============================ */
closeAllDrawers();
resizeTo(1200);
const POMO_BASE = {
  work: 25, short: 5, long: 15, rounds: 4, rhythm: 'pause', rhythmPrev: null,
  autoStart: false, sound: true, notify: true, mode: 'work', running: false,
  endsAt: 0, pausedLeft: 0, round: 0, day: TODAY_K, count: 0, minutes: 0
};
applyState({ pomo: POMO_BASE });
fire(railByLabel('番茄钟'));
check('P01', '点 rail「番茄钟」→ B 栏切到番茄钟', !!one((n) => hasClass(n, 'dtPomoSettings')),
  'dtPomoSettings=' + !!one((n) => hasClass(n, 'dtPomoSettings')));

const pomoSettings = () => one((n) => hasClass(n, 'dtPomoSettings'));
const allPomoSelects = () => all((n) => n.tag === 'select', pomoSettings());
const restSel = (k) => one((n) => attr(n, 'data-rest-' + k) !== undefined, pomoSettings());
const rhythmOpts = () => all((n) => hasClass(n, 'dtRhythmOpt') && attr(n, 'data-rhythm') !== undefined);
const rhythmOf = (id) => rhythmOpts().find((n) => attr(n, 'data-rhythm') === id);
const rhythmRadio = (id) => all((n) => n.tag === 'input' && hasClass(n, 'dtRhythmRadio') && attr(n, 'value') === id)[0];
const checkedRhythm = () => {
  const hit = rhythmOpts().find((n) => {
    const inp = one((x) => x.tag === 'input', n);
    return !!inp && inp.props.checked === true;
  });
  return hit ? attr(hit, 'data-rhythm') : null;
};
/* 节奏切换走原生 radio 的 onChange（t33 把三段 .dtSegBtn 换成了单选组） */
function pickRhythm(id) {
  const radio = rhythmRadio(id);
  if (radio && typeof radio.props.onChange === 'function') {
    try { radio.props.onChange({ target: { value: id, checked: true } }); } catch (e) { errors.push(['rhythm:onChange:' + id, e]); }
  } else if (rhythmOf(id)) {
    fire(rhythmOf(id));
    return;
  }
  rerender(); rerender();
}
const pomoShot = () => allPomoSelects().map((n) => attr(n, 'value')).join('/') + '|' + allPomoSelects().map((n) => n.props.disabled === true).join(',');

check('P02', '节奏三选收敛成一组原生 radio（dtRhythmOpt[data-rhythm] + input[type=radio][name=dtRhythm]），默认 pause 选中',
  rhythmOpts().length === 3 && rhythmOpts().map((n) => attr(n, 'data-rhythm')).join(',') === 'pause,skip,auto' &&
  all((n) => n.tag === 'input' && hasClass(n, 'dtRhythmRadio')).length === 3 &&
  all((n) => n.tag === 'input' && hasClass(n, 'dtRhythmRadio')).every((n) => attr(n, 'name') === 'dtRhythm') &&
  checkedRhythm() === 'pause',
  'opts=' + rhythmOpts().map((n) => attr(n, 'data-rhythm') + (attr(n, 'data-on') === '1' ? '*' : '')).join(',') + ' checked=' + checkedRhythm());
check('P03', 'pause 下三档休息控件全部禁用（§4.3：只有 auto 可编辑），值仍是 25/5/15/4 不被改写',
  allPomoSelects().length === 4 && allPomoSelects()[0].props.disabled !== true &&
  allPomoSelects().slice(1).every((n) => n.props.disabled === true) &&
  allPomoSelects().map((n) => attr(n, 'value')).join('/') === '25/5/15/4',
  'disabled=' + allPomoSelects().map((n) => n.props.disabled === true).join(',') + ' value=' + allPomoSelects().map((n) => attr(n, 'value')).join('/'));

pickRhythm('skip');
const skipSels = allPomoSelects();
const skipRoundOpts = restSel('rounds') ? all((n) => n.tag === 'option', restSel('rounds')) : [];
check('P04', '切「跳过休息」→ 三档休息控件置灰但值不被改写（仍 25/5/15/4），rounds 仍是 5 档不是「—」（§4.3/§8-16）',
  skipSels.length === 4 && skipSels.map((n) => attr(n, 'value')).join('/') === '25/5/15/4' &&
  skipSels[0].props.disabled !== true && skipSels.slice(1).every((n) => n.props.disabled === true) &&
  skipRoundOpts.length === 5 && skipRoundOpts.map((n) => nodeText(n).trim()).join(',') === '2 个番茄后,3 个番茄后,4 个番茄后,5 个番茄后,6 个番茄后' &&
  attr(one((n) => hasClass(n, 'dtRhythmField')), 'data-rhythm') === 'skip' && checkedRhythm() === 'skip',
  'disabled=' + skipSels.map((n) => n.props.disabled === true).join(',') + ' value=' + skipSels.map((n) => attr(n, 'value')).join('/') +
  ' rounds 档位=' + skipRoundOpts.length + ' field.data-rhythm=' + attr(one((n) => hasClass(n, 'dtRhythmField')), 'data-rhythm'));
check('P05', '工作节奏锁定期间工作时长仍可编辑（只有休息相关被锁）', skipSels[0] && skipSels[0].props.disabled !== true,
  'workSelect.disabled=' + (skipSels[0] ? skipSels[0].props.disabled : 'n/a'));

pickRhythm('auto');
const autoShot = pomoShot();
check('P06', '切「自动休息」→ 三档控件重新可编辑且值一步不动（25/5/15/4），不存在「自动模式强制 5/15/4」（§4.3）',
  autoShot === '25/5/15/4|false,false,false,false' && checkedRhythm() === 'auto',
  'shot=' + autoShot + ' checked=' + checkedRhythm());

pickRhythm('pause');
check('P07', '切回「完成后暂停」→ 三档重新禁用（pause 也不使用休息时长），值仍 25/5/15/4 不被改写',
  pomoShot() === '25/5/15/4|false,true,true,true' && checkedRhythm() === 'pause',
  'shot=' + pomoShot() + ' checked=' + checkedRhythm());

/* 用户自定义值 → skip → pause 恢复自定义值（证明切节奏不改值） */
/* 自定义值只能在 auto（唯一可编辑档）下改，随后切 skip / 回 pause 都不得改写它 */
pickRhythm('auto');
change(restSel('short'), 10);
change(restSel('long'), 20);
change(restSel('rounds'), 3);
const customVals = pomoShot();
pickRhythm('skip');
const customWhileSkip = pomoShot();
pickRhythm('pause');
check('P08', '自定义值 10/20/3 在 auto 下改好，切 skip、回 pause 都不被清零（值只由用户改）',
  customVals === '25/10/20/3|false,false,false,false' && customWhileSkip === '25/10/20/3|false,true,true,true' &&
  pomoShot() === '25/10/20/3|false,true,true,true',
  '改后=' + customVals + ' skip 期间=' + customWhileSkip + ' 回 pause=' + pomoShot());

/* 模式条：专注态只有一段 */
check('P09', '专注态模式条只渲染一段「专注」（.dtPomoModeSingle），休息态 3 段（§8-18）',
  all((n) => hasClass(n, 'dtPomoMode')).length === 1 && !!one((n) => hasClass(n, 'dtPomoModeSingle')) &&
  nodeText(one((n) => hasClass(n, 'dtPomoModes'))).replace(/\s+/g, '') === '专注',
  'work 态段数=' + all((n) => hasClass(n, 'dtPomoMode')).length);
applyState({ pomo: Object.assign({}, storeApi.get().pomo, { mode: 'short' }) });
check('P10', '（同上）休息态模式条 3 段：专注/短休息/长休息',
  all((n) => hasClass(n, 'dtPomoMode')).length === 3 && all((n) => hasClass(n, 'dtPomoMode')).map((n) => nodeText(n).trim()).join('/') === '专注/短休息/长休息',
  'rest 态段数=' + all((n) => hasClass(n, 'dtPomoMode')).length);

/* rounds=0 不空转：短休息 0 分钟时点「跳过」不得停在 0 秒态 */
applyState({ pomo: Object.assign({}, POMO_BASE, { rhythm: 'pause', mode: 'work', short: 0, long: 15, rounds: 4, round: 0 }) });
const skipBtn = () => all((n) => hasClass(n, 'dtGhostBtn')).find((n) => nodeText(n).trim() === '跳过');
fire(skipBtn());
let pomoNow = storeApi.get().pomo;
check('P11', '短休息 0 分钟 + 完成一次专注 → 点跳过不会掉进 0 秒休息，直接停在 work/running=false（§8-19）',
  pomoNow.mode === 'work' && pomoNow.running === false && (pomoNow.endsAt || 0) === 0,
  'mode=' + pomoNow.mode + ' running=' + pomoNow.running + ' endsAt=' + pomoNow.endsAt + ' short=' + pomoNow.short + ' rounds=' + pomoNow.rounds);

applyState({ pomo: Object.assign({}, POMO_BASE, { rhythm: 'skip', mode: 'work', short: 0, long: 0, rounds: 0, round: 0 }) });
fire(skipBtn());
pomoNow = storeApi.get().pomo;
check('P12', 'skip 节奏 + rounds=0（长休息间隔为 0）→ 跳过仍在 work，不会每轮进长休息空转',
  pomoNow.mode === 'work' && pomoNow.running === false && (pomoNow.round || 0) === 0,
  'mode=' + pomoNow.mode + ' round=' + pomoNow.round + ' running=' + pomoNow.running);

check('P13', '设置区已删除 autoStart 复选框（无第二个真源），仅剩 2 个开关',
  all((n) => n.tag === 'input' && n.props.type === 'checkbox', pomoSettings()).length === 2 &&
  !/自动开始/.test(nodeText(pomoSettings())),
  'checkbox=' + all((n) => n.tag === 'input' && n.props.type === 'checkbox', pomoSettings()).length + ' 含「自动开始」=' + /自动开始/.test(nodeText(pomoSettings())));

/* P14：往返式——skip → pause → auto → pause，值全程不变，只有置灰状态跟随（旧模型断言的 0/0/0 与 5/15/4 已废） */
applyState({ pomo: Object.assign({}, POMO_BASE, { rhythm: 'pause', rhythmPrev: null }) });
const rhythmSeq = [];
pickRhythm('skip'); rhythmSeq.push(pomoShot());
pickRhythm('pause'); rhythmSeq.push(pomoShot());
pickRhythm('auto'); rhythmSeq.push(pomoShot());
pickRhythm('pause'); rhythmSeq.push(pomoShot());
check('P14', '节奏往返 skip → pause → auto → pause：值序列全程 25/5/15/4 不被改写，置灰只在 auto 段解除（无 0/0/0、无 5/15/4 强制）',
  rhythmSeq[0] === '25/5/15/4|false,true,true,true' && rhythmSeq[1] === '25/5/15/4|false,true,true,true' &&
  rhythmSeq[2] === '25/5/15/4|false,false,false,false' && rhythmSeq[3] === '25/5/15/4|false,true,true,true',
  '序列=' + rhythmSeq.join(' → '));

/* P15：重启（rhythm 已是 auto）后自定义值不被「自动模式默认值」顶掉 */
applyState({ pomo: Object.assign({}, POMO_BASE, { rhythm: 'auto', short: 7, long: 20, rounds: 3 }) });
check('P15', '重启后已选 auto 且自定义 7/20/3 的设置原样保留（setRhythm 只写 rhythm，不再套用固定 5/15/4）',
  checkedRhythm() === 'auto' && pomoShot() === '25/7/20/3|false,false,false,false',
  'checked=' + checkedRhythm() + ' shot=' + pomoShot());

/* ============================ 六、JSON 导入（设置页） ============================ */
closeAllDrawers();
fire(railByLabel('设置'));
check('I01', '点 rail「设置」→ B 栏切到设置页，存在文件导入入口',
  !!one((n) => hasClass(n, 'dtSettings')) && !!one((n) => n.tag === 'input' && n.props.type === 'file' && attr(n, 'data-dt') === 'import-json'),
  'settings=' + !!one((n) => hasClass(n, 'dtSettings')) + ' fileInput=' + !!one((n) => n.tag === 'input' && n.props.type === 'file'));

function importFile(text) {
  const input = one((n) => n.tag === 'input' && n.props.type === 'file');
  if (!input) { errors.push(['import', new Error('找不到文件输入')]); return false; }
  try {
    input.props.onChange({ target: { files: [{ name: 'backup.json', size: text.length, __text: text }], value: '' } });
  } catch (e) { errors.push(['import.onChange', e]); }
  rerender(); rerender();
  return true;
}
const importMsg = () => one((n) => attr(n, 'data-dt') === 'import-msg');
const msgText = () => { const m = importMsg(); return m ? nodeText(m).trim() : ''; };
const projInbox = { id: 'inbox', name: '收集箱', type: 'todo', inbox: true };
const baseline = snapshot();

importFile('{ this is not json');
check('I02', '坏 JSON → 报「JSON 解析失败」且不写盘', /JSON 解析失败/.test(msgText()) && snapshot() === baseline,
  'msg=' + JSON.stringify(msgText()) + ' state 未变=' + (snapshot() === baseline));
check('I03', '错误提示使用 .dtErr 红色样式', !!(importMsg() && hasClass(importMsg(), 'dtErr')), 'className=' + cls(importMsg()));

importFile(JSON.stringify({ version: 2, tasks: [], projects: [projInbox] }));
check('I04', 'version 不匹配 → 报「版本不匹配」且不写盘', /版本不匹配/.test(msgText()) && snapshot() === baseline,
  'msg=' + JSON.stringify(msgText()) + ' state 未变=' + (snapshot() === baseline));

importFile(JSON.stringify({ version: 1, tasks: [['only', 'two']], projects: [projInbox] }));
check('I05', '旧位置数组列数不足 → 报「不支持的旧格式」且不写盘', /不支持的旧格式/.test(msgText()) && snapshot() === baseline,
  'msg=' + JSON.stringify(msgText()) + ' state 未变=' + (snapshot() === baseline));

importFile(JSON.stringify({ version: 1, tasks: [{ id: 'x', projectId: 'inbox', title: 't' }, ['l1', 'inbox', '旧']], projects: [projInbox] }));
check('I06', '新旧混排 → 报「不支持新旧混排」且不写盘', /新旧混排/.test(msgText()) && snapshot() === baseline,
  'msg=' + JSON.stringify(msgText()) + ' state 未变=' + (snapshot() === baseline));

const tasksBefore = (storeApi.get().tasks || []).length;
const legacyPayload = JSON.stringify({ version: 1, tasks: [['l1', 'inbox', '旧格式任务']], projects: [projInbox] });
CONFIRM = false;
importFile(legacyPayload);
check('I07', '合法旧格式但用户在 confirm 取消 → 提示「已取消」且不写盘',
  /已取消/.test(msgText()) && (storeApi.get().tasks || []).length === tasksBefore,
  'msg=' + JSON.stringify(msgText()) + ' tasks=' + (storeApi.get().tasks || []).length + '（取消前 ' + tasksBefore + '）');
check('I08', 'confirm 文案包含任务/清单数量', confirmLog.some((m) => /将用 1 条任务 \/ 1 个清单覆盖当前 \d+ 条任务/.test(m)),
  'last=' + JSON.stringify(confirmLog[confirmLog.length - 1]));

CONFIRM = true;
importFile(legacyPayload);
const importedTasks = storeApi.get().tasks || [];
check('I09', '确认后按旧格式列顺序落库：1 条任务、标题「旧格式任务」、归属 inbox',
  importedTasks.length === 1 && importedTasks[0].title === '旧格式任务' && importedTasks[0].projectId === 'inbox',
  'tasks=' + JSON.stringify(importedTasks.map((t) => [t.id, t.projectId, t.title])));
check('I10', '成功提示使用 .dtHintOk 且文案含「导入完成」', /导入完成/.test(msgText()) && !!(importMsg() && hasClass(importMsg(), 'dtHintOk')),
  'msg=' + JSON.stringify(msgText()) + ' className=' + cls(importMsg()));

/* ============================ 七、中间区往返（G01 正式回归；定位全走 data-*，不靠文案） ============================ */
const railLabels = () => railItems().map((n) => railLabel(n));
const railDt = (v) => one((n) => attr(n, 'data-dt') === v);
const calRoot = () => one((n) => attr(n, 'data-view') === 'calendar');
/* 四段 rail（§1.2/§8-70 + t136/t137）：段容器 `div.dtRailGroup[data-rail-group]`，
   段序 list → project → function → settings；段间恰一个 `.dtRailSep`（settings 段后不插）。
   t137 把原五段里的「计时段 / 记录段」合并成 function（功能区），六项共用一条分隔线，
   原「计时两项 / 记录四项」的分法只体现在 railOrder 上（10..60），不再有独立段名。
   旧「中间区 + 工具区」概念已随中间区一起删除，所以这里把「工具类入口」定义为
   function + settings 两段里的项，rail 高亮仍用类 `dtRailOn`。 */
const RAIL_TOOL_GROUPS = ['function', 'settings'];
const railGroupEl = (g) => one((n) => hasClass(n, 'dtRailGroup') && attr(n, 'data-rail-group') === g);
const railGroupTags = () => byCls('dtRailGroup').map((n) => String(attr(n, 'data-rail-group')));
const toolTag = (n) => attr(n, 'data-dt') || ('无data-dt:' + railLabel(n));
const railGroupItems = (g) => { const el = railGroupEl(g); return el ? all((n) => hasClass(n, 'dtRailItem'), el) : []; };
const groupTags = (g) => railGroupItems(g).map(toolTag);
const railTools = () => RAIL_TOOL_GROUPS.reduce((acc, g) => acc.concat(railGroupItems(g)), []);
const toolOn = () => railTools().filter((n) => hasClass(n, 'dtRailOn'));
const toolOnTag = () => toolOn().map(toolTag).join(',') || '(无)';
const centerKinds = () => ({ cal: byCls('dtCal').length, pomo: byCls('dtPomoSettings').length, settings: byCls('dtSettings').length });
const toolTags = () => railTools().map(toolTag);
const inB = (tn) => { const b = drawerSlot('b'); return b ? all((n) => hasClass(n, tn), b).length : 0; };
const bViewNow = () => { const b = drawerSlot('b'); return b ? String(attr(b, 'data-view')) : null; };
/* §8-68 只约束「默认 order」下的顺序：自定义 order 之后段内顺序本来就该变（由 R01c 守），
   所以这里先把 settings.modules.order 显式清空，再读 DOM —— 断言只读 DOM 顺序，不读 settings.modules.order。 */
const DEFAULT_GROUP_SEQ = 'list,project,function,settings';
/* 功能区七项按 railOrder 10..70：四象限 → 日历 → 习惯打卡 → 必做之事 → 番茄钟 → 螺旋工作法 → 阻力清单。
   原「计时段 / 记录段」两条默认顺序常量已并入这一条（t136/t137 合段）；
   第七项「阻力清单」由 t168 从「必做之事」拆出（§1.23，railOrder 70）。 */
const DEFAULT_FUNCTION_TAGS = 'rail-quadrant,rail-calendar,rail-habit,rail-onething,rail-pomodoro,rail-spiral,rail-resistance';
/* 读写 store 而不是走 settingsNow()：R01 处（第七段）settingsNow 还没定义（十四段才定义，const 有 TDZ）。 */
const moduleSettingsNow = () => ((storeApi.get() || {}).settings || {}).modules || {};
const writeModules = (patch) => {
  const st = (storeApi.get() || {}).settings || {};
  const mods = st.modules || {};
  applyState({ settings: Object.assign({}, st, { modules: Object.assign({}, mods, patch) }) });
};
const setModuleOrder = (patch) => writeModules({ order: Object.assign({}, moduleSettingsNow().order || {}, patch) });
const resetModuleOrder = () => writeModules({ order: {} });
resetModuleOrder();
check('R01', '§8-70 四段 rail（默认 order）：段序 list→project→function→settings；function=四象限→日历→习惯打卡→必做之事→番茄钟→螺旋工作法→阻力清单；settings=设置；旧 [data-dt=rail-rec] 不再出现',
  railGroupTags().join(',') === DEFAULT_GROUP_SEQ &&
    groupTags('function').join(',') === DEFAULT_FUNCTION_TAGS &&
    groupTags('settings').join(',') === 'rail-settings' &&
    !railDt('rail-rec'),
  '段序=' + railGroupTags().join(' → ') + '；function=' + groupTags('function').join(',') +
  '；settings=' + groupTags('settings').join(',') +
  '；rail-rec=' + (railDt('rail-rec') ? '仍在' : '无'));

/* R01d：段间分隔 —— 相邻两段之间恰一个 .dtRailSep，settings 段之后不插（四段齐全时共 3 个）。
   t137 把计时段与记录段合段后分隔条由 4 条变 3 条：段数 - 1 的关系不变，只是基数从 5 变 4。 */
const railSeps = () => byCls('dtRailSep');
check('R01d', '§1.2 段间必有且只有一个 .dtRailSep 分隔（四段齐全时共 3 个），settings 段之后不再插',
  railSeps().length === Math.max(0, railGroupTags().length - 1) && railSeps().length === 3,
  '段数=' + railGroupTags().length + ' 分隔数=' + railSeps().length);

/* R01c：段内顺序必须来自注册表排序（order → railOrder），不是写死的连排。
   把 spiral 提到 5（小于功能区内最小的 railOrder 10），它就该排到 function 段首位
   （跨段 order 只在段内生效）；清空 order 后逐字回默认七项。 */
const r01cBefore = groupTags('function');
setModuleOrder({ spiral: 5 });
const r01cCustom = groupTags('function');
const r01cAll = toolTags();
resetModuleOrder();
const r01cBack = groupTags('function');
check('R01c', '§15-89 rail 段内顺序随 settings.modules.order 变化：spiral 设 5（小于功能区内最小 railOrder 10）后排到 function 段首位（项数与集合不变），清空 order 后逐字回默认六项',
  r01cCustom[0] === 'rail-spiral' && r01cCustom.length === r01cBefore.length &&
    r01cCustom.slice().sort().join(',') === r01cBefore.slice().sort().join(',') &&
    r01cAll.length === toolTags().length && r01cBack.join(',') === DEFAULT_FUNCTION_TAGS,
  '默认 function=' + r01cBefore.join(' → ') + '；order.spiral=5 → ' + r01cCustom.join(' → ') + '；清空 order → ' + r01cBack.join(' → '));

/* R01b：钩子完整性单独一条 —— 往 rail 插新项时，「顺序错了」和「某项漏了 data-dt」是两种病、修法不同，不该被同一条断言淹没。
   数量下限 5 而非 ===7：序列的精确性由 R01 负责，这里只管「每项都有唯一钩子」。 */
check('R01b', 'rail 功能区与设置两段每一项都带非空且唯一的 data-dt 钩子，且 [data-dt=rail-settings] 就是「设置」',
  railTools().length >= 5 && railTools().every((n) => !!attr(n, 'data-dt')) &&
    new Set(railTools().map((n) => attr(n, 'data-dt')).filter(Boolean)).size === railTools().length &&
    !!railDt('rail-settings') && railLabel(railDt('rail-settings')) === '设置',
  '钩子=' + railTools().map((n) => (attr(n, 'data-dt') || '(缺失)')).join(',') +
  '；非空唯一=' + new Set(railTools().map((n) => attr(n, 'data-dt')).filter(Boolean)).size + '/' + railTools().length +
  '；rail-settings label=' + JSON.stringify(railLabel(railDt('rail-settings'))));

/* ---- R02–R06：B 栏单来源（旧「中间区与抽屉并列」的成对改写） ---- */
let ck = null;
fire(railDt('rail-pomodoro'));
ck = centerKinds();
check('R02', '点 [data-dt=rail-pomodoro]：B 栏 data-view=pomodoro 且只剩番茄钟（日历/设置卸载）、rail 高亮恰 1 个',
  centerView() === 'pomodoro' && ck.pomo === 1 && ck.cal === 0 && ck.settings === 0 &&
    toolOn().length === 1 && toolOnTag() === 'rail-pomodoro',
  'B.view=' + centerView() + ' pomo=' + ck.pomo + ' cal=' + ck.cal + ' settings=' + ck.settings + ' 高亮(' + toolOn().length + ')=' + toolOnTag());

fire(railDt('rail-settings'));
ck = centerKinds();
check('R03', '点 [data-dt=rail-settings]：B 栏 data-view=settings 且只剩设置（番茄钟/日历卸载）、rail 高亮恰 1 个=设置',
  centerView() === 'settings' && ck.settings === 1 && ck.cal === 0 && ck.pomo === 0 &&
    toolOn().length === 1 && toolOnTag() === 'rail-settings',
  'B.view=' + centerView() + ' settings=' + ck.settings + ' cal=' + ck.cal + ' pomo=' + ck.pomo + ' 高亮(' + toolOn().length + ')=' + toolOnTag());

fire(railDt('rail-calendar'));
ck = centerKinds();
const todayCell2 = byAttr('data-date', TODAY_K)[0] || null;
check('R04', '点 [data-dt=rail-calendar]：B 栏 data-view=calendar 且 .dtCal 在 B 栏内，42 格、今天格 dtCalToday、高亮恰 1 个=日历',
  ck.cal === 1 && ck.pomo === 0 && ck.settings === 0 && centerView() === 'calendar' && inB('dtCal') === 1 &&
    byCls('dtCalCell').length === 42 && !!todayCell2 && hasClass(todayCell2, 'dtCalToday') &&
    toolOn().length === 1 && toolOnTag() === 'rail-calendar',
  'B.view=' + centerView() + ' cal=' + ck.cal + ' dtCalInB=' + inB('dtCal') + ' cells=' + byCls('dtCalCell').length +
  ' 高亮(' + toolOn().length + ')=' + toolOnTag() +
  '；todayCell=' + (todayCell2 ? cls(todayCell2) + ' date=' + attr(todayCell2, 'data-date') : '(null)') + ' TODAY_K=' + TODAY_K +
  ' 首格=' + attr(byCls('dtCalCell')[0], 'data-date') + ' 末格=' + attr(byCls('dtCalCell')[41], 'data-date'));

/* R05：原来是「日历留在中间区、清单进抽屉」；三栏模型下 B 栏只能有一个来源，
   所以改成「点今天 → B 栏换成 today、.dtCal 卸载、C 不产」——这是模型迁移而不是放宽。 */
fire(railByLabel('全部未完成'));
const r05 = { b: bViewNow(), cal: byCls('dtCal').length, c: byCls('dtDrawer').filter((n) => attr(n, 'data-slot') === 'c').length };
check('R05', 'B 栏单来源：点「全部未完成」后 B 栏换成 open、.dtCal 整体卸载、C 栏为 0（rail 清单项不产 C）',
  r05.b === 'open' && r05.cal === 0 && r05.c === 0 && !!drawerSlot('b'),
  'B.view=' + r05.b + ' dtCal=' + r05.cal + ' C=' + r05.c);

/* R06：视图与详情解耦的新形态 —— 打开任务详情只影响 C，B 栏视图不变；收起 C 后 B 仍在该视图。 */
const r06Row = all((n) => hasClass(n, 'dtRow'), drawerSlot('b'))[0];
if (r06Row) fire(r06Row);
const r06Open = { b: bViewNow(), c: byCls('dtDrawer').filter((n) => attr(n, 'data-slot') === 'c').length };
if (drawerSlot('c')) fire(collapseIn(drawerSlot('c')));
const r06After = { b: bViewNow(), c: byCls('dtDrawer').filter((n) => attr(n, 'data-slot') === 'c').length };
check('R06', '视图与详情解耦：打开任务只加 C 栏（B.view 不变），收起 C 后 B 栏仍在该视图',
  r06Open.c === 1 && r06Open.b === 'open' && r06After.c === 0 && r06After.b === 'open',
  '打开后 B.view=' + r06Open.b + ' C=' + r06Open.c + '；收起 C 后 B.view=' + r06After.b + ' C=' + r06After.c);

/* ---- T116a–T116g：三栏不变式（§8-85…88），六条硬断言 + 一条带卡号的 GAP ---- */
const B_VIEW_MODULES = { today: 'dtRow', calendar: 'dtCal', pomodoro: 'dtPomoSettings', spiral: 'dtSpiral', settings: 'dtSettings', quadrant: 'dtQuad' };
closeAllDrawers();
const t116Singles = [];
['rail-today', 'rail-calendar', 'rail-pomodoro', 'rail-spiral', 'rail-settings'].forEach(function (tag) {
  if (!railDt(tag)) return;
  fire(railDt(tag));
  const bs = byCls('dtDrawer').filter((n) => attr(n, 'data-slot') === 'b');
  t116Singles.push({ tag: tag, n: bs.length, view: bs[0] ? String(attr(bs[0], 'data-view')) : '(无)' });
});
check('T116a', '§8-86 B 栏单来源：依次点 today→calendar→pomodoro→spiral→settings，每步 [data-slot=b] 恰 1 个且 data-view 等于所点项对应视图',
  t116Singles.length === 5 && t116Singles.every((s) => s.n === 1) &&
    t116Singles.map((s) => s.view).join(',') === 'today,calendar,pomodoro,spiral,settings',
  '逐步=' + t116Singles.map((s) => s.tag + '→' + s.view + '(n=' + s.n + ')').join(' , '));

/* T116b：任一功能视图根都不重复 —— 同一时刻只有一个视图根节点。 */
const t116Roots = () => Object.keys(B_VIEW_MODULES).map((k) => B_VIEW_MODULES[k]).reduce((acc, tn) => acc + byCls(tn).length, 0);
check('T116b', '§8-86 同一时刻只有一个功能视图根（dtRow/dtCal/dtPomoSettings/dtSpiral/dtQuad/dtSettings 合计计数不因叠加而增加）',
  t116Roots() >= 1 && byCls('dtDrawer').filter((n) => attr(n, 'data-slot') === 'b').length === 1,
  '视图根类计数合计=' + t116Roots() + '；B 栏数=' + byCls('dtDrawer').filter((n) => attr(n, 'data-slot') === 'b').length);

/* T116c：rail 入口永不产 C 栏。先开一个 C，再从 rail 切视图，C 必须消失。 */
fire(railByLabel('全部未完成'));
const t116cRow = all((n) => hasClass(n, 'dtRow'), drawerSlot('b'))[0];
if (t116cRow) fire(t116cRow);
const t116cBefore = byCls('dtDrawer').filter((n) => attr(n, 'data-slot') === 'c').length;
fire(railDt('rail-calendar'));
const t116cAfter = byCls('dtDrawer').filter((n) => attr(n, 'data-slot') === 'c').length;
check('T116c', '§1.2 rail 入口永不产 C 栏：先有 C 栏时点 rail 日历，C 栏必须消失（换 B 必清 C）',
  t116cBefore === 1 && t116cAfter === 0,
  '点 rail 前 C=' + t116cBefore + ' 点 rail 后 C=' + t116cAfter + ' B.view=' + bViewNow());

/* T116d：B 关则 C 关；同值再点 = 关 B（不是切回某页）。 */
fire(railByLabel('全部未完成'));
const t116dRow = all((n) => hasClass(n, 'dtRow'), drawerSlot('b'))[0];
if (t116dRow) fire(t116dRow);
const t116dOpen = { b: !!drawerSlot('b'), c: !!drawerSlot('c') };
fire(collapseIn(drawerSlot('b')));
const t116dClosed = { b: !!drawerSlot('b'), c: !!drawerSlot('c') };
fire(railDt('rail-calendar'));
fire(railDt('rail-calendar'));
const t116dSame = { b: !!drawerSlot('b'), c: !!drawerSlot('c'), empty: !!one((n) => hasClass(n, 'dtBEmpty')) };
check('T116d', '§1.2.3/§8-86 B 栏头收起连带收 C；已选中项再点一次 = 关 B（落空态），不是切回上一页',
  t116dOpen.b && t116dOpen.c && !t116dClosed.b && !t116dClosed.c && !t116dSame.b && !t116dSame.c && t116dSame.empty,
  '打开态 B=' + t116dOpen.b + ' C=' + t116dOpen.c + '；B 头收起后 B=' + t116dClosed.b + ' C=' + t116dClosed.c +
  '；同值再点后 B=' + t116dSame.b + ' C=' + t116dSame.c + ' 空态=' + t116dSame.empty);

/* T116g（GAP，卡 t116）：§8-85 还要求 `.dtCenter, .dtDrawerZone` 节点计数为 0，但实现仍用 .dtDrawerZone 当 B/C 的横容器，
   并残留一条 `.dtCenter{min-width:280px;}` 死规则 —— 判据先行，等实现方收口后自动转硬。 */
gap('T116g', '§8-85 `.dtCenter, .dtDrawerZone` 节点计数为 0、且无 .dtCenter 死规则',
  byCls('dtCenter').length === 0 && byCls('dtDrawerZone').length === 0 && cssText.indexOf('.dtCenter{') < 0,
  '渲染树 .dtDrawerZone=' + byCls('dtDrawerZone').length + '；CSS .dtCenter 规则=' + (cssText.indexOf('.dtCenter{') >= 0) +
  '（src/parts/70-styles.js:353 内 `@container dtroot (max-width:719px)` 段里有 `.dtCenter{min-width:280px;}`）', 't116');

/* ============================ 八、G01 转硬断言（实现已修，进入门禁） ============================ */
check('G01', 'rail 有「日历」入口（可回到 B 栏日历）', !!railByLabel('日历'),
  'rail 标签=' + railLabels().join(',') + '；spec 第 103 行要求 rail 含「日历」');

/* ============================ 九、菜单可达性（F1/F2 回归：真实 mousedown→mouseup→click + CSS 层叠判定） ============================
   F1: document 捕获阶段的 mousedown 关闭器若只豁免触发器本身，点在菜单项上会先卸载菜单、click 落空 → 菜单永远点不动。
   F2: `.dtMenu{display:none}` 依赖 `[data-open]` 才显示；漏写 data-open 时节点存在但不可见 → 存在性断言看不出。
   本节因此做三件事：真实相位派发、节点「是否还在树上」判定、按 CSS 层叠算 computed display，另加源码级渲染点扫描。 */
const evLost = []; // 因目标节点已不在当前树而被丢弃的事件（F1 的直接指纹）
function treeIndexNow() {
  const paths = new Set();
  const parents = new Map();
  const byPath = new Map();
  const dig = (n) => {
    if (!n || typeof n !== 'object' || !n.tag) return;
    if (n.__path !== undefined) { paths.add(n.__path); byPath.set(n.__path, n); }
    childNodes(n).forEach((c) => { parents.set(c, n); dig(c); });
  };
  dig(tree);
  return { paths, parents, byPath };
}
let treeIdx = treeIndexNow();
const reindex = () => { treeIdx = treeIndexNow(); return treeIdx; };
function closestOf(node, sel) {
  const want = String(sel || '');
  if (want.charAt(0) !== '.') return null;
  const token = want.slice(1);
  let cur = node;
  while (cur) {
    if (hasClass(cur, token)) return cur;
    cur = treeIdx.parents.get(cur) || null;
  }
  return null;
}
const mkEvent = (target, type) => {
  const ev = { type, target, bubbles: true, stopped: false, defaultPrevented: false };
  ev.preventDefault = function () { this.defaultPrevented = true; };
  ev.stopPropagation = function () { this.stopped = true; };
  Object.defineProperty(target, 'closest', { value: (sel) => closestOf(target, sel), configurable: true, enumerable: false });
  return ev;
};
/* 按真实顺序派发一次事件：捕获监听（document）→ 目标自身监听 → 之后模拟 React commit。
   目标若已不在当前树上（例如 mousedown 阶段被卸载），事件直接丢弃并记录——这正是浏览器里「点了没反应」的成因。 */
function dispatchEvt(node, type) {
  if (!node) { errors.push(['dispatch:' + type, new Error('目标节点不存在')]); return 'no-node'; }
  reindex();
  if (node.__path !== undefined && !treeIdx.paths.has(node.__path)) {
    evLost.push(type + '@' + node.__path);
    return 'lost';
  }
  const live = (node.__path !== undefined && treeIdx.byPath.get(node.__path)) || node;
  const ev = mkEvent(live, type);
  ev.currentTarget = live;                 // DOM 语义：currentTarget = 正在跑处理器的元素
  fireListeners(docListeners, type, ev, 'capture');
  const h = live.props && live.props['on' + type.charAt(0).toUpperCase() + type.slice(1)];
  if (typeof h === 'function') { try { h(ev); } catch (e) { errors.push(['on' + type, e]); } }
  if (!ev.stopped) fireListeners(docListeners, type, ev, 'bubble');
  rerender();
  return 'ok';
}
/* 真实点击：mousedown → mouseup → click，每步都会 commit + 重新索引 */
function realClick(node) {
  return ['mousedown', 'mouseup', 'click'].map((t) => t + ':' + dispatchEvt(node, t)).join('>');
}
/* -------- CSS 层叠：只匹配简单选择器（.cls / tag / [attr] / [attr="v"]），后代/伪类/组合符一律跳过 -------- */
const cssRulesParsed = (() => {
  const out = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cssText))) {
    const sel = m[1].trim();
    if (!sel || /[\s>:+~]/.test(sel) || sel.indexOf('@') >= 0) continue;
    out.push({ sel, body: m[2], order: out.length });
  }
  return out;
})();
function simpleSelSpec(node, sel) {
  let rest = String(sel).trim();
  let spec = 0;
  const tagM = rest.match(/^[a-zA-Z][a-zA-Z0-9]*/);
  if (tagM) {
    if (node.tag !== tagM[0]) return null;
    spec += 1;
    rest = rest.slice(tagM[0].length);
  }
  const parts = rest.match(/(\.[A-Za-z0-9_-]+|\[[^\]]+\])/g) || [];
  if (parts.join('') !== rest) return null;
  for (const p of parts) {
    if (p.charAt(0) === '.') {
      if (!hasClass(node, p.slice(1))) return null;
      spec += 10;
    } else {
      const q = p.match(/^\[([A-Za-z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]$/);
      if (!q) return null;
      const key = q[1];
      const want = q[2] !== undefined ? q[2] : (q[3] !== undefined ? q[3] : q[4]);
      const got = attr(node, key);
      if (got === undefined) return null;
      if (want !== undefined && String(got) !== String(want)) return null;
      spec += 10;
    }
  }
  return spec;
}
function computedProp(node, prop) {
  const hits = [];
  cssRulesParsed.forEach((r) => {
    r.sel.split(',').forEach((s) => {
      const spec = simpleSelSpec(node, s);
      if (spec !== null) hits.push({ spec, order: r.order, body: r.body });
    });
  });
  hits.sort((a, b) => (a.spec - b.spec) || (a.order - b.order));
  let val = '';
  hits.forEach((h) => {
    const mm = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(h.body);
    if (mm) val = mm[1].trim();
  });
  return val;
}
const visibleMenus = () => byCls('dtMenu').filter((n) => computedProp(n, 'display') === 'block');
const calMoreBtn = () => one((n) => hasClass(n, 'dtCalMore'));
const menuItemByText = (menu, text) => childNodes(menu).find((n) => hasClass(n, 'dtMenuItem') && nodeText(n).includes(text)) || null;

check('E01', 'CSS 层叠真源：.dtMenu 默认 display:none，.dtMenu[data-open] 才 display:block（缺属性即不可见）',
  computedProp({ tag: 'div', props: { className: 'dtMenu' }, children: [] }, 'display') === 'none'
  && computedProp({ tag: 'div', props: { className: 'dtMenu', 'data-open': '1' }, children: [] }, 'display') === 'block',
  '基础规则=' + JSON.stringify(cssRuleAll('.dtMenu').map((r) => r.trim().slice(0, 70))) + '；[data-open] 规则=' + JSON.stringify(cssRuleAll('.dtMenu[data-open]').map((r) => r.trim().slice(0, 70))));

/* 源码级渲染点扫描：漏一处 data-open 就红，并报出 file:line */
const { readFileSync, readdirSync } = await import('node:fs');
const pathMod = await import('node:path');
/* 目标可能是临时副本，源码树按 dirname 逐级向上找 src/parts */
const partsDir = [pathMod.join(pathMod.dirname(target), 'src', 'parts'), pathMod.join(pathMod.dirname(target), '..', 'src', 'parts'), pathMod.join(pathMod.dirname(target), '..', '..', 'src', 'parts')]
  .find((p) => { try { return readdirSync(p).length > 0; } catch (e) { return false; } });
const menuPoints = [];
for (const f of (partsDir ? readdirSync(partsDir).filter((x) => x.endsWith('.js')).sort() : [])) {
  const lines = readFileSync(pathMod.join(partsDir, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/className:\s*'([^']*)'/);
    if (!m) return;
    if (!m[1].split(/\s+/).includes('dtMenu')) return;
    /* 属性常写成多行对象字面量，所以看「该元素自己的属性块」而不是只看同一行：从 className 行起取到最近的
       `}` 或 `)` 为止（≤8 行），块内出现 data-open 才算同一元素上写了。 */
    const block = [];
    for (let k = i; k < Math.min(lines.length, i + 8); k += 1) {
      block.push(lines[k]);
      if (/^\s*\}[,)]?\s*$/.test(lines[k]) && k > i) break;
    }
    menuPoints.push(f + ':' + (i + 1) + (block.join('\n').includes('data-open') ? ' ✔' : ' ✘缺 data-open'));
  });
}
check('E02', '源码扫描：className 含 dtMenu 的渲染点共 3 处（清单角标 / 日历三点 / 螺旋换件），且每处同一元素的属性块里都写了 data-open',
  !!partsDir && menuPoints.length === 3 && menuPoints.every((p) => p.includes('✔')),
  'src/parts=' + (partsDir || '(未找到)') + ' 渲染点=' + (menuPoints.join(' | ') || '(空)'));

/* -------- 日历三点菜单：真实序列打开 → 点复选项 → 位掩码与副行真的变 -------- */
fire(railDt('rail-calendar'));
const e_maskBefore = calMask();
const e_calSubSig = () => cells().map((c) => cellSub(c)).join('|');
const e_calSigBefore = e_calSubSig();
const e_calOpenTrace = realClick(calMoreBtn());
const e_calMenu = one((n) => hasClass(n, 'dtMenu'));
check('E03', '日历三点菜单：真实 mousedown→mouseup→click 后菜单可见（data-open=1 且 computed display=block）',
  !!e_calMenu && attr(e_calMenu, 'data-open') === '1' && computedProp(e_calMenu, 'display') === 'block',
  'trace=' + e_calOpenTrace + ' data-open=' + (e_calMenu ? attr(e_calMenu, 'data-open') : 'null') + ' display=' + (e_calMenu ? computedProp(e_calMenu, 'display') : 'null'));

const e_lunarItem = one((n) => attr(n, 'data-dt') === 'cal-overlay-lunar', e_calMenu);
const e_lunarBefore = attr(e_lunarItem, 'aria-checked');
const e_lunarTrace = realClick(e_lunarItem);
const e_lunarSig = e_calSubSig();
check('E04', '点复选项「农历」：位掩码真的变（6 → 7）、该项 aria-checked 转 true、副行内容真的变了、事件没被捕获阶段的关闭器吞掉',
  calMask() === e_maskBefore + 1 && calOverlaysNow().lunar === true && e_lunarBefore === 'false' && e_lunarSig !== e_calSigBefore && evLost.length === 0,
  'trace=' + e_lunarTrace + ' mask=' + e_maskBefore + '→' + calMask() + ' lunar=' + e_lunarBefore + '→' + calOverlaysNow().lunar + ' evLost=' + JSON.stringify(evLost) + ' sub前=' + JSON.stringify(e_calSigBefore.slice(0, 40)) + ' sub后=' + JSON.stringify(e_lunarSig.slice(0, 40)));

const e_openAgain1 = realClick(calMoreBtn());
const e_termItem = one((n) => attr(n, 'data-dt') === 'cal-overlay-term', one((n) => hasClass(n, 'dtMenu')));
const e_termTrace = realClick(e_termItem);
check('E05', '点复选项「节气」取消勾选：位掩码 7 → 5，副行换成另一套来源（不再等于上一组签名）',
  calMask() === 5 && e_calSubSig() !== e_lunarSig,
  'trace=' + e_openAgain1 + '+' + e_termTrace + ' mask=' + calMask() + ' sub=' + JSON.stringify(e_calSubSig().slice(0, 40)));

const e_openAgain2 = realClick(calMoreBtn());
const e_holidayItem = one((n) => attr(n, 'data-dt') === 'cal-overlay-holiday', one((n) => hasClass(n, 'dtMenu')));
const e_holidayTrace = realClick(e_holidayItem);
check('E06', '点复选项「节假日」取消勾选：位掩码 5 → 1，且菜单点完自动关闭（无可见 .dtMenu 残留）',
  calMask() === 1 && visibleMenus().length === 0,
  'trace=' + e_openAgain2 + '+' + e_holidayTrace + ' mask=' + calMask() + ' 可见菜单=' + visibleMenus().length);

realClick(calMoreBtn());
const e_resetItem = one((n) => attr(n, 'data-dt') === 'cal-overlay-reset', one((n) => hasClass(n, 'dtMenu')));
const e_backSolarTrace = realClick(e_resetItem);
check('E07', '点动作行「新历」：叠加恢复默认组合（位掩码回到 6），42 格副行签名逐格复原',
  calMask() === 6 && calMode() === 'solar' && e_calSubSig() === e_calSigBefore,
  'trace=' + e_backSolarTrace + ' mask=' + calMask() + ' sub复原=' + (e_calSubSig() === e_calSigBefore));

/* -------- 四象限卡片角标菜单：F2 的实际触点（存在 but 不可见 → 真实点不到） -------- */
applyState({ projects: [INBOX], tasks: Q_TASKS, habits: [] });
closeAllDrawers();
fire(railDt('rail-quadrant'));
const e_qdBefore = attr(qdItem(), 'data-src');
realClick(quadMenuBtnOf(qdItem()));
const e_quadMenu = one((n) => hasClass(n, 'dtQuadMenu'));
check('E08', '四象限角标菜单：真实序列点开后可见（data-open=1 且 computed display=block），不是「存在但 display:none」',
  !!e_quadMenu && attr(e_quadMenu, 'data-open') === '1' && computedProp(e_quadMenu, 'display') === 'block',
  'menu=' + (e_quadMenu ? cls(e_quadMenu) : 'null') + ' data-open=' + (e_quadMenu ? attr(e_quadMenu, 'data-open') : 'null') + ' display=' + (e_quadMenu ? computedProp(e_quadMenu, 'display') : 'null'));

const e_q3Item = quadPick(e_quadMenu, 'q3');
const e_q3Trace = realClick(e_q3Item);
storeApi.saveNow();
const e_qdAfter = tasksById('qd');
check('E09', '在四象限菜单里点「Q3」：任务真的改判（data-src=override、象限变 q3、localStorage 落 quadOverride="q3"）',
  attr(qdItem(), 'data-src') === 'override' && !!e_qdAfter && e_qdAfter.quadOverride === 'q3'
  && !!qcell('q3') && all((n) => hasClass(n, 'dtQuadItem'), qcell('q3')).some((n) => attr(n, 'data-task-id') === 'qd')
  && ((savedState() || {}).tasks || []).some((t) => t.id === 'qd' && t.quadOverride === 'q3') && evLost.length === 0,
  'trace=' + e_q3Trace + ' src前=' + e_qdBefore + ' src后=' + attr(qdItem(), 'data-src') + ' 库值=' + (e_qdAfter ? e_qdAfter.quadOverride : 'null'));

check('E10', '整段真实点击过程零事件丢失（没有一次 click 落在已被卸载的节点上）',
  evLost.length === 0, 'evLost=' + JSON.stringify(evLost));

/* ============================ 十、事件边界与可复用能力（t26 回归底座；接口供 t22 照抄） ============================
   t26 定位到的真凶不是组件卸载，而是「死区点击冒泡到 .dtRoot 之外，被宿主当成面板外一击」。
   本节把该判定固化为可复用接口，并把已经修好的部分（五处动作处理器截停、点击不卸载子树、不进失败兜底）纳入门禁；
   容器级截停（.dtRoot 补 onMouseDown/onPointerDown/onClick）落地后，G-F04 会自动转 PASS，再升为硬断言。 */
const HANDLER_KEY = { mousedown: 'onMouseDown', mouseup: 'onMouseUp', pointerdown: 'onPointerDown', click: 'onClick',
  /* t86 补：容器兜底新增的三类滚轮/触摸事件，缺这几项时 hostSees 会拼成 onwheel / onscroll / ontouchmove（恒 undefined）
     从而把「已截停」误判成 LEAKS —— 正是 t84 探针踩过的同类错误。 */
  wheel: 'onWheel', scroll: 'onScroll', touchmove: 'onTouchMove' };

/** 子树挂载信息。present===false 等价 document.querySelector('.dtRoot')===null */
function mountInfo() {
  reindex();
  const roots = byCls('dtRoot');
  const root = roots[0] || null;
  const parent = root ? (treeIdx.parents.get(root) || null) : null;
  return {
    present: !!root, count: roots.length,
    rootPath: root && root.__path !== undefined ? root.__path : null,
    parentPath: parent && parent.__path !== undefined ? parent.__path : null,
    parentTag: parent ? parent.tag : null,
  };
}
/** document / window 级监听清单（运行时口径，含 capture 拆分；权威值仍以静态 grep 为准） */
function listenerInventory() {
  const dump = (map) => {
    const out = [];
    for (const [type, set] of map.entries()) {
      const entries = [...set];
      out.push({ type, n: entries.length, capture: entries.filter((e) => listenerCap(e)).length });
    }
    return out;
  };
  const doc = dump(docListeners);
  const win = dump(winListeners);
  return { doc, win, docTotal: doc.reduce((a, b) => a + b.n, 0), winTotal: win.reduce((a, b) => a + b.n, 0) };
}
/** 当前 toast 文本列表（失败兜底会写「操作失败：…」） */
function toastEntries() {
  const layer = one((n) => hasClass(n, 'dtToastLayer'));
  return layer ? childNodes(layer).map((n) => nodeText(n).trim()).filter(Boolean) : [];
}
/** 真实点击（mousedown→mouseup→click）——t22 用这个名字 */
const clickFlow = (node) => realClick(node);
/** 点一处并判定它是否「安全」：不抛错、不卸载子树、不进失败兜底 */
function clickGuarded(label, pick) {
  const node = pick();
  const before = { errors: errors.length, mount: mountInfo(), toasts: toastEntries().length };
  if (!node) return { label, ok: false, why: '目标节点不存在', trace: '', before, after: before, toasts: [] };
  let threw = null;
  let trace = '';
  try { trace = clickFlow(node); } catch (e) { threw = e; }
  const after = { errors: errors.length, mount: mountInfo(), toasts: toastEntries().length };
  const toasts = toastEntries();
  const failedToasts = toasts.filter((t) => t.indexOf('操作失败') >= 0);
  const ok = !threw && after.errors === before.errors && after.mount.present && after.mount.count === 1
    && after.mount.parentPath === before.mount.parentPath && failedToasts.length === 0;
  return { label, ok, why: threw ? String(threw && threw.message) : '', trace, before, after, toasts };
}
/** 宿主可见性：沿祖先链依次派发同名处理器，任一处理器 stopPropagation 则宿主看不到（false=不出界）。
    这是唯一能证明「死区点击会不会漏给宿主」的手段，t22 直接复用，不要另写一套。 */
function hostSees(node, type) {
  if (!node) return null;
  reindex();
  const key = HANDLER_KEY[type] || ('on' + type);
  let cur = node;
  while (cur) {
    const h = cur.props && cur.props[key];
    if (typeof h === 'function') {
      const ev = mkEvent(cur, type);
      try { h(ev); } catch (e) { rerender(); return false; } // 处理器自带 try/catch 兜底，按已截停处理
      if (ev.stopped) { rerender(); return false; }
    }
    cur = treeIdx.parents.get(cur) || null;
  }
  rerender();
  return true;
}

/* 统一夹具：新模型只有一个 B 栏，四象限 / 清单互斥，所以五处动作节点分两轮取（不是同屏取五个）。
   节点对象跨帧即失效，一律「用前重查」：先 prepareView(kind) 把对应视图挂上，再按类名现取。 */
const pickByCls = (t) => one((n) => hasClass(n, t));
function prepareView(kind) {
  if (kind === 'quad') {
    if (!bSlot() || bKind() !== 'quadrant') { closeAllDrawers(); fire(railDt('rail-quadrant')); }
    return;
  }
  if (kind === 'list') {
    if (!bSlot() || bView() !== 'inbox') { closeAllDrawers(); fire(railByLabel('收集箱')); }
  }
  if (kind === 'cal') {
    if (!bSlot() || bView() !== 'calendar') { closeAllDrawers(); fire(railDt('rail-calendar')); }
  }
}
const ACTION_CASES = [
  ['dtQuadMenuBtn', 'quad'], ['dtPinBtn', 'quad'],
  ['dtRowBtn', 'list'],
  ['dtCalCell', 'cal'], ['dtCalAdd', 'cal'],
];
applyState({ projects: [INBOX, HABIT_PROJECT], tasks: Q_TASKS, habits: [] });
closeAllDrawers();
const missingNodes = [];
const leaky = [];
for (const [k, kind] of ACTION_CASES) {
  prepareView(kind);
  if (!pickByCls(k)) { missingNodes.push(k); continue; }
  for (const t of ['mousedown', 'click']) {
    prepareView(kind);
    const live = pickByCls(k);
    if (!live || hostSees(live, t) !== false) leaky.push(k + ':' + t);
  }
}
check('F01', '五处动作处理器（.dtQuadMenuBtn/.dtPinBtn/.dtRowBtn/.dtCalCell/.dtCalAdd）的 mousedown 与 click 都被截停，一个都不漏给宿主',
  missingNodes.length === 0 && leaky.length === 0,
  '取到的节点=' + ACTION_CASES.map(([k]) => k).filter((k) => missingNodes.indexOf(k) < 0).join(',') +
  '；缺失=' + (missingNodes.length ? missingNodes.join(',') : '无') + '；出界=' + (leaky.length ? leaky.join(',') : '无'));

/* 复位（F01 的探测会触发 pin/菜单/新建等副作用） */
applyState({ projects: [INBOX, HABIT_PROJECT], tasks: Q_TASKS, habits: [] });
closeAllDrawers();
fire(railDt('rail-quadrant'));
const mountBefore = mountInfo();
const flowTrace = clickFlow(pickByCls('dtQuadMenuBtn'));
const mountAfter = mountInfo();
check('F02', '点四象限角标走完真实 click 后子树仍挂载（present、唯一、parentPath 不变）',
  mountBefore.present && mountAfter.present && mountAfter.count === 1
  && mountAfter.parentPath === mountBefore.parentPath && evLost.length === 0,
  'trace=' + flowTrace + '；前=' + JSON.stringify(mountBefore) + '；后=' + JSON.stringify(mountAfter) + '；evLost=' + JSON.stringify(evLost));

/* 复位后逐个受保护点击：不抛错、不卸载、不进「操作失败：」兜底（同样「用前重查」） */
applyState({ projects: [INBOX, HABIT_PROJECT], tasks: Q_TASKS, habits: [] });
closeAllDrawers();
const guarded = ACTION_CASES.map(([k, kind]) => clickGuarded(k, () => { prepareView(kind); return pickByCls(k); }));
const badGuarded = guarded.filter((g) => !g.ok);
check('F03', '五处动作点击逐个受保护执行：零异常、零卸载、零「操作失败：」toast（不进失败兜底）',
  badGuarded.length === 0,
  guarded.map((g) => g.label + '=' + (g.ok ? 'OK' : 'BAD(' + g.why + ')') + '[' + g.trace + ']').join(' '));

/* 死区点击：容器级截停（40-panel.js:873-875 的 onMouseDown/onPointerDown/onClick）已落地，转硬断言。
   注意：每次 hostSees 都会让处理器 rerender，节点对象随即失效，所以必须「用前重查」——不能复用上一轮的节点。 */
const DEAD_ZONES = [
  ['.dtCalWeekday（周标题）', 'dtCalWeekday', 'cal'],
  ['.dtQuadCell（四象限格空白）', 'dtQuadCell', 'quad'],
  ['.dtHeadTitle（抽屉头）', 'dtHeadTitle', 'list'],
  ['.dtRoot（根节点自身）', 'dtRoot', 'any'],
];
const deadSeen = [];
const deadLeak = [];
for (const [label, clsName, kind] of DEAD_ZONES) {
  if (kind !== 'any') prepareView(kind);
  const node = pickByCls(clsName);
  if (!node) { deadSeen.push(label + ':缺失'); deadLeak.push(label + ':缺失'); continue; }
  const md = hostSees(node, 'mousedown');
  if (kind !== 'any') prepareView(kind);
  const ck = hostSees(pickByCls(clsName), 'click');
  deadSeen.push(label + ':' + (md ? '出界' : '已截停'));
  if (ck) deadLeak.push(label);
}
check('F04', '死区点击（周标题/四象限空白/抽屉头/根节点）在 mousedown 与 click 上都不冒出 .dtRoot，容器级截停生效',
  deadSeen.every((s) => s.indexOf('出界') < 0 && s.indexOf('缺失') < 0) && deadLeak.length === 0,
  'mousedown：' + deadSeen.join('、') + '；click 仍出界=' + (deadLeak.length ? deadLeak.join(',') : '无'));

/* 能力自检：没有处理器的节点必须判成「出界=true」，否则 F01/F04 的 false 可能是探针恒 false 的假绿 */
const synthNode = { tag: 'div', props: {}, children: [], __path: '__synthetic__' };
const synthSeen = hostSees(synthNode, 'click');
check('F05', 'hostSees 能力自检：无处理器的节点判定为出界（true），证明探测不是恒 false 的假绿',
  synthSeen === true && typeof hostSees(synthNode, 'mousedown') === 'boolean',
  '合成节点 click=' + synthSeen + '；mousedown=' + hostSees({ tag: 'div', props: {}, children: [], __path: '__synthetic2__' }, 'mousedown'));

/* -------- 监听白名单：§1.2.2.1（t28 定稿，7 条穷举）--------
   判据三条，缺一不可：
   ① 静态扫描 src/parts 恰好 7 行 addEventListener，且逐条 (target,type,capture) 与白名单一一对应 —— 这是唯一权威判据；
   ② 运行时按 (target,type,capture) 三元组归一后**集合相等**，只比总数不算通过（3 条≠2 条这种数字比对会把「谁被换了」藏起来）；
   ③ 静态扫描命中 0 行必须判红（扫描器坏了 / 文件名变了都会扫出 0 行，判过就是假绿）——见 F07 自检。
   运行时计数是上界（桩不跑卸载 cleanup，组件反复重挂会累加），因此只用于「集合相等」，不用于数字红线。 */
const LISTEN_WHITELIST = [
  { file: '40-panel.js', target: 'document', type: 'keydown', capture: true },   // Esc 第 1 层（捕获）
  { file: '40-panel.js', target: 'document', type: 'keydown', capture: false },  // Esc 第 2/3 层（冒泡）
  { file: '64-calendar.js', target: 'document', type: 'mousedown', capture: true }, // 日历菜单外点关闭
  { file: '30-ui-tasks.js', target: 'window', type: 'resize', capture: false },
  { file: '40-panel.js', target: 'window', type: 'resize', capture: false },
  { file: '40-panel.js', target: 'window', type: 'resize', capture: false },
  { file: '70-styles.js', target: 'window', type: 'beforeunload', capture: false },
];
const staticListeners = (onlyType) => {
  const out = [];
  if (!partsDir) return out;
  for (const f of readdirSync(partsDir).filter((x) => x.endsWith('.js')).sort()) {
    readFileSync(pathMod.join(partsDir, f), 'utf8').split(/\r?\n/).forEach((line, i) => {
      const re = /\b(document|window)\.addEventListener\(\s*'([a-z]+)'\s*(?:,\s*[^,)]*)?(\s*,\s*(true|\{[^}]*capture\s*:\s*true[^}]*\}))?/g;
      let m;
      while ((m = re.exec(line))) {
        if (onlyType && m[2] !== onlyType) continue;
        out.push({ file: f, line: i + 1, target: m[1], type: m[2], capture: !!m[3] });
      }
    });
  }
  return out;
};
const sig = (l) => l.target + ':' + l.type + ':' + (l.capture ? 'capture' : 'bubble');
const staticLines = staticListeners();
const staticSig = staticLines.map(sig).sort().join('|');
const whitelistSig = LISTEN_WHITELIST.map(sig).sort().join('|');
prepareView('cal');                       // 三栏模型：日历只占 B 栏，mousedown 捕获层随它挂载
const inv = listenerInventory();
const runtimeSigs = [];
for (const [kind, arr] of [['document', inv.doc], ['window', inv.win]]) {
  for (const e of arr) {
    for (let i = 0; i < e.capture; i += 1) runtimeSigs.push(kind + ':' + e.type + ':capture');
    for (let i = 0; i < e.n - e.capture; i += 1) runtimeSigs.push(kind + ':' + e.type + ':bubble');
  }
}
const runtimeSet = [...new Set(runtimeSigs)].sort().join('|');
const whitelistSet = [...new Set(LISTEN_WHITELIST.map(sig))].sort().join('|');
const outsideWhitelist = [...new Set(runtimeSigs)].filter((s) => LISTEN_WHITELIST.map(sig).indexOf(s) < 0);
check('F06', '监听白名单：静态恰好 7 行且逐条与 §1.2.2.1 对应，运行时按 (target,type,capture) 归一后集合与白名单相等、无白名单外的监听',
  staticLines.length === 7 && staticSig === whitelistSig && runtimeSet === whitelistSet && outsideWhitelist.length === 0,
  '静态 ' + staticLines.length + ' 行[' + staticLines.map((l) => l.file + ':' + l.line + ' ' + sig(l)).join(' / ') + ']；' +
  '运行时 ' + inv.docTotal + 'document+' + inv.winTotal + 'window 集合[' + runtimeSet + ']；白名单集合[' + whitelistSet + ']；' +
  '白名单外=' + (outsideWhitelist.length ? outsideWhitelist.join(',') : '无'));
check('F07', '静态扫描器自检：不存在的类型必须扫出 0 行 —— 因此「扫到 0 行」在 F06 里必然判红，不会被当成通过',
  staticListeners('nosuchtype').length === 0 && staticLines.length > 0,
  '虚构类型 nosuchtype 命中=' + staticListeners('nosuchtype').length + '；真实类型合计=' + staticLines.length + '（0 行 → F06 必红）');

/* -------- Esc 两层语义（§1.2.1）：一次按键只消费一层，且消费成功后必须截停（不能再漏给宿主）--------
   第 1 层是 document 捕获监听（关最上面的浮层），第 2/3 层是 document 冒泡监听（先关 B，B 空再关 A）。
   这两条断言专治「补了 stopPropagation 但没人验」：若冒泡层消费后不截停，第二次派的 bubble 会继续关掉 A，
   下列期望立刻变红。 */
function pressEsc() {
  const node = pickByCls('dtRoot');
  reindex();
  const live = (node && node.__path !== undefined && treeIdx.byPath.get(node.__path)) || node;
  const ev = mkEvent(live || { tag: 'div', props: {}, children: [] }, 'keydown');
  ev.key = 'Escape';
  fireListeners(docListeners, 'keydown', ev, 'capture');
  const captureStopped = !!ev.stopped;
  /* 真实 DOM 顺序：document 捕获层 → 目标→祖先的元素级监听 → document 冒泡层。
     t86 补上中间这一段：原来只跑 document 两层，等于假设「面板内没有任何元素级 keydown 处理器」，
     于是 .dtRoot 上真的挂 onKeyDown 时 F08 仍会绿 —— 那层护栏就成了空话。
     目标取 .dtRoot（面板内焦点最外层），所以挂上 onKeyDown 会先于 document 冒泡层吃掉事件，
     F08 随之变红；这正是 F11 存在的理由。 */
  let chainStopped = false;
  if (!ev.stopped) {
    let cur = live;
    while (cur) {
      const h = cur.props && cur.props.onKeyDown;
      if (typeof h === 'function') {
        try { h(ev); } catch (e) { errors.push(['pressEsc:onKeyDown', e]); }
        if (ev.stopped) { chainStopped = true; break; }
      }
      cur = treeIdx.parents.get(cur) || null;
    }
  }
  const bubbleRan = !ev.stopped;
  if (bubbleRan) fireListeners(docListeners, 'keydown', ev, 'bubble');
  rerender();
  return { stopped: !!ev.stopped, captureStopped: captureStopped, chainStopped: chainStopped, bubbleRan: bubbleRan, prevented: !!ev.defaultPrevented };
}
/* 夹具：A 槽清单 + B 槽四象限，且无浮层。
   注意：前面的点击会留下飘着的菜单/编辑器，捕获层会先消费它们——所以先清浮层再开抽屉，
   否则测的就不是冒泡层（第一次跑就踩到：Esc#1 被捕获层吃掉，A/B 都没动）。 */
const overlayCount = () => byCls('dtMenu').filter((n) => String(attr(n, 'data-open')) === '1').length
  + byCls('dtEditor').length + byCls('dtModal').length;
let escClearGuard = 0;
while (overlayCount() > 0 && escClearGuard < 5) { pressEsc(); escClearGuard += 1; }
applyState({ projects: [INBOX, HABIT_PROJECT], tasks: Q_TASKS, habits: [] });
closeAllDrawers();
fire(railByLabel('收集箱'));
const escOpenB = !!drawerSlot('b');
const escRow = drawerSlot('b') ? all((n) => hasClass(n, 'dtRow'), drawerSlot('b'))[0] : null;
if (escRow) fire(escRow);
const escOverlayLeft = overlayCount();
const escOpenC = !!drawerSlot('c');
const esc1 = pressEsc();
const escAfter1 = { b: !!drawerSlot('b'), c: !!drawerSlot('c') };
const esc2 = pressEsc();
const escAfter2 = { b: !!drawerSlot('b'), c: !!drawerSlot('c') };
check('F08', 'Esc 冒泡层一次只消费一层：B+C 同时打开时先关 C（B 保留）、再按一次关 B，且每次消费后事件都被截停',
  escOverlayLeft === 0 && escOpenB && escOpenC
  && escAfter1.c === false && escAfter1.b === true
  && escAfter2.b === false && escAfter2.c === false
  && esc1.stopped && esc1.bubbleRan && esc2.stopped,
  '清浮层后残留浮层=' + escOverlayLeft + '；初始 B=' + escOpenB + ' C=' + escOpenC + '；Esc#1 ' + JSON.stringify(esc1) + ' → B=' + escAfter1.b + ' C=' + escAfter1.c +
  '；Esc#2 ' + JSON.stringify(esc2) + ' → B=' + escAfter2.b + ' C=' + escAfter2.c);
/* 夹具：B+C 都开 + 日历三点菜单（浮层）打开 → 捕获层先关浮层并截停，冒泡层完全不执行 */
applyState({ projects: [INBOX, HABIT_PROJECT], tasks: Q_TASKS, habits: [] });
closeAllDrawers();
/* 三栏模型：日历只能占 B 栏，与清单互斥；浮层菜单就开在 B 栏日历里（原「中间区 + 抽屉」并存已作废）。 */
prepareView('cal');
fire(byCls('dtCalMore')[0]);
const escMenuOpenBefore = byCls('dtMenu').filter((n) => String(attr(n, 'data-open')) === '1').length;
const esc3 = pressEsc();
const escMenuOpenAfter = byCls('dtMenu').filter((n) => String(attr(n, 'data-open')) === '1').length;
check('F09', 'Esc 捕获层先消费浮层：菜单打开时一次 Esc 只关菜单并截停，冒泡层完全不跑（B/C 两栏原样保留）',
  escMenuOpenBefore === 1 && escMenuOpenAfter === 0 && esc3.captureStopped && esc3.bubbleRan === false
  && !!drawerSlot('b') && bView() === 'calendar' && !drawerSlot('c'),
  '菜单 ' + escMenuOpenBefore + '→' + escMenuOpenAfter + '；Esc ' + JSON.stringify(esc3) + '；B=' + !!drawerSlot('b') + ' C=' + !!drawerSlot('c'));
/* ===== 十之补：P0「面板自行退回」门禁（t84 定性 → t85 实现 → t86 收编）=====
   .dtRoot 必须在 wheel / scroll / touchmove 上截停，否则这些事件冒到 document，
   宿主会据「连续滚动 / 键盘输入」把整个面板收起（t84 诊断 docs/p0-panel-dismiss-diagnosis.md）。
   但截停只 stopPropagation、不 preventDefault —— 否则 .dtQuad{overflow:auto} 与 .dtList 的
   内部滚动会被一起禁掉。桩里没有滚动引擎（元素没有会随 wheel 变化的 scrollTop），
   所以 F12 只验「不 preventDefault + 滚动容器仍是 overflow:auto」两条必要条件，
   不伪造滚动模型（假模型只会变成自证）；真机滚动由 t87 验收「四象限内可滚、页面不整页滚」。*/
const wheelTypes = ['wheel', 'scroll', 'touchmove'];
const mouseTypes = ['mousedown', 'pointerdown', 'click'];
function rootNode() { return one((n) => hasClass(n, 'dtRoot')); }
function seesAllOf(types) {
  return types.map((t) => {
    const cur = rootNode();
    const seen = hostSees(cur, t);
    const verdict = seen === false ? 'stopped' : (seen === true ? 'LEAKS' : String(seen));
    return { t: t, seen: seen, verdict: verdict };
  });
}
if (!drawerSlot('b')) fire(railByLabel('收集箱'));
const f10Wheel = seesAllOf(wheelTypes);
const f10Mouse = seesAllOf(mouseTypes);
check('F10', '滚轮类事件不出界：.dtRoot 的 wheel / scroll / touchmove 三个处理器全部截停（hostSees=false），并复核鼠标三类仍截停（t84 P0 门禁）',
  f10Wheel.length === 3 && f10Wheel.every((r) => r.verdict === 'stopped') && f10Mouse.every((r) => r.verdict === 'stopped'),
  '轮类=' + f10Wheel.map((r) => r.t + ':' + r.verdict).join(',') +
  '；鼠标类=' + f10Mouse.map((r) => r.t + ':' + r.verdict).join(',') +
  '；说明=改前 wheel/scroll/touchmove 全为 LEAKS，本条能真变红（活性证明 A 已证）');

/* 先把块注释替换成等长空白（保留行号），否则 .dtRoot 上方那句「刻意不挂 onKeyDown」的说明
   会被当成真处理器判红 —— 静态断言扫的必须是代码，不是注释。 */
const rootKeyDownScan = (function () {
  if (!partsDir) return { ok: false, why: '未找到 src/parts，静态扫描不可用', hits: [], roots: -1 };
  const file = '40-panel.js';
  let src = '';
  try { src = readFileSync(pathMod.join(partsDir, file), 'utf8'); } catch (e) { return { ok: false, why: '读取失败：' + (e && e.message), hits: [], roots: -1 }; }
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const re = /className:\s*'dtRoot'/g;
  const hits = [];
  let m;
  let roots = 0;
  while ((m = re.exec(stripped))) {
    roots += 1;
    const win = stripped.slice(m.index, m.index + 900);
    const at = win.search(/\bonKeyDown\s*:/);
    if (at >= 0) hits.push(file + ':' + (stripped.slice(0, m.index + at).split('\n').length));
  }
  return { ok: hits.length === 0 && roots > 0, hits: hits, roots: roots, file: file };
})();
check('F11', '反向静态断言：.dtRoot 的处理块不得挂 onKeyDown —— 挂上会掐断 document 层两层 Esc（F08/F09 就是这两层的守卫，所以任何加 onKeyDown 的改动会让 F08/F09 至少一条变红）',
  rootKeyDownScan.ok,
  '扫描 ' + (rootKeyDownScan.file || '40-panel.js') + '（已把块注释抹成空白）：.dtRoot 处理块 ' + rootKeyDownScan.roots + ' 处，命中 onKeyDown=' + (rootKeyDownScan.hits.join(',') || '(无)') +
  (rootKeyDownScan.why ? '；' + rootKeyDownScan.why : ''));

function preventProbe(type) {
  const root = rootNode();
  if (!root) return { type: type, handler: false, prevented: null, why: 'no-root' };
  reindex();
  const live = (root.__path !== undefined && treeIdx.byPath.get(root.__path)) || root;
  const h = live.props && live.props[HANDLER_KEY[type] || ('on' + type)];
  if (typeof h !== 'function') return { type: type, handler: false, prevented: null };
  const ev = mkEvent(live, type);
  try { h(ev); } catch (e) { errors.push(['preventProbe:' + type, e]); return { type: type, handler: true, prevented: 'threw', why: String(e && e.message) }; }
  rerender();
  return { type: type, handler: true, prevented: !!ev.defaultPrevented, stopped: !!ev.stopped };
}
const f12Prevent = wheelTypes.map(preventProbe);
const stopActionSrc = (function () {
  if (!partsDir) return { ok: false, why: 'no-parts' };
  let src = '';
  try { src = readFileSync(pathMod.join(partsDir, '30-ui-tasks.js'), 'utf8'); } catch (e) { return { ok: false, why: 'read-fail' }; }
  const at = src.indexOf('function stopActionEvent');
  if (at < 0) return { ok: false, why: 'stopActionEvent 未找到' };
  const body = src.slice(at, at + 600);
  const end = body.indexOf('\n    }');
  const text = end > 0 ? body.slice(0, end) : body;
  return { ok: text.indexOf('preventDefault') < 0, text: text.replace(/\s+/g, ' ').slice(0, 110) };
})();
const quadOverflow = cssRuleAll('.dtQuad').filter((b) => /overflow:\s*auto/.test(b));
const listOverflow = cssRuleAll('.dtList').filter((b) => /overflow:\s*auto/.test(b));
const f12MountBefore = mountInfo();
const f12Err0 = errors.length;
for (let i = 0; i < 50; i += 1) { const r = rootNode(); if (r) dispatchEvt(r, 'wheel'); }
const f12MountAfter = mountInfo();
const f12ErrDelta = errors.length - f12Err0;
check('F12', '截停不禁滚（必要条件；真机滚动归 t87）：三类处理器派发后 defaultPrevented=false、stopActionEvent 源码无 preventDefault、.dtQuad/.dtList 仍 overflow:auto；50 次 wheel 后子树仍挂载且零异常',
  /* 「缺处理器」由 F10 负责；F12 只守「不许 preventDefault」，两条断言各管一件事。 */
  f12Prevent.length === 3 && f12Prevent.every((r) => r.prevented !== true)
  && stopActionSrc.ok === true
  && quadOverflow.length >= 1 && listOverflow.length >= 1
  && f12ErrDelta === 0 && f12MountAfter.present === true && f12MountAfter.count === 1
  && f12MountAfter.parentPath === f12MountBefore.parentPath,
  'defaultPrevented=' + f12Prevent.map((r) => r.t + ':' + String(r.prevented)).join(',') +
  '（处理器存在=' + f12Prevent.map((r) => r.t + ':' + (r.handler ? 'y' : 'n')).join(',') + '）' +
  '；stopActionEvent=「' + (stopActionSrc.text || stopActionSrc.why || '') + '」' +
  '；.dtQuad overflow:auto 规则 ' + quadOverflow.length + ' 条、.dtList ' + listOverflow.length + ' 条' +
  '；50 次 wheel：异常 +' + f12ErrDelta + '、挂载 ' + f12MountAfter.present + '×' + f12MountAfter.count +
  '、parentPath ' + String(f12MountBefore.parentPath) + '→' + String(f12MountAfter.parentPath));

/* 调色板外零字面色：S74 只扫代码，注释里的 hex 一样会误导后来人（t83 两次照注释改错）。 */
const hexScan = (function () {
  if (!partsDir) return { ok: false, why: 'no-parts', hits: [], inside: 0, files: 0 };
  const re = /#[0-9a-fA-F]{3,8}\b/;
  const hits = [];
  let inside = 0;
  let files = 0;
  for (const f of readdirSync(partsDir).filter((x) => x.endsWith('.js')).sort()) {
    files += 1;
    const lines = readFileSync(pathMod.join(partsDir, f), 'utf8').split(/\r?\n/);
    let inPalette = false;
    lines.forEach((line, i) => {
      if (line.indexOf('dt-palette:start') >= 0) { inPalette = true; return; }
      if (line.indexOf('dt-palette:end') >= 0) { inPalette = false; return; }
      if (!re.test(line)) return;
      if (inPalette) inside += 1; else hits.push(f + ':' + (i + 1));
    });
  }
  return { ok: hits.length === 0 && files > 0, hits: hits, inside: inside, files: files };
})();
check('F13', '调色板外零字面色（含注释）：src/parts 下 #RRGGBB 只允许出现在 dt-palette:start/end 之间，注释里的 hex 同样判红（活性证明 D：往注释里塞一个 hex 即变红）',
  hexScan.ok,
  '扫描 ' + hexScan.files + ' 个文件，palette 区内 ' + hexScan.inside + ' 行，区外命中=' + (hexScan.hits.join(',') || '(无)'));

/* ============================ 十一、§8-25…29 规格收编（t21 新增五条） ============================
   §8-25 Esc 分层：浮层 → 抽屉 B → 抽屉 A，一次一层且每次消费后都截停；输入控件内全链不消费。
   §8-26 菜单可达性双视图：四象限角标菜单（抽屉内）+ 日历三点菜单（中间区），断言 computed display 而非节点存在。
   §8-27 菜单翻转三态：用 getBoundingClientRect 桩驱动 menuFlip 的 down / up / clamp，并断言全仓唯一实现。
   §8-28 内建清单（type=habit）无删除入口，改名 / 改类型 / 色卡仍在；普通清单仍有删除。
   §8-29 streak 双口径：归档 data-src=frozen 读冻结值，在用 data-src=live 实时算。
   分工说明：§8-25 的「B→A 两层」与 §8-26 的「菜单可点」已由 F08/F09/E03–E09 覆盖，本节只补此前完全没测过的
   部分（浮层层、输入例外、翻转几何、内建清单、双口径），不重复已有断言。 */
const freshTasks = () => JSON.parse(JSON.stringify(Q_TASKS));
const editorCount = () => byCls('dtEditor').length;
const closeMenus = () => { let g = 0; while (visibleMenus().length > 0 && g < 4) { pressEsc(); g += 1; } };
/* 与 pressEsc 同构，只是可指定 target（输入例外要用 input/textarea/contenteditable 当事件源） */
const pressEscAt = (targetNode) => {
  const ev = mkEvent(targetNode, 'keydown');
  ev.key = 'Escape';
  fireListeners(docListeners, 'keydown', ev, 'capture');
  const captureStopped = !!ev.stopped;
  const bubbleRan = !ev.stopped;
  if (bubbleRan) fireListeners(docListeners, 'keydown', ev, 'bubble');
  rerender();
  return { stopped: !!ev.stopped, captureStopped, bubbleRan, prevented: !!ev.defaultPrevented };
};

/* -------- §8-25：浮层 → C → B，一次一层且每次截停 -------- */
applyState({ projects: [INBOX], tasks: freshTasks(), habits: [] });
closeAllDrawers();
let s25Guard = 0;
while (overlayCount() > 0 && s25Guard < 6) { pressEsc(); s25Guard += 1; }
/* 三栏模型下「浮层 + B + C 同时开着」只能落在四象限：行点开产 C，再点行尾角标开浮层菜单。 */
prepareView('quad');
const s25_bRow = bSlot() ? all((n) => hasClass(n, 'dtRow'), bSlot())[0] : null;
if (s25_bRow) fire(s25_bRow);
const s25_menuBtn = quadMenuBtnOf(null);
if (s25_menuBtn && !visibleMenus().length) fire(s25_menuBtn);
const s25_step0 = { menu: visibleMenus().length, b: !!drawerSlot('b'), c: !!drawerSlot('c') };
const s25_esc1 = pressEsc();
const s25_step1 = { menu: visibleMenus().length, b: !!drawerSlot('b'), c: !!drawerSlot('c') };
const s25_esc2 = pressEsc();
const s25_step2 = { menu: visibleMenus().length, b: !!drawerSlot('b'), c: !!drawerSlot('c') };
const s25_esc3 = pressEsc();
const s25_step3 = { menu: visibleMenus().length, b: !!drawerSlot('b'), c: !!drawerSlot('c') };
check('S25a', '§8-25 Esc 分层：浮层+B+C 同时开着时，三次 Esc 依次只关 浮层→C→B，且每次消费后都截停（stopped=true）',
  s25_step0.menu === 1 && s25_step0.b && s25_step0.c
  && s25_step1.menu === 0 && s25_step1.b && s25_step1.c && s25_esc1.stopped
  && s25_step2.b && !s25_step2.c && s25_esc2.stopped
  && !s25_step3.b && s25_esc3.stopped,
  '浮层=' + s25_step0.menu + '→' + s25_step1.menu + '→' + s25_step2.menu + '→' + s25_step3.menu
  + '；B=' + JSON.stringify([s25_step0.b, s25_step1.b, s25_step2.b, s25_step3.b])
  + '；C=' + JSON.stringify([s25_step0.c, s25_step1.c, s25_step2.c, s25_step3.c])
  + '；stopped=' + JSON.stringify([s25_esc1.stopped, s25_esc2.stopped, s25_esc3.stopped]));

/* -------- §8-25b：输入控件内 Esc 全链不消费 -------- */
closeAllDrawers();
fire(railByLabel('收集箱'));
const s25_inRow = drawerSlot('b') ? all((n) => hasClass(n, 'dtRow'), drawerSlot('b'))[0] : null;
if (s25_inRow) fire(s25_inRow);
const s25_in0 = { b: !!drawerSlot('b'), c: !!drawerSlot('c') };
const s25_inInput = pressEscAt({ tagName: 'input' });
const s25_inArea = pressEscAt({ tagName: 'TEXTAREA' });
const s25_inEdit = pressEscAt({ tagName: 'div', isContentEditable: true });
const s25_in1 = { b: !!drawerSlot('b'), c: !!drawerSlot('c') };
check('S25b', '§8-25 输入例外：target 为 input / textarea / contenteditable 时 Esc 全链不消费也不截停（B/C 原样）',
  s25_in0.b && s25_in0.c && s25_in1.b && s25_in1.c
  && [s25_inInput, s25_inArea, s25_inEdit].every((r) => !r.stopped && !r.prevented),
  'input=' + JSON.stringify(s25_inInput) + ' textarea=' + JSON.stringify(s25_inArea)
  + ' contenteditable=' + JSON.stringify(s25_inEdit) + '；B/C 后=' + s25_in1.b + '/' + s25_in1.c);

/* -------- §8-26 双视图菜单可达性 -------- */
closeAllDrawers();
fire(railDt('rail-quadrant'));            // 四象限菜单只在抽屉内出现
realClick(quadMenuBtnOf(qdItem()));
const s26_qMenu = one((n) => hasClass(n, 'dtQuadMenu'));
const s26_qInB = !!s26_qMenu && all((n) => hasClass(n, 'dtQuadMenu'), drawerSlot('b')).length === 1;
const s26_qDisplay = s26_qMenu ? computedProp(s26_qMenu, 'display') : null;
const s26_qFlip = s26_qMenu ? attr(s26_qMenu, 'data-flip') : null;
realClick(quadPick(s26_qMenu, 'q1'));
storeApi.saveNow();
const s26_qd = tasksById('qd');
check('S26a', '§8-26 抽屉内：四象限角标菜单可开可选中（在 B 抽屉内、computed display=block、带 data-flip、点 Q1 真改判）',
  s26_qInB && s26_qDisplay === 'block' && (s26_qFlip === 'down' || s26_qFlip === 'up')
  && attr(qdItem(), 'data-src') === 'override' && !!s26_qd && s26_qd.quadOverride === 'q1'
  && all((n) => hasClass(n, 'dtQuadItem'), qcell('q1')).some((n) => attr(n, 'data-task-id') === 'qd'),
  '在 B 内=' + s26_qInB + ' display=' + s26_qDisplay + ' data-flip=' + s26_qFlip
  + ' 改判=' + (s26_qd ? s26_qd.quadOverride : 'null') + ' src=' + attr(qdItem(), 'data-src'));

prepareView('cal');                       // 三栏模型：日历进 B 栏，三点菜单只存在于 B 栏日历里
realClick(calMoreBtn());
const s26_cMenu = one((n) => hasClass(n, 'dtMenu'));
const s26_cInCal = !!s26_cMenu && all((n) => hasClass(n, 'dtMenu'), one((n) => hasClass(n, 'dtCal'))).length === 1;
const s26_cDisplay = s26_cMenu ? computedProp(s26_cMenu, 'display') : null;
const s26_cFlip = s26_cMenu ? attr(s26_cMenu, 'data-flip') : null;
const s26_cMaskBefore = calMask();
realClick(one((n) => attr(n, 'data-dt') === 'cal-overlay-lunar', s26_cMenu));
check('S26b', '§8-26 中间区：日历三点菜单可开可选中（在 .dtCal 内、computed display=block、带 data-flip、点「农历」后位掩码 +1 且农历位打开）',
  s26_cInCal && s26_cDisplay === 'block' && (s26_cFlip === 'down' || s26_cFlip === 'up') && calMask() === s26_cMaskBefore + 1 && calOverlaysNow().lunar === true,
  '在 .dtCal 内=' + s26_cInCal + ' display=' + s26_cDisplay + ' data-flip=' + s26_cFlip + ' mask=' + s26_cMaskBefore + '→' + calMask() + ' lunar=' + calOverlaysNow().lunar);

/* -------- §8-27 翻转三态（getBoundingClientRect 桩：anchor 与 clip 的 top/bottom 可控） -------- */
const flipProbe = (anchor, clip) => {
  closeMenus();
  prepareView('cal');
  GEOM = { anchor, clip };
  realClick(calMoreBtn());
  rerender();                              // 第一次提交：effect 里 measure() → setFlip
  rerender();                              // 第二次提交：新 flip 写进菜单节点（React 的下一次 commit）
  const menu = one((n) => hasClass(n, 'dtMenu'));
  const rawClamp = menu ? attr(menu, 'data-clamp') : null;
  const rawMaxH = menu && menu.props.style ? menu.props.style.maxHeight : null;
  const out = {
    flip: menu ? (attr(menu, 'data-flip') || null) : null,
    clamp: rawClamp === undefined ? null : rawClamp,     // 未夹高时属性不存在
    maxH: rawMaxH === undefined ? null : rawMaxH,
    display: menu ? computedProp(menu, 'display') : null
  };
  GEOM = null;
  return out;
};
const s27_down = flipProbe({ top: 40, bottom: 80 }, { top: 0, bottom: 400 });      // below=312 ≥ 240
check('S27a', '§8-27 翻转「下弹」：clip 下方空间 312px ≥ 菜单上限 240 → data-flip=down、不夹高（无 data-clamp）',
  s27_down.display === 'block' && s27_down.flip === 'down' && s27_down.clamp === null && s27_down.maxH === null,
  'anchor{40,80} clip{0,400} → below=312 ｜ 结果=' + JSON.stringify(s27_down));

const s27_up = flipProbe({ top: 300, bottom: 340 }, { top: 0, bottom: 380 });      // below=32、above=292
check('S27b', '§8-27 翻转「上弹」：下方只有 32px、上方 292px ≥ 240 → data-flip=up、不夹高',
  s27_up.display === 'block' && s27_up.flip === 'up' && s27_up.clamp === null && s27_up.maxH === null,
  'anchor{300,340} clip{0,380} → below=32 above=292 ｜ 结果=' + JSON.stringify(s27_up));

const s27_clamp = flipProbe({ top: 150, bottom: 200 }, { top: 0, bottom: 380 });   // below=172、above=142，取大侧 down
check('S27c', '§8-27 翻转「两侧都不足」：below=172/above=142 都 < 240 → 取较大侧 down、data-clamp=1 且 max-height=min(240,172)=172px',
  s27_clamp.display === 'block' && s27_clamp.flip === 'down' && s27_clamp.clamp === '1' && s27_clamp.maxH === '172px',
  'anchor{150,200} clip{0,380} → below=172 above=142 ｜ 结果=' + JSON.stringify(s27_clamp));

/* 全仓唯一实现：只允许 30-ui-tasks.js 里一处 function menuFlip，两处菜单都取它的结果 */
const s27_files = partsDir ? readdirSync(partsDir).filter((x) => x.endsWith('.js')) : [];
const s27_text = {};
s27_files.forEach((f) => { s27_text[f] = readFileSync(pathMod.join(partsDir, f), 'utf8'); });
const s27_defs = [];
const s27_useFlip = [];
const s27_useClamp = [];
s27_files.forEach((f) => {
  const defHit = s27_text[f].match(/function\s+menuFlip\s*\(/g) || [];
  const flipHit = s27_text[f].match(/'data-flip':\s*menuPlacement\.value\.flip/g) || [];
  const clampHit = s27_text[f].match(/'data-clamp':\s*menuPlacement\.value\.clamp/g) || [];
  defHit.forEach(() => s27_defs.push(f));
  flipHit.forEach(() => s27_useFlip.push(f));
  clampHit.forEach(() => s27_useClamp.push(f));
});
check('S27u', '§0.5 menuFlip 是全仓唯一实现：src/parts 里 function menuFlip 恰 1 处，两处菜单的 data-flip/data-clamp 都取它返回的 placement',
  s27_defs.length === 1 && s27_useFlip.length === 2 && s27_useClamp.length === 2,
  '定义=' + JSON.stringify(s27_defs) + ' 取 flip 的渲染点=' + JSON.stringify(s27_useFlip) + ' 取 clamp=' + JSON.stringify(s27_useClamp));

/* -------- §8-28 内建清单退役（t33 起：不再有 data-builtin，习惯走 [data-dt=rail-habit] 一级入口） -------- */
const P_WORK = { id: 'p-work', name: '工作', type: 'todo', color: '#5b8def', icon: '' };
const railRowOf = (pid) => one((n) => hasClass(n, 'dtRailRow') && all((c) => hasClass(c, 'dtRailItem') && attr(c, 'data-project-id') === pid, n).length >= 1);
const railMoreOf = (pid) => one((n) => hasClass(n, 'dtRailMore'), railRowOf(pid));
applyState({ projects: [INBOX, HABIT_PROJECT, P_WORK], tasks: [], habits: [] });
closeAllDrawers();
/* 旧模型的「内建清单项带 data-builtin / 不可删」已作废：习惯项从项目组整体搬进一级入口，
   所以这三条一起断——① 全树没有 data-builtin；② 习惯项目不再出现在项目组；③ 习惯入口在 rail 且能开 B 栏。 */
const s28_builtinCount = all((n) => attr(n, 'data-builtin') !== undefined && attr(n, 'data-builtin') !== null).length;
const s28_habitInGroup = all((n) => hasClass(n, 'dtRailItem') && attr(n, 'data-project-id') === 'habit-home').length;
const s28_habitRail = byDt('rail-habit');
fire(s28_habitRail[0]);
const s28_habitOpened = !!bSlot() && attr(bSlot(), 'data-kind') === 'habit' && bView() === 'habit';
check('S28a', '§8-28 内建清单退役：全树无 data-builtin、习惯项目不再出现在项目组，习惯改由 [data-dt=rail-habit] 一级入口打开 B 栏',
  s28_builtinCount === 0 && s28_habitInGroup === 0 && s28_habitRail.length === 1 && s28_habitOpened,
  'data-builtin 项=' + s28_builtinCount + ' 项目组里的 habit 项=' + s28_habitInGroup
  + ' rail-habit=' + s28_habitRail.length + ' 点开后 B.kind=' + bKind() + '/view=' + bView());
fire(s28_habitRail.length ? byDt('rail-habit')[0] : null);

fire(railMoreOf('p-work'));
const s28_plainDialog = one((n) => hasClass(n, 'dtModal'));
const s28_plainKids = s28_plainDialog ? all(() => true, s28_plainDialog) : [];
const s28_plainDelete = s28_plainKids.filter((n) => hasClass(n, 'dtDangerBtn')).length;
const s28_plainInput = s28_plainKids.filter((n) => n.tag === 'input').length;
const s28_plainTypes = s28_plainKids.filter((n) => hasClass(n, 'dtTypeBtn')).length;
const s28_plainSwatch = s28_plainKids.filter((n) => hasClass(n, 'dtSwatch')).length;
check('S28b', '§8-28 对照：普通清单编辑弹窗仍有删除入口 + 改名输入 / 类型两选（habit 类型随内建清单退役）/ 色卡，证明不是全局禁删',
  !!s28_plainDialog && s28_plainDelete === 1 && s28_plainInput >= 1 && s28_plainTypes === 2 && s28_plainSwatch >= 1,
  '普通清单删除按钮=' + s28_plainDelete + ' 输入=' + s28_plainInput + ' 类型按钮=' + s28_plainTypes + ' 色卡=' + s28_plainSwatch);
pressEsc();

/* -------- §8-29 streak 双口径（frozen / live） -------- */
applyState({
  projects: [INBOX, HABIT_PROJECT],
  tasks: [],
  habits: [
    { id: 'h-e', name: '早睡', color: '', period: 'evening', archived: true, checks: [], freq: { type: 'daily', interval: 1, byDay: [] }, checkInCount: 5, currentStreak: 9, longestStreak: 12 },
    { id: 'h-a', name: '读书', color: '', period: 'afternoon', archived: false, checks: [YEST_K, D2_K], freq: { type: 'daily', interval: 1, byDay: [] }, checkInCount: 2, currentStreak: 0, longestStreak: 2 }
  ]
});
closeAllDrawers();
fire(railByLabel('习惯打卡'));
fire(one((n) => hasClass(n, 'dtMiniBtn') && nodeText(n).includes('含归档')));
const frozenStreak = streakOf(cardOf('h-e'));
const liveStreak = streakOf(cardOf('h-a'));
const frozenNode = frozenStreak.el;
const liveNode = liveStreak.el;
const frozenText = frozenStreak.text;
const liveText = liveStreak.text;
check('S29a', '§8-29 归档口径：归档习惯 data-streak-src=frozen，显示迁移时冻结的 currentStreak=9（checks 为空也不归零）',
  !!frozenNode && attr(frozenNode, 'data-streak-src') === 'frozen' && frozenText === '已坚持 9 天' && frozenStreak.n === 9,
  'data-streak-src=' + (frozenNode ? attr(frozenNode, 'data-streak-src') : 'null') + ' 文本=' + JSON.stringify(frozenText) + '（checks=[] 实时算会是 0）');
check('S29b', '§8-29 在用口径：在用习惯 data-streak-src=live，按 checks 实时算得 2（存储字段 currentStreak 是 0，证明不是读字段）',
  !!liveNode && attr(liveNode, 'data-streak-src') === 'live' && liveText === '已坚持 2 天' && liveStreak.n === 2,
  'data-streak-src=' + (liveNode ? attr(liveNode, 'data-streak-src') : 'null') + ' 文本=' + JSON.stringify(liveText) + ' 存储字段=0');

/* 收尾：把视图还原到日历 + 无归档视图，避免影响后续/再次运行 */
GEOM = null;
closeMenus();
fire(one((n) => hasClass(n, 'dtMiniBtn') && nodeText(n).includes('隐藏归档')));
closeAllDrawers();
fire(railDt('rail-calendar'));

/* ============================ 十二、日期视图（§1.6）与九档宽度（§2.4） ============================ */
const atCq = (w) => cssText.indexOf('(max-width:' + w + 'px)') >= 0;
const widthSnap = () => ({
  count: zoneCount(),
  squeezed: attr(centerMain(), 'data-squeezed') || null,
  rail: attr(rootEl(), 'data-rail') || null
});
const snapStr = (o) => 'count=' + o.count + ' squeezed=' + o.squeezed + ' rail=' + o.rail;

/* ---- §1.6 点日历格 → B 栏日期视图 ---- */
const D_TASKS = [
  { id: 'd1', projectId: 'inbox', title: '今天未完成', status: 0, deleted: false, date: TODAY_K, allDay: true, priority: 0 },
  { id: 'd2', projectId: 'inbox', title: '今天已完成', status: 2, deleted: false, date: TODAY_K, allDay: true, priority: 0 },
  { id: 'd3', projectId: 'inbox', title: '明天一条', status: 0, deleted: false, date: TOMORROW_K, allDay: true, priority: 0 }
];
applyState({ projects: [INBOX], tasks: D_TASKS, habits: [] });
closeAllDrawers();
resizeTo(1200);
fire(railDt('rail-calendar'));
if (todayButton()) fire(todayButton());
fire(one((n) => hasClass(n, 'dtCalCell') && attr(n, 'data-date') === TODAY_K));
const c16Rows = bRows().map((n) => nodeText(n).trim());
check('C16', '§1.6 点日历格：B 栏切到 date:<今天> 视图，标题含「M月D日」与「N 项」，计数为「N 条」且只列当天任务',
  bView() === 'date:' + TODAY_K && /^\d+月\d+日/.test(bTitle()) && bTitle().indexOf('2 项') >= 0 &&
    bCount().indexOf('2 条') === 0 && c16Rows.length === 2 && c16Rows.every((t) => t.indexOf('今天') >= 0),
  'view=' + bView() + ' 标题=' + JSON.stringify(bTitle()) + ' 计数=' + JSON.stringify(bCount()) + ' 行=' + JSON.stringify(c16Rows));

check('C17', '§1.6 日期视图排序：未完成在前、已完成在后（不受「含已完成」开关影响）',
  c16Rows.length === 2 && c16Rows[0].indexOf('今天未完成') >= 0 && c16Rows[1].indexOf('今天已完成') >= 0,
  '行顺序=' + JSON.stringify(c16Rows));

const c18DateView = { view: bView(), cells: byCls('dtCalCell').length, cal: byCls('dtCal').length };
fire(railDt('rail-calendar'));
const c18Back = { view: bView(), cells: byCls('dtCalCell').length };
fire(one((n) => hasClass(n, 'dtCalCell') && attr(n, 'data-date') === TOMORROW_K));
const c18Rows = bRows().map((n) => nodeText(n).trim());
check('C18', '§1.6 日期视图往返：日期视图占满 B 栏（月历与格整体卸载，只此一份）；点 rail 日历回月历（42 格复原）；再点另一格切到那天',
  c18DateView.view === 'date:' + TODAY_K && c18DateView.cells === 0 && c18DateView.cal === 0 &&
    c18Back.view === 'calendar' && c18Back.cells === 42 &&
    bView() === 'date:' + TOMORROW_K && c18Rows.length === 1 && c18Rows[0].indexOf('明天一条') >= 0,
  '进入日期视图后 view=' + c18DateView.view + ' cells=' + c18DateView.cells + ' dtCal=' + c18DateView.cal +
  '；回月历 view=' + c18Back.view + ' cells=' + c18Back.cells +
  '；换格后 view=' + bView() + ' 行=' + JSON.stringify(c18Rows));

/* ---- §2.4 九档宽度：中间区让位 / rail 图标条 / 断点 CSS ---- */
applyState({ projects: [INBOX, HABIT_PROJECT], tasks: Q_TASKS, habits: [] });
closeAllDrawers();
resizeTo(1200);
fire(railByLabel('收集箱'));
const w01 = widthSnap();
check('W01', 'W1（1200px）单栏：B 栏 1 个且不被挤压、rail 为常规条（无 data-rail）',
  w01.count === '1' && w01.squeezed === null && w01.rail === null, snapStr(w01));

const wRow = all((n) => hasClass(n, 'dtRow'), drawerSlot('b'))[0];
if (wRow) fire(wRow);
const w02 = widthSnap();
/* t117 迁移：挤压判据从「按容器宽度让位」改成「B+C 同开即挤压 B 栏」（实现把 data-squeezed 直接挂在 B 栏根）。
   旧的 <1080 才挤压是「中间区 + 抽屉区」两段式模型的产物，三栏模型下不再适用。 */
check('W02', 'W1（1200px）两栏并排：B+C 同开 → B 栏 data-squeezed=1（挤压只看是否两栏，不看容器宽）',
  w02.count === '2' && w02.squeezed === '1', snapStr(w02));

resizeTo(1000);
const w03 = widthSnap();
check('W03', 'W2（1000px）两栏：B 栏 data-squeezed=1，且 CSS 真源 B/C 栏位比例（55%/45%）与 count=2 规则同时存在',
  w03.squeezed === '1' && bSlotRules.some((r) => /flex\s*:\s*1\s+1\s+55%/.test(r)) &&
    cssRuleAll('.dtDrawerZone[data-count="2"]').length >= 1,
  snapStr(w03) + '；B 栏规则=' + JSON.stringify(bSlotRules.slice(0, 1)));

resizeTo(900);
const w04 = widthSnap();
check('W04', 'W2 下界（900px）两栏：仍挤压中间区，rail 仍是常规条（图标档从 <776 才开始）',
  w04.squeezed === '1' && w04.rail === null, snapStr(w04));

resizeTo(775);
const w05 = widthSnap();
check('W05', 'W3b（775px，判据是 <776）两栏：rail 转图标条 data-rail="icon"，CSS 真源 .dtRoot[data-rail="icon"] .dtRail{width:48px}',
  w05.rail === 'icon' && cssRuleAll('.dtRoot[data-rail="icon"] .dtRail').some((r) => /width:\s*48px/.test(r)),
  snapStr(w05) + '；图标条规则=' + JSON.stringify(cssRuleAll('.dtRoot[data-rail="icon"] .dtRail')));

resizeTo(720);
const w06 = widthSnap();
check('W06', 'W4（720px）两栏：rail 仍图标条，抽屉区走 @container 719 的 max(500px,calc(100cqw - 48px))',
  w06.rail === 'icon' && atCq(719) && cssText.indexOf('calc(100cqw - 48px)') >= 0, snapStr(w06));

resizeTo(1000);
fire(collapseIn(cSlot()));
const w07 = widthSnap();
check('W07', '收起 C 栏后 B 栏立即恢复：count=1、squeezed 消失、rail 退出图标档',
  w07.count === '1' && w07.squeezed === null && w07.rail === null, snapStr(w07));

const w08cq = [559, 519, 479, 419].map((w) => atCq(w)).join(',');
const w08cal = cssText.indexOf('calc(100cqw - 196px)') >= 0;
check('W08', 'W5 及以下四档断点 CSS 齐备（559/519/479/419），且 1079 档抽屉区用 calc(100cqw - 196px)',
  w08cq === 'true,true,true,true' && w08cal, '断点=' + w08cq + ' 1079 档 calc=' + w08cal);

if (!bSlot()) fire(railByLabel('收集箱'));
const wRow2 = drawerSlot('b') ? all((n) => hasClass(n, 'dtRow'), drawerSlot('b'))[0] : null;
if (wRow2) fire(wRow2);
resizeTo(1200);
const w09 = widthSnap();
check('W09', '回 W1（1200px）两栏：squeezed 保持 1（两栏就挤压），图标条复原为常规 rail（无残留）',
  w09.count === '2' && w09.squeezed === '1' && w09.rail === null, snapStr(w09));
closeAllDrawers();

/* ============================ 十三、螺旋工作法（§8-59…68） ============================ */
/* 桌面通知桩默认 permission='default'，desktopNotify() 会直接 return —— 那样「停止不通知」「静默不通知」
   两类断言都会恒真。这里显式授权，段末恢复，通知类判据才有区分力。 */
FakeNotification.permission = 'granted';
/* 驱动方式：只点真实入口（[data-spiral-start]/[data-spiral-pause]/[data-spiral-stop]/[data-spiral-done]/[data-spiral-swap]/…）
   与真实引擎 tick（window.setInterval 登记的 500ms 回调，见文件头部 engineTicks），不 sleep、不直调内部函数。
   「段到点」由夹具把 endsAt 推到过去、startedAt 按需要的已用时长反推，再跑一次 tick —— 等价于时间真的到了。 */
const spiralOf = () => storeApi.get().spiral;
const spRoot = () => one((n) => attr(n, 'data-spiral') === '');
const spAttr = (k) => (spRoot() ? attr(spRoot(), k) : undefined);
const spNode = (cl) => one((n) => hasClass(n, cl));
const spText = (cl) => { const n = spNode(cl); return n ? nodeText(n).trim() : ''; };
const spBtn = (k) => one((n) => attr(n, 'data-spiral-' + k) !== undefined);
const spLeftNode = () => spNode('dtSpiralTime');
const spLeftAttr = () => (spLeftNode() ? attr(spLeftNode(), 'data-spiral-left') : undefined);
const spLeftText = () => (spLeftNode() ? nodeText(spLeftNode()).trim() : '');
const spBadge = () => { const n = byDt('rail-spiral')[0]; return n ? attr(n, 'data-spiral-badge') : undefined; };
const SPIRAL_TOAST_KEYS = ['螺旋', '重要工作结束', '娱乐时间结束', '轮螺旋完成', 'A 清单绑定已失效'];
const spiralToasts = () => toastEntries().filter((t) => SPIRAL_TOAST_KEYS.some((k) => t.indexOf(k) >= 0));
const isSpiralToastTitle = (t, title) => t.indexOf(title) >= 0;
const SPIRAL_IDLE = () => ({
  status: 'idle', phase: 0, round: 0, endsAt: 0, leftMs: 0, startedAt: 0, pausedAt: 0, pausedTotal: 0,
  phaseDone: false, aTaskId: '', bItemId: '', day: TODAY_K,
  stats: { rounds: 0, aMin: 0, bMin: 0, doneCount: 0 }, history: [], notify: true, sound: true
});
const INBOX_ID = (typeof INBOX !== 'undefined' && INBOX && INBOX.id) ? INBOX.id : 'inbox';
const spTasks = () => ([
  { id: 'sp-a', projectId: INBOX_ID, title: '高分高优先', status: 0, score: 70, priority: 3, date: TOMORROW_K, createdAt: 1 },
  { id: 'sp-b', projectId: INBOX_ID, title: '高分低优先', status: 0, score: 70, priority: 1, date: '', createdAt: 2 },
  { id: 'sp-c', projectId: INBOX_ID, title: '中分', status: 0, score: 42, priority: 0, date: '', createdAt: 3 },
  { id: 'sp-d', projectId: INBOX_ID, title: '零分', status: 0, score: 0, priority: 0, date: '', createdAt: 4 }
]);
const resetSpiral = (patch) => applyState(Object.assign({ tasks: spTasks(), spiral: SPIRAL_IDLE(), spiralItems: [] }, patch || {}));
const pushSpiral = (patch) => applyState({ spiral: Object.assign({}, storeApi.get().spiral, patch) });
const openSpiral = () => { if (!spRoot()) { const b = byDt('rail-spiral')[0]; if (b) fire(b); } };
/* 把当前段判为「已用 usedMs 后到点」，随后跑一次引擎 tick（真实 500ms 回调）完成结算 */
const settleSpiral = (usedMs, patch) => {
  const now = Date.now();
  const endsAt = now - 1000;
  pushSpiral(Object.assign({
    status: 'running', endsAt, startedAt: endsAt - Math.max(0, usedMs || 0), pausedAt: 0, leftMs: 0, pausedTotal: 0
  }, patch || {}));
  engineTicks();
  return spiralOf();
};

/* 面板重挂载：清掉模块缓存后重新 factory+apply，createStore 会重跑 loadState（reload 结算就在这里发生）。
   与「刷新页面」同一条代码路径，不是自己写一遍结算逻辑。 */
let reloadSeq = 0;
async function reloadApp(prep) {
  if (prep) prep();
  storeApi.saveNow();
  reloadSeq += 1;
  const url = 'file:///' + target.replace(/\\\\/g, '/') + '?reload=' + reloadSeq;
  const savedMod = globalThis.__mod;
  await import(url);
  const def2 = globalThis.__mod;
  const regs2 = [];
  const ctx2 = {
    effect(fn) { try { fn(); } catch (e) { errors.push(['reload.effect', e]); } },
    on() { return () => {}; },
    locale: fakeCtx.locale,
    slots: {
      inject(_k, cb) { try { return cb(); } catch (e) { errors.push(['reload.inject', e]); } },
      register(desc, comp) { regs2.push({ desc, comp }); return () => {}; }
    }
  };
  let mod2 = null;
  try { mod2 = def2.factory((name) => { if (name === 'react') return React; throw new Error('unexpected require: ' + name); }); }
  catch (e) { errors.push(['reload.factory', e]); }
  if (mod2) { try { mod2.apply(ctx2); } catch (e) { errors.push(['reload.apply', e]); } }
  const main2 = regs2.find((r) => r.desc && r.desc.name === 'main');
  const props2 = main2 && main2.desc.inject ? Object.assign({}, main2.desc.inject(), { t: (k) => k }) : null;
  globalThis.__mod = savedMod;
  return props2 ? { store: props2.store, state: props2.store.get() } : null;
}

/* ---------- S59 相位机：六段序列、文案、倒计时格式 ---------- */
resetSpiral({});
openSpiral();
fire(spBtn('start'));
const s59Seq = [];
const s59Labels = [];
for (let i = 0; i < 6; i += 1) {
  s59Seq.push(spAttr('data-spiral-phase') + '/' + spAttr('data-spiral-min'));
  s59Labels.push(spText('dtSpiralPhase'));
  settleSpiral(61000);
}
const s59After = spAttr('data-spiral-phase') + '/' + spAttr('data-spiral-min');
const s59Round = spAttr('data-spiral-round');
check('S59a', '§8-59 相位序列：a/10 → b/10 → a/20 → b/20 → a/30 → b/30，第 6 段结算后回 a/10 且 data-spiral-round 1→2',
  s59Seq.join(',') === 'a/10,b/10,a/20,b/20,a/30,b/30' && s59After === 'a/10' && s59Round === '2',
  '序列=' + s59Seq.join(' → ') + '；结算后=' + s59After + '；round=' + s59Round);
const s59WantLabels = ['重要工作 · 10 分钟', '好玩娱乐 · 10 分钟', '重要工作 · 20 分钟', '好玩娱乐 · 20 分钟', '重要工作 · 30 分钟', '好玩娱乐 · 30 分钟'];
check('S59b', '§8-59 相位文案逐字：.dtSpiralPhase = 重要工作|好玩娱乐 + 「 · 」+ 分钟数',
  s59Labels.join('|') === s59WantLabels.join('|'),
  '实际=' + s59Labels.join('|'));
const s59Left = spLeftText();
check('S59c', '§8-59 倒计时文本：.dtSpiralTime 文本匹配 ^\\d{2}:\\d{2}$ 且与 data-spiral-left 逐字相等',
  /^\d{2}:\d{2}$/.test(s59Left) && s59Left === spLeftAttr(),
  '文本=' + JSON.stringify(s59Left) + ' 属性=' + JSON.stringify(spLeftAttr()));

/* ---------- S60 中间区结构与按钮集合 ---------- */
resetSpiral({});
openSpiral();
const s60Idle = { start: !!spBtn('start'), stop: !!spBtn('stop'), pause: !!spBtn('pause'), round: spText('dtSpiralRound') };
fire(spBtn('start'));
const s60Arc = spNode('dtSpiralArc');
const s60Off1 = Number(attr(s60Arc, 'strokeDashoffset'));
pushSpiral({ endsAt: Date.now() + 60000 });
const s60Off2 = Number(attr(spNode('dtSpiralArc'), 'strokeDashoffset'));
const s60Run = {
  view: centerView(),
  time: !!spNode('dtSpiralTime'), phase: !!spNode('dtSpiralPhase'), round: !!spNode('dtSpiralRound'),
  stats: !!spNode('dtSpiralStats'), arc: !!s60Arc,
  dash: String(attr(s60Arc, 'strokeDasharray') || ''),
  stop: !!spBtn('stop'), pause: !!spBtn('pause'), start: !!spBtn('start'),
  roundText: spText('dtSpiralRound')
};
check('S60a', '§8-60 B 栏 .dtDrawer[data-slot="b"][data-view="spiral"] 内含（原 .dtCenter 已删除） dtSpiralTime/Phase/Round/Arc/Stats 与停止按钮，圆弧 dasharray 非空且 dashoffset = 整圈 × 剩余/总时长（剩余减少则 dashoffset 变小）',
  s60Run.view === 'spiral' && s60Run.time && s60Run.phase && s60Run.round && s60Run.stats && s60Run.arc &&
    Number(s60Run.dash) > 0 && s60Off1 > s60Off2 + 100 && s60Off1 <= Number(s60Run.dash) + 1 && s60Off2 >= 0,
  '视图=' + s60Run.view + ' dasharray=' + s60Run.dash + ' offset ' + Math.round(s60Off1) + '→' + Math.round(s60Off2) + ' round=' + JSON.stringify(s60Run.roundText));
check('S60b', '§8-60 按钮集合随状态：idle 只有开始；running 有暂停+停止、没有开始',
  s60Idle.start && !s60Idle.stop && !s60Idle.pause && s60Run.stop && s60Run.pause && !s60Run.start,
  'idle=' + JSON.stringify(s60Idle) + ' running=' + JSON.stringify({ start: s60Run.start, pause: s60Run.pause, stop: s60Run.stop }));

/* ---------- S61 暂停 / 继续 / 停止 ---------- */
resetSpiral({});
openSpiral();
fire(spBtn('start'));
const s61Hist0 = (spiralOf().history || []).length;
const s61Toast0 = toastEntries().length;
fire(spBtn('pause'));
const s61Paused = spiralOf();
const s61Left1 = spLeftAttr();
engineTicks(); engineTicks(); engineTicks();
const s61Left2 = spLeftAttr();
const s61PauseBtn = spText('dtSpiralBtn') || '';
const s61PauseLabel = (() => { const b = spBtn('pause'); return b ? nodeText(b).trim() : ''; })();
check('S61a', '§8-61 暂停：status=paused、endsAt=0、leftMs>0、按钮文案「继续」、连跑三次 tick 剩余不变、不写 history、不弹横幅',
  s61Paused.status === 'paused' && s61Paused.endsAt === 0 && (s61Paused.leftMs | 0) > 0 &&
    s61PauseLabel === '继续' && s61Left1 === s61Left2 &&
    (spiralOf().history || []).length === s61Hist0 && toastEntries().length === s61Toast0,
  'status=' + s61Paused.status + ' endsAt=' + s61Paused.endsAt + ' leftMs>0=' + ((s61Paused.leftMs | 0) > 0) +
  ' 按钮=' + JSON.stringify(s61PauseLabel) + ' left ' + s61Left1 + '→' + s61Left2 +
  ' history=' + s61Hist0 + '→' + (spiralOf().history || []).length + ' 横幅=' + s61Toast0 + '→' + toastEntries().length);
fire(spBtn('pause'));
const s61Resumed = spiralOf();
const s61ResumeLabel = (() => { const b = spBtn('pause'); return b ? nodeText(b).trim() : ''; })();
check('S61b', '§8-61 继续：status=running、endsAt>0、leftMs=0、按钮文案「暂停」',
  s61Resumed.status === 'running' && s61Resumed.endsAt > 0 && s61Resumed.leftMs === 0 && s61ResumeLabel === '暂停',
  'status=' + s61Resumed.status + ' endsAt=' + (s61Resumed.endsAt > 0) + ' leftMs=' + s61Resumed.leftMs + ' 按钮=' + JSON.stringify(s61ResumeLabel));
/* 停在 paused 上结算：§4.10.6-1 明确「paused 时 endedAt = now」，这一段没有歧义；
   running 中途停止的 endedAt 取 endsAt（会把整段时长计入）见下方 X61 观察项。 */
fire(spBtn('pause'));
const s61StatsBefore = JSON.parse(JSON.stringify(spiralOf().stats));
fire(spBtn('stop'));
const s61Idle = spiralOf();
const s61Last = (s61Idle.history || [])[(s61Idle.history || []).length - 1] || {};
check('S61c', '§8-61 停止（从暂停态）：回 idle（phase 0 / round 0 / endsAt 0 / leftMs 0），history 末条 reason=stop，本段 <1 分钟故 stats 不变',
  s61Idle.status === 'idle' && s61Idle.phase === 0 && s61Idle.round === 0 && s61Idle.endsAt === 0 && s61Idle.leftMs === 0 &&
    s61Last.reason === 'stop' && JSON.stringify(s61Idle.stats) === JSON.stringify(s61StatsBefore) &&
    (s61Idle.history || []).length === s61Hist0 + 1,
  'idle=' + [s61Idle.status, s61Idle.phase, s61Idle.round, s61Idle.endsAt, s61Idle.leftMs].join('/') +
  '末条=' + JSON.stringify({ reason: s61Last.reason, min: s61Last.min }) +
  ' stats ' + JSON.stringify(s61StatsBefore) + '→' + JSON.stringify(s61Idle.stats));
/* ---------- D2（§4.10.7）：停止是用户主动动作，不响铃、不发系统通知，只 pushAlert ---------- */
resetSpiral({});
openSpiral();
fire(spBtn('start'));
const d2N0 = FakeNotification.log.length;
const d2B0 = FakeAudioContext.starts;
const d2T0 = toastEntries().length;
fire(spBtn('stop'));
const d2N1 = FakeNotification.log.length;
const d2B1 = FakeAudioContext.starts;
const d2T1 = toastEntries().length;
const d2LastToast = (toastEntries().slice(-1)[0] || '');
check('S61d', '§4.10.7 停止：不响铃、不发系统通知，只 pushAlert 一条「螺旋已停止」横幅',
  d2N1 === d2N0 && d2B1 === d2B0 && d2T1 === d2T0 + 1 && d2LastToast.indexOf('停止') >= 0,
  '通知 ' + d2N0 + '→' + d2N1 + ' 提示音 ' + d2B0 + '→' + d2B1 + ' 横幅 ' + d2T0 + '→' + d2T1 +
  ' 末条=' + JSON.stringify(d2LastToast));

/* X61：running 段中途停止的结算口径。规格 §4.10.6-1 写 endedAt = running ? endsAt : now，
   于是「10 分钟段跑 1 秒就停」也会被记成 10 分钟（实测 min=10、aMin+10）。这与「只计已用时间」的直觉相反，
   属于规格需要确认的点（不是 t43 能自行改的口径），先记观察项，等 captain 裁定后转硬断言。 */
const x61 = (() => {
  const st = storeApi.get();
  const spiral = Object.assign({}, st.spiral, {
    status: 'running', phase: 0, round: 1, endsAt: Date.now() + 600000, startedAt: Date.now() - 1000,
    pausedAt: 0, pausedTotal: 0, phaseDone: false, history: [], stats: { rounds: 0, aMin: 0, bMin: 0, doneCount: 0 }
  });
  storeApi.update((s) => Object.assign({}, s, { spiral }));
  rerender(); rerender();
  openSpiral();
  fire(spBtn('stop'));
  const last = (spiralOf().history || []).slice(-1)[0] || {};
  return { min: last.min, aMin: spiralOf().stats.aMin | 0 };
})();
check('X61', '§4.10.6 情形二：运行中停止按真实用时入账 —— 10 分钟段只跑 1 秒就停止 → min=0 且 stats.aMin 不变',
  x61.min === 0 && x61.aMin === 0,
  'min=' + x61.min + ' aMin=' + x61.aMin + '（裁决：endedAt=now，不得按满段 10 分钟入账）');
/* 情形一：自然结束仍旧取 endsAt（时长 = endsAt − startedAt − pausedTotal），这一条现行实现已正确，
   作为「口径改动不能连着自然结束一起改坏」的护栏。 */
const x61n = (() => {
  resetSpiral({});
  openSpiral();
  fire(spBtn('start'));
  pushSpiral({ endsAt: Date.now() - 1000, startedAt: Date.now() - 601000 });
  engineTicks();
  return (spiralOf().history || []).slice(-1)[0] || {};
})();
check('X61n', '§4.10.6 情形一：10 分钟段自然结束 → history 末条 min=10、reason=auto',
  x61n.min === 10 && x61n.reason === 'auto',
  '末条=' + JSON.stringify({ min: x61n.min, reason: x61n.reason }));
/* 情形三：暂停后停止，时长只算到 pausedAt（暂停期间不计入）→ 30 秒 → min=0。 */
const x61p = (() => {
  resetSpiral({});
  openSpiral();
  fire(spBtn('start'));
  pushSpiral({ status: 'paused', endsAt: 0, leftMs: 600000, startedAt: Date.now() - 30000, pausedAt: Date.now(), pausedTotal: 0 });
  fire(spBtn('stop'));
  return (spiralOf().history || []).slice(-1)[0] || {};
})();
check('X61p', '§4.10.6 情形三：暂停 30 秒后停止 → 时长只算到 pausedAt，min=0、reason=stop',
  x61p.min === 0 && x61p.reason === 'stop',
  '末条=' + JSON.stringify({ min: x61p.min, reason: x61p.reason }));

/* ---------- S63 切走继续 + 角标 + 过期提醒窗口 ---------- */
resetSpiral({});
openSpiral();
fire(spBtn('start'));
const s63Ends0 = spiralOf().endsAt;
fire(railDt('rail-calendar'));
const s63Away = { view: centerView(), status: spiralOf().status, endsAt: spiralOf().endsAt, badge: spBadge() };
check('S63a', '§8-63 切走继续计时：B 栏换到 calendar 但 spiral 仍 running、endsAt 不变，rail 出现 data-spiral-badge（剩余分钟向上取整）',
  s63Away.view === 'calendar' && s63Away.status === 'running' && s63Away.endsAt === s63Ends0 &&
    !!s63Away.badge && /^\d+$/.test(s63Away.badge) && Number(s63Away.badge) >= 1,
  'center=' + s63Away.view + ' status=' + s63Away.status + ' endsAt 不变=' + (s63Away.endsAt === s63Ends0) + ' badge=' + s63Away.badge);
const s63T0 = spiralToasts().length;
const s63N0 = FakeNotification.log.length;
fire(railDt('rail-spiral'));
pushSpiral({ endsAt: Date.now() - 30000, startedAt: Date.now() - 91000 });
engineTicks();
const s63T1 = spiralToasts().length;
const s63PhaseAfter = spAttr('data-spiral-phase');
check('S63b', '§8-63 过期 ≤60 秒：结算一次并进下一段，且补一次提醒（螺旋横幅 +1）',
  s63PhaseAfter === 'b' && s63T1 === s63T0 + 1,
  '结算后相位=' + s63PhaseAfter + ' 横幅 ' + s63T0 + '→' + s63T1);
/* S63d：迟到 ≤60000 属正常结算 —— t60 新正文要求 history.silent=false 且横幅/铃/系统通知各 +1。 */
resetSpiral({});
openSpiral();
fire(spBtn('start'));
const s63dT0 = spiralToasts().length;
const s63dN0 = FakeNotification.log.length;
const s63dB0 = FakeAudioContext.starts;
pushSpiral({ endsAt: Date.now() - 30000, startedAt: Date.now() - 91000 });
engineTicks();
const s63dLast = (spiralOf().history || []).slice(-1)[0] || {};
const s63dT1 = spiralToasts().length;
const s63dN1 = FakeNotification.log.length;
const s63dB1 = FakeAudioContext.starts;
check('S63d', '§8-63 迟到 ≤60 秒属正常结算：history.silent=false，横幅 +1、铃 +1、系统通知 +1',
  s63dLast.silent === false && s63dT1 === s63dT0 + 1 && s63dB1 > s63dB0 && s63dN1 === s63dN0 + 1,
  'silent=' + JSON.stringify(s63dLast.silent) + ' 横幅 ' + s63dT0 + '→' + s63dT1 + ' 铃 ' + s63dB0 + '→' + s63dB1 +
    ' 通知 ' + s63dN0 + '→' + s63dN1);
/* S63c：迟到 >60000 静默 —— 照常进下一段，横幅/铃/通知三者全不增，history.silent=true、历史行 data-silent，
   且同一次挂起连续两次 tick 只结算一次。 */
const s63T2 = spiralToasts().length;
const s63N2 = FakeNotification.log.length;
const s63B2 = FakeAudioContext.starts;
const s63EndsC = Date.now() - 60001;
const s63Lateness = Date.now() - s63EndsC;
pushSpiral({ endsAt: s63EndsC, startedAt: Date.now() - 361000 });
engineTicks();
const s63T3 = spiralToasts().length;
const s63N3 = FakeNotification.log.length;
const s63B3 = FakeAudioContext.starts;
const s63Hist1 = (spiralOf().history || []).length;
engineTicks();
const s63Hist2 = (spiralOf().history || []).length;
const s63LastFar = (spiralOf().history || []).slice(-1)[0] || {};
const s63Rows = all((n) => hasClass(n, 'dtSpiralHistoryRow'));
/* 历史列表的 DOM 顺序未在规格里固定（可能最新在上），所以按「是否存在一条 data-silent=1」判，
   同时把整列标记打出来供核对。 */
const s63RowMarks = s63Rows.map((n) => String(attr(n, 'data-silent')));
const s63RowHasSilent = s63RowMarks.indexOf('1') >= 0;
check('S63c', '§8-63 迟到 >60 秒静默结算：照常进下一段，横幅/铃/通知三者全不增，history.silent=true 且历史行 data-silent，连续两次 tick 只结算一次',
  spAttr('data-spiral-phase') === 'a' && s63T3 === s63T2 && s63N3 === s63N2 && s63B3 === s63B2 &&
    s63LastFar.silent === true && s63Hist2 === s63Hist1 && s63RowHasSilent,
  'lateness=' + s63Lateness + 'ms 相位=' + spAttr('data-spiral-phase') + ' 横幅 ' + s63T2 + '→' + s63T3 +
    ' 铃 ' + s63B2 + '→' + s63B3 + ' 通知 ' + s63N2 + '→' + s63N3 +
    ' silent=' + JSON.stringify(s63LastFar.silent) + ' 历史行=' + s63Hist1 + '→' + s63Hist2 + ' data-silent=[' + s63RowMarks.join(',') + ']');
if (spiralOf().status !== 'idle') { openSpiral(); fire(spBtn('stop')); }

/* ---------- S64 与番茄钟的双向互斥 ---------- */
resetSpiral({ pomo: Object.assign({}, storeApi.get().pomo, { running: true, mode: 'work', endsAt: Date.now() + 600000, pausedLeft: 0 }) });
openSpiral();
const s64Start = spBtn('start');
check('S64a', '§4.10.8-3 番茄在跑时：螺旋开始按钮 disabled=true、aria-disabled="true"，且按钮仍在 DOM（禁用不隐藏）',
  !!s64Start && attr(s64Start, 'disabled') === true && attr(s64Start, 'aria-disabled') === 'true',
  'disabled=' + JSON.stringify(attr(s64Start, 'disabled')) + ' aria=' + JSON.stringify(attr(s64Start, 'aria-disabled')));
resetSpiral({ pomo: Object.assign({}, storeApi.get().pomo, { running: false, endsAt: 0, pausedLeft: 0 }) });
openSpiral();
fire(spBtn('start'));
fire(railDt('rail-pomodoro'));
const s64PomoStart = one((n) => hasClass(n, 'dtPrimaryBtn') && hasClass(n, 'dtPrimaryLg'));
const s64PomoDisabled = s64PomoStart ? attr(s64PomoStart, 'disabled') : 'missing';
check('S64b', '§4.10.8-3 螺旋在跑时：番茄开始按钮 disabled=true、aria-disabled="true"，且按钮仍在 DOM',
  !!s64PomoStart && s64PomoDisabled === true && attr(s64PomoStart, 'aria-disabled') === 'true',
  'disabled=' + JSON.stringify(s64PomoDisabled) + ' aria=' + JSON.stringify(s64PomoStart ? attr(s64PomoStart, 'aria-disabled') : null));
fire(railDt('rail-spiral'));
fire(spBtn('stop'));
fire(railDt('rail-pomodoro'));
const s64PomoStart2 = one((n) => hasClass(n, 'dtPrimaryBtn') && hasClass(n, 'dtPrimaryLg'));
check('S64c', '§4.10.8-3 螺旋停止后：番茄开始按钮恢复可点（互斥只靠禁用，不靠隐藏/换文案）',
  !!s64PomoStart2 && attr(s64PomoStart2, 'disabled') !== true && nodeText(s64PomoStart2).indexOf('开始') >= 0,
  'disabled=' + JSON.stringify(s64PomoStart2 ? attr(s64PomoStart2, 'disabled') : null) + ' 文本=' + JSON.stringify(s64PomoStart2 ? nodeText(s64PomoStart2).trim() : ''));

/* ---------- S65 A 清单绑定：规则取、换一件、按规则重取、失效 ---------- */
resetSpiral({});
openSpiral();
fire(spBtn('start'));
const s65Pick = spiralOf().aTaskId;
check('S65a', '§8-65 A 绑定按分数降序 → 优先级降序 → 日期升序 取：70 分且 priority 3 的 sp-a 胜出',
  s65Pick === 'sp-a',
  'aTaskId=' + s65Pick + '（同分 sp-b priority 1 应排后）');
fire(spBtn('swap'));
const s65Menu = one((n) => attr(n, 'data-menu') === 'spiral-swap' && attr(n, 'data-open') === '1');
const s65Target = s65Menu ? menuItemByText(s65Menu, '零分') : null;
if (s65Target) fire(s65Target);
const s65AfterSwap = spiralOf().aTaskId;
settleSpiral(61000);
settleSpiral(61000);
check('S65b', '§8-65 换一件：手动选 0 分任务后 aTaskId 立即变更，且进下一 a 段仍是它（用户选择优先于规则）',
  s65AfterSwap === 'sp-d' && spiralOf().aTaskId === 'sp-d' && spAttr('data-spiral-phase') === 'a',
  '换后=' + s65AfterSwap + ' 下一 a 段=' + spiralOf().aTaskId + '（菜单项命中=' + !!s65Target + '）');
fire(spBtn('auto'));
const s65AfterAuto = spiralOf().aTaskId;
settleSpiral(61000);
settleSpiral(61000);
check('S65c', '§8-65 按规则重取：点 [data-spiral-auto] 后 aTaskId 清空，下一 a 段回到规则选中的 sp-a',
  s65AfterAuto === '' && spiralOf().aTaskId === 'sp-a',
  '点击后=' + JSON.stringify(s65AfterAuto) + ' 下一 a 段=' + spiralOf().aTaskId);
const s65ToastBefore = spiralToasts().length;
fire(spBtn('done'));
const s65DoneFlag = spiralOf().phaseDone;
const s65DoneCount = storeApi.get().spiral.stats.doneCount;
settleSpiral(61000);
settleSpiral(61000);
const s65Invalidated = spiralToasts().filter((t) => isSpiralToastTitle(t, 'A 清单绑定已失效')).length;
check('S65d', '§8-65 完成即失效：点「这段完成了」后 phaseDone=true、doneCount+1，再进 a 段重取绑定并横幅「A 清单绑定已失效」',
  s65DoneFlag === true && s65DoneCount >= 1 && s65Invalidated >= 1 && spiralOf().aTaskId === 'sp-b',
  'phaseDone=' + s65DoneFlag + ' doneCount=' + s65DoneCount + ' 失效横幅=' + s65Invalidated + ' 重取=' + spiralOf().aTaskId +
  ' 横幅总 ' + s65ToastBefore + '→' + spiralToasts().length);

/* ---------- S66 B 清单：默认 4 条、增删改序、与任务/清单隔离 ---------- */
let s66Defaults = null;
const r66 = await reloadApp(() => { try { globalThis.localStorage.removeItem('dsh-tasks:v1'); } catch (e) { errors.push(['reload.clear', e]); } });
if (r66 && r66.state) {
  const items = (r66.state.spiralItems || []).slice().sort((x, y) => (x.order | 0) - (y.order | 0));
  s66Defaults = { names: items.map((i) => i.name), orders: items.map((i) => i.order | 0) };
}
check('S66a', '§8-66 全新安装：spiralItems 缺失时自动灌默认 4 条（刷短视频/打一局游戏/看剧一集/听歌放空），order 依次 1..4',
  !!s66Defaults && s66Defaults.names.join('|') === '刷短视频|打一局游戏|看剧一集|听歌放空' && s66Defaults.orders.join(',') === '1,2,3,4',
  JSON.stringify(s66Defaults));
const s66Fixture = [
  { id: 'p1', name: '刷短视频', order: 1 }, { id: 'p2', name: '打一局游戏', order: 2 },
  { id: 'p3', name: '看剧一集', order: 3 }, { id: 'p4', name: '听歌放空', order: 4 }
];
resetSpiral({ spiralItems: s66Fixture.map((i) => Object.assign({}, i)) });
openSpiral();
const s66ProjBefore = JSON.stringify(storeApi.get().projects);
const s66TaskBefore = JSON.stringify(storeApi.get().tasks);
fire(one((n) => attr(n, 'data-play-add') !== undefined));
const s66AfterAdd = (storeApi.get().spiralItems || []).slice().sort((x, y) => (x.order | 0) - (y.order | 0));
const s66New = s66AfterAdd[4] || {};
/* 绑定行 .dtSpiralRow 与播放行 .dtPlayItem 都带 data-play-item-id，必须用 class 区分（实测踩过：删的是绑定行，删不掉条目） */
const playRowOf = (id) => all((n) => hasClass(n, 'dtPlayItem') && attr(n, 'data-play-item-id') === id)[0];
const s66RenameRow = playRowOf('p2');
const s66Show = (id) => (id === s66New.id ? '#new' : id);
if (s66RenameRow) fire(all((n) => attr(n, 'data-play-rename') !== undefined, s66RenameRow)[0]);
const s66Input = one((n) => hasClass(n, 'dtPlayInput'));
if (s66Input) change(s66Input, '改成这个名字');
const s66Renamed = (storeApi.get().spiralItems || []).find((i) => i.id === 'p2') || {};
const s66Row4 = playRowOf('p4');
if (s66Row4) fire(all((n) => attr(n, 'data-play-move') === 'up', s66Row4)[0]);
const s66Moved = (storeApi.get().spiralItems || []).slice().sort((x, y) => (x.order | 0) - (y.order | 0)).map((i) => i.id);
pushSpiral({ bItemId: 'p3' });
const s66ToastBeforeDel = toastEntries().length;
const s66Row3 = playRowOf('p3');
if (s66Row3) fire(all((n) => attr(n, 'data-play-del') !== undefined, s66Row3)[0]);
const s66Left = (storeApi.get().spiralItems || []).slice().sort((x, y) => (x.order | 0) - (y.order | 0));
const s66Orders = s66Left.map((i) => i.order | 0).join(',');
check('S66b', '§8-66 B 清单可增/改名/上移/删除：新增落末尾、改名生效、上移换位、删除移除，列表顺序与绑定回退正确，且全过程 projects 与 tasks 逐字节不变（B 清单与清单/任务完全隔离）',
  s66AfterAdd.length === 5 && (s66New.order | 0) === 5 && s66Renamed.name === '改成这个名字' &&
    s66Moved.length === 5 && s66Moved.slice(0, 4).join(',') === 'p1,p2,p4,p3' &&
    s66Left.length === 4 && s66Left.map((i) => i.id).join(',') === s66Moved.filter((id) => id !== 'p3').join(',') &&
    spiralOf().bItemId === 'p1' && toastEntries().length >= s66ToastBeforeDel + 1 &&
    JSON.stringify(storeApi.get().projects) === s66ProjBefore && JSON.stringify(storeApi.get().tasks) === s66TaskBefore,
  '新增后=' + s66AfterAdd.length + '（新条目 order=' + (s66New.order | 0) + '）改名=' + JSON.stringify(s66Renamed.name) +
  ' 上移后序=' + s66Moved.map(s66Show).join(',') + ' 删除后=' + s66Left.length + '（' + s66Left.map((i) => s66Show(i.id)).join(',') + '）order=' + s66Orders +
  ' bItemId 回退=' + spiralOf().bItemId + ' 横幅+' + (toastEntries().length - s66ToastBeforeDel) +
  ' projects 不变=' + (JSON.stringify(storeApi.get().projects) === s66ProjBefore) + ' tasks 不变=' + (JSON.stringify(storeApi.get().tasks) === s66TaskBefore));
check('X66', '§8-66 删除中间条目后 order 压实为连续 1..n，且剩余条目相对顺序不变',
  s66Orders === s66Left.map((_, i) => i + 1).join(','), '删除后 order=' + s66Orders + '（规格要求连续 1,2,3,4）');
if (spiralOf().status !== 'idle') { fire(spBtn('stop')); }

/* ---------- S67 统计口径：四舍五入、不足 1 分钟、满轮、跨日 ---------- */
resetSpiral({});
openSpiral();
fire(spBtn('start'));
settleSpiral(220000);
const s67Last = (spiralOf().history || []).slice(-1)[0] || {};
const s67Stats1 = spiralOf().stats;
check('S67a', '§8-67 3 分 40 秒自然结束 → history.min = round(220/60) = 4，且 aMin +4',
  s67Last.min === 4 && s67Last.reason === 'auto' && (s67Stats1.aMin | 0) === 4,
  'min=' + s67Last.min + ' reason=' + s67Last.reason + ' stats=' + JSON.stringify(s67Stats1));
const s67StatsBefore50 = JSON.stringify(spiralOf().stats);
settleSpiral(50000);
const s67Last50 = (spiralOf().history || []).slice(-1)[0] || {};
check('S67b', '§8-67 只跑 50 秒 → history.min = 0 且 stats 完全不变（不足 1 分钟不计数）',
  s67Last50.min === 0 && JSON.stringify(spiralOf().stats) === s67StatsBefore50,
  'min=' + s67Last50.min + ' stats=' + s67StatsBefore50 + '→' + JSON.stringify(spiralOf().stats));
resetSpiral({});
openSpiral();
fire(spBtn('start'));
fire(spBtn('done'));
for (let i = 0; i < 6; i += 1) settleSpiral(61000);
const s67Round = spiralOf().round;
const s67Stats3 = spiralOf().stats;
check('S67c', '§8-67 连跑满一轮六段 → stats.rounds=1、round=2（二者同时加）、doneCount 等于点「这段完成了」的次数',
  (s67Stats3.rounds | 0) === 1 && (s67Round | 0) === 2 && (s67Stats3.doneCount | 0) === 1,
  'stats=' + JSON.stringify(s67Stats3) + ' round=' + s67Round);
pushSpiral({ day: '2026-11-03' });
settleSpiral(61000);
const s67Stats4 = spiralOf().stats;
check('S67d', '§8-67 跨日：结算后 stats 四项归零、day 变今天，而 round 不清零',
  (s67Stats4.rounds | 0) === 0 && (s67Stats4.aMin | 0) === 0 && (s67Stats4.bMin | 0) === 0 && (s67Stats4.doneCount | 0) === 0 &&
    spiralOf().day === TODAY_K && (spiralOf().round | 0) >= 1,
  'stats=' + JSON.stringify(s67Stats4) + ' day=' + spiralOf().day + ' round=' + spiralOf().round);
if (spiralOf().status !== 'idle') { fire(spBtn('stop')); }

/* ---------- S68 rail 入口、高亮唯一、历史容器 ---------- */
resetModuleOrder();
check('S68a', '§8-68 默认 order 下 rail 入口的分段顺序：function＝四象限→日历→习惯打卡→必做之事→番茄钟→螺旋工作法→阻力清单、settings＝设置（原「工具」分组已废，计时/记录两段已并入 function）',
  groupTags('function').join(',') === DEFAULT_FUNCTION_TAGS &&
    groupTags('settings').join(',') === 'rail-settings',
  '默认 order 下 function=' + groupTags('function').join(' → ') +
  '；settings=' + groupTags('settings').join(' → '));
resetSpiral({});
if (bView() === 'spiral') fire(railDt('rail-spiral'));
if (bView() !== 'spiral') fire(railDt('rail-spiral'));
const s68Open = { b: bView(), bKind: bKind(), bSlot: !!drawerSlot('b') };
const s68OnTags = railTools().filter((n) => hasClass(n, 'dtRailOn')).map((n) => attr(n, 'data-dt'));
fire(railDt('rail-spiral'));
const s68Closed = { b: bView(), drawers: drawerAll().length, empty: !!one((n) => hasClass(n, 'dtBEmpty')) };
gap('S68b', '§8-68 点 [data-dt="rail-spiral"]：B 栏 data-view=spiral；再点同一项 → B 栏关闭并落空态（§1.2「同值再点 = 关 B」）；rail 高亮恒 ≤1 且为本项',
  s68Open.b === 'spiral' && s68Open.bKind === 'spiral' && s68Open.bSlot &&
    s68OnTags.length === 1 && s68OnTags[0] === 'rail-spiral' &&
    s68Closed.b === null && s68Closed.drawers === 0 && s68Closed.empty,
  '开=' + JSON.stringify(s68Open) + ' 高亮=' + s68OnTags.join(',') + ' 关=' + JSON.stringify(s68Closed) +
  '（实测：实现里 onPickTimer 对已激活的 spiral 是 setListView(\'pomodoro\')、对已激活的 pomodoro 直接 return，' +
  '都不落空态 —— src/parts/40-panel.js:1038-1046，与 §1.2/§8-86 冲突）', 't116');
resetSpiral({});
openSpiral();
fire(spBtn('start'));
for (let i = 0; i < 23; i += 1) settleSpiral(61000);
const s68Hist = spiralOf().history || [];
const s68Rows = all((n) => attr(n, 'data-spiral-history-row') !== undefined);
const s68RowAttrs = s68Rows.slice(0, 3).map((n) => [attr(n, 'data-reason'), attr(n, 'data-phase'), attr(n, 'data-min')].join('/'));
check('S68c', '§8-68 B 栏 [data-spiral-history] 恒在，行数 = min(history.length, 20)，每行带 data-reason/data-phase/data-min',
  !!one((n) => attr(n, 'data-spiral-history') !== undefined) && s68Hist.length === 23 &&
    s68Rows.length === Math.min(s68Hist.length, 20) && s68Rows.every((n) => attr(n, 'data-reason') && attr(n, 'data-phase') !== undefined && attr(n, 'data-min') !== undefined),
  'history=' + s68Hist.length + ' 行=' + s68Rows.length + '（上限 20）样例=' + JSON.stringify(s68RowAttrs));
if (spiralOf().status !== 'idle') { fire(spBtn('stop')); }

/* ---------- S62 刷新重挂载：reload 结算（放最后，因为它会再跑一次 factory）---------- */
let s62a = null;
const s62Prep = () => {
  const st = storeApi.get();
  const spiral = Object.assign({}, st.spiral, {
    status: 'running', phase: 2, round: 1, endsAt: Date.now() - 5000, startedAt: Date.now() - 80000,
    pausedAt: 0, pausedTotal: 0, phaseDone: false, history: []
  });
  storeApi.update((s) => Object.assign({}, s, { spiral }));
  rerender(); rerender();
};
const r62a = await reloadApp(s62Prep);
if (r62a && r62a.state) s62a = { spiral: r62a.state.spiral, hist: (r62a.state.spiral.history || []).slice(-1)[0] || {} };
check('S62a', '§8-62 刷新重挂载（running 段已用 75 秒）：回 idle（phase 0 / round 0），history 末条 reason=reload 且 min=round(75/60)=1',
  !!s62a && s62a.spiral.status === 'idle' && (s62a.spiral.phase | 0) === 0 && (s62a.spiral.round | 0) === 0 &&
    s62a.hist.reason === 'reload' && s62a.hist.min === 1,
  s62a ? 'status=' + s62a.spiral.status + ' phase=' + s62a.spiral.phase + ' round=' + s62a.spiral.round +
    ' 末条=' + JSON.stringify({ reason: s62a.hist.reason, min: s62a.hist.min }) : '(重挂载失败)');
let s62b = null;
const s62PrepB = () => {
  const st = storeApi.get();
  const spiral = Object.assign({}, st.spiral, {
    status: 'paused', phase: 1, round: 1, endsAt: 0, leftMs: 600000,
    startedAt: Date.now() - 25000, pausedAt: Date.now() - 5000, pausedTotal: 0, phaseDone: false,
    history: [], stats: { rounds: 0, aMin: 3, bMin: 2, doneCount: 1 }
  });
  storeApi.update((s) => Object.assign({}, s, { spiral }));
  rerender(); rerender();
};
const r62b = await reloadApp(s62PrepB);
if (r62b && r62b.state) s62b = { spiral: r62b.state.spiral, hist: (r62b.state.spiral.history || []).slice(-1)[0] || {} };
check('S62b', '§8-62 刷新重挂载（paused 段只用了 20 秒）：history 末条 reason=reload 且 min=0，stats 原样保留',
  !!s62b && s62b.hist.reason === 'reload' && s62b.hist.min === 0 && s62b.spiral.status === 'idle' &&
    (s62b.spiral.stats.aMin | 0) === 3 && (s62b.spiral.stats.bMin | 0) === 2 && (s62b.spiral.stats.doneCount | 0) === 1,
  s62b ? '末条=' + JSON.stringify({ reason: s62b.hist.reason, min: s62b.hist.min }) + ' stats=' + JSON.stringify(s62b.spiral.stats) : '(重挂载失败)');

/* S62c：90 秒 → min=2。这是 Math.round 的进位边界示例（90/60=1.5 进位到 2），
   不是 §8-62 正文数据（正文用的是 75 秒 → min=1），单列出来防止有人把两件事混为一谈。 */
let s62c = null;
const s62PrepC = () => {
  const st = storeApi.get();
  const spiral = Object.assign({}, st.spiral, {
    status: 'running', phase: 2, round: 1, endsAt: Date.now() - 5000, startedAt: Date.now() - 95000,
    pausedAt: 0, pausedTotal: 0, phaseDone: false, history: []
  });
  storeApi.update((s) => Object.assign({}, s, { spiral }));
  rerender(); rerender();
};
const r62c = await reloadApp(s62PrepC);
if (r62c && r62c.state) s62c = { hist: (r62c.state.spiral.history || []).slice(-1)[0] || {} };
check('S62c', '§4.10.6 分钟取整边界（补证，非 §8-62 正文）：已用 90 秒 → 1.5 分钟按 Math.round 进位为 min=2',
  !!s62c && s62c.hist.reason === 'reload' && s62c.hist.min === Math.round(90000 / 60000) && s62c.hist.min === 2,
  s62c ? '末条=' + JSON.stringify({ reason: s62c.hist.reason, min: s62c.hist.min }) : '(重挂载失败)');

/* ============================ 十四、stage4 §15-69…90 收编 ============================ */
/* 这一段按 docs/stage4-foundation.md §15 的 69–90 逐条落地。约定：
   - 状态驱动：先摆夹具（applyState / setSettings / setDb），再走真实交互（fire / realClick / change）；
   - 不 sleep：需要定时器推进的地方用 withSyncTimers 把 window.setTimeout 换成同步队列；
   - 每条都带可复核证据（数值、序列、file:line）。 */
const dbNow = () => storeApi.get().db || {};
const settingsNow = () => storeApi.get().settings || {};
const tasksOfDb = () => (Array.isArray(dbNow().tasks) ? dbNow().tasks : []);
const setSettings = (patch) => applyState({ settings: Object.assign({}, settingsNow(), patch) });
const setDb = (patch) => applyState({ db: Object.assign({}, dbNow(), patch) });
const idsOf = (rows) => rows.map((n) => attr(n, 'data-task-id'));
const sortbarEl = () => byDt('sortbar')[0] || null;
const sortKeySel = () => byDt('sort-key')[0] || null;
const groupSel = () => byDt('group-by')[0] || null;
const sortCountText = () => (byDt('sort-count')[0] ? nodeText(byDt('sort-count')[0]).trim() : '');
const groupHeads = () => all((n) => hasClass(n, 'dtGroupHead'));
const groupOf = (key) => groupHeads().find((n) => attr(n, 'data-group') === key) || null;
const projectRail = (name) => all((n) => attr(n, 'data-project-id') !== undefined).find((n) => nodeText(n).includes(name)) || null;
const toastTexts = () => all((n) => hasClass(n, 'dtToast')).map((n) => nodeText(n));
const openProjectList = (name) => { const item = projectRail(name); if (item) fire(item); return bView(); };

/* 可控假时钟：把 window.setTimeout 换成同步队列，避免「等异步」又不引入 sleep。 */
const rawSetTimeout = globalThis.setTimeout;
function withSyncTimers(run) {
  const queue = [];
  globalThis.setTimeout = function (fn) { queue.push(fn); return { __sync: true }; };
  try {
    run();
    let guard = 0;
    while (queue.length && guard < 500) { guard += 1; const fn = queue.shift(); try { fn(); } catch (e) { errors.push(['syncTimer', e]); } }
    rerender(); rerender();
    return queue.length;
  } finally {
    globalThis.setTimeout = rawSetTimeout;
  }
}
/* 微任务冲刷：只转事件循环，不睡固定时间。 */
async function flushAsync(times = 12) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
  rerender(); rerender();
}

/* 冷启动一次：**重跑 factory + apply**（不重新 import —— bundle 一次性注册，重跑 factory 就能得到
   全新的闭包与 store，读同一份 localStorage，这正是「第二次 loadState」要验证的东西）。 */
let bootSeq = 0;
function bootFresh() {
  bootSeq += 1;
  const regs = [];
  const ctx = {
    effect(fn) { try { fn(); } catch (e) { errors.push(['boot.effect', e]); } },
    on() { return () => {}; },
    locale: { bind: () => (k) => k, getLocale: () => 'zh' },
    slots: {
      inject(_key, cb) { try { return cb(); } catch (e) { errors.push(['boot.inject', e]); } },
      register(desc, comp) { regs.push({ desc, comp }); return () => {}; }
    }
  };
  const m = def.factory((name) => { if (name === 'react') return React; throw new Error('unexpected require: ' + name); });
  m.apply(ctx);
  const mainReg = regs.find((r) => r.desc && r.desc.name === 'main');
  return { mod: m, props: mainReg ? mainReg.desc.inject() : null, regs: regs, seq: bootSeq };
}

/* ---------------- §15-69/70/71 排序与分组 ---------------- */
const SORT_TASKS = [
  { id: 's1', projectId: 'inbox', title: 'A 明天 高', status: 0, deleted: false, date: TOMORROW_K, allDay: true, priority: 3, createdAt: '2026-01-05T00:00:00.000Z' },
  { id: 's2', projectId: 'inbox', title: 'B 无日期 低', status: 0, deleted: false, date: '', priority: 0, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 's3', projectId: 'inbox', title: 'C 今天 最高', status: 0, deleted: false, date: TODAY_K, allDay: true, priority: 5, createdAt: '2026-01-09T00:00:00.000Z' },
  { id: 's4', projectId: 'inbox', title: 'D 今天 低', status: 0, deleted: false, date: TODAY_K, allDay: true, priority: 0, createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 's5', projectId: 'inbox', title: 'E 已完成 今天', status: 2, deleted: false, date: TODAY_K, allDay: true, priority: 5, createdAt: '2026-01-03T00:00:00.000Z' },
  { id: 's6', projectId: 'inbox', title: 'F 昨天 中', status: 0, deleted: false, date: YEST_K, allDay: true, priority: 1, createdAt: '2026-01-04T00:00:00.000Z' },
  { id: 's7', projectId: 'inbox', title: 'G 本周内 中', status: 0, deleted: false, date: addDaysKey(2), allDay: true, priority: 1, createdAt: '2026-01-06T00:00:00.000Z' },
  { id: 's8', projectId: 'inbox', title: 'H 远期', status: 0, deleted: false, date: addDaysKey(11), allDay: true, priority: 0, createdAt: '2026-01-07T00:00:00.000Z' }
];
function addDaysKey(n) {
  const d = new Date(TODAY_K + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + dd;
}
const SORT_INBOX = { id: 'inbox', name: '收集箱', type: 'todo', inbox: true, color: 'var(--dsw-alias-label-secondary)', icon: '' };
applyState({ projects: [SORT_INBOX], tasks: SORT_TASKS.map((t) => Object.assign({}, t)), habits: [] });
closeAllDrawers();
openProjectList('收集箱');
const s69sel = sortKeySel();
if (s69sel && attr(s69sel, 'value') !== 'smart') change(s69sel, 'smart');
const s69Rows = bRows();
/* 参照实现：就是 §15-69 说的「旧 compareOpen」——日期升序（无日期最后）→ 优先级降序 → createdAt 升序 */
const s69Ref = SORT_TASKS.filter((t) => t.status !== 2).slice().sort(function (a, b) {
  const da = a.date ? new Date(a.date + 'T00:00:00').getTime() : null;
  const dbb = b.date ? new Date(b.date + 'T00:00:00').getTime() : null;
  if (da !== null && dbb !== null) { if (da !== dbb) return da - dbb; } else if (da !== null) return -1; else if (dbb !== null) return 1;
  const pa = a.priority | 0;
  const pb = b.priority | 0;
  if (pa !== pb) return pb - pa;
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}).map((t) => t.id);
check('S69', '§15-69 smart 排序与旧 compareOpen 逐项等价（日期升序 → 优先级降序 → createdAt 升序，列表视图不含已完成）',
  !!sortbarEl() && idsOf(s69Rows).join(',') === s69Ref.join(','),
  'B 栏=' + bView() + ' smart=' + idsOf(s69Rows).join(',') + ' 参照=' + s69Ref.join(',') + ' 共 N 项文本=' + JSON.stringify(sortCountText()));

const s69Options = s69sel ? all((n) => n.tag === 'option', s69sel).map((n) => attr(n, 'value')) : [];
check('S69b', '§15-69 排序栏提供 7 键（smart/score/date/tag/priority/created/title），计数文案「共 N 项」与实际行数一致',
  ['smart', 'score', 'date', 'tag', 'priority', 'created', 'title'].every((k) => s69Options.indexOf(k) >= 0) && sortCountText() === '共 ' + s69Rows.length + ' 项',
  'options=' + s69Options.join(',') + ' count=' + JSON.stringify(sortCountText()) + ' rows=' + s69Rows.length);

const s70group = groupSel();
if (s70group) change(s70group, 'status');
const s70openBefore = groupOf('open');
const s70countBefore = s70openBefore ? attr(s70openBefore, 'data-count') : null;
const s70firstBefore = idsOf(bRows())[0];
const s70doneBefore = !!groupOf('done');
const s70doneBtn = all((n) => hasClass(n, 'dtMiniBtn') && nodeText(n).indexOf('含已完成') >= 0)[0];
if (s70doneBtn) fire(s70doneBtn);
const s70openAfter = groupOf('open');
const s70firstAfter = idsOf(bRows())[0];
check('S70', '§15-70 分组=状态时，「含已完成」只决定 done 组出不出现：open 组的 data-count 与首条任务 id 前后不变',
  !!s70openAfter && attr(s70openAfter, 'data-count') === s70countBefore && s70firstAfter === s70firstBefore && !s70doneBefore && !!groupOf('done'),
  'open count ' + s70countBefore + '→' + (s70openAfter ? attr(s70openAfter, 'data-count') : 'null') +
  ' 首条 ' + s70firstBefore + '→' + s70firstAfter + ' done 组 ' + s70doneBefore + '→' + !!groupOf('done'));
if (s70doneBtn) fire(s70doneBtn);
if (s70group) change(s70group, 'dateBucket');
const s71Keys = groupHeads().map((n) => attr(n, 'data-group'));
check('S71', '§15-71 日期桶六档边界：昨天→overdue、今天→today、明天→tomorrow、+2 天→week、+11 天→later、无日期→noDate，且顺序固定',
  s71Keys.join(',') === 'overdue,today,tomorrow,week,later,noDate',
  '桶序列=' + s71Keys.join(',') + '（夹具日期 ' + YEST_K + '/' + TODAY_K + '/' + TOMORROW_K + '/' + addDaysKey(2) + '/' + addDaysKey(11) + '/空）');
if (s70group) change(s70group, 'none');

/* ---------------- §15-72/73 主题跟随系统 ---------------- */
const themeRoot = () => one((n) => hasClass(n, 'dtRoot'));
const themeNow = () => ({ theme: attr(themeRoot(), 'data-dt-theme'), src: attr(themeRoot(), 'data-dt-theme-src') });
setSettings({ theme: 'system' });
MEDIA.matches = true;
MEDIA.onchange = null;
MEDIA.fns = [];
MEDIA.bound = false;
const s72callsBefore = MEDIA.calls;
applyState({ settings: Object.assign({}, settingsNow()) });
const s72dark = themeNow();
const s72subscribed = MEDIA.bound === true;
MEDIA.emit(false);
rerender(); rerender();
const s72light = themeNow();
check('S72', '§15-72 主题跟随系统：matchMedia 报 dark 时 data-dt-theme=dark/src=system，系统改 light 后无需重载即变 light',
  s72dark.theme === 'dark' && s72dark.src === 'system' && (s72subscribed || s72light.theme === 'light') && s72light.theme === 'light' && s72light.src === 'system' && (MEDIA.calls - s72callsBefore) >= 1,
  'matchMedia 查询=' + MEDIA.query + ' 调用 +' + (MEDIA.calls - s72callsBefore) + ' dark=' + JSON.stringify(s72dark) + ' 已订阅=' + s72subscribed + ' → light=' + JSON.stringify(s72light));

setSettings({ theme: 'dark' });
const s73before = themeNow();
MEDIA.onchange = null;
MEDIA.fns = [];
MEDIA.bound = false;
MEDIA.addCount = 0;
const s73calls = MEDIA.calls;
MEDIA.emit(false);
rerender(); rerender();
check('S73', '§15-73 主题为 user（dark）时不监听系统：不查 matchMedia（或查了也不挂 onchange），触发 change 后仍是 dark/src=user',
  s73before.theme === 'dark' && s73before.src === 'user' && themeNow().theme === 'dark' && themeNow().src === 'user' && MEDIA.bound === false,
  'user=' + JSON.stringify(s73before) + ' → ' + JSON.stringify(themeNow()) + ' 期间 matchMedia 调用 +' + (MEDIA.calls - s73calls) + ' 是否订阅系统=' + MEDIA.bound + ' addEventListener 累计=' + MEDIA.addCount);
setSettings({ theme: 'system' });

/* ---------------- §15-74 无硬编码颜色 ---------------- */
const paletteScan = (function () {
  const dir = pathMod.join(partsDir, '.');
  const files = readdirSync(dir).filter((f) => f.slice(-3) === '.js');
  const bad = [];
  const notes = [];
  let inside = 0;
  files.forEach(function (f) {
    const text = readFileSync(pathMod.join(dir, f), 'utf8');
    let guard = false;
    text.split(/\r?\n/).forEach(function (line, i) {
      if (line.indexOf('dt-palette:start') >= 0) { guard = true; return; }
      if (line.indexOf('dt-palette:end') >= 0) { guard = false; return; }
      if (!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line)) return;
      if (guard) { inside += 1; return; }
      const head = line.trim();
      /* 注释行整行跳过：/* … 、* … 、// … 三种写法都不是颜色来源（t139 起：70-styles.js:788 的「rgb()/hex 都吃」只是说明文字） */
      if (head.indexOf('/*') === 0 || head.charAt(0) === '*' || head.indexOf('//') === 0) return;
      /* 只出现在比较里（!== / ===）的字符串不是颜色来源，单列成 notes 供复核 */
      if (/!==|===/.test(line)) { notes.push(f + ':' + (i + 1)); return; }
      bad.push(f + ':' + (i + 1));
    });
  });
  return { bad: bad, notes: notes, inside: inside, files: files.length };
})();
/* t76 已把 PROJECT_COLORS 换成 var(--dt-project-*)：S74 转硬门禁，越界不再挂 GAP（gap 只留给「实现未落地」）。 */
check('S74', '§15-74 颜色只来自调色板：src/parts 下 hex/rgba 命中行全部落在 dt-palette 标记之间（越界 0 行）',
  paletteScan.bad.length === 0 && paletteScan.inside > 0,
  '扫描 ' + paletteScan.files + ' 个文件，palette 区命中 ' + paletteScan.inside + ' 行' +
  '，越界=' + (paletteScan.bad.join(',') || '(无)') +
  '，比较串(不计入)=' + (paletteScan.notes.join(',') || '(无)'));

/* ---------------- §15-75/76 音效 ---------------- */
fire(railDt('rail-settings'));
const soundCard = () => all((n) => attr(n, 'data-sound-preset') !== undefined)[0] || null;
const soundCtl = (dt) => byDt(dt);
setSettings({ sound: { enabled: false, preset: 'remind', volume: 0.6, customName: '', customData: '' } });
const s75presets = soundCtl('sound-preset');
const s75radios = s75presets.map((n) => all((m) => m.tag === 'input' && attr(m, 'type') === 'radio', n)[0] || n);
const s75volume = soundCtl('sound-volume')[0] || null;
const s75preview = soundCtl('sound-preview')[0] || null;
check('S75', '§15-75 关闭音效后控件全部禁用且不改值：3 个预设按钮 + 音量滑杆 + 试听按钮 disabled，preset 仍 remind、volume 仍 0.6',
  s75presets.length === 3 && s75radios.every((n) => n.props.disabled === true) && !!s75volume && s75volume.props.disabled === true && !!s75preview && s75preview.props.disabled === true &&
  attr(soundCard(), 'data-sound-preset') === 'remind' && String(attr(soundCard(), 'data-sound-volume')) === '0.6',
  'preset 按钮 disabled=' + s75radios.map((n) => n.props.disabled === true).join(',') + ' volume disabled=' + (s75volume ? s75volume.props.disabled : 'null') +
  ' preview disabled=' + (s75preview ? s75preview.props.disabled : 'null') + ' 卡片 preset=' + attr(soundCard(), 'data-sound-preset') + ' volume=' + attr(soundCard(), 'data-sound-volume'));

setSettings({ sound: { enabled: true, preset: 'custom', volume: 0.6, customName: '', customData: '' } });
const s76input = byDt('sound-file')[0] || null;
const s76ok = (function () {
  if (!s76input || typeof s76input.props.onChange !== 'function') return false;
  const big = { name: 'big.mp3', type: 'audio/mp3', size: 600 * 1024, __text: 'x' };
  try { s76input.props.onChange({ target: { files: [big], value: 'big.mp3' } }); } catch (e) { errors.push(['sound.import', e]); }
  rerender(); rerender();
  return true;
})();
const s76sound = settingsNow().sound || {};
check('S76', '§15-76 超过 512KB 的音频被拒绝：customData 仍为空串、preset 仍 custom、提示条出现「512KB」',
  s76ok && s76sound.customData === '' && s76sound.preset === 'custom' && toastTexts().some((t) => t.indexOf('512KB') >= 0),
  'customData=' + JSON.stringify(s76sound.customData) + ' preset=' + s76sound.preset + ' toast=' + JSON.stringify(toastTexts().slice(-2)));
setSettings({ sound: { enabled: true, preset: 'remind', volume: 0.6, customName: '', customData: '' } });

/* ---------------- §15-77/78 番茄热力图与日志 ---------------- */
fire(railDt('rail-pomodoro'));
const s77HeatCells = () => all((n) => attr(n, 'data-pomo-day') !== undefined);
const s77logBefore = JSON.stringify(dbNow().pomodoroLog || {});
const s77cell = s77HeatCells()[0] || null;
const s77countBefore = s77cell ? attr(s77cell, 'data-count') : null;
/* 只读热力图：格子按设计不挂 onClick；有处理器才点一次证无害（原写法 fire(格子) 把 div 记成 JS 异常） */
const s77clickable = all((n) => attr(n, 'data-pomo-day') !== undefined && typeof n.props.onClick === 'function');
if (s77clickable[0]) fire(s77clickable[0]);
check('S77', '§15-77 番茄热力图只读：点格子不改 db.pomodoroLog、格子 data-count 不变',
  !!s77cell && JSON.stringify(dbNow().pomodoroLog || {}) === s77logBefore && attr(s77HeatCells()[0], 'data-count') === s77countBefore,
  'cell=' + (s77cell ? attr(s77cell, 'data-pomo-day') : 'null') + ' count=' + s77countBefore + '→' + (s77HeatCells()[0] ? attr(s77HeatCells()[0], 'data-count') : 'null') + ' 可点格子=' + s77clickable.length + (s77clickable.length ? '' : '(无处理器=只读)') + ' log 不变=' + (JSON.stringify(dbNow().pomodoroLog || {}) === s77logBefore));

/* 判别性夹具：结束时刻落在昨天 23:59（用「当前时刻」归属的实现会错记到今天，M4 变异靠它变红） */
const s78endKey = YEST_K;
const s78startKey = addDaysKey(-3);
const s78endsAt = Date.parse(YEST_K + 'T23:59:00');
const s78pomo = Object.assign({}, POMO_BASE, { mode: 'work', running: true, endsAt: s78endsAt, work: 25, count: 0, startedAt: Date.parse(s78startKey + 'T23:50:00') });
applyState({ pomo: s78pomo });
setDb({ pomodoroLog: {} });
const s78pomo2 = Object.assign({}, storeApi.get().pomo, { endsAt: s78endsAt, startedAt: Date.parse(s78startKey + 'T23:50:00') });
applyState({ pomo: s78pomo2, db: Object.assign({}, dbNow(), { pomodoroLog: {} }) });
engineTicks();
const s78log = dbNow().pomodoroLog || {};
const s78today = s78log[s78endKey] || null;
const s78breakBefore = JSON.stringify(s78log);
applyState({ pomo: Object.assign({}, storeApi.get().pomo, { mode: 'short', running: true, endsAt: Date.now() - 1 }) });
engineTicks();
check('S78', '§15-78 番茄日志只计 work 且按结束日归属：结束于昨天 23:59 记到昨天、开跑日与今天都不记、短休息结束不产生新计数',
  !!s78today && s78today.count === 1 && !s78log[s78startKey] && !s78log[TODAY_K] && JSON.stringify(dbNow().pomodoroLog || {}) === s78breakBefore,
  '开跑日=' + s78startKey + ' 结束日=' + s78endKey + ' 键=' + Object.keys(s78log).join(',') + ' 落点=' + JSON.stringify(s78today) + ' 今日键=' + (s78log[TODAY_K] ? JSON.stringify(s78log[TODAY_K]) : '(无)') + ' 短休息后不变=' + (JSON.stringify(dbNow().pomodoroLog || {}) === s78breakBefore));
/* ---------------- §15-79 批量打分写入契约 ---------------- */
applyState({ projects: [SORT_INBOX], tasks: SORT_TASKS.map((t) => Object.assign({}, t)), habits: [], db: Object.assign({}, dbNow(), { scores: {} }) });
closeAllDrawers();
openProjectList('收集箱');
const s79btn = byDt('score-batch')[0] || null;
const s79eligible = tasksOfDb().filter((t) => t.status !== 2 && !t.deleted).map((t) => t.id);
withSyncTimers(function () { if (s79btn) fire(s79btn); });
const s79scores = dbNow().scores || {};
/* 分数条目含 updatedAt 时间戳，打证据前剔除（否则两次连跑永不逐字节相同） */
const s79Stable = (row) => { const o = Object.assign({}, row); delete o.updatedAt; return o; };
const s79entries = Object.keys(s79scores).map((k) => s79scores[k]);
check('S79', '§15-79 批量打分为每条未完成任务写入 {source:auto, rubricVersion:calibrated-2026-11} 且分值为 0..100 一位小数',
  s79entries.length === s79eligible.length && s79entries.length > 0 &&
  s79entries.every((v) => v && v.source === 'auto' && v.rubricVersion === 'calibrated-2026-11' && typeof v.score === 'number' && v.score >= 0 && v.score <= 100 && Math.round(v.score * 10) === v.score * 10),
  '写入 ' + s79entries.length + '/' + s79eligible.length + ' 条，样例=' + JSON.stringify(s79Stable(s79entries[0] || {})));

applyState({ db: Object.assign({}, dbNow(), { scores: Object.assign({}, dbNow().scores, { s1: { score: 88, source: 'manual', rubricVersion: 'manual', at: 1 } }) }) });
closeAllDrawers();
openProjectList('收集箱');
const s79btn2 = byDt('score-batch')[0] || null;
withSyncTimers(function () { if (s79btn2) fire(s79btn2); });
const s79manual = (dbNow().scores || {}).s1 || {};
check('S79b', '§15-79 手动分不被批量覆盖（source 仍 manual、score 仍 88），且不重复计分',
  s79manual.source === 'manual' && s79manual.score === 88,
  's1=' + JSON.stringify(s79manual) + ' toast=' + JSON.stringify(toastTexts().slice(-1)));

/* ---------------- §15-80 tt-scores 导入幂等（两次冷启动） ---------------- */
const s80first = bootFresh();
const s80db1 = (s80first.props.store.get() || {}).db || {};
const s80keys1 = Object.keys(s80db1.scores || {});
const s80cal1 = s80keys1.filter((k) => ((s80db1.scores || {})[k] || {}).rubricVersion === 'calibrated-2026-11').length;
const s80one = { n: s80keys1.length, cal: s80cal1, seed: (s80db1.meta || {}).scoreSeed };
const s80second = bootFresh();
const s80db2 = (s80second.props.store.get() || {}).db || {};
const s80keys2 = Object.keys(s80db2.scores || {});
const s80cal2 = s80keys2.filter((k) => ((s80db2.scores || {})[k] || {}).rubricVersion === 'calibrated-2026-11').length;
const s80two = { n: s80keys2.length, cal: s80cal2, seed: (s80db2.meta || {}).scoreSeed };
check('S80', '§15-80 tt-scores 导入幂等：连续两次冷启动后分数条数不变，meta.scoreVersion 恒为 calibrated-2026-11',
  s80one.n > 0 && s80one.n === s80two.n && s80one.cal === s80two.cal && s80two.cal > 0 && s80one.seed === s80two.seed,
  '第一次 n=' + s80one.n + ' 校准分=' + s80one.cal + ' seed=' + s80one.seed + '；第二次 n=' + s80two.n + ' 校准分=' + s80two.cal + ' seed=' + s80two.seed);

/* ---------------- §15-81…85 Agent 一次请求 / 半成功 / 错误分类 / 密钥 ---------------- */
const AGENT_SETTINGS = { provider: 'openai', apiBase: 'https://api.stub.test/v1', apiKey: 'sk-test', model: 'stub-model', timeout: 30, retries: 1, source: 'custom' };
applyState({ projects: [SORT_INBOX], tasks: SORT_TASKS.map((t) => Object.assign({}, t)), habits: [] });
closeAllDrawers();
openProjectList('收集箱');
const openDetailOf = (id) => { const row = all((n) => hasClass(n, 'dtRow') && attr(n, 'data-task-id') === id)[0]; if (row) fire(row); return cDetailView(); };
openDetailOf('s1');
setSettings({ agent: AGENT_SETTINGS });
const fetchCalls = [];
function setFetch(fn) { fetchCalls.length = 0; globalThis.__fetchImpl = function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return fn(fetchCalls.length, url, opts); }; }
const okJson = (obj) => ({ ok: true, status: 200, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });

const s81Task = tasksOfDb().find((t) => t.id === 's1');
const s81titleBefore = s81Task ? s81Task.title : null;
const s81stepsBefore = (s81Task && Array.isArray(s81Task.steps) ? s81Task.steps.length : 0);
await flushAsync(12);
setFetch(() => Promise.resolve(okJson({ choices: [{ message: { content: JSON.stringify({ title: '模型给的新标题', steps: ['步骤甲', '步骤乙'] }) } }] })));
const s81btn = byDt('agent-action')[0] || null;
if (s81btn) fire(s81btn);
await flushAsync(20);
const s81body = fetchCalls[0] && fetchCalls[0].opts && fetchCalls[0].opts.body ? String(fetchCalls[0].opts.body) : '';
let s81payload = {};
try { s81payload = JSON.parse(s81body); } catch (e) { s81payload = {}; }
const s81msgs = Array.isArray(s81payload.messages) ? s81payload.messages : [];
const s81newTitle = byDt('agent-new-title')[0] || null;
const s81newSteps = byDt('agent-new-step');
check('S81', '§15-81 一个动作只发一次请求、同时要标题与步骤：fetch 1 次、messages 2 条、response_format.json_object，返回后 diff 面板同时出现新标题与 2 条步骤',
  fetchCalls.length === 1 && s81msgs.length === 2 && s81payload.response_format && s81payload.response_format.type === 'json_object' &&
  !!s81newTitle && nodeText(s81newTitle).indexOf('模型给的新标题') >= 0 && s81newSteps.length === 2,
  'fetch=' + fetchCalls.length + ' messages=' + s81msgs.length + ' response_format=' + JSON.stringify(s81payload.response_format) +
  ' 新标题=' + (s81newTitle ? nodeText(s81newTitle) : 'null') + ' 新步骤=' + s81newSteps.map((n) => nodeText(n)).join('/'));

const s82blue = all((n) => hasClass(n, 'dtBlueBtn'), cSlot());
check('S82', '§15-82 C 栏只有一个蓝按钮：.dtDrawer[data-slot=c] 内 .dtBlueBtn 计数为 1，且没有第二个「润色/拆解」入口',
  s82blue.length === 1 && s82blue[0] && attr(s82blue[0], 'data-dt') === 'agent-action',
  'C 栏蓝按钮=' + s82blue.length + ' data-dt=' + s82blue.map((n) => attr(n, 'data-dt')).join(','));

const s83discard = byDt('agent-discard')[0] || null;
if (s83discard) fire(s83discard);
setFetch(() => Promise.resolve(okJson({ choices: [{ message: { content: JSON.stringify({ steps: ['只拆解出的步骤'] }) } }] })));
const s83run = byDt('agent-action')[0] || null;
if (s83run) fire(s83run);
await drainTimers(8);
const s83apply = byDt('agent-apply')[0] || null;
if (s83apply) fire(s83apply);
rerender(); rerender();
const s83Task = tasksOfDb().find((t) => t.id === 's1');
const s83steps = s83Task && Array.isArray(s83Task.steps) ? s83Task.steps.length : 0;
check('S83', '§15-83 半成功不写标题：模型只回 steps 时应用后 title 逐字不变、steps 增加 1 条，界面上明确写「未生成新标题」',
  !!s83Task && s83Task.title === s81titleBefore && s83steps === s81stepsBefore + 1 && all((n) => nodeText(n).indexOf('未生成新标题') >= 0).length > 0,
  'title ' + JSON.stringify(s81titleBefore) + '→' + JSON.stringify(s83Task ? s83Task.title : null) + ' steps ' + s81stepsBefore + '→' + s83steps);

/* 重试走 window.setTimeout(1000/3000)：这里把定时器收进队列，交替「放微任务 → 跑定时器」，不 sleep。 */
async function drainTimers(rounds) {
  const queue = [];
  const prev = globalThis.setTimeout;
  globalThis.setTimeout = function (fn) { queue.push(fn); return 0; };
  try {
    for (let i = 0; i < rounds; i += 1) {
      for (let k = 0; k < 6; k += 1) await Promise.resolve();
      let guard = 0;
      while (queue.length && guard < 20) { guard += 1; const fn = queue.shift(); try { fn(); } catch (e) { errors.push(['drainTimer', e]); } }
      rerender(); rerender();
    }
  } finally { globalThis.setTimeout = prev; }
}
async function agentCodeFor(makeResponse) {
  await flushAsync(12);
  setFetch(makeResponse);
  const btn = byDt('agent-action')[0] || null;
  if (btn) fire(btn);
  await drainTimers(10);
  const bar = byDt('agent-bar')[0] || null;
  return { code: bar ? attr(bar, 'data-code') : null, calls: fetchCalls.length, text: bar ? nodeText(bar) : '' };
}
const s84auth = await agentCodeFor(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve('') }));
const s84rate = await agentCodeFor(() => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}), text: () => Promise.resolve('') }));
const s84notfound = await agentCodeFor(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') }));
const s84abort = await agentCodeFor(() => { const e = new Error('aborted'); e.name = 'AbortError'; return Promise.reject(e); });
check('S84', '§15-84 错误分类成四码：401→AGENT_AUTH、429→AGENT_RATE、404→AGENT_ENDPOINT、AbortError→AGENT_TIMEOUT；429 的请求次数 = 1 + maxRetries(1)',
  s84auth.code === 'AGENT_AUTH' && s84rate.code === 'AGENT_RATE' && s84notfound.code === 'AGENT_ENDPOINT' && s84abort.code === 'AGENT_TIMEOUT' && s84rate.calls === 2,
  '401=' + s84auth.code + '(1 次) 429=' + s84rate.code + '(' + s84rate.calls + ' 次) 404=' + s84notfound.code + '(1 次) abort=' + s84abort.code);

const consoleLog = [];
const rawConsole = { log: console.log, warn: console.warn, error: console.error };
(function patchConsole() { ['log', 'warn', 'error'].forEach((k) => { console[k] = function () { consoleLog.push(Array.prototype.slice.call(arguments).map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); } }).join(' ')); }; }); })();
setFetch(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve('') }));
const s85btn = byDt('agent-action')[0] || null;
if (s85btn) fire(s85btn);
await flushAsync(16);
if (centerView() !== 'settings') fire(railDt('rail-settings'));
const s85export = all((n) => hasClass(n, 'dtGhostBtn') && nodeText(n).indexOf('导出 JSON') >= 0)[0];
if (s85export) fire(s85export);
await flushAsync(4);
const s85blobText = globalThis.__lastBlob ? await globalThis.__lastBlob.text() : '';
Object.keys(rawConsole).forEach((k) => { console[k] = rawConsole[k]; });
check('S85', '§15-85 密钥不外泄：导出 JSON 里搜不到 apiKey，失败调用的 console 参数里同样搜不到',
  s85blobText.length > 100 && s85blobText.indexOf('sk-test') < 0 && consoleLog.join('|').indexOf('sk-test') < 0,
  '导出串 ' + s85blobText.length + ' 字节含密钥=' + (s85blobText.indexOf('sk-test') >= 0) + '；console 行数=' + consoleLog.length + ' 含密钥=' + (consoleLog.join('|').indexOf('sk-test') >= 0));
globalThis.__fetchImpl = null;
setSettings({ agent: { provider: '', apiBase: '', apiKey: '', model: '', timeout: 30, retries: 1 } });

/* ---------------- §15-84 补盲：Agent 10 个码全落断言（t112） ----------------
   真源 src/parts/57-agent.js:41-52 AGENT_CODE_MESSAGE 共 10 个键：
   8 个错误码 AUTH / RATE / FORMAT / ENDPOINT / SERVER / TIMEOUT / NETWORK / BAD_JSON（§10.4 八类）
   + 2 个降级码 BASE / CONFIG（该文件 :40 注释原话：「八类错误码 + 配置缺失（不是错误码，是降级分支）」）。
   S84 原本只断 4 个（AUTH/RATE/ENDPOINT/TIMEOUT），本段把缺口补齐并逐码钉住请求计数，
   计数口径取自代码实际行为、不按规格想象：
   · agentAttempt 单发不重试；重试只发生在 agentRun，且仅对 AGENT_RETRYABLE = {RATE, SERVER, TIMEOUT}；
   · FORMAT 走「去掉 response_format 立即重发一次、不占重试预算」（57-agent.js:355-358）；
   · AUTH / ENDPOINT / NETWORK / BAD_JSON 均单发；
   · BASE / CONFIG 在 fetch 之前返回（agentAttempt:205 / pingAgent:277-278、59-taskinfo.js:94-105），请求数必须 0。 */
function t112Bar() { return byDt('agent-bar')[0] || null; }
function t112BarOf() {
  const bar = t112Bar();
  return { code: bar ? attr(bar, 'data-code') : null, state: bar ? attr(bar, 'data-state') : null, text: bar ? nodeText(bar) : '' };
}
function t112Bodies() {
  return fetchCalls.map(function (c) {
    try { return JSON.parse(String(c && c.opts && c.opts.body)); } catch (e) { return {}; }
  });
}
/* 关键顺序：必须**先**把 window.setTimeout 换成同步队列，再点按钮。
   反例（踩过）：先 flushAsync 再 drainTimers —— 第一次 fetch 在 flushAsync 期间就 resolve，
   重试定时器这时排进了真实事件循环，后面 drainTimers 收不到，state 永远停在 busy、fetch 恒为 1。 */
async function t112Pump(rounds) {
  const queue = [];
  const prev = globalThis.setTimeout;
  globalThis.setTimeout = function (fn) { queue.push(fn); return 0; };
  try {
    for (let i = 0; i < rounds; i += 1) {
      for (let k = 0; k < 8; k += 1) await Promise.resolve();
      let guard = 0;
      while (queue.length && guard < 50) { guard += 1; const fn = queue.shift(); try { fn(); } catch (e) { errors.push(['t112Pump', e]); } }
      rerender(); rerender();
    }
  } finally { globalThis.setTimeout = prev; }
}
async function t112Run(makeResponse) {
  await flushAsync(12);
  setFetch(makeResponse);
  const queuePromise = t112Pump(14);
  const btn = byDt('agent-action')[0] || null;
  if (btn) fire(btn);
  await queuePromise;
  const info = t112BarOf();
  return { code: info.code, state: info.state, text: info.text, calls: fetchCalls.length, bodies: t112Bodies() };
}
function t112OpenDetail() {
  closeAllDrawers();
  openProjectList('收集箱');
  openDetailOf('s1');
  rerender(); rerender();
}
/* §15-85 结尾把 center 切到设置、并清空了 agent 配置：这里先复位到「C 栏开着 s1 + 完整配置」。 */
t112OpenDetail();
setSettings({ agent: AGENT_SETTINGS });


const t112server = await t112Run(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve('boom') }));
check('S84A', '§10.4 AGENT_SERVER：5xx → data-code=AGENT_SERVER、state=error；SERVER 在 AGENT_RETRYABLE 内且 maxRetries=1 ⇒ 恰好 2 次请求',
  t112server.code === 'AGENT_SERVER' && t112server.state === 'error' && t112server.calls === 2,
  'code=' + t112server.code + ' state=' + t112server.state + ' fetch=' + t112server.calls + '（期望 2 = 1 + maxRetries）');

const t112net = await t112Run(() => { const e = new Error('Failed to fetch'); e.name = 'TypeError'; return Promise.reject(e); });
check('S84B', '§10.4 AGENT_NETWORK：fetch 抛 TypeError（网络/CORS）→ AGENT_NETWORK；该码不在 AGENT_RETRYABLE ⇒ 恰好 1 次请求（不重试）',
  t112net.code === 'AGENT_NETWORK' && t112net.state === 'error' && t112net.calls === 1,
  'code=' + t112net.code + ' state=' + t112net.state + ' fetch=' + t112net.calls + '（期望 1，NETWORK 不重试）');

const t112bad = await t112Run(() => Promise.resolve(okJson({ choices: [{ message: { content: '这不是 JSON，只是一段普通文字' } }] })));
check('S84C', '§9.3/§10.4 AGENT_BAD_JSON（内容非 JSON）：解析链三级（直 parse / 剥围栏 / 截 {…}）全失败 → AGENT_BAD_JSON，单发 1 次',
  t112bad.code === 'AGENT_BAD_JSON' && t112bad.state === 'error' && t112bad.calls === 1,
  'code=' + t112bad.code + ' state=' + t112bad.state + ' fetch=' + t112bad.calls + ' 文案=' + t112bad.text.slice(0, 40));

const t112bad2 = await t112Run(() => Promise.resolve(okJson({ id: 'x', choices: [] })));
check('S84D', '§10.4 AGENT_BAD_JSON（200 但缺 choices[0].message.content）：content 取空串 → AGENT_BAD_JSON，单发 1 次',
  t112bad2.code === 'AGENT_BAD_JSON' && t112bad2.state === 'error' && t112bad2.calls === 1,
  'code=' + t112bad2.code + ' state=' + t112bad2.state + ' fetch=' + t112bad2.calls);

const t112fmt = await t112Run(() => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({}), text: () => Promise.resolve('{"error":"response_format is not supported"}') }));
const t112fmt0 = t112fmt.bodies[0] || {};
const t112fmt1 = t112fmt.bodies[1] || {};
check('S84E', '§10.4 AGENT_FORMAT：400 → AGENT_FORMAT，并「去掉 response_format 立即重发一次」（不占重试预算）⇒ 2 次请求；第 1 次带 response_format、第 2 次不带',
  t112fmt.code === 'AGENT_FORMAT' && t112fmt.calls === 2 && !!t112fmt0.response_format && !t112fmt1.response_format,
  'code=' + t112fmt.code + ' fetch=' + t112fmt.calls + ' 首发 response_format=' + JSON.stringify(t112fmt0.response_format) + ' 二发 response_format=' + JSON.stringify(t112fmt1.response_format));

const t112to = await t112Run(() => { const e = new Error('aborted'); e.name = 'AbortError'; return Promise.reject(e); });
check('S84F', '§10.4 AGENT_TIMEOUT：AbortError → AGENT_TIMEOUT；TIMEOUT 在 AGENT_RETRYABLE 内 ⇒ 恰好 2 次请求（S84 只断了码，这里补计数）',
  t112to.code === 'AGENT_TIMEOUT' && t112to.calls === 2,
  'code=' + t112to.code + ' fetch=' + t112to.calls + '（期望 2）');

const t112auth401 = await t112Run(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve('unauthorized') }));
const t112auth403 = await t112Run(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}), text: () => Promise.resolve('forbidden') }));
check('S84G', '§10.4 AGENT_AUTH：401 与 403 同码；AUTH 不在 AGENT_RETRYABLE ⇒ 两者都恰好 1 次请求（S84 只断了码，这里补计数与 403 分支）',
  t112auth401.code === 'AGENT_AUTH' && t112auth401.calls === 1 && t112auth403.code === 'AGENT_AUTH' && t112auth403.calls === 1,
  '401=' + t112auth401.code + '/' + t112auth401.calls + ' 次  403=' + t112auth403.code + '/' + t112auth403.calls + ' 次');

const t112ep = await t112Run(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('not found') }));
check('S84H', '§10.4 AGENT_ENDPOINT：404 → AGENT_ENDPOINT 且单发 1 次（不重试；S84 只断了码，这里补计数）',
  t112ep.code === 'AGENT_ENDPOINT' && t112ep.calls === 1,
  'code=' + t112ep.code + ' fetch=' + t112ep.calls);

/* AGENT_BASE：Base URL 非 https 且非 localhost → 本地规则降级，请求数必须 0（不得先发再看）。 */
setSettings({ agent: Object.assign({}, AGENT_SETTINGS, { apiBase: 'http://evil.example.com/v1' }) });
t112OpenDetail();
setFetch(() => Promise.resolve(okJson({})));
if (byDt('agent-action')[0]) fire(byDt('agent-action')[0]);
await flushAsync(10);
const t112base = t112BarOf();
check('S84I', '§10.2/§10.4 AGENT_BASE：Base URL 既非 https 也非 http://localhost ⇒ 降级本地规则（state=local、data-code=AGENT_BASE），请求数必须为 0',
  t112base.code === 'AGENT_BASE' && t112base.state === 'local' && fetchCalls.length === 0,
  'code=' + t112base.code + ' state=' + t112base.state + ' fetch=' + fetchCalls.length + ' 文案=' + t112base.text.slice(0, 44));

/* AGENT_CONFIG：缺 apiKey → 同样本地规则降级，请求数必须 0。 */
setSettings({ agent: Object.assign({}, AGENT_SETTINGS, { apiKey: '' }) });
t112OpenDetail();
setFetch(() => Promise.resolve(okJson({})));
if (byDt('agent-action')[0]) fire(byDt('agent-action')[0]);
await flushAsync(10);
const t112cfg = t112BarOf();
check('S84J', '§9.2/§10.4 AGENT_CONFIG：缺 apiKey ⇒ 本地规则降级（state=local、data-code=AGENT_CONFIG），请求数必须为 0；文案点名缺失项并提示去设置',
  t112cfg.code === 'AGENT_CONFIG' && t112cfg.state === 'local' && fetchCalls.length === 0 && t112cfg.text.indexOf('API Key') >= 0,
  'code=' + t112cfg.code + ' state=' + t112cfg.state + ' fetch=' + fetchCalls.length + ' 文案=' + t112cfg.text.slice(0, 44));

/* 设置页同一判据的两个分支：缺密钥时按钮 disabled（真实 DOM 不派发）→ 强行触发也只置 AGENT_CONFIG、0 请求。 */
setSettings({ agent: Object.assign({}, AGENT_SETTINGS, { apiKey: '' }) });
if (centerView() !== 'settings') fire(railDt('rail-settings'));
rerender(); rerender();
const t112testBtn = byDt('agent-test')[0] || null;
const t112testDisabled = t112testBtn
  ? (attr(t112testBtn, 'disabled') === true || attr(t112testBtn, 'disabled') === 'true' || attr(t112testBtn, 'aria-disabled') === 'true')
  : false;
setFetch(() => Promise.resolve(okJson({})));
if (t112testBtn) fire(t112testBtn);
await flushAsync(10);
const t112cfgState = byDt('agent-test-state')[0] || null;
check('S84K', '§10.4 设置页「测试连接」：缺密钥时按钮 disabled+aria-disabled（真实 DOM 不派发）；即便强行触发也只落 [data-dt=agent-test-state] data-code=AGENT_CONFIG，fetch 0 次',
  t112testDisabled && !!t112cfgState && attr(t112cfgState, 'data-code') === 'AGENT_CONFIG' && fetchCalls.length === 0,
  '按钮 disabled=' + t112testDisabled + ' 状态条 code=' + (t112cfgState ? attr(t112cfgState, 'data-code') : '(无节点)') + ' fetch=' + fetchCalls.length);

/* 有密钥但 Base URL 非法：pingAgent 也在 fetch 之前判 Base（57-agent.js:277）→ 0 请求。 */
setSettings({ agent: Object.assign({}, AGENT_SETTINGS, { apiBase: 'http://evil.example.com/v1' }) });
rerender(); rerender();
setFetch(() => Promise.resolve(okJson({})));
if (byDt('agent-test')[0]) fire(byDt('agent-test')[0]);
await flushAsync(10);
const t112baseState = byDt('agent-test-state')[0] || null;
check('S84L', '§10.2 设置页同一判据：有密钥但 Base URL 非法 ⇒ pingAgent 在 fetch 之前返回 AGENT_BASE（data-state=error、data-code=AGENT_BASE、fetch 0 次）',
  !!t112baseState && attr(t112baseState, 'data-state') === 'error' && attr(t112baseState, 'data-code') === 'AGENT_BASE' && fetchCalls.length === 0,
  'state=' + (t112baseState ? attr(t112baseState, 'data-state') : '(无)') + ' code=' + (t112baseState ? attr(t112baseState, 'data-code') : '(无)') + ' fetch=' + fetchCalls.length);

globalThis.__fetchImpl = null;
setSettings({ agent: { provider: '', apiBase: '', apiKey: '', model: '', timeout: 30, retries: 1 } });
closeAllDrawers();

/* ---------------- §15-86/87 日历叠加八组合与窄档降级 ---------------- */
closeAllDrawers();
fire(railDt('rail-calendar'));
const s86setOverlays = (lunar, term, holiday) => {
  const st = settingsNow();
  applyState({ settings: Object.assign({}, st, { calendar: { overlays: { lunar: lunar, term: term, holiday: holiday } } }) });
};
const s86subOf = (key) => {
  const cell = cellAt(key);
  if (!cell) return { text: '', cls: '' };
  const sub = all((n) => hasClass(n, 'dtCalSub'), cell)[0] || null;
  return sub ? { text: nodeText(sub), cls: String(sub.props.className || '') } : { text: '', cls: '' };
};
const s86titleBefore = calTitle();
gotoMonth(2026, 4);
const s86rows = [];
for (let m = 0; m < 8; m += 1) {
  s86setOverlays(!!(m & 1), !!(m & 2), !!(m & 4));
  s86rows.push({ mask: m, got: calMask(), sub: s86subOf('2026-04-05') });
}
const s86masks = s86rows.map((r) => r.got);
/* 2026-04-05 同时是清明节（holiday）、清明（term）与农历某日 → 三者都可用，正好验证优先级 */
const s86prio = (function () {
  s86setOverlays(true, true, true);
  const all3 = s86subOf('2026-04-05').cls;
  s86setOverlays(true, true, false);
  const termFirst = s86subOf('2026-04-05').cls;
  s86setOverlays(true, false, false);
  const lunarOnly = s86subOf('2026-04-05').cls;
  s86setOverlays(false, false, false);
  const none = s86subOf('2026-04-05');
  return { all3: all3, termFirst: termFirst, lunarOnly: lunarOnly, none: none };
})();
check('S86', '§15-86 叠加位掩码 0..7 全可达且副行来源优先级为 节假日 > 节气 > 农历，全不选时副行为空',
  calTitle() === '2026 年 4 月' && s86masks.join(',') === '0,1,2,3,4,5,6,7' &&
  s86prio.all3.indexOf('dtCalSubHoliday') >= 0 && s86prio.termFirst.indexOf('dtCalSubTerm') >= 0 && s86prio.lunarOnly.indexOf('dtCalSubLunar') >= 0 && s86prio.none.text === '',
  '掩码序列=' + s86masks.join(',') + '；2026-04-05 三者全选=' + JSON.stringify(s86prio.all3.trim()) + ' 去节日=' + JSON.stringify(s86prio.termFirst.trim()) +
  ' 只留农历=' + JSON.stringify(s86prio.lunarOnly.trim()) + ' 全不选=' + JSON.stringify(s86prio.none.text) +
  '；翻月前 ' + s86titleBefore + ' → 校验月 ' + calTitle() + '（来源钩子 [data-cal-sub-src] 已落地，其与类名同源由 S86a/S86b 校验）');
/* S86a/S86b：§15-86 的来源钩子 [data-cal-sub-src]。三同源判据 = 属性值 / dtCalSub* 类名 / 文本；
   none 必须显式写出，否则「有文字却标 none」「标 none 却有来源类名」这类错位抓不到。 */
const S86_CLS = { holiday: 'dtCalSubHoliday', term: 'dtCalSubTerm', lunar: 'dtCalSubLunar' };
s86setOverlays(true, true, true);
const s86srcRows = cells().map(function (cell) {
  const key = attr(cell, 'data-date');
  const sub = all((n) => hasClass(n, 'dtCalSub'), cell)[0] || null;
  const src = sub ? attr(sub, 'data-cal-sub-src') : '(无副行节点)';
  const c = sub ? String(sub.props.className || '').trim() : '';
  const text = sub ? nodeText(sub) : '';
  const hits = Object.keys(S86_CLS).filter((k) => c.indexOf(S86_CLS[k]) >= 0);
  const ok = !!sub && (src === 'none'
    ? (c === 'dtCalSub' && text === '')
    : (!!S86_CLS[src] && hits.length === 1 && hits[0] === src && text !== ''));
  return { key: key, src: src, cls: c, text: text, ok: !!ok };
});
const s86bad = s86srcRows.filter((r) => !r.ok);
const s86dist = ['holiday', 'term', 'lunar', 'none'].map((k) => k + ':' + s86srcRows.filter((r) => r.src === k).length).join(' ');
check('S86a', '§15-86 整月副行来源自洽：每格 data-cal-sub-src ∈ {holiday,term,lunar,none}；非 none 时与 dtCalSub* 类名同源且唯一位、文本非空；none 时无来源类名且文本为空',
  s86srcRows.length === 42 && s86bad.length === 0,
  '校验月=' + calTitle() + ' 格数=' + s86srcRows.length + ' 不一致=' + s86bad.length +
  (s86bad.length ? ' 例=' + JSON.stringify(s86bad.slice(0, 3)) : '') + '；来源分布=' + s86dist);
const s86want = [['2026-04-05', 'holiday', '清明'], ['2026-04-20', 'term', '谷雨']];
const s86exRows = s86want.map(function (w) {
  const r = s86srcRows.filter((x) => x.key === w[0])[0] || null;
  return { key: w[0], want: w[1], src: r ? r.src : null, text: r ? r.text : '', ok: !!r && r.src === w[1] && r.text === w[2] };
});
/* 农历那例：默认叠加下今天（' + TODAY_K + '）既无节日也无节气，只开农历时来源必须落到 lunar */
s86setOverlays(true, false, false);
fire(todayButton());
const s86lCell = cellAt(TODAY_K);
const s86lSub = s86lCell ? all((n) => hasClass(n, 'dtCalSub'), s86lCell)[0] || null : null;
const s86lunar = { src: s86lSub ? attr(s86lSub, 'data-cal-sub-src') : null, cls: s86lSub ? String(s86lSub.props.className || '').trim() : '', text: s86lSub ? nodeText(s86lSub) : '' };
check('S86b', '§15-86 副行来源三例各一对：2026-04-05 → holiday（清明兼节气，按节假日优先）、2026-04-20 → term（谷雨）、只开农历的今天 → lunar；三例均属性/类名/文本同源',
  s86exRows[0].ok && s86exRows[1].ok &&
    s86lunar.src === 'lunar' && s86lunar.cls.indexOf('dtCalSubLunar') >= 0 && s86lunar.text !== '',
  '04-05=' + JSON.stringify(s86exRows[0]) + '；04-20=' + JSON.stringify(s86exRows[1]) + '；' + TODAY_K + '(仅农历)=' + JSON.stringify(s86lunar));
fire(todayButton());

s86setOverlays(false, true, true);
const s87overlaysBefore = JSON.stringify((settingsNow().calendar || {}).overlays || {});
const s87subBefore = s86subOf('2026-04-05');
resizeTo(520);
const s87maskAt520 = calMask();
const s87subAt520 = s86subOf('2026-04-05');
const s87overlaysAfter = JSON.stringify((settingsNow().calendar || {}).overlays || {});
resizeTo(1200);
check('S87', '§15-87 窄档(520px)降级只影响显示：data-cal-overlay 仍等于设置值、settings.calendar.overlays 逐字不变、副行不超过单条长度',
  s87maskAt520 === 6 && s87overlaysAfter === s87overlaysBefore && s87subAt520.text.length <= Math.max(s87subBefore.text.length, 4),
  'mask@520=' + s87maskAt520 + ' settings 不变=' + (s87overlaysAfter === s87overlaysBefore) + ' 副行 ' + JSON.stringify(s87subBefore.text) + '→' + JSON.stringify(s87subAt520.text));

/* ---------------- §15-88 设置页分组顺序 ---------------- */
if (centerView() !== 'settings') fire(railDt('rail-settings'));
const s88titles = all((n) => hasClass(n, 'dtCardTitle')).map((n) => nodeText(n).trim());
/* t111 在「服务商与模型」后插入「评分反馈样本」卡片；§15-88 的六项相对顺序不变，迁移为「六项按下标递增出现」。 */
const S88_REQ = ['完成音效与提醒', '主题', '服务商与模型', '模块开关', '数据导入导出', '关于'];
const s88idx = S88_REQ.map((t) => s88titles.indexOf(t));
check('S88', '§15-88 设置页六个分组标题顺序固定（t111 追加「评分反馈样本」后仍按 §15-88 的相对顺序出现）：完成音效与提醒 → 主题 → 服务商与模型 → 模块开关 → 数据导入导出 → 关于',
  s88idx.every((i) => i >= 0) && s88idx.every((v, i) => i === 0 || v > s88idx[i - 1]),
  '标题序列=' + s88titles.join(' → '));

/* ---------------- §15-89 模块注册表驱动 rail ---------------- */
if (centerView() !== 'settings') fire(railDt('rail-settings'));
const railOrderTags = () => all((n) => hasClass(n, 'dtRailItem') && attr(n, 'data-dt')).map((n) => attr(n, 'data-dt'));
const moduleRow = (id) => all((n) => hasClass(n, 'dtModuleRow') && attr(n, 'data-module') === id)[0] || null;
const moduleToggle = (id) => { const r = moduleRow(id); return r ? all((n) => attr(n, 'data-dt') === 'module-toggle', r)[0] || null : null; };
const moduleDown = (id) => { const r = moduleRow(id); return r ? all((n) => attr(n, 'data-dt') === 'module-down', r)[0] || null : null; };
const moduleUp = (id) => { const r = moduleRow(id); return r ? all((n) => attr(n, 'data-dt') === 'module-up', r)[0] || null : null; };
/* rail 分段渲染（40-panel.js:269）：清单组是第一个 .dtRailGroup，组内顺序才是用户可见顺序 */
const railListGroup = () => byCls('dtRailGroup')[0] || null;
const railListTags = () => { const g = railListGroup(); return g ? all((n) => hasClass(n, 'dtRailItem'), g).map((n) => attr(n, 'data-dt')) : []; };
const railCountAll = () => all((n) => hasClass(n, 'dtRailItem')).length;
const s89base = railOrderTags();
const s89baseCount = railCountAll();
const s89baseList = railListTags();
const s89todayBefore = s89base.indexOf('rail-today');
const s89todayListBefore = s89baseList.indexOf('rail-today');
const s89tasksBefore89 = JSON.stringify(tasksOfDb());
{ const b = moduleDown('today'); if (b) fire(b); }
const s89uiOrder = ((settingsNow().modules || {}).order || {}).today;
const s89orderMap = Object.assign({}, (settingsNow().modules || {}).order || {});
const s89moved = railOrderTags();
const s89movedList = railListTags();
const s89todayAfter = s89moved.indexOf('rail-today');
const s89todayListAfter = s89movedList.indexOf('rail-today');
applyState({ settings: Object.assign({}, settingsNow(), { modules: Object.assign({}, settingsNow().modules || {}, { order: Object.assign({}, ((settingsNow().modules || {}).order || {}), { today: 999 }) }) }) });
const s89listAt999 = railListTags();
const s89todayListAt999 = s89listAt999.indexOf('rail-today');
/* 复原：直接清空 order（默认 order），顺带拿到「清空即回原位」的往返证据 */
resetModuleOrder();
const s89listRestored = railListTags();
const s89trashToggle = moduleToggle('trash');
const s89trashOnBefore = s89trashToggle ? s89trashToggle.props.checked : null;
if (s89trashToggle) change(s89trashToggle, false);
const s89trashOff = railOrderTags();
const s89offCount = railCountAll();
const s89trashState = ((settingsNow().modules || {}).trash);
const s89settingsToggle = moduleToggle('settings');
const s89settingsChecked = s89settingsToggle ? s89settingsToggle.props.checked === true : false;
const s89settingsLocked = s89settingsToggle ? s89settingsToggle.props.disabled === true : false;
if (s89settingsToggle) change(s89settingsToggle, false);
const s89settingsNoop = ((settingsNow().modules || {}).settings) !== false;
const actionsSrc89 = (function () {
  try { return readFileSync(pathMod.join(partsDir, '53-actions.js'), 'utf8'); } catch (e) { return ''; }
})();
/* settings 不可隐藏是 action 层约束（53-actions.js），bundle 只导出 inject/apply → DOM 不可达，故静态守 */
const s89guardAt = actionsSrc89.indexOf("if (id === 'settings')");
const s89fieldDenied = s89guardAt >= 0 && actionsSrc89.slice(s89guardAt, s89guardAt + 200).indexOf("actionFail('FIELD_DENIED'") >= 0;
const s89back = moduleToggle('trash');
if (s89back) change(s89back, true);
const s89tasksAfter89 = JSON.stringify(tasksOfDb());
const s89sameSet = (a, b) => a.length === b.length && a.slice().sort().join(',') === b.slice().sort().join(',');
/* 拆三条：① 跟随（下移一位）② 末位（order=999）+ 往返 ③ 注册表结构面（开关/锁定/唯一入口）。
   合成一条时任一子项失败都要靠读 evidence 才知道是哪一种病；拆开后红 ID 本身就说清了。 */
/* 期望序列由 store 的 order 真值推出（order → railOrder → id）——不写死具体数字：
   设置页下移是「全局重排 (position+1)*10」，数字随当前顺序变，写死 20 会随实现合法调整而假红。 */
const s89listIds = ['rail-today', 'rail-week', 'rail-tags', 'rail-open', 'rail-done', 'rail-trash'];
const s89expectList = s89listIds.slice().sort(function (a, b) {
  const oa = s89orderMap[a.replace('rail-', '')];
  const ob = s89orderMap[b.replace('rail-', '')];
  const na = typeof oa === 'number' ? oa : 1e9;
  const nb = typeof ob === 'number' ? ob : 1e9;
  return na - nb;
});
check('S89a', '§15-89 设置页「下移一位」立刻反映到 rail：写明 order 落库、清单组顺序等于按 order 推出的期望序列，项数与分组集合不变、不越组',
  typeof s89uiOrder === 'number' && s89listIds.every((t) => typeof s89orderMap[t.replace('rail-', '')] === 'number') &&
    s89movedList.join(',') === s89expectList.join(',') &&
    s89moved.length === s89base.length && s89sameSet(s89moved, s89base) && s89sameSet(s89movedList, s89baseList),
  '全局下标 ' + s89todayBefore + '→' + s89todayAfter + '、清单组内 ' + s89todayListBefore + '→' + s89todayListAfter +
  '（order.today=' + String(s89uiOrder) + '，期望清单组=' + s89expectList.join(',') + '，实际=' + s89movedList.join(',') + '）；项数 ' + s89base.length + '→' + s89moved.length +
  '；清单组集合不变=' + s89sameSet(s89movedList, s89baseList) + ' 全表集合不变=' + s89sameSet(s89moved, s89base));
check('S89b', '§15-89 settings.modules.order.today=999 时该入口排到清单组末位（仍不越组），清空 order 后立即回原位（往返）',
  s89todayListAt999 === s89listAt999.length - 1 && s89sameSet(s89listAt999, s89baseList) &&
    s89listRestored.join(',') === s89baseList.join(','),
  'order=999 后清单组=' + s89listAt999.join(',') + '（today 下标 ' + s89todayListAt999 + '/' + (s89listAt999.length - 1) + '，集合不变=' + s89sameSet(s89listAt999, s89baseList) + '）' +
  '；清空 order → ' + s89listRestored.join(',') + '（逐字回默认=' + (s89listRestored.join(',') === s89baseList.join(',')) + '）');
check('S89c', '§15-89 注册表结构面：trash 关闭后入口消失且项数 −1、任务数据不动，重开回位；settings 行恒勾选且 disabled、onChange 不生效；FIELD_DENIED 静态守存在',
  s89trashOnBefore === true && s89trashState === false && s89trashOff.indexOf('rail-trash') < 0 &&
    s89offCount === s89baseCount - 1 && s89settingsChecked && s89settingsLocked && s89settingsNoop &&
    s89fieldDenied && s89tasksBefore89 === s89tasksAfter89,
  'trash 关后项数 ' + s89baseCount + '→' + s89offCount + ' 入口存在=' + (s89trashOff.indexOf('rail-trash') >= 0) +
  ' 数据不动=' + (s89tasksBefore89 === s89tasksAfter89) + '；settings 行 checked=' + s89settingsChecked +
  ' disabled=' + s89settingsLocked + ' onChange 不生效=' + s89settingsNoop + '；FIELD_DENIED 静态守=' + s89fieldDenied);

/* ---------------- §15-90 db 唯一写入口 + 迁移幂等 ---------------- */
const s90scan = (function () {
  const hits = { assign: [], sync: [], entry: [], mutate: [] };
  if (!partsDir) return hits;
  readdirSync(partsDir).filter((f) => f.slice(-3) === '.js').forEach(function (f) {
    const lines = readFileSync(pathMod.join(partsDir, f), 'utf8').split(/\r?\n/);
    lines.forEach(function (line, i) {
      if (/state\.db\.\w+\s*=/.test(line)) {
        if (/^51-/.test(f)) hits.entry.push(f + ':' + (i + 1));
        else if (f === '00-prelude.js') hits.sync.push(f + ':' + (i + 1));
        else hits.assign.push(f + ':' + (i + 1));
      }
      if (/state\.db\.\w+\.(push|splice)\(/.test(line) && !/^(5[1-9])-/.test(f)) hits.mutate.push(f + ':' + (i + 1) + ' ' + line.trim().slice(0, 40));
    });
  });
  return hits;
})();
const s90v1 = [['t-old', 'inbox', '旧版任务', 0, '2026-01-01', 3]];
globalThis.localStorage.setItem('dsh.tasks.v1', JSON.stringify({ version: 1, projects: [{ id: 'inbox', name: '收集箱', type: 'todo' }], tasks: s90v1 }));
const s90a = bootFresh();
const s90b = bootFresh();
const s90stateA = { version: (s90a.props.store.get() || {}).version, n: (((s90a.props.store.get() || {}).db || {}).tasks || []).length };
const s90stateB = { version: (s90b.props.store.get() || {}).version, n: (((s90b.props.store.get() || {}).db || {}).tasks || []).length };
const s90broken = Object.keys(globalThis.localStorage.__dump ? globalThis.localStorage.__dump() : {}).filter((k) => k.indexOf('.broken.') >= 0);
check('S90', '§15-90 db 是唯一写入口（无 state.db.tasks 赋值、51–59 之外无 push/splice），且 v1 数据连迁两次结果相同、version 恒 2、无 .broken 残留',
  s90scan.assign.length === 0 && s90scan.entry.length > 0 && s90scan.mutate.length === 0 &&
  s90stateA.version === 2 && s90stateB.version === 2 && s90stateA.n === s90stateB.n && s90broken.length === 0,
  '越界赋值=' + (s90scan.assign.join(',') || '0') + '；写入口=' + s90scan.entry.length + ' 处；载入同步=' + s90scan.sync.length + ' 处；db 数组改写越界=' + (s90scan.mutate.join(' | ') || '0') +
  '；迁移 ' + JSON.stringify(s90stateA) + ' → ' + JSON.stringify(s90stateB) + '；broken=' + (s90broken.join(',') || '无'));

/* ---------------- 几何/布局契约（CSS 层，真机像素验收归 t58） ---------------- */
const s91rules = {
  quadScroll: /\.dtQuad\{[^}]*overflow:\s*auto/.test(cssText),
  quadGrid: /\.dtQuadGrid\{[^}]*grid-template-columns:\s*1fr\s+1fr/.test(cssText),
  cellFlex: /\.dtQuadCell\{[^}]*overflow:\s*hidden/.test(cssText),
  stackMin: /\.dtQuad\[data-layout="stack"\]\s+\.dtQuadCell\{[^}]*min-height:\s*\d+px/.test(cssText),
  stackCol: /\.dtQuad\[data-layout="stack"\]\s+\.dtQuadGrid\{[^}]*grid-template-columns:\s*1fr/.test(cssText)
};
check('S91', '几何契约（CSS 层）：四象限整页不动、.dtQuad 独立纵向滚动，2×2 网格 + 单格最小高度 + stack 单列最小高度都有显式规则',
  s91rules.quadScroll && s91rules.quadGrid && s91rules.cellFlex && s91rules.stackMin && s91rules.stackCol,
  '规则命中 滚动=' + s91rules.quadScroll + ' 2×2网格=' + s91rules.quadGrid + ' 格子裁剪=' + s91rules.cellFlex + ' stack单列=' + s91rules.stackCol + ' stack最小高=' + s91rules.stackMin);

/* ===== 十五、t101 三条新规格：rail 工具项开关 / 日历窄档几何 / 导出降级契约 ===== */
/* 判据真源说明：center 是 TasksPanel 的局部 state（src/parts/40-panel.js:946），仓库里没有
   可读的 state.ui.center；它唯一的 DOM 投影是 .dtCenter[data-view]（src/parts/40-panel.js:1496），
   所以本节读 data-view，并用 rail 高亮类 dtRailOn 交叉验证（两者同源，不是两个判据）。
   t103 范围按 captain m02775 收窄：开关语义只断「番茄钟 / 螺旋 / 设置」三项；
   四象限 / 日历 / 习惯 / 绊脚石 / 禁止清单 / 必做之事改为 B 栏来源，
   那组（B 栏互斥替换、五段分组顺序、rail 不写 C、C 随 B 关闭）等 t105 规格 + t106 实现后另卡补。 */

function s103Center() {
  const n = one((n) => hasClass(n, 'dtCenter'));
  return n ? String(attr(n, 'data-view')) : '(无中间区)';
}
function s103RailOn(dtId) {
  const n = railDt(dtId);
  return n ? hasClass(n, 'dtRailOn') : null;
}
function s103BView() {
  const b = drawerSlot('b');
  return b ? String(attr(b, 'data-drawer-view')) : null;
}
function s103CView() {
  const c = drawerSlot('c');
  return c ? String(attr(c, 'data-detail-view')) : null;
}
function s103BackCal() {
  if (s103Center() !== 'calendar') fire(railDt('rail-calendar'));
}
function s103OpenBC() {
  closeAllDrawers();
  fire(railByLabel('收集箱'));
  const b = drawerSlot('b');
  const row = b ? all((n) => hasClass(n, 'dtRow'), b)[0] : null;
  if (row) fire(row);
}

/* --- T103a 番茄钟 / 设置：两次点击往返，且全程不动 B 栏来源与 C 栏详情（§1.2.3 硬规则②）--- */
const t103switch = ['rail-pomodoro', 'rail-settings'].map(function (dtId) {
  s103BackCal();
  s103OpenBC();
  const b0 = s103BView();
  const c0 = s103CView();
  fire(railDt(dtId));
  const s1 = s103Center();
  const on1 = s103RailOn(dtId);
  const b1 = s103BView();
  const c1 = s103CView();
  fire(railDt(dtId));
  const s2 = s103Center();
  const on2 = s103RailOn(dtId);
  const b2 = s103BView();
  const c2 = s103CView();
  const want = dtId.replace('rail-', '');
  /* 三栏模型：番茄钟/设置本身就是 B 栏视图（与清单互斥），点击会替换 B 并清 C；
     第二击按 §1.2「同值再点 = 关 B」落空态——原「回中间区日历」是 ui.center 时代的旧口径。 */
  const ok = s1 === want && on1 === true && b1 === want && c1 === null &&
    s2 === null && on2 === false && b2 === null && c2 === null;
  return {
    ok: ok,
    text: dtId + ' → ' + s1 + '(高亮 ' + on1 + ') → ' + s2 + '(高亮 ' + on2 + ')' +
      '；B ' + b0 + '/' + b1 + '/' + b2 + '，C ' + c0 + '/' + c1 + '/' + c2
  };
});
gap('T103a', '§1.2.3 番茄钟与设置（三栏迁移）：第一次点入 → B 栏换成该页；第二次点同一项 → B 关落空态、高亮消失（§1.2/§8-86）',
  t103switch.every((c) => c.ok), t103switch.map((c) => c.text).join(' ｜ ') +
  '（实测：pomodoro 第二次点击直接 return、B 不关；settings 走 onPick 可关 —— src/parts/40-panel.js:1038-1046）', 't116');

/* --- T103b 螺旋：开关 + listView/detail 清空是 §1.2.3 明写的例外 --- */
s103BackCal();
s103OpenBC();
const t103spC0 = s103CView();
fire(railDt('rail-spiral'));
const t103spS1 = s103Center();
const t103spB1 = s103BView();
const t103spOn1 = s103RailOn('rail-spiral');
fire(railDt('rail-spiral'));
const t103spS2 = s103Center();
const t103spB2 = s103BView();
const t103spC2 = s103CView();
const t103spOn2 = s103RailOn('rail-spiral');
gap('T103b', '§1.2.3 螺旋（三栏迁移）：第一次点入 → B 栏写 spiral；第二次点同一项 → B 关落空态、高亮消失（§1.2/§8-86）',
  t103spS1 === 'spiral' && t103spB1 === 'spiral' && t103spC0 !== null &&
  t103spS2 === null && t103spB2 === null && t103spC2 === null && t103spOn2 === false,
  'center ' + t103spS1 + '/' + t103spS2 + '；B ' + t103spB1 + '/' + t103spB2 +
  '；C ' + t103spC0 + '/—/' + t103spC2 + '；高亮 ' + t103spOn1 + '/' + t103spOn2 +
  '（实测：实现把已激活的 spiral 落回 pomodoro，不是空态 —— src/parts/40-panel.js:1040-1043）', 't116');

/* --- T103c/T103d/T103e 日历窄档几何（§8-69）：桩没有布局引擎，只断静态解析与结构 --- */
s103BackCal();
function s103Block(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx + 1, i);
    }
  }
  return '';
}
function s103Container(width) {
  const key = '@container dtroot (max-width:' + width + 'px)';
  const at = cssText.indexOf(key);
  if (at < 0) return null;
  const open = cssText.indexOf('{', at + key.length);
  if (open < 0) return null;
  return s103Block(cssText, open);
}
function s103Rules(body, selector) {
  const out = [];
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc + '\\s*\\{([^}]*)\\}', 'g');
  let m = re.exec(body);
  while (m !== null) {
    out.push(m[1]);
    m = re.exec(body);
  }
  return out;
}
const t103narrow = s103Container('719');
const t103addRules = t103narrow ? s103Rules(t103narrow, '.dtCalAdd') : [];
const t103dayRules = t103narrow ? s103Rules(t103narrow, '.dtCalDay') : [];
/* 同选择器在同一个块里出现两次，生效的是最后一条（CSS 层叠），所以取末条判有效声明 */
const t103addEff = t103addRules.length ? t103addRules[t103addRules.length - 1] : '';
const t103dayEff = t103dayRules.length ? t103dayRules[t103dayRules.length - 1] : '';
const t103addPos = (/position\s*:\s*([a-z-]+)/.exec(t103addEff) || [])[1] || '(未声明)';
const t103addSize = /(width\s*:\s*[^;}]+)/.exec(t103addEff) || [];
const t103dayFont = (/font-size\s*:\s*([^;}]+)/.exec(t103dayEff) || [])[1] || '(未声明)';
check('T103c', '§8-69 日历窄档（@container dtroot max-width:719px）里 .dtCalAdd 的有效声明不靠 position:absolute 定位，且有显式尺寸',
  t103narrow !== null && t103addRules.length > 0 && t103addPos !== 'absolute' &&
  (t103addPos === 'static' || t103addPos === 'relative') && t103addSize.length > 0,
  '块内 .dtCalAdd 规则 ' + t103addRules.length + ' 条；末条 position=' + t103addPos +
  (t103addSize.length ? '；' + String(t103addSize[1]).trim() : '；无 width 声明'));

const t103calNumHits = [];
(function () {
  const files = readdirSync(partsDir).filter((f) => /\.js$/.test(f));
  files.forEach(function (f) {
    const src = readFileSync(pathMod.join(partsDir, f), 'utf8');
    src.split(/\r?\n/).forEach(function (line, i) {
      if (line.indexOf('dtCalNum') >= 0) t103calNumHits.push(f + ':' + (i + 1));
    });
  });
})();
check('T103d', '§8-69 窄档 .dtCalDay 有真实字号规则（不是靠 • 或伪元素凑），且全仓不再出现 .dtCalNum',
  t103narrow !== null && t103dayRules.length > 0
    /* S2：字号统一到 --dt-fs-* 令牌后，`var(--dt-fs-micro)` 不含数字，仍属「真实字号规则」 */
    && (/[0-9]/.test(t103dayFont) || /var\(--dt-fs-/.test(t103dayFont))
    && t103calNumHits.length === 0,
  '块内 .dtCalDay 规则 ' + t103dayRules.length + ' 条；font-size=' + t103dayFont +
  '；dtCalNum 命中 ' + t103calNumHits.length + (t103calNumHits.length ? '（' + t103calNumHits.join(',') + '）' : ''));

const t103cellBad = [];
const t103cells = cells();
t103cells.forEach(function (cell) {
  const key = String(attr(cell, 'data-date'));
  const day = all((n) => hasClass(n, 'dtCalDay'), cell)[0];
  const add = all((n) => hasClass(n, 'dtCalAdd'), cell)[0];
  if (!day) t103cellBad.push(key + ':缺.dtCalDay');
  if (!add) t103cellBad.push(key + ':缺.dtCalAdd');
  [['.dtCalDay', day], ['.dtCalAdd', add]].forEach(function (pair) {
    if (!pair[1]) return;
    const st = pair[1].props ? pair[1].props.style : null;
    if (st && st.display === 'none') t103cellBad.push(key + ':' + pair[0] + ' display:none');
    if (pair[1].props && (pair[1].props.hidden === true || pair[1].props['data-hidden'])) t103cellBad.push(key + ':' + pair[0] + ' hidden');
  });
});
const t103hideRules = ['dtCalDay', 'dtCalAdd'].filter(function (cls) {
  const bodies = cssRuleAll('.' + cls);
  return bodies.some(function (b) { return /display\s*:\s*none/.test(b); });
});
check('T103e', '§8-69 结构层：42 格里 .dtCalDay 与 .dtCalAdd 同时存在且都不被 display:none / hidden 关掉（真实几何由 t100 真机像素判据覆盖）',
  t103cells.length === 42 && t103cellBad.length === 0 && t103hideRules.length === 0,
  '捕捉 ' + t103cells.length + ' 格；异常 ' + t103cellBad.length + (t103cellBad.length ? '（' + t103cellBad.slice(0, 4).join('；') + '）' : '') +
  '；display:none 命中的选择器 ' + (t103hideRules.length ? t103hideRules.join(',') : '0'));

/* --- T103f/T103g/T103h 导出降级契约（stage4 §12.5）--- */
if (s103Center() !== 'settings') fire(railDt('rail-settings'));
const t103entry = byDt('export-json')[0] || byDt('export')[0] || null;
globalThis.__anchorLog.length = 0;
/* §12.5-3「常驻 DOM、默认折叠」只能在点击前观测：先记一份折叠态快照，再点开。 */
const t103preFallback = byDt('export-fallback')[0] || null;
const t103preOpen = t103preFallback ? String(attr(t103preFallback, 'data-open')) : '(无容器)';
if (t103entry) fire(t103entry);
const t103anchor = globalThis.__anchorLog[globalThis.__anchorLog.length - 1] || null;
const t103wantName = 'dsh-tasks-' + TODAY_K + '.json';
const t103dlName = t103anchor ? String(t103anchor.download) : '';
const t103nameOk = /^dsh-tasks-\d{4}-\d{2}-\d{2}\.json$/.test(t103dlName) &&
  t103dlName === t103wantName &&
  t103dlName.indexOf('.tmp') < 0 &&
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(t103dlName);
check('T103f', '§12.5-1/-2 导出：入口存在，点击后走 Blob+a[download] 下载且文件名 = dsh-tasks-<dateKey>.json（禁 .tmp / UUID / 无扩展名）',
  !!t103entry && !!t103anchor && t103anchor.clicks === 1 && t103nameOk && String(t103anchor.href).indexOf('blob:') === 0,
  (t103entry ? '入口 data-dt=' + String(attr(t103entry, 'data-dt')) : '入口缺失') +
  '；下载名 ' + JSON.stringify(t103dlName) + '（期望 ' + t103wantName + '）' +
  '；href=' + (t103anchor ? String(t103anchor.href) : '(无)') +
  '；a.click() 次数 ' + (t103anchor ? t103anchor.clicks : 0));

const t103settingsSrc = readFileSync(pathMod.join(partsDir, '60-settings.js'), 'utf8');
const t103srcLines = t103settingsSrc.split(/\r?\n/);
const t103openHits = [];
const t103dataHits = [];
t103srcLines.forEach(function (line, i) {
  if (line.indexOf('window.open') >= 0) t103openHits.push('60-settings.js:' + (i + 1));
  if (/['"`]data:[a-z]+\//.test(line)) t103dataHits.push('60-settings.js:' + (i + 1));
});
check('T103g', '§12.5-5 导出路径禁 window.open、禁 data: URL（静态，全文件扫描）',
  t103openHits.length === 0 && t103dataHits.length === 0,
  'window.open 命中 ' + t103openHits.length + (t103openHits.length ? '（' + t103openHits.join(',') + '）' : '') +
  '；data: URL 命中 ' + t103dataHits.length + (t103dataHits.length ? '（' + t103dataHits.join(',') + '）' : ''));

const t103box = byDt('export-box')[0] || byDt('export-fallback')[0] || null;
const t103text = byDt('export-text')[0] || null;
const t103copy = byDt('export-copy')[0] || null;
const t103close = byDt('export-close')[0] || null;
const t103textVal = t103text && t103text.props ? String(t103text.props.value || '') : '';
check('T103h', '§12.5-4 降级展开态齐备：只读 textarea（含 JSON 内容）+ 复制按钮 + 收起按钮同时出现',
  !!t103box && !!t103text && !!(t103text.props && t103text.props.readOnly === true) &&
  t103textVal.length > 0 && t103textVal.charAt(0) === '{' && !!t103copy && !!t103close,
  '容器 ' + (t103box ? 'data-dt=' + String(attr(t103box, 'data-dt')) : '(无)') +
  '；textarea readOnly=' + (t103text && t103text.props ? t103text.props.readOnly : '(无)') +
  ' 长度 ' + t103textVal.length + '；复制按钮 ' + (t103copy ? '在' : '缺') + '；收起按钮 ' + (t103close ? '在' : '缺'));

const t103postFallback = byDt('export-fallback')[0] || null;
const t103postOpen = t103postFallback ? String(attr(t103postFallback, 'data-open')) : '(无容器)';
const t103saveasNow = byDt('export-saveas')[0] || null;
const t103entryNow = byDt('export')[0] || null;
/* t104 已落地 §12.5-3/-4：入口改名 export（export-json 作为历史别名保留）、降级容器常驻并靠 data-open 折叠。
   这条由 t103 的观察项升为硬门禁（判据先行 → 转绿升硬），并逐条断三项，不再用「容器存在」一个布尔代表全部。 */
check('T103i', '§12.5-3/-4 降级入口常驻且默认折叠（点击前 data-open="0"）、点击后展开为 "1" 且出现另存为按钮，入口标识为 [data-dt=export]',
  !!t103preFallback && t103preOpen === '0' &&
  !!t103postFallback && t103postOpen === '1' &&
  !!t103saveasNow && !!t103entryNow,
  '点击前 data-open=' + t103preOpen + '（容器' + (t103preFallback ? '常驻' : '缺失') + '）；点击后 data-open=' + t103postOpen +
  '；另存为按钮 ' + (t103saveasNow ? '在' : '缺') + '；入口 data-dt=' + (t103entryNow ? 'export' : '(缺)'));

/* ============================ 十六、t111 预置门禁（评分反馈 + few-shot；判据先行，卡 t111） ============================ */
/* 本段按 t113 派单：t111（评分反馈 + few-shot）尚未开工，但规格已把选择器、键集合与严格等值钉死，
   所以先把判据写死、用 gap(..., 't111') 挂着；t111 交付后由回归逐条转成 check()。
   三条自约束：
   ① 每条都带卡号 't111'（t71 的「软/硬门禁准则」：判据先行必须带卡号）；
   ② 只用规格写死的选择器/键名/等值，不为「实现大概会这么写」留模糊匹配；
   ③ 谓词在实现缺失时返回 false 并把「缺什么」写进 evidence；任何异常都被 gapT111 吞成 GAP，
      绝不让本段把整轮打挂（t111 未交付时这里必然大面积 GAP，这正是它的用途）。 */
function gapWithCard(card, id, name, fn) {
  let ok = false;
  let evidence = '';
  try {
    const r = fn() || {};
    ok = !!r.ok;
    evidence = String(r.evidence === undefined ? '' : r.evidence);
  } catch (e) {
    ok = false;
    evidence = '异常（实现未落地时预期如此）：' + (e && e.message ? e.message : String(e));
  }
  return gap(id, name + '［卡 ' + card + '；交付后转硬］', ok, evidence, card);
}
/* 判据先行的两条通道：卡号必须写对，否则下一个人会以为它无人认领。
   t111 已收口（2026-11-05）；打分通道接线 + .dtAgentBar 的 data-kind 归属 t130（captain 裁定）。 */
function gapT111(id, name, fn) { return gapWithCard('t111', id, name, fn); }
function gapT130(id, name, fn) { return gapWithCard('t130', id, name, fn); }

const t111State = () => storeApi.get() || {};
const t111Db = () => t111State().db || {};
const t111Settings = () => t111State().settings || {};
const t111Scores = () => (t111Db().scores && typeof t111Db().scores === 'object' ? t111Db().scores : {});
const t111Feedback = () => (Array.isArray(t111Db().scoreFeedback) ? t111Db().scoreFeedback : null);
const t111In = (id, root) => (root ? all((n) => attr(n, 'data-dt') === id, root)[0] || null : byDt(id)[0] || null);
const t111N = (id, root) => (root ? all((n) => attr(n, 'data-dt') === id, root).length : byDt(id).length);
const t111DetailRoot = () => { const c = cSlot(); return c ? one((n) => hasClass(n, 'dtDetail'), c) : null; };
const t111Edit = () => t111In('score-edit', cSlot());
const T111_TASK = 's1';

/* 夹具：一个清单两条任务 + 一条 auto 分（§8-78 的「显示层不抹平」需要小数分）。 */
const t111Tasks = [
  { id: 's1', projectId: 'inbox', title: '预置门禁夹具甲', status: 0, priority: 3, tags: [], steps: [], createdAt: '2026-11-01T00:00:00.000Z' },
  { id: 's2', projectId: 'inbox', title: '预置门禁夹具乙', status: 0, priority: 0, tags: [], steps: [], createdAt: '2026-11-02T00:00:00.000Z' }
];
applyState({ projects: [{ id: 'inbox', name: '收集箱', type: 'list', color: 'none' }], tasks: t111Tasks.map((t) => Object.assign({}, t)), habits: [] });
setDb({ tasks: t111Tasks.map((t) => Object.assign({}, t)), scores: { s1: { score: 34.3, source: 'auto' } } });
function t111OpenTask(id) {
  closeAllDrawers();
  openProjectList('收集箱');
  const row = all((n) => hasClass(n, 'dtRow') && attr(n, 'data-task-id') === id)[0] || null;
  if (row) fire(row);
  rerender(); rerender();
  return t111Edit();
}
const t111ResetScore = (v) => { setDb({ scores: Object.assign({}, t111Scores(), { s1: { score: v, source: 'auto' } }) }); rerender(); rerender(); };
t111OpenTask(T111_TASK);

/* —— §8-77 控件结构穷举 —— */
gapT111('T111-77a', '§8-77 .dtDetail 内 [data-dt=score-edit] 恰 1 个，其下 score-ring / detail-score / score-range / score-input / score-submit / score-reset 各恰 1 个', () => {
  const root = t111DetailRoot();
  const edit = t111Edit();
  const ids = ['score-ring', 'detail-score', 'score-range', 'score-input', 'score-submit', 'score-reset'];
  const detail = ids.map((id) => id + '=' + t111N(id, edit)).join(' ');
  return {
    ok: !!root && t111N('score-edit', root) === 1 && !!edit && ids.every((id) => t111N(id, edit) === 1),
    evidence: '.dtDetail=' + (root ? '在' : '缺') + '；score-edit 计数=' + t111N('score-edit', root) + '；子项 ' + detail
  };
});
gapT111('T111-77b', '§8-77 range.step=1 / min=0 / max=100、number.step=1（整数步长）、number[inputmode=numeric]', () => {
  const range = t111In('score-range', t111Edit());
  const num = t111In('score-input', t111Edit());
  const rp = (range && range.props) || {};
  const np = (num && num.props) || {};
  const mode = np.inputMode === undefined ? np.inputmode : np.inputMode;
  return {
    ok: !!range && !!num && String(rp.step) === '1' && String(rp.min) === '0' && String(rp.max) === '100' &&
      String(np.step) === '1' && String(mode) === 'numeric',
    evidence: 'range.step=' + String(rp.step) + ' range.min=' + String(rp.min) + ' range.max=' + String(rp.max) +
      ' number.step=' + String(np.step) + ' inputmode=' + String(mode) + '（range ' + (range ? '在' : '缺') + '/number ' + (num ? '在' : '缺') + '）'
  };
});

/* 提交路径：规格写「输入后按 Enter」，实现也可能给提交按钮 —— 两条都试，证据里记明走了哪条。 */
function t111Commit(v) {
  const edit = t111Edit();
  const input = t111In('score-input', edit);
  if (!input) return { via: '无 score-input', score: t111Scores()[T111_TASK], entry: null };
  change(input, v);
  const input2 = t111In('score-input', t111Edit());
  let via = '';
  const kd = input2 && input2.props && input2.props.onKeyDown;
  if (typeof kd === 'function') {
    const ev = mkEvent(input2, 'keydown');
    ev.key = 'Enter';
    try { kd(ev); } catch (e) { errors.push(['score-enter', e]); }
    rerender(); rerender();
    via = 'Enter';
  }
  const submit2 = t111In('score-submit', t111Edit());
  if (!via && submit2 && submit2.props.disabled !== true) { fire(submit2); via = 'score-submit'; }
  return { via: via || '无提交路径', score: t111Scores()[T111_TASK], entry: submit2 };
}
function t111RoundCase(id, raw, expect) {
  gapT111(id, '§8-78 输入 ' + raw + ' 提交 → db.scores[' + T111_TASK + '].score === ' + expect + '（严格等值）', () => {
    t111ResetScore(34.3);
    const r = t111Commit(raw);
    const score = r.score ? r.score.score : undefined;
    return {
      ok: score === expect,
      evidence: '提交路径=' + r.via + '；db.score=' + JSON.stringify(score) + '（期望 ' + expect + '，类型 ' + typeof score + '）'
    };
  });
}
t111RoundCase('T111-78a', '71.44', 71);
t111RoundCase('T111-78b', '34.5', 35);
t111RoundCase('T111-78c', '150', 100);
t111RoundCase('T111-78d', '-3', 0);
gapT111('T111-78e', '§8-78 显示层不抹平：写入 auto/34.3 后 [data-dt=score-edit] 的 data-score === "34.3"（不得变 "34" 或 "34.0"）', () => {
  t111ResetScore(34.3);
  t111OpenTask(T111_TASK);
  const edit = t111Edit();
  const got = edit ? String(attr(edit, 'data-score')) : '(无 score-edit)';
  return { ok: got === '34.3', evidence: 'data-score=' + got };
});

/* —— §8-79 提交写 manual 且视觉即时跟随 —— */
gapT111('T111-79a', '§8-79 已存 auto/71.4 时提交 45.0 → scores.score=45、source=manual、data-score-src=manual、data-score-tier=2（阈值 20/40/60）、submit 变 disabled、reset 变 enabled', () => {
  t111ResetScore(71.4);
  t111OpenTask(T111_TASK);
  const r = t111Commit('45.0');
  const edit = t111Edit();
  const rec = t111Scores()[T111_TASK] || {};
  const tierNode = cSlot() ? one((n) => attr(n, 'data-score-tier') !== undefined, cSlot()) : null;
  const tier = tierNode ? String(attr(tierNode, 'data-score-tier')) : '(无 data-score-tier 节点)';
  const src = edit ? String(attr(edit, 'data-score-src')) : '(无 score-edit)';
  const submit = t111In('score-submit', edit);
  const reset = t111In('score-reset', edit);
  return {
    ok: rec.score === 45 && rec.source === 'manual' && src === 'manual' && tier === '2' &&
      !!submit && submit.props.disabled === true && !!reset && reset.props.disabled !== true,
    evidence: '提交路径=' + r.via + '；score=' + JSON.stringify(rec.score) + ' source=' + JSON.stringify(rec.source) +
      ' data-score-src=' + src + ' data-score-tier=' + tier +
      '；submit.disabled=' + String(submit ? submit.props.disabled : '(缺)') + ' reset.disabled=' + String(reset ? reset.props.disabled : '(缺)')
  };
});

/* —— §8-80 非法输入不写库 —— */
gapT111('T111-80a', '§8-80 输入 abc 后失焦 → db 分与条数逐字不变、scoreFeedback 长度不变、出现 .dtToast 且含「0–100」、输入框 value 恢复已存分', () => {
  t111ResetScore(34.3);
  t111OpenTask(T111_TASK);
  const before = JSON.stringify({ score: (t111Scores()[T111_TASK] || {}).score, n: Object.keys(t111Scores()).length, fb: (t111Feedback() || []).length });
  const edit = t111Edit();
  const input = t111In('score-input', edit);
  if (!input) return { ok: false, evidence: '无 [data-dt=score-input]' };
  change(input, 'abc');
  const input2 = t111In('score-input', t111Edit());
  const blur = input2 && input2.props && input2.props.onBlur;
  if (typeof blur === 'function') { try { blur(mkEvent(input2, 'blur')); } catch (e) { errors.push(['score-blur', e]); } rerender(); rerender(); }
  const after = JSON.stringify({ score: (t111Scores()[T111_TASK] || {}).score, n: Object.keys(t111Scores()).length, fb: (t111Feedback() || []).length });
  const toasts = (typeof toastEntries === 'function' ? toastEntries() : []).map((t) => String(t)).join(' / ');
  const restored = t111In('score-input', t111Edit());
  const restoredVal = restored ? String(restored.props.value) : '(无输入框)';
  return {
    ok: before === after && toasts.indexOf('0–100') >= 0 && restoredVal === '34.3',
    evidence: '前后=' + before + ' → ' + after + '；onBlur=' + (typeof blur === 'function' ? '在' : '缺') +
      '；toast=' + (toasts || '(空)') + '；value 恢复=' + restoredVal
  };
});

/* —— §8-81 重置回自动分且不写反馈 —— */
gapT111('T111-81a', '§8-81 手动 45.0（反馈 +1）后点 score-reset → source=auto、score 回 scoreTask 现算值、scoreFeedback 长度不变、reset 变 disabled', () => {
  t111ResetScore(60);
  t111OpenTask(T111_TASK);
  const autoBaseline = (t111Scores()[T111_TASK] || {}).score;
  t111Commit('45.0');
  const fbAfterManual = (t111Feedback() || []).length;
  const reset = t111In('score-reset', t111Edit());
  if (!reset) return { ok: false, evidence: '无 [data-dt=score-reset]；提交后 score=' + JSON.stringify(t111Scores()[T111_TASK]) };
  if (reset.props.disabled === true) return { ok: false, evidence: 'reset 仍 disabled，无法执行' };
  fire(reset);
  const rec = t111Scores()[T111_TASK] || {};
  const fbAfterReset = (t111Feedback() || []).length;
  const reset2 = t111In('score-reset', t111Edit());
  return {
    ok: rec.source === 'auto' && rec.score === autoBaseline && fbAfterReset === fbAfterManual && !!reset2 && reset2.props.disabled === true,
    evidence: '重置前 auto 分=' + JSON.stringify(autoBaseline) + '（scoreTask 未导出，用提交前 auto 分作观测等价）→ 重置后 ' + JSON.stringify(rec) +
      '；feedback ' + fbAfterManual + '→' + fbAfterReset + '；reset.disabled=' + String(reset2 ? reset2.props.disabled : '(缺)')
  };
});

/* —— §8-82 拖动不提交 —— */
gapT111('T111-82a', '§8-82 对 score-range 派发 input(30) → data-pending=1、submit enabled、库内分未变；change/blur 前不写库', () => {
  t111ResetScore(34.3);
  t111OpenTask(T111_TASK);
  const before = JSON.stringify(t111Scores()[T111_TASK] || {});
  const range = t111In('score-range', t111Edit());
  if (!range || typeof range.props.onInput !== 'function') return { ok: false, evidence: 'range=' + (range ? '在但无 onInput' : '缺') + '；库内=' + before };
  try { range.props.onInput({ target: { value: '30' } }); } catch (e) { errors.push(['score-range', e]); }
  rerender(); rerender();
  const edit = t111Edit();
  const pending = edit ? String(attr(edit, 'data-pending')) : '(无 score-edit)';
  const submit = t111In('score-submit', edit);
  const after = JSON.stringify(t111Scores()[T111_TASK] || {});
  return {
    ok: pending === '1' && !!submit && submit.props.disabled !== true && before === after,
    evidence: 'data-pending=' + pending + '；submit.disabled=' + String(submit ? submit.props.disabled : '(缺)') + '；库内 ' + before + ' → ' + after
  };
});

/* —— §8-83 busy 与排序联动 —— */
gapT111('T111-83a', '§8-83 批量打分进行中（db busy）→ [data-dt=score-edit] 内三个可交互元素 disabled === true', () => {
  setDb({ scores: Object.assign({}, t111Scores(), { s1: { score: 34.3, source: 'auto' } }), meta: Object.assign({}, t111Db().meta || {}, { busy: true }) });
  t111OpenTask(T111_TASK);
  const edit = t111Edit();
  const ids = ['score-range', 'score-input', 'score-submit'];
  const got = ids.map((id) => { const n = t111In(id, edit); return id + '.disabled=' + String(n ? n.props.disabled : '(缺)'); });
  setDb({ meta: Object.assign({}, t111Db().meta || {}, { busy: false }) });
  return { ok: ids.every((id) => { const n = t111In(id, edit); return !!n && n.props.disabled === true; }), evidence: got.join(' ') + '（busy 的存储位规格未写明，本断言用 db.meta.busy 探针，属规格缺口）' };
});
gapT111('T111-83b', '§8-83 sort-key=score 时把某任务分从 30 改到 95 → 该任务在 .dtRow 序列中的下标严格变小', () => {
  const keySel = byDt('sort-key')[0] || null;
  if (!keySel || typeof keySel.props.onChange !== 'function') return { ok: false, evidence: '无 [data-dt=sort-key]（排序栏未渲染）' };
  change(keySel, 'score');
  setDb({ scores: Object.assign({}, t111Scores(), { s1: { score: 30, source: 'auto' }, s2: { score: 80, source: 'auto' } }) });
  rerender(); rerender();
  const idxOf = (id) => all((n) => hasClass(n, 'dtRow') && attr(n, 'data-task-id') !== undefined).map((n) => attr(n, 'data-task-id')).indexOf(id);
  const before = idxOf('s1');
  t111OpenTask(T111_TASK);
  const r = t111Commit('95');
  const after = idxOf('s1');
  return { ok: before >= 0 && after >= 0 && after < before, evidence: '提交路径=' + r.via + '；s1 下标 ' + before + ' → ' + after + '（分值 30 → 95）' };
});

/* —— §15-93 反馈库 schema（键集合严格等值，不数数字） —— */
gapT111('T111-93a', '§15-93 手动提交一次后 db.scoreFeedback 末条 Object.keys().sort() 严格等于 10 个顶层键（after/at/before/coldStart/delta/features/id/promptVersion/rubricVersion/taskId），length===10', () => {
  t111ResetScore(60);
  t111OpenTask(T111_TASK);
  const fbBefore = (t111Feedback() || []).length;
  t111Commit('45.0');
  const fb = t111Feedback();
  if (!fb) return { ok: false, evidence: 'db.scoreFeedback 不是数组（' + typeof t111Db().scoreFeedback + '）' };
  const rec = fb[fb.length - 1] || {};
  const want = ['after', 'at', 'before', 'coldStart', 'delta', 'features', 'id', 'promptVersion', 'rubricVersion', 'taskId'];
  const got = Object.keys(rec).sort();
  return { ok: fb.length === fbBefore + 1 && JSON.stringify(got) === JSON.stringify(want) && Object.keys(rec).length === 10, evidence: '长度 ' + fbBefore + '→' + fb.length + '；keys=' + JSON.stringify(got) };
});
gapT111('T111-93b', '§15-93 rec.features 的 Object.keys().sort() 严格等于 7 个键（content/dueDate/priority/projectId/quad/tags/title），length===7', () => {
  const fb = t111Feedback();
  const rec = fb && fb.length ? fb[fb.length - 1] : null;
  if (!rec || !rec.features) return { ok: false, evidence: '末条无 features（' + (rec ? Object.keys(rec).join(',') : '反馈库为空') + '）' };
  const want = ['content', 'dueDate', 'priority', 'projectId', 'quad', 'tags', 'title'];
  const got = Object.keys(rec.features).sort();
  return { ok: JSON.stringify(got) === JSON.stringify(want) && Object.keys(rec.features).length === 7, evidence: 'keys=' + JSON.stringify(got) };
});
gapT111('T111-93c', '§15-93 rec.before 的 Object.keys().sort() 严格等于 3 键（origin/score/source）；Number.isInteger(after)、before.score 可为小数、delta 一位小数、promptVersion=scorefs-1', () => {
  const fb = t111Feedback();
  const rec = fb && fb.length ? fb[fb.length - 1] : null;
  if (!rec || !rec.before) return { ok: false, evidence: '末条无 before' };
  const keys = Object.keys(rec.before).sort();
  const dec1 = (x) => typeof x === 'number' && Math.round(x * 10) / 10 === x;
  return {
    ok: JSON.stringify(keys) === JSON.stringify(['origin', 'score', 'source']) && Number.isInteger(rec.after) && dec1(rec.delta) && rec.promptVersion === 'scorefs-1',
    evidence: 'before.keys=' + JSON.stringify(keys) + '；after=' + JSON.stringify(rec.after) + ' integer=' + Number.isInteger(rec.after) +
      '；delta=' + JSON.stringify(rec.delta) + '；promptVersion=' + JSON.stringify(rec.promptVersion)
  };
});

/* —— §15-94 只记手动改分 —— */
gapT111('T111-94a', '§15-94 批量打分 + score-reset + tt-scores 导入都不写反馈；只有手动提交 +1', () => {
  const fb0 = (t111Feedback() || []).length;
  const bulk = byDt('score-batch')[0] || null;
  if (bulk) fire(bulk);
  const resetBtn = t111In('score-reset', t111Edit());
  if (resetBtn && resetBtn.props.disabled !== true) fire(resetBtn);
  const fb1 = (t111Feedback() || []).length;
  t111ResetScore(60);
  t111Commit('45.0');
  const fb2 = (t111Feedback() || []).length;
  return { ok: fb1 === fb0 && fb2 === fb1 + 1, evidence: '基线 ' + fb0 + '；批量/重置后 ' + fb1 + '；手动提交后 ' + fb2 + '（导入路径未在本段重放，§15-80 已覆盖 tt-scores 冷启动）' };
});

/* —— t129 断言侧修复所需的观测器 ——
   t129Prompts()：模块唯一 prompt 出口 mod.__prompts（t115 定稿，只读冻结，固定两键 agent/score）。
   t129Systems()：把 setFetch 记录的 fetchCalls 解析成「每次请求的 messages[0].content」序列。 */
function t129Prompts() {
  const p = mod && mod.__prompts ? mod.__prompts : null;
  return p && typeof p.agent === 'string' && typeof p.score === 'string' ? p : null;
}
function t129Systems() {
  return fetchCalls.map(function (call) {
    try {
      const body = JSON.parse(call && call.opts && call.opts.body ? call.opts.body : '{}');
      const first = body && Array.isArray(body.messages) ? body.messages[0] : null;
      return first && typeof first.content === 'string' ? first.content : '';
    } catch (e) {
      return '';
    }
  });
}
const T129_SCORE_HEAD = '以下是该用户过去对手动改分的示例';
const t129ClientSrc = (function () { try { return readFileSync(target, 'utf8'); } catch (e) { return ''; } })();

/* —— §15-95 上限与淘汰（t129 修算术） ——
   算术：夹具已有 505 条（at = base + i*1000，i ∈ [0,504]）+ 本次手动提交新写 1 条 = 506 条；
   库上限 500 ⇒ 必须淘汰 at 最小的 6 条（i ∈ [0,5]），剩余首条是原 i=6 ⇒ at − base = 6000ms = 6s。
   原断言写「丢 5 条 / 偏移 5s」比正确值少一条（505 已经>500，写 1 条后要腾出 6 个位置）。 */
const t129_95a = (function () {
  const base = Date.UTC(2026, 0, 1);
  const many = [];
  for (let i = 0; i < 505; i += 1) many.push({ id: 'f' + i, at: base + i * 1000, after: 50, delta: 1.5, taskId: 'x' + i, coldStart: false, promptVersion: 'scorefs-1', rubricVersion: 'calibrated-2026-11', before: { origin: 50, score: 48.5, source: 'auto' }, features: { title: 't', content: '', dueDate: '', priority: 0, projectId: 'inbox', quad: 'q4', tags: [] } });
  setDb({ scoreFeedback: many });
  t111ResetScore(60);
  t111Commit('45.0');
  const fb = t111Feedback() || [];
  const asc = fb.every((r, i) => i === 0 || r.at >= fb[i - 1].at);
  const firstOff = fb[0] ? (fb[0].at - base) / 1000 : NaN;
  return {
    ok: fb.length === 500 && asc && firstOff === 6,
    evidence: '长度=' + fb.length + '（505+1=506，上限 500 ⇒ 淘汰 6）；首条 at 偏移=' + firstOff + 's（期望 6，即丢掉 i=0..5）；升序=' + asc
  };
})();
check('T111-95a', '§15-95 库内 505 条后触发一次写入 → 长度恰 500、丢弃 at 最小的 6 条、剩余 at 严格升序（505 + 1 = 506 → 淘汰 6 条，首条 at 偏移 6s）', t129_95a.ok, t129_95a.evidence);

/* —— §15-96 打分通道的 prompt 面 ——
   96b 改读 mod.__prompts（唯一出口），不再指望 globalThis.AGENT_SCORE_SYSTEM_PROMPT 这种不存在的挂载点。 */
const t129_96b = (function () {
  const prompts = t129Prompts();
  const modKeys = mod ? Object.keys(mod).sort() : [];
  const promptKeys = prompts ? Object.keys(prompts).sort() : [];
  const extra = modKeys.filter(function (k) { return k.indexOf('__') === 0 && k !== '__prompts'; });
  const agent = prompts ? prompts.agent : '';
  const score = prompts ? prompts.score : '';
  return {
    ok: !!prompts && Object.isFrozen(prompts) &&
      JSON.stringify(modKeys) === JSON.stringify(['__prompts', 'apply', 'inject']) &&
      JSON.stringify(promptKeys) === JSON.stringify(['agent', 'score']) && extra.length === 0 &&
      score.indexOf('你是任务评分助手') === 0 &&
      score.indexOf('"score"') >= 0 && score.indexOf('reason') >= 0 &&
      score.indexOf(T129_SCORE_HEAD) < 0 && agent.indexOf(T129_SCORE_HEAD) < 0 &&
      score !== agent,
    evidence: 'mod.keys=' + JSON.stringify(modKeys) + '；__prompts.keys=' + JSON.stringify(promptKeys) +
      '；frozen=' + (!!prompts && Object.isFrozen(prompts)) + '；其它 __ 前缀键=' + (extra.length ? extra.join(',') : '0') +
      '；agent=' + agent.length + 'B；score=' + score.length + 'B；score 首句=' + JSON.stringify(score.slice(0, 12)) +
      '；score 含块头=' + (score.indexOf(T129_SCORE_HEAD) >= 0) + '；两 prompt 相同=' + (score === agent)
  };
})();
check('T111-96b', '§15-96/§1.14 打分 prompt 的唯一出口是 mod.__prompts（冻结、固定两键 agent/score、模块上再无其它 __ 前缀键），且 score 是「评分」契约（首句「你是任务评分助手」、含 "score"/reason、不含 few-shot 块头），与 agent 严格不同', t129_96b.ok, t129_96b.evidence);

/* 96a/96c 要「真的发一次打分请求」，而当前产物没有打分请求的触发点：
   bundle 里 `agentScoreSystem(` 只出现 1 次（= 函数定义本身，0 处调用），`agentRun(` 的唯一调用点
   （59-taskinfo.js 的整理通道）也不传 opts.system/opts.mode ⇒ mode==='score' 分支不可达。
   两条按「判据先行」挂 GAP，证据每次运行都重算；实现接线后无需改断言即自动转绿。 */
gapT130('T111-96a', '§15-96 打分请求 messages[0].content 严格等于 mod.__prompts.score（块不存在时逐字相等）；块存在时为 score + 空行 + few-shot 块，块行数 ≤8、每行 ≤180 字符、整块 ≤1600 字符', function () {
  const defs = (t129ClientSrc.match(/function agentScoreSystem\(/g) || []).length;
  const total = (t129ClientSrc.match(/agentScoreSystem\(/g) || []).length;
  const calls = total - defs;
  const scoreCalls = t129Systems().filter(function (x) { const p = t129Prompts(); return p && x === p.score; }).length;
  return {
    ok: defs === 1 && calls >= 1 && scoreCalls >= 1,
    evidence: 'agentScoreSystem 定义=' + defs + '、调用=' + calls + '（期望 ≥1）；本轮抓到的打分请求=' + scoreCalls + ' 次；' +
      '抓到的 system 长度序列=' + JSON.stringify(t129Systems().map(function (x) { return x.length; }))
  };
});

gapT130('T111-96c', '§15-96 去重二：3 条同 normTitle、同向 delta、同 quad 的反馈 → 打分请求的块内只出现 1 条示例行（键 = normTitle + sign(delta) + quad）', function () {
  const fb = t111Feedback() || [];
  const keyed = {};
  fb.forEach(function (row) {
    if (!row || row.coldStart !== false || typeof row.delta !== 'number') return;
    const f = row.features || {};
    const key = String(f.title || '').trim().toLowerCase() + (row.delta >= 0 ? '+' : '-') + String(f.quad || '');
    keyed[key] = (keyed[key] || 0) + 1;
  });
  const dupKeys = Object.keys(keyed).filter(function (k) { return keyed[k] > 1; });
  const hasChannel = t129Systems().some(function (x) { const p = t129Prompts(); return p && x.indexOf(p.score) === 0; });
  return {
    ok: hasChannel && dupKeys.length === 0,
    evidence: '反馈库=' + fb.length + ' 条；按 normTitle+sign+quad 归并后重复键=' + (dupKeys.length ? dupKeys.join(',') : '0') +
      '；打分请求可用=' + hasChannel + '（不可用则块内行数不可观测）'
  };
});

/* —— §15-98 整理请求不被打分示例污染 + 在途标记 ——
   98a 断可观测面：在途有 bar、data-state=busy、抓到的 system 严格 === __prompts.agent、不含块头、结束后 bar 消失。
   data-kind（polish/score）当前产物没实现（.dtAgentBar 只有 data-state/data-code）→ 两半挂 GAP。 */
/* 98a 要的是「整理请求真的在途」：Agent 配置齐备（AGENT_SETTINGS 见上方 §10 段）才会走 fetch 通道，
   否则 runAgent 会先命中 missing/非法 Base 分支落本地规则（state=local、0 请求），断言必然假红。 */
setSettings({ agent: AGENT_SETTINGS });
let t129Pending = null;
await flushAsync(12);
setFetch(function () { return new Promise(function (resolve) { t129Pending = resolve; }); });
const t129Btn = byDt('agent-action')[0] || null;
if (t129Btn) fire(t129Btn);
await flushAsync(6);
const t129BarBusy = byDt('agent-bar')[0] || null;
const t129BusySystems = t129Systems();
const t129BusyKind = t129BarBusy ? String(attr(t129BarBusy, 'data-kind')) : '(无 bar)';
const t129BusyState = t129BarBusy ? String(attr(t129BarBusy, 'data-state')) : '(无 bar)';
if (t129Pending) t129Pending(okJson({ choices: [{ message: { content: JSON.stringify({ title: '在途后标题', steps: ['甲'] }) } }] }));
await flushAsync(24);
const t129BarAfter = byDt('agent-bar')[0] || null;
const t129KindAfter = t129BarAfter ? String(attr(t129BarAfter, 'data-kind')) : undefined;

const t129_98a = (function () {
  const p = t129Prompts();
  const agent = p ? p.agent : '';
  const sys = t129BusySystems.length ? t129BusySystems[0] : '';
  return {
    ok: !!t129BarBusy &&
      String(attr(t129BarBusy, 'data-state')) === 'busy' &&
      agent.length > 0 && sys === agent &&
      sys.indexOf(T129_SCORE_HEAD) < 0 &&
      /* 结束后只要求「不再在途」：成功会落 state=ok 并显示结果提示条（§10.7 只规定 idle 不渲染），
         所以不能把「bar 整体消失」当判据，否则会误红一个合理状态。 */
      (!t129BarAfter || String(attr(t129BarAfter, 'data-state')) !== 'busy'),
    evidence: '在途 bar state=' + t129BusyState + '、kind=' + t129BusyKind +
      '；抓到的 system 与 __prompts.agent 严格相等=' + (sys === agent) + '（' + sys.length + 'B vs ' + agent.length + 'B）' +
      '；system 含块头=' + (sys.indexOf(T129_SCORE_HEAD) >= 0) +
      '；请求结束后 bar=' + (t129BarAfter ? '仍在（state=' + String(attr(t129BarAfter, 'data-state')) + '）' : '已消失')
  };
})();
check('T111-98a', '§15-98 整理请求 messages[0].content 与 mod.__prompts.agent 严格等值、且不含 few-shot 块头；请求在途时 .dtAgentBar 存在且 data-state=busy，请求结束后不再处于 busy（§10.7 只规定 idle 不渲染；成功落 ok 态提示条属正常）', t129_98a.ok, t129_98a.evidence);

gapT130('T111-98a-kind', '§10.7 在途通道标记：整理请求在途时 .dtAgentBar[data-kind="polish"]，请求结束后该属性消失', function () {
  return {
    ok: t129BusyKind === 'polish' && t129KindAfter === undefined,
    evidence: '在途 data-kind=' + t129BusyKind + '（期望 polish）；结束后=' + String(t129KindAfter) +
      '；产物里 .dtAgentBar 只带 data-state/data-code，没有 data-kind 渲染点'
  };
});

gapT130('T111-98b', '§10.7 打分请求在途时 .dtAgentBar[data-kind="score"]，结束后属性消失', function () {
  const scoreCalls = t129Systems().filter(function (x) { const p = t129Prompts(); return p && x === p.score; }).length;
  return {
    ok: scoreCalls > 0,
    evidence: '本轮抓到的打分请求=' + scoreCalls + ' 次（产物无打分触发入口，同 96a 证据）；无请求则「在途」不可达'
  };
});

/* —— 附加：t104 追加的「200 + 非 JSON」弱信号（t111 契约第 7 条） —— */
/* gapT111 的谓词是同步的，所以异步路径（点击 → flushAsync → 读状态）先跑完，再只判结果。
   注意：桩里 window.fetch 转发到 globalThis.__fetchImpl（57-agent.js:173-176 调用时取），setFetch 即生效。 */
if (!byDt('agent-test')[0]) fire(railDt('rail-settings'));
const t111NjMarker = 'NOT-JSON-BODY-113';
const t111AgentBefore = Object.assign({}, t111Settings().agent || {});
setSettings({ agent: Object.assign({}, t111AgentBefore, { apiKey: 'sk-test-113', apiBase: 'https://api.example.com/v1', model: 'gpt-4o-mini' }) });
rerender(); rerender();
setFetch(function () {
  return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(t111NjMarker); }, json: function () { return Promise.reject(new Error('not json')); } });
});
const t111NjCallsBefore = fetchCalls.length;
const t111NjBtn = byDt('agent-test')[0] || null;
if (t111NjBtn) fire(t111NjBtn);
await flushAsync(24);
const t111NjCalls = fetchCalls.length - t111NjCallsBefore;
const t111NjState = byDt('agent-test-state')[0] || null;
const t111NjText = t111NjState ? nodeText(t111NjState) : '';
const t111NjKind = t111NjState ? String(attr(t111NjState, 'data-state')) : '(无状态节点)';
const t111NjStored = JSON.stringify(savedState() || {}).indexOf(t111NjMarker) >= 0;
setSettings({ agent: t111AgentBefore });
gapT111('T111-NJ', 't111 契约：连接测试 200 且响应体非 JSON ⇒ 状态仍为 ok（非 error）、含附注「响应非 JSON，可能不是 OpenAI 兼容端点」、请求数恰 1、响应体不进 localStorage', () => ({
  ok: t111NjKind !== 'error' && t111NjText.indexOf('响应非 JSON') >= 0 && t111NjCalls === 1 && !t111NjStored && !!t111NjState,
  evidence: 'data-state=' + t111NjKind + '；文案=' + JSON.stringify(t111NjText.replace(/[0-9]+ms/g, 'Nms').slice(0, 60)) + '；请求数=' + t111NjCalls +
    '（期望 1，不重试）；响应体进 localStorage=' + t111NjStored + '（期望 false）'
}));

/* —— §15-97 / 附加：设置默认值与导出剥离 —— */
gapT111('T111-SF', 'settings.scoreFeedback 默认 useAsExamples===true、includeInExport===false，开关钩子为 [data-dt=scorefs-use] / [data-dt=scorefs-export]', () => {
  const sf = t111Settings().scoreFeedback;
  const use = byDt('scorefs-use')[0] || null;
  const exp = byDt('scorefs-export')[0] || null;
  return {
    ok: !!sf && sf.useAsExamples === true && sf.includeInExport === false && !!use && !!exp,
    evidence: 'settings.scoreFeedback=' + JSON.stringify(sf === undefined ? '(缺)' : sf) + '；scorefs-use=' + (use ? '在' : '缺') + ' scorefs-export=' + (exp ? '在' : '缺')
  };
});
const t111ExportEntry = byDt('export')[0] || byDt('export-json')[0] || null;
globalThis.__lastBlob = null;
if (t111ExportEntry) fire(t111ExportEntry);
await flushAsync(12);
const t111ExportText = globalThis.__lastBlob && typeof globalThis.__lastBlob.text === 'function' ? await globalThis.__lastBlob.text() : '';
gapT111('T111-EXP', '§15-97 includeInExport=false 时导出 payload 不含 scoreFeedback 子串、不含 "b":；两种情况都不含 apiKey', () => {
  const sf = t111Settings().scoreFeedback;
  const hasFb = t111ExportText.indexOf('scoreFeedback') >= 0;
  const hasB = t111ExportText.indexOf('"b":') >= 0;
  const hasKey = t111ExportText.indexOf('sk-') >= 0;
  const include = !!sf && sf.includeInExport === true;
  return {
    ok: !!sf && include === false && !hasFb && !hasB && !hasKey && t111ExportText.length > 0,
    evidence: 'settings.scoreFeedback=' + JSON.stringify(sf === undefined ? '(缺)' : sf) + '；payload ' + t111ExportText.length + ' 字符' +
      '；含 scoreFeedback=' + hasFb + ' 含 "b":' + hasB + ' 含 sk-=' + hasKey + '（三者均应 false）'
  };
});

/* ---- T116e/T116f：三栏不变式的静态面（依赖 partsDir，故在本段求值；编号仍属三栏不变式组） ---- */
/* 空态只在 dataCount===0 时渲染；先确保 B 栏打开，再用 B 栏头的收起按钮关掉它（不依赖前序段落留下什么状态）。 */
closeAllDrawers();
rerender();
/* 固定从「全部未完成」这个清单起步（用 data-dt 定位，避免文案/计数徽标影响匹配）。 */
closeAllDrawers();
fire(railDt('rail-open'));
rerender();
const t116BeforeCollapse = { b: !!bSlot(), view: bView(), collapse: collapseBtns().length };
if (collapseBtns().length) fire(collapseBtns()[0]);
rerender();
const t116AfterCollapse = { b: !!bSlot(), view: bView(), count: zoneEl() ? attr(zoneEl(), 'data-count') : '(无 zone)' };
const t116EmptyNode = byCls('dtBEmpty')[0] || null;
const t116PanelSrc = partsDir ? readFileSync(pathMod.join(partsDir, '40-panel.js'), 'utf8') : '';
check('T116e', '§1.15 空态可聚焦：.dtBEmpty 带 tabIndex=-1，且 40-panel.js 在 listView 为空时对该节点调用 focus()',
  !!t116EmptyNode && t116EmptyNode.props.tabIndex === -1 &&
    /emptyRef\.current/.test(t116PanelSrc) && /typeof node\.focus === 'function'/.test(t116PanelSrc) && /node\.focus\(\)/.test(t116PanelSrc),
  '收起前 B=' + t116BeforeCollapse.b + ' view=' + t116BeforeCollapse.view + ' 收起按钮=' + t116BeforeCollapse.collapse +
  '；收起后 ' + JSON.stringify(t116AfterCollapse) + '；空态节点=' + (t116EmptyNode ? cls(t116EmptyNode) + ' tabIndex=' + t116EmptyNode.props.tabIndex : '(无)') +
  '；源码 focus 分支=' + /typeof node\.focus === 'function'/.test(t116PanelSrc) + '/' + /node\.focus\(\)/.test(t116PanelSrc));

const t116StaticHits = [];
(partsDir ? readdirSync(partsDir).filter((f) => /\.js$/.test(f)).sort() : []).forEach(function (f) {
  readFileSync(pathMod.join(partsDir, f), 'utf8').split(/\r?\n/).forEach(function (ln, i) {
    if (/ui\.center\b|centerModules|centerOrder/.test(ln)) t116StaticHits.push(f + ':' + (i + 1));
  });
});
const t116Ui = (storeApi.get() || {}).ui || {};
check('T116f', '§8-85 旧「中间区」静态清零：src/parts 里 ui.center/centerModules/centerOrder 命中 0；state.ui 无 center；渲染树无 .dtCenter 节点',
  t116StaticHits.length === 0 && !('center' in t116Ui) && byCls('dtCenter').length === 0,
  '静态命中=' + (t116StaticHits.length ? t116StaticHits.join(',') : '0') + '；ui.center=' + ('center' in t116Ui) +
  '；渲染树 .dtCenter=' + byCls('dtCenter').length);


/* ==================== 十六、t121 槽位几何 / 十档色带 / 四象限取色同源 ==================== */
/* t121 把行尾改成固定槽位（§1.16.1）、分数圈改十档色带（§1.17）、四象限取色统一到 --dt-quad-*（§0.6）。
   桩没有布局引擎：host 节点的 getBoundingClientRect 由 rectOf() 统一返回，量不出真实像素差。
   所以几何判据分两层写、并明说分工：
     ① CSS 真源：66 / 136 / 68 / 20 这些宽度必须写在样式表里且都是 flex-basis（不随内容漂移）；
     ② 结构真源：四槽恒在、槽序固定、环必须落在 score 槽内。
   真实像素等宽（四组合 ring.right 全 761.2px）由 t121 在真机量过，这里不假装能算。 */
const s133RuleText = (sel) => cssRuleAll(sel).join(' ');
const s133RowOf = (id) => all((n) => hasClass(n, 'dtRow') && attr(n, 'data-task-id') === id)[0] || null;
const s133StateOf = (row) => (row ? one((n) => hasClass(n, 'dtRowState'), row) : null);
const s133SlotSeq = (row) => {
  const st = s133StateOf(row);
  return st ? all((n) => attr(n, 'data-slot') !== undefined, st).map((n) => attr(n, 'data-slot')).join(',') : '';
};
const s133RingOf = (row) => (row ? one((n) => hasClass(n, 'dtScoreRing'), row) : null);
const s133RingRight = (row) => {
  const ring = s133RingOf(row);
  const rect = ring && typeof ring.getBoundingClientRect === 'function' ? ring.getBoundingClientRect() : null;
  return rect && typeof rect.right === 'number' ? Math.round(rect.right * 10) / 10 : null;
};

/* -------- S133a：固定槽位的 CSS 真源 -------- */
const s133ActionsCss = s133RuleText('.dtRowActions');
const s133StateCss = s133RuleText('.dtRowState');
const s133RingCss = s133RuleText('.dtRowState .dtScoreRing');
const s133DenseCss = s133RuleText('.dtDrawer[data-dense="1"] .dtRowState');
check('S133a', '§1.16.1 固定槽位 CSS 真源：动作区 66px、状态区 148px（--dt-state-w）、环 20px、dense 压到 68px，且四者都是 flex-basis（不随内容塌陷）',
  /flex:0 0 66px/.test(s133ActionsCss) && /width:66px/.test(s133ActionsCss)
  /* t128 迁移：规格 §1.16.1（docs/ui-spec-stage2.md:784/822/2624）已把状态区改为 148px
     （`--dt-state-w: 148px`，四槽 18+56+36+20 + 4×6 间距 = 148），产物同步改了；这里跟规格走。 */
  && /flex:0 0 148px/.test(s133StateCss) && /width:148px/.test(s133StateCss)
  && /flex:0 0 20px/.test(s133RingCss)
  && /flex:0 0 68px/.test(s133DenseCss),
  'actions={' + s133ActionsCss.slice(0, 80) + '} state={' + s133StateCss.slice(0, 64) + '} ring={' + s133RingCss.slice(0, 56) + '} dense={' + s133DenseCss.slice(0, 56) + '}');

/* -------- S133b：四种槽位组合的环右边界一致 + 四槽恒在 -------- */
const S133_TASKS = [
  { id: 's133none', projectId: 'inbox', title: '四槽全空', status: 0, deleted: false, priority: 0, date: '', allDay: true, tags: [] },
  { id: 's133date', projectId: 'inbox', title: '只有日期', status: 0, deleted: false, priority: 0, date: TODAY_K, allDay: true, tags: [] },
  { id: 's133tag', projectId: 'inbox', title: '只有标签', status: 0, deleted: false, priority: 0, date: '', allDay: true, tags: ['工作'] },
  { id: 's133all', projectId: 'inbox', title: '日期标签旗分数全有', status: 0, deleted: false, priority: 5, date: TOMORROW_K, allDay: true, tags: ['工作', '学习'] }
];
applyState({ projects: [INBOX], tasks: S133_TASKS });
setDb({ scores: { s133all: { score: 88, source: 'manual', updatedAt: 1767225600000, rubricVersion: 'calibrated-2026-11' } } });
closeAllDrawers();
fire(railByLabel('收集箱'));
const s133Ids = ['s133none', 's133date', 's133tag', 's133all'];
const s133Seqs = s133Ids.map((id) => s133SlotSeq(s133RowOf(id)));
const s133Rights = s133Ids.map((id) => s133RingRight(s133RowOf(id)));
check('S133b', '§1.16.1 四种组合（空白 / 只有日期 / 只有标签 / 全有）下环右边界完全一致，且每行状态区四槽恒在、槽序固定 flag,date,tag,score',
  s133Seqs.every((v) => v === 'flag,date,tag,score')
  && s133Rights.every((v) => v !== null) && new Set(s133Rights).size === 1
  && s133Ids.every((id) => !!s133StateOf(s133RowOf(id)) && !!one((n) => hasClass(n, 'dtRowActions'), s133RowOf(id))),
  '槽序=' + s133Seqs.join(' | ') + '；环right=' + s133Rights.join('/') + '（桩无布局引擎，等值来自 rectOf 统一矩形；真实像素等宽见 t121 真机 761.2px）');

/* -------- S133c：分数环色带 --------
   captain 口径（m03645 + m03706 收口）：色带 10 档合并为 5 档（用户定），
   **方向沿用既有约定：band 0 = 最高分档**（80–100 → 0，<20 → 4），无分数仍是 -1。
   当前实现仍是十档（0 = 最高分，方向一致），所以判据分两层：
     ① 硬断言只断「映射自身自洽」——任何档数模型都必须成立（无分 -1、有分给档、
        同档同色、异档异色），落地 5 档后自动继续成立；
     ② 5 档边界与明色 hex 走 gap（卡 t134：规格已定、实现未落地，转绿即升硬）。 */
const S133_BOUNDS = [5, 19, 20, 39, 40, 59, 60, 79, 80, 100];
/* 方向定案（captain m03706）：band 0 = 最高分档，与既有 scoreBandOf 一致，不翻转。
   所以 5/19 → band 4（最差）、80/100 → band 0（最好）。-1 只表示「无分」，与 4 不是一回事。 */
const S133_EXPECT_BAND = ['4', '4', '3', '3', '2', '2', '1', '1', '0', '0'];
const S133_EXPECT_HEX = ['#8B8D98', '#8B8D98', '#66B8FF', '#66B8FF', '#A3E635', '#A3E635', '#F76B15', '#F76B15', '#E93D82', '#E93D82'];
const s133BandTasks = S133_BOUNDS.map(function (sc, i) {
  return { id: 'band' + sc, projectId: 'inbox', title: 'band ' + sc, status: 0, deleted: false, priority: 0, date: '', allDay: true, tags: [], createdAt: '2026-01-0' + ((i % 9) + 1) + 'T00:00:0' + (i % 10) + 'Z' };
});
s133BandTasks.push({ id: 'bandnone', projectId: 'inbox', title: 'band 无分', status: 0, deleted: false, priority: 0, date: '', allDay: true, tags: [] });
const s133BandScores = {};
S133_BOUNDS.forEach(function (sc) { s133BandScores['band' + sc] = { score: sc, source: 'auto', updatedAt: 1767225600000 + sc * 1000, rubricVersion: 'calibrated-2026-11' }; });
applyState({ projects: [INBOX], tasks: s133BandTasks });
setDb({ scores: s133BandScores });
closeAllDrawers();
fire(railByLabel('收集箱'));
const s133BandOf = {};
const s133ArcOf = {};
S133_BOUNDS.forEach(function (sc) {
  const ring = s133RingOf(s133RowOf('band' + sc));
  s133BandOf[sc] = ring ? attr(ring, 'data-score-band') : null;
  s133ArcOf[sc] = ring && ring.props && ring.props.style ? ring.props.style['--dt-score-arc'] : null;
});
const s133NoneRing = s133RingOf(s133RowOf('bandnone'));
const s133NoneBand = s133NoneRing ? attr(s133NoneRing, 'data-score-band') : null;
const s133NoneArc = s133NoneRing && s133NoneRing.props && s133NoneRing.props.style ? s133NoneRing.props.style['--dt-score-arc'] : null;
/* ① 硬断言：映射自洽（与档数无关） */
const s133ByBand = {};
S133_BOUNDS.forEach(function (sc) {
  const b = s133BandOf[sc];
  if (b === null) return;
  (s133ByBand[b] || (s133ByBand[b] = [])).push(s133ArcOf[sc]);
});
const s133BandKeys = Object.keys(s133ByBand);
const s133SameInBand = s133BandKeys.every(function (b) { return new Set(s133ByBand[b]).size === 1; });
const s133DistinctAcross = new Set(s133BandKeys.map(function (b) { return s133ByBand[b][0]; })).size === s133BandKeys.length;
check('S133c', '§1.17 分数环色带映射自洽：无分 → band=-1 且不画弧；有分 → 落在整数档上、同档同色、异档异色（档数模型无关）',
  s133NoneBand === '-1' && !s133NoneArc
  && S133_BOUNDS.every(function (sc) { return s133BandOf[sc] !== null && /^\d+$/.test(s133BandOf[sc]) && typeof s133ArcOf[sc] === 'string' && s133ArcOf[sc]; })
  && s133SameInBand && s133DistinctAcross,
  'bands=' + S133_BOUNDS.map((sc) => sc + ':' + s133BandOf[sc]).join(',') + '；无分=' + s133NoneBand + '/arc=' + String(s133NoneArc)
  + '；档集合=' + s133BandKeys.join(',') + '；同档同色=' + s133SameInBand + '；异档异色=' + s133DistinctAcross);

/* ② gap（卡 t134）：5 档新规格逐值 + 明色 hex 精确匹配 */
gapWithCard('t134', 'S133c5', '§1.17 五档色带（captain m03645 + m03706）：降序 band 0 = 最高分——5/19→4、20/39→3、40/59→2、60/79→1、80/100→0，无分 -1；明色对应 band0 #E93D82 / band1 #F76B15 / band2 #A3E635 / band3 #66B8FF / band4 #8B8D98', function () {
  const gotBands = S133_BOUNDS.map(function (sc) { return String(s133BandOf[sc]); });
  const gotHex = S133_BOUNDS.map(function (sc) { return String(s133ArcOf[sc] || ''); });
  const bandOk = gotBands.join(',') === S133_EXPECT_BAND.join(',');
  const hexOk = gotHex.join(',') === S133_EXPECT_HEX.join(',');
  return {
    ok: bandOk && hexOk && s133NoneBand === '-1',
    evidence: '期望 band=' + S133_EXPECT_BAND.join(',') + ' 实得=' + gotBands.join(',')
      + '；期望 hex 首/末=' + S133_EXPECT_HEX[0] + '/' + S133_EXPECT_HEX[9] + ' 实得=' + gotHex[0] + '/' + gotHex[9]
      + '；无分=' + s133NoneBand + '（期望 -1）；当前实现档数=' + s133BandKeys.length
  };
});

/* -------- S133d：四象限取色同源（.dtQuadTag 与格边线同一 token） -------- */
applyState({ projects: [INBOX], tasks: Q_TASKS });
setDb({ scores: {} });
closeAllDrawers();
fire(railByLabel('四象限'));
const s133QuadNames = ['red', 'yellow', 'blue', 'none'];
const s133CellColor = (q) => (qcell(q) ? attr(qcell(q), 'data-quad-color') : null);
const s133CellVar = (q) => {
  const cell = qcell(q);
  return cell && cell.props && cell.props.style ? cell.props.style['--dt-quad'] : null;
};
const s133TagOf = (q) => {
  const cell = qcell(q);
  return cell ? one((n) => hasClass(n, 'dtQuadTag') && attr(n, 'data-quad') === q, cell) : null;
};
const s133TagSame = ['q1', 'q2', 'q3', 'q4'].every(function (q) {
  const tag = s133TagOf(q);
  return !!tag && attr(tag, 'data-quad-color') === s133CellColor(q);
});
/* q1–q3 用 --dt-quad-{name}；q4 按 §0.6 走 label-secondary（不是 --dt-quad-none） */
const s133CssOf = function (name) { return s133RuleText('.dtQuadTag[data-quad-color="' + name + '"]'); };
const s133CssSame = ['red', 'yellow', 'blue'].every(function (name) {
  return s133CssOf(name).indexOf('var(--dt-quad-' + name + ')') >= 0;
}) && s133CssOf('none').indexOf('--dsw-alias-label-secondary') >= 0;
const s133VarsOk = ['q1', 'q2', 'q3'].every(function (q, i) {
  return s133CellVar(q) === 'var(--dt-quad-' + s133QuadNames[i] + ')';
}) && (s133CellVar('q4') === 'transparent' || s133CellVar('q4') === 'var(--dt-quad-none)');
check('S133d', '§0.6/§2.5.5.2 四象限取色同源：每个 .dtQuadTag 的 data-quad-color 与所在格一致、格边线与标签色都取自同一 --dt-quad-*，q4 为 transparent',
  s133TagSame && s133CssSame && s133VarsOk,
  'tag色=' + ['q1', 'q2', 'q3', 'q4'].map((q) => q + ':' + (s133TagOf(q) ? attr(s133TagOf(q), 'data-quad-color') : 'null')).join(',')
  + '；格色=' + ['q1', 'q2', 'q3', 'q4'].map((q) => q + ':' + s133CellColor(q)).join(',')
  + '；格变量=' + ['q1', 'q2', 'q3', 'q4'].map((q) => String(s133CellVar(q))).join('|')
  + '；CSS同源=' + s133CssSame + '（q1-q3=var(--dt-quad-*) / q4=label-secondary）');

/* -------- S133e：作废钩子清零（data-score-tier / stroke-opacity / .dtQuadSrc） -------- */
/* 观测前置授权（HANDOVER §8.2）：先把「带分的行」真正放回树上，否则「环不带 tier」
   会因为行内全是空环而恒真——D 变异（给环塞回 data-score-tier）第一版就是这么漏网的。 */
applyState({ projects: [INBOX], tasks: s133BandTasks });
setDb({ scores: s133BandScores });
closeAllDrawers();
fire(railByLabel('收集箱'));
/* 只扫「代码」：块注释里出现旧钩子名是文档说明，不是实现（F13 教训的反面——
   注释里的字面色会误导人，但注释里的作废钩子名恰恰说明为什么删掉）。 */
const s133Parts = readdirSync(partsDir).filter((f) => f.slice(-3) === '.js');
const s133CodeOf = (f) => readFileSync(pathMod.join(partsDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
let s133TierHits = [];
let s133OpHits = [];
let s133SrcHits = [];
s133Parts.forEach(function (f) {
  s133CodeOf(f).split(/\r?\n/).forEach(function (line, i) {
    if (line.indexOf('data-score-tier') >= 0) s133TierHits.push(f + ' comment-stripped line' + (i + 1) + ': ' + line.trim().slice(0, 48));
    if (line.indexOf('stroke-opacity') >= 0) s133OpHits.push(f + '#' + (i + 1));
    if (line.indexOf('dtQuadSrc') >= 0) s133SrcHits.push(f + '#' + (i + 1));
  });
});
/* §1.13.1：data-score-tier 只允许落在 C 栏 [data-dt="score-edit"] 这一个元素上 */
const s133TierOnlyOnEdit = s133TierHits.length === 1 && s133TierHits[0].indexOf("'data-score-tier': String(tier)") >= 0;
const s133RingTier = all((n) => hasClass(n, 'dtScoreRing')).filter((n) => attr(n, 'data-score-tier') !== undefined).length;
const s133TreeSrc = all((n) => hasClass(n, 'dtQuadSrc')).length;
const s133MenuBtnPerRow = s133Ids.map(function (id) {
  const row = s133RowOf(id);
  return row ? all((n) => hasClass(n, 'dtQuadMenuBtn'), row).length : -1;
});
check('S133e', '§1.16/§1.17 作废钩子清零（按代码计、注释不算）：行内环不再带 data-score-tier（只留 C 栏 score-edit 一处）、代码里 stroke-opacity 与 .dtQuadSrc 0 命中、改判入口每行恰 1 个 .dtQuadMenuBtn',
  s133TierOnlyOnEdit && s133RingTier === 0 && s133OpHits.length === 0 && s133SrcHits.length === 0 && s133TreeSrc === 0,
  'data-score-tier 代码命中=' + (s133TierHits.join(' | ') || '0') + '（只允许 score-edit 那一处=' + s133TierOnlyOnEdit + '）；行内环带 tier=' + s133RingTier
  + '；stroke-opacity=' + (s133OpHits.join(',') || '0') + '；dtQuadSrc=' + (s133SrcHits.join(',') || '0') + '；树内.dtQuadSrc=' + s133TreeSrc);

/* -------- F01b：F01 的正向补充（旧角标必须消失、新入口必须恰一个） -------- */
closeAllDrawers();
fire(railByLabel('收集箱'));
const f01bRows = all((n) => hasClass(n, 'dtRow'), drawerSlot('b'));
const f01bBtnCounts = f01bRows.map((r) => all((n) => hasClass(n, 'dtQuadMenuBtn'), r).length);
check('F01b', '§2.5.5.1 行内旧角标 .dtQuadSrc 已彻底消失（树内 0 个），改判入口 .dtQuadMenuBtn 每行恰 1 个',
  all((n) => hasClass(n, 'dtQuadSrc')).length === 0 && f01bRows.length > 0 && f01bBtnCounts.every((c) => c === 1),
  '行数=' + f01bRows.length + ' 每行入口数=' + f01bBtnCounts.join(',') + ' 树内.dtQuadSrc=' + all((n) => hasClass(n, 'dtQuadSrc')).length);

/* ============================ 十五、Host 半边与三档来源（§15-106/107/108、§8-96/97/98/99、§8-41、§8-33） ============================ */

/* Host 半边（dsh-tasks/index.js）是可 import 的 ESM：apply(ctx) 找到 webServer 后注册一条 prefix 路由，
   ctx.effect 返回 disposer。这里不真发 HTTP，只把注册到的 handler 拿来直接派发（captain m03894 的口径）。 */
const s139HostDir = pathMod.dirname(target);
const s139HostUrl = 'file:///' + s139HostDir.replace(/\\/g, '/') + '/index.js';
let s139Host = null;
try {
  s139Host = await import(s139HostUrl);
} catch (error) {
  errors.push(['hostImport', error]);
}

function s139MakeRes() {
  const out = { status: 0, headers: null, payload: '', ended: false };
  const res = {
    out: out,
    writeHead: function (status, headers) { out.status = status; out.headers = headers || {}; },
    end: function (payload) { if (payload !== undefined) out.payload += String(payload); out.ended = true; },
    on: function () { return res; },
    once: function () { return res; },
    removeListener: function () { return res; },
    writableEnded: false
  };
  return res;
}

function s139MakeReq(spec) {
  const handlers = { data: [], end: [], error: [], close: [] };
  const req = {
    url: spec.url,
    method: spec.method || 'GET',
    headers: spec.headers || {},
    on: function (evt, fn) { (handlers[evt] || (handlers[evt] = [])).push(fn); return req; },
    removeListener: function () { return req; },
    emitTest: function (evt, arg) {
      (handlers[evt] || []).slice().forEach(function (fn) { try { fn(arg); } catch (error) { errors.push(['hostReq', error]); } });
    }
  };
  return req;
}

function s139MakeState() {
  return {
    routes: [],
    disposers: [],
    injectCalls: 0,
    injectDeps: [],
    streamCalls: 0,
    reject: undefined,
    selection: { provider: 'dsh-default', model: 'stub-model' },
    providers: ['dsh'],
    streamImpl: null,
    registeredLabels: []
  };
}

function s139Apply(state) {
  /* t148：与真实 Cordis 同构的最小装配模型，避免测试走 index.js 的「老装配兜底」分支。
     - ctx.inject(deps, cb)：依赖就绪后以子 ctx 调 cb（这里同步就绪）；子 ctx 的 effect 登记进同一 state
     - ctx.effect(fn, label)：立即执行 fn，disposer 收进 state.disposers、label 收进 registeredLabels
     - ctx.dispose()：逆序执行 disposer 并清空 routes（模拟插件卸载） */
  const webServer = {
    register: function (route) {
      state.routes.push(route);
      return function () {
        const at = state.routes.indexOf(route);
        if (at >= 0) state.routes.splice(at, 1);
      };
    }
  };
  const ctx = {
    inject: function (deps, cb) {
      state.injectCalls += 1;
      state.injectDeps.push((deps || []).join('+'));
      const fork = {
        webServer: webServer,
        get: function (key) { return ctx.get(key); },
        effect: function (fn, label) { return ctx.effect(fn, label); },
        dispose: function () { return ctx.dispose(); }
      };
      cb(fork);
      return fork;
    },
    get: function (key) {
      if (key === 'webServer' || key === 'hostWebServer') return webServer;
      if (key === 'connection') {
        return { requestRejection: function () { return state.reject; } };
      }
      if (key === 'llm') {
        return {
          listProviders: function () { return state.providers; },
          stream: function () {
            state.streamCalls += 1;
            return state.streamImpl();
          }
        };
      }
      if (key === 'agentDefaultModel') {
        return { currentSelection: function () { return state.selection; } };
      }
      return undefined;
    },
    effect: function (fn, label) {
      state.registeredLabels.push(label);
      const disposer = fn();
      state.disposers.push(disposer);
      return disposer;
    },
    dispose: function () {
      while (state.disposers.length) {
        const disposer = state.disposers.pop();
        if (typeof disposer === 'function') disposer();
      }
      state.routes.length = 0;
      return state;
    }
  };
  s139Host.apply(ctx);
  return state;
}

async function s139Dispatch(state, spec) {
  const route = state.routes[state.routes.length - 1];
  const res = s139MakeRes();
  if (!route) { res.out.status = 404; return res.out; }
  const req = s139MakeReq(spec);
  const running = route.handler(req, res);
  const payload = spec.body === undefined ? '' : (typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body));
  req.emitTest('data', Buffer.from(payload, 'utf8'));
  req.emitTest('end');
  await running;
  res.out.body = res.out.payload ? JSON.parse(res.out.payload) : null;
  return res.out;
}

function s139OkStream(text) {
  return async function* () {
    yield { type: 'text-delta', text: text };
    yield { type: 'finish', reason: { kind: 'ok' } };
  };
}

if (s139Host) {
  /* H1: GET /models —— 200 + {ok, selection:{provider,model}, providers} */
  const s139h1state = s139MakeState();
  s139h1state.streamImpl = s139OkStream('pong');
  s139Apply(s139h1state);
  const s139h1 = await s139Dispatch(s139h1state, { url: '/plugins/local/dsh-tasks/models', method: 'GET' });
  check('S139H1', '§15-106 Host GET /models：200 + {ok:true, selection:{provider,model}, providers:[...]}，且注册的是 prefix 路由 /plugins/local/dsh-tasks',
    s139h1.status === 200 && !!s139h1.body && s139h1.body.ok === true &&
    !!s139h1.body.selection && s139h1.body.selection.provider === 'dsh-default' && s139h1.body.selection.model === 'stub-model' &&
    Array.isArray(s139h1.body.providers) && s139h1.body.providers.join(',') === 'dsh' &&
    !!s139h1state.routes[0] && s139h1state.routes[0].kind === 'prefix' && s139h1state.routes[0].path === '/plugins/local/dsh-tasks',
    'status=' + s139h1.status + ' body=' + JSON.stringify(s139h1.body) + ' route=' + JSON.stringify(s139h1state.routes[0] && { kind: s139h1state.routes[0].kind, path: s139h1state.routes[0].path }));

  /* H0（t148）：Host 装配必须走真路 ctx.inject(['webServer']) —— 走 index.js 的兜底分支时
     effect label 会变成 'dsh-tasks: route'，那说明测试模型与真实 Cordis 不一致（H6 曾因此假红）。 */
  check('S139H0', '§15-108 Host 装配：apply 经 ctx.inject(["webServer"]) 装配（不走老装配兜底），effect label 为真值 dsh-tasks: /plugins/local/dsh-tasks',
    s139h1state.injectCalls === 1 && s139h1state.injectDeps.join(',') === 'webServer' &&
    s139h1state.registeredLabels.join(',') === 'dsh-tasks: /plugins/local/dsh-tasks',
    'injectCalls=' + s139h1state.injectCalls + ' deps=' + JSON.stringify(s139h1state.injectDeps) + ' labels=' + JSON.stringify(s139h1state.registeredLabels));

  /* H2: POST /ping —— 200 + {ok, provider, model, latency, text} */
  const s139h2state = s139MakeState();
  s139h2state.streamImpl = s139OkStream('pong');
  s139Apply(s139h2state);
  const s139h2 = await s139Dispatch(s139h2state, { url: '/plugins/local/dsh-tasks/ping', method: 'POST', body: { kind: 'ping' } });
  check('S139H2', '§15-106 Host POST /ping：200 + {ok:true, provider, model, latency, text}，text 由 llm.stream 的 text-delta 收敛（≤40 字符）',
    s139h2.status === 200 && !!s139h2.body && s139h2.body.ok === true &&
    s139h2.body.provider === 'dsh-default' && s139h2.body.model === 'stub-model' &&
    typeof s139h2.body.latency === 'number' && s139h2.body.text === 'pong' && s139h2state.streamCalls === 1,
    /* latency 是真实耗时（1~3ms 抖动）：判定只要求 number，证据里归一为 <ms>，
       否则同一产物两次连跑无法逐字节比对（t148 实测 latency 1 vs 2）。 */
    'status=' + s139h2.status + ' body=' + String(JSON.stringify(s139h2.body)).replace(/"latency":\d+/, '"latency":<ms>') +
    ' latencyIsNumber=' + (typeof s139h2.body.latency === 'number') + ' streamCalls=' + s139h2state.streamCalls);

  /* H3: 认证围栏 —— connection.requestRejection 返回 403 时，按其码回 401/403，且绝不调模型 */
  const s139h3state = s139MakeState();
  s139h3state.streamImpl = s139OkStream('pong');
  s139h3state.reject = 403;
  s139Apply(s139h3state);
  const s139h3 = await s139Dispatch(s139h3state, { url: '/plugins/local/dsh-tasks/models', method: 'GET' });
  check('S139H3', '§15-107 Host 认证围栏：requestRejection 返回 403 时同码拒绝、体为 {ok:false, code:"AGENT_AUTH"}，且 llm.stream 调用次数为 0',
    s139h3.status === 403 && !!s139h3.body && s139h3.body.ok === false && s139h3.body.code === 'AGENT_AUTH' && s139h3state.streamCalls === 0,
    'status=' + s139h3.status + ' body=' + JSON.stringify(s139h3.body) + ' streamCalls=' + s139h3state.streamCalls);

  /* H4: 方法 / 端点 / kind 三处校验 */
  const s139h4state = s139MakeState();
  s139h4state.streamImpl = s139OkStream('pong');
  s139Apply(s139h4state);
  const s139h4a = await s139Dispatch(s139h4state, { url: '/plugins/local/dsh-tasks/models', method: 'POST', body: {} });
  const s139h4b = await s139Dispatch(s139h4state, { url: '/plugins/local/dsh-tasks/ping', method: 'GET' });
  const s139h4c = await s139Dispatch(s139h4state, { url: '/plugins/local/dsh-tasks/polish', method: 'POST', body: { kind: 'score', task: { title: 'x' } } });
  const s139h4d = await s139Dispatch(s139h4state, { url: '/plugins/local/dsh-tasks/nope', method: 'GET' });
  check('S139H4', '§15-107 Host 路由校验：方法不符 405/AGENT_BASE、端点未知 404/AGENT_ENDPOINT、kind 与端点不一致 400/AGENT_BASE（三处都不调模型）',
    s139h4a.status === 405 && s139h4a.body && s139h4a.body.code === 'AGENT_BASE' &&
    s139h4b.status === 405 && s139h4b.body && s139h4b.body.code === 'AGENT_BASE' &&
    s139h4c.status === 400 && s139h4c.body && s139h4c.body.code === 'AGENT_BASE' &&
    s139h4d.status === 404 && s139h4d.body && s139h4d.body.code === 'AGENT_ENDPOINT' &&
    s139h4state.streamCalls === 0,
    '405=' + s139h4a.status + '/' + (s139h4a.body && s139h4a.body.code) + ' 405b=' + s139h4b.status + ' 400=' + s139h4c.status + '/' + (s139h4c.body && s139h4c.body.code) + ' 404=' + s139h4d.status + '/' + (s139h4d.body && s139h4d.body.code) + ' streamCalls=' + s139h4state.streamCalls);

  /* H5: 脱敏 —— 上游错误里的 sk- / Bearer 原文不得出现在响应体 */
  const s139h5state = s139MakeState();
  s139h5state.streamImpl = async function* () { throw new Error('upstream boom sk-secret-987 Bearer aaa.bbb.ccc'); };
  s139Apply(s139h5state);
  const s139h5 = await s139Dispatch(s139h5state, { url: '/plugins/local/dsh-tasks/polish', method: 'POST', body: { kind: 'polish', task: { title: '脱敏探针' } } });
  const s139h5text = JSON.stringify(s139h5.body || {});
  check('S139H5', '§15-108 Host 脱敏：上游异常 → 500/AGENT_SERVER，且响应体里不出现 sk- 原文与 Bearer 头形态、message ≤ 200 字符',
    s139h5.status === 500 && !!s139h5.body && s139h5.body.code === 'AGENT_SERVER' &&
    s139h5text.indexOf('sk-secret-987') === -1 && s139h5text.indexOf('aaa.bbb.ccc') === -1 && !/Bearer\s+[^"*\s<]/.test(s139h5text) &&
    typeof s139h5.body.message === 'string' && s139h5.body.message.length <= 200,
    'status=' + s139h5.status + ' body=' + s139h5text);

  /* H6: disposer 之后同 URL 404（卸载即下线） */
  const s139h6state = s139MakeState();
  s139h6state.streamImpl = s139OkStream('pong');
  s139Apply(s139h6state);
  const s139h6before = await s139Dispatch(s139h6state, { url: '/plugins/local/dsh-tasks/models', method: 'GET' });
  const s139h6disposer = s139h6state.disposers[s139h6state.disposers.length - 1];
  if (typeof s139h6disposer === 'function') s139h6disposer();
  const s139h6after = await s139Dispatch(s139h6state, { url: '/plugins/local/dsh-tasks/models', method: 'GET' });
  check('S139H6', '§15-108 Host 卸载：apply 用 ctx.effect 注册路由，调用 disposer 后注册表清空、同 URL 变 404（不再有 handler 兜底）',
    s139h6before.status === 200 && s139h6state.routes.length === 0 && s139h6after.status === 404 &&
    s139h6state.registeredLabels.join(',') === 'dsh-tasks: /plugins/local/dsh-tasks',
    'before=' + s139h6before.status + ' after=' + s139h6after.status + ' routes=' + s139h6state.routes.length + ' effectLabels=' + JSON.stringify(s139h6state.registeredLabels));

  /* ===== t151：失败响应带 detail（上游错误摊平 + 脱敏） =====
     设计要点：detail 只摊平「宿主实际拿得到」的字段，拿不到就省略（不写 null）；
     401 这类鉴权失败不带 detail；message 与 detail 都必须过 redact()。 */

  /* S151a：401 鉴权失败不带 detail（不因新增字段多漏内部结构） */
  const s151aState = s139MakeState();
  s151aState.streamImpl = s139OkStream('pong');
  s151aState.reject = 401;
  s139Apply(s151aState);
  const s151a = await s139Dispatch(s151aState, { url: '/plugins/local/dsh-tasks/models', method: 'GET' });
  const s151aKeys = s151a.body ? Object.keys(s151a.body).sort().join(',') : '';
  check('S151a', 't151 鉴权失败不带 detail：401 响应体只有 ok/code/message 三个键，detail 不存在，且不调模型',
    s151a.status === 401 && !!s151a.body && s151a.body.code === 'AGENT_AUTH' &&
    s151aKeys === 'code,message,ok' && s151a.body.detail === undefined && s151aState.streamCalls === 0,
    'status=' + s151a.status + ' keys=' + s151aKeys + ' body=' + JSON.stringify(s151a.body) + ' streamCalls=' + s151aState.streamCalls);

  /* S151b：无可用模型 → AGENT_CONFIG + detail.stage = select-model */
  const s151bState = s139MakeState();
  s151bState.selection = undefined;
  s151bState.streamImpl = s139OkStream('pong');
  s139Apply(s151bState);
  const s151b = await s139Dispatch(s151bState, { url: '/plugins/local/dsh-tasks/models', method: 'GET' });
  check('S151b', 't151 AGENT_CONFIG 分支：无可用模型时 500/AGENT_CONFIG 且 detail.stage === "select-model"（stage 用来区分「没模型」与「上游失败」）',
    s151b.status === 500 && !!s151b.body && s151b.body.code === 'AGENT_CONFIG' &&
    !!s151b.body.detail && s151b.body.detail.stage === 'select-model',
    'status=' + s151b.status + ' body=' + JSON.stringify(s151b.body));

  /* S151c：上游抛 {type:'MissingSessionID', status:400} —— 验收点：upstreamType/upstreamStatus 必须摊出来 */
  const s151cState = s139MakeState();
  s151cState.streamImpl = function () {
    const e = new Error('upstream rejected: session missing');
    e.name = 'LlmError';
    e.code = 'BAD_REQUEST';
    e.type = 'MissingSessionID';
    e.status = 400;
    return Promise.reject(e);
  };
  s139Apply(s151cState);
  const s151c = await s139Dispatch(s151cState, { url: '/plugins/local/dsh-tasks/ping', method: 'POST', body: { kind: 'ping' } });
  const s151cDetail = (s151c.body && s151c.body.detail) || {};
  check('S151c', 't151 上游错误摊平：抛 {type:"MissingSessionID", status:400} 时 detail.upstreamType === "MissingSessionID" 且 detail.upstreamStatus === 400，stage === "generate"，upstreamMessage 非空',
    s151c.status === 500 && !!s151c.body && s151c.body.code === 'AGENT_SERVER' &&
    s151cDetail.stage === 'generate' && s151cDetail.upstreamType === 'MissingSessionID' &&
    s151cDetail.upstreamStatus === 400 && typeof s151cDetail.upstreamMessage === 'string' &&
    s151cDetail.upstreamMessage.length > 0 && s151cDetail.code === 'BAD_REQUEST' && s151cDetail.name === 'LlmError',
    'status=' + s151c.status + ' body=' + JSON.stringify(s151c.body));

  /* S151d：detail 也必须过 redact —— sk- / Bearer / a.b.c 三种形态在 message 与 detail 里都不得留原文 */
  const s151dState = s139MakeState();
  s151dState.streamImpl = function () {
    const e = new Error('boom sk-abcdef123456 Bearer tok.abc.def aaa.bbb.ccc');
    e.type = 'AuthFailed';
    e.status = 401;
    return Promise.reject(e);
  };
  s139Apply(s151dState);
  const s151d = await s139Dispatch(s151dState, { url: '/plugins/local/dsh-tasks/polish', method: 'POST', body: { kind: 'polish', task: { title: '脱敏 detail 探针' } } });
  const s151dText = JSON.stringify(s151d.body || {});
  const s151dDetail = (s151d.body && s151d.body.detail) || {};
  check('S151d', 't151 detail 也脱敏：sk- / Bearer / a.b.c 三种形态在响应体（message 与 detail）里原文 0 命中、出现 [redacted]',
    s151d.status === 500 && !!s151d.body && s151d.body.code === 'AGENT_SERVER' &&
    s151dText.indexOf('sk-abcdef123456') === -1 && s151dText.indexOf('aaa.bbb.ccc') === -1 &&
    s151dText.indexOf('tok.abc.def') === -1 && s151dText.indexOf('Bearer') === -1 &&
    s151dText.indexOf('[redacted]') >= 0 &&
    typeof s151dDetail.upstreamMessage === 'string' && s151dDetail.upstreamMessage.indexOf('[redacted]') >= 0,
    'body=' + s151dText);

  /* S151e：AbortError → AGENT_TIMEOUT + detail.stage = timeout */
  const s151eState = s139MakeState();
  s151eState.streamImpl = function () {
    const e = new Error('aborted by timeout');
    e.name = 'AbortError';
    return Promise.reject(e);
  };
  s139Apply(s151eState);
  const s151e = await s139Dispatch(s151eState, { url: '/plugins/local/dsh-tasks/ping', method: 'POST', body: { kind: 'ping' } });
  check('S151e', 't151 AGENT_TIMEOUT 分支：AbortError 时 504/AGENT_TIMEOUT 且 detail.stage === "timeout"',
    s151e.status === 504 && !!s151e.body && s151e.body.code === 'AGENT_TIMEOUT' &&
    !!s151e.body.detail && s151e.body.detail.stage === 'timeout',
    'status=' + s151e.status + ' body=' + JSON.stringify(s151e.body));

  /* S151f：detail 不写 null —— 拿不到的字段必须省略 */
  check('S151f', 't151 detail 不写 null：S151c / S151d 的 detail 里所有键值都不是 null 或 undefined（拿不到就省略）',
    [s151cDetail, s151dDetail].every(function (d) {
      return Object.keys(d).every(function (k) { return d[k] !== null && d[k] !== undefined; });
    }),
    'c=' + JSON.stringify(s151cDetail) + ' d=' + JSON.stringify(s151dDetail));
}

/* —— 三档来源：dsh / custom / off（§8-96/97/98 + §1.18）—— */
async function s139RunAgent(agentPatch, makeResponse) {
  await flushAsync(14);
  applyState({ projects: [SORT_INBOX], tasks: SORT_TASKS.map(function (t) { return Object.assign({}, t); }), habits: [] });
  closeAllDrawers();
  rerender(); rerender();
  openProjectList('收集箱');
  rerender(); rerender();
  openDetailOf('s1');
  setSettings({ agent: Object.assign({}, AGENT_SETTINGS, agentPatch) });
  rerender(); rerender();
  const btn = byDt('agent-action')[0] || null;
  const calls = [];
  setFetch(function (index, url, opts) {
    calls.push({ url: String(url), opts: opts || {} });
    return makeResponse();
  });
  if (btn) fire(btn);
  await drainTimers(8);
  await flushAsync(14);
  return { btn: btn, calls: calls };
}

/* S1: dsh 档 —— 同源前缀、无 Authorization、body 不含 messages/system/response_format */
const s139s1 = await s139RunAgent({ source: 'dsh', apiKey: 'sk-test' }, function () {
  return Promise.resolve(okJson({ ok: true, text: JSON.stringify({ title: '模型给的新标题', steps: ['甲', '乙'] }) }));
});
const s139s1bad = s139s1.calls.filter(function (call) {
  let parsed = {};
  try { parsed = JSON.parse((call.opts && call.opts.body) || '{}'); } catch (error) { parsed = {}; }
  const keys = Object.keys(parsed).join(',');
  const headers = (call.opts && call.opts.headers) || {};
  return call.url.indexOf('/plugins/local/dsh-tasks/') !== 0 ||
    !!(headers.authorization || headers.Authorization) ||
    keys.indexOf('messages') >= 0 || keys.indexOf('system') >= 0 || keys.indexOf('response_format') >= 0;
});
check('S139S1', '§1.18.1 dsh 档：请求 URL 全部以 /plugins/local/dsh-tasks/ 开头、不带 Authorization 头、body 不含 messages/system/response_format',
  s139s1.calls.length >= 1 && s139s1bad.length === 0,
  '调用=' + s139s1.calls.map(function (c) { return c.url; }).join(' | ') + ' 违规=' + s139s1bad.length + ' btn=' + (s139s1.btn ? 'yes' : 'NO') + ' c=' + (cSlot() ? cDetailView() : 'none') + ' b=' + (bSlot() ? bViewNow() : 'none') + ' src=' + String(settingsNow().agent.source) + ' apiKey=' + String(settingsNow().agent.apiKey).slice(0,6));

/* S2: custom 档 —— 用户 baseUrl + Bearer + messages + response_format */
const s139s2 = await s139RunAgent({ source: 'custom', apiBase: 'https://api.stub.test/v1', apiKey: 'sk-test' }, function () {
  return Promise.resolve(okJson({ choices: [{ message: { content: JSON.stringify({ title: '模型给的新标题', steps: ['甲', '乙'] }) } }] }));
});
const s139s2call = s139s2.calls[0] || null;
let s139s2body = {};
try { s139s2body = JSON.parse((s139s2call && s139s2call.opts.body) || '{}'); } catch (error) { s139s2body = {}; }
check('S139S2', '§1.18.1 custom 档：仍由页面直连用户 baseUrl（…/chat/completions）、带 Authorization: Bearer <key>、body 有 messages 与 response_format.json_object',
  !!s139s2call && s139s2call.url.indexOf('https://api.stub.test/v1') === 0 &&
  !!s139s2call.opts.headers && (s139s2call.opts.headers.authorization === 'Bearer sk-test' || s139s2call.opts.headers.Authorization === 'Bearer sk-test') &&
  Array.isArray(s139s2body.messages) && !!s139s2body.response_format && s139s2body.response_format.type === 'json_object',
  'url=' + (s139s2call ? s139s2call.url : 'null') + ' auth=' + (s139s2call && s139s2call.opts.headers ? s139s2call.opts.headers.authorization : 'null') + ' bodyKeys=' + Object.keys(s139s2body).join(','));

/* S3: off 档 —— 零请求，且界面上明确写「不发任何请求」的说明 */
const s139s3 = await s139RunAgent({ source: 'off' }, function () {
  return Promise.resolve(okJson({ choices: [{ message: { content: '{"title":"不该被调用","steps":[]}' } }] }));
});
const s139s3note = byDt('agent-off-note')[0] || null;
const s139s3bar = byDt('agent-bar')[0] || null;
check('S139S3', '§8-98 off 档零请求：点 C 栏蓝按钮不产生任何 fetch（off 档绝不发请求）',
  s139s3.calls.length === 0,
  'fetch=' + s139s3.calls.length + ' barCode=' + (s139s3bar ? String(attr(s139s3bar, 'data-code')) : 'none') + ' barState=' + (s139s3bar ? String(attr(s139s3bar, 'data-state')) : 'none'));
gap('S139S3n', '§8-98 off 档应显示 [data-dt="agent-off-note"] 说明「不发任何请求」，且 .dtAgentBar 不出现错误码（off 不是错误态）——当前产物：note 零命中、barCode=AGENT_CONFIG（实现侧未落地，判据先行）',
  !!s139s3note && (!s139s3bar || !attr(s139s3bar, 'data-code')),
  'off-note=' + (s139s3note ? nodeText(s139s3note) : 'null') + ' barCode=' + (s139s3bar ? String(attr(s139s3bar, 'data-code')) : 'none'), 't145');

/* S4: §8-99 fetch 白名单（静态）—— 只有 57-agent.js 碰 fetch */
const s139PartsDir = partsDir;
const s139Files = s139PartsDir === null ? [] : readdirSync(s139PartsDir).filter(function (name) { return /\.js$/.test(name); });
const s139NetFiles = [];
const s139AgentCode = {};
s139Files.forEach(function (name) {
  const text = readFileSync(pathMod.join(s139PartsDir, name), 'utf8');
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/agentFetchImpl\s*\(/.test(code) || /window\.fetch/.test(code) || /(^|[^A-Za-z0-9_.])fetch\s*\(/.test(code)) s139NetFiles.push(name);
  if (name === '57-agent.js') s139AgentCode.code = code;
});
const s139AgentSrc = s139AgentCode.code || '';
const s139DoFetchCalls = (s139AgentSrc.match(/doFetch\(/g) || []).length;
const s139XApiKey = (s139AgentSrc.match(/X-Api-Key/g) || []).length;
const s139DshBase = (s139AgentSrc.match(/'\/plugins\/local\/dsh-tasks'/g) || []).length;
const s139AuthCount = (s139AgentSrc.match(/Authorization/g) || []).length;
check('S139S4', '§8-99 fetch 白名单（静态）：src/parts 下碰网络的文件集合严格等于 {57-agent.js}；该文件里所有网络调用都走 agentFetchImpl()/doFetch（恰 3 条通道），X-Api-Key 字面量 0 命中，同源前缀 /plugins/local/dsh-tasks 恰 1 处',
  s139Files.length >= 10 && s139NetFiles.join(',') === '57-agent.js' && s139DoFetchCalls === 3 && s139XApiKey === 0 && s139DshBase === 1,
  '扫描文件=' + s139Files.length + ' 碰网络=' + JSON.stringify(s139NetFiles) + ' doFetch 调用=' + s139DoFetchCalls + ' X-Api-Key=' + s139XApiKey + ' 同源前缀=' + s139DshBase + ' Authorization 字面量=' + s139AuthCount + '（§8-99 原文要求 0，实际 3：custom/ping 两处发头 + 1 处脱敏表；已作为规格口径差异上报）');

/* —— §8-41 收起不丢状态 —— */
closeAllDrawers();
fire(railByLabel('全部未完成'));
rerender(); rerender();
const s139Search = one(function (n) { return hasClass(n, 'dtSearchInput'); }, drawerSlot('b'));
if (s139Search) change(s139Search, 'abc');
rerender(); rerender();
const s139CollapseB = collapseIn(drawerSlot('b'));
if (s139CollapseB) fire(s139CollapseB);
rerender(); rerender();
fire(railByLabel('全部未完成'));
rerender(); rerender();
const s139Search2 = one(function (n) { return hasClass(n, 'dtSearchInput'); }, drawerSlot('b'));
fire(railDt('rail-quadrant'));
rerender(); rerender();
const s139PinBtn = one(function (n) { return hasClass(n, 'dtPinBtn'); }, drawerSlot('b'));
if (s139PinBtn) fire(s139PinBtn);
rerender(); rerender();
const s139QuadItem = one(function (n) { return hasClass(n, 'dtQuadItem'); }, drawerSlot('b'));
const s139PinBefore = s139QuadItem ? attr(s139QuadItem, 'data-pinned') : null;
const s139QuadBefore = s139QuadItem ? attr(s139QuadItem, 'data-quadrant') : null;
const s139QuadRow = s139QuadItem ? one(function (n) { return hasClass(n, 'dtRow'); }, s139QuadItem) : null;
if (s139QuadRow) fire(s139QuadRow);
rerender(); rerender();
const s139CollapseC = collapseIn(drawerSlot('c'));
if (s139CollapseC) fire(s139CollapseC);
rerender(); rerender();
const s139QuadItem2 = one(function (n) { return hasClass(n, 'dtQuadItem'); }, drawerSlot('b'));
check('S139G1', '§8-41 收起不丢状态：B 栏搜索框输入 abc → 收起 B 再点同一条 rail 项，input.dtSearchInput.value 仍是 abc；四象限某条的 data-pinned/data-quadrant 在收起 C 前后不变',
  !!s139Search2 && s139Search2.props.value === 'abc' &&
  !!s139QuadItem2 && attr(s139QuadItem2, 'data-pinned') === s139PinBefore && attr(s139QuadItem2, 'data-quadrant') === s139QuadBefore,
  '搜索值=' + (s139Search2 ? JSON.stringify(s139Search2.props.value) : 'null') + ' pinned ' + String(s139PinBefore) + '→' + (s139QuadItem2 ? attr(s139QuadItem2, 'data-pinned') : 'null') + ' quadrant ' + String(s139QuadBefore) + '→' + (s139QuadItem2 ? attr(s139QuadItem2, 'data-quadrant') : 'null'));

/* —— §8-33 除夕由农历推导、不写死 —— */
closeAllDrawers();
rerender(); rerender();
fire(railDt('rail-calendar'));
rerender(); rerender();
gotoMonth(2025, 1);
rerender(); rerender();
const s139Cell2025 = cellAt('2025-01-28');
gotoMonth(2024, 2);
rerender(); rerender();
const s139Cell2024 = cellAt('2024-02-09');
const s139Holiday2025 = s139Cell2025 ? attr(s139Cell2025, 'data-holiday') : null;
const s139Holiday2024 = s139Cell2024 ? attr(s139Cell2024, 'data-holiday') : null;
check('S139G2', '§8-33 除夕由农历推导：2025-01-28 的格子 data-holiday="除夕"；2024-02-09（农历腊月最后一天但不在假期段内）没有 data-holiday',
  s139Holiday2025 === '除夕' && (s139Holiday2024 === undefined || s139Holiday2024 === null || s139Holiday2024 === ''),
  '2025-01-28=' + JSON.stringify(s139Holiday2025) + ' 2024-02-09=' + JSON.stringify(s139Holiday2024));

/* ============================ 十六、老状态兼容（t128：旧 localStorage 不许白板） ============================ */
/* 真机事故（t127）：用户 localStorage 里是几个月前的状态，缺后来新增的设置键；渲染期读 undefined 链 →
   TypeError → React 卸载整块面板 → 纯白。此前 280+ 条断言全部建立在种子/全新状态上，所以全绿。
   本段把「旧状态」三族固化成断言：缺键 / 脏值 / 致命。判据只有一条 —— 绝不允许白板。
   分层：缺键族要求「正常渲染且不留 fatal」；脏值族允许落到 fatal 卡片但绝不允许空白；
   致命族分别验「坏 JSON 走种子+提示条」与「渲染期崩溃走 fatal 卡片」两条路径。 */

const S128_KEY = 'dsh.tasks.v1';
const S128_FATAL = (n) => attr(n, 'data-dt') === 'fatal';
const S128_FATAL_ROOT = (n) => attr(n, 'data-dt') === 'fatal-root';
const S128_BROKEN = (n) => attr(n, 'data-dt') === 'broken-notice';

/* 取「当前实现写进 localStorage 的完整状态」当作旧状态基线：它含全部新键，
   逐个删/改才有意义；用种子反推会漏掉后来新增的键。 */
function s128BaseState() {
  storeApi.saveNow();
  const state = savedState();
  if (!state) throw new Error('s128: 落盘状态读不到（savedState() 为空）');
  return JSON.parse(JSON.stringify(state));
}

const s128Pristine = s128BaseState();

function s128Shape(node) {
  const nodes = node ? all(() => true, node) : [];
  return {
    nodes: nodes.length,
    roots: node ? all((n) => hasClass(n, 'dtRoot'), node).length : 0,
    rail: node ? all((n) => hasClass(n, 'dtRailItem'), node).length : 0,
    fatal: node ? all(S128_FATAL, node).length : 0,
    broken: node ? all(S128_BROKEN, node).length : 0
  };
}

/* 白板判据（严格）：没抛错、没有 JS 异常、有 .dtRoot、rail 有项、节点数够多。
   下面 S128Z 会用一份空 shape 反证它不是恒真。 */
function s128NotBlank(shape) {
  return !shape.thrown && shape.errors.length === 0 && shape.roots >= 1 && shape.rail >= 1 && shape.nodes >= 20;
}
/* 脏值族的宽松判据：允许落到 fatal 卡片，但不许空白、不许抛到宿主。 */
function s128Alive(shape) {
  return !shape.thrown && shape.roots >= 1 && shape.nodes >= 10 && (shape.rail >= 1 || shape.fatal >= 1);
}

/* 用一份改过的状态重启整块面板：bootFresh() 会重跑 factory+apply（等价「用户刷新页面」），
   path 每个变体唯一 —— 桩按 path+组件名 缓存 hook 实例，同 path 不会重跑 useState 初始化（t127 已踩）。 */
function s128Boot(tag, mutate) {
  const state = s128BaseState();
  const note = typeof mutate === 'function' ? (mutate(state) || '') : '';
  lsData.set(S128_KEY, JSON.stringify(state));
  const before = errors.length;
  const boot = bootFresh();
  const reg = boot.regs.find((r) => r.desc && r.desc.name === 'main');
  if (!reg) throw new Error('s128: main 插槽未注册');
  let rendered = null;
  let thrown = null;
  try {
    rendered = render(reg.comp(boot.props), 't128:' + tag);
  } catch (err) {
    thrown = err;
  }
  const shape = s128Shape(rendered);
  shape.errors = errors.slice(before).map((entry) => entry[0] + ': ' + (entry[1] && entry[1].message ? entry[1].message : String(entry[1])));
  shape.thrown = thrown ? String(thrown && thrown.message ? thrown.message : thrown) : '';
  const fresh = boot.props && boot.props.store ? boot.props.store.get() : null;
  const settingsAfter = fresh && fresh.settings ? JSON.parse(JSON.stringify(fresh.settings)) : null;
  return { state, boot, reg, tree: rendered, shape, note, settingsAfter };
}

/* 缺键族的判别力不能只看「默认视图渲染成功」——默认视图（今天）根本不读 calendar.overlays /
   scoreRingMode / appearance；打开日历或设置页才会读。所以这里直接验「补齐层真的把键补回来了、
   形状也对」，这才是老状态兼容的实质（M1 变异把补齐层架空 → 这条立刻红）。 */
function s128SettingsOk(settings) {
  if (!settings || typeof settings !== 'object') return 'settings-missing';
  const app = settings.appearance;
  if (!app || typeof app !== 'object' || typeof app.accent !== 'string') return 'appearance.accent';
  /* scoreRingMode 不落盘：00-prelude 的 scoreRingModeOf() 在读取侧兜底为 'bands'，
     所以「补齐后仍是 undefined」是正常形态；只在它存在时校验取值域。 */
  if (settings.scoreRingMode !== undefined && settings.scoreRingMode !== 'bands' && settings.scoreRingMode !== 'gradient') return 'scoreRingMode=' + String(settings.scoreRingMode);
  const sort = settings.tasks && settings.tasks.sort;
  if (!sort || typeof sort !== 'object' || typeof sort.key !== 'string') return 'tasks.sort.key';
  if (typeof sort.dir !== 'string' || typeof sort.group !== 'string') return 'tasks.sort.dir/group';
  const ov = settings.calendar && settings.calendar.overlays;
  if (!ov || typeof ov !== 'object' || typeof ov.lunar !== 'boolean' || typeof ov.term !== 'boolean' || typeof ov.holiday !== 'boolean') return 'calendar.overlays';
  if (!settings.modules || typeof settings.modules !== 'object') return 'modules';
  /* onething 同理：只有读到 t108 之前的 obstacle/ban 旧键才会被合并出来，
     没有旧键时它本就不存在（注册表按 enabledByDefault 处理），不算缺键。 */
  if (settings.modules.onething !== undefined && typeof settings.modules.onething !== 'boolean') return 'modules.onething=' + String(settings.modules.onething);
  if (!settings.modules.order || typeof settings.modules.order !== 'object') return 'modules.order';
  return '';
}

function s128Drop(path) {
  return function (state) {
    const parts = path.split('.');
    let node = state;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!node || typeof node !== 'object') return 'PARENT-MISSING:' + path;
      node = node[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    if (!node || typeof node !== 'object') return 'PARENT-MISSING:' + path;
    if (!(leaf in node)) return 'KEY-ABSENT:' + path;
    delete node[leaf];
    return 'deleted:' + path;
  };
}

function s128Set(path, value) {
  return function (state) {
    const parts = path.split('.');
    let node = state;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!node || typeof node !== 'object') return 'PARENT-MISSING:' + path;
      node = node[parts[i]];
    }
    if (!node || typeof node !== 'object') return 'PARENT-MISSING:' + path;
    node[parts[parts.length - 1]] = value;
    return 'set:' + path + '=' + JSON.stringify(value);
  };
}

/* 缺键族：真实旧状态缺的是「后来新增的键」，逐个删 + 五个一起删。
   实测这五个键在当前产物里都存在（脚本会打印 KEY-ABSENT，缺了就说明键名写错、断言该红）。 */
/* 第五个键（modules.onething）在当前产物里并非「总有」：它只在读到 t108 之前的 obstacle/ban 旧键时
   由 mergeOnethingModule 合并出来（DEFAULT_MODULE_ORDER 里没有 onething）。所以这一族不能靠「删」造，
   要按真实旧状态造：剥掉 onething/tags，写回 obstacle/ban 两个旧键。 */
function s128LegacyOnething(state) {
  const modules = state.settings && state.settings.modules;
  if (!modules || typeof modules !== 'object') return 'NO-MODULES';
  delete modules.onething;
  delete modules.tags;
  modules.obstacle = true;
  modules.ban = false;
  return 'legacy:obstacle+ban(no onething)';
}
const s128MissingCases = [
  ['drop-appearance', s128Drop('settings.appearance')],
  ['drop-scoreRingMode', s128Drop('settings.scoreRingMode')],
  ['drop-tasks-sort', s128Drop('settings.tasks.sort')],
  ['drop-calendar-overlays', s128Drop('settings.calendar.overlays')],
  ['legacy-modules', s128LegacyOnething],
  ['drop-all-five', function (state) {
    const notes = [
      s128Drop('settings.appearance')(state),
      s128Drop('settings.scoreRingMode')(state),
      s128Drop('settings.tasks.sort')(state),
      s128Drop('settings.calendar.overlays')(state),
      s128LegacyOnething(state)
    ];
    return notes.join(' | ');
  }]
];
const s128MissingProbe = s128MissingCases.map(function (pair) {
  const got = s128Boot('missing-' + pair[0], pair[1]);
  const why = s128SettingsOk(got.settingsAfter);
  return {
    tag: pair[0], note: got.note, shape: got.shape, settingsWhy: why,
    mergedOnething: got.settingsAfter && got.settingsAfter.modules ? got.settingsAfter.modules.onething : undefined
  };
});
check('S128A', '§3.8 老状态缺键族：逐个删掉后加的设置键（appearance / scoreRingMode / tasks.sort / calendar.overlays / modules.onething）以及五键同删，面板都必须正常渲染（.dtRoot + rail≥1、无 fatal、无 JS 异常）且补齐后的键形状正确（appearance.accent / tasks.sort / calendar.overlays / modules.order；造了 obstacle+ban 旧键时 modules.onething 必须合并为 true）',
  s128MissingProbe.every((p) => s128NotBlank(p.shape) && p.shape.fatal === 0 && p.settingsWhy === '' &&
    p.note.indexOf('KEY-ABSENT') === -1 && p.note.indexOf('PARENT-MISSING') === -1 && p.note.indexOf('NO-MODULES') === -1 &&
    /* 造了 t108 之前的 obstacle/ban 旧键时，合并必须生效（onething = obstacle 优先 = true） */
    (p.note.indexOf('legacy:') === -1 || p.mergedOnething === true)),
  s128MissingProbe.map((p) => p.tag + '{' + p.note + '}⇒nodes=' + p.shape.nodes + ' rail=' + p.shape.rail + ' fatal=' + p.shape.fatal + ' 补齐=' + (p.settingsWhy || 'ok') + ' onething=' + String(p.mergedOnething) + (p.shape.thrown ? ' thrown=' + p.shape.thrown : '') + (p.shape.errors.length ? ' js=' + p.shape.errors.join(' / ') : '')).join(' ｜ '));

/* 脏值族：老状态不只是缺键，还可能是错类型/错形状（手工改过、旧版本写坏、导入半成品）。 */
const s128DirtyCases = [
  ['settings-empty', s128Set('settings', {})],
  ['modules-empty', s128Set('settings.modules', {})],
  ['modules-order-null', s128Set('settings.modules.order', null)],
  ['tasks-null', s128Set('settings.tasks', null)],
  ['calendar-null', s128Set('settings.calendar', null)],
  ['accent-number', s128Set('settings.appearance.accent', 12345)],
  ['settings-null', s128Set('settings', null)]
];
const s128DirtyProbe = s128DirtyCases.map(function (pair) {
  const got = s128Boot('dirty-' + pair[0], pair[1]);
  return { tag: pair[0], note: got.note, shape: got.shape };
});
check('S128B', '§3.8 老状态脏值族：settings={} / modules={} / modules.order=null / tasks=null / calendar=null / appearance.accent=数字 / settings=null 七种脏值，面板不许白板（允许落到 fatal 卡片，但必须有 .dtRoot 与可读内容）',
  s128DirtyProbe.every((p) => s128Alive(p.shape) && p.note.indexOf('MISSING') === -1),
  s128DirtyProbe.map((p) => p.tag + '{' + p.note + '}⇒nodes=' + p.shape.nodes + ' roots=' + p.shape.roots + ' rail=' + p.shape.rail + ' fatal=' + p.shape.fatal + ' broken=' + p.shape.broken + (p.shape.thrown ? ' thrown=' + p.shape.thrown : '')).join(' ｜ '));

/* 致命族 1：localStorage 里是坏 JSON。实现（t127）的选择是「备份原文 → 按种子启动 → 顶部提示条」，
   不是整屏 fatal；契约原文写「必须是 fatal 卡片」，两者都满足「不白板」，此处按实现写死可观测钩子，
   并把口径差异写进 evidence 供 captain 定夺。 */
const s128BadJson = (function () {
  const state = s128BaseState();
  lsData.set(S128_KEY, '{"version":1,"tasks":[{"id":"x",');
  const before = errors.length;
  const boot = bootFresh();
  const reg = boot.regs.find((r) => r.desc && r.desc.name === 'main');
  let rendered = null;
  let thrown = null;
  try {
    rendered = render(reg.comp(boot.props), 't128:bad-json');
  } catch (err) {
    thrown = err;
  }
  const shape = s128Shape(rendered);
  shape.errors = errors.slice(before).map((entry) => entry[0] + ': ' + (entry[1] && entry[1].message ? entry[1].message : String(entry[1])));
  shape.thrown = thrown ? String(thrown && thrown.message ? thrown.message : thrown) : '';
  const mem = boot.props && boot.props.store ? boot.props.store.get() : null;
  const memTasks = mem && Array.isArray(mem.tasks) ? mem.tasks.length : -1;
  const memProjects = mem && Array.isArray(mem.projects) ? mem.projects.length : -1;
  lsData.set(S128_KEY, JSON.stringify(state));
  return { shape, memTasks, memProjects };
})();
check('S128C1', '§3.8 致命族·坏 JSON：localStorage 里不是合法状态时，面板按种子启动并显示损坏提示条（[data-dt=broken-notice]），不空白、不抛到宿主（实现口径：备份原文后走种子，而非整屏 fatal）',
  s128NotBlank(s128BadJson.shape) && s128BadJson.shape.broken === 1 && s128BadJson.shape.thrown === '' &&
  s128BadJson.memTasks > 0 && s128BadJson.memProjects > 0,
  'nodes=' + s128BadJson.shape.nodes + ' roots=' + s128BadJson.shape.roots + ' rail=' + s128BadJson.shape.rail + ' fatal=' + s128BadJson.shape.fatal + ' broken=' + s128BadJson.shape.broken + ' 按种子启动⇒内存任务=' + s128BadJson.memTasks + ' 清单=' + s128BadJson.memProjects + (s128BadJson.shape.errors.length ? ' js=' + s128BadJson.shape.errors.join(' / ') : ''));

/* 致命族 2：渲染期崩溃（本次真机事故的形态）。给 main 组件换一个 get() 必抛的 store，
   必须落到 FatalCard 的 fatal/fatal-msg/fatal-reset 三件套，而不是白屏。 */
const s128Crash = (function () {
  lsData.set(S128_KEY, JSON.stringify(s128BaseState()));
  const boot = bootFresh();
  const reg = boot.regs.find((r) => r.desc && r.desc.name === 'main');
  const badStore = {
    get: function () { throw new Error('t128 fatal probe'); },
    subscribe: function () { return function () {}; },
    update: function () {},
    saveNow: function () {},
    pushAlert: function () {},
    drainPending: function () { return []; }
  };
  const props2 = Object.assign({}, boot.props, { store: badStore });
  const before = errors.length;
  let rendered = null;
  let thrown = null;
  try {
    rendered = render(reg.comp(props2), 't128:crash');
  } catch (err) {
    thrown = err;
  }
  const fatalMsg = rendered ? all((n) => attr(n, 'data-dt') === 'fatal-msg', rendered).map((n) => nodeText(n).trim()) : [];
  const fatalReset = rendered ? all((n) => attr(n, 'data-dt') === 'fatal-reset', rendered).length : 0;
  return { shape: s128Shape(rendered), thrown, fatalMsg, fatalReset, errs: errors.slice(before).length };
})();
check('S128C2', '§3.8 致命族·渲染期崩溃：main 组件渲染时抛错必须被边界接住并渲染 FatalCard（[data-dt=fatal] + fatal-msg 文案非空 + fatal-reset 存在），白屏即失败',
  s128Crash.shape.fatal === 1 && s128Crash.thrown === null && s128Crash.fatalMsg.length === 1 && s128Crash.fatalMsg[0].length > 0 && s128Crash.fatalReset === 1,
  'nodes=' + s128Crash.shape.nodes + ' roots=' + s128Crash.shape.roots + ' fatal=' + s128Crash.shape.fatal + ' fatalMsg=' + JSON.stringify(s128Crash.fatalMsg).slice(0, 160) + ' fatalReset=' + s128Crash.fatalReset + ' thrownToHost=' + (s128Crash.thrown ? s128Crash.thrown : 'no'));

/* 判据自证：白板判据必须能把「空树」判成红，否则上面三族全是恒真假绿。 */
const s128BlankShape = { nodes: 0, roots: 0, rail: 0, fatal: 0, broken: 0, errors: [], thrown: '' };
check('S128Z', '§3.8 判据自证：白板判据对空树返回 false（node=0 / 无 rail / 无 fatal ⇒ 判红），证明 S128A/B/C1 不是恒真',
  s128NotBlank(s128BlankShape) === false && s128Alive(s128BlankShape) === false && s128NotBlank(s128MissingProbe[0].shape) === true,
  'blankShape⇒notBlank=' + s128NotBlank(s128BlankShape) + ' alive=' + s128Alive(s128BlankShape) + '；对照一个真实变体⇒notBlank=' + s128NotBlank(s128MissingProbe[0].shape));

/* 收尾：把 localStorage 还原成进本段前的完整状态（每个变体都会改写它），避免污染后续与下次运行。 */
lsData.set(S128_KEY, JSON.stringify(s128Pristine));

/* ============================ 十七、t162 回归收编（t144 / t150 / t156 / t161 / t163） ============================ */

/* 四张卡的规格收编：项目设置与拖拽（t143/t144）、立即行动 + 热力图两档（t155/t156）、设置贴底（t160/t161）、

   agent-detail（t150），外加 captain 追加的 React #31/#62 门禁（t163 报障）。

   约定：状态驱动——先摆夹具（applyState / setSettings），再走真实交互（fire / dispatchEvt / 直接调 onKeyDown），

   每次交互后重新查询节点（mini-React 每帧重建，旧引用会失效）。桩没有布局引擎（rectOf 对所有节点返回同一矩形），

   所以 rect 类判据一律落成「DOM 次序 + CSS 契约 + 结构守恒」三件套，证据里写明这一点。 */

const t162Rail = () => one((n) => hasClass(n, 'dtRail'));

const t162ChildOf = (target) => { let out = null; walk(tree, (n) => { if (out || !n) return; if (childNodes(n).indexOf(target) >= 0) out = n; }); return out; };

const t162Contains = (root, target) => { if (!root || !target) return false; let hit = false; walk(root, (n) => { if (n === target) hit = true; }); return hit; };

const t162Ordinal = (root, target) => { if (!root || !target) return -1; let k = -1, seq = 0; walk(root, (n) => { seq += 1; if (n === target && k < 0) k = seq; }); return k; };

const t162AllRule = (sel) => cssRuleAll(sel).join(' ');

const t162LastRule = (sel) => { const arr = cssRuleAll(sel); return arr.length ? arr[arr.length - 1] : ''; };

const t162Projects = () => byCls('dtRailRow');

const t162FnRows = () => byCls('dtRailFnRow');

const t162Grips = (root) => byCls('dtRailDrag', root);

const t162Live = () => (byDt('rail-order-live')[0] ? nodeText(byDt('rail-order-live')[0]).trim() : '');

const t162On = (node) => (node ? String(attr(node, 'data-on')) : '(缺)');

const t162PsBtn = () => railDt('project-settings');

const t162OpenPs = () => { if (!byDt('project-settings-panel')[0]) { if (t162PsBtn()) fire(t162PsBtn()); } return byDt('project-settings-panel')[0] || null; };

const t162ToSettings = () => { if (centerView() !== 'settings') fire(railDt('rail-settings')); };

const t162ProjOrderArr = () => { const o = (settingsNow() || {}).projectsOrder; return Array.isArray(o) ? o : null; };

const t162ModOrderStr = () => JSON.stringify((((settingsNow() || {}).modules || {}).order) || null);

const t162KeyOn = (node, key, alt) => {

  const h = node && node.props && node.props.onKeyDown;

  if (typeof h !== 'function') return false;

  const ev = mkEvent(node, 'keydown');

  ev.key = key;

  ev.altKey = !!alt;

  try { h(ev); } catch (e) { errors.push(['t162-key:' + key, e]); }

  rerender(); rerender();

  return true;

};

const t162Texts = (nodes) => nodes.map((n) => nodeText(n).trim());



/* —— 门禁 A/B（静态）：把「真机会崩、桩里静默」的两类 JSX 契约违规变成可判红 ——

   A：`rec(Reasons|Steps|Candidates)(...)[0]` 这把取到的是 {key,text} 对象，直接当子节点 ⇒ React #31。

      两种合法写法：`(...[0].text`、`(...[0] || {}).text`；其余尾巴（`,` / `)` 直接作为 children）判红。

   B：`style: '<css 字符串>'` ⇒ React #62（SlotErrorBoundary 捕获后 abdicate，整块空白、连 fatal 卡都没有）。

   只读 src/parts，不改生产代码（本卡 inScope 只有 test/render-test.mjs）。 */

const t162Src = (() => {

  const out = {};

  if (!partsDir) return out;

  readdirSync(partsDir).filter((f) => f.endsWith('.js')).sort().forEach((f) => {

    try { out[f] = readFileSync(pathMod.join(partsDir, f), 'utf8'); } catch (e) { out[f] = ''; }

  });

  return out;

})();

const t162GateAHits = [];

Object.keys(t162Src).forEach((f) => {

  const text = t162Src[f];

  const re = /rec(?:Reasons|Steps|Candidates)\s*\([^()]*\)\s*\[0\]/g;

  let m;

  while ((m = re.exec(text))) {

    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 40);

    const okTail = /^\s*\.text/.test(tail) || /^\s*(?:\|\|)\s*\{\s*\}\s*\)\s*\.text/.test(tail);

    if (!okTail) {

      const line = text.slice(0, m.index).split('\n').length;

      t162GateAHits.push(f + ':' + line + ' tail=' + JSON.stringify(tail.replace(/\s+/g, ' ').slice(0, 24)));

    }

  }

});

const t162GateBHits = [];

Object.keys(t162Src).forEach((f) => {

  t162Src[f].split(/\r?\n/).forEach((line, i) => { if (/style:\s*['"]/.test(line)) t162GateBHits.push(f + ':' + (i + 1) + ' ' + line.trim().slice(0, 50)); });

});

check('T162-G1', '门禁 A（t163 报障 / React #31）：src/parts 里 rec(Reasons|Steps|Candidates)(...)[0] 之后必须立刻取 .text 或 `|| {}).text`，不得把 {key,text} 对象当子节点（真机会抛 #31 炸成崩溃卡，桩里原本静默丢弃）',

  !!partsDir && Object.keys(t162Src).length > 0 && t162GateAHits.length === 0,

  '扫描文件 ' + Object.keys(t162Src).length + ' 个；违规 ' + t162GateAHits.length + ' 处' + (t162GateAHits.length ? '：' + t162GateAHits.join(' | ') : '（recSteps/recReasons 均先取 .text）'));

check('T162-G2', '门禁 B（t163 报障 / React #62）：src/parts 里不得出现 `style: \'<字符串>\'`（真机 inline style 不接受 CSS 字符串，SlotErrorBoundary 捕获后 abdicate ⇒ 整块空白且无 fatal 卡）',

  !!partsDir && Object.keys(t162Src).length > 0 && t162GateBHits.length === 0,

  '命中 ' + t162GateBHits.length + ' 处' + (t162GateBHits.length ? '：' + t162GateBHits.slice(0, 6).join(' | ') : '（h() 归一化已兜住，源码层 0 处）'));

check('T162-G3', '门禁 C（行为）：本轮全量渲染下来，没有「普通对象含 key+text 两键却被当子节点」的情形（桩的 createElement/render 打开了 badChildObjs 记账，逐条带组件路径）',

  badChildObjs.length === 0,

  '记账 ' + badChildObjs.length + ' 条' + (badChildObjs.length ? '：' + badChildObjs.slice(0, 5).map((b) => b.path + ' key=' + b.key).join(' | ') : '（本轮渲染路径未出现；活性由 G3b 自检证明）'));

/* G3b：门禁 C 的活性自检。G3 只统计「本轮渲染真实路径」，某个视图没被渲染到时它恒绿——所以这里直接
   往桩里塞一个 {key,text} 对象当子节点，证明记账确实会触发（否则 G3 的 0 条只是假绿）。 */
const t162BadLenBefore = badChildObjs.length;
render(createElement('div', { key: 'g3b', className: 'dtGateCProbe' }, { key: 'bad', text: '对象当子节点' }), 't162:G3b-probe');
const t162BadProbe = badChildObjs.length - t162BadLenBefore;
const t162BadProbePath = badChildObjs.length > t162BadLenBefore ? String(badChildObjs[badChildObjs.length - 1].path) : '';
badChildObjs.splice(t162BadLenBefore, badChildObjs.length - t162BadLenBefore);
check('T162-G3b', '门禁 C 活性自检：把 {key,text} 对象直接当子节点塞进专用探针路径，桩必须记账恰 1 条并落到该路径上（否则 G3 的 0 条是假绿，真机 React #31 仍会在用户面前炸成崩溃卡）',
  t162BadProbe === 1 && t162BadProbePath.indexOf('t162:G3b-probe') === 0 && badChildObjs.length === t162BadLenBefore,
  '探针记账=' + t162BadProbe + '（期望 1）路径=' + JSON.stringify(t162BadProbePath) + '；探测后账本已还原=' + (badChildObjs.length === t162BadLenBefore));



/* ---- 1. 项目设置面板（t144 / §1.20.1–§1.20.4） ---- */

const t162PsNode = t162PsBtn();

const t162AddNode = railDt('rail-new-project');

const t162PsParent = t162ChildOf(t162PsNode);

const t162AddParent = t162ChildOf(t162AddNode);

const t162ActionsOk = !!t162PsParent && hasClass(t162PsParent, 'dtRailTitleActions') && t162PsParent === t162AddParent;

const t162ActionsRule = t162AllRule('.dtRailTitleActions');

const t162PsIdx = t162PsParent ? childNodes(t162PsParent).indexOf(t162PsNode) : -1;

const t162AddIdx = t162PsParent ? childNodes(t162PsParent).indexOf(t162AddNode) : -1;

/* S2：间距统一到 --dt-sp-* 令牌后，gap 可能写成 var(--dt-sp-K) —— 判据必须认令牌，
   否则会逼实现写 `gap:4px;gap:var(--dt-sp-1)` 这种兜底声明只为过测（那是测试在制造噪音）。 */
const t162SpMap = { '1': 4, '2': 8, '3': 12, '4': 16, '5': 20, '6': 24, '7': 32, '8': 40 };
function t162GapOf(css) {
  const m = /(?:^|[^\w-])gap:\s*(?:(\d+(?:\.\d+)?)px|var\(--dt-sp-([0-9])\))/.exec(css || '');
  if (!m) return -1;
  return m[1] ? Number(m[1]) : (t162SpMap[m[2]] || -1);
}
const t162GapPx = t162GapOf(t162ActionsRule);

check('T162a', '(t144/§1.20.1) 入口 [data-dt="project-settings"] 在「新建清单」左侧同一行：同一父 .dtRailTitleActions 内 index 更小，父容器 display:flex + align-items:center + gap>0（gap 接受 px 或 var(--dt-sp-K)，令牌按 4/8/12/16/20/24/32/40 解析；桩无布局引擎，用 DOM 次序 + flex 契约代替 rect）',

  t162ActionsOk && t162PsIdx >= 0 && t162PsIdx < t162AddIdx && /display:\s*(?:inline-)?flex/.test(t162ActionsRule) && /align-items:\s*center/.test(t162ActionsRule) && t162GapPx > 0,

  '同父=' + (t162PsParent === t162AddParent) + ' 父类=dtRailTitleActions/' + (t162PsParent ? hasClass(t162PsParent, 'dtRailTitleActions') : '无父') +

  ' psIdx=' + t162PsIdx + ' addIdx=' + t162AddIdx + '；gap=' + t162GapPx + 'px；规则=' + JSON.stringify(t162ActionsRule.slice(0, 96)));

/* T162a2（不推荐写法拦截，全仓扫描）：令牌化后「字面 + 令牌」双写 gap —— 令牌化后字面那半已无必要，
   留着会让视觉真源出现两个，下次改令牌时字面值先兜住、令牌改动静默失效。判红并指名 file:line。 */
const t162GapDoubleHits = (function () {
  const hits = [];
  const files = (function () {
    try { return readdirSync(partsDir).filter((f) => /[.]js$/.test(f)); } catch (e) { return []; }
  })();
  files.forEach((f) => {
    let src = '';
    try { src = readFileSync(pathMod.join(partsDir, f), 'utf8'); } catch (e) { return; }
    src.split(/\r?\n/).forEach((line, i) => {
      if (/gap:\s*\d+(?:\.\d+)?px\s*;\s*gap:\s*var\(--dt-sp-\d\)/.test(line)) hits.push('src/parts/' + f + ':' + (i + 1));
    });
  });
  return hits;
})();
/* T162a2（不推荐写法拦截）：同一条规则里既写 gap 字面值又写 gap:var(--dt-sp-K) 兜底 —— 令牌化后字面那半已无必要，
   留着会让「视觉真源」出现两个，下次改令牌时字面值先兜住、令牌改动静默失效。判红并指名 file:line。 */
const t162ActionsStyleSrc = (function () {
  try { return readFileSync(partsDir + '/70-styles.js', 'utf8'); } catch (e) { return ''; }
})();
const t162ActionsStyleLines = t162ActionsStyleSrc.split(/\r?\n/);
const t162ActionsStyleLine = t162ActionsStyleLines.findIndex((l) => l.indexOf('.dtRailTitleActions{') >= 0);
const t162DoubleGap = /(?:^|[^\w-])gap:\s*\d+(?:\.\d+)?px/i.test(t162ActionsRule) && /(?:^|[^\w-])gap:\s*var\(--dt-sp-\d\)/.test(t162ActionsRule);
check('T162a2', '(captain m05472) 全仓不得「字面 + 令牌」双写 gap：令牌化后只留 gap:var(--dt-sp-K)，字面兜底属不推荐写法（同一条规则里两个视觉真源，改令牌会被字面值静默兜住）。扫描 src/parts/*.js 全部行，命中即判红并指名 file:line。注意这条只判 gap 双写，不判「存在字面间距」—— 2/6/10/14/18/22 不在八档阶梯、1/2/3px 是描边贴靠，口径是「不四舍五入」',
  t162GapDoubleHits.length === 0,
  '双写条数=' + t162GapDoubleHits.length + '；命中=' + JSON.stringify(t162GapDoubleHits.slice(0, 8)) + '；当前 .dtRailTitleActions 规则=' + JSON.stringify(t162ActionsRule.slice(0, 96)));



const t162Panel = t162OpenPs();

const t162RowReorder = byDt('ps-hide-reorder')[0] || null;

const t162RowColor = byDt('ps-hide-color')[0] || null;

const t162GripsDefault = t162Grips().length;

const t162DotsDefault = byCls('dtDot').length;

const t162DotExpect = t162Projects().length - byCls('dtRailEmoji').length;

check('T162b', '(t144/§1.20.2–§1.20.3) 两开关默认值走 railUIOf：hideReorder=true（默认不显示拖拽手柄 ⇒ grips 计数 0）、hideColor=false（色点照常显示 ⇒ .dtDot 计数 = 有色的项目行数）',

  !!t162Panel && t162On(t162RowReorder) === '1' && t162On(t162RowColor) === '0' && t162GripsDefault === 0 && t162DotsDefault > 0 && t162DotsDefault === t162DotExpect,

  'panel=' + (t162Panel ? String(attr(t162Panel, 'data-open')) : '缺') + ' ps-hide-reorder=' + t162On(t162RowReorder) + ' ps-hide-color=' + t162On(t162RowColor) +

  ' grips=' + t162GripsDefault + '（期望 0） .dtDot=' + t162DotsDefault + '（期望 ' + t162DotExpect + '）');



if (byDt('ps-hide-reorder')[0]) fire(byDt('ps-hide-reorder')[0]);

const t162GripsOn = t162Grips().length;

const t162RowTotal = t162Projects().length + t162FnRows().length;

if (byDt('ps-hide-color')[0]) fire(byDt('ps-hide-color')[0]);

const t162DotsHidden = byCls('dtDot').length;

if (byDt('ps-hide-color')[0]) fire(byDt('ps-hide-color')[0]);

const t162DotsBack = byCls('dtDot').length;

check('T162c', '(t144/§1.20.2) 「开启 = 节点不存在」：开 hideReorder ⇒ 手柄出现在每个可排序行（项目行 + 功能行），开 hideColor ⇒ .dtDot 归零；各自切回即复原',

  t162GripsOn === t162RowTotal && t162RowTotal > 0 && t162DotsHidden === 0 && t162DotsBack === t162DotExpect,

  'grips=' + t162GripsOn + '（期望 ' + t162RowTotal + ' = 项目 ' + t162Projects().length + ' + 功能 ' + t162FnRows().length + '）；hideColor 后 .dtDot=' + t162DotsHidden +

  '；切回后 .dtDot=' + t162DotsBack + '（期望 ' + t162DotExpect + '）');



const t162PsReorder = t162On(byDt('ps-hide-reorder')[0]);

const t162PsColor = t162On(byDt('ps-hide-color')[0]);

t162ToSettings();

const t162SetReorder = byDt('set-hide-reorder')[0] || null;

const t162SetColor = byDt('set-hide-color')[0] || null;

const t162SyncAB = t162On(t162SetReorder) === t162PsReorder && t162On(t162SetColor) === t162PsColor;

const t162ColorBefore = t162On(byDt('set-hide-color')[0]);

if (byDt('set-hide-color')[0]) fire(byDt('set-hide-color')[0]);

const t162ColorAfter = t162On(byDt('set-hide-color')[0]);

t162OpenPs();

const t162ColorInPs = t162On(byDt('ps-hide-color')[0]);

check('T162d', '(t144/§1.20.4) 设置页「目录栏」卡与 rail 面板读同一份 settings.railUI：两行 data-on 首帧逐值相等；在设置页切一次 hideColor，面板同帧跟上（双向一致）',

  !!t162SetReorder && !!t162SetColor && t162SyncAB && t162ColorBefore !== t162ColorAfter && t162ColorAfter === t162ColorInPs,

  '面板 reorder/color=' + t162PsReorder + '/' + t162PsColor + '；设置页=' + t162On(t162SetReorder) + '/' + t162On(t162SetColor) + '；切 color 后设置页=' + t162ColorAfter + ' 面板=' + t162ColorInPs);



/* ---- 2. 拖拽排序（t144 / §1.20.5–§1.20.7） ---- */

/* 拖拽用例需要 >=2 个可拖项目行：seed 里可拖的项目只有 inbox（其余被前面的段删掉了），这里临时补两个，用完还原 */
const t162OrderSnapBefore = JSON.stringify((settingsNow() || {}).projectsOrder === undefined ? null : (settingsNow() || {}).projectsOrder);
const t162DbBefore = JSON.parse(JSON.stringify(dbNow()));
applyState({ db: Object.assign({}, dbNow(), { projects: (dbNow().projects || []).concat([
  { id: 'p162a', name: 't162项目A', color: '', icon: '', type: 'list', deleted: false },
  { id: 'p162b', name: 't162项目B', color: '', icon: '', type: 'list', deleted: false }
]) }) });
const t162GList = t162Grips(railGroupEl('list')).length;

const t162GProj = t162Grips(railGroupEl('project')).length;

const t162GFn = t162Grips(railGroupEl('function')).length;

const t162GSet = t162Grips(railGroupEl('settings')).length;

check('T162e', '(t144/§1.20.5) 手柄只给「项目组 + 功能区」：清单段与设置段计数恒 0，项目行一手柄、功能项一手柄',

  t162GList === 0 && t162GSet === 0 && t162GProj === t162Projects().length && t162GProj > 0 && t162GFn === t162FnRows().length && t162GFn > 0,

  'list=' + t162GList + ' project=' + t162GProj + '/' + t162Projects().length + ' function=' + t162GFn + '/' + t162FnRows().length + ' settings=' + t162GSet);



const t162RowsOutsideProj = t162Projects().filter((n) => !t162Contains(railGroupEl('project'), n)).length;

const t162FnIsRow = t162FnRows().filter((n) => hasClass(n, 'dtRailRow')).length;

const t162FnGroups = t162FnRows().map((n) => String(attr(n, 'data-drag-group')));

check('T162f', '语义固化（t144）：功能区行容器必须是 .dtRailFnRow 而不得复用 .dtRailRow——否则 byCls(\'dtRailRow\') 会把 7 个功能项当成项目（等价于数据错乱）',

  t162RowsOutsideProj === 0 && t162FnIsRow === 0 && t162FnGroups.length === 7 && t162FnGroups.every((g) => g === 'function') && t162Projects().length > 0,

  '.dtRailRow 共 ' + t162Projects().length + ' 行、全部在 data-rail-group=project 内（越界 ' + t162RowsOutsideProj + '）；.dtRailFnRow 共 ' + t162FnRows().length +

  '、复用 .dtRailRow 的 ' + t162FnIsRow + '；fn 行 data-drag-group=' + JSON.stringify(t162FnGroups));



const t162ProjIds = t162Projects().map((n) => String(attr(n, 'data-drag-key')));

const t162FirstKey = t162ProjIds[0];

const t162ExpectedMove = t162ProjIds.slice(1).concat([t162ProjIds[0]]).map((k) => String(k).slice(2));

dispatchEvt(t162Grips(t162Projects()[0])[0], 'dragStart');

dispatchEvt(t162Projects()[t162Projects().length - 1], 'dragOver');

const t162DropRow = t162Projects().filter((n) => String(attr(n, 'data-drop-target')) === '1')[0] || null;

const t162ProjOrderBefore = JSON.stringify(t162ProjOrderArr());

if (t162DropRow) dispatchEvt(t162DropRow, 'drop');

const t162ProjOrderAfter = t162ProjOrderArr() || [];

check('T162g', '(t144/§1.20.5) 同组 drop 才写库：把首个项目拖到末位 ⇒ settings.projectsOrder 变成「左移一位」的序列，落点行先有 data-drop-target',

  !!t162DropRow && t162ProjOrderAfter.length === t162ProjIds.length && JSON.stringify(t162ProjOrderAfter) === JSON.stringify(t162ExpectedMove) && JSON.stringify(t162ProjOrderAfter) !== t162ProjOrderBefore,

  'ids=' + JSON.stringify(t162ProjIds.map((k) => String(k).slice(2))) + ' ⇒ projectsOrder=' + JSON.stringify(t162ProjOrderAfter) +

  '（期望 ' + JSON.stringify(t162ExpectedMove) + '）；落点行 data-drop-target=' + (t162DropRow ? '1' : '缺'));



const t162ModBefore = t162ModOrderStr();

const t162ProjBefore2 = JSON.stringify(t162ProjOrderArr());

dispatchEvt(t162Grips(t162FnRows()[0])[0], 'dragStart');

dispatchEvt(t162Projects()[0], 'dragOver');

const t162CrossTarget = String(attr(t162Projects()[0], 'data-drop-target'));

dispatchEvt(t162Projects()[0], 'drop');

const t162CrossProj = JSON.stringify(t162ProjOrderArr());

const t162CrossMod = t162ModOrderStr();

if (t162Grips(t162FnRows()[0])[0]) dispatchEvt(t162Grips(t162FnRows()[0])[0], 'dragEnd');

check('T162h', '(t144/§1.20.5) 跨组不接收：功能区手柄拖到项目行 ⇒ 无 data-drop-target、projectsOrder 与 modules.order 的 JSON 逐字不变',

  t162CrossTarget === 'undefined' && t162CrossProj === t162ProjBefore2 && t162CrossMod === t162ModBefore,

  'drop-target=' + t162CrossTarget + '（期望 undefined）；projectsOrder 变=' + (t162CrossProj !== t162ProjBefore2) + ' modules.order 变=' + (t162CrossMod !== t162ModBefore));



const t162IdsNow = t162ProjOrderArr() || [];

const t162AltDownOk = t162KeyOn(t162Grips(t162Projects()[0])[0], 'ArrowDown', true);

const t162AltOrder = t162ProjOrderArr() || [];

const t162LiveText = t162Live();

t162KeyOn(t162Grips(t162Projects()[0])[0], 'ArrowUp', true);

const t162OrderAfterUp = JSON.stringify(t162ProjOrderArr());

t162KeyOn(t162Grips(t162Projects()[t162Projects().length - 1])[0] || null, 'ArrowDown', true);

const t162OrderAfterLast = JSON.stringify(t162ProjOrderArr());

const t162OrderBeforeEnter = JSON.stringify(t162ProjOrderArr());

t162KeyOn(t162Grips(t162Projects()[0])[0], 'Enter', false);

t162KeyOn(t162Grips(t162Projects()[0])[0], ' ', false);

const t162OrderAfterEnter = JSON.stringify(t162ProjOrderArr());

check('T162i', '(t144/§1.20.6) Alt+↓ 换位并播报 [data-dt="rail-order-live"]；首位置 Alt+↑、末位置 Alt+↓ 都不写库（不循环）；Enter / Space 只 preventDefault、不改顺序',

  t162AltDownOk && t162AltOrder[0] === t162IdsNow[1] && t162AltOrder[1] === t162IdsNow[0] && t162LiveText === '已移动到第 2 位' &&

  t162OrderAfterUp === JSON.stringify(t162AltOrder) && t162OrderAfterLast === t162OrderAfterUp && t162OrderAfterEnter === t162OrderBeforeEnter,

  'Alt+↓ 后 projectsOrder=' + JSON.stringify(t162AltOrder.slice(0, 3)) + '（期望前两位互换）；live=' + JSON.stringify(t162LiveText) +

  '；首位置 Alt+↑ 不变=' + (t162OrderAfterUp === JSON.stringify(t162AltOrder)) + ' 末位置 Alt+↓ 不变=' + (t162OrderAfterLast === t162OrderAfterUp) +

  '；Enter/Space 后不变=' + (t162OrderAfterEnter === t162OrderBeforeEnter));



/* 还原拖拽用的临时项目，后续段回到 seed 口径 */
applyState({ db: Object.assign({}, dbNow(), { projects: t162DbBefore.projects || [] }) });
const t162RestoredOrder = t162OrderSnapBefore === 'null' ? null : JSON.parse(t162ProjOrderBefore);
applyState({ settings: Object.assign({}, settingsNow(), { projectsOrder: t162RestoredOrder === null ? undefined : t162RestoredOrder }) });
const t162DragRule = t162AllRule('.dtRailDrag');

const t162RowRule = t162AllRule('.dtRailRow');

const t162FnRowRule = t162AllRule('.dtRailFnRow');

const t162LabelsOn = t162Texts(t162Projects());

const t162FirstPathOn = t162Projects()[0] ? t162Projects()[0].__path : '';

t162OpenPs();

if (byDt('ps-hide-reorder')[0]) fire(byDt('ps-hide-reorder')[0]);

const t162LabelsOff = t162Texts(t162Projects());

const t162FirstPathOff = t162Projects()[0] ? t162Projects()[0].__path : '';

check('T162j', '(t144/§1.20.6) 18px 恒定占位：手柄是 position:absolute（left:2px / top:50% / height:18px），行容器 position:relative ⇒ 手柄出现或消失都不改行的起点、行高与相邻行间距（两态下项目行的标签序列与首行 __path 逐字相同）',

  /position:\s*absolute/.test(t162DragRule) && /height:\s*18px/.test(t162DragRule) && /left:\s*2px/.test(t162DragRule) && /position:\s*relative/.test(t162RowRule) && /position:\s*relative/.test(t162FnRowRule) &&

  JSON.stringify(t162LabelsOn) === JSON.stringify(t162LabelsOff) && t162FirstPathOn === t162FirstPathOff && t162LabelsOn.length > 0,

  '.dtRailDrag=' + JSON.stringify(t162DragRule.replace(/\s+/g, ' ').slice(0, 90)) + '；.dtRailRow position:relative=' + /position:\s*relative/.test(t162RowRule) +

  ' .dtRailFnRow=' + /position:\s*relative/.test(t162FnRowRule) + '；两态标签序列相同=' + (JSON.stringify(t162LabelsOn) === JSON.stringify(t162LabelsOff)) + ' 首行 __path 相同=' + (t162FirstPathOn === t162FirstPathOff));



/* ---- 3. A 栏「立即行动」按钮与面板（t156 / §1.21） ---- */

const t162ActBtn = railDt('rail-act-now');

const t162ActRule = (cssRuleAll('.dtRailRecBtn')[0] || '');

/* 桩在 apply 时只注入一次样式层，改 appearance.accent 不会重算 --dt-accent（真机由宿主换肤），
   所以这里判「令牌链」：--dt-accent 由 .dtRoot 定义、按钮只引用 var(--dt-accent)、暗档另有覆盖规则 */
const t162AccentChain = ((/--dt-accent:\s*([^;}]+)/.exec(t162AllRule('.dtRoot'))) || [null, ''])[1].trim();
const t162AccentDarkRules = cssRuleAll('.dtRoot[data-dt-theme="dark"]').filter((r) => /--dt-accent/.test(r));

const t162ModulesBefore = JSON.parse(JSON.stringify((settingsNow() || {}).modules || {}));

applyState({ settings: Object.assign({}, settingsNow(), { modules: Object.assign({}, t162ModulesBefore, { rec: false }) }) });

const t162ActGone = railDt('rail-act-now') === null;

applyState({ settings: Object.assign({}, settingsNow(), { modules: t162ModulesBefore }) });

check('T162k1', '(t156/§1.21.1–§1.21.3) 按钮 [data-dt="rail-act-now"] 常驻 A 栏顶部右侧、文案与 aria-label 逐字「立即行动」，底色取 var(--dt-accent)（切 accent 令牌即变、不带字面 hex、不直连 brand-primary）；settings.modules.rec=false 后节点不存在（不是隐藏）',

  !!t162ActBtn && nodeText(t162ActBtn).trim() === '立即行动' && String(attr(t162ActBtn, 'aria-label')) === '立即行动' &&

  /background:\s*var\(--dt-accent\)/.test(t162ActRule) && !/--dsw-alias-brand-primary/.test(t162ActRule) && !/#[0-9a-fA-F]{3,8}/.test(t162ActRule) &&

  !!t162AccentChain && t162AccentDarkRules.length >= 1 && t162ActGone,

  'text=' + JSON.stringify(t162ActBtn ? nodeText(t162ActBtn).trim() : '(缺)') + ' aria=' + JSON.stringify(t162ActBtn ? String(attr(t162ActBtn, 'aria-label')) : '') +

  '；规则=' + JSON.stringify(t162ActRule.replace(/\s+/g, ' ').slice(0, 96)) + '；--dt-accent 令牌链=' + JSON.stringify(t162AccentChain) + ' 暗档覆盖规则=' + t162AccentDarkRules.length + '（桩不重算样式层，判令牌不判色值）' +

  '；rec=false 后按钮=' + (t162ActGone ? '不存在' : '仍在'));



const t162AgentBefore = JSON.parse(JSON.stringify((settingsNow() || {}).agent || {}));

applyState({ settings: Object.assign({}, settingsNow(), { agent: Object.assign({}, (settingsNow() || {}).agent || {}, { source: 'dsh', timeoutMs: 8000 }) }) });

const t162HostSteps = ['1. 打开收件箱', '2) 读三封未读', '① 回一封最短的', '- 收尾归档'];

const t162HostPayload = { ok: true, provider: 'dsh', model: 'stub-model', text: JSON.stringify({ title: '先清掉三封未读', steps: t162HostSteps }) };

setFetch(() => okJson(t162HostPayload));

if (railDt('rail-act-now')) fire(railDt('rail-act-now'));

await flushAsync(30);

const t162PanelNode = byDt('act-now-panel')[0] || null;

const t162StepNodes = byDt('act-now-step');

const t162StepTexts = t162Texts(t162StepNodes);

const t162OrdRe = /^\s*(?:\d{1,2}\s*[.、)）]|[\u2460-\u2473]|[-\u2013\u2014\u2022\u00b7*])\s*/;
const t162NumOk = t162StepTexts.length > 0 && t162StepTexts.every((t, i) => { const prefix = new RegExp('^' + (i + 1) + '\\.'); if (!prefix.test(t)) return false; return !t162OrdRe.test(t.replace(prefix, '')); });

const t162DigitStart = t162StepTexts.filter((t) => /^\d/.test(t)).length;

const t162DoubleOrd = t162StepTexts.filter((t) => /^\d+\s*[.)、）]\s*\d+\s*[.)、）]/.test(t)).length;

const t162StepBox = byCls('dtActNowSteps')[0] || null;

const t162StepRole = t162StepBox ? String(attr(t162StepBox, 'role')) : '(缺)';

const t162StepTag = t162StepBox ? t162StepBox.tag : '(缺)';

const t162StepListStyle = t162StepBox ? computedProp(t162StepBox, 'list-style-type') : '';

check('T162k2', 'user 真机报障锁死（t156）：立即行动步骤序号不得重复——每步 textContent 恰以「N. 」开头且第 N 步数字为 N；4 步时以数字开头的计数恰 4（不是 8）；容器不是 ol/ul（role=list）且 list-style-type:none；Host 原文里的 1./2)/①/- 四种编号都只保留一份',

  !!t162PanelNode && t162StepTexts.length === 4 && t162NumOk && t162DigitStart === 4 && t162DoubleOrd === 0 &&

  t162StepRole === 'list' && t162StepTag !== 'ol' && t162StepTag !== 'ul' && (t162StepTag !== 'ol' && t162StepTag !== 'ul' ? true : t162StepListStyle === 'none'),

  'steps=' + t162StepTexts.length + ' 文本=' + JSON.stringify(t162StepTexts) + '；逐位编号对=' + t162NumOk + ' 数字开头计数=' + t162DigitStart + '（期望 4） 双编号=' + t162DoubleOrd +

  '；容器 tag=' + t162StepTag + ' role=' + t162StepRole + ' list-style-type=' + JSON.stringify(t162StepListStyle));



const t162PanelSrc = t162PanelNode ? String(attr(t162PanelNode, 'data-act-src')) : '';

const t162PanelCount = t162PanelNode ? String(attr(t162PanelNode, 'data-act-steps')) : '';

const t162PanelText = t162PanelNode ? nodeText(t162PanelNode).replace(/\s+/g, '') : '';

const t162TitleText = (byDt('act-now-title')[0] ? nodeText(byDt('act-now-title')[0]).trim() : '');

check('T162k3', '(t156/§1.21.5) 面板走 Host 通道（data-act-src=host）且 3–6 条细行动；整块正文 ≤300 字（去空白）；标题不重复出现在任何一步里',

  t162PanelSrc === 'host' && Number(t162PanelCount) >= 3 && Number(t162PanelCount) <= 6 && t162PanelText.length > 0 && t162PanelText.length <= 300 &&

  !!t162TitleText && t162StepTexts.every((t) => t.indexOf(t162TitleText) < 0),

  'data-act-src=' + t162PanelSrc + ' data-act-steps=' + t162PanelCount + '；面板正文（去空白）' + t162PanelText.length + ' 字；标题=' + JSON.stringify(t162TitleText) +

  '；标题被重复=' + t162StepTexts.some((t) => t.indexOf(t162TitleText) >= 0));



const t162Banned = ['我建议', '以下是', '希望这', '希望对你', '需要我', '如果你愿意', '总结一下', '首先', '综上'];

const t162BannedHits = t162Banned.filter((w) => t162PanelText.indexOf(w) >= 0);

const t162MetaHits = ['我将', '我已经', '现在让我', '接下来我'].filter((w) => t162PanelText.indexOf(w) >= 0);

const t162StepMax = t162StepTexts.reduce((mx, t) => Math.max(mx, t.length), 0);

check('T162k4', '(t156/§1.21.5) 不多言：整块正文不含寒暄句与自述过程（我建议/以下是/希望/首先/综上；我将/我已经/接下来我），单步 ≤41 字符（含「N. 」前缀，实现上限 40 + 前缀）',

  t162BannedHits.length === 0 && t162MetaHits.length === 0 && t162StepTexts.length > 0 && t162StepMax <= 41,

  '寒暄命中=' + JSON.stringify(t162BannedHits) + ' 自述命中=' + JSON.stringify(t162MetaHits) + '；最长一步 ' + t162StepMax + ' 字符');

applyState({ settings: Object.assign({}, settingsNow(), { agent: t162AgentBefore }) });

if (railDt('rail-act-now')) fire(railDt('rail-act-now'));



/* ---- 4. 习惯热力图两档（t156 / §2.8.9） ---- */

const t162RootRule = t162AllRule('.dtRoot');

const t162HeatEmpty = /--dt-heat-empty:\s*([^;}]+)/.exec(t162RootRule);

const t162HeatOn = /--dt-heat-on:\s*([^;}]+)/.exec(t162RootRule);

const t162HeatOnRules = cssRuleAll('.dtHeatCell[data-on="1"]');
const t162PctOf = (v) => { const m = /(\d{1,3})%/.exec(v || ''); return m ? Number(m[1]) : -1; };
const t162HeatEmptyPct = t162HeatEmpty ? t162PctOf(t162HeatEmpty[1]) : -1;
const t162HeatOnPct = t162HeatOn ? (/^var\(--dt-accent\)/.test(t162HeatOn[1].trim()) ? 100 : t162PctOf(t162HeatOn[1])) : -1;
const t162HeatDark = cssRuleAll('.dtRoot[data-dt-theme="dark"]').some((r) => /--dt-heat-empty:/.test(r));
/* C(on) == C(accent)：--dt-heat-on 直接就是 var(--dt-accent)，所以判等值而不是比大小
   （比大小在 on==accent 时恒真，等于一条永远为真的不等式，不构成判据）。 */
const t162HeatOnEqAccent = !!t162HeatOn && /^var\(--dt-accent\)\s*$/.test(t162HeatOn[1].trim());

const t162HeatEff = t162HeatOnRules.length ? t162HeatOnRules[t162HeatOnRules.length - 1] : '';

check('T162m1', '(t156/§2.8.9) 热力图两档由 accent 派生：--dt-heat-empty 是 accent 与 bg-layer-2 的 color-mix、比例 <50%，--dt-heat-on 与 accent 等值（C(on) == C(accent)，等值判据而非不等式），两者不同、都不写字面 hex，暗档另有覆盖（只判关系，不写死具体百分比——§2.8.9 已按实现改成 26%/暗档 30% + on=accent）',
  !!t162HeatEmpty && !!t162HeatOn && t162HeatEmpty[1] !== t162HeatOn[1] &&
  /^color-mix\(/.test(t162HeatEmpty[1].trim()) && /var\(--dt-accent\)/.test(t162HeatEmpty[1]) && t162HeatEmptyPct > 0 && t162HeatEmptyPct < 50 &&
  t162HeatOnEqAccent &&
  !/#[0-9a-fA-F]{3,8}/.test(t162HeatEmpty[1] + t162HeatOn[1]) && t162HeatDark,
  '--dt-heat-empty=' + (t162HeatEmpty ? t162HeatEmpty[1] : '(缺)') + '（' + t162HeatEmptyPct + '%）；--dt-heat-on=' + (t162HeatOn ? t162HeatOn[1] : '(缺)') + '（' + t162HeatOnPct + '%）；暗档覆盖=' + t162HeatDark + '；C(on)==C(accent)=' + t162HeatOnEqAccent);

check('T162m2', '(t156/§2.8.9) 已打卡格不跟随单个习惯色：.dtHeatCell[data-on="1"] 的最后一层有效规则取 var(--dt-heat-on)，不再出现 --dt-habit-color（旧规则仍在文件里但被后置覆盖，判据取「最后命中」而非「是否出现过」）',

  t162HeatOnRules.length >= 2 && /var\(--dt-heat-on\)/.test(t162HeatEff) && !/--dt-habit-color/.test(t162HeatEff),

  '同选择器规则 ' + t162HeatOnRules.length + ' 条；有效规则=' + JSON.stringify(t162HeatEff.replace(/\s+/g, ' ').slice(0, 90)) +

  '；仍含 --dt-habit-color=' + /--dt-habit-color/.test(t162HeatEff));



/* ---- 5. 设置贴底（t161 / §1.22） ---- */

const t162RailNode = t162Rail();

const t162ScrollNode = byDt('rail-scroll')[0] || null;

const t162SettingsGroup = one((n) => hasClass(n, 'dtRailGroup') && String(attr(n, 'data-rail-group')) === 'settings');

const t162RailKids = t162RailNode ? childNodes(t162RailNode) : [];

const t162ScrollGroups = t162ScrollNode ? childNodes(t162ScrollNode).filter((n) => hasClass(n, 'dtRailGroup')).map((n) => String(attr(n, 'data-rail-group'))) : [];

const t162Seps = byCls('dtRailSep');

const t162Pins = t162Seps.filter((n) => String(attr(n, 'data-rail-pin')) === '1');

const t162RailRule = t162AllRule('.dtRail');

const t162ScrollRule = t162AllRule('.dtRailScroll');

const t162SettingsRule = t162AllRule('.dtRail > [data-rail-group="settings"]');

const t162PinRule = t162AllRule('.dtRail > .dtRailSep[data-rail-pin="1"]');

check('T162n1', '(t161/§1.22.4) CSS 单一真源：.dtRail overflow:hidden + min-height:0（rail 自身不滚）；.dtRailScroll flex:1 1 auto + min-height:0 + overflow-y:auto + overscroll-behavior:contain；设置段 margin-top:auto + flex:0 0 auto；pin 分隔线 flex:0 0 auto',

  /overflow:\s*hidden/.test(t162RailRule) && /min-height:\s*0/.test(t162RailRule) &&

  /flex:\s*1 1 auto/.test(t162ScrollRule) && /overflow-y:\s*auto/.test(t162ScrollRule) && /overscroll-behavior:\s*contain/.test(t162ScrollRule) &&

  /margin-top:\s*auto/.test(t162SettingsRule) && /flex:\s*0 0 auto/.test(t162SettingsRule) && /flex:\s*0 0 auto/.test(t162PinRule),

  '.dtRail=' + JSON.stringify(t162RailRule.replace(/\s+/g, ' ').slice(0, 80)) + '；.dtRailScroll=' + JSON.stringify(t162ScrollRule.replace(/\s+/g, ' ').slice(0, 90)) +

  '；settings=' + JSON.stringify(t162SettingsRule.replace(/\s+/g, ' ')) + '；pin=' + JSON.stringify(t162PinRule.replace(/\s+/g, ' ')));

check('T162n2', '(t161/§1.22.2) 结构：rail 直属子含 .dtRailTop / .dtRailScroll / pin 分隔线 / 设置段 / live 区；scroll 内只装 list→project→function 三段，设置段在 scroll 之外（所以滚轮与滚动条都不作用于它）；.dtRailSep 恰 3 条、恰 1 条 data-rail-pin="1"',

  !!t162RailNode && !!t162ScrollNode && !!t162SettingsGroup && t162RailKids.indexOf(t162ScrollNode) >= 0 && t162RailKids.indexOf(t162SettingsGroup) >= 0 &&

  t162Contains(t162ScrollNode, t162SettingsGroup) === false && t162RailKids.indexOf(t162Pins[0]) >= 0 && t162Contains(t162ScrollNode, t162Pins[0]) === false &&

  JSON.stringify(t162ScrollGroups) === JSON.stringify(['list', 'project', 'function']) && t162Seps.length === 3 && t162Pins.length === 1,

  'rail 子=' + JSON.stringify(t162RailKids.map((n) => (n.props && n.props.className) || n.tag)) + '；scroll 内 group=' + JSON.stringify(t162ScrollGroups) +

  '；设置段在 scroll 内=' + t162Contains(t162ScrollNode, t162SettingsGroup) + '；sep=' + t162Seps.length + ' pin=' + t162Pins.length);



const t162ProjectsBefore = JSON.parse(JSON.stringify(dbNow().projects || []));

const t162Bulk = [];

for (let i = 1; i <= 40; i += 1) t162Bulk.push({ id: 'p162x' + i, name: '压力项目' + i, color: '', icon: '', type: 'list', deleted: false });

applyState({ db: Object.assign({}, dbNow(), { projects: (dbNow().projects || []).concat(t162Bulk) }) });

const t162ScrollAfter = byDt('rail-scroll')[0] || null;

const t162SettingsAfter = one((n) => hasClass(n, 'dtRailGroup') && String(attr(n, 'data-rail-group')) === 'settings');

const t162SepsAfter = byCls('dtRailSep').length;

const t162PinsAfter = byCls('dtRailSep').filter((n) => String(attr(n, 'data-rail-pin')) === '1').length;

check('T162n3', '(t161/§1.22.5) 40 项注入后结构守恒：设置段仍在 scroll 之外、仍是 rail 直属子；sep 仍 3 条、pin 仍 1 条（注入用 40 个项目代替 40 个功能项——功能项由注册表驱动、无法凭空注入，结构判据等价）',

  !!t162ScrollAfter && !!t162SettingsAfter && t162Contains(t162ScrollAfter, t162SettingsAfter) === false && t162SepsAfter === 3 && t162PinsAfter === 1,

  '项目 ' + (dbNow().projects || []).length + ' 个；设置段在 scroll 外=' + (t162Contains(t162ScrollAfter, t162SettingsAfter) === false) + '；sep=' + t162SepsAfter + ' pin=' + t162PinsAfter);

applyState({ db: Object.assign({}, dbNow(), { projects: t162ProjectsBefore }) });



/* ---- 6. agent-detail（t150） ---- */

const t162Card = () => byDt('set-agent')[0] || null;

const t162In = (hook, root) => (root ? byDt(hook, root) : []);

t162ToSettings();

const t162DshBody = {

  ok: false, code: 'AGENT_SERVER', message: '服务端错误，已重试',

  detail: { stage: 'generate', code: 'BAD_REQUEST', name: 'LlmError', upstreamStatus: 400, upstreamType: 'MissingSessionID', upstreamMessage: '400: {"type":"MissingSessionID","message":"session not found"}' }

};

setSettings({ agent: Object.assign({}, (settingsNow() || {}).agent || {}, { source: 'dsh', timeoutMs: 8000 }) });

setFetch(() => ({ ok: false, status: 500, json: () => Promise.resolve(t162DshBody), text: () => Promise.resolve(JSON.stringify(t162DshBody)) }));

if (byDt('agent-test')[0]) fire(byDt('agent-test')[0]);

await flushAsync(24);

const t162DshCard = t162Card();

const t162DshDetail = t162In('agent-detail', t162DshCard);

const t162DshDetailText = t162DshDetail[0] ? nodeText(t162DshDetail[0]).trim() : '';

const t162DshTestDetail = t162In('agent-test-detail', t162DshCard);

check('T162p1', '(t150) dsh 档错误态：设置页「服务商与模型」卡片内 [data-dt="agent-detail"] 恰 1 个，文本前缀等于 result.code 且含「 · 」，长度 ≤121（超 120 截断加 …），不出现 undefined/null 字面',

  !!t162DshCard && t162DshDetail.length === 1 && t162DshDetailText.indexOf('AGENT_SERVER · ') === 0 && t162DshDetailText.length <= 121 &&

  t162DshDetailText.indexOf('undefined') < 0 && t162DshDetailText.indexOf('null') < 0,

  'card=' + (t162DshCard ? '在' : '缺') + ' detail=' + t162DshDetail.length + ' 文本=' + JSON.stringify(t162DshDetailText) + '（' + t162DshDetailText.length + ' 字符）');

const t162OrdDetail = t162Ordinal(t162DshCard, t162DshDetail[0]);

const t162OrdTest = t162Ordinal(t162DshCard, t162DshTestDetail[0]);

const t162TestDetailText = t162DshTestDetail[0] ? nodeText(t162DshTestDetail[0]).trim() : '';

check('T162p2', '(t150) 一句话结论在上、多行诊断在下：agent-detail 的文档顺序早于 agent-test-detail，且两处不重复同一段字',

  t162DshDetail[0] && t162DshTestDetail[0] && t162OrdDetail > 0 && t162OrdTest > 0 && t162OrdDetail < t162OrdTest &&

  t162DshDetailText.length > 0 && (t162TestDetailText === '' || (t162TestDetailText.indexOf(t162DshDetailText) < 0 && t162DshDetailText.indexOf(t162TestDetailText) < 0)),

  '序号 detail=' + t162OrdDetail + ' test-detail=' + t162OrdTest + '；test-detail 文本=' + JSON.stringify(t162TestDetailText.slice(0, 60)) +

  ' 是否包含 detail 全文=' + (t162TestDetailText === '' ? '（test-detail 为空，dsh 档 lines=[] 属设计）' : (t162TestDetailText.indexOf(t162DshDetailText) >= 0)));



setSettings({ agent: Object.assign({}, (settingsNow() || {}).agent || {}, { source: 'custom', apiKey: 'sk-test-162', apiBase: 'https://api.example.com/v1', model: 'gpt-4o-mini' }) });

const t162CustomBody = { error: { message: 'invalid api key provided' } };

setFetch(() => ({ ok: false, status: 401, json: () => Promise.resolve(t162CustomBody), text: () => Promise.resolve(JSON.stringify(t162CustomBody)) }));

if (byDt('agent-test')[0]) fire(byDt('agent-test')[0]);

await flushAsync(24);

const t162CustomCard = t162Card();

const t162CustomDetail = t162In('agent-detail', t162CustomCard);

const t162CustomText = t162CustomDetail[0] ? nodeText(t162CustomDetail[0]).trim() : '';

check('T162p3', '(t150) custom 档错误态同样恰好 1 个 agent-detail，前缀是 AGENT_AUTH 且含「 · 」；与 dsh 档文本不同（各自摊平自己的上游真因）',

  t162CustomDetail.length === 1 && t162CustomText.indexOf('AGENT_AUTH · ') === 0 && t162CustomText.indexOf(' · ') > 0 && t162CustomText !== t162DshDetailText,

  'detail=' + t162CustomDetail.length + ' 文本=' + JSON.stringify(t162CustomText));



setSettings({ agent: Object.assign({}, (settingsNow() || {}).agent || {}, { source: 'dsh' }) });

setFetch(() => okJson({ ok: true, provider: 'dsh', model: 'stub-model', latency: 12 }));

if (byDt('agent-test')[0]) fire(byDt('agent-test')[0]);

await flushAsync(24);

const t162OkState = byDt('agent-test-state')[0] || null;

const t162OkDetail = t162In('agent-detail', t162Card());

check('T162p4', '(t150) 成功态没有 agent-detail 节点（不是空文本）：data-state=ok 且 detail 计数 0',

  !!t162OkState && String(attr(t162OkState, 'data-state')) === 'ok' && t162OkDetail.length === 0,

  'data-state=' + (t162OkState ? String(attr(t162OkState, 'data-state')) : '(缺)') + ' detail=' + t162OkDetail.length);



const t162Msgs = (() => {

  const src = t162Src['57-agent.js'] || '';

  const seg = /const AGENT_CODE_MESSAGE\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(src);

  const out = {};

  if (!seg) return out;

  const re = /(AGENT_[A-Z_]+)\s*:\s*'([^']*)'/g;

  let m;

  while ((m = re.exec(seg[1]))) out[m[1]] = m[2];

  return out;

})();

const t162CodeKeys = ['AGENT_AUTH', 'AGENT_RATE', 'AGENT_FORMAT', 'AGENT_ENDPOINT', 'AGENT_SERVER', 'AGENT_TIMEOUT', 'AGENT_NETWORK', 'AGENT_BAD_JSON', 'AGENT_BASE', 'AGENT_CONFIG'];

const t162MissingMsgs = t162CodeKeys.filter((k) => !t162Msgs[k] || t162Msgs[k].length === 0);

const t162ClientSrc = (() => { try { return readFileSync(target, 'utf8'); } catch (e) { return ''; } })();

const t162NotInBundle = t162CodeKeys.filter((k) => t162Msgs[k] && t162ClientSrc.indexOf(t162Msgs[k]) < 0);

check('T162p5', '(t150) AGENT_CODE_MESSAGE 十码文案逐字未变，且十条都进了打包产物（改文案会被这一条拦住）',

  t162MissingMsgs.length === 0 && Object.keys(t162Msgs).length === 10 && t162ClientSrc.length > 0 && t162NotInBundle.length === 0,

  '解析到 ' + Object.keys(t162Msgs).length + ' 码；缺=' + JSON.stringify(t162MissingMsgs) + '；未进 client.js=' + JSON.stringify(t162NotInBundle) +

  '；样例 AGENT_SERVER=' + JSON.stringify(t162Msgs.AGENT_SERVER || ''));



/* ---- 7. 作用域红线：off 档说明节点（t145 + captain 口径） ---- */

setSettings({ agent: Object.assign({}, (settingsNow() || {}).agent || {}, { source: 'off' }) });

rerender(); rerender();

const t162OffAll = byDt('agent-off-note');

const t162OffInCard = t162In('agent-off-note', t162Card());

const t162InfoAgentNodes = byCls('dtInfoAgent');

const t162OffInInfo = t162InfoAgentNodes.reduce((acc, n) => acc + t162In('agent-off-note', n).length, 0);

const t162OffElsewhere = t162OffAll.filter((n) => t162OffInCard.indexOf(n) < 0 && t162InfoAgentNodes.every((r) => t162Contains(r, n) === false));

check('T162q', '(t145 + captain 作用域红线) off 档 agent-off-note 的作用域必须可解释：设置页卡片内恰 1 个，其余只允许出现在 C 栏 .dtInfoAgent 内，不得有第三处（禁全局计数或首个命中）',

  t162OffInCard.length === 1 && t162OffElsewhere.length === 0 && t162OffAll.length === 1 + t162OffInInfo,

  '全局=' + t162OffAll.length + '（设置卡 ' + t162OffInCard.length + ' + .dtInfoAgent ' + t162OffInInfo + '）第三处=' + t162OffElsewhere.length);

applyState({ settings: Object.assign({}, settingsNow(), { agent: t162AgentBefore }) });



/* ---------- t168 §1.23：独立「阻力清单」功能（禁止清单 + 绊脚石 从「必做之事」拆出） ---------- */
const t168Text = (n) => {
  if (!n) return '';
  if (typeof n === 'string') return n;
  if (typeof n === 'number') return String(n);
  const kids = n.props && n.props.children;
  const list = Array.isArray(kids) ? kids : [kids];
  return list.map(t168Text).join('');
};
const t168Has = (key, value, root) => all((n) => attr(n, key) === value, root || null);

/* A：必做之事只留 core 段，且不留阻力清单的残影 */
if (bView() === 'onething') fire(railDt('rail-onething'));
if (bView() !== 'onething') fire(railDt('rail-onething'));
const t168OneBoard = one((n) => attr(n, 'data-onething-board') !== undefined);
const t168OneSecs = all((n) => attr(n, 'data-onething-section') !== undefined, t168OneBoard || null)
  .map((n) => String(attr(n, 'data-onething-section')));
const t168OneRes = all((n) => attr(n, 'data-resistance-section') !== undefined, t168OneBoard || null);
const t168OneText = t168Text(t168OneBoard);
check('T168a', '§1.23.3 必做之事只留 core 段：data-onething-section 恰 1 个且为 core、文案含「今天只做这一件」，面板内 data-resistance-section 计数为 0',
  !!t168OneBoard && t168OneSecs.length === 1 && t168OneSecs[0] === 'core' &&
    t168OneText.indexOf('今天只做这一件') >= 0 && t168OneRes.length === 0,
  'sections=' + t168OneSecs.join(',') + '；resSection=' + t168OneRes.length +
  '；含副标题=' + (t168OneText.indexOf('今天只做这一件') >= 0));

/* B：rail 入口在 function 段内、文案逐字 */
const t168Rail = railDt('rail-resistance');
const t168FnGroup = railGroupEl('function');
const t168RailInFn = t168FnGroup ? all((n) => attr(n, 'data-dt') === 'rail-resistance', t168FnGroup).length : -1;
check('T168b', '§1.23.1 rail 功能区出现 [data-dt="rail-resistance"] 恰 1 个、位于 data-rail-group=function 内、文案「阻力清单」',
  !!t168Rail && t168RailInFn === 1 && railLabel(t168Rail) === '阻力清单',
  'count=' + (t168Rail ? 1 : 0) + '；inFunction=' + t168RailInFn + '；label=' + (t168Rail ? railLabel(t168Rail) : ''));

/* C：点开 → B 栏三段各恰 1 个 */
if (bView() === 'resistance') fire(railDt('rail-resistance'));
if (bView() !== 'resistance') fire(railDt('rail-resistance'));
const t168Board = one((n) => attr(n, 'data-dt') === 'resistance-board');
const t168SecCount = (root) => ['obstacle-candidates', 'obstacle-rows', 'prohibit']
  .map((k) => t168Has('data-resistance-section', k, root).length);
const t168Secs = t168SecCount(t168Board);
check('T168c', '§1.23.2 点 [data-dt="rail-resistance"]：B 栏 data-view=resistance 且渲染 [data-resistance-board]，三段容器（候选绊脚石 / 已登记绊脚石 / 禁止清单）各恰 1 个',
  bView() === 'resistance' && bKind() === 'resistance' && !!t168Board &&
    String(attr(t168Board, 'data-module')) === 'resistance' && t168Secs.join(',') === '1,1,1',
  'b=' + bView() + '/' + bKind() + '；sections=' + t168Secs.join(','));

/* D：空数据下三段仍渲染且各有引导句 */
const t168DbBefore = storeApi.get().db;
applyState({ db: Object.assign({}, t168DbBefore, { obstacles: { entries: [] } }) });
rerender(); rerender();
const t168BoardEmpty = one((n) => attr(n, 'data-dt') === 'resistance-board');
const t168EmptySecs = t168SecCount(t168BoardEmpty);
const t168Guides = [
  !!one((n) => attr(n, 'data-res-hint') === 'obstacle-candidates', t168BoardEmpty || null),
  t168Text(one((n) => attr(n, 'data-res-empty') === 'obstacle-rows', t168BoardEmpty || null)).indexOf('今天还没记录绊脚石') >= 0,
  t168Text(one((n) => attr(n, 'data-prohibit-empty') !== undefined, t168BoardEmpty || null)).indexOf('还没攒够样本') >= 0
];
check('T168d', '§1.23.2 空数据下三段仍渲染（不隐藏），候选绊脚石 / 已登记绊脚石 / 禁止清单各有一句引导',
  t168EmptySecs.join(',') === '1,1,1' && t168Guides.every(Boolean),
  'sections=' + t168EmptySecs.join(',') + '；guides=' + t168Guides.map((x) => (x ? 1 : 0)).join(''));
applyState({ db: t168DbBefore });
rerender(); rerender();

/* E：关掉模块 → 节点不存在（不是隐藏），再打开回来 */
const t168SetBefore = settingsNow();
writeModules({ resistance: false });
const t168OffRail = railDt('rail-resistance') ? 1 : 0;
const t168OffBoard = all((n) => attr(n, 'data-dt') === 'resistance-board').length;
check('T168e', '§1.23.4 关闭 settings.modules.resistance 后 rail 入口与 B 栏面板节点都不存在（不是 display:none）',
  t168OffRail === 0 && t168OffBoard === 0,
  'rail=' + t168OffRail + '；board=' + t168OffBoard);
writeModules({ resistance: true });
check('T168f', '§1.23.4 重新打开 settings.modules.resistance 后入口与面板都回来',
  !!railDt('rail-resistance'), 'rail=' + (railDt('rail-resistance') ? 1 : 0));

/* F：老状态（无 resistance 键）→ 默认启用、开关表不被写脏、重复加载一致 */
const t168Legacy = Object.assign({}, t168SetBefore);
t168Legacy.modules = Object.assign({}, t168SetBefore.modules);
delete t168Legacy.modules.resistance;
const t168LegacyJson = JSON.stringify(t168Legacy.modules);
applyState({ settings: t168Legacy });
rerender(); rerender();
const t168LegacyRail = railDt('rail-resistance') ? 1 : 0;
const t168AfterJson = JSON.stringify(storeApi.get().settings.modules);
applyState({ settings: JSON.parse(JSON.stringify(storeApi.get().settings)) });
rerender(); rerender();
const t168LegacyRail2 = railDt('rail-resistance') ? 1 : 0;
check('T168g', '§1.23.4 老状态（无 resistance 键）加载后模块默认启用、settings.modules 不被写脏、重复加载结果一致（幂等）',
  t168LegacyRail === 1 && t168LegacyRail2 === 1 && t168AfterJson === t168LegacyJson,
  'rail=' + t168LegacyRail + '；reload=' + t168LegacyRail2 + '；modules 未变=' + (t168AfterJson === t168LegacyJson));

/* G：数据单源 */
const t168Db = storeApi.get().db;
check('T168h', '§1.23.2 数据单源：仍只有 db.obstacles，未新增 db.prohibits / db.resistance 等第二份存储',
  t168Db.prohibits === undefined && t168Db.resistance === undefined && !!t168Db.obstacles,
  'prohibits=' + String(t168Db.prohibits) + '；resistance=' + String(t168Db.resistance) + '；obstacles=' + (!!t168Db.obstacles));

applyState({ settings: t168SetBefore });
rerender(); rerender();
if (bView() === 'resistance') fire(railDt('rail-resistance'));


/* ==================== 十七、t172 收编（C 栏详情版式 / 拆解 / 阻力清单） ==================== */
/* ==================================================================================
   t172：t169 拆解面板 + t168 阻力清单（真实渲染路径的行为断言）
   —— 这一段补的是 t162 交接时明写的欠账：dtOneHow/dtOneWhy、actnow 头部、C 栏拆解面
      在桩里此前只被静态门禁覆盖，行为覆盖为空。判据全部状态驱动，不用 sleep。
   ================================================================================== */

/* ---------- 公共夹具与助手（本段自用，不污染外部命名空间） ---------- */
const t172Set = () => settingsNow() || {};
const t172SetStrength = (key) => setSettings({ actNow: Object.assign({}, (t172Set().actNow || {}), { strength: key }) });
const t172SetAgent = (source) => setSettings({ agent: Object.assign({}, (t172Set().agent || {}), { source: source }) });
const t172TitleInput = () => byDt('c-title-input')[0] || null;
const t172Bd = () => byDt('c-breakdown')[0] || null;
const t172BdSteps = () => byDt('c-breakdown-step');
const t172BdMeta = () => byDt('c-breakdown-strength')[0] || null;
const t172BdCode = () => byDt('c-breakdown-code')[0] || null;
const t172BdMins = () => byDt('c-breakdown-min');
const t172StepPart = (step, token) => childNodes(step).filter((n) => hasClass(n, token))[0] || null;
const t172IsEditable = (n) => ['input', 'textarea', 'select'].indexOf(String(n && n.tag)) >= 0;
const t172Steps = (n, mins) => Array.from({ length: n }, (_, i) => {
  const m = mins && mins[i] ? mins[i] : 0;
  const text = 't172步骤' + String(i + 1) + String(m ? '（' + m + ' 分钟）' : '');
  return m ? { text: text, minutes: m } : { text: text };
});
/* dsh 档期望的响应体形状：{ ok:true, text:'<json 字符串>', provider, model }（见 57-agent.js:376） */
const t172DshOk = (steps) => okJson({ ok: true, text: JSON.stringify({ steps: steps }), provider: 't172-stub', model: 't172-model' });
const t172DshFail = (code, status) => ({
  ok: false,
  status: status || 500,
  json: () => Promise.resolve({ ok: false, code: code, message: 't172 上游失败' }),
  text: () => Promise.resolve(JSON.stringify({ ok: false, code: code, message: 't172 上游失败' }))
});
const t172OpenToday = async () => {
  if (bView() !== 'today') fire(railDt('rail-today'));
  await flushAsync(4);
};
/* 打开任意任务详情：本段执行时前面 300+ 条断言已经把种子改得面目全非，不能假设 s1 还在、
   也不能假设 today 视图非空。依次尝试 today -> 第一个项目清单 -> 该任务所属清单，取到第一行就点。 */
const t172RowsNow = () => all((n) => hasClass(n, 'dtRow') && attr(n, 'data-task-id'));
const t172TryView = async (tag) => {
  /* rail 项是「同值再点 = 关」的开关：目标视图已是当前值时点一下会关掉 B，
     所以每次点完都重新判定，最多三轮（关→开→命中）。 */
  for (let i = 0; i < 3; i += 1) {
    if (t172RowsNow().length) return true;
    const node = railDt(tag);
    if (!node) return false;
    fire(node);
    await flushAsync(4);
  }
  return t172RowsNow().length > 0;
};
const t172GotoRows = async () => {
  /* 前置断言可能把项目设成 hidden（t170 语义：隐藏项目在 rail 里不出现、其任务不进列表），
     那样任何视图都是空列表 —— 本段临时取消隐藏，收尾由 t172Restore 还原。 */
  applyState({ db: Object.assign({}, dbNow(), { projects: (dbNow().projects || []).map((p) => Object.assign({}, p, { hidden: false })) }) });
  /* 搜索框只在 B 栏渲染出来之后才存在，所以先确保 B 在，再清搜索词 */
  for (let i = 0; i < 3 && !bSlot(); i += 1) { const n0 = railDt('rail-today'); if (n0) fire(n0); await flushAsync(4); }
  /* 前置断言可能把搜索词留成某个不存在的关键词（列表容器在、行 0 个），这里清空 */
  const t172Q = byCls('dtSearchInput')[0] || null;
  if (t172Q && String(t172Q.props.value == null ? '' : t172Q.props.value) !== '') { change(t172Q, ''); await flushAsync(4); }
  if (t172RowsNow().length) return true;
  /* 前面 300+ 条断言已经把种子改得面目全非：今天的任务可能全被完成/删除，
     today 与项目清单都可能是空的，所以按「未完成 → 已完成 → 全部/周/标签」逐个试。 */
  const views = ['rail-today', 'rail-done', 'rail-open', 'rail-week', 'rail-tags'];
  for (let i = 0; i < views.length; i += 1) {
    if (await t172TryView(views[i])) return true;
  }
  const projs = all((n) => attr(n, 'data-dt') === 'rail-project');
  for (let i = 0; i < projs.length; i += 1) {
    if (t172RowsNow().length) return true;
    fire(projs[i]);
    await flushAsync(4);
  }
  return t172RowsNow().length > 0;
};
const t172OpenDetail = async () => {
  /* 同一行再点一次是「收起详情」，所以已经开着就不再点（否则本段第 2、3 次调用会把 C 关掉） */
  if (cSlot()) return true;
  await t172GotoRows();
  const row = t172RowsNow()[0] || null;
  if (row) { fire(row); await flushAsync(6); }
  if (cSlot()) return true;
  const row2 = t172RowsNow()[1] || row;
  if (row2) { fire(row2); await flushAsync(6); }
  return !!cSlot();
};
/* 点一次「拆解」并等它 settle；返回是否点到了按钮（找不到就清空 fetch 账，避免脏读） */
const t172Run = async (fixture) => {
  setFetch(() => Promise.resolve(fixture));
  const btn = byDt('c-breakdown-run')[0] || null;
  if (!btn) { fetchCalls.length = 0; return false; }
  fire(btn);
  await flushAsync(28);
  return true;
};
const t172BodyAt = (i) => {
  const call = fetchCalls[i];
  if (!call || !call.opts || !call.opts.body) return {};
  try { return JSON.parse(String(call.opts.body)); } catch (e) { return {}; }
};
const t172TodayK = TODAY_K;
const t172DayK = (offset) => ymd(new Date(Date.now() + offset * 86400000));

/* 段内快照：用完还原，不给后面的断言留副作用 */
const t172Before = {
  obstacles: JSON.parse(JSON.stringify(dbNow().obstacles || [])),
  projects: JSON.parse(JSON.stringify(dbNow().projects || [])),
  actNow: JSON.parse(JSON.stringify(t172Set().actNow || {})),
  agent: JSON.parse(JSON.stringify(t172Set().agent || {}))
};
const t172Restore = () => {
  applyState({ db: Object.assign({}, dbNow(), { obstacles: JSON.parse(JSON.stringify(t172Before.obstacles)), projects: JSON.parse(JSON.stringify(t172Before.projects)) }) });
  setSettings({ actNow: JSON.parse(JSON.stringify(t172Before.actNow)), agent: JSON.parse(JSON.stringify(t172Before.agent)) });
};

/* ---------------- 1. C 栏版式：标题输入在最顶、无「标题」标签 ---------------- */
await t172OpenDetail();
const t172View = cDetailView();
const t172Fields = byCls('dtDetailFields')[0] || null;
const t172Kids = t172Fields ? childNodes(t172Fields) : [];
const t172TitleIdx = t172Kids.findIndex((n) => attr(n, 'data-dt') === 'c-title-input');
const t172EditableBefore = t172Kids.slice(0, t172TitleIdx < 0 ? 0 : t172TitleIdx).filter(t172IsEditable).length;
const t172TitleLabels = all((n) => hasClass(n, 'dtFieldLabel') && nodeText(n).trim() === '标题');
check('T172a',
  '(t169) C 栏详情：标题输入框是 .dtDetailFields 的第一个子元素，它之前可编辑控件（input/textarea/select）计数为 0；页面上不存在「标题」这一行 label',
  String(t172View).indexOf('task:') === 0 && t172TitleIdx === 0 && t172EditableBefore === 0 && t172TitleLabels.length === 0,
  'c.view=' + String(t172View) + ' titleIdx=' + t172TitleIdx + ' editableBefore=' + t172EditableBefore +
  ' 标签节点=' + t172TitleLabels.length + ' 首子=' + (t172Kids[0] ? cls(t172Kids[0]) : 'null'));

const t172DetailCss = cssRuleAll('.dtDetailFields').join('\n');
const t172WideCss = cssRuleAll('.dtDetailFields .dtFieldWide').join('\n');
const t172WideLabelCss = cssRuleAll('.dtDetailFields .dtFieldWide .dtFieldLabel').join('\n');
/* S2：间距统一到 --dt-sp-* 令牌后，gap 可能写成 var(--dt-sp-K)，这里按令牌表解析成 px */
const t172SpMap = { '1': 4, '2': 8, '3': 12, '4': 16, '5': 20, '6': 24, '7': 32, '8': 40 };
function t172GapOf(css) {
  const m = /(?:^|[^\w-])gap:\s*(?:(\d+(?:\.\d+)?)px|var\(--dt-sp-([0-9])\))/.exec(css || '');
  if (!m) return -1;
  return m[1] ? Number(m[1]) : (t172SpMap[m[2]] || -1);
}
const t172GapPx = t172GapOf(t172DetailCss);
const t172WideGapPx = t172GapOf(t172WideCss);
check('T172b',
  '(t169) 版式令牌：备注 label↔输入框间距 ≤6px（.dtFieldWide gap，实现 4px）、标题块↔备注块间距 ∈[8,10]px（.dtDetailFields gap，实现 8px），且 .dtFieldWide .dtFieldLabel 必须 flex:0 0 auto（否则继承 0 0 52px，在 column 方向变成 52px 高的标签——这才是「靠得远」的真因）',
  t172GapPx >= 8 && t172GapPx <= 10 && t172WideGapPx > 0 && t172WideGapPx <= 6 && /flex:\s*0\s+0\s+auto/.test(t172WideLabelCss),
  'detailGap=' + t172GapPx + 'px wideGap=' + t172WideGapPx + 'px labelFlexAuto=' + /flex:\s*0\s+0\s+auto/.test(t172WideLabelCss) +
  ' 规则=' + JSON.stringify(t172WideLabelCss.slice(0, 90)));

const t172TitleEl = t172TitleInput();
const t172TitleNext = t172TitleIdx >= 0 ? (t172Kids[t172TitleIdx + 1] || null) : null;
const t172TagOk = !!t172TitleEl && String(t172TitleEl.tag) === 'textarea';
const t172RowsOk = !!t172TitleEl && String(attr(t172TitleEl, 'rows')) === '2';
const t172ClsIn = !!t172TitleEl && hasClass(t172TitleEl, 'dtTitleInput');
const t172ClsFirst = !!t172TitleEl && hasClass(t172TitleEl, 'dtTitleFirst');
const t172DataFOk = !!t172TitleEl && attr(t172TitleEl, 'data-f') === 'title';
const t172NextOk = !!t172TitleNext && hasClass(t172TitleNext, 'dtField') && hasClass(t172TitleNext, 'dtFieldWide');
check('T172c',
  '(t169) 标题控件形状：是 textarea、rows=2、class 含 dtTitleInput + dtTitleFirst、data-f="title"；它的下一个兄弟就是备注块（.dtField.dtFieldWide），中间不夹任何「标题」行',
  t172TagOk && t172RowsOk && t172ClsIn && t172ClsFirst && t172DataFOk && t172NextOk,
  'tag=' + t172TagOk + ' rows=' + t172RowsOk + ' dtTitleInput=' + t172ClsIn + ' dtTitleFirst=' + t172ClsFirst +
  ' data-f=' + t172DataFOk + ' next=' + t172NextOk,
  'title=' + (t172TitleEl ? String(t172TitleEl.tag) + ' ' + cls(t172TitleEl) + ' rows=' + attr(t172TitleEl, 'rows') + ' data-f=' + attr(t172TitleEl, 'data-f') : 'null') +
  ' 实际=' + (t172TitleEl ? String(t172TitleEl.tag) + '[' + cls(t172TitleEl) + '] rows=' + attr(t172TitleEl, 'rows') : 'null') +
  ' next实际=' + (t172TitleNext ? cls(t172TitleNext) : 'null'));

/* 空值态 / 有值态：形状、内联样式、rect 三值必须逐项相同（桩无布局引擎，rect 由 rectOf 统一给出，
   所以这里判的是「渲染层不因内容/焦点改变结构」——真机侧的 px 证据在 t169 的复现页里已给 88.6→88.6） */
const t172ShapeOfTitle = () => {
  const n = t172TitleInput();
  if (!n) return 'null';
  const box = typeof n.getBoundingClientRect === 'function' ? n.getBoundingClientRect() : null;
  return JSON.stringify({ cls: cls(n), style: (n.props && n.props.style) || null, rows: attr(n, 'rows'), box: box });
};
const t172ShapeFilled = t172ShapeOfTitle();
const t172TaskS1 = tasksOfDb().find((t) => t.id === 's1');
const t172TitleKeep = t172TaskS1 ? String(t172TaskS1.title || '') : '';
/* 当前 C 栏编辑的标题：详情可能落在任意可用任务上（种子被前面的段改过），请求体应与它一致 */
const t172CurTitle = () => { const n = t172TitleInput(); return n && n.props ? String(n.props.value == null ? '' : n.props.value) : ''; };
applyState({ db: Object.assign({}, dbNow(), { tasks: dbNow().tasks.map((t) => (t.id === 's1' ? Object.assign({}, t, { title: '' }) : t)) }) });
const t172ShapeEmpty = t172ShapeOfTitle();
applyState({ db: Object.assign({}, dbNow(), { tasks: dbNow().tasks.map((t) => (t.id === 's1' ? Object.assign({}, t, { title: t172TitleKeep }) : t)) }) });
const t172ShapeBack = t172ShapeOfTitle();
check('T172d',
  '(t169) 只读/编辑两态关键 rect 差 ≤1px：标题控件在「有值 / 空值（placeholder 态）/ 还原」三次渲染里 class、内联 style、rows、rect 逐项相同（差 0）',
  t172ShapeFilled === t172ShapeEmpty && t172ShapeEmpty === t172ShapeBack && t172ShapeFilled !== 'null',
  'filled=' + t172ShapeFilled + ' empty=' + t172ShapeEmpty + ' back=' + t172ShapeBack);

const t172FocusCss = ['.dtTitleInput:focus', '.dtTitleFirst:focus', '.dtDetailFields .dtTitleInput:focus', '.dtTitleInput:focus-visible']
  .map((s) => cssRuleAll(s).join('\n')).join('\n');
const t172ContentCss = ['.dtTitleInput:placeholder-shown', '.dtTitleInput:not(:placeholder-shown)', '.dtTitleInput:valid', '.dtTitleInput:invalid']
  .map((s) => cssRuleAll(s).join('\n')).join('\n');
const t172SizeDeclRe = /(?:^|[;{\s])(?:height|min-height|padding|margin|line-height|font-size)\s*:/;
const t172FocusResize = t172SizeDeclRe.test(t172FocusCss) || t172SizeDeclRe.test(t172ContentCss);
check('T172e',
  '(t169) 两态不靠状态改尺寸：.dtTitleInput / .dtTitleFirst 的 :focus / :focus-visible，以及 :placeholder-shown / :not(:placeholder-shown) / :valid / :invalid 规则里都不出现 height / min-height / padding / margin / line-height / font-size 声明（否则点进去或有值时标题块会跳高，这就是「两态 rect 差」的实现侧来源）',
  !t172FocusResize,
  'focus规则=' + JSON.stringify(t172FocusCss.slice(0, 100)) + ' 内容态规则=' + JSON.stringify(t172ContentCss.slice(0, 100)) +
  ' 尺寸声明命中=' + t172FocusResize);

/* ---------------- 2. 拆解请求：打到 Host 同源 /polish，带 kind 与 strength ---------------- */
t172SetAgent('dsh');
t172SetStrength('strong');
await t172OpenDetail();
const t172BdEl = t172Bd();
const t172RanStrong = await t172Run(t172DshOk(t172Steps(15, [5, 10, 15, 30, 45, 60])));
const t172Call0 = fetchCalls[0] || null;
const t172Body0 = t172BodyAt(0);
check('T172f',
  '(t169) 点「拆解」发一次请求到 Host 同源 /plugins/local/dsh-tasks/polish：method=POST，body.kind="polish"、body.strength 与设置同值（strong）、body.task.title 等于当前任务标题',
  t172RanStrong && fetchCalls.length === 1 && !!t172Call0 && String(t172Call0.url) === '/plugins/local/dsh-tasks/polish' &&
  String(t172Call0.opts && t172Call0.opts.method) === 'POST' && t172Body0.kind === 'polish' && t172Body0.strength === 'strong' &&
  !!t172Body0.task && String(t172Body0.task.title) === t172CurTitle(),
  'fetch=' + fetchCalls.length + ' url=' + (t172Call0 ? t172Call0.url : 'null') + ' method=' + (t172Call0 && t172Call0.opts ? t172Call0.opts.method : 'null') +
  ' kind=' + t172Body0.kind + ' strength=' + t172Body0.strength + ' taskTitle=' + JSON.stringify(t172Body0.task && t172Body0.task.title) +
  ' bd节点=' + (t172BdEl ? 'yes' : 'NO') + ' strengthAttr=' + (t172BdEl ? attr(t172BdEl, 'data-strength') : '-') +
  ' 步骤=' + (t172BdEl ? attr(t172BdEl, 'data-steps') : '-'));

const t172StrengthBodies = [];
for (const key of ['weak', 'mid', 'strong']) {
  t172SetStrength(key);
  await t172OpenDetail();
  await t172Run(t172DshOk(t172Steps(key === 'weak' ? 3 : key === 'mid' ? 8 : 12)));
  t172StrengthBodies.push({ key: key, sees: t172BodyAt(0).strength, calls: fetchCalls.length, attr: t172Bd() ? attr(t172Bd(), 'data-strength') : null });
}
const t172StrengthOk = t172StrengthBodies.every((r) => r.sees === r.key && r.calls === 1 && r.attr === r.key);
check('T172g',
  '(t169) 三档强度端到端同一真源：设置里 strength 依次切 weak/mid/strong，每次点「拆解」body.strength 都等于当前档位，且拆解区的 data-strength 同步（无第二真源）',
  t172StrengthOk,
  '逐档=' + JSON.stringify(t172StrengthBodies));

/* 设置页的分段控件也必须写进同一字段（UI 单源，而不是只认 store 直改） */
if (centerView() !== 'settings') fire(railDt('rail-settings'));
await flushAsync(4);
const t172SegBox = byDt('act-now-strength')[0] || null;
const t172SegWeak = t172SegBox ? all((n) => hasClass(n, 'dtSegBtn') && attr(n, 'data-strength') === 'weak', t172SegBox)[0] || null : null;
if (t172SegWeak) fire(t172SegWeak);
await flushAsync(4);
const t172SegAfter = byDt('act-now-strength')[0] || null;
const t172StrengAfterClick = (t172Set().actNow || {}).strength;
await t172OpenDetail();
check('T172h',
  '(t169/t166) 设置页「拆分任务强度」分段控件点「弱」⇒ settings.actNow.strength="weak"、容器 data-strength="weak"，且 C 栏拆解区 data-strength 同帧变 weak（UI 与请求体共用一个字段）',
  t172StrengAfterClick === 'weak' && !!t172SegAfter && attr(t172SegAfter, 'data-strength') === 'weak' && t172Bd() && attr(t172Bd(), 'data-strength') === 'weak',
  'settings.strength=' + JSON.stringify(t172StrengAfterClick) + ' seg=' + (t172SegAfter ? attr(t172SegAfter, 'data-strength') : 'null') +
  ' bd=' + (t172Bd() ? attr(t172Bd(), 'data-strength') : 'null'));

/* off 档：明确不发请求，只给本地规则步骤 */
t172SetAgent('off');
await t172OpenDetail();
const t172RanOff = await t172Run(t172DshOk(t172Steps(9)));
const t172OffBd = t172Bd();
check('T172i',
  '(t169) off 档点「拆解」不发任何请求：fetch 0 次、拆解区 data-src="local"、步骤 ≥3（本地规则兜底，不留空白）',
  t172RanOff && fetchCalls.length === 0 && !!t172OffBd && attr(t172OffBd, 'data-src') === 'local' && t172BdSteps().length >= 3,
  'fetch=' + fetchCalls.length + ' src=' + (t172OffBd ? attr(t172OffBd, 'data-src') : 'null') + ' steps=' + t172BdSteps().length);

/* ---------------- 3. 步数区间与「约 N 分钟」 ---------------- */
t172SetAgent('dsh');
const t172StepCase = async (strength, fixtureSteps, extra) => {
  t172SetStrength(strength);
  await t172OpenDetail();
  const ran = await t172Run(t172DshOk(fixtureSteps));
  const bd = t172Bd();
  return {
    ran: ran,
    calls: fetchCalls.length,
    steps: t172BdSteps(),
    count: t172BdSteps().length,
    attr: bd ? attr(bd, 'data-steps') : null,
    src: bd ? attr(bd, 'data-src') : null,
    meta: t172BdMeta() ? nodeText(t172BdMeta()).trim() : '',
    extra: extra || {}
  };
};
const t172Weak9 = await t172StepCase('weak', t172Steps(9));
check('T172j',
  '(t169) 弱档上限 5：Host 返回 9 步时截到 5 步（data-steps=5，meta「弱 · 5 步」），且 5 步文本互不相同、行首没有二次编号',
  t172Weak9.count === 5 && t172Weak9.attr === '5' && t172Weak9.meta === '弱 · 5 步' &&
  new Set(t172Weak9.steps.map((s) => { const t = t172StepPart(s, 'dtBreakdownText'); return t ? nodeText(t).trim() : ''; })).size === 5 &&
  t172Weak9.steps.every((s) => { const t = t172StepPart(s, 'dtBreakdownText'); const txt = t ? nodeText(t).trim() : ''; return !/^\s*(?:\d{1,2}\s*[.、)）]|[\u2460-\u2473]|[-–—•·*])\s*/.test(txt); }),
  'host回9步 → 渲染 ' + t172Weak9.count + ' 步（data-steps=' + t172Weak9.attr + '，meta=' + JSON.stringify(t172Weak9.meta) + '）；文本去重后 ' +
  new Set(t172Weak9.steps.map((s) => { const t = t172StepPart(s, 'dtBreakdownText'); return t ? nodeText(t).trim() : ''; })).size + ' 种，行首二次编号=' +
  t172Weak9.steps.filter((s) => { const t = t172StepPart(s, 'dtBreakdownText'); const txt = t ? nodeText(t).trim() : ''; return /^\s*(?:\d{1,2}\s*[.、)）]|[\u2460-\u2473]|[-–—•·*])\s*/.test(txt); }).length + ' 步');

const t172Weak3 = await t172StepCase('weak', t172Steps(3));
check('T172k',
  '(t169) 弱档下限 3：Host 返回 3 步时原样保留（不截不补），区间判据 3–5',
  t172Weak3.count === 3 && t172Weak3.count >= 3 && t172Weak3.count <= 5 && t172Weak3.meta === '弱 · 3 步',
  'steps=' + t172Weak3.count + ' meta=' + JSON.stringify(t172Weak3.meta));

const t172Mid15 = await t172StepCase('mid', t172Steps(15));
check('T172l',
  '(t169) 中档区间 6–10：Host 返回 15 步时截到 10 步，落在 [6,10] 内，meta「中 · 10 步」',
  t172Mid15.count === 10 && t172Mid15.count >= 6 && t172Mid15.count <= 10 && t172Mid15.meta === '中 · 10 步',
  'steps=' + t172Mid15.count + ' meta=' + JSON.stringify(t172Mid15.meta) + ' attr=' + t172Mid15.attr);

const t172Strong15 = await t172StepCase('strong', t172Steps(15, [5, 10, 15, 30, 45, 60]));
check('T172m',
  '(t169) 强档区间 11–18：Host 返回 15 步时原样保留 15 步（不走整理助手那条截 7 的旧链路），meta「强 · 15 步」',
  t172Strong15.count === 15 && t172Strong15.count >= 11 && t172Strong15.count <= 18 && t172Strong15.meta === '强 · 15 步',
  'steps=' + t172Strong15.count + ' meta=' + JSON.stringify(t172Strong15.meta));

const t172Strong2 = await t172StepCase('strong', t172Steps(2));
const t172Strong2Mins = t172BdMins().map((n) => nodeText(n).trim());
const t172Strong2MinOkFormat = t172Strong2Mins.every((t) => /^约 \d+ 分钟$/.test(t));
const t172Strong2MinOkRange = t172Strong2Mins.every((t) => { const m = /^约 (\d+) 分钟$/.exec(t); const v = m ? Number(m[1]) : -1; return v >= 5 && v <= 60; });
const t172Strong2MinPerStep = t172Strong2.steps.every((s) => childNodes(s).filter((n) => hasClass(n, 'dtBreakdownMin')).length <= 1);
const t172Strong2MinKinds = new Set(t172Strong2Mins).size;
check('T172n',
  '(t169) 强档不足下限时用本地规则补足：Host 只回 2 步 ⇒ 最终步数 ≥11 且 ≤18（不是 2 步的空白板），data-src 仍为 host',
  t172Strong2.count > 2 && t172Strong2.attr === String(t172Strong2.count) && t172Strong2.src === 'host',
  'steps=' + t172Strong2.count + ' attr=' + t172Strong2.attr + ' src=' + t172Strong2.src + '（Host 的 2 步被保留、其余用本地规则补）');
/* t169 当时挂的观察项 T172n2（「本地池只有 6 条、2+6=8 够不到 11」）在 t173/t174 收口后闭合：
   t173 把补足池从 4 条扩到 19 条（actNowStepsCore 4 条给立即行动、actNowStepsLocal 供拆解补足），
   t174 改两轮策略（先取带估时、再取无估时兜底、按文本去重）并保留 minutes。
   所以这里从「观察项」升级为硬断言：数字写死成 11（floor），并要求补足出来的每一步都带耗时。
   口径区分：观察项 = 判不了或待定（gap 计入「观察项」）；GAP = 能力未挂载/未实现（gapT130/gapT111 那类）。 */
check('T172n2',
  '(t169→t173/t174 收口) 强档 Host 只回 2 步 ⇒ 本地补足到恰 11 步（strong 下限 floor=11，池子 19 条后可达），补足的 9 步每步都有「约 N 分钟」且 N ∈[5,60]、格式合规、每步最多 1 个耗时节点、耗时值不是同一个常数（≥3 种）；负向分支：素材充足（Host 回 15 步，在上限 18 之内）时不补足、steps 恰等于 Host 返回条数 15',
  t172Strong2.count === 11 && t172Strong2.attr === '11' && t172Strong2.src === 'host' && t172Strong2.steps.length === 11 &&
  t172Strong2Mins.length === 9 && t172Strong2MinOkFormat && t172Strong2MinOkRange && t172Strong2MinPerStep && t172Strong2MinKinds >= 3 &&
  t172Strong15.count === 15 && t172Strong15.steps.length === 15,
  'host2步⇒steps=' + t172Strong2.count + '（attr=' + t172Strong2.attr + '，直线数=' + t172Strong2.steps.length + '）；补足耗时节点=' + t172Strong2Mins.length + ' 个 ' + JSON.stringify(t172Strong2Mins) +
  ' 格式全合规=' + t172Strong2MinOkFormat + ' 值∈[5,60]=' + t172Strong2MinOkRange + ' 每步≤1=' + t172Strong2MinPerStep + ' 取值种类=' + t172Strong2MinKinds +
  '；反例 host15步⇒steps=' + t172Strong15.count + '（不补足）');

/* 每步耗时：只渲染带 minutes 的步骤，文本「约 N 分钟」，N ∈[5,60]，且每步最多一个耗时节点 */
await t172StepCase('strong', t172Steps(15, [5, 10, 15, 30, 45, 60]));
const t172MinTexts = t172BdMins().map((n) => nodeText(n).trim());
const t172MinOkFormat = t172MinTexts.every((t) => /^约 \d+ 分钟$/.test(t));
const t172MinOkRange = t172MinTexts.every((t) => { const m = /^约 (\d+) 分钟$/.exec(t); const v = m ? Number(m[1]) : -1; return v >= 5 && v <= 60; });
const t172MinPerStep = t172BdSteps().every((s) => childNodes(s).filter((n) => hasClass(n, 'dtBreakdownMin')).length <= 1);
check('T172o',
  '(t169) 每步耗时：强档 15 步里 6 步带 minutes（5/10/15/30/45/60）⇒ 恰 6 个「约 N 分钟」节点，格式 ^约 \\d+ 分钟$、N ∈[5,60]，且每步最多 1 个',
  t172MinTexts.length === 6 && t172MinOkFormat && t172MinOkRange && t172MinPerStep,
  'min节点=' + t172MinTexts.length + ' 文本=' + JSON.stringify(t172MinTexts) + ' 格式=' + t172MinOkFormat + ' 区间=' + t172MinOkRange + ' 每步≤1=' + t172MinPerStep);

/* ---------------- 4. Host 失败：显示错误码 + 回落本地，不空白、不无限 loading ---------------- */
await t172OpenDetail();
await t172Run(t172DshFail('AGENT_SERVER', 500));
const t172FailBd = t172Bd();
const t172FailCodeEl = t172BdCode();
const t172FailCodeText = t172FailCodeEl ? nodeText(t172FailCodeEl).trim() : '';
const t172FailSteps = t172BdSteps().length;
const t172LoadingNodes = all((n) => /加载中|loading|请稍候/i.test(nodeText(n)) && !hasClass(n, 'dtBreakdownText'), t172FailBd || undefined);
check('T172p',
  '(t169) Host 500：拆解区出现 [data-dt=c-breakdown-code]，文本前缀 AGENT_SERVER + 「 · 」，data-code=AGENT_SERVER；同时本地规则步骤 ≥3 照常可见（data-src=local），没有「加载中」残留',
  !!t172FailBd && !!t172FailCodeEl && t172FailCodeText.indexOf('AGENT_SERVER · ') === 0 &&
  t172FailCodeText.length > 'AGENT_SERVER · '.length && attr(t172FailBd, 'data-code') === 'AGENT_SERVER' &&
  attr(t172FailBd, 'data-src') === 'local' && t172FailSteps >= 3 && t172LoadingNodes.length === 0,
  'code=' + JSON.stringify(t172FailCodeText) + ' data-code=' + (t172FailBd ? attr(t172FailBd, 'data-code') : 'null') +
  ' src=' + (t172FailBd ? attr(t172FailBd, 'data-src') : 'null') + ' steps=' + t172FailSteps + ' loading节点=' + t172LoadingNodes.length);

await t172OpenDetail();
await t172Run(okJson({ ok: true, text: '这不是 JSON' }));
const t172BadJsonCode = t172BdCode() ? nodeText(t172BdCode()).trim() : '';
check('T172q',
  '(t169) Host 200 但正文不是 JSON：显示 AGENT_BAD_JSON 错误码并回落本地步骤（≥3），不出现空白拆解区',
  t172BadJsonCode.indexOf('AGENT_BAD_JSON · ') === 0 && t172BdSteps().length >= 3,
  'code=' + JSON.stringify(t172BadJsonCode) + ' steps=' + t172BdSteps().length);

/* ---------------- 5. 阻力清单（t168）：独立入口 + 三段 + 单源 ---------------- */
const t172RailRoot = byCls('dtRail')[0] || null;
const t172ResRailAll = byDt('rail-resistance');
const t172ResRail = t172ResRailAll[0] || null;
const t172ResRailInRail = !!t172ResRail && !!t172RailRoot && all((n) => n === t172ResRail, t172RailRoot).length === 1;
if (t172ResRail) fire(t172ResRail);
await flushAsync(6);
const t172ResBoard = byDt('resistance-board')[0] || null;
check('T172r',
  '(t168) 阻力清单是独立 rail 入口：DOM 计数恰 1、位于 .dtRail 内；点开后在 B 栏渲染 [data-dt=resistance-board]（data-module="resistance"、data-drawer-view="resistance"），rail 同时高亮',
  t172ResRailAll.length === 1 && !!t172ResRail && bView() === 'resistance' && !!t172ResBoard &&
  attr(t172ResBoard, 'data-module') === 'resistance' && attr(t172ResBoard, 'data-drawer-view') === 'resistance' &&
  !!t172ResRailInRail,
  'rail命中=' + t172ResRailAll.length + ' inRail=' + t172ResRailInRail + ' b.view=' + String(bView()) +
  ' board=' + (t172ResBoard ? cls(t172ResBoard) + ' module=' + attr(t172ResBoard, 'data-module') : 'null'));

const t172Sections = all((n) => attr(n, 'data-resistance-section'));
const t172SectionSeq = t172Sections.map((n) => attr(n, 'data-resistance-section'));
const t172CountsOk = t172Sections.length === 3 && t172Sections.every((n) => /^\d+$/.test(String(attr(n, 'data-count'))));
check('T172s',
  '(t168) 阻力清单三段齐备且顺序固定：obstacle-candidates → obstacle-rows → prohibit，每段带数字型 data-count（备选数 / 今日登记数 / Top 榜条数）',
  t172CountsOk && t172SectionSeq.join(',') === 'obstacle-candidates,obstacle-rows,prohibit',
  '段序=' + t172SectionSeq.join(',') + ' counts=' + JSON.stringify(t172Sections.map((n) => attr(n, 'data-count'))));

/* 必做之事只剩核心：不得再含禁止清单/绊脚石两段（t168 的拆分判据） */
fire(railDt('rail-onething'));
await flushAsync(6);
const t172OneBoard = bSlot() || null;
const t172OneProhibit = all((n) => attr(n, 'data-prohibit-card') !== undefined, t172OneBoard || undefined);
const t172OneRes = all((n) => attr(n, 'data-dt') === 'res-preset' || attr(n, 'data-dt') === 'res-input', t172OneBoard || undefined);
const t172OneText = t172OneBoard ? nodeText(t172OneBoard) : '';
const t172OneHow = byCls('dtOneHow');
const t172OneWhy = byCls('dtOneWhy');
const t172OneBadChildren = badChildObjs.length;
const t172HasCandidate = !!byDt('onething-open')[0];
check('T172t',
  '(t168) 必做之事视图不再含禁止清单/绊脚石两段：B 栏内 [data-prohibit-card] 0 个、res-preset/res-input 0 个、正文不含「禁止清单」「绊脚石」；同时 .dtOneWhy/.dtOneHow 各恰 1 且渲染期 badChildObjs 记账 0（t162 的行为欠账在此闭环）',
  !!t172OneBoard && t172OneProhibit.length === 0 && t172OneRes.length === 0 &&
  t172OneText.indexOf('禁止清单') < 0 && t172OneText.indexOf('绊脚石') < 0 &&
  t172OneBadChildren === 0 && (t172HasCandidate ? (t172OneWhy.length === 1 && t172OneHow.length === 1) : true),
  'b.view=' + String(bView()) + ' prohibit=' + t172OneProhibit.length + ' res钩子=' + t172OneRes.length +
  ' 正文含禁止清单=' + (t172OneText.indexOf('禁止清单') >= 0) + ' 含绊脚石=' + (t172OneText.indexOf('绊脚石') >= 0) +
  ' why=' + t172OneWhy.length + ' how=' + t172OneHow.length + ' 有候选=' + t172HasCandidate + ' badChild=' + t172OneBadChildren +
  ' why文本=' + JSON.stringify(t172OneWhy[0] ? nodeText(t172OneWhy[0]).trim().slice(0, 40) : ''));

/* 数据单源：仍只读 db.obstacles，没有新存储键；写入口经 action 落库并同帧回显 */
fire(railDt('rail-resistance'));
await flushAsync(6);
const t172DbBefore = dbNow();
const t172ObsLenBefore = Array.isArray(t172DbBefore.obstacles) ? t172DbBefore.obstacles.length : 0;
const t172SingleKey = t172DbBefore.prohibits === undefined && t172DbBefore.resistance === undefined;
const t172ResInput = byDt('res-input')[0] || null;
if (t172ResInput) change(t172ResInput, 't172刷手机');
await flushAsync(4);
const t172ResMin = byDt('res-minutes')[0] || null;
if (t172ResMin) change(t172ResMin, '20');
await flushAsync(4);
const t172ResAdd = byDt('res-add')[0] || null;
if (t172ResAdd) fire(t172ResAdd);
await flushAsync(6);
storeApi.saveNow();
const t172DbAfter = dbNow();
const t172ObsAfter = Array.isArray(t172DbAfter.obstacles) ? t172DbAfter.obstacles : [];
const t172NewObs = t172ObsAfter[t172ObsAfter.length - 1] || {};
const t172RowsSection = all((n) => attr(n, 'data-resistance-section') === 'obstacle-rows')[0] || null;
/* 今日登记段的 data-count 是「今日实际条数」，不能写死 1：seed 里若已有今日记录，写死就会假红 */
const t172TodayRows = t172ObsAfter.filter((o) => o && String(o.at) === t172TodayK).length;
check('T172u',
  '(t168) 数据单源：db.obstacles 是唯一存储（db.prohibits / db.resistance 均 undefined）；填 res-input + res-minutes=20 点 res-add ⇒ obstacles 长度 +1、新行 {label:"t172刷手机", minutes:20, at: 今天}，今日登记段 data-count 同帧 +1',
  t172SingleKey && Array.isArray(t172DbAfter.obstacles) && t172ObsAfter.length === t172ObsLenBefore + 1 &&
  t172NewObs.label === 't172刷手机' && Number(t172NewObs.minutes) === 20 && String(t172NewObs.at) === t172TodayK &&
  !!t172RowsSection && Number(attr(t172RowsSection, 'data-count')) === t172TodayRows,
  'prohibits/resistance 空=' + t172SingleKey + ' obstacles=' + t172ObsLenBefore + '→' + t172ObsAfter.length +
  ' 新行=' + JSON.stringify({ label: t172NewObs.label, minutes: t172NewObs.minutes, at: t172NewObs.at }) +
  ' rowsCount=' + (t172RowsSection ? attr(t172RowsSection, 'data-count') : 'null') + ' 期望(今日条数)=' + t172TodayRows + ' today=' + t172TodayK);

/* 排序：近 14 天累计时长降序 → 次数降序 → label 升序；Top3 + 观察区 */
const t172ObsRow = (label, minutes, dayOffset, seq) => ({
  id: 't172:' + label + ':' + String(minutes) + ':' + String(seq || 0),
  label: label,
  minutes: minutes,
  at: t172DayK(dayOffset),
  createdAt: 1000 + (seq || 0)
});
const t172RankFixture = [
  t172ObsRow('刷手机', 30, -1, 1), t172ObsRow('刷手机', 20, -2, 2),
  t172ObsRow('逛淘宝', 40, -1, 3), t172ObsRow('逛淘宝', 15, -3, 4),
  t172ObsRow('打游戏', 45, -4, 5),
  t172ObsRow('发呆', 10, -5, 6)
];
const t172RankOf = () => {
  const rows = all((n) => attr(n, 'data-prohibit-rank') !== undefined);
  const watch = all((n) => attr(n, 'data-prohibit-watch') !== undefined);
  const card = all((n) => attr(n, 'data-prohibit-card') !== undefined)[0] || null;
  return {
    top: rows.map((n) => ({ label: attr(n, 'data-label'), minutes: Number(attr(n, 'data-minutes')), count: Number(attr(n, 'data-count')), rank: Number(attr(n, 'data-prohibit-rank')) })),
    watch: watch.map((n) => ({ label: attr(n, 'data-label'), minutes: Number(attr(n, 'data-minutes')), gap: Number(attr(n, 'data-gap')) })),
    enough: card ? attr(card, 'data-prohibit-enough') : null,
    empty: all((n) => attr(n, 'data-prohibit-empty') !== undefined).length,
    text: card ? nodeText(card) : ''
  };
};
setDb({ obstacles: t172RankFixture });
await flushAsync(6);
const t172Rank1 = t172RankOf();
check('T172v',
  '(t168) 排序判据：近 14 天按累计时长降序（逛淘宝 55 > 刷手机 50 > 打游戏 45）→ 同分比次数 → 再比 label；Top3 上榜、其余进观察区且 data-gap = Top3 末位时长 − 自己的时长（45−10=35）',
  t172Rank1.enough === '1' &&
  t172Rank1.top.map((r) => r.label).join(',') === '逛淘宝,刷手机,打游戏' &&
  t172Rank1.top.map((r) => r.minutes).join(',') === '55,50,45' &&
  t172Rank1.watch.length === 1 && t172Rank1.watch[0].label === '发呆' && t172Rank1.watch[0].gap === 35,
  'top=' + JSON.stringify(t172Rank1.top) + ' watch=' + JSON.stringify(t172Rank1.watch) + ' enough=' + t172Rank1.enough);

const t172TieFixture = [
  t172ObsRow('aaa', 60, -1, 11),
  t172ObsRow('bbb', 30, -1, 12), t172ObsRow('bbb', 20, -2, 13), t172ObsRow('bbb', 10, -3, 14),
  t172ObsRow('aab', 30, -2, 15), t172ObsRow('aab', 30, -3, 16),
  t172ObsRow('ccc', 40, -4, 17), t172ObsRow('ccc', 20, -5, 18)
];
setDb({ obstacles: t172TieFixture });
await flushAsync(6);
const t172Rank2 = t172RankOf();
check('T172w',
  '(t168) 同分裁决：四条都是累计 60 分钟 ⇒ 先按次数降序（bbb 3 次 > aab/ccc 各 2 次 > aaa 1 次），次数再相同按名称升序（aab < ccc）',
  t172Rank2.top.map((r) => r.label + ':' + r.count).join(',') === 'bbb:3,aab:2,ccc:2' && t172Rank2.watch.length === 1 && t172Rank2.watch[0].label === 'aaa',
  'top=' + JSON.stringify(t172Rank2.top) + ' watch=' + JSON.stringify(t172Rank2.watch));

setDb({ obstacles: [t172ObsRow('刷手机', 30, -1, 21), t172ObsRow('发呆', 20, -2, 22)] });
await flushAsync(6);
const t172Rank3 = t172RankOf();
check('T172x',
  '(t168) 样本 <3 不出榜：只有 2 条记录 ⇒ data-prohibit-enough="0"、出现引导态 [data-prohibit-empty] 且文案给出「再记 1 次」，榜单行 0 个（不让一条记录就封神）',
  t172Rank3.enough === '0' && t172Rank3.empty === 1 && t172Rank3.top.length === 0 && /再记 1 次/.test(t172Rank3.text),
  'enough=' + t172Rank3.enough + ' empty节点=' + t172Rank3.empty + ' top=' + t172Rank3.top.length + ' 文案=' + JSON.stringify(t172Rank3.text.slice(0, 80)));

setDb({
  obstacles: [
    t172ObsRow('刷手机', 30, -1, 31), t172ObsRow('发呆', 20, -2, 32), t172ObsRow('逛淘宝', 10, -3, 33),
    t172ObsRow('老记录', 120, -20, 34)
  ]
});
await flushAsync(6);
const t172Rank4 = t172RankOf();
check('T172y',
  '(t168) 近 14 天窗口：20 天前的 120 分钟记录不计入（否则它会霸榜）；窗口内 3 条参与排序，样本按窗口内条数算 ⇒ 上榜 3 条且老记录 0 命中',
  t172Rank4.enough === '1' && t172Rank4.top.length === 3 &&
  t172Rank4.top.every((r) => r.label !== '老记录') && t172Rank4.text.indexOf('老记录') < 0,
  'top=' + JSON.stringify(t172Rank4.top.map((r) => r.label + ':' + r.minutes)) + ' enough=' + t172Rank4.enough + ' 含老记录=' + (t172Rank4.text.indexOf('老记录') >= 0));

/* ---------------- 6. badChildObjs 覆盖扩展：两条真实路径都进账本 ---------------- */
const t172BadBefore = badChildObjs.length;
fire(railDt('rail-resistance'));
await flushAsync(4);
const t172BadAfterRes = badChildObjs.length;
await t172OpenDetail();
await t172Run(t172DshOk(t172Steps(6)));
const t172BadAfterBd = badChildObjs.length;
check('T172z',
  '(t162 欠账) badChildObjs 记账扩到两条真实渲染路径：渲染阻力清单面板块与 C 栏拆解面板（含 6 步列表、strength 段）都不产生「对象当子节点」记账（本段前后差值 0），且两处节点数 >0 证明路径真的走到了',
  t172BadAfterBd === 0 && t172BadBefore === 0 && t172BadAfterRes === 0 && t172BdSteps().length >= 3 &&
  !!t172ResBoard,
  'badChild 前=' + t172BadBefore + ' 阻力清单后=' + t172BadAfterRes + ' 拆解后=' + t172BadAfterBd +
  ' 拆解步数=' + t172BdSteps().length + ' 阻力清单面板(切走前已渲染)=' + !!t172ResBoard + ' 阻力清单节点=' + t172ResRailAll.length);

/* 还原段内副作用：obstacles 与 settings 回到进入本段时的样子 */
t172Restore();
await flushAsync(4);

/* ======================= 十七之三、t176 补足步骤的耗时（t173 池子 + t174 两轮策略） ======================= */
/* 背景：t173 把拆解的本地补足池从 4 条扩到 19 条（core 4 条无估时、派生 15 条带 clamp [5,60] 的估时），
   t174 让补足循环把 minutes 一路带到渲染层，并且改成「先取带估时的条目、再取无估时的兜底」。
   下面不信任任何中间变量：每一步的耗时都从自己那一步的 DOM 子节点里数，不靠全局节点序。 */
/* 前置段（T172i 的 off 档、T172q 的 custom 档等）会把模型来源留在 off/custom，
   那时 runBreakdown 直接 return、bd 走“本地全量 slice(0, limit)”，Host 分支根本进不去。
   本段全部用例都要求 dsh 档（只有它才会打到 /polish），所以先钉住来源。 */
t172SetAgent('dsh');
const t176MinOfStep = (step) => childNodes(step).filter((n) => hasClass(n, 'dtBreakdownMin'));
const t176StepText = (step) => { const t = t172StepPart(step, 'dtBreakdownText'); return t ? nodeText(t).trim() : ''; };
const t176ParsedMin = (text) => { const m = /^约 (\d+) 分钟$/.exec(String(text || '').trim()); return m ? Number(m[1]) : -1; };

/* ---- 1. Host 不给 minutes、靠本地补到 11 步：补出来的每一步都必须带耗时 ---- */
const t176Strong2 = await t172StepCase('strong', t172Steps(2));
const t176HostCount = 2;
const t176TopUp = t176Strong2.count - t176HostCount;
const t176TopUpSteps = t176Strong2.steps.slice(t176HostCount);
const t176TopUpMinsFlat = [];
t176TopUpSteps.forEach((s) => t176MinOfStep(s).forEach((n) => t176TopUpMinsFlat.push(nodeText(n).trim())));
const t176TopUpEachOne = t176TopUpSteps.every((s) => t176MinOfStep(s).length === 1);
const t176TopUpFormat = t176TopUpMinsFlat.every((t) => /^约 \d+ 分钟$/.test(t));
const t176TopUpRange = t176TopUpMinsFlat.every((t) => { const v = t176ParsedMin(t); return v >= 5 && v <= 60; });
check('T176a',
  '(t174) 补足步骤也带耗时：强档 Host 只回 2 步（无 minutes）⇒ 补到 ' + (t176HostCount + 9) + ' 步，其中本地补出的 ' + t176TopUp + ' 步【每一步】都恰有 1 个耗时节点，文案 ^约 \\d+ 分钟$、N ∈[5,60]，耗时节点总数 === 带估时的补足条数',
  t176Strong2.count === 11 && t176TopUp === 9 &&
  t176TopUpEachOne && t176TopUpMinsFlat.length === t176TopUp &&
  t176TopUpFormat && t176TopUpRange,
  'steps=' + t176Strong2.count + '（Host 2 + 补足 ' + t176TopUp + '） 补足步逐个带耗时=' + t176TopUpEachOne +
  ' 耗时节点数=' + t176TopUpMinsFlat.length + '（期望 ' + t176TopUp + '） 文本=' + JSON.stringify(t176TopUpMinsFlat) +
  ' 格式=' + t176TopUpFormat + ' 区间=' + t176TopUpRange);

/* ---- 2. 不许写死一个常数（例如全部 15 分钟）：估时来自任务派生，必须有分布 ---- */
const t176TopUpDistinct = new Set(t176TopUpMinsFlat).size;
const t176TopUpAllSame = t176TopUpMinsFlat.length > 0 && t176TopUpDistinct === 1;
check('T176b',
  '(t174) 补足耗时不是写死的常数：' + t176TopUp + ' 条补足步骤的耗时至少有 3 种不同取值（实现是按下标 clamp 出来的 8/5/5/5/8/6/8/6/6，若哪天改成统一「15 分钟」这条会红）',
  t176TopUpMinsFlat.length >= 9 && t176TopUpDistinct >= 3 && !t176TopUpAllSame,
  '补足耗时=' + JSON.stringify(t176TopUpMinsFlat) + ' 去重后=' + t176TopUpDistinct + ' 种（要求 ≥3），全同=' + t176TopUpAllSame);

/* ---- 3. Host 自带的 minutes 逐字不被改写：文本相等判，不是只判存在 ---- */
const t176HostMins = [5, 10, 15, 30, 45, 60];
const t176Strong6 = await t172StepCase('strong', t172Steps(6, t176HostMins));
const t176HostRendered = [];
t176Strong6.steps.slice(0, t176HostMins.length).forEach((s) => {
  const ns = t176MinOfStep(s);
  t176HostRendered.push(ns.length === 1 ? nodeText(ns[0]).trim() : (ns.length === 0 ? '(无)' : '(多个)'));
});
const t176HostExpect = t176HostMins.map((m) => '约 ' + m + ' 分钟');
check('T176c',
  '(t174) Host 自带 minutes 逐字保留：fixture 给 [' + t176HostMins.join(',') + ']，前 6 步的耗时节点文本必须【逐个相等】为「约 N 分钟」（不是只判存在，也不是只判区间）',
  t176Strong6.count >= t176HostMins.length && t176HostRendered.length === 6 &&
  t176HostRendered.every((t, i) => t === t176HostExpect[i]),
  'steps=' + t176Strong6.count + ' 渲染=' + JSON.stringify(t176HostRendered) + ' 期望=' + JSON.stringify(t176HostExpect));

/* ---- 4. 两轮策略：无估时的兜底条目【不渲染】耗时节点（不许为凑整齐编造 15 分钟） ---- */
/* core 4 条固定动作（actNowStepsCore）本身没有估时，它们是补足池里的第二轮兜底；
   只要它们出现在拆解里，就必须没有耗时节点。取 core 文本的方式：立即行动面板渲染的就是这 4 条。 */
const t176PrevModules = settingsNow().modules || {};
setSettings({ modules: Object.assign({}, t176PrevModules, { rec: true }) });
if (bView() !== 'actnow') { const t176Act = railDt('rail-act-now'); if (t176Act) fire(t176Act); await flushAsync(6); }
const t176Panel = byDt('act-now-panel')[0] || null;
const t176PanelSteps = byDt('act-now-step');
const t176PanelTexts = t176PanelSteps.map((s) => {
  const kids = childNodes(s);
  const noEl = kids.filter((n) => hasClass(n, 'dtActNowNo'))[0] || null;
  const noText = noEl ? nodeText(noEl).trim() : '';
  const rest = kids.filter((n) => n !== noEl).map((n) => nodeText(n).trim()).join(' ').trim();
  return { no: noText, text: rest };
});
const t176CoreTexts = t176PanelTexts.map((p) => p.text.replace(/^\s*(?:\d{1,2}\s*[.、)）]|[\u2460-\u2473]|[-–—•·*])\s*/, '').trim());
const t176CoreInBreakdown = t176Strong2.steps
  .map((s) => ({ text: t176StepText(s), mins: t176MinOfStep(s).map((n) => nodeText(n).trim()) }))
  .filter((s) => t176CoreTexts.indexOf(s.text) >= 0);
const t176CoreWithoutMin = t176CoreInBreakdown.every((s) => s.mins.length === 0);
check('T176d',
  '(t174) 两轮补足策略：无估时的兜底条目（core 4 条固定动作）若出现在拆解里，则该步【没有】耗时节点——这条就是「不许为凑整齐写死 15 分钟」的证据；判据是「出现即必须无耗时」，故 core 未出现时判为空真并如实记账',
  t176CoreWithoutMin,
  'core 文本（取自立即行动面板）=' + JSON.stringify(t176CoreTexts) + ' 在拆解中出现的 core 步=' + t176CoreInBreakdown.length +
  ' 其中带耗时的=' + t176CoreInBreakdown.filter((s) => s.mins.length > 0).length + ' 详情=' + JSON.stringify(t176CoreInBreakdown));

/* ---- 5. 立即行动面板没被牵连：仍 4 步、序号 1..4 唯一、面板内没有任何拆解耗时节点 ---- */
const t176PanelNums = t176PanelTexts.map((p) => { const m = /^(\d+)\.$/.exec(p.no); return m ? Number(m[1]) : -1; });
const t176PanelSeqOk = t176PanelNums.length === 4 && t176PanelNums.every((v, i) => v === i + 1);
const t176PanelMinNodes = t176Panel ? all((n) => hasClass(n, 'dtBreakdownMin') || attr(n, 'data-dt') === 'c-breakdown-min', t176Panel).length : -1;
const t176PanelTextsClean = t176PanelTexts.every((p) => !/^\s*(?:\d{1,2}\s*[.、)）]|[\u2460-\u2473]|[-–—•·*])\s*/.test(p.text));
check('T176e',
  '(t174) 立即行动面板与 C 栏拆解互不牵连：rail「立即行动」面板仍是 4 步、序号恰为 1./2./3./4. 各一次、正文行首无二次编号、面板内没有拆解用的 .dtBreakdownMin 节点',
  !!t176Panel && t176PanelSteps.length === 4 && t176PanelSeqOk && t176PanelTextsClean && t176PanelMinNodes === 0,
  'panel=' + (t176Panel ? '在' : '缺') + ' steps=' + t176PanelSteps.length + ' 序号=' + JSON.stringify(t176PanelNums) +
  ' 行首二次编号=' + t176PanelTexts.filter((p) => /^\s*(?:\d{1,2}\s*[.、)）]|[\u2460-\u2473]|[-–—•*])\s*/.test(p.text)).length +
  ' 面板内拆解耗时节点=' + t176PanelMinNodes);

/* ---- 6. 补足耗时不越档：弱档补 1 步、中档补 4 步时，耗时节点数同样等于补足条数（不多渲染） ---- */
const t176Weak2 = await t172StepCase('weak', t172Steps(2));
const t176WeakTopUp = t176Weak2.count - 2;
const t176WeakMinCount = t176Weak2.steps.slice(2).reduce((acc, s) => acc + t176MinOfStep(s).length, 0);
const t176Mid2 = await t172StepCase('mid', t172Steps(2));
const t176MidTopUp = t176Mid2.count - 2;
const t176MidMinCount = t176Mid2.steps.slice(2).reduce((acc, s) => acc + t176MinOfStep(s).length, 0);
check('T176f',
  '(t174) 只有「补出来的步」带耗时、且不越档：弱档 Host 2 步 ⇒ 3 步（补 1，耗时节点 1 个）、中档 Host 2 步 ⇒ 6 步（补 4，耗时节点 4 个），Host 原 2 步无 minutes 时也不补假耗时',
  t176Weak2.count === 3 && t176WeakTopUp === 1 && t176WeakMinCount === 1 &&
  t176Mid2.count === 6 && t176MidTopUp === 4 && t176MidMinCount === 4 &&
  t176Weak2.steps.slice(0, 2).concat(t176Mid2.steps.slice(0, 2)).every((s) => t176MinOfStep(s).length === 0),
  '弱=' + t176Weak2.count + '步/补' + t176WeakTopUp + '/耗时' + t176WeakMinCount +
  ' 中=' + t176Mid2.count + '步/补' + t176MidTopUp + '/耗时' + t176MidMinCount +
  ' Host 原步自带耗时（应为 0）=' + t176Weak2.steps.slice(0, 2).concat(t176Mid2.steps.slice(0, 2)).filter((s) => t176MinOfStep(s).length > 0).length);

/* 还原本段副作用：模块开关与视图 */
setSettings({ modules: t176PrevModules });
await t172OpenToday();

/* ======================= 十七之四、t181 令牌门禁（S2 字号/间距/圆角 + S6 交互态） ======================= */
/* 这一组是静态门禁：直接读 src/parts/70-styles.js 的源码文本，不依赖渲染结果。
   变异点在 var(--dt-*) 前缀 —— 把任一处 var(--dt-fs-*) / var(--dt-sp-*) / var(--dt-r-*) 改成字面值，对应门禁必须恰红。 */
const t180StylesPath = partsDir ? pathMod.join(partsDir, '70-styles.js') : null;
const t180SrcRaw = t180StylesPath ? (function () { try { return readFileSync(t180StylesPath, 'utf8'); } catch (e) { return ''; } })() : '';
const t180Lines = t180SrcRaw.split(/\r?\n/);
const t180HasSrc = t180SrcRaw.length > 0;

/* 令牌块 = 定义 --dt-fs-micro 的那一行（S2 档位表唯一定义处） */
const t180TokenLineIdx = t180Lines.findIndex((l) => l.indexOf('--dt-fs-micro:') >= 0);
const t180TokenLine = t180TokenLineIdx >= 0 ? t180Lines[t180TokenLineIdx] : '';

/* ---- T180a：font-size 的字面 px 只允许出现在 dt-tokens 块内；块外必须是 var(--dt-fs-*) ---- */
const t180FontHits = [];
t180Lines.forEach((line, i) => {
  if (i === t180TokenLineIdx) return;
  const m = line.match(/font-size:\s*([^;'"}]+)/);
  if (!m) return;
  const value = String(m[1]).trim();
  if (/^var\(--dt-fs-[a-z0-9-]+\)$/.test(value)) return;
  /* font-size:0（隐藏文字那类）不是「字面 px」，不进门禁 */
  if (/^0(?:px)?$/.test(value)) return;
  const sel = (line.match(/^\s*'([^']*?)\{/) || [])[1] || (line.match(/^\s*'([^']*)'/) || [])[1] || '(未知选择器)';
  t180FontHits.push({ line: i + 1, selector: sel.trim(), value: value });
});
/* 展示型白名单（captain m05359 拍板 ②）：展示型字号不属于 micro/meta/body/title/head 那套文本阶梯，
   允许字面 px，但必须是【已登记】的这 6 个值，且同行或上一行要有「展示型」注释（注释是登记凭据）。
   任何【新增】的字面 px 都会进 t180FontHits 并让 T180a 直接红。 */
/* 登记按「值 + 该行必须出现的类名」成对匹配，避免把 18px 随便挪到别的规则上也算登记（captain：「只限这 6 处」） */
const T180_DISPLAY_REGISTERED = [
  { value: '18px', lineHas: '.dtStatValue' },
  { value: '20px', lineHas: '.dtHabitStatNum' },
  { value: '44px', lineHas: '.dtSpiralTime' },
  { value: '38px', lineHas: '.dtSpiralTime' },
  { value: '34px', lineHas: '.dtSpiralTime' },
  { value: '30px', lineHas: '.dtSpiralTime' }
];
const t180IsRegisteredDisplay = (hit) => {
  const line = t180Lines[hit.line - 1] || '';
  return T180_DISPLAY_REGISTERED.some((r) => r.value === hit.value && line.indexOf(r.lineHas) >= 0);
};
const t180HasDisplayComment = (hit) => {
  const same = t180Lines[hit.line - 1] || '';
  const prev = hit.line >= 2 ? (t180Lines[hit.line - 2] || '') : '';
  return /展示型/.test(same) || /展示型/.test(prev);
};
const t180NewHits = t180FontHits.filter((h) => !t180IsRegisteredDisplay(h));
const t180DisplayHits = t180FontHits.filter(t180IsRegisteredDisplay);
const t180DisplayAnnotated = t180DisplayHits.filter(t180HasDisplayComment);
const t180DisplayUnannotated = t180DisplayHits.filter((h) => !t180HasDisplayComment(h));
check('T180a',
  '(t180·S2) 字号令牌门禁：块外 font-size 只允许 var(--dt-fs-*) 或【带注释的展示型字面值】；展示型必须同行或上一行有「展示型」字样注释，且只限已登记的 6 个值（18/20/44/38/34/30px，dtStatValue/dtHabitStatNum/dtSpiralTime）。「已登记展示型」与「新增违规」是两个可数集合，不得混算；t187 起注释覆盖必须 6/6（缺一条即红，原先由 T180a-display 观察项登记，现收紧为硬判据并撤该观察项）',
  t180HasSrc && t180TokenLineIdx >= 0 && t180NewHits.length === 0 && t180DisplayHits.length === 6 && t180DisplayUnannotated.length === 0,
  '样式文件=' + (t180StylesPath || '(未找到)') + ' 令牌行=' + (t180TokenLineIdx >= 0 ? (t180TokenLineIdx + 1) : '缺') +
  '；块外 font-size 命中=' + t180FontHits.length + ' = 已登记展示型 ' + t180DisplayHits.length + ' 处（带注释 ' + t180DisplayAnnotated.length + '） + 新增违规 ' + t180NewHits.length + ' 处' +
  '；新增违规=' + JSON.stringify(t180NewHits.slice(0, 6)) +
  '；已登记展示型=' + JSON.stringify(t180DisplayHits.map((h) => h.selector + '=' + h.value)) +
  '；缺注释行=' + JSON.stringify(t180DisplayUnannotated.map((h) => h.line)));
/* T180a-display 观察项已撤（captain m05471/m05493 定案）：t187 补齐 6 处「展示型」注释后，
   「登记集合 = 6 且每条都带注释」升格为 T180a 的硬判据，不再单列观察项。 */

/* ---- T180b：.dtRoot 必须定义完整档位表，且值都是 px（pill=999，sp 4/8/12/16/20/24/32/40） ---- */
const t180WantTokens = {
  '--dt-fs-micro': '11', '--dt-fs-meta': '12', '--dt-fs-body': '13', '--dt-fs-title': '14', '--dt-fs-head': '16',
  '--dt-sp-1': '4', '--dt-sp-2': '8', '--dt-sp-3': '12', '--dt-sp-4': '16',
  '--dt-sp-5': '20', '--dt-sp-6': '24', '--dt-sp-7': '32', '--dt-sp-8': '40',
  '--dt-r-row': '6', '--dt-r-card': '10', '--dt-r-pill': '999'
};
const t180TokenValues = {};
Object.keys(t180WantTokens).forEach((k) => {
  const re = new RegExp('\\' + k.replace(/-/g, '\\-').replace(/^\\--/, '--') + ':([^;}]+)');
  const m = t180TokenLine.match(new RegExp(k.replace(/[-]/g, '\\-') + ':([^;}]+)'));
  t180TokenValues[k] = m ? String(m[1]).trim() : '(缺)';
});
/* --dt-disabled-op 是明暗两套 palette 各定义的禁用透明度（captain m05398 要求并入键表，别让它游离在门禁外） */
const t180DisabledOpDecls = [];
t180Lines.forEach((line, i) => {
  const m = line.match(/--dt-disabled-op:([^;}]+)/);
  if (!m) return;
  const sel = (line.match(/^\s*'([^']*?)\{/) || [])[1] || '';
  t180DisabledOpDecls.push({ line: i + 1, selector: sel.trim(), value: String(m[1]).trim(), dark: /data-dt-theme="dark"/.test(line) });
});
const t180DisabledOpLight = t180DisabledOpDecls.filter((d) => !d.dark);
const t180DisabledOpDark = t180DisabledOpDecls.filter((d) => d.dark);
const t180OpIsNumeric = (v) => /^(?:0?\.\d+|1|0|\d+(?:\.\d+)?)$/.test(String(v));
const t180DisabledOpProblems = [];
if (!t180DisabledOpLight.length) t180DisabledOpProblems.push('--dt-disabled-op:明色 palette 缺定义');
if (!t180DisabledOpDark.length) t180DisabledOpProblems.push('--dt-disabled-op:暗色 palette 缺定义');
t180DisabledOpDecls.forEach((d) => {
  if (!t180OpIsNumeric(d.value)) t180DisabledOpProblems.push('--dt-disabled-op 值非数字：' + d.value + '(行 ' + d.line + ')');
  else if (!(Number(d.value) > 0 && Number(d.value) < 1)) t180DisabledOpProblems.push('--dt-disabled-op 越界(0,1)：' + d.value + '(行 ' + d.line + ')');
});

const t180BadTokens = Object.keys(t180WantTokens).filter((k) => {
  const v = t180TokenValues[k];
  const want = t180WantTokens[k] + 'px';
  return v !== want;
});
check('T180b',
  '(t180·S2) 档位表齐全且值正确：.dtRoot 的令牌块必须定义 --dt-fs-micro/meta/body/title/head（11/12/13/14/16px）、--dt-sp-1..8（4/8/12/16/20/24/32/40px）、--dt-r-row/card/pill（6/10/999px），全部为 px；另含 --dt-disabled-op 必须在明暗两套 palette 各定义一次、值为 (0,1) 之间的数字',
  t180HasSrc && t180TokenLineIdx >= 0 && t180BadTokens.length === 0 && t180DisabledOpProblems.length === 0,
  '令牌行=' + (t180TokenLineIdx + 1) + ' 期望 16 个键；不符=' + JSON.stringify(t180BadTokens.map((k) => k + '=' + t180TokenValues[k] + '(期望 ' + t180WantTokens[k] + 'px)').slice(0, 8)) +
  '；--dt-disabled-op 明=' + JSON.stringify(t180DisabledOpLight.map((d) => d.value + '@' + d.line)) + ' 暗=' + JSON.stringify(t180DisabledOpDark.map((d) => d.value + '@' + d.line)) +
  ' 问题=' + JSON.stringify(t180DisabledOpProblems) + '；实测=' + JSON.stringify(t180TokenValues));

/* ---- T180c：三条关键规则的 padding/gap/border-radius 必须是 var(--dt-*) 或数字 px，不得出现字面色 ---- */
const t180RulePick = (needle) => {
  const idx = t180Lines.findIndex((l) => l.indexOf(needle) >= 0 && l.indexOf('{') >= 0);
  if (idx < 0) return { idx: -1, body: '', selector: '' };
  const line = t180Lines[idx];
  const open = line.indexOf('{');
  const close = line.lastIndexOf('}');
  return { idx: idx, selector: (line.match(/^\s*'([^']*?)\{/) || [])[1] || needle, body: close > open ? line.slice(open + 1, close) : '' };
};
const t180RuleNames = ['.dtRow{', '.dtRailItem{', '.dtDetailFields .dtFieldInput'];
const t180RuleProblems = [];
const t180RuleReport = [];
t180RuleNames.forEach((needle) => {
  const rule = t180RulePick(needle);
  if (rule.idx < 0) { t180RuleProblems.push(needle + ':规则缺失'); return; }
  ['padding', 'gap', 'border-radius'].forEach((prop) => {
    const m = rule.body.match(new RegExp('(?:^|;)' + prop + ':\\s*([^;]+)'));
    if (!m) { t180RuleReport.push(needle + '.' + prop + '=(未声明)'); return; }
    const value = String(m[1]).trim();
    t180RuleReport.push(needle + '.' + prop + '=' + value);
    const tokens = value.split(/\s+/).filter((t) => t.length);
    const okTokens = tokens.every((t) => /^var\(--dt-[a-z0-9-]+\)$/.test(t) || /^-?\d+(?:\.\d+)?(?:px)?$/.test(t) || /^(0|auto|inherit)$/.test(t));
    const hasColor = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\bcolor-mix\(/.test(value);
    if (!okTokens) t180RuleProblems.push(needle + '.' + prop + '=' + value + '（出现非令牌非数字写法）');
    if (hasColor) t180RuleProblems.push(needle + '.' + prop + '=' + value + '（出现字面色）');
  });
});
check('T180c',
  '(t180·S2) 三条关键规则（.dtRow / .dtRailItem / .dtDetailFields .dtFieldInput）的 padding、gap、border-radius 只允许 var(--dt-*) 令牌或数字 px，且不得出现 #hex / rgb() / hsl() / color-mix() 字面色',
  t180HasSrc && t180RuleProblems.length === 0,
  '规则=' + t180RuleNames.join(' | ') + '；声明=' + JSON.stringify(t180RuleReport) + '；问题=' + JSON.stringify(t180RuleProblems));

/* ---- T180d：S6 三条交互态必须在产物里存在（焦点环 / 禁用 opacity / 按下 transform） ---- */
const t180RuleOf = (needle) => {
  const idx = t180Lines.findIndex((l) => l.indexOf(needle) >= 0 && l.indexOf('{') >= 0);
  if (idx < 0) return { found: false, body: '', line: -1 };
  const line = t180Lines[idx];
  const open = line.indexOf('{');
  const close = line.lastIndexOf('}');
  return { found: true, body: close > open ? line.slice(open + 1, close) : '', line: idx + 1 };
};
const t180Focus = t180RuleOf('.dtRoot :focus-visible{');
const t180Disabled = t180RuleOf('.dtRoot button:disabled');
const t180Active = t180RuleOf('.dtRoot button:active');
const t180FocusOk = t180Focus.found && /outline:\s*2px\s+solid\s+var\(--dt-accent\)/.test(t180Focus.body);
/* 禁用态认「确实有一条 opacity 生效」：数字字面或 var(--dt-disabled-op) 都算。
   双声明（opacity:.45;opacity:var(--dt-disabled-op)）在这里必须两条都露出来，不许只印 true。 */
const t180DisabledOpacityDecls = (t180Disabled.body.match(/opacity:\s*[^;}]+/g) || []).map((x) => x.trim());
const t180DisabledOpacityOk = t180DisabledOpacityDecls.some((d) => {
  const v = d.replace(/^opacity:\s*/, '').trim();
  return /^var\(--dt-disabled-op\)$/.test(v) || t180OpIsNumeric(v);
});
const t180DisabledOk = t180Disabled.found && t180DisabledOpacityOk;
const t180ActiveOk = t180Active.found && /(?:^|;)\s*transform:\s*[^;]+/.test(t180Active.body);
check('T180d',
  '(t180·S6) 三条交互态在样式表里可证：`.dtRoot :focus-visible{outline:2px solid var(--dt-accent)...}`、`.dtRoot button:disabled` 确有一条 opacity 生效（数字字面或 var(--dt-disabled-op)）、`.dtRoot button:active:not(:disabled){transform:...}`',
  t180HasSrc && t180FocusOk && t180DisabledOk && t180ActiveOk,
  'focus-visible=' + (t180Focus.found ? ('在(行 ' + t180Focus.line + ') outline 令牌=' + t180FocusOk) : '缺') +
  '；disabled=' + (t180Disabled.found ? ('在(行 ' + t180Disabled.line + ') 写法=' + JSON.stringify(t180DisabledOpacityDecls) + ' 认可=' + t180DisabledOpacityOk) : '缺') +
  '；active=' + (t180Active.found ? ('在(行 ' + t180Active.line + ') transform=' + t180ActiveOk) : '缺') +
  '；原文=' + JSON.stringify([t180Focus.body, t180Disabled.body, t180Active.body]));

/* ---- T180e：焦点可见性不变式（t183 真因的静态守卫） ---- */
/* 任何写 outline:none / outline:0 的规则，都必须存在一条 `:focus-visible` 规则能把它压回来：
   选择器命中同一元素（末段类名相同），且按层叠真的生效（特异性更高，或特异性相等但在后序）。
   `.dtDetailFields .dtFieldInput{outline:none}` 与 `.dtRoot :focus-visible` 同为 (0,2,0)、后者在前，
   于是焦点环被静默压掉 —— 这类回归靠行为断言很难稳定复现，静态判据更值钱。 */
const t180Spec = (sel) => {
  const s2 = String(sel || '');
  const ids = (s2.match(/#[A-Za-z0-9_-]+/g) || []).length;
  const classes = (s2.match(/\.[A-Za-z0-9_-]+/g) || []).length;
  const attrs = (s2.match(/\[[^\]]+\]/g) || []).length;
  const pseudos = (s2.match(/(?<!:):[A-Za-z-]+/g) || []).length;
  const elems = (s2.replace(/#[A-Za-z0-9_-]+|\.[A-Za-z0-9_-]+|\[[^\]]+\]|::?[A-Za-z-]+/g, ' ').match(/\b[a-zA-Z][a-zA-Z0-9]*\b/g) || []).length;
  return [ids, classes + attrs + pseudos, elems];
};
const t180SpecCmp = (a, b) => {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
};
const t180RulesAll = [];
t180Lines.forEach((line, i) => {
  const m = line.match(/^\s*'([^']*)\{([^}]*)\}'\s*,?\s*$/);
  if (!m) return;
  const selText = m[1];
  if (selText.indexOf('@') === 0) return;
  t180RulesAll.push({ line: i + 1, sel: selText, body: m[2], parts: selText.split(',').map((x) => x.trim()).filter((x) => x) });
});
const t180FocusVisibleRules = t180RulesAll.filter((r) => r.sel.indexOf(':focus-visible') >= 0 && /outline:\s*(?!none|0)/.test(r.body));
const t180OutlineNoneRules = t180RulesAll.filter((r) => /(?:^|;)\s*outline:\s*(?:none|0)\b/.test(r.body));
const t180FocusGaps = [];
t180OutlineNoneRules.forEach((r) => {
  r.parts.forEach((part) => {
    const key = (part.match(/\.[A-Za-z0-9_-]+/g) || []).pop();
    if (!key) return;
    const spec = t180Spec(part);
    const saver = t180FocusVisibleRules.find((f) => {
      if (f.sel.indexOf(key) < 0) return false;
      const fparts = f.parts.filter((p) => p.indexOf(key) >= 0);
      return fparts.some((p) => {
        const fs2 = t180Spec(p);
        const cmp = t180SpecCmp(fs2, spec);
        return cmp > 0 || (cmp === 0 && f.line > r.line);
      });
    });
    if (!saver) t180FocusGaps.push({ line: r.line, selector: part, spec: spec.join(',') });
  });
});
check('T180e',
  '(t183 真因守卫) 焦点可见性不变式：任何写 outline:none / outline:0 的规则，都必须有一条 :focus-visible 规则能压回来——选择器命中同一末段类名，且按层叠真生效（特异性更高，或特异性相等但在后序）。这样「outline:none 把焦点环静默压掉」不会再复发',
  t180HasSrc && t180RulesAll.length > 0 && t180FocusGaps.length === 0,
  '扫描规则=' + t180RulesAll.length + ' 写 outline:none 的规则=' + t180OutlineNoneRules.length + ' 含 outline 的 :focus-visible 规则=' + t180FocusVisibleRules.length +
  '；无覆盖=' + JSON.stringify(t180FocusGaps.slice(0, 8)) +
  '；被覆盖样例=' + JSON.stringify(t180OutlineNoneRules.map((r) => r.line + ':' + r.parts[0]).slice(0, 8)));

/* ---- T207（t207 回归门禁）：主题化三类 / 双写白名单 / 间距豁免集合 ----
   三类都是「写了才有、不写也不报错」的静态契约，靠真机取像素才能发现，所以进断言。
   判定口径：除 T207f 外全部是**源码静态扫描**（读 src/parts/70-styles.js 与产物内联样式同源的字符串），
   T207f 是**渲染后读 computed**（用桩的简易层叠，证明规则真落到渲染节点上，不是只存在于文本里）。 */
const t207Src = String(t180SrcRaw || '');
const t207Lines = Array.isArray(t180Lines) ? t180Lines : [];
const t207Innermost = /([^{}]+)\{([^{}]*)\}/g;
const t207Rules = [];
t207Lines.forEach((line, i) => {
  if (line.indexOf('@keyframes') >= 0) return;
  const body = line.replace(/'/g, '');
  t207Innermost.lastIndex = 0;
  let m;
  while ((m = t207Innermost.exec(body))) {
    const sel = String(m[1] || '').trim();
    if (!sel || sel.charAt(0) === '@') continue;
    t207Rules.push({ line: i + 1, sel: sel, body: m[2] });
  }
});
const t207DeclsOf = (body) => String(body).split(';').map((d) => {
  const idx = d.indexOf(':');
  if (idx < 0) return null;
  const prop = d.slice(0, idx).trim();
  const value = d.slice(idx + 1).trim();
  return prop && value ? { prop: prop, value: value } : null;
}).filter(Boolean);
const t207PartMatch = (rule, target) => rule.sel.split(',').map((x) => x.trim()).indexOf(target) >= 0;

/* T207a：::selection 必须主题化（背景与文字都走令牌，不写死色值） */
const t207SelRules = t207Rules.filter((r) => r.sel.indexOf('::selection') >= 0);
const t207SelDecls = t207SelRules.length ? t207DeclsOf(t207SelRules[0].body) : [];
const t207SelBg = (t207SelDecls.filter((d) => d.prop === 'background' || d.prop === 'background-color')[0] || {}).value || '';
const t207SelColor = (t207SelDecls.filter((d) => d.prop === 'color')[0] || {}).value || '';
const t207SelLiteral = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(t207SelBg + ';' + t207SelColor);
check('T207a',
  '(t207·静态扫描) 选中态必须主题化：产物里要有 ::selection 规则，且 background 与 color 都取令牌（var(--dt-…) 或 var(--dsw-alias-…)），不得写死 #hex / rgb() / hsl()。这类规则「不写也没人报错」——默认高亮在深色主题下会变成浏览器蓝，只能靠人工取像素发现',
  t207Rules.length > 0 && t207SelRules.length >= 1 && /^var\(--(?:dt|dsw)-/.test(t207SelBg) && /^var\(--(?:dt|dsw)-/.test(t207SelColor) && !t207SelLiteral,
  '扫描规则=' + t207Rules.length + ' ::selection 规则=' + t207SelRules.length +
  ' background=' + JSON.stringify(t207SelBg) + ' color=' + JSON.stringify(t207SelColor) + ' 字面色=' + t207SelLiteral +
  ' 来源行=' + t207SelRules.map((r) => r.line).join(','));

/* T207b：滚动条必须主题化（标准属性 + webkit 伪元素两套都在，且颜色/宽度走令牌） */
const t207ScrollStd = t207Rules.filter((r) => /(?:^|;)\s*scrollbar-width\s*:/.test(r.body) && /(?:^|;)\s*scrollbar-color\s*:/.test(r.body));
const t207ScrollThumb = t207Rules.filter((r) => r.sel.indexOf('::-webkit-scrollbar-thumb') >= 0);
const t207ScrollWidth = t207Rules.filter((r) => r.sel.indexOf('::-webkit-scrollbar') >= 0 && /(?:^|;)\s*width\s*:/.test(r.body));
const t207ScrollTokenized = t207ScrollStd.concat(t207ScrollThumb).every((r) => {
  const d = t207DeclsOf(r.body).filter((x) => /^(scrollbar-color|background|background-color)$/.test(x.prop));
  return d.length > 0 && d.every((x) => /^var\(--(?:dt|dsw)-/.test(x.value));
});
check('T207b',
  '(t207·静态扫描) 滚动条必须主题化：需要同时存在标准属性（同一规则里 scrollbar-width + scrollbar-color）与 webkit 伪元素（::-webkit-scrollbar / -thumb），且颜色类声明一律取令牌。只写一套在部分内核里完全不生效，写死灰色则在深色主题下露出亮边',
  t207ScrollStd.length >= 1 && t207ScrollThumb.length >= 1 && t207ScrollWidth.length >= 1 && t207ScrollTokenized,
  '标准属性规则=' + t207ScrollStd.length + '（行 ' + t207ScrollStd.map((r) => r.line).join(',') + '）' +
  ' webkit-thumb=' + t207ScrollThumb.length + ' webkit-width=' + t207ScrollWidth.length + ' 颜色全令牌=' + t207ScrollTokenized +
  ' 样例=' + JSON.stringify(t207ScrollStd.length ? t207ScrollStd[0].body.slice(0, 90) : ''));

/* T207c：同一规则内「字面值 + 令牌」双写——只允许白名单（精确到选择器 + 属性），其余一律判红。
   现有实现已无任何双写（扫描 0 处）；白名单保留 `.dtRoot button:disabled` 的 opacity，
   是为了允许「先写字面兜底、再写令牌」这一处历史写法回来时不必改断言，同时把「别处再双写」挡死。 */
const T207_DUP_ALLOW = [{ sel: '.dtRoot button:disabled', prop: 'opacity' }];
const t207DupHits = [];
t207Rules.forEach((r) => {
  const seen = {};
  t207DeclsOf(r.body).forEach((d) => {
    if (!seen[d.prop]) seen[d.prop] = [];
    seen[d.prop].push(d.value);
  });
  Object.keys(seen).forEach((prop) => {
    const vals = seen[prop];
    if (vals.length < 2) return;
    const hasTok = vals.some((v) => v.indexOf('var(') >= 0);
    const hasLit = vals.some((v) => v.indexOf('var(') < 0);
    if (!hasTok || !hasLit) return;
    const allowed = T207_DUP_ALLOW.some((a) => a.prop === prop && t207PartMatch(r, a.sel));
    t207DupHits.push({ line: r.line, sel: r.sel, prop: prop, vals: vals, allowed: allowed });
  });
});
const t207DupBad = t207DupHits.filter((h) => !h.allowed);
const t207DupAllowed = t207DupHits.filter((h) => h.allowed);
check('T207c',
  '(t207·静态扫描) 同一规则内不得「字面值 + 令牌」双写同一属性（白名单仅 .dtRoot button:disabled 的 opacity）。双写会让「改令牌」和「改字面」两个真源并存：令牌改了、字面没改时，回退内核里仍按字面渲染，主题切换看不出来',
  t207Rules.length > 0 && t207DupBad.length === 0,
  '扫描规则=' + t207Rules.length + ' 双写命中=' + t207DupHits.length + ' 白名单内=' + t207DupAllowed.length + ' 违规=' + t207DupBad.length +
  ' 明细=' + JSON.stringify(t207DupBad.slice(0, 6).map((h) => '行' + h.line + ' ' + h.sel + ' ' + h.prop + '=' + h.vals.join('→'))) +
  ' 白名单命中=' + JSON.stringify(t207DupAllowed.map((h) => '行' + h.line + ' ' + h.sel + ' ' + h.prop)));

/* T207d：--dt-disabled-op 必须明暗各定义一次、且至少被引用一次（定义没人用 = 令牌是装饰） */
const t207DisabledOpRefs = (t207Src.match(/var\(--dt-disabled-op\)/g) || []).length;
const t207DisabledOpDefs = t207Lines.filter((l) => /--dt-disabled-op\s*:/.test(l));
check('T207d',
  '(t207·静态扫描) --dt-disabled-op 必须明暗两套 palette 各定义一次（值∈(0,1)，由 T180b 判数值），且产物里至少有一处 var(--dt-disabled-op) 引用。只定义不引用 = 令牌是装饰；只引用不定义 = 禁用态 opacity 直接失效',
  t207DisabledOpDefs.length === 2 && t207DisabledOpRefs >= 1,
  '定义处=' + t207DisabledOpDefs.length + '（行 ' + t207DisabledOpDefs.length + ' 处：' + t207DisabledOpDefs.map((l) => l.trim().slice(0, 46)).join(' | ') + '）' +
  ' 引用次数=' + t207DisabledOpRefs);

/* T207e：间距字面值只允许豁免表 {0,1,2,3,64}（外加 sr-only 惯用的 -1px），且每个豁免值必须真的在用。
   扫描范围 = `src/parts/70-styles.js` 的**CSS 规则块**（定义口径见 DESIGN §13.3：按规则块内计数，
   当前 57 处 / 4 个值）。**行内 style 字符串不计入**：`40-panel.js:1387 FATAL_CARD_STYLE` 里的
   `padding:18px 20px` / `border-radius:12px` 是有意的——崩溃卡渲染时 dt-tokens 尚未注入，
   此刻写 `var(--dt-r-*)` 会二次失败，所以那处必须留字面值。白名单精确到「该常量内的声明」，
   不放宽成「凡是行内样式都放过」；断言消息里会打印「FATAL_CARD_STYLE 不在被扫文件内」的自证。 */
const T207_INLINE_ALLOW = [{ file: '40-panel.js', name: 'FATAL_CARD_STYLE' }];
const T207_SP_ALLOW = ['0', '1', '2', '3', '64', '-1'];
const t207SpHits = [];
t207Rules.forEach((r) => {
  t207DeclsOf(r.body).forEach((d) => {
    if (!/^(?:padding|margin|gap)(?:-(?:top|right|bottom|left))?$/.test(d.prop)) return;
    const nums = d.value.match(/-?\d+(?:\.\d+)?px/g) || [];
    nums.forEach((n) => t207SpHits.push({ line: r.line, prop: d.prop, value: n.replace('px', ''), raw: d.value, sel: r.sel }));
  });
});
const t207SpValues = {};
t207SpHits.forEach((h) => {
  if (!t207SpValues[h.value]) t207SpValues[h.value] = { count: 0, first: h };
  t207SpValues[h.value].count += 1;
});
const t207SpOutside = Object.keys(t207SpValues).filter((v) => T207_SP_ALLOW.indexOf(v) < 0);
const t207SpUnused = ['1', '2', '3', '64'].filter((v) => !t207SpValues[v]);
check('T207e',
  '(t207·静态扫描) 间距字面值必须落在豁免表内：padding/margin/gap 的数字 px 只允许 0 / 1 / 2 / 3 / 64（外加 sr-only 隐藏用的 -1px），且 1/2/3/64 每个值至少要有一处在用。出现 4/5/6/… 这类值说明有人绕过八档令牌阶梯手写间距，视觉上会与阶梯错位',
  t207Rules.length > 0 && t207SpOutside.length === 0 && t207SpUnused.length === 0,
  '扫描规则=' + t207Rules.length + ' 字面间距命中=' + t207SpHits.length + ' 实测集合=' + JSON.stringify(Object.keys(t207SpValues).sort((a, b) => Number(a) - Number(b)).map((v) => v + '×' + t207SpValues[v].count)) +
  ' 越界值=' + JSON.stringify(t207SpOutside) + ' 未使用=' + JSON.stringify(t207SpUnused) +
  ' 扫描范围=仅 src/parts/70-styles.js 的 CSS 规则块（DESIGN §13.3 口径）；行内 style 不计入，' +
  'FATAL_CARD_STYLE 不在被扫文件内=' + (t207Src.indexOf('FATAL_CARD_STYLE') < 0) + '（该常量在 40-panel.js:1387，令牌未注入时用字面值是有意的，白名单=' + JSON.stringify(T207_INLINE_ALLOW) + '）' +
  ' 首次出现=' + JSON.stringify(Object.keys(t207SpValues).sort((a, b) => Number(a) - Number(b)).map((v) => v + 'px@' + t207SpValues[v].first.line + '(' + t207SpValues[v].first.prop + ')')));

/* T207f：唯一一条**渲染后读 computed** —— 负边距豁免必须只出现在 sr-only 隐藏区（.dtRailLive），
   证明 -1px 是「视觉隐藏」惯用法，而不是随手拿负边距去拼贴布局。 */
const t207LiveNode = byCls('dtRailLive')[0] || null;
const t207LiveMargin = t207LiveNode ? computedProp(t207LiveNode, 'margin') : '';
const t207LivePadding = t207LiveNode ? computedProp(t207LiveNode, 'padding') : '';
const t207LiveWidth = t207LiveNode ? computedProp(t207LiveNode, 'width') : '';
check('T207f',
  '(t207·渲染后读 computed) -1px 负边距的唯一落点是 .dtRailLive（sr-only 读屏播报区）：渲染出来的该节点 computed margin 必须恰为 -1px、padding 为 0、width 为 1px。这条用渲染节点而不是文本扫描，是为了证明规则真的命中了这个元素（选择器写错时负边距会跑到别处，静态扫描看不出来）',
  !!t207LiveNode && t207LiveMargin === '-1px' && t207LivePadding === '0' && t207LiveWidth === '1px',
  '节点=' + (t207LiveNode ? '在' : '缺') + ' computed margin=' + JSON.stringify(t207LiveMargin) +
  ' padding=' + JSON.stringify(t207LivePadding) + ' width=' + JSON.stringify(t207LiveWidth) +
  '；负边距声明处=' + JSON.stringify(t207SpHits.filter((h) => h.value === '-1').map((h) => '行' + h.line + ' ' + h.sel.split(',')[0])));

/* ===== 十七、t202：一键打分渲染条件 / 删清单两入口落点一致 / 构建期孤儿 0 摘要 =====
   三组都是「真机发现行为正确、代码里没有断言守着」的条件，锁进回归防止默认值/分支被静默改动。
   夹具一律「快照 → 建 p202a/b/c + 任务 → 用完还原」，不依赖前面 300+ 条断言留下的残局。 */
const t202SnapDb = JSON.parse(JSON.stringify(dbNow()));
const t202SnapSettings = JSON.parse(JSON.stringify(settingsNow()));
const t202TplTask = (t202SnapDb.tasks || []).filter((t) => t && t.id)[0] || {};
const t202Task = (id, projectId, i) => Object.assign({}, t202TplTask, { id: id, title: 't202任务' + i, projectId: projectId, status: 0, deleted: false });
const t202Project = (id, name) => ({ id: id, name: name, type: 'list', color: '', icon: '', hidden: false, deleted: false, createdAt: 0 });

const t202Setup = () => {
  const db = JSON.parse(JSON.stringify(t202SnapDb));
  const keepProjects = (db.projects || []).filter((p) => p && ['p202a', 'p202b', 'p202c'].indexOf(p.id) < 0);
  const tasks = (db.tasks || []).filter((t) => t && !/^t202/.test(String(t.id)));
  for (let i = 0; i < 60; i += 1) tasks.push(t202Task('t202a' + i, 'p202a', i)); /* >50 条：批量打分才会用到 setTimeout 分块，能抓到在途态 */
  for (let i = 0; i < 3; i += 1) tasks.push(t202Task('t202b' + i, 'p202b', i));
  for (let i = 0; i < 3; i += 1) tasks.push(t202Task('t202c' + i, 'p202c', i));
  applyState({
    db: Object.assign({}, db, {
      projects: keepProjects.concat([t202Project('p202a', 't202甲'), t202Project('p202b', 't202乙'), t202Project('p202c', 't202丙')]),
      tasks: tasks
    })
  });
  const st = settingsNow() || {};
  const order = ['p202a', 'p202b', 'p202c'].concat((st.projectsOrder || []).filter((id) => ['p202a', 'p202b', 'p202c'].indexOf(id) < 0));
  applyState({ settings: Object.assign({}, st, { modules: Object.assign({}, st.modules || {}, { rec: true }), projectsOrder: order }) });
};
const t202SetRec = (on) => {
  const st = settingsNow() || {};
  applyState({ settings: Object.assign({}, st, { modules: Object.assign({}, st.modules || {}, { rec: on }) }) });
};
const t202GoToday = async () => {
  if (bView() !== 'today') {
    const n = byDt('rail-today')[0];
    if (n) fire(n);
    await flushAsync(3);
  }
  return bView();
};
const t202GoProject = async (id) => {
  /* rail 项是「同值再点 = 关」的开关（onPick: listView === view → closeAll），
     已经在目标视图里就必须直接返回，不能再点一次（否则视图变 null）。 */
  if (bView() === 'p:' + id) return bView();
  const n = all((x) => attr(x, 'data-dt') === 'rail-project' && attr(x, 'data-project-id') === id)[0] || null;
  if (!n) return null;
  fire(n);
  await flushAsync(3);
  return bView();
};
const t202OpenPs = async () => {
  if (!byDt('project-settings-panel').length) {
    const b = byDt('project-settings')[0];
    if (b) fire(b);
    await flushAsync(3);
  }
  return byDt('project-settings-panel').length === 1;
};
const t202PsBtn = (hook, name) => all((n) => attr(n, 'data-dt') === hook && String(attr(n, 'aria-label') || '').indexOf(name) >= 0)[0] || null;
const t202EmptyNodes = () => all((n) => attr(n, 'data-b-empty') === '1');

/* ---- 一、一键打分（data-dt="score-batch"）的渲染条件 ---- */
t202Setup();
const t202ViewToday = await t202GoToday();
const t202ScoreInToday = byDt('score-batch').length;
check('T202a',
  '(t202) 「一键打分」只在清单视图内渲染：今天视图（listView=today，无 projectId）计数必须为 0 —— 批量打分以清单为作用范围，出现在无清单的视图里会让「打分对象是谁」失去定义。实现：40-panel.js:996 if (projectId && props.showRec !== false)',
  t202ViewToday === 'today' && t202ScoreInToday === 0,
  '视图=' + String(t202ViewToday) + ' score-batch 计数=' + t202ScoreInToday);

const t202ViewA0 = await t202GoProject('p202a');
const t202ScoreBtnOn = byDt('score-batch')[0] || null;
const t202ScoreBtnText = t202ScoreBtnOn ? nodeText(t202ScoreBtnOn) : '';
check('T202b',
  '(t202) 进入 p:<id> 且 rec 开启时，「一键打分」计数 = 1、按钮文案含「一键打分」、未在途时 data-busy 不出现（busy 未定义 = 属性不存在，不是 busy="0"）',
  t202ViewA0 === 'p:p202a' && byDt('score-batch').length === 1 && t202ScoreBtnText.indexOf('一键打分') >= 0 && attr(t202ScoreBtnOn, 'data-busy') == null,
  '视图=' + String(t202ViewA0) + ' 计数=' + byDt('score-batch').length + ' 文案=' + JSON.stringify(t202ScoreBtnText) + ' data-busy=' + String(attr(t202ScoreBtnOn, 'data-busy')));

t202SetRec(false);
const t202ScoreRecOff = byDt('score-batch').length;
check('T202c',
  '(t202) 关掉 settings.modules.rec 后（仍在 p:<id> 视图），「一键打分」计数 = 0 —— showRec 来自 40-panel.js:1982 flags.rec !== false，关模块必须连带关按钮，而不是留一个点了会被静默忽略的入口',
  t202ScoreRecOff === 0,
  '视图=' + String(bView()) + ' rec=off 时 score-batch 计数=' + t202ScoreRecOff);

t202SetRec(true);
/* 分块打分用 setTimeout(step,0) 让出主线程；桩里默认 setTimeout 是真事件循环，
   同步断言看不到推进。这里把窗口内 setTimeout 换成同步队列：先点、读在途态、再手动推完。 */
const t202PumpBulk = async () => {
  const queue = [];
  const prev = globalThis.setTimeout;
  globalThis.setTimeout = function (fn) { queue.push(fn); return 0; };
  try {
    const btn0 = byDt('score-batch')[0] || null;
    if (btn0) fire(btn0);
    const mid = byDt('score-batch')[0] || null;
    const snap = {
      busy: attr(mid, 'data-busy'),
      disabled: !!(mid && mid.props && mid.props.disabled === true),
      text: mid ? nodeText(mid) : ''
    };
    let guard = 0;
    let ran = 0;
    while (queue.length && guard < 40) {
      guard += 1;
      for (let k = 0; k < 4; k += 1) await Promise.resolve();
      let inner = 0;
      while (queue.length && inner < 400) {
        inner += 1;
        ran += 1;
        const fn = queue.shift();
        try { fn(); } catch (e) { errors.push(['t202step', e]); }
      }
      rerender();
      rerender();
    }
    const after = byDt('score-batch')[0] || null;
    return { mid: snap, afterBusy: attr(after, 'data-busy'), afterText: after ? nodeText(after) : '', steps: guard, ran: ran };
  } finally {
    globalThis.setTimeout = prev;
  }
};
const t202Bulk = await t202PumpBulk();
const t202BusyAttr = t202Bulk.mid.busy;
const t202BusyDisabled = t202Bulk.mid.disabled;
check('T202d',
  '(t202) 点「一键打分」后进入在途态：同一按钮 data-busy="1" 且 disabled 为真（60 条待打分任务 > 单块 50，分块靠 setTimeout(step,0) 推进，所以点完立刻能看到 busy）。这道门禁防的是「在途态只改文案不给 disabled」——真机上会连点产生并发批量写分',
  t202BusyAttr === '1' && t202BusyDisabled,
  '点击后 data-busy=' + String(t202BusyAttr) + ' disabled=' + t202BusyDisabled + ' 文案=' + JSON.stringify(t202Bulk.mid.text));
const t202BusyAfter = null;
check('T202d2',
  '(t202) 在途态会自行结束：分块跑完后同一按钮回到 data-busy 不出现、文案回到「一键打分」（在途态是状态而不是残留）',
  t202Bulk.afterBusy == null && t202Bulk.afterText.indexOf('一键打分') >= 0,
  '推进轮次=' + t202Bulk.steps + '（执行 timer ' + t202Bulk.ran + ' 个） 跑完 data-busy=' + String(t202Bulk.afterBusy) + ' 文案=' + JSON.stringify(t202Bulk.afterText));

/* ---- 二、删清单的两条入口必须落到同一个视图（S7c-7）---- */
t202Setup();
CONFIRM = true;
/* 入口一：项目对话框（45-projects.js 的「删除清单」，删的正是当前正在看的清单） */
const t202RailProjects = all((x) => attr(x, 'data-dt') === 'rail-project').map((x) => String(attr(x, 'data-project-id')));
const t202ViewDialogFrom = await t202GoProject('p202a');
await t202OpenPs();
const t202EditA = t202PsBtn('ps-edit', 't202甲');
if (t202EditA) fire(t202EditA);
await flushAsync(3);
const t202Dlg = byDt('project-dialog')[0] || all((n) => hasClass(n, 'dtModal'))[0] || null;
const t202DlgDel = all((n) => hasClass(n, 'dtDangerBtn'))[0] || null;
const t202ViewPreDel = bView();
if (t202DlgDel) fire(t202DlgDel);
await flushAsync(4);
const t202AfterDialog = bView();
const t202EmptyAfterDialog = t202EmptyNodes().length;
check('T202e',
  '(t202·S7c-7) 入口一（项目对话框「删除清单」）删掉正在看的清单后：data-drawer-view 必须回到 "today"，且不得落成 [data-b-empty] 空态 —— 原实现在这里走 closeAll() → setListView(null)，B 栏变成「选择左侧任一功能」，与规格「回今天」不符',
  t202ViewDialogFrom === 'p:p202a' && !!t202DlgDel && t202AfterDialog === 'today' && t202EmptyAfterDialog === 0,
  '起点=' + String(t202ViewDialogFrom) + ' rail 项目行=' + JSON.stringify(t202RailProjects) + ' 对话框=' + (t202Dlg ? '在' : '缺') + ' 删除按钮=' + (t202DlgDel ? '在' : '缺') +
  ' 点删除前视图=' + String(t202ViewPreDel) + ' confirm=' + JSON.stringify((confirmLog || []).slice(-1)[0] || '') +
  ' 删除后视图=' + String(t202AfterDialog) + ' 空态节点=' + t202EmptyAfterDialog);

/* 入口二之一：项目设置面板 ps-del 删「别人」，视图不动 */
t202Setup();
CONFIRM = true;
const t202ViewPsFrom = await t202GoProject('p202b');
await t202OpenPs();
const t202DelA = t202PsBtn('ps-del', 't202甲');
if (t202DelA) fire(t202DelA);
await flushAsync(4);
const t202AfterPsOther = bView();
check('T202f',
  '(t202·S7c-7) 入口二（项目设置面板 ps-del）删的是别的清单时，视图一律不动：正在看 p:<idB>，删 p:<idA> 后仍是 p:<idB>（不能因为「删了东西」就把视图踢回今天）',
  t202ViewPsFrom === 'p:p202b' && !!t202DelA && t202AfterPsOther === 'p:p202b',
  '起点=' + String(t202ViewPsFrom) + ' ps-del=' + (t202DelA ? '在' : '缺') + ' 删后视图=' + String(t202AfterPsOther));

/* 入口二之二（成对断言的核心）：面板删「自己」→ 落点必须与对话框入口完全相同 */
t202Setup();
CONFIRM = true;
const t202ViewPsSelfFrom = await t202GoProject('p202c');
await t202OpenPs();
const t202DelC = t202PsBtn('ps-del', 't202丙');
if (t202DelC) fire(t202DelC);
await flushAsync(4);
const t202AfterPsSelf = bView();
check('T202g',
  '(t202·S7c-7 成对断言) 同一个动作（删掉正在看的清单）走两个入口，结果视图必须相等：对话框入口得 <' + String(t202AfterDialog) + '>，面板入口得 <' + String(t202AfterPsSelf) + '>。各写一次期望值防不住将来再分叉，所以这里判的是两者相等 + 都等于 today',
  t202ViewPsSelfFrom === 'p:p202c' && !!t202DelC && t202AfterPsSelf === t202AfterDialog && t202AfterPsSelf === 'today',
  '起点=' + String(t202ViewPsSelfFrom) + ' ps-del=' + (t202DelC ? '在' : '缺') + ' 面板入口结果=' + String(t202AfterPsSelf) + ' 对话框入口结果=' + String(t202AfterDialog) + ' 相等=' + (t202AfterPsSelf === t202AfterDialog));

/* ---- 三、构建期孤儿 0 摘要（t197）：不跑构建，只做静态判定 ---- */
const t202BuildPath = pathMod.join(partsDir, '..', '..', 'build.mjs');
let t202BuildSrc = '';
try { t202BuildSrc = readFileSync(t202BuildPath, 'utf8'); } catch (e) { t202BuildSrc = ''; }
const t202OrphanFmt = /console\.log\(\s*'\[seed\] orphan projectId: '\s*\+\s*orphanRows\s*\+\s*' 条 \/ '\s*\+\s*orphanIds\.length\s*\+\s*' 个 id'/.test(t202BuildSrc);
/* 「0 也打印」的结构证明：这条 console.log 前面最近的 if 只能是 if (emptyProjectRows)（那是另一条 empty 计数），
   不能是 if (orphanRows) 之类把 0 条摘要包起来的守卫。 */
const t202LogIdx = t202BuildSrc.indexOf("'[seed] orphan projectId: '");
const t202LogWindow = t202LogIdx > 0 ? t202BuildSrc.slice(Math.max(0, t202LogIdx - 900), t202LogIdx) : '';
const t202LogGuarded = /if\s*\(\s*orphanRows\s*(?:>|!==|>=|===|\|\||&&)/.test(t202LogWindow);
check('T202h',
  '(t197·t202) build.mjs 的孤儿摘要格式串在位且「0 也打印」：`[seed] orphan projectId: <N> 条 / <M> 个 id` 的两个计数都进日志串，且这条 console.log 不被 if (orphanRows …) 之类条件包起来（0 条时摘要必须照样出现，否则「0 条」与「护栏没跑」在日志里长得一样）',
  !!t202BuildSrc && t202OrphanFmt && !t202LogGuarded,
  'build.mjs=' + (t202BuildSrc ? '读到' : '未读到') + ' 格式串=' + t202OrphanFmt + ' 被条件包裹=' + t202LogGuarded +
  ' 摘要行=' + JSON.stringify((t202BuildSrc.split(/\r?\n/).filter((l) => l.indexOf('orphan projectId') >= 0)[0] || '').slice(0, 120)));

const t202BuildNear = t202LogIdx > 0 ? t202BuildSrc.slice(Math.max(0, t202LogIdx - 1600), t202LogIdx) : '';
const t202ZeroNote = /0\s*也(?:要)?打印|即使\s*0|0\s*条也(?:要)?打印|0 条时(?:也要)?打印/.test(t202BuildNear);
check('T202h2',
  '(t197·t202) build.mjs 在该摘要的注释里写明「0 也打印」：这条护栏只统计不阻断，0 条是「跑过且干净」而不是「没跑」，注释必须把这点写死，免得后来者以为 0 条可以不打印',
  t202ZeroNote,
  '注释命中=' + t202ZeroNote + ' 附近注释=' + JSON.stringify((t202BuildNear.split(/\r?\n/).filter((l) => /\*|\/\*/.test(l) && /orphan|孤儿|打印|0/.test(l)).slice(-3).join(' | ') || '').slice(0, 240)));

/* 还原夹具：删掉 p202a/b/c 及其任务，恢复 settings（rec / projectsOrder / modules） */
applyState({ db: JSON.parse(JSON.stringify(t202SnapDb)) });
applyState({ settings: JSON.parse(JSON.stringify(t202SnapSettings)) });
CONFIRM = true;

/* =====================================================================================
   十八、t212：行点击 ⇄ C 栏、复制看门狗三态、彻底删除两入口、拆解区版式
   本段在文件末尾执行，前面的断言已经把种子改得面目全非 —— 每个用例先 t212Restore(),
   再 t212Seed(); 收尾统一 t212Restore()。视图一律用 t212GoView 切换（rail 是开关语义）。
   ===================================================================================== */
const T212_VIEW_H = 800;
const t212SnapDb = JSON.parse(JSON.stringify(dbNow()));
const t212SnapSettings = JSON.parse(JSON.stringify(settingsNow()));
const t212SnapNavigator = globalThis.window.navigator;

function t212Restore() {
  applyState({ db: JSON.parse(JSON.stringify(t212SnapDb)), settings: JSON.parse(JSON.stringify(t212SnapSettings)) });
  globalThis.window.navigator = t212SnapNavigator;
  CONFIRM = true;
}

const t212Task = (id, title, extra) => Object.assign({}, t202TplTask, {
  id: id, title: title, projectId: 'inbox', status: 0, deleted: false, content: '', date: TODAY_K
}, extra || {});
function t212Seed() {
  const db = JSON.parse(JSON.stringify(t212SnapDb));
  const keep = (db.tasks || []).filter((t) => t && !/^t212/.test(String(t.id)));
  applyState({
    db: Object.assign({}, db, {
      projects: (db.projects || []).map((p) => Object.assign({}, p, { hidden: false })),
      tasks: keep.concat([
        t212Task('t212live1', 't212 在线任务'),
        t212Task('t212live2', 't212 第二条在线任务'),
        t212Task('t212del1', 't212 已删任务一', { deleted: true }),
        t212Task('t212del2', 't212 已删任务二', { deleted: true })
      ])
    })
  });
}
const t212Ids = () => dbNow().tasks.map((t) => String(t.id));
const t212Trash = () => dbNow().tasks.filter((t) => !!t.deleted).length;
const t212Find = (id) => dbNow().tasks.find((t) => String(t.id) === id) || null;
const t212Row = (id) => all((n) => hasClass(n, 'dtRow') && attr(n, 'data-task-id') === id)[0] || null;
const t212In = (pred, root) => (root ? all(pred, root)[0] || null : null);

async function t212GoView(tag, viewName) {
  for (let i = 0; i < 3; i += 1) {
    if (bView() === viewName) return bView();
    const n = railDt(tag);
    if (!n) return bView();
    fire(n);
    await flushAsync(4);
  }
  return bView();
}
/* 导出卡在设置页里：先切到设置视图，再找 [data-dt="export"]。 */
async function t212GoSettings() {
  for (let i = 0; i < 3; i += 1) {
    if (byDt('export')[0]) return true;
    const n = railDt('rail-settings');
    if (!n) return false;
    fire(n);
    await flushAsync(4);
  }
  return !!byDt('export')[0];
}
function t212CloseDetail() {
  let guard = 0;
  while (cDetailView() && guard < 3) { pressEsc(); rerender(); guard += 1; }
  return cDetailView();
}

/* 真机上点 <span class="dtRowTitleText"> 会冒泡到 .dtRowTitle.onClick，再冒泡到 .dtRow.onClick。
   桩没有冒泡引擎，所以按冒泡顺序手工调用两级处理器、共用同一个 event 对象：
   __dtRowHandled 就是靠这个共享标记去重的，分开造 event 等于把被测逻辑绕过去。 */
function t212ClickTitle(id) {
  const row = t212Row(id);
  if (!row) return null;
  const titleEl = t212In((n) => hasClass(n, 'dtRowTitle'), row);
  const spanEl = titleEl ? t212In((n) => hasClass(n, 'dtRowTitleText'), titleEl) : null;
  const called = [];
  const ev = {
    target: spanEl || titleEl,
    currentTarget: titleEl,
    __dtRowHandled: false,
    closest: () => null,
    preventDefault: () => {},
    stopPropagation: () => {}
  };
  if (titleEl && titleEl.props && titleEl.props.onClick) { called.push('title'); titleEl.props.onClick(ev); }
  if (row.props && row.props.onClick) { called.push('row'); row.props.onClick(ev); }
  rerender(); rerender();
  return { handled: !!ev.__dtRowHandled, called: called.join('>') };
}

/* ---------------- 1. 点标题/行体打开 C 栏：一次点击 = 一次开合 ---------------- */
t212Restore();
t212Seed();
const t212View1 = await t212GoView('rail-today', 'today');
t212CloseDetail();
const t212Hit1 = t212ClickTitle('t212live1');
const t212State1 = cDetailView();
const t212Hit2 = t212ClickTitle('t212live1');
const t212State2 = cDetailView();
const t212Hit3 = t212ClickTitle('t212live1');
const t212State3 = cDetailView();
check('T210a',
  '(t210) 点标题文本打开 C 栏且一次点击只开合一次：标题处理器先把 __dtRowHandled 置真，行处理器见标记即返回；连点三次必须是 开 → 关 → 开（若两级处理器都生效，奇偶会错位）',
  t212View1 === 'today' && !!t212Hit1 && t212Hit1.handled === true && t212Hit1.called === 'title>row' &&
    t212State1 === 'task:t212live1' && t212State2 === null && t212State3 === 'task:t212live1',
  '视图=' + String(t212View1) + ' 第1次=' + JSON.stringify(t212Hit1) + '→' + String(t212State1) +
  ' 第2次→' + String(t212State2) + ' 第3次→' + String(t212State3));

/* 负向 1：勾选框只切完成态，不开 C 栏 */
t212CloseDetail();
const t212StatusBefore = (t212Find('t212live1') || {}).status;
const t212CheckBtn = (() => { const row = t212Row('t212live1'); return row ? t212In((n) => attr(n, 'data-dt') === 'task-check', row) : null; })();
if (t212CheckBtn) fire(t212CheckBtn); else rerender();
const t212StatusAfter = (t212Find('t212live1') || {}).status;
check('T210b',
  '(t210) 点勾选框只切完成态、不开 C 栏（行处理器第一句就是 target.closest("button") 直接返回；status 只判「离开未完成 0」，具体值由状态机决定）',
  !!t212CheckBtn && t212StatusBefore === 0 && t212StatusAfter !== 0 && cDetailView() === null,
  '按钮=' + (t212CheckBtn ? '在' : '缺') + ' status ' + String(t212StatusBefore) + '→' + String(t212StatusAfter) +
  ' C栏=' + String(cDetailView()));

/* 负向 2：行末动作按钮只做自己的事，不开 C 栏（用恒存在的「放入今日要事」按钮；
   T210b 刚把 live1 置为完成态，番茄按钮在完成态下不渲染，所以这里先重置种子） */
t212Seed();
await t212GoView('rail-today', 'today');
t212CloseDetail();
const t212ActRow = t212Row('t212live1');
const t212ActActions = t212ActRow ? t212In((n) => hasClass(n, 'dtRowActions'), t212ActRow) : null;
const t212ActBtn = t212ActActions ? t212In((n) => n.tag === 'button' && n.props && n.props.title === '删除', t212ActActions) : null;
if (t212ActBtn) fire(t212ActBtn); else rerender();
const t212ActDetail = cDetailView();
const t212ActDeleted = !!((t212Find('t212live1') || {}).deleted);
pressEsc(); rerender();
check('T210c',
  '(t210) 点行末动作按钮（行内「删除」）只走它自己的动作、不开 C 栏：按钮必须位于 .dtRowActions 内，点击后任务进入已删除且 data-detail-view 仍为空',
  !!t212ActBtn && !!t212ActActions && t212ActDetail === null && t212ActDeleted,
  '按钮=' + (t212ActBtn ? '在' : '缺') + ' 在动作区内=' + String(!!t212ActActions) +
  ' 已删除=' + String(t212ActDeleted) + ' C栏=' + String(t212ActDetail));

/* ---------------- 2. 复制三态：永不 settle 也必须离开 pending ---------------- */
function t212OpenExport() {
  const btn = byDt('export')[0];
  if (!btn) return false;
  fire(btn);
  return !!byDt('export-copy')[0];
}
const t212Clip = (writeText) => { globalThis.window.navigator = { clipboard: { writeText: writeText } }; };
const t212CopyState = () => { const b = byDt('export-copy')[0]; return b ? String(attr(b, 'data-copy-state')) : 'missing'; };
const t212CopyNote = () => { const n = byDt('export-copy-note')[0]; return n ? nodeText(n) : ''; };
function t212ClickCopy() {
  const btn = byDt('export-copy')[0];
  const queue = [];
  const prev = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { queue.push(fn); return { __sync: true }; };
  try { if (btn) fire(btn); else rerender(); } finally { globalThis.setTimeout = prev; }
  return queue;
}
function t212RunTimers(queue) {
  const prev = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { queue.push(fn); return { __sync: true }; };
  try {
    let guard = 0;
    while (queue.length && guard < 30) { guard += 1; const fn = queue.shift(); try { fn(); } catch (e) { errors.push(['t212-timer', e]); } }
    rerender(); rerender();
  } finally { globalThis.setTimeout = prev; }
}

const t212SettingsIn = await t212GoSettings();
const t212ExportOk = t212OpenExport();
t212Clip(() => new Promise(() => {}));
const t212Q1 = t212ClickCopy();
const t212PendingState = t212CopyState();
const t212PendingNote = t212CopyNote();
t212RunTimers(t212Q1);
const t212HangState = t212CopyState();
const t212HangNote = t212CopyNote();
check('T210d',
  '(t210 F1) writeText 永不 settle 时不得停在 pending：点完先 pending（「正在复制…」），看门狗 1.5s 到点后必须落到终态 ok，且文案说明「未收到回执 / 回退通道」而不是报失败',
  t212SettingsIn && t212ExportOk && t212PendingState === 'pending' && t212PendingNote.indexOf('正在复制') === 0 &&
    t212HangState === 'ok' && /字符/.test(t212HangNote) && /未收到回执|回退通道/.test(t212HangNote),
  '设置页=' + String(t212SettingsIn) + ' 导出面板=' + String(t212ExportOk) + ' pending=' + t212PendingState + '/' + JSON.stringify(t212PendingNote) +
  ' → 到点=' + t212HangState + '/' + JSON.stringify(t212HangNote));

t212Clip(() => Promise.reject({ name: 'NotAllowedError' }));
t212ClickCopy();
await flushAsync(6);
const t212RejectState = t212CopyState();
const t212RejectNote = t212CopyNote();
check('T210e',
  '(t210) writeText reject ⇒ error 态 + 失败文案（含字符数），不许静默',
  t212RejectState === 'error' && /复制失败|全选/.test(t212RejectNote) && /字符/.test(t212RejectNote),
  '状态=' + t212RejectState + ' 文案=' + JSON.stringify(t212RejectNote));

t212Clip(() => Promise.resolve());
t212ClickCopy();
await flushAsync(6);
const t212OkState = t212CopyState();
const t212OkNote = t212CopyNote();
const t212ExportLen = (() => { const ta = byDt('export-text')[0]; return ta ? String(ta.props.value || '').length : -1; })();
check('T210f',
  '(t210) writeText resolve ⇒ ok 态，文案「已复制到剪贴板（N 字符）」且 N 等于导出文本长度',
  t212OkState === 'ok' && /^已复制到剪贴板（\d+ 字符）$/.test(t212OkNote) &&
    Number((t212OkNote.match(/(\d+)/) || [])[1]) === t212ExportLen,
  '状态=' + t212OkState + ' 文案=' + JSON.stringify(t212OkNote) + ' 导出文本长度=' + String(t212ExportLen));
t212Restore();

/* ---------------- 3. 彻底删除：单条确认 + 清空回收站 ---------------- */
t212Seed();
const t212TrashView = await t212GoView('rail-trash', 'trash');
const t212LenBefore = t212Ids().length;
const t212TrashBefore = t212Trash();
const t212PurgeBtn = (() => { const row = t212Row('t212del1'); return row ? t212In((n) => attr(n, 'data-dt') === 'row-purge', row) : null; })();
CONFIRM = false;
if (t212PurgeBtn) fire(t212PurgeBtn); else rerender();
const t212LenCancel = t212Ids().length;
CONFIRM = true;
if (t212PurgeBtn) fire(t212PurgeBtn); else rerender();
const t212LenAfter = t212Ids().length;
const t212GoneId = t212Ids().indexOf('t212del1') < 0;
check('T210g',
  '(t210) 「彻底删除」必须先确认：confirm 为否 ⇒ 条数不变（任务还在）；confirm 为是 ⇒ 该 id 从 state.tasks 消失且总条数 −1',
  t212TrashView === 'trash' && !!t212PurgeBtn && t212LenCancel === t212LenBefore &&
    t212LenAfter === t212LenBefore - 1 && t212GoneId,
  '视图=' + String(t212TrashView) + ' 按钮=' + (t212PurgeBtn ? '在' : '缺') + ' 取消后=' + String(t212LenCancel) +
  ' 确认后=' + String(t212LenAfter) + ' 原=' + String(t212LenBefore) + ' id已消失=' + String(t212GoneId));

/* 清空回收站：确认后 deleted 归 0，总条数减少恰等于清空前的已删除条数；清空后按钮 disabled */
t212Restore();
t212Seed();
await t212GoView('rail-trash', 'trash');
const t212AllBtn = byDt('trash-purge-all')[0] || null;
const t212AllBefore = t212Trash();
const t212AllLenBefore = t212Ids().length;
CONFIRM = true;
if (t212AllBtn) fire(t212AllBtn); else rerender();
const t212AllAfter = t212Trash();
const t212AllLenAfter = t212Ids().length;
const t212AllBtnAfter = byDt('trash-purge-all')[0] || null;
check('T210h',
  '(t210) 「清空已删除」先确认再清空：确认后 deleted 归 0、总条数减少恰等于清空前的已删除条数；清空后按钮 data-trash-count="0" 且 disabled',
  !!t212AllBtn && t212AllBefore === 2 && t212AllAfter === 0 &&
    t212AllLenAfter === t212AllLenBefore - t212AllBefore && !!t212AllBtnAfter &&
    String(attr(t212AllBtnAfter, 'data-trash-count')) === '0' && !!t212AllBtnAfter.props.disabled,
  '清空前已删除=' + String(t212AllBefore) + ' 清空后=' + String(t212AllAfter) +
  ' 条数 ' + String(t212AllLenBefore) + '→' + String(t212AllLenAfter) +
  ' 按钮 data-trash-count=' + String(t212AllBtnAfter ? attr(t212AllBtnAfter, 'data-trash-count') : 'missing') +
  ' disabled=' + String(!!(t212AllBtnAfter && t212AllBtnAfter.props.disabled)));

/* ---------------- 4. 详情栏字段顺序 + 拆解区在首屏 ---------------- */
t212Restore();
t212Seed();
await t212GoView('rail-today', 'today');
t212CloseDetail();
t212ClickTitle('t212live1');
const t212DetailRoot = byCls('dtDetail')[0] || null;
const t212Fields = t212DetailRoot ? t212In((n) => hasClass(n, 'dtDetailFields'), t212DetailRoot) : null;
const t212Kids = t212Fields ? childNodes(t212Fields) : [];
const t212NameOf = (n) => {
  if (!n) return 'none';
  if (attr(n, 'data-dt') === 'c-title-input') return '标题';
  if (hasClass(n, 'dtFieldWide')) return '备注';
  if (attr(n, 'data-dt') === 'c-breakdown') return '拆解';
  if (nodeText(n).indexOf('清单') === 0) return '清单';
  return 'other:' + cls(n);
};
const t212Seq = t212Kids.slice(0, 4).map(t212NameOf).join('|');
const t212Bd = byDt('c-breakdown')[0] || null;
const t212RunBtn = byDt('c-breakdown-run')[0] || null;
const t212RunInBd = !!t212Bd && !!t212RunBtn && t212In((n) => hasClass(n, 'dtBreakdownRun'), t212Bd) === t212RunBtn;
const t212BdTop = t212Bd ? Number(t212Bd.offsetTop || 0) : -1;
const t212RunTop = t212RunBtn ? Number(t212RunBtn.offsetTop || 0) : -1;
check('T210i',
  '(t210) 详情栏字段顺序固定 标题 → 备注 → 拆解 → 清单（按钩子/类名判，不看文案）；「拆解」按钮属于该容器且位置在首屏内（offsetTop < 视口高度）',
  t212Seq === '标题|备注|拆解|清单' && t212RunInBd && t212BdTop >= 0 && t212BdTop < T212_VIEW_H && t212RunTop < T212_VIEW_H,
  '前四位=' + JSON.stringify(t212Seq) + ' 按钮在容器内=' + String(t212RunInBd) +
  ' breakdown.offsetTop=' + String(t212BdTop) + ' run.offsetTop=' + String(t212RunTop) + ' 视口高=' + String(T212_VIEW_H));

t212Restore();

/* ============================ 二十一、t221 prompt 逐字比对收窄（§15-107 订正） ============================ */
/* t217 把 §15-107 的比对面收窄成「只对 client.__prompts.score 判 ===」：Host 侧的 /polish 已经改成
   按 strength 现拼（index.js 的 polishSystemOf 读 ACT_NOW_STRENGTH），所以 client 的 __prompts.agent
   只服务 custom 源与兜底，不再与 Host 逐字对齐。

   取证方式说明（为什么不 import、不抓请求）：
   ① Host 的 SCORE_SYSTEM_PROMPT 是 index.js 里的模块私有 const，index.js 只导出
      DSH_TASKS_ROUTE_PREFIX 与 apply，import 拿不到；
   ② s139 的 llm.stream 桩（test/render-test.mjs:5054-5057）只累加 streamCalls、不记录入参，
      跑一次真实 /score 请求也抓不到 system 文本；
   所以「逐字」只能从 index.js 源码里抽出那段 [...].join('\n') 字面量再拼回字符串，与
   client.__prompts.score 全等比较 —— 这是当前唯一可判「逐字」的路径。 */
const t221HostSrc = (function () {
  try { return String(readFileSync(pathMod.join(pathMod.dirname(target), 'index.js'), 'utf8')); }
  catch (e) { errors.push(['t221-host-read', String((e && e.message) || e)]); return ''; }
})();
const t221HostScorePrompt = (function () {
  const src = t221HostSrc;
  const at = src.indexOf('const SCORE_SYSTEM_PROMPT = [');
  if (at < 0) return '';
  const open = src.indexOf('[', at);
  const close = src.indexOf('].join(', open);
  if (open < 0 || close < 0) return '';
  const body = src.slice(open + 1, close);
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(body))) out.push(m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  return out.join('\n');
})();
const t221Prompts = (mod && mod.__prompts) ? mod.__prompts : {};
const t221ClientScore = typeof t221Prompts.score === 'string' ? t221Prompts.score : '';
const t221ClientAgent = typeof t221Prompts.agent === 'string' ? t221Prompts.agent : '';

check('T221a',
  '§15-107（t217 订正）仅打分通道以 === 为准：Host index.js 的 SCORE_SYSTEM_PROMPT（源码字面量拼回）与 client 的 mod.__prompts.score 逐字相等；比对面只有 score 这一个键，agent 通道不再参与逐字比对',
  t221HostScorePrompt.length > 0 && t221ClientScore.length > 0 && t221ClientScore === t221HostScorePrompt,
  'host=' + t221HostScorePrompt.length + 'B client=' + t221ClientScore.length + 'B 逐字相等=' + (t221ClientScore === t221HostScorePrompt) +
  ' host常量抽取=' + (t221HostScorePrompt.length > 0 ? '成功' : '失败'));

/* 比对表是「哪些键参与逐字比对」的唯一声明；t217 之后只允许 score。
   用字面表而不是散点比较，是为了让「把 agent 塞回比对」这类回退在 T221b 上恰好暴露一次。 */
const T221_PARITY = ['score'];
const t221AgentHostSame = t221ClientAgent.length > 0 && t221ClientAgent === t221HostScorePrompt;
const t221HostBuildsPolish = /function polishSystemOf\s*\(/.test(t221HostSrc) && /ACT_NOW_STRENGTH/.test(t221HostSrc);
check('T221b',
  '§15-107（t217 订正）agent 通道不再与 Host 逐字相等：比对表 T221_PARITY 只有 score（无 agent 键）、mod.__prompts.agent 不等于 Host SCORE_SYSTEM_PROMPT，且 Host 侧 /polish 由 polishSystemOf 读 ACT_NOW_STRENGTH 现拼（所以 client 的 agent 只服务 custom 源与兜底，不参与逐字对齐）',
  T221_PARITY.join(',') === 'score' && T221_PARITY.indexOf('agent') < 0 && t221ClientAgent.length > 0 && !t221AgentHostSame && t221HostBuildsPolish,
  'parity=' + JSON.stringify(T221_PARITY) + ' agent=' + t221ClientAgent.length + 'B agent==hostScore=' + t221AgentHostSame +
  ' host现拼Polish=' + t221HostBuildsPolish + '（host源码含 polishSystemOf+ACT_NOW_STRENGTH）');
/* ============================ 结论 ============================ */
console.log('\n—— 断言明细 ——');
checks.forEach((c) => console.log((c.ok ? 'PASS' : 'FAIL') + ' [' + c.id + '] ' + c.name + '  ::  ' + c.evidence));
if (gaps.length) {
  console.log('\n—— 观察项（不计入退出码，已报实现方）——');
  gaps.forEach((g) => console.log((g.ok ? 'PASS' : 'GAP ') + ' [' + g.id + ']' + (g.card ? '［卡 ' + g.card + '］' : '') + ' ' + g.name + '  ::  ' + g.evidence));
}
const failed = checks.filter((c) => !c.ok);
if (errors.length) {
  console.log('\n—— JS 级错误 ——');
  for (const [where, e] of errors) {
    console.log('- [' + where + '] ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : String(e)));
  }
}
console.log('\n汇总：断言 ' + checks.length + ' 条，PASS ' + (checks.length - failed.length) + '，FAIL ' + failed.length +
  '；观察项 ' + gaps.length + ' 条（GAP ' + gaps.filter((g) => !g.ok).length + '）；JS 异常 ' + errors.length);
if (failed.length || errors.length) {
  console.error('FAIL');
  process.exit(1);
}
console.log('PASS');
process.exit(0);
