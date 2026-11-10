window.__ModuleLoader__.load({
  id: '@local/dsh-tasks',
  factory: function (require) {
    'use strict';

    const React = require('react');
    /* React 18/19 对 `style` 传字符串会直接抛 #62（"The `style` prop expects a mapping..."），
       整个 slot entry 会被渲染器判崩溃并 abdicate，表现为「面板整块空白、点侧栏没反应」。
       本仓历史上有 9 处写成 CSS 文本（FatalCard、fatal-stack 等），统一在这一层归一化：
       字符串按声明解析成对象，其余原样透传（对象/undefined 不受影响）。 */
    const __createElement = React.createElement;

    function normalizeStyleValue(style) {
      if (typeof style !== 'string') return style;
      const out = {};
      const decls = style.split(';');
      for (let i = 0; i < decls.length; i += 1) {
        const decl = decls[i];
        const cut = decl.indexOf(':');
        if (cut < 0) continue;
        const key = decl.slice(0, cut).trim();
        const val = decl.slice(cut + 1).trim();
        if (!key || !val) continue;
        const camel = key.replace(/-([a-z])/g, function (_m, ch) { return ch.toUpperCase(); });
        out[camel] = val;
      }
      return out;
    }

    function h(type, props) {
      const args = Array.prototype.slice.call(arguments);
      const raw = args[1];
      if (raw !== null && typeof raw === 'object' && typeof raw.style === 'string') {
        args[1] = Object.assign({}, raw, { style: normalizeStyleValue(raw.style) });
      }
      return __createElement.apply(null, args);
    }

    h.Fragment = __createElement.Fragment;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useRef = React.useRef;

    const PANEL_ID = 'tasks';
    const STORE_KEY = 'dsh.tasks.v1';
    const STYLE_ID = 'dsh-tasks-style';

    /* ---------------------------------- 时间与文本工具 --------------------------------- */

    function pad2(n) {
      return n < 10 ? '0' + n : '' + n;
    }

    function parseISO(value) {
      if (!value) return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value));
      if (!m) return null;
      return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
    }

    function dateKey(d) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function isoMin(d) {
      return dateKey(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function startOfDay(d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function addDays(d, n) {
      const x = new Date(d.getTime());
      x.setDate(x.getDate() + n);
      return x;
    }

    function dayDiff(a, b) {
      return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
    }

    const WEEK = '日一二三四五六';

    function fmtDateLabel(d, now) {
      const diff = dayDiff(d, now);
      if (diff === 0) return '今天';
      if (diff === 1) return '明天';
      if (diff === 2) return '后天';
      if (diff === -1) return '昨天';
      const prefix = d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '年';
      return prefix + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
    }

    /* 行内状态区日期槽专用短标签（t134）：56px 的槽放不下「2027年10月15日 周五」这种全量
       标签（实测 97px），跨年时把年份交给 title 与 C 栏，槽内只保留「12月31日」这个最长形态
       （11px 下约 55px）。相对词（今天/明天/后天/昨天）优先，与全量标签同一口径。 */
    function fmtSlotDate(d, now) {
      const diff = dayDiff(d, now);
      if (diff === 0) return '今天';
      if (diff === 1) return '明天';
      if (diff === 2) return '后天';
      if (diff === -1) return '昨天';
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    function fmtClock(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return (m < 10 ? '0' + m : '' + m) + ':' + pad2(s);
    }

    function uid(prefix) {
      return (prefix || 't') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function clampText(value, max) {
      const text = String(value == null ? '' : value);
      return text.length > max ? text.slice(0, max) : text;
    }

    /* 标签清洗：字符串/数组/脏值一律归成干净数组，空标签不产生任何渲染 */
    function normalizeTags(value) {
      let raw = value;
      if (typeof raw === 'string') {
        if (raw === '[]' || raw === '[""]' || raw === "['']") return [];
        raw = raw.split(/[,，;；]/);
      }
      if (!Array.isArray(raw)) return [];
      const out = [];
      for (let i = 0; i < raw.length; i += 1) {
        const text = String(raw[i] == null ? '' : raw[i]).trim();
        if (!text || text === '[]' || text === 'null' || text === 'undefined') continue;
        if (out.indexOf(text) < 0) out.push(text);
      }
      return out;
    }

    /* ------------------------------------ 数据模型 ----------------------------------- */

    const SEED = /*__SEED__*/ null;
    /* 习惯（打卡实体）：由 build.mjs 从 tt-habits.json 注入，结构与 88-lunar 一样是纯数据 */
    const HABIT_SEED = /*__HABITS__*/ null;

    /* 四色体系（§0.6）：红=紧急/高、黄=中、蓝=低/重要、灰=无。
       全仓唯一色源，优先级与四象限都从这里取，禁止各自写 var() 或十六进制。 */
    const PALETTE = {
      red: 'var(--dsw-alias-state-error-primary)',
      yellow: 'var(--dsw-alias-state-warn-primary)',
      blue: 'var(--dsw-alias-brand-primary)',
      none: 'var(--dsw-alias-label-secondary)'
    };

    const QUAD_COLORS = {
      q1: PALETTE.red,
      q2: PALETTE.yellow,
      q3: PALETTE.blue,
      q4: PALETTE.none
    };

    const PRIORITY_META = {
      0: { label: '无', color: PALETTE.none },
      1: { label: '低', color: PALETTE.blue },
      3: { label: '中', color: PALETTE.yellow },
      5: { label: '高', color: PALETTE.red }
    };

    const REPEAT_OPTIONS = [
      { value: '', label: '不重复' },
      { value: 'DAILY', label: '每天' },
      { value: 'WEEKLY', label: '每周' },
      { value: 'MONTHLY', label: '每月' },
      { value: 'YEARLY', label: '每年' }
    ];

    /* 设置默认值：形状由 51-db 的 migrateSettingsToV2 单点定义（六组 IA：音效与提醒 / 主题 /
       服务商与模型 / 模块开关 / 数据 / 关于）。老键 notify / lead / defaultProject 原样保留，
       sound 由布尔升级成对象，enabled 承载老值——老用户「关掉音效」这件事不会丢。 */
    /* --------------------------- 分数圈五档色带（ui-spec §1.17，t133 合并） ---------------------------
       十档合并成五档（用户：颜色变化更少、更直观）。十个 anchor hex 仍只在这一处出现；
       样式表与行内样式都只引用变量 --dt-score-arc（浅色）/ --dt-score-arc-dark（深色），
       不得再写第二份 hex。band 只管颜色、tier 只管语义，两者互不推导（§1.17.3）。
       索引方向沿用十档：**band 0 = 最高分档（玫红）**，band 4 = 最低分档（浅灰），
       无分是 -1（虚线空环，与「打过 0 分」必须区分）。 */
    const SCORE_BAND_ANCHORS = {
      light: ['E93D82', 'F76B15', 'A3E635', '66B8FF', '8B8D98'],
      dark: ['FF5CAA', 'FF8B3D', 'B8F04A', '8CC8FF', '9C9DA8']
    };
    /* band i 的下界：band 0 >=80、band 1 >=60、band 2 >=40、band 3 >=20、band 4 <20。
       左闭右开（20/40/60 归高档），80 属第 4 档（「80 分以上」含 80，禁止写成 >80）。 */
    const SCORE_BAND_EDGES = [80, 60, 40, 20];
    const SCORE_RING_MODES = ['bands', 'gradient'];

    function scoreBandOf(score) {
      const n = Number(score);
      if (!isFinite(n)) return -1;
      for (let i = 0; i < SCORE_BAND_EDGES.length; i += 1) {
        if (n >= SCORE_BAND_EDGES[i]) return i;
      }
      return 4;
    }

    /* 模式非法值（空串 / null / 数字 / 未知词）一律回落 bands —— 环绝不能渲染成无描边 */
    function scoreRingModeOf(settings) {
      const raw = settings && settings.scoreRingMode;
      return SCORE_RING_MODES.indexOf(raw) >= 0 ? raw : 'bands';
    }

    function hexByte(value) {
      const text = value.toString(16).toUpperCase();
      return text.length === 1 ? '0' + text : text;
    }

    function byteChannelToLinear(value) {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function linearChannelToByte(value) {
      const c = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
      return Math.round(Math.max(0, Math.min(1, c)) * 255);
    }

    /* sRGB hex → OKLCh。插值空间写死 OKLCH（§1.17.2）：HSL 的 hue 插值在黄→绿→蓝段
       会经过脏灰或荧光，且同 L 下不同色相的感知亮度差很大。 */
    function hexToOklch(hex) {
      const text = String(hex).replace('#', '');
      const r = byteChannelToLinear(parseInt(text.slice(0, 2), 16));
      const g = byteChannelToLinear(parseInt(text.slice(2, 4), 16));
      const b = byteChannelToLinear(parseInt(text.slice(4, 6), 16));
      const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
      const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
      const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
      const lc = Math.cbrt(l);
      const mc = Math.cbrt(m);
      const sc = Math.cbrt(s);
      const L = 0.2104542553 * lc + 0.7936177850 * mc - 0.0040720468 * sc;
      const A = 1.9779984951 * lc - 2.4285922050 * mc + 0.4505937099 * sc;
      const B = 0.0259040371 * lc + 0.7827717662 * mc - 0.8086757660 * sc;
      return { L: L, C: Math.sqrt(A * A + B * B), H: Math.atan2(B, A) };
    }

    function oklchToHex(color) {
      const A = color.C * Math.cos(color.H);
      const B = color.C * Math.sin(color.H);
      const lc = color.L + 0.3963377774 * A + 0.2158037573 * B;
      const mc = color.L - 0.1055613458 * A - 0.0638541728 * B;
      const sc = color.L - 0.0894841775 * A - 1.2914855480 * B;
      const l = lc * lc * lc;
      const m = mc * mc * mc;
      const s = sc * sc * sc;
      const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
      return '#' + hexByte(linearChannelToByte(r)) + hexByte(linearChannelToByte(g)) + hexByte(linearChannelToByte(b));
    }

    function mixOklch(fromHex, toHex, t) {
      const from = hexToOklch(fromHex);
      const to = hexToOklch(toHex);
      let hueTo = to.H;
      const delta = hueTo - from.H;
      if (delta > Math.PI) hueTo -= Math.PI * 2;
      else if (delta < -Math.PI) hueTo += Math.PI * 2;
      const k = Math.max(0, Math.min(1, t));
      return oklchToHex({
        L: from.L + (to.L - from.L) * k,
        C: from.C + (to.C - from.C) * k,
        H: from.H + (hueTo - from.H) * k
      });
    }

    /* 弧色：bands 取本档 anchor（档内不插值，85 与 89 同色）；
       gradient 在「本档 anchor」与「上一档 anchor」之间按 OKLCH 线性插值，
       停靠点只剩 0/20/40/60/80 五个。
       端点饱和：>=80 取 band0 原值（100≡90≡80）、<20 段插到 0 为止（0≡band4 原值）。 */
    function scoreArcOf(score, mode) {
      const band = scoreBandOf(score);
      if (band < 0) return { band: -1, light: '', dark: '' };
      const n = Math.max(0, Math.min(100, Number(score)));
      /* 锚点存不带 # 的分量：色值字面量只允许出现在 70-styles.js 的 dt-palette 段（S74）。 */
      let light = '#' + SCORE_BAND_ANCHORS.light[band];
      let dark = '#' + SCORE_BAND_ANCHORS.dark[band];
      if (mode === 'gradient' && band > 0) {
        const hi = SCORE_BAND_EDGES[band - 1];
        /* band 4 没有下界（<20），插值区间固定为 [0, 20]；其余档取本档下界。 */
        const lo = band < SCORE_BAND_EDGES.length ? SCORE_BAND_EDGES[band] : 0;
        const t = (n - lo) / (hi - lo);
        light = mixOklch('#' + SCORE_BAND_ANCHORS.light[band], '#' + SCORE_BAND_ANCHORS.light[band - 1], t);
        dark = mixOklch('#' + SCORE_BAND_ANCHORS.dark[band], '#' + SCORE_BAND_ANCHORS.dark[band - 1], t);
      }
      return { band: band, light: light, dark: dark };
    }

    /* ---------------------- accent 强调色（ui-spec §1.19） ---------------------- */
    /* 六档预设 + brand + custom。色值只在这里以「不带 # 的三元组」形式出现：palette 区外
       写字面 #RRGGBB 会被 S74 判越界（t80 的教训），统一在运行时用 '#' + 三元组 拼装。
       对比度一律用 WCAG 2.1 相对亮度现算，--dt-accent-on 绝不允许写死黑或白（§1.19.3）。 */
    const ACCENT_KEYS = ['brand', 'blue', 'teal', 'green', 'violet', 'rose', 'amber', 'custom'];
    /* 色板只显示真实颜色档：'brand'（跟随宿主品牌色）在宿主换肤后是黑块，
       'custom' 没填色值时也是黑的 —— 两个默认都不进色板，避免出现两个黑点。
       'custom' 仅在用户已经选了自定义色时补一个可回选的筹码。 */
    const ACCENT_SWATCH_KEYS = ['blue', 'teal', 'green', 'violet', 'rose', 'amber'];
    const ACCENT_PRESETS = {
      blue: { light: '1A63D8', dark: '6EA8FE' },
      teal: { light: '0C7489', dark: '5FD0C8' },
      green: { light: '1F6B2E', dark: '7EC97A' },
      violet: { light: '6741D9', dark: 'B197FC' },
      rose: { light: 'C2255C', dark: 'F783AC' },
      amber: { light: 'A8560A', dark: 'F2B34B' }
    };
    const ACCENT_ON_LIGHT = 'FFFFFF';
    const ACCENT_ON_DARK = '000000';
    const ACCENT_HEX_RE = /^#[0-9a-fA-F]{6}$/;
    /* 背景取样写死（§1.19.5）：亮色取 --dt-bg-1、暗色取 --dt-bg-1 的暗色档，不取 bg-0 */
    const ACCENT_BG_LIGHT = 'f7f8fa';
    const ACCENT_BG_DARK = '1c1f25';

    /* m05210：默认强调色改为玫红（rose 档，色值只在 dt-palette 区里）。
       原默认 'brand' 跟随宿主品牌色，宿主换肤后品牌色偏黑，导致「一键打分」显示成黑块。 */
    function defaultAppearance() {
      return { accent: 'rose', accentHex: '' };
    }

    /* 只认 #RRGGBB（大小写皆可），规范化成大写；其余一律返回空串（非法输入不写库） */
    function normalizeAccentHex(value) {
      const text = typeof value === 'string' ? value.trim() : '';
      return ACCENT_HEX_RE.test(text) ? '#' + text.slice(1).toUpperCase() : '';
    }

    /* accentHex 只在 custom 档生效，其余档恒为 ''（§1.19.1），所以这里按档位清空 */
    function accentOf(settings) {
      const raw = settings && settings.appearance;
      const key = raw && ACCENT_KEYS.indexOf(raw.accent) >= 0 ? raw.accent : 'brand';
      const hex = key === 'custom' ? normalizeAccentHex(raw && raw.accentHex) : '';
      return { accent: key, accentHex: hex };
    }

    function accentRgbOf(hex) {
      const text = String(hex).replace('#', '');
      return [
        parseInt(text.slice(0, 2), 16),
        parseInt(text.slice(2, 4), 16),
        parseInt(text.slice(4, 6), 16)
      ];
    }

    function relativeLuminanceOf(hex) {
      const rgb = accentRgbOf(hex);
      const r = byteChannelToLinear(rgb[0]);
      const g = byteChannelToLinear(rgb[1]);
      const b = byteChannelToLinear(rgb[2]);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function contrastRatioOf(a, b) {
      const la = relativeLuminanceOf(a);
      const lb = relativeLuminanceOf(b);
      const hi = la > lb ? la : lb;
      const lo = la > lb ? lb : la;
      return (hi + 0.05) / (lo + 0.05);
    }

    /* 黑/白二选一：取对比度更高者，相等取黑（§1.19.6 的 custom 规则） */
    function accentOnFor(hex) {
      const black = '#' + ACCENT_ON_DARK;
      const white = '#' + ACCENT_ON_LIGHT;
      return contrastRatioOf(hex, white) > contrastRatioOf(hex, black) ? white : black;
    }

    /* 档位 → 明暗两套实色 + 叠色 + 对背景的实测对比度。
       brand 不复制宿主色值（§1.19.1 有意保留动态跟随），返回 brand:true，
       由 70-styles 在运行时读 --dsw-alias-brand-primary 现算。 */
    function accentToneOf(appearance) {
      const app = appearance && typeof appearance === 'object' ? appearance : defaultAppearance();
      const key = ACCENT_KEYS.indexOf(app.accent) >= 0 ? app.accent : 'brand';
      const bgLight = '#' + ACCENT_BG_LIGHT;
      const bgDark = '#' + ACCENT_BG_DARK;
      if (key === 'brand') {
        return {
          accent: 'brand',
          brand: true,
          light: '',
          dark: '',
          onLight: '',
          onDark: '',
          ratioLight: 0,
          ratioDark: 0
        };
      }
      let light = '';
      let dark = '';
      if (key === 'custom') {
        const hex = normalizeAccentHex(app.accentHex);
        if (!hex) {
          return {
            accent: 'custom',
            brand: true,
            light: '',
            dark: '',
            onLight: '',
            onDark: '',
            ratioLight: 0,
            ratioDark: 0
          };
        }
        light = hex;
        dark = hex;
      } else {
        light = '#' + ACCENT_PRESETS[key].light;
        dark = '#' + ACCENT_PRESETS[key].dark;
      }
      const custom = key === 'custom';
      const onLight = custom ? accentOnFor(light) : '#' + ACCENT_ON_LIGHT;
      const onDark = custom ? accentOnFor(dark) : '#' + ACCENT_ON_DARK;
      return {
        accent: key,
        brand: false,
        light: light,
        dark: dark,
        onLight: onLight,
        onDark: onDark,
        ratioLight: contrastRatioOf(light, bgLight),
        ratioDark: contrastRatioOf(dark, bgDark)
      };
    }

    /* ---------------------------- 目录栏设置（t144 / §1.20） ---------------------------- */
    /* 两个开关都是「隐藏类」：开启 = 隐藏对应元素（节点不存在，不是留壳）。
       默认 hideReorder:true（默认不显示拖拽手柄）、hideColor:false（项目色点照常显示）。
       只存 settings，不写 db、不升 state.version（§1.20.7）。 */
    function defaultRailUI() {
      return { hideReorder: true, hideColor: false };
    }

    /* 读到的一律过一遍：缺键补默认、非布尔值按 !! 收敛，保证 rail / 面板 / 设置页三处同源同值。 */
    function railUIOf(settings) {
      const raw = settings && settings.railUI;
      const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      return {
        hideReorder: base.hideReorder === undefined ? true : !!base.hideReorder,
        hideColor: base.hideColor === undefined ? false : !!base.hideColor
      };
    }

    /* §1.20.7 项目顺序：纯函数、幂等、不改入参。
       已存在的 id 按数组顺序在前；数组里没有的（新增项目）按 createdAt 升序追加到末尾；
       数组里有但项目已删的自动剔除。返回 projectId 数组（不带 p: 前缀）。 */
    function projectOrderOf(projects, settings) {
      const list = (Array.isArray(projects) ? projects : []).filter(function (p) {
        return p && p.type !== 'habit';
      });
      const byId = {};
      list.forEach(function (p) { byId[p.id] = p; });
      const stored = settings && Array.isArray(settings.projectsOrder) ? settings.projectsOrder : [];
      const out = [];
      const seen = {};
      stored.forEach(function (id) {
        if (typeof id !== 'string' || !byId[id] || seen[id]) return;
        seen[id] = true;
        out.push(id);
      });
      list.filter(function (p) { return !seen[p.id]; })
        .sort(function (a, b) {
          const ca = a.createdAt || 0;
          const cb = b.createdAt || 0;
          if (ca !== cb) return ca - cb;
          return String(a.id) < String(b.id) ? -1 : 1;
        })
        .forEach(function (p) { out.push(p.id); });
      return out;
    }

    function defaultSettings() {
      const base = migrateSettingsToV2({});
      /* scoreRingMode 的默认值由 00-prelude 兜底（51-db 的 migrateSettingsToV2 不在 t121 inScope）：
         非法值一律回落 bands，环永远不会渲染成无描边。 */
      if (SCORE_RING_MODES.indexOf(base.scoreRingMode) < 0) base.scoreRingMode = 'bands';
      /* appearance（t125）同理：形状由 00-prelude 单点定义，migrateSettingsToV2 里没有它 */
      if (!base.appearance || typeof base.appearance !== 'object') base.appearance = defaultAppearance();
      else base.appearance = fillMissingKeys(base.appearance, defaultAppearance()).value;
      /* t144：目录栏两键——railUI 是开关，projectsOrder 空数组表示「尚未生成」（建 store 时补全） */
      base.railUI = railUIOf(base);
      /* 回写延迟：本地完成任务后等多少秒才调 complete_task，0 表示立刻。
         选项由设置页给出（立刻/30 秒/1 分钟/5 分钟/10 分钟/1 小时）。 */
      if (typeof base.writebackDelay !== 'number' || !isFinite(base.writebackDelay) || base.writebackDelay < 0) base.writebackDelay = 0;
      if (!Array.isArray(base.projectsOrder)) base.projectsOrder = [];
      return base;
    }

    /* 节奏是番茄钟的唯一真源：pause 完成后停 / skip 跳过休息 / auto 自动接下一段。
       节奏只决定「段落之间怎么走」，不覆盖用户设定的休息时长（§4.3），所以这里
       不存任何时长镜像字段。 */
    function defaultPomodoro() {
      return {
        work: 25,
        short: 5,
        long: 15,
        rounds: 4,
        rhythm: 'pause',
        autoStart: false,
        sound: true,
        notify: true,
        mode: 'work',
        running: false,
        endsAt: 0,
        pausedLeft: 0,
        round: 0,
        day: dateKey(new Date()),
        count: 0,
        minutes: 0
      };
    }

    /* ---------------------------------- 螺旋工作法 ---------------------------------- */

    /* 相位表写死（§4.10.2）：重要工作 10 → 好玩娱乐 10 → 20 → 20 → 30 → 30。
       六段一轮，第 6 段结束后 round+1 并回到第 1 段，无限循环。禁止重排或插入新段。 */
    const SPIRAL_PHASES = [
      { phase: 'a', min: 10 },
      { phase: 'b', min: 10 },
      { phase: 'a', min: 20 },
      { phase: 'b', min: 20 },
      { phase: 'a', min: 30 },
      { phase: 'b', min: 30 }
    ];

    /* history 上限：超出丢最旧（§4.10.1 S6） */
    const SPIRAL_HISTORY_MAX = 200;

    function defaultSpiral() {
      return {
        status: 'idle',
        phase: 0,
        round: 0,
        endsAt: 0,
        leftMs: 0,
        startedAt: 0,
        pausedAt: 0,
        pausedTotal: 0,
        phaseDone: false,
        aTaskId: '',
        bItemId: '',
        day: dateKey(new Date()),
        stats: { rounds: 0, aMin: 0, bMin: 0, doneCount: 0 },
        history: [],
        notify: true,
        sound: true
      };
    }

    /* B 清单是螺旋自己的数据，不挂在 projects/tasks 上（§4.10.4 隔离要求） */
    const SPIRAL_PLAY_DEFAULTS = ['刷短视频', '打一局游戏', '看剧一集', '听歌放空'];

    function defaultSpiralItems() {
      return SPIRAL_PLAY_DEFAULTS.map(function (name, index) {
        return { id: uid('play'), name: name, order: index + 1 };
      });
    }

    function spiralPhaseMeta(index) {
      const total = SPIRAL_PHASES.length;
      const i = (((index | 0) % total) + total) % total;
      return SPIRAL_PHASES[i];
    }

    function spiralPhaseLabel(meta) {
      return (meta.phase === 'a' ? '重要工作' : '好玩娱乐') + ' · ' + meta.min + ' 分钟';
    }

    function spiralItemName(state, id) {
      if (!id) return '';
      const tasks = (state && state.tasks) || [];
      const task = tasks.find(function (t) {
        return t.id === id;
      });
      if (task) return task.title || '';
      const items = (state && state.spiralItems) || [];
      const item = items.find(function (x) {
        return x.id === id;
      });
      return item ? item.name : '';
    }

    /* ------------------------------- 任务打分（spiral） ------------------------------ */

    const SPIRAL_HARD = ['信用卡', '还款', '花呗', '房租', '收租', '报税', '税', '发票', '报销', '年审', '年检', '营业执照', '工商', '合同', '客户', '定金', '尾款', '报价', '结算', '工资', '社保', '交强险', '保险', '续费', '网费', '服务器', '到期', '面试', '招聘', '交付', '对账', '上线', '汇报', '评审', '复盘', '稿费', '投放', '驾照', '驾驶证', '车牌', '账'];
    const SPIRAL_BIZ = ['设计', '手稿', '出稿', '素材', '拍摄', '剪辑', '排版', '插画', '纹身', '模特', '视频', '小红书', '运营', '账号', '打印', '测试', '项目', '工作室', '采购', '定制', '亚克力', '耗材', '安装', '封面', '文案', '选题'];
    const SPIRAL_FAM = ['生日', '🎂', '大姨', '干妈', '妈妈', '爸爸', '老婆', '雅', '孩子', '陪', '家里', '送', '接人', '见面', '见', '约饭', '聚餐', '还礼', '红包', '送礼'];
    const SPIRAL_CHORE = ['理发', '洗车', '洗头', '早睡', '快递', '取件', '退货', '退', '买', '补鞋', '剪指甲', '猫', '狗', '鱼缸', '换水', '火锅', '吃饭', '拖鞋', '蚊帐', '净水器', '螺丝', '内存条', '尺寸', '测量', '储物间', '射灯', '窗帘', '镜子', '风扇', '包装袋', '计时器', '闲鱼', '存钱', '读书'];
    const SPIRAL_IDEA = ['灵感', '心法', '习惯', '理论', '构思', '主题', '想法', '练习', '阅读', '笔记', '整理', '参考', '思路', '流程', '尝试', '实验'];
    const SPIRAL_WORK_BASE = { 收集箱: 0.1, 今日要事: 0.22, 生日: 0.04, 提醒: 0.1, 艺术: 0.15 };
    const SPIRAL_LIFE_BASE = { 收集箱: 0.1, 今日要事: 0.08, 生日: 0.28, 提醒: 0.2, 艺术: 0.1 };

    function spiralHits(list, body) {
      return list.filter(function (word) {
        return body.indexOf(word) >= 0;
      });
    }

    function spiralBaseOf(table, name) {
      return Object.prototype.hasOwnProperty.call(table, name) ? table[name] : 0.1;
    }

    /* 打分（docs/scoring-rubric.md §7）：有离线校准分就用（tt-scores.json 注入 state.scores），
       没有才现算。四个维度 0..1，加权 0.40/0.30/0.20/0.10 后取整到 0..100。 */
    function spiralScoreOf(task, state) {
      const source = state && state.scores ? state.scores[task.id] : null;
      if (source && typeof source.score === 'number') return source.score;

      const title = String(task.title || '');
      const body = title + '\n' + String(task.content || '');
      const hard = spiralHits(SPIRAL_HARD, body);
      const biz = spiralHits(SPIRAL_BIZ, body);
      const fam = spiralHits(SPIRAL_FAM, body);
      const chore = spiralHits(SPIRAL_CHORE, body);
      const idea = spiralHits(SPIRAL_IDEA, body);
      const order = /\d{3,}/.test(title) && /[定报价款单]/.test(body);

      const projectName = ((state && state.projects) || []).reduce(function (name, project) {
        return project.id === task.projectId ? project.name : name;
      }, '');

      let work = spiralBaseOf(SPIRAL_WORK_BASE, projectName);
      if (hard.length) work += 0.75;
      else if (order) work += 0.65;
      else if (biz.length) work += 0.4;
      if (new Set(hard.concat(biz)).size >= 2) work += 0.08;

      let life = spiralBaseOf(SPIRAL_LIFE_BASE, projectName);
      if (fam.length) life += fam.length >= 2 ? 0.45 : 0.53;
      else if (chore.length) life = Math.min(life + 0.25, 0.45);

      if (!hard.length && !biz.length && !fam.length && !chore.length) {
        work = Math.min(work, idea.length ? 0.18 : 0.12);
        life = Math.min(life, idea.length ? 0.12 : 0.1);
      }
      work = Math.max(0, Math.min(1, work));
      life = Math.max(0, Math.min(1, life));

      const hasChildren = ((state && state.tasks) || []).some(function (t) {
        return t.parentId === task.id;
      });
      let impact = 0;
      if (hasChildren) impact += 0.3;
      if (task.rruleRaw || task.repeat) impact += 0.2;
      if (String(task.content || '').trim().length > 80) impact += 0.2;
      if (hard.length || fam.length) impact += 0.3;
      else if (biz.length || order) impact += 0.15;
      impact = Math.max(0, Math.min(1, impact));

      let urgency = 0.2;
      const date = parseISO(task.date);
      if (date) {
        const gap = dayDiff(date, new Date());
        if (gap < 0) urgency = 1;
        else if (gap === 0) urgency = 0.95;
        else if (gap <= 3) urgency = 0.8;
        else if (gap <= 7) urgency = 0.6;
        else urgency = 0.35;
      }

      return Math.round(100 * (0.4 * work + 0.3 * life + 0.2 * urgency + 0.1 * impact));
    }

    function spiralCandidates(state) {
      return ((state && state.tasks) || []).filter(function (task) {
        return task && !task.deleted && task.status === 0;
      });
    }

    /* A 绑定的自动取件：score 降序 → priority 降序 → date 升序（无日期最后）
       → createdAt 升序 → id 升序（§4.10.5）。 */
    function spiralPickTask(state, today) {
      const list = spiralCandidates(state);
      if (!list.length) return '';
      const scored = list.map(function (task) {
        return { task: task, score: spiralScoreOf(task, state) };
      });
      scored.sort(function (x, y) {
        if (y.score !== x.score) return y.score - x.score;
        const px = x.task.priority | 0;
        const py = y.task.priority | 0;
        if (py !== px) return py - px;
        const dx = parseISO(x.task.date);
        const dy = parseISO(y.task.date);
        const kx = dx ? dx.getTime() : Infinity;
        const ky = dy ? dy.getTime() : Infinity;
        if (kx !== ky) return kx < ky ? -1 : 1;
        const cx = String(x.task.createdAt || '');
        const cy = String(y.task.createdAt || '');
        if (cx !== cy) return cx < cy ? -1 : 1;
        return String(x.task.id) < String(y.task.id) ? -1 : 1;
      });
      return scored[0].task.id;
    }

    /* 每段开始时解析绑定：用户手换的优先，失效了就重取并报 notated（§4.10.5） */
    function spiralBindings(state, spiral, now) {
      const candidates = spiralCandidates(state);
      const items = ((state && state.spiralItems) || []).slice().sort(function (x, y) {
        return (x.order | 0) - (y.order | 0);
      });
      let aTaskId = spiral.aTaskId || '';
      let invalidated = false;
      if (aTaskId) {
        const alive = candidates.some(function (t) {
          return t.id === aTaskId;
        });
        if (!alive) {
          aTaskId = '';
          invalidated = true;
        }
      }
      if (!aTaskId) aTaskId = spiralPickTask(state, now);
      let bItemId = spiral.bItemId || '';
      const hasItem = items.some(function (x) {
        return x.id === bItemId;
      });
      if (!bItemId || !hasItem) bItemId = items.length ? items[0].id : '';
      return { aTaskId: aTaskId, bItemId: bItemId, invalidated: invalidated };
    }

    /* 唯一结算入口（§4.10.6）：只做纯计算，副作用（toast/通知/响铃）由调用方落地。
       reason: 'auto'（自然到点，进下一段）| 'stop' | 'reload'（后两者回 idle）。 */
    function spiralSettle(state, now, reason) {
      const spiral = state && state.spiral;
      const at = now || Date.now();
      const out = { spiral: spiral, alert: null, beep: null, invalidated: false, minutes: 0 };
      if (!spiral || spiral.status === 'idle') return out;

      const meta = spiralPhaseMeta(spiral.phase);
      /* §4.10.6 第 1 条（t60 定稿的三情形）：入账用真实用时，不按满段时长。
         running 且已过 endsAt → 自然结束，endedAt 取 endsAt（min 才等于段长）；
         running 未到点（停止 / reload 提前结算）→ endedAt 取 now；
         paused → endedAt 取 now，但计费用 pausedAt 截断，暂停时长天然不计入。
         禁止另存「段时长」第二真源：一切从 startedAt / pausedAt / pausedTotal 推。 */
      const running = spiral.status === 'running';
      const finished = running && spiral.endsAt > 0 && at >= spiral.endsAt;
      const endedAt = finished ? spiral.endsAt : at;
      const startedAt = spiral.startedAt || endedAt;
      const pausedTotal = Math.max(0, spiral.pausedTotal | 0);
      const billableTo = spiral.status === 'paused' && spiral.pausedAt > 0 ? spiral.pausedAt : endedAt;
      const usedMs = Math.max(0, billableTo - startedAt - pausedTotal);
      const minutes = usedMs >= 60000 ? Math.round(usedMs / 60000) : 0;
      const itemId = meta.phase === 'a' ? spiral.aTaskId || '' : spiral.bItemId || '';
      const itemKind = meta.phase === 'a' ? 'task' : 'play';
      const name = spiralItemName(state, itemId) || '未绑定';

      const history = (spiral.history || []).concat([{
        phase: meta.phase,
        min: minutes,
        itemId: itemId,
        itemKind: itemKind,
        startedAt: startedAt,
        endedAt: endedAt,
        completed: !!spiral.phaseDone,
        reason: reason || 'auto'
      }]).slice(-SPIRAL_HISTORY_MAX);

      const stats = Object.assign({ rounds: 0, aMin: 0, bMin: 0, doneCount: 0 }, spiral.stats || {});
      const lastPhase = spiral.phase === SPIRAL_PHASES.length - 1;
      if (minutes >= 1) {
        if (meta.phase === 'a') stats.aMin = (stats.aMin | 0) + minutes;
        else stats.bMin = (stats.bMin | 0) + minutes;
        if (lastPhase) stats.rounds = (stats.rounds | 0) + 1;
      }
      let round = spiral.round | 0;
      if (lastPhase && minutes >= 1) round += 1;

      /* 跨日：当前段已按上面结算，然后再清当日统计（§4.10.6 末尾） */
      const todayKey = dateKey(new Date(at));
      let day = spiral.day || todayKey;
      if (day !== todayKey) {
        stats.rounds = 0;
        stats.aMin = 0;
        stats.bMin = 0;
        stats.doneCount = 0;
        day = todayKey;
      }
      out.minutes = minutes;

      if (reason === 'stop' || reason === 'reload') {
        out.spiral = Object.assign({}, spiral, {
          status: 'idle',
          phase: 0,
          round: 0,
          endsAt: 0,
          leftMs: 0,
          startedAt: 0,
          pausedAt: 0,
          pausedTotal: 0,
          phaseDone: false,
          day: day,
          stats: stats,
          history: history
        });
        if (reason === 'stop') {
          out.alert = { title: '螺旋已停止', body: '已结算本段 ' + minutes + ' 分钟' };
        }
        return out;
      }

      /* auto：进下一段，并为新段解析绑定 */
      const nextIndex = (spiral.phase + 1) % SPIRAL_PHASES.length;
      const nextMeta = SPIRAL_PHASES[nextIndex];
      const bindings = spiralBindings(state, { aTaskId: spiral.aTaskId, bItemId: spiral.bItemId }, at);
      out.invalidated = bindings.invalidated;
      out.spiral = Object.assign({}, spiral, {
        status: 'running',
        phase: nextIndex,
        round: round,
        endsAt: at + nextMeta.min * 60000,
        leftMs: 0,
        startedAt: at,
        pausedAt: 0,
        pausedTotal: 0,
        phaseDone: false,
        aTaskId: bindings.aTaskId,
        bItemId: bindings.bItemId,
        day: day,
        stats: stats,
        history: history
      });

      if (meta.phase === 'a') {
        out.alert = {
          title: '重要工作结束',
          body: '干了 ' + minutes + ' 分钟「' + name + '」。接下来：好玩娱乐 ' + nextMeta.min + ' 分钟'
        };
        out.beep = { times: 2, freq: 660 };
      } else if (lastPhase) {
        out.alert = {
          title: '第 ' + round + ' 轮螺旋完成',
          body: '本轮完成，回到 10 分钟重要工作'
        };
        out.beep = { times: 4, freq: 880 };
      } else {
        out.alert = {
          title: '娱乐时间结束',
          body: '玩了 ' + minutes + ' 分钟「' + name + '」。接下来：重要工作 ' + nextMeta.min + ' 分钟'
        };
        out.beep = { times: 3, freq: 990 };
      }
      return out;
    }

    /* 老数据迁移：autoStart 只保留字段不再被读取，语义一次性并入 rhythm */
    function migrateRhythm(pomo) {
      if (!pomo) return pomo;
      const known = pomo.rhythm === 'pause' || pomo.rhythm === 'skip' || pomo.rhythm === 'auto';
      if (!known) pomo.rhythm = pomo.autoStart ? 'auto' : 'pause';
      /* rhythmPrev 已废弃（§4.3）：老数据里若有也一并清掉，避免断言看到残留字段 */
      if ('rhythmPrev' in pomo) delete pomo.rhythmPrev;
      return pomo;
    }

    /* TickTick 的 repeat 是原始 RRULE 串（RRULE:… / LUNAR:…），只压成枚举会静默丢信息：
       INTERVAL、BYMONTHDAY=-1、BYDAY=4SU、LUNAR: 全都会消失。因此 rruleRaw 单独保留原文，
       repeat 只作为编辑器可选的枚举视图。 */
    function repeatEnumOf(raw) {
      const text = String(raw || '').toUpperCase();
      if (!text) return '';
      const freq = /FREQ=([A-Z]+)/.exec(text);
      if (!freq) return '';
      if (freq[1] === 'DAILY' || freq[1] === 'WEEKLY' || freq[1] === 'MONTHLY' || freq[1] === 'YEARLY') {
        return freq[1];
      }
      return '';
    }

    /* 习惯频率：daily / weekly(+byDay) / 其它按同月同日近似，够用于 streak 与判定 */
    function habitScheduled(habit, day) {
      const freq = habit.freq || {};
      const type = freq.type || 'daily';
      const interval = freq.interval > 0 ? freq.interval : 1;
      const key = dateKey(day);
      const target = habit.targetStartDate || '';
      const since = target ? dateKey(startOfDay(parseISO(target) || day)) : '';
      if (type === 'weekly') {
        const byDay = Array.isArray(freq.byDay) && freq.byDay.length ? freq.byDay : [1];
        /* TickTick 的 BYDAY：1=周一 … 7=周日 */
        const iso = day.getDay() === 0 ? 7 : day.getDay();
        return byDay.indexOf(iso) >= 0;
      }
      if (type === 'daily') {
        if (interval <= 1 || !since) return true;
        const gap = dayDiff(startOfDay(day), startOfDay(parseISO(since)));
        return gap >= 0 && gap % interval === 0;
      }
      if (type === 'monthly') return day.getDate() === (parseISO(since) || day).getDate();
      if (type === 'yearly') {
        const start = parseISO(since);
        return !!start && day.getDate() === start.getDate() && day.getMonth() === start.getMonth();
      }
      return true;
    }

    function habitChecked(habit, today) {
      const key = dateKey(today);
      return (habit.checks || []).indexOf(key) >= 0;
    }

    /* 当前连续天数：从今天回溯，今天未打卡但昨天打了则宽限一次；
       只数「应打卡日」，非应打卡日跳过不中断（与数据迁移侧口径一致）。 */
    function habitStreak(habit, today) {
      const set = {};
      (habit.checks || []).forEach(function (d) {
        set[d] = 1;
      });
      let day = startOfDay(today);
      if (!set[dateKey(day)]) day = addDays(day, -1);
      let n = 0;
      let guard = 0;
      while (guard < 4000) {
        const key = dateKey(day);
        if (set[key]) {
          n += 1;
          day = addDays(day, -1);
          guard += 1;
          continue;
        }
        if (habitScheduled(habit, day)) break;
        day = addDays(day, -1);
        guard += 1;
      }
      return n;
    }

    /* 归档习惯的连续天数按「归档基准日」冻结：迁移时已按 ArchivedAt 算好 currentStreak
       （t2 基准：吃营养 1、读诗 9）。归档后打卡停在归档日，若仍从今天回溯会一律归 0，
       所以直接沿用冻结值；用今天的回溯只适用于在用习惯。 */
    function habitDisplayStreak(habit, today) {
      if (habit.archived) return Math.max(0, habit.currentStreak | 0);
      return habitStreak(habit, today);
    }

    /* 「累计」以迁移侧的 checkInCount 为准（它与库内 TotalCheckIns 逐条对过账），
       缺失时才退回本地打卡条数。 */
    function habitCheckinTotal(habit) {
      const count = habit.checkInCount;
      if (typeof count === 'number' && count >= 0) return count | 0;
      return (habit.checks || []).length;
    }

    /* 习惯月历（§2.8）：恒 42 格、周一为一周首日，与主日历同一套相位公式。
       checks 先转成字典，避免每格 O(打卡数) 的线性查找。 */
    function habitMonthGrid(habit, year, month) {
      const seen = {};
      (habit.checks || []).forEach(function (d) {
        seen[d] = (seen[d] | 0) + 1;
      });
      const todayKey = dateKey(new Date());
      const first = new Date(year, month, 1);
      const start = addDays(first, -((first.getDay() + 6) % 7));
      const cells = [];
      let count = 0;
      for (let i = 0; i < 42; i += 1) {
        const day = addDays(start, i);
        const key = dateKey(day);
        const inMonth = day.getMonth() === month;
        const hits = seen[key] | 0;
        if (inMonth && hits > 0) count += hits;
        cells.push({
          key: key,
          inMonth: inMonth,
          future: key > todayKey,
          checked: hits > 0,
          count: hits
        });
      }
      return { ym: String(year) + '-' + pad2(month + 1), count: count, cells: cells };
    }

    function habitMonthCount(habit, ym) {
      const prefix = String(ym || '');
      if (!prefix) return 0;
      return (habit.checks || []).filter(function (d) {
        return String(d).slice(0, 7) === prefix;
      }).length;
    }

    function inflateHabits() {
      const rows = HABIT_SEED && HABIT_SEED.h ? HABIT_SEED.h : [];
      return rows.map(function (row) {
        return {
          id: row[0],
          name: row[1] || '习惯',
          color: row[2] || '',
          period: row[3] === 'afternoon' || row[3] === 'evening' ? row[3] : 'morning',
          archived: !!row[4],
          currentStreak: row[5] | 0,
          longestStreak: row[6] | 0,
          checkInCount: row[7] | 0,
          reminder: row[8] || '',
          freq: {
            type: row[9] || 'daily',
            interval: row[10] | 0 || 1,
            byDay: Array.isArray(row[11]) ? row[11] : []
          },
          targetStartDate: row[12] || '',
          checks: String(row[13] || '')
            .split(',')
            .filter(function (d) {
              return !!d;
            })
        };
      });
    }

    function toggleHabit(store, id, today) {
      const key = dateKey(today);
      store.update(function (state) {
        return Object.assign({}, state, {
          habits: (state.habits || []).map(function (habit) {
            if (habit.id !== id) return habit;
            const has = habit.checks.indexOf(key) >= 0;
            const checks = has
              ? habit.checks.filter(function (d) {
                  return d !== key;
                })
              : habit.checks.concat([key]).sort();
            const next = Object.assign({}, habit, {
              checks: checks,
              checkInCount: has ? Math.max(0, (habit.checkInCount | 0) - 1) : (habit.checkInCount | 0) + 1
            });
            next.currentStreak = habit.archived ? (habit.currentStreak | 0) : habitStreak(next, today);
            next.longestStreak = habit.archived
              ? Math.max(habit.longestStreak | 0, habit.currentStreak | 0)
              : Math.max(habit.longestStreak | 0, next.currentStreak);
            return next;
          })
        });
      });
    }

    /* 导入用的习惯归一化：外部 JSON / 旧导出可能缺字段（尤其 currentStreak，
       缺了归档习惯会一律显示「已坚持 0 天」），这里逐字段兜底。
       streak 兜底口径（重要）：
         - 有 currentStreak 数字就直接用（自身导出的完整往返走这一支）；
         - 归档且缺失 → 用「末次打卡日为基准」回溯（等价于 t2 的 streakEndingAtLastCheck），
           因为归档基准日 ArchivedAt 没有随 JSON 带出，硬编 archivedAt 是猜；
         - 在用且缺失 → 从今天回溯（与界面实时口径一致）。
       longestStreak / checkInCount 缺失时分别退回 0 与打卡条数。 */
    function normalizeHabit(raw, today) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const checks = (Array.isArray(src.checks) ? src.checks : [])
        .filter(function (d) {
          return typeof d === 'string' && d.length === 10;
        })
        .sort();
      const freq = src.freq && typeof src.freq === 'object' ? src.freq : {};
      const byDay = (Array.isArray(freq.byDay) ? freq.byDay : [])
        .map(function (n) {
          return n | 0;
        })
        .filter(function (n) {
          return n >= 1 && n <= 7;
        });
      const habit = {
        id: typeof src.id === 'string' && src.id ? src.id : uid('habit'),
        name: clampText(String(src.name || '习惯').trim() || '习惯', 60),
        color: typeof src.color === 'string' ? src.color : '',
        icon: typeof src.icon === 'string' ? src.icon : '',
        period: src.period === 'afternoon' || src.period === 'evening' ? src.period : 'morning',
        archived: !!src.archived,
        currentStreak: 0,
        longestStreak: Math.max(0, src.longestStreak | 0),
        checkInCount: typeof src.checkInCount === 'number' && src.checkInCount >= 0 ? src.checkInCount | 0 : checks.length,
        reminder: typeof src.reminder === 'string' ? src.reminder : '',
        freq: {
          type: freq.type === 'weekly' || freq.type === 'monthly' || freq.type === 'yearly' ? freq.type : 'daily',
          interval: freq.interval > 0 ? freq.interval | 0 : 1,
          byDay: byDay
        },
        targetStartDate: typeof src.targetStartDate === 'string' ? src.targetStartDate : '',
        checks: checks
      };
      if (typeof src.currentStreak === 'number' && src.currentStreak >= 0) {
        habit.currentStreak = src.currentStreak | 0;
      } else if (habit.archived && checks.length) {
        habit.currentStreak = habitStreak(habit, parseISO(checks[checks.length - 1]) || today);
      } else {
        habit.currentStreak = habitStreak(habit, today || new Date());
      }
      habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
      return habit;
    }

    function normalizeHabits(list, today) {
      const seen = {};
      const out = [];
      (Array.isArray(list) ? list : []).forEach(function (raw) {
        const habit = normalizeHabit(raw, today);
        if (seen[habit.id]) return;
        seen[habit.id] = 1;
        out.push(habit);
      });
      return out;
    }

    function effectiveReminder(task, leadMinutes) {
      let at = null;
      if (task.remindAt) at = parseISO(task.remindAt);
      if (!at && task.date) {
        at = parseISO(task.date);
        if (at && task.allDay) at.setHours(9, 0, 0, 0);
      }
      if (!at) return null;
      if (leadMinutes) at = new Date(at.getTime() - leadMinutes * 60000);
      return at;
    }

    /* 迁移快照里任务的位置列顺序：旧导出把任务写成数组套数组，导入时靠它把列回填成字段名 */
    const TASK_COLUMNS = [
      'id', 'projectId', 'title', 'content', 'priority', 'status', 'deleted',
      'date', 'allDay', 'remindAt', 'tags', 'createdAt', 'completedAt', 'repeat', 'parentId'
    ];

    const QUAD_IDS = ['q1', 'q2', 'q3', 'q4'];

    /* 任意对象 → 规范任务：字段齐、类型稳、RRULE 原文不被压平。
       导入与 seed 还原都走这里，避免出现第二套字段口径。 */
    function normalizeTask(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const task = {
        id: src.id ? String(src.id) : '',
        projectId: src.projectId ? String(src.projectId) : '',
        title: typeof src.title === 'string' ? src.title : '',
        content: typeof src.content === 'string' ? src.content : '',
        priority: src.priority | 0,
        status: src.status | 0,
        deleted: src.deleted ? 1 : 0,
        date: typeof src.date === 'string' ? src.date : '',
        allDay: src.allDay ? 1 : 0,
        remindAt: typeof src.remindAt === 'string' ? src.remindAt : '',
        tags: Array.isArray(src.tags)
          ? src.tags.filter(function (tag) {
              return typeof tag === 'string' && !!tag;
            })
          : [],
        createdAt: typeof src.createdAt === 'string' ? src.createdAt : '',
        completedAt: typeof src.completedAt === 'string' ? src.completedAt : '',
        parentId: src.parentId ? String(src.parentId) : '',
        quadOverride: QUAD_IDS.indexOf(src.quadOverride) >= 0 ? src.quadOverride : '',
        pinToday: typeof src.pinToday === 'string' ? src.pinToday : '',
        repeat: '',
        rruleRaw: '',
        notifiedAt: src.notifiedAt > 0 ? src.notifiedAt | 0 : 0
      };
      const rawRule = typeof src.rruleRaw === 'string' && src.rruleRaw
        ? src.rruleRaw
        : typeof src.repeat === 'string' && src.repeat.indexOf('=') >= 0
          ? src.repeat
          : '';
      if (rawRule) {
        task.rruleRaw = rawRule;
        task.repeat = repeatEnumOf(rawRule);
      } else if (REPEAT_OPTIONS.indexOf(src.repeat) >= 0) {
        task.repeat = src.repeat;
      }
      return task;
    }

    /* 位置数组 → 任务（旧导出格式）。列顺序对齐 TASK_COLUMNS，缺列按空值补齐。 */
    function taskFromRow(row) {
      if (!Array.isArray(row)) return normalizeTask(row);
      const src = {};
      TASK_COLUMNS.forEach(function (name, index) {
        src[name] = row[index];
      });
      return normalizeTask(src);
    }

    function inflateSeed() {
      const now = Date.now();
      const projects = (SEED.p || []).map(function (row) {
        return { id: row[0], name: row[1], color: row[2] || '', inbox: !!row[3], type: 'todo' };
      });
      /* 习惯早已不是「某个清单里的任务」，入口是 rail 的一级项（§1.7），
         所以这里不再补建 type=habit 的内建清单（§6-㊲）。 */
      const tasks = [];
      (SEED.t || []).forEach(function (row) {
        const task = taskFromRow(row);
        const at = effectiveReminder(task, 0);
        if (at && at.getTime() < now) task.notifiedAt = now;
        tasks.push(task);
      });
      /* v2 骨架：数据装进 state.db 的 8 个分区，顶层三个分区由 51-db 的不可枚举访问器暴露，
         所以既有调用点（state.tasks / state.projects / state.scores）一行都不用改，
         而 JSON.stringify 只会写 db 这一份，导出的备份体积不翻倍。 */
      const state = {
        version: DB_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        seededAt: new Date().toISOString(),
        habits: inflateHabits(),
        settings: defaultSettings(),
        pomo: defaultPomodoro(),
        spiral: defaultSpiral(),
        spiralItems: defaultSpiralItems(),
        db: defaultDb()
      };
      state.db.tasks = tasks;
      state.db.projects = projects;
      state.db.tags = deriveTagRegistry(state.db.tasks, []);
      state.db.habitLog = buildHabitLog(state.habits);
      return defineShardAccessors(state);
    }

    /* 读盘 → 迁移 → 返回状态。迁移细节全在 51-db 的 migrateState 里（v1→v2、v2 补分区）。
       读失败的分支只有三条：没有数据（首次运行）、版本/结构不认识（当首次运行）、坏 JSON
       （原文另存一份再当首次运行——绝不清空用户数据，§3.8）。 */
    /* t105 模块开关归并（ui-spec-stage2 §1.12.4）：
       旧的 obstacle / ban（+ 历史遗留的 prohibit）三个开关合并成一个 modules.onething。
       规则：enabled = onething ?? (obstacle ?? ban ?? true)；order = min(三者 order)。
       **旧键不删**（回滚安全），只是此后只读写 onething；只在首次读到旧键时写一次。 */
    function mergeOnethingModule(settings) {
      if (!settings || !isPlainObject(settings.modules)) return false;
      const modules = settings.modules;
      const legacyKeys = ['obstacle', 'ban', 'prohibit'];
      const hasLegacy = legacyKeys.some(function (key) { return modules[key] !== undefined; });
      if (!hasLegacy) return false;
      if (modules.onething !== undefined) return false;
      let enabled = undefined;
      for (let i = 0; i < legacyKeys.length; i += 1) {
        if (modules[legacyKeys[i]] !== undefined) {
          enabled = !!modules[legacyKeys[i]];
          break;
        }
      }
      modules.onething = enabled === undefined ? true : enabled;
      const order = isPlainObject(modules.order) ? modules.order : {};
      let best = null;
      legacyKeys.forEach(function (key) {
        const value = order[key];
        if (typeof value === 'number' && isFinite(value) && (best === null || value < best)) best = value;
      });
      if (best !== null) {
        modules.order = Object.assign({}, order, { onething: best });
      }
      return true;
    }

    /* 老状态补键（t111）：settings 里后加的键（appearance / scoreRingMode /
       tasks.sort / calendar.overlays / scoreFeedback / modules.onething …）在老用户
       的 localStorage 里根本不存在。渲染期读它们就是 undefined 链 → TypeError →
       整块面板被 React 卸载（真机白板）。这里在**进渲染之前**一次性补齐。
       四条纪律：① 只补 === undefined 的键，用户设过的值（'' / 0 / false / null）
       一律原样保留；② 嵌套对象递归补，数组整体替换不逐项合并；
       ③ 幂等（跑两遍 changed 必为 false）；④ 不迁移任何用户数据。 */
    function fillMissingKeys(target, defaults) {
      const out = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
      let changed = !target || typeof target !== 'object' || Array.isArray(target);
      const keys = Object.keys(defaults || {});
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const dv = defaults[key];
        const tv = out[key];
        if (tv === undefined) {
          if (Array.isArray(dv)) {
            out[key] = dv.slice();
          } else if (dv && typeof dv === 'object') {
            out[key] = fillMissingKeys({}, dv).value;
          } else {
            out[key] = dv;
          }
          changed = true;
          continue;
        }
        if (dv && typeof dv === 'object' && !Array.isArray(dv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
          const sub = fillMissingKeys(tv, dv);
          if (sub.changed) {
            out[key] = sub.value;
            changed = true;
          }
        }
      }
      return { value: out, changed: changed };
    }

    /* t137：A 栏五段 → 四段的字段迁移。老状态里 settings.modules 可能带 railGroup
       （'timer' 计时段 / 'review' 记录与分析段），t136 把这两段合并成 'function' 功能区。
       三条纪律：① 只改 railGroup 的旧值，其它字段一律不动；② 绝不写 order ——
       用户自定义顺序优先级最高，迁移不许夺走它；③ 幂等：迁完再跑 changed 必为 false。 */
    const RAIL_GROUP_ALIASES = { timer: 'function', review: 'function' };

    function migrateRailGroups(settings) {
      const out = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
      const modules = out.modules;
      let changed = false;
      function fixGroup(holder, key) {
        if (!holder || typeof holder !== 'object' || Array.isArray(holder)) return;
        const value = holder[key];
        if (typeof value !== 'string') return;
        const next = RAIL_GROUP_ALIASES[value];
        if (!next) return;
        holder[key] = next;
        changed = true;
      }
      if (modules && typeof modules === 'object' && !Array.isArray(modules)) {
        /* 形状一：settings.modules[id] = { railGroup: 'timer', … } */
        Object.keys(modules).forEach(function (id) {
          const entry = modules[id];
          if (entry && typeof entry === 'object' && !Array.isArray(entry)) fixGroup(entry, 'railGroup');
        });
        /* 形状二：settings.modules.railGroup / railGroups / groups 是 id → 组名 的映射 */
        ['railGroup', 'railGroups', 'groups'].forEach(function (key) {
          const map = modules[key];
          if (map && typeof map === 'object' && !Array.isArray(map)) {
            Object.keys(map).forEach(function (id) {
              fixGroup(map, id);
            });
          }
        });
      }
      return { value: out, changed: changed };
    }

    function completeSettings(settings) {
      const defaults = migrateSettingsToV2({});
      const base = settings && typeof settings === 'object' ? Object.assign({}, settings) : {};
      const filled = fillMissingKeys(base, defaults);
      /* appearance 不在 migrateSettingsToV2 的形状里（51-db 不在 t125 inScope），单独补：
         缺键补默认、已有则只补缺的子键，用户设过的 accent / accentHex 原样保留。 */
      const raw = filled.value.appearance;
      const appearance = fillMissingKeys(
        raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {},
        defaultAppearance()
      );
      /* m05210：存量 'brand' 视为「用户没选过」（旧默认值），一次性迁到 rose。
         用户显式选过的其它档（blue/teal/…/custom）原样保留；迁移幂等。 */
      let accentMigrated = false;
      if (appearance.value.accent === 'brand') {
        appearance.value.accent = 'rose';
        appearance.value.accentHex = '';
        accentMigrated = true;
      }
      filled.value.appearance = appearance.value;
      /* t144：railUI 缺键补默认；projectsOrder 只收字符串（脏值丢弃，幂等由 projectOrderOf 保证） */
      const railUI = railUIOf(filled.value);
      const railUIChanged = !isPlainObject(filled.value.railUI)
        || filled.value.railUI.hideReorder !== railUI.hideReorder
        || filled.value.railUI.hideColor !== railUI.hideColor;
      filled.value.railUI = railUI;
      const orderRaw = filled.value.projectsOrder;
      const orderClean = Array.isArray(orderRaw)
        ? orderRaw.filter(function (id) { return typeof id === 'string'; })
        : [];
      const orderChanged = !Array.isArray(orderRaw) || orderClean.length !== orderRaw.length;
      filled.value.projectsOrder = orderClean;
      /* t137：railGroup 五段 → 四段（只改组名，不动 order），幂等 */
      const railGroups = migrateRailGroups(filled.value);
      filled.value = railGroups.value;
      return { value: filled.value, changed: filled.changed || appearance.changed || accentMigrated || railUIChanged || orderChanged || railGroups.changed };
    }

    function loadState() {
      let raw = null;
      try {
        raw = window.localStorage.getItem(STORE_KEY);
      } catch (err) {
        raw = null;
      }
      if (!raw) return inflateSeed();
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        /* t127：坏 JSON → 原文备份（固定键 + 时间戳键）→ 种子启动 → 顶部提示条。
           以前这里是「整屏 fatal」，用户看到的就是一片空白卡片；现在面板照常起来。 */
        stashBrokenState(raw);
        markBrokenNotice('PARSE_FAILED');
        return inflateSeed();
      }
      let migrated = null;
      try {
        migrated = migrateState(parsed);
      } catch (err) {
        stashBrokenState(raw);
        markBrokenNotice('MIGRATE_THREW');
        return inflateSeed();
      }
      if (!migrated || !migrated.state) {
        if (parsed && parsed.version !== DB_SCHEMA_VERSION) stashBrokenState(raw);
        markBrokenNotice('MIGRATE_FAILED');
        return inflateSeed();
      }
      const state = migrated.state;
      try {
        return finishLoad(state, migrated);
      } catch (err) {
        /* t127：补键/首扫这类收尾步骤抛错时同样不能白屏——退回种子并提示 */
        stashBrokenState(raw);
        markBrokenNotice('LOAD_STEP_FAILED');
        return inflateSeed();
      }
    }

    /* 迁移成功后的收尾（首扫、补 settings 键、旧模块合并、必要时写回），单独成函数以便整体 try/catch。 */
    function finishLoad(state, migrated) {
      /* 首扫：过期的提醒不补弹，只把 notifiedAt 推到 now（与引擎口径一致） */
      const marked = markOverdueNotified(state.tasks, state.settings, Date.now());
      if (marked.marked > 0) {
        state.db.tasks = marked.tasks;
      }
      /* t111：先把 settings 缺的键补齐（老状态 → 渲染期不再读 undefined） */
      const completed = completeSettings(state.settings);
      if (completed.changed) {
        state.settings = completed.value;
      }
      /* t105：旧三键合并成 onething（首次读到旧键时写一次，此后只读写 onething） */
      const merged = mergeOnethingModule(state.settings);
      if (merged) {
        state.settings = Object.assign({}, state.settings);
      }
      if (migrated.migrated || merged || completed.changed) {
        /* 迁移成功：立刻写回一次，下次进来走 v2 分支（迁移只跑一遍） */
        try {
          window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch (err) {
          /* 配额不足就先留在内存里，schedule 会再试 */
        }
      }
      return state;
    }

    /* 坏数据原文另存：键名带时间戳，永不自动删除；同时记下面板要渲染的致命提示。 */
    let pendingFatal = null;

    function markBrokenFlag(code) {
      if (code) pendingFatal = code;
    }

    function stashBrokenState(raw) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const body = String(raw).slice(0, 512 * 1024);
      /* t127：固定键 dsh.tasks.v1.broken 放「最近一次」原文（验收与用户自助排障都按这个键找），
         带时间戳的历史键继续保留，方便连续多次损坏时回溯。两个键都写失败也不清原数据。 */
      try {
        window.localStorage.setItem(STORE_KEY + '.broken', body);
      } catch (err) {
        /* 配额不足时至少有历史键兜底 */
      }
      try {
        window.localStorage.setItem(STORE_KEY + '.broken.' + stamp, body);
      } catch (err) {
        /* 存不下也不能清原数据 */
      }
      markBrokenFlag('MIGRATE_FAILED');
    }

    function consumeFatal() {
      const code = pendingFatal;
      pendingFatal = null;
      return code;
    }

    /* t127：解析/迁移失败不再直接换成整屏 fatal，而是「按种子启动 + 顶部黄色提示条」。
       pendingBroken 只记一次，面板消费后即清（关掉后本次会话不再出现）。 */
    let pendingBroken = null;

    function markBrokenNotice(reason) {
      pendingBroken = reason || 'LOAD_FAILED';
    }

    function consumeBrokenNotice() {
      const reason = pendingBroken;
      pendingBroken = null;
      return reason;
    }

    /* ------------------------------------ 状态容器 ----------------------------------- */

    function createEmitter() {
      const set = new Set();
      return {
        add: function (fn) {
          set.add(fn);
          return function () {
            set.delete(fn);
          };
        },
        emit: function (payload) {
          set.forEach(function (fn) {
            try {
              fn(payload);
            } catch (err) {
              /* 单个监听器的异常不影响其它监听器 */
            }
          });
        }
      };
    }

    function createStore() {
      let state = loadState();
      /* v2 骨架收口：把 loadState 里可能铺在顶层的分区收回 db，再重挂不可枚举访问器。
         迁移/修补一律在建 store 时做一次，之后每次 update 只在末尾对齐（adoptShards）。 */
      state = adoptShards(state);
      /* t144：projectsOrder 首次生成 / 新增项目追加 / 已删项目剔除（§1.20.7）。
         放在建 store 时做一次：projectOrderOf 是纯函数，连续两次加载必然逐字相同。 */
      const orderedProjects = projectOrderOf(state.projects, state.settings);
      const storedOrder = Array.isArray(state.settings && state.settings.projectsOrder)
        ? state.settings.projectsOrder
        : [];
      if (JSON.stringify(orderedProjects) !== JSON.stringify(storedOrder)) {
        state = adoptShards(Object.assign({}, state, {
          settings: Object.assign({}, state.settings, { projectsOrder: orderedProjects })
        }));
        try {
          window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch (err) {
          /* 配额不足就留在内存里，下一次 update 会再试 */
        }
      }
      /* 刷新/重开：螺旋不后台计时、不补跑，直接按当前 endsAt 结算一次并回 idle（§4.10.7）。
         这条结算只写 history、不弹横幅不响铃，所以放在建 store 时做，而不是等组件挂载。 */
      if (state.spiral && state.spiral.status !== 'idle') {
        const settled = spiralSettle(state, Date.now(), 'reload');
        state = adoptShards(Object.assign({}, state, { spiral: settled.spiral }));
      }
      const listeners = new Set();
      let saveTimer = 0;

      function flush() {
        try {
          window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch (err) {
          /* 超出配额时保持内存态可用 */
        }
      }

      function schedule() {
        if (saveTimer) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(function () {
          saveTimer = 0;
          flush();
        }, 400);
      }

      const toastBus = createEmitter();
      const pending = [];

      return {
        get: function () {
          return state;
        },
        pushAlert: function (item) {
          pending.push(item);
          if (pending.length > 8) pending.shift();
          toastBus.emit(item);
        },
        drainPending: function () {
          const out = pending.slice();
          pending.length = 0;
          return out;
        },
        subscribe: function (fn) {
          listeners.add(fn);
          return function () {
            listeners.delete(fn);
          };
        },
        update: function (mutator) {
          const next = mutator(state);
          if (!next || next === state) return;
          /* 只加壳不搬家：mutator 常用 Object.assign 铺出顶层分区，这里收回 db 再重挂访问器，
             保证「谁是唯一真源」不随写法漂移（见 51-db 的 adoptShards）。 */
          state = adoptShards(next);
          listeners.forEach(function (fn) {
            try {
              fn();
            } catch (err) {
              /* 忽略单个订阅者错误 */
            }
          });
          schedule();
        },
        saveNow: flush,
        toastBus: toastBus
      };
    }

    function useStoreState(store) {
      const [snapshot, setSnapshot] = useState(function () {
        return store.get();
      });
      useEffect(function () {
        return store.subscribe(function () {
          setSnapshot(store.get());
        });
      }, [store]);
      return snapshot;
    }

    /* ------------------------------------ 任务操作 ----------------------------------- */

    function nextRepeatDate(value, repeat) {
      const base = value ? new Date(value.getTime()) : new Date();
      const x = new Date(base.getTime());
      if (repeat === 'DAILY') x.setDate(x.getDate() + 1);
      else if (repeat === 'WEEKLY') x.setDate(x.getDate() + 7);
      else if (repeat === 'MONTHLY') x.setMonth(x.getMonth() + 1);
      else if (repeat === 'YEARLY') x.setFullYear(x.getFullYear() + 1);
      return x;
    }

    function completeTask(store, id) {
      const now = new Date();
      const stamp = now.toISOString();
      store.update(function (state) {
        const source = state.tasks.find(function (t) {
          return t.id === id;
        });
        if (!source) return state;
        const tasks = state.tasks.map(function (t) {
          if (t.id !== id) return t;
          return Object.assign({}, t, { status: 2, completedAt: stamp, notifiedAt: t.notifiedAt || now.getTime() });
        });
        if (source.repeat) {
          const baseDate = parseISO(source.date);
          const rolled = nextRepeatDate(baseDate, source.repeat);
          const clone = Object.assign({}, source, {
            id: uid('t'),
            status: 0,
            deleted: 0,
            completedAt: '',
            createdAt: stamp,
            notifiedAt: 0,
            date: source.allDay ? dateKey(rolled) : isoMin(rolled),
            remindAt: source.remindAt
              ? (source.allDay ? dateKey(rolled) : isoMin(new Date(rolled.getTime() + (parseISO(source.remindAt).getTime() - parseISO(source.date).getTime()))))
              : ''
          });
          tasks.unshift(clone);
        }
        return Object.assign({}, state, { tasks: tasks });
      });
    }

    /* 回写队列：本地完成任务后按 settings.writebackDelay 秒入队，到点由
       createWritebackEngine 调宿主 /writeback。只做标记完成，不改其它字段。 */
    function enqueueWriteback(store, taskId, projectId) {
      const state = store.get();
      const raw = Number(state.settings && state.settings.writebackDelay);
      const delay = isFinite(raw) && raw > 0 ? raw : 0;
      const at = Date.now() + delay * 1000;
      store.update(function (s) {
        const list = (Array.isArray(s.writebackQueue) ? s.writebackQueue : []).filter(function (q) {
          return q.taskId !== taskId;
        });
        list.push({ taskId: taskId, projectId: projectId || '', at: at, tries: 0, error: '' });
        return Object.assign({}, s, { writebackQueue: list });
      });
    }

    /* 回写引擎：每 15 秒扫一次队列，到点批量调宿主 /writeback。
       失败保留在队列里并累加 tries，下一轮重试；成功后出队。 */
    function createWritebackEngine(store) {
      let timer = 0;
      let busy = false;
      function pick(list, taskId) {
        for (let i = 0; i < list.length; i += 1) if (list[i].taskId === taskId) return list[i];
        return null;
      }
      function drain() {
        if (busy) return;
        const queue = Array.isArray(store.get().writebackQueue) ? store.get().writebackQueue : [];
        const due = queue.filter(function (q) {
          return q && q.at <= Date.now();
        });
        if (due.length === 0) return;
        busy = true;
        fetch('/plugins/local/dsh-tasks/writeback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: due.map(function (q) {
              return { projectId: q.projectId, taskId: q.taskId };
            })
          })
        })
          .then(function (res) {
            return res.json();
          })
          .then(function (payload) {
            const done = {};
            ((payload && payload.done) || []).forEach(function (id) {
              done[id] = 1;
            });
            const fail = {};
            ((payload && payload.failed) || []).forEach(function (f) {
              fail[f.taskId] = f.error || 'ERR';
            });
            store.update(function (s) {
              const keep = [];
              (Array.isArray(s.writebackQueue) ? s.writebackQueue : []).forEach(function (q) {
                const hit = pick(due, q.taskId);
                if (!hit) {
                  keep.push(q);
                  return;
                }
                if (done[q.taskId]) return;
                keep.push(Object.assign({}, q, { tries: (q.tries || 0) + 1, error: fail[q.taskId] || 'ERR' }));
              });
              return Object.assign({}, s, { writebackQueue: keep });
            });
          })
          .catch(function () {
            /* 网络失败：队列原样保留，下一轮重试 */
          })
          .then(function () {
            busy = false;
          });
      }
      function start() {
        drain();
        timer = window.setInterval(drain, 15000);
      }
      function stop() {
        if (timer) window.clearInterval(timer);
        timer = 0;
      }
      return { start: start, stop: stop, drain: drain };
    }

    function uncompleteTask(store, id) {
      store.update(function (state) {
        return Object.assign({}, state, {
          tasks: state.tasks.map(function (t) {
            return t.id === id ? Object.assign({}, t, { status: 0, completedAt: '' }) : t;
          })
        });
      });
    }

    function patchTask(store, id, patch) {
      store.update(function (state) {
        return Object.assign({}, state, {
          tasks: state.tasks.map(function (t) {
            return t.id === id ? Object.assign({}, t, patch) : t;
          })
        });
      });
    }

    function deleteTask(store, id) {
      store.update(function (state) {
        return Object.assign({}, state, {
          tasks: state.tasks.map(function (t) {
            return t.id === id ? Object.assign({}, t, { deleted: 1 }) : t;
          })
        });
      });
    }

    function restoreTask(store, id) {
      store.update(function (state) {
        return Object.assign({}, state, {
          tasks: state.tasks.map(function (t) {
            return t.id === id ? Object.assign({}, t, { deleted: 0 }) : t;
          })
        });
      });
    }

    function destroyTask(store, id) {
      store.update(function (state) {
        return Object.assign({}, state, {
          tasks: state.tasks.filter(function (t) {
            return t.id !== id;
          })
        });
      });
    }

    function addTask(store, fields) {
      const stamp = new Date().toISOString();
      const task = {
        id: uid('t'),
        projectId: fields.projectId,
        title: clampText(fields.title || '', 200) || '未命名任务',
        content: '',
        priority: fields.priority || 0,
        status: 0,
        deleted: 0,
        date: fields.date || '',
        allDay: fields.allDay ? 1 : 0,
        remindAt: fields.remindAt || '',
        tags: [],
        createdAt: stamp,
        completedAt: '',
        repeat: fields.repeat || '',
        rruleRaw: fields.rruleRaw || '',
        parentId: fields.parentId || '',
        quadOverride: '',
        pinToday: '',
        notifiedAt: 0
      };
      store.update(function (state) {
        return Object.assign({}, state, { tasks: [task].concat(state.tasks) });
      });
      return task;
    }

    /* 项目色只有一处真源：dt-palette 区的 --dt-project-*（明暗两套）。
       顺序不可动：45-projects.js:9 与下方 createProject 按下标取默认色。 */
    const PROJECT_COLORS = [
      'var(--dt-project-blue)',
      'var(--dt-project-pink)',
      'var(--dt-project-purple)',
      'var(--dt-project-green)',
      'var(--dt-project-orange)',
      'var(--dt-project-teal)',
      'var(--dt-project-red)',
      'var(--dt-project-indigo)'
    ];

    /* 老数据兼容（t80）：t76 之前 `project.color` / `habit.color` 存的是字面 hex。
       这里只做**读取侧等价**——hex 与 token 视为同一个颜色，不改写用户数据、不迁移 localStorage、
       也不做「就近取档」这类猜色。未登记的色值原样返回。 */
    /* 老色值只作为「数据身份」出现，不参与任何染色，所以这里存的是不带 # 前缀的 RGB 字面
       （# 在运行时拼上），让 dt-palette 仍然是样式字面颜色的唯一容身处。 */
    const PROJECT_COLOR_LEGACY_RGB = [
      '4AA6EF', 'E855BE', 'CE89FE', '7BC043', 'F5A623', '3BC9A8', 'E8613E', '8B7EF8'
    ];

    const PROJECT_COLOR_LEGACY = PROJECT_COLOR_LEGACY_RGB.reduce(function (acc, rgb, index) {
      acc['#' + rgb.toUpperCase()] = PROJECT_COLORS[index];
      return acc;
    }, {});

    /* 归一：老 hex → 对应 token；空值、未知色值、已是 token 的值一律原样（trim 后）返回。 */
    function normalizeProjectColor(value) {
      if (typeof value !== 'string') return '';
      const raw = value.trim();
      if (!raw) return '';
      return PROJECT_COLOR_LEGACY[raw.toUpperCase()] || raw;
    }

    /* 等价比色：老 hex 与新 token 视为相同；未知色值按字面比较（大小写不敏感，避免小写老色值漏判）。 */
    function sameProjectColor(a, b) {
      const left = normalizeProjectColor(a);
      const right = normalizeProjectColor(b);
      if (!left || !right) return left === right;
      return left.toLowerCase() === right.toLowerCase();
    }

    const PROJECT_TYPES = [
      { id: 'todo', label: '待办清单', hint: '普通清单，任务各自独立' },
      { id: 'habit', label: '打卡习惯', hint: '习惯按上午 / 下午 / 晚上打卡，不生成任务' },
      { id: 'goal', label: '目标任务', hint: '新建任务默认中优先级' }
    ];

    function projectType(id) {
      return (
        PROJECT_TYPES.find(function (item) {
          return item.id === id;
        }) || PROJECT_TYPES[0]
      );
    }

    function createProject(store, fields) {
      /* 空名直接拒绝：不造「新清单」这种假数据。调用方必须先校验（45-projects.js 的 commit 已拦），
         这里再兜一层，避免将来新增入口绕过校验后在数据里留下无名清单。 */
      const cleanName = clampText((fields && fields.name) || '', 60).trim();
      if (!cleanName) return null;
      const stamp = new Date().toISOString();
      const project = {
        id: uid('p'),
        name: cleanName,
        color: fields.color || PROJECT_COLORS[0],
        icon: clampText(fields.icon || '', 4),
        type: fields.type || 'todo',
        inbox: false,
        createdAt: stamp
      };
      store.update(function (state) {
        return Object.assign({}, state, { projects: state.projects.concat([project]) });
      });
      return project;
    }

    function patchProject(store, id, patch) {
      store.update(function (state) {
        return Object.assign({}, state, {
          projects: state.projects.map(function (p) {
            return p.id === id ? Object.assign({}, p, patch) : p;
          })
        });
      });
    }

    /* 删除清单：其中的任务全部移到收集箱（没有收集箱就给它建一个），不留孤儿任务 */
    function removeProject(store, id) {
      let targetId = '';
      store.update(function (state) {
        const rest = state.projects.filter(function (p) {
          return p.id !== id;
        });
        const inbox = rest.find(function (p) {
          return p.inbox;
        });
        if (inbox) {
          targetId = inbox.id;
        } else if (rest.length) {
          targetId = rest[0].id;
        } else {
          return state;
        }
        return Object.assign({}, state, {
          projects: rest,
          tasks: state.tasks.map(function (t) {
            return t.projectId === id ? Object.assign({}, t, { projectId: targetId }) : t;
          })
        });
      });
      return targetId;
    }
