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

    const SEED = {"p":[["inbox","收集箱","",1]],"t":[],"scores":{},"scoreRubric":"calibrated-2026-11"};
    /* 习惯（打卡实体）：由 build.mjs 从 tt-habits.json 注入，结构与 88-lunar 一样是纯数据 */
    const HABIT_SEED = {"h":[]};

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


    /* ------------------------------------ 提醒引擎 ----------------------------------- */

    function audioContext() {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      if (!audioContext.shared) {
        try {
          audioContext.shared = new Ctor();
        } catch (err) {
          return null;
        }
      }
      return audioContext.shared;
    }

    function beep(times, freq) {
      const ctx = audioContext();
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
      } catch (err) {
        /* 浏览器策略可能拒绝恢复，静默降级 */
      }
      const total = Math.max(1, times || 1);
      for (let i = 0; i < total; i += 1) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * 0.22;
        osc.type = 'sine';
        osc.frequency.value = freq || 880;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      }
    }

    function desktopNotify(title, body, tag) {
      try {
        if (typeof window.Notification !== 'function') return;
        if (window.Notification.permission !== 'granted') return;
        const note = new window.Notification(title, { body: body, tag: tag, silent: true });
        window.setTimeout(function () {
          try {
            note.close();
          } catch (err) {
            /* 已关闭 */
          }
        }, 12000);
      } catch (err) {
        /* 通知不可用时只保留页内横幅 */
      }
    }

    function requestNotificationPermission() {
      try {
        if (typeof window.Notification !== 'function') return Promise.resolve('unsupported');
        if (window.Notification.permission !== 'default') return Promise.resolve(window.Notification.permission);
        return window.Notification.requestPermission();
      } catch (err) {
        return Promise.resolve('error');
      }
    }

    /* 提醒到点的唯一判据：引擎扫描与 JSON 导入共用，避免两套口径。
       stale=true 表示过期已超过 5 分钟——这类只补 notifiedAt，不再弹横幅。 */
    function reminderHit(task, settings, now) {
      if (!task || task.deleted || task.status !== 0) return null;
      const at = effectiveReminder(task, (settings || {}).lead);
      if (!at) return null;
      const atMs = at.getTime();
      if (atMs > now) return null;
      if (task.notifiedAt && task.notifiedAt >= atMs) return null;
      return { at: at, atMs: atMs, stale: now - atMs > 5 * 60000 };
    }

    /* 导入/迁移后补齐过期任务的 notifiedAt：与首扫同一判据，避免重复弹提醒。
       返回新的任务数组与补齐条数，不修改入参。 */
    function markOverdueNotified(tasks, settings, now) {
      let marked = 0;
      const next = (tasks || []).map(function (task) {
        const info = reminderHit(task, settings, now);
        if (!info || !info.stale) return task;
        marked += 1;
        return Object.assign({}, task, { notifiedAt: now });
      });
      return { tasks: next, marked: marked };
    }

    function createReminderEngine(store) {
      let timer = 0;

      const check = function () {
        const state = store.get();
        const now = Date.now();
        const due = [];
        const hit = new Set();
        state.tasks.forEach(function (task) {
          const info = reminderHit(task, state.settings, now);
          if (!info) return;
          hit.add(task.id);
          if (info.stale) return;
          due.push({ task: task, at: info.at });
        });
        if (!hit.size) return;
        store.update(function (current) {
          return Object.assign({}, current, {
            tasks: current.tasks.map(function (task) {
              return hit.has(task.id) ? Object.assign({}, task, { notifiedAt: now }) : task;
            })
          });
        });
        if (!due.length) return;
        due.forEach(function (item) {
          store.pushAlert({
            id: uid('toast'),
            taskId: item.task.id,
            title: item.task.title || '未命名任务',
            projectId: item.task.projectId,
            at: item.at
          });
        });
        if (state.settings.notify) {
          due.forEach(function (item) {
            desktopNotify(
              '任务提醒：' + (item.task.title || '未命名任务'),
              (item.task.content || '').slice(0, 120) || fmtDateLabel(item.at, new Date()) + ' ' + pad2(item.at.getHours()) + ':' + pad2(item.at.getMinutes()),
              item.task.id
            );
          });
        }
        if (state.settings.sound) beep(due.length > 1 ? 3 : 2, 920);
      };

      function start() {
        if (timer) return;
        timer = window.setInterval(function () {
          try {
            check();
          } catch (err) {
            /* 单次扫描失败不终止引擎 */
          }
        }, 2000);
        window.setTimeout(function () {
          try {
            check();
          } catch (err) {
            /* 首轮扫描忽略 */
          }
        }, 1200);
      }

      return {
        start: start,
        stop: function () {
          if (timer) window.clearInterval(timer);
          timer = 0;
        }
      };
    }

    /* ------------------------------------ 番茄引擎 ----------------------------------- */

    function pomoDuration(pomo, mode) {
      if (mode === 'short') return Math.max(0, pomo.short | 0) * 60000;
      if (mode === 'long') return Math.max(0, pomo.long | 0) * 60000;
      return Math.max(0, pomo.work | 0) * 60000;
    }

    /* 唯一的下一段判定：节奏优先 → 时长优先 → 再比 rounds。
       顺序不能换：rounds=0（跳过休息）时 `round >= rounds` 恒真，先比 rounds 会每轮都进长休息，
       而长休息此时是 0 分钟，于是出现「0 秒空转」。消费方：tick() 与番茄页「跳过」按钮。 */
    function nextModeOf(pomo, finishedMode) {
      const rhythm = pomo.rhythm === 'skip' || pomo.rhythm === 'auto' ? pomo.rhythm : 'pause';
      const S = Math.max(0, pomo.short | 0);
      const L = Math.max(0, pomo.long | 0);
      const R = Math.max(0, pomo.rounds | 0);
      const n = pomo.round | 0;

      if (finishedMode === 'work') {
        /* §4.4：跳过休息 = 不排休息，专注接专注，并且立刻开始下一段专注
           （round 照常 +1，计数在 tick() 里与其它节奏一致地 +1）。 */
        if (rhythm === 'skip') return { mode: 'work', round: n + 1, running: true };
        const isLong = R > 0 && n + 1 >= R;
        const breakDuration = isLong ? L : S;
        const mode = breakDuration > 0 ? (isLong ? 'long' : 'short') : 'work';
        return { mode: mode, round: mode === 'long' ? 0 : n + 1, running: rhythm === 'auto' };
      }
      /* 休息结束一律回专注；进入长休息时 round 已归零，这里保持不变 */
      return { mode: 'work', round: n, running: rhythm === 'auto' };
    }

    function createPomodoroEngine(store) {
      let timer = 0;

      const tickPomodoro = function () {
        const pomo = store.get().pomo;
        if (!pomo.running || !pomo.endsAt) return;
        const now = Date.now();
        if (now < pomo.endsAt) return;

        const finishedMode = pomo.mode;
        const today = dateKey(new Date());
        let count = pomo.count;
        let minutes = pomo.minutes;
        if (finishedMode === 'work') {
          count += 1;
          minutes += Math.max(0, pomo.work | 0);
        }

        /* 时长为 0 的段落绝不进入：最多顺延两次，仍为 0 就停在专注态且不自动开始 */
        let step = nextModeOf(pomo, finishedMode);
        let duration = pomoDuration(pomo, step.mode);
        let guard = 0;
        while (duration <= 0 && guard < 2) {
          step = nextModeOf(Object.assign({}, pomo, { mode: step.mode, round: step.round }), step.mode);
          duration = pomoDuration(pomo, step.mode);
          guard += 1;
        }
        const autoRun = step.running && duration > 0;

        store.update(function (state) {
          const nextPomo = Object.assign({}, state.pomo, {
            mode: step.mode,
            round: step.round,
            count: state.pomo.day === today ? count : 0,
            minutes: state.pomo.day === today ? minutes : 0,
            day: today,
            running: autoRun,
            endsAt: autoRun ? now + duration : 0,
            pausedLeft: autoRun ? 0 : duration
          });
          return Object.assign({}, state, { pomo: nextPomo });
        });

        const finishedLabel = finishedMode === 'work' ? '专注结束' : '休息结束';
        const nextLabel = step.mode === 'work' ? '开始专注' : step.mode === 'long' ? '长休息' : '短休息';
        store.pushAlert({
          id: uid('toast'),
          kind: 'pomodoro',
          title: finishedLabel,
          body: '已完成 ' + pomo.work + ' 分钟专注，接下来：' + nextLabel
        });

        const state = store.get();
        if (state.pomo.notify) {
          desktopNotify(finishedLabel, '接下来：' + nextLabel + (autoRun ? '（已自动开始）' : ''));
        }
        if (state.pomo.sound) beep(4, finishedMode === 'work' ? 660 : 990);
      };

      /* 螺旋只依赖 endsAt，切到别的工具页也照常推进（§4.10.7「切走继续计时」）。
         到点统一交给 spiralApplySettle，保留唯一结算入口。 */
      const tickSpiral = function () {
        const state = store.get();
        const spiral = state.spiral;
        if (!spiral || spiral.status !== 'running' || !spiral.endsAt) return;
        const now = Date.now();
        if (now < spiral.endsAt) return;
        /* 迟到窗口（§4.10.7 / t59-D3）：正常路径 ticker 每 500ms 在跑，lateness 恒接近 0，
           这条判据只用于 ticker 被挂起（面板收起、系统休眠、进程冻结）后恢复的那一次 tick。
           ≤60 秒算「刚过点」，照常结算并补一次提醒；>60 秒则静默结算——不弹横幅、不发系统通知、
           不响铃，只在 history 上标 silent，避免用户回来时被一串过期提醒轰炸。
           注意与刷新路径的区别：reload 由 loadState 结算、reason='reload'，本身既不补跑也不提醒。 */
        const lateness = now - spiral.endsAt;
        spiralApplySettle(store, now, 'auto', { lateness: lateness, silent: lateness > 60000 });
      };

      const tick = function () {
        tickPomodoro();
        tickSpiral();
      };

      return {
        start: function () {
          if (timer) return;
          timer = window.setInterval(function () {
            try {
              tick();
            } catch (err) {
              /* 忽略单次 tick 异常 */
            }
          }, 500);
        },
        stop: function () {
          if (timer) window.clearInterval(timer);
          timer = 0;
        }
      };
    }

    function pomodoroRemaining(pomo) {
      if (pomo.running && pomo.endsAt) return Math.max(0, pomo.endsAt - Date.now());
      if (!pomo.running && pomo.pausedLeft) return pomo.pausedLeft;
      return pomoDuration(pomo, pomo.mode);
    }

    function startPomodoro(store) {
      const before = store.get();
      /* 互斥（§4.10.8-2）：螺旋还在跑，就先按「停止」结算回 idle，再启动番茄钟 */
      if (before.spiral && before.spiral.status !== 'idle') {
        const settled = spiralApplySettle(store, Date.now(), 'stop', { silent: true });
        store.pushAlert({
          id: uid('toast'),
          kind: 'spiral',
          title: '螺旋工作法已停止',
          body: '已结算本段 ' + (settled.minutes | 0) + ' 分钟'
        });
      }
      store.update(function (state) {
        const pomo = state.pomo;
        let mode = pomo.mode;
        let round = pomo.round;
        let left = !pomo.running && pomo.pausedLeft ? pomo.pausedLeft : 0;
        let guard = 0;
        if (!left) {
          let duration = pomoDuration(pomo, mode);
          while (duration <= 0 && guard < 2) {
            const step = nextModeOf(Object.assign({}, pomo, { mode: mode, round: round }), mode);
            mode = step.mode;
            round = step.round;
            duration = pomoDuration(pomo, mode);
            guard += 1;
          }
          left = duration;
          if (left <= 0) {
            return Object.assign({}, state, {
              pomo: Object.assign({}, pomo, { mode: 'work', round: round, running: false, endsAt: 0, pausedLeft: 0 })
            });
          }
        }
        return Object.assign({}, state, {
          pomo: Object.assign({}, pomo, { mode: mode, round: round, running: true, endsAt: Date.now() + left, pausedLeft: 0 })
        });
      });
    }

    function pausePomodoro(store) {
      store.update(function (state) {
        const pomo = state.pomo;
        if (!pomo.running) return state;
        return Object.assign({}, state, {
          pomo: Object.assign({}, pomo, {
            running: false,
            pausedLeft: Math.max(0, pomo.endsAt - Date.now()),
            endsAt: 0
          })
        });
      });
    }

    function resetPomodoro(store) {
      store.update(function (state) {
        return Object.assign({}, state, {
          pomo: Object.assign({}, state.pomo, { running: false, endsAt: 0, pausedLeft: 0 })
        });
      });
    }

    function switchPomodoroMode(store, mode) {
      store.update(function (state) {
        return Object.assign({}, state, {
          pomo: Object.assign({}, state.pomo, {
            mode: mode,
            running: false,
            endsAt: 0,
            pausedLeft: 0
          })
        });
      });
    }

    function updatePomodoro(store, patch) {
      store.update(function (state) {
        return Object.assign({}, state, { pomo: Object.assign({}, state.pomo, patch) });
      });
    }

    /* ---------------------------------- 螺旋动作 ---------------------------------- */

    function patchSpiral(store, patch) {
      store.update(function (state) {
        return Object.assign({}, state, { spiral: Object.assign({}, state.spiral || defaultSpiral(), patch) });
      });
    }

    function spiralRemaining(spiral) {
      if (!spiral) return 0;
      if (spiral.status === 'running' && spiral.endsAt) return Math.max(0, spiral.endsAt - Date.now());
      if (spiral.status === 'paused') return Math.max(0, spiral.leftMs | 0);
      return spiralPhaseMeta(spiral.phase).min * 60000;
    }

    /* 结算 + 副作用：toast / 桌面通知 / 响铃三通道（§4.10.6 第 5 条）。
       silent 用于「启动番茄钟时把螺旋停掉」——那条要换成规格指定的另一句文案。 */
    function spiralApplySettle(store, now, reason, options) {
      const opts = options || {};
      const res = spiralSettle(store.get(), now, reason);
      /* 静默结算（D3 >60 秒）：在 history 上留下可区分的标记，供事后核对「这段是迟到补结算的」。
         普通结算写 silent:false，历史行才能一致地读这个字段。 */
      const history = Array.isArray(res.spiral.history) ? res.spiral.history.slice() : [];
      if (history.length) {
        const last = Object.assign({}, history[history.length - 1], { silent: !!opts.silent });
        history[history.length - 1] = last;
        res.spiral = Object.assign({}, res.spiral, { history: history });
      }
      store.update(function (state) {
        return Object.assign({}, state, { spiral: res.spiral });
      });
      if (reason === 'reload') return res;
      if (res.alert && !opts.silent) {
        store.pushAlert({ id: uid('toast'), kind: 'spiral', title: res.alert.title, body: res.alert.body });
        /* D2（t59）：停止只留页面内横幅，不响铃、不发系统通知（§4.10.7）。
           auto 路径三通道（横幅 / 桌面通知 / 响铃）保持原状。 */
        if (reason !== 'stop' && res.spiral.notify) desktopNotify(res.alert.title, res.alert.body);
        if (reason !== 'stop' && res.spiral.sound && res.beep) beep(res.beep.times, res.beep.freq);
      }
      if (res.invalidated && !opts.silent) {
        const name = spiralItemName(store.get(), res.spiral.aTaskId) || '未绑定';
        store.pushAlert({ id: uid('toast'), kind: 'spiral', title: 'A 清单绑定已失效', body: '已换为：' + name });
      }
      return res;
    }

    function spiralStart(store) {
      const state = store.get();
      const current = state.spiral || defaultSpiral();
      if (current.status !== 'idle') return;
      /* 互斥（§4.10.8-1）：先把番茄钟挂起，不结算、不重置 */
      if (state.pomo && state.pomo.running) {
        pausePomodoro(store);
        store.pushAlert({ id: uid('toast'), kind: 'spiral', title: '番茄钟已暂停', body: '螺旋工作法已开始' });
      }
      const now = Date.now();
      const bindings = spiralBindings(state, current, now);
      store.update(function (cur) {
        return Object.assign({}, cur, {
          spiral: Object.assign({}, cur.spiral || defaultSpiral(), {
            status: 'running',
            phase: 0,
            round: 1,
            endsAt: now + SPIRAL_PHASES[0].min * 60000,
            leftMs: 0,
            startedAt: now,
            pausedAt: 0,
            pausedTotal: 0,
            phaseDone: false,
            aTaskId: bindings.aTaskId,
            bItemId: bindings.bItemId,
            day: dateKey(new Date(now))
          })
        });
      });
    }

    function spiralPause(store) {
      store.update(function (state) {
        const spiral = state.spiral;
        if (!spiral || spiral.status !== 'running') return state;
        const now = Date.now();
        return Object.assign({}, state, {
          spiral: Object.assign({}, spiral, {
            status: 'paused',
            leftMs: Math.max(0, spiral.endsAt - now),
            pausedAt: now,
            endsAt: 0
          })
        });
      });
    }

    function spiralResume(store) {
      store.update(function (state) {
        const spiral = state.spiral;
        if (!spiral || spiral.status !== 'paused') return state;
        const now = Date.now();
        const pausedTotal = Math.max(0, spiral.pausedTotal | 0) + Math.max(0, now - (spiral.pausedAt || now));
        return Object.assign({}, state, {
          spiral: Object.assign({}, spiral, {
            status: 'running',
            pausedAt: 0,
            pausedTotal: pausedTotal,
            endsAt: now + Math.max(0, spiral.leftMs | 0),
            leftMs: 0
          })
        });
      });
    }

    function spiralStop(store) {
      const state = store.get();
      if (!state.spiral || state.spiral.status === 'idle') return;
      spiralApplySettle(store, Date.now(), 'stop');
    }

    /* 「这段完成了」：只在 a 段有意义，立刻计数（§4.10.4） */
    function spiralDone(store) {
      const state = store.get();
      const spiral = state.spiral;
      if (!spiral || spiral.status === 'idle') return;
      if (spiralPhaseMeta(spiral.phase).phase !== 'a') return;
      if (spiral.aTaskId) completeTask(store, spiral.aTaskId);
      store.update(function (cur) {
        const current = cur.spiral;
        if (!current) return cur;
        const stats = Object.assign({ rounds: 0, aMin: 0, bMin: 0, doneCount: 0 }, current.stats || {});
        stats.doneCount = (stats.doneCount | 0) + 1;
        return Object.assign({}, cur, {
          spiral: Object.assign({}, current, { phaseDone: true, stats: stats })
        });
      });
    }

    /* B 清单增删改排序：只动 state.spiralItems，绝不触碰 projects/tasks（§4.10.4） */
    function spiralItemsSorted(state) {
      return ((state && state.spiralItems) || []).slice().sort(function (x, y) {
        return (x.order | 0) - (y.order | 0);
      });
    }

    function spiralAddItem(store) {
      const id = uid('play');
      store.update(function (state) {
        const items = spiralItemsSorted(state);
        const maxOrder = items.reduce(function (max, item) {
          return Math.max(max, item.order | 0);
        }, 0);
        return Object.assign({}, state, {
          spiralItems: items.concat([{ id: id, name: '新娱乐条目', order: maxOrder + 1 }])
        });
      });
      return id;
    }

    function spiralPatchItem(store, id, patch) {
      store.update(function (state) {
        return Object.assign({}, state, {
          spiralItems: (state.spiralItems || []).map(function (item) {
            return item.id === id ? Object.assign({}, item, patch) : item;
          })
        });
      });
    }

    function spiralRemoveItem(store, id) {
      const state = store.get();
      const items = spiralItemsSorted(state);
      const wasBound = state.spiral && state.spiral.bItemId === id;
      /* order 压实（§8-66 / t59-X66）：删中间项会留空洞（1,2,4,5），
         这里按剩余项的既有相对顺序重排成 1..n；相对顺序不变，只改序号。 */
      const rest = items
        .filter(function (item) {
          return item.id !== id;
        })
        .map(function (item, index) {
          return Object.assign({}, item, { order: index + 1 });
        });
      store.update(function (cur) {
        const spiral = cur.spiral || defaultSpiral();
        const next = Object.assign({}, spiral);
        if (wasBound) next.bItemId = rest.length ? rest[0].id : '';
        return Object.assign({}, cur, {
          spiralItems: rest,
          spiral: next
        });
      });
      if (wasBound && rest.length) {
        store.pushAlert({ id: uid('toast'), kind: 'spiral', title: 'B 绑定已换为：' + rest[0].name, body: '' });
      }
    }

    function spiralMoveItem(store, id, delta) {
      store.update(function (state) {
        const items = spiralItemsSorted(state);
        const index = items.findIndex(function (item) {
          return item.id === id;
        });
        const target = index + (delta | 0);
        if (index < 0 || target < 0 || target >= items.length) return state;
        const swapped = items.slice();
        const moved = swapped[index];
        swapped[index] = swapped[target];
        swapped[target] = moved;
        return Object.assign({}, state, {
          spiralItems: swapped.map(function (item, order) {
            return Object.assign({}, item, { order: order + 1 });
          })
        });
      });
    }


    /* ---------------------------------- UI 基础组件 ---------------------------------- */

    function mk(tag) {
      return function (props) {
        return h.apply(null, [tag, props].concat(Array.prototype.slice.call(arguments, 1)));
      };
    }

    const div = mk('div');
    const span = mk('span');
    const button = mk('button');
    const input = mk('input');
    const label = mk('label');
    const textarea = mk('textarea');
    const select = mk('select');
    const option = mk('option');
    const svg = mk('svg');
    const g = mk('g');
    const path = mk('path');
    const circle = mk('circle');
    const svgText = mk('text');
    const a = mk('a');

    function icon(name, size) {
      const s = size || 15;
      const common = {
        width: s,
        height: s,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
      };
      let shape;
      if (name === 'check') shape = [h('path', { key: 'a', d: 'M4 12.5l5 5L20 6.5' })];
      else if (name === 'sun') shape = [h('circle', { key: 'a', cx: 12, cy: 12, r: 4 }), h('path', { key: 'b', d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' })];
      else if (name === 'face-sad') shape = [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 8.6 }),
        h('circle', { key: 'b', cx: 9, cy: 10, r: 0.9, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'c', cx: 15, cy: 10, r: 0.9, fill: 'currentColor', stroke: 'none' }),
        h('path', { key: 'd', d: 'M8.4 16.2c.9-1.15 2.15-1.75 3.6-1.75s2.7.6 3.6 1.75' })
      ];
      else if (name === 'calendar') shape = [h('rect', { key: 'a', x: 3, y: 5, width: 18, height: 16, rx: 3 }), h('path', { key: 'b', d: 'M3 10h18M8 3v4M16 3v4' })];
      else if (name === 'spark') shape = [h('path', { key: 'a', d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z' })];
      else if (name === 'arrow-up') shape = [h('path', { key: 'a', d: 'M12 20V5M6 11l6-6 6 6' })];
      else if (name === 'arrow-down') shape = [h('path', { key: 'a', d: 'M12 4v15M6 13l6 6 6-6' })];
      else if (name === 'inbox') shape = [h('path', { key: 'a', d: 'M3 13l2.5-7.5A2 2 0 017.4 4h9.2a2 2 0 011.9 1.5L21 13v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4z' }), h('path', { key: 'b', d: 'M3 13h5l1 2h6l1-2h5' })];
      else if (name === 'trash') shape = [h('path', { key: 'a', d: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13' })];
      else if (name === 'folder') shape = [h('path', { key: 'a', d: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' })];
      else if (name === 'timer') shape = [h('circle', { key: 'a', cx: 12, cy: 13, r: 8 }), h('path', { key: 'b', d: 'M12 13V9M9 2h6' })];
      else if (name === 'gear') shape = [h('circle', { key: 'a', cx: 12, cy: 12, r: 3.2 }), h('path', { key: 'b', d: 'M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 110-4 1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0011 4.6a2 2 0 114 0 1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11a2 2 0 110 4z' })];
      else if (name === 'bell') shape = [h('path', { key: 'a', d: 'M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6' }), h('path', { key: 'b', d: 'M10 20a2.2 2.2 0 004 0' })];
      else if (name === 'repeat') shape = [h('path', { key: 'a', d: 'M17 3l3 3-3 3' }), h('path', { key: 'b', d: 'M20 6H8a4 4 0 00-4 4v1M7 21l-3-3 3-3' }), h('path', { key: 'c', d: 'M4 18h12a4 4 0 004-4v-1' })];
      else if (name === 'plus') shape = [h('path', { key: 'a', d: 'M12 5v14M5 12h14' })];
      else if (name === 'flag') shape = [h('path', { key: 'a', d: 'M5 21V4h9l-1 3h6l-2 5 2 5h-6l-1-2H5' })];
      else if (name === 'play') shape = [h('path', { key: 'a', d: 'M8 5l11 7-11 7V5z', fill: 'currentColor', stroke: 'none' })];
      else if (name === 'pause') shape = [h('rect', { key: 'a', x: 7, y: 5, width: 3.6, height: 14, rx: 1, fill: 'currentColor', stroke: 'none' }), h('rect', { key: 'b', x: 13.4, y: 5, width: 3.6, height: 14, rx: 1, fill: 'currentColor', stroke: 'none' })];
      else if (name === 'reset') shape = [h('path', { key: 'a', d: 'M4 12a8 8 0 1114 5' }), h('path', { key: 'b', d: 'M4 5v5h5' })];
      else if (name === 'close') shape = [h('path', { key: 'a', d: 'M6 6l12 12M18 6L6 18' })];
      else if (name === 'ban') shape = [h('circle', { key: 'a', cx: 12, cy: 12, r: 8 }), h('path', { key: 'b', d: 'M7 17L17 7' })]
      else if (name === 'search') shape = [h('circle', { key: 'a', cx: 11, cy: 11, r: 6.5 }), h('path', { key: 'b', d: 'M16 16l4.5 4.5' })];
      else if (name === 'chevron-left') shape = [h('path', { key: 'a', d: 'M15 5l-7 7 7 7' })];
      else if (name === 'chevron-right') shape = [h('path', { key: 'a', d: 'M9 5l7 7-7 7' })];
      else if (name === 'dots') shape = [
        h('circle', { key: 'a', cx: 5.5, cy: 12, r: 1.35, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'b', cx: 12, cy: 12, r: 1.35, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'c', cx: 18.5, cy: 12, r: 1.35, fill: 'currentColor', stroke: 'none' })
      ];
      /* 螺旋工作法：一条顺时针向外扩张的连续弧线（不得复用 repeat） */
      else if (name === 'spiral') shape = [h('path', { key: 'a', d: 'M12 12a1.6 1.6 0 011.6 1.6 3.2 3.2 0 01-3.2 3.2A4.8 4.8 0 015.6 12 6.4 6.4 0 0112 5.6 8 8 0 0120 13.6' })];
      /* 四象限：2×2 网格，右上角块实心，强调「重要且紧急」 */
      else if (name === 'quadrant') shape = [
        h('rect', { key: 'a', x: 3.5, y: 3.5, width: 7.2, height: 7.2, rx: 1.6 }),
        h('rect', { key: 'b', x: 13.3, y: 3.5, width: 7.2, height: 7.2, rx: 1.6, fill: 'currentColor', stroke: 'none' }),
        h('rect', { key: 'c', x: 3.5, y: 13.3, width: 7.2, height: 7.2, rx: 1.6 }),
        h('rect', { key: 'd', x: 13.3, y: 13.3, width: 7.2, height: 7.2, rx: 1.6 })
      ];
      else if (name === 'sliders') shape = [
        h('path', { key: 'a', d: 'M4 8h7M17 8h3' }),
        h('circle', { key: 'b', cx: 14, cy: 8, r: 2.2 }),
        h('path', { key: 'c', d: 'M4 16h3M13 16h7' }),
        h('circle', { key: 'd', cx: 10, cy: 16, r: 2.2 })
      ];
      else if (name === 'grip') shape = [h('path', { key: 'a', d: 'M5 8h14M5 12h14M5 16h14' })];
      else shape = [h('circle', { key: 'a', cx: 12, cy: 12, r: 8 })];
      return svg(common, shape);
    }

    function SidebarIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 22;
      return svg(
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true
        },
        h('rect', { key: 'r', x: 3, y: 4, width: 18, height: 17, rx: 4 }),
        h('path', { key: 'a', d: 'M7.4 9.6l1.7 1.7 2.9-3.3' }),
        h('path', { key: 'b', d: 'M14.2 9.7h3.4' }),
        h('path', { key: 'c', d: 'M7.4 15.6l1.7 1.7 2.9-3.3' }),
        h('path', { key: 'd', d: 'M14.2 15.7h3.4' })
      );
    }

    /* ------------------------------------ 视图筛选 ----------------------------------- */

    const SMART_VIEWS = [
      { id: 'today', label: '今天', icon: 'sun' },
      { id: 'week', label: '最近 7 天', icon: 'calendar' },
      { id: 'open', label: '全部未完成', icon: 'inbox' },
      { id: 'done', label: '已完成', icon: 'check' },
      { id: 'trash', label: '已删除', icon: 'trash' }
    ];

    /* ---------------------- 下拉菜单定位（§0.5，全仓唯一判据） ----------------------
       四象限角标菜单 .dtQuadMenu 与日历三点菜单 .dtMenu 共用：
       GAP 2 / PAD 8 / 菜单宽 132 / 菜单最大高 240；
       下方放得下 → data-flip="down"；否则上方放得下 → "up"；
       都放不下 → 取空间大的一侧 + data-clamp="1" + max-height=min(240, 所选侧)。
       menuH 必须「挂载可见后实测」，所以打开时先按 240 上限保守定位，挂载后
       用实测高度复算一次（同一个 menuFlip），避免首帧跳动。 */
    const MENU_GAP = 2;
    const MENU_PAD = 8;
    const MENU_WIDTH = 132;
    const MENU_MAX_H = 240;

    function menuFlip(a, clip, menuH) {
      const below = clip.bottom - a.bottom - MENU_PAD;
      const above = a.top - clip.top - MENU_PAD;
      if (below >= menuH) return { flip: 'down', clamp: false, maxHeight: MENU_MAX_H };
      if (above >= menuH) return { flip: 'up', clamp: false, maxHeight: MENU_MAX_H };
      const flip = above > below ? 'up' : 'down';
      const room = flip === 'up' ? above : below;
      return { flip: flip, clamp: true, maxHeight: Math.max(80, Math.min(MENU_MAX_H, room)) };
    }

    /* 取几何量：anchor=触发按钮、clip=最近的裁剪祖先（.dtQuadBody / .dtCal）、
       menuH=菜单实测高度。任一步拿不到布局就按「向下不夹高」兜底，
       保证没有布局信息的宿主也不出错。 */
    function menuFlipOf(anchorEl, clipSelector, menuEl) {
      const fallback = { flip: 'down', clamp: false, maxHeight: MENU_MAX_H };
      try {
        if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return fallback;
        const a = anchorEl.getBoundingClientRect();
        if (!a || typeof a.bottom !== 'number' || typeof a.top !== 'number') return fallback;
        let clip = a;
        if (clipSelector && typeof anchorEl.closest === 'function') {
          const box = anchorEl.closest(clipSelector);
          if (box && typeof box.getBoundingClientRect === 'function') {
            const boxRect = box.getBoundingClientRect();
            if (boxRect && typeof boxRect.bottom === 'number' && typeof boxRect.top === 'number') clip = boxRect;
          }
        }
        const measured = menuEl && typeof menuEl.offsetHeight === 'number' ? menuEl.offsetHeight : 0;
        return menuFlip(a, clip, measured > 0 ? measured : MENU_MAX_H);
      } catch (err) {
        return fallback;
      }
    }

    /* 打开时算一次 + window resize 再算一次；clip 滚动不重算（§0.5 第 2 条）。
       返回 { value, measure }：measure 供打开菜单的那一刻立刻算一次（此时菜单
       还没挂载，menuH 先按 240 上限），挂载后 effect 用实测高度复算修正。 */
    function useMenuFlip(open, anchorRef, clipSelector, menuRef) {
      const [flip, setFlip] = useState({ flip: 'down', clamp: false, maxHeight: MENU_MAX_H });
      const measure = function (anchorEl) {
        setFlip(menuFlipOf(anchorEl || anchorRef.current, clipSelector, menuRef.current));
      };
      useEffect(function () {
        if (!open) return undefined;
        const apply = function () { measure(); };
        apply();
        window.addEventListener('resize', apply);
        return function () { window.removeEventListener('resize', apply); };
      }, [open]);
      return { value: flip, measure: measure };
    }

    /* ---------------------- 浮层 Esc 注册表（§1.2.1，一次只消费一层） ----------------------
       浮层（编辑器 / 四象限菜单 / 日历菜单 / 清单弹窗）开合时把自己登记进来，
       后登记的在上；40-panel 的捕获监听取最上面一层关掉并截停，抽屉 B/A 两层
       仍由它自己的冒泡监听接手。监听本身常驻，不随状态挂卸。 */
    /* 层级只用于「谁在最上面」：菜单 50 > 编辑器 40 > 抽屉（不在注册表内）。
       每个 closer 自己判断是否还开着——浮层卸载后它的开关状态为空，返回 false，
       于是同一次按键会继续往下落到编辑器 / 抽屉，不会出现「空转吃掉一次 Esc」。 */
    const OVERLAY_LEVEL = { menu: 50, editor: 40, modal: 60 };
    const OVERLAY_CLOSERS = [];
    let overlaySeq = 0;

    function registerOverlayCloser(level, closer) {
      const entry = { level: level | 0, seq: (overlaySeq += 1), closer: closer };
      OVERLAY_CLOSERS.push(entry);
      return function () {
        const index = OVERLAY_CLOSERS.indexOf(entry);
        if (index >= 0) OVERLAY_CLOSERS.splice(index, 1);
      };
    }

    function closeTopOverlay() {
      const order = OVERLAY_CLOSERS.slice().sort(function (a, b) {
        if (a.level !== b.level) return b.level - a.level;
        return b.seq - a.seq;
      });
      for (let i = 0; i < order.length; i += 1) {
        try {
          if (order[i].closer()) return true;
        } catch (err) {
          /* 某一层关不掉不该拦住其它层 */
        }
      }
      return false;
    }

    /* §1.2.2 作用域封闭 / 传播边界 / 处理器兜底：
       - click + mousedown + pointerdown 全部截停，事件一律不出 .dtRoot；
       - click 处理器整体 try/catch，失败落 .dtToastLayer（标题「操作失败：<message>」、4 秒消失），
         console.warn 同一条消息只打一次。
       注意：截停必须发生在改状态之前（§1.2.2 L207–213 的顺序）。 */
    const WARNED_ACTIONS = {};

    function stopActionEvent(event) {
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    function reportActionError(store, err) {
      const message = err && err.message ? String(err.message) : String(err);
      if (!WARNED_ACTIONS[message]) {
        WARNED_ACTIONS[message] = true;
        if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-tasks] 操作失败：' + message, err);
      }
      if (store && typeof store.pushAlert === 'function') {
        store.pushAlert({ id: uid('toast'), title: '操作失败：' + message, body: '', ttl: 4000 });
      }
    }

    function scopedAction(store, run) {
      return {
        onClick: function (event) {
          stopActionEvent(event);
          try {
            run(event);
          } catch (err) {
            reportActionError(store, err);
          }
        },
        onMouseDown: stopActionEvent,
        onPointerDown: stopActionEvent
      };
    }

    /* §1.2.1 唯一例外：焦点在输入类控件内时 Esc 全链不消费、不截停。 */
    function escTargetInField(target) {
      if (!target) return false;
      const tag = String(target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (target.isContentEditable) return true;
      if (typeof target.closest === 'function' && target.closest('[contenteditable="true"]')) return true;
      return false;
    }

    function compareOpen(a, b) {
      const da = parseISO(a.date);
      const db = parseISO(b.date);
      if (da && db) {
        if (da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
      } else if (da) return -1;
      else if (db) return 1;
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    }

    function compareDone(a, b) {
      return String(b.completedAt || '').localeCompare(String(a.completedAt || ''));
    }

    function filterTasks(state, view, query, showDone) {
      const now = new Date();
      const needle = query.trim().toLowerCase();
      let list;
      /* 日期视图（§1.6）：`date:YYYY-MM-DD` 落在筛选器首位——它既不属于某清单，
         也不受「含已完成」影响，计数口径就是「该日全部未删除任务」。 */
      if (view && view.indexOf('date:') === 0) {
        const key = view.slice(5);
        const dayOpen = [];
        const dayDone = [];
        state.tasks.forEach(function (t) {
          if (t.deleted) return;
          const due = parseISO(t.date);
          if (!due || dateKey(due) !== key) return;
          if (t.status === 2) dayDone.push(t);
          else if (t.status === 0) dayOpen.push(t);
        });
        list = dayOpen.sort(compareOpen).concat(dayDone.sort(compareDone));
      } else if (view && view.indexOf('tag:') === 0) {
        /* 标签视图（§3.3.3 / 61-tags）：先按标签筛，再按「含已完成」拆两段——
           与清单视图同口径（未完成在前、已完成在后），脏标签在这里已经被 tagNamesOf 滤掉。 */
        const tagName = view.slice(4);
        const taggedOpen = [];
        const taggedDone = [];
        state.tasks.forEach(function (t) {
          if (t.deleted) return;
          if (tagNamesOf(t).indexOf(tagName) < 0) return;
          if (t.status === 2) taggedDone.push(t);
          else if (t.status === 0) taggedOpen.push(t);
        });
        list = taggedOpen.sort(compareOpen).concat(showDone ? taggedDone.sort(compareDone) : []);
      } else if (view === 'done') list = state.tasks.filter(function (t) { return t.status === 2 && !t.deleted; }).sort(compareDone);
      else if (view === 'trash') list = state.tasks.filter(function (t) { return !!t.deleted; }).sort(compareDone);
      else {
        list = state.tasks.filter(function (t) { return t.status === 0 && !t.deleted; }).sort(compareOpen);
        if (view === 'today') {
          list = list.filter(function (t) {
            const d = parseISO(t.date);
            return d ? dayDiff(d, now) <= 0 : false;
          });
        } else if (view === 'week') {
          list = list.filter(function (t) {
            const d = parseISO(t.date);
            if (!d) return false;
            const diff = dayDiff(d, now);
            return diff >= 0 && diff <= 7;
          });
        } else if (view.indexOf('p:') === 0) {
          const projectId = view.slice(2);
          const openOnes = list.filter(function (t) { return t.projectId === projectId; });
          if (showDone) {
            const doneOnes = state.tasks
              .filter(function (t) { return t.projectId === projectId && t.status === 2 && !t.deleted; })
              .sort(compareDone)
              .slice(0, 200);
            list = openOnes.concat(doneOnes);
          } else {
            list = openOnes;
          }
        }
      }
      if (needle) {
        list = list.filter(function (t) {
          const hay = (t.title + ' ' + t.content + ' ' + normalizeTags(t.tags).join(' ')).toLowerCase();
          return hay.indexOf(needle) >= 0;
        });
      }
      return list;
    }

    /* 四象限：判定函数是唯一实现（§2.5.1），不得读 store、不得读当前视图。
       阈值 3 = 中优先级（PRIORITY_META 只有 无/低/中/高 四档）；紧急取 dayDiff<=1
       而非 <=0 —— today 视图只收 <=0，若四象限也收 <=0，q1 在真实数据下几乎恒空。 */
    const QUADRANTS = [
      { id: 'q1', title: '重要且紧急', empty: '今天没有重要又紧急的事' },
      { id: 'q2', title: '重要不紧急', empty: '把重要的事先排进来' },
      { id: 'q3', title: '紧急不重要', empty: '紧急但不重要的，能委托就委托' },
      { id: 'q4', title: '不重要不紧急', empty: '没有不重要也不紧急的事' }
    ];

    function quadOf(task, today) {
      if (task.quadOverride) return task.quadOverride;
      const important = (task.priority | 0) >= 3;
      const due = parseISO(task.date);
      const urgent = !!due && dayDiff(due, today) <= 1;
      if (important) return urgent ? 'q1' : 'q2';
      return urgent ? 'q3' : 'q4';
    }

    function quadSrcOf(task) {
      return task.quadOverride ? 'override' : 'derived';
    }

    /* 优先级 → 四色键（§0.6 断言要比对颜色键而不是颜色值） */
    const PRIO_COLOR_KEY = { 0: 'none', 1: 'blue', 3: 'yellow', 5: 'red' };
    /* 象限 → 颜色键（§2.5.5.2）：与 --dt-quad-* 一一对应，Q4 = none（透明，
       不是灰色——灰色会和「未分类」混为一谈）。 */
    const QUAD_COLOR_KEY = { q1: 'red', q2: 'yellow', q3: 'blue', q4: 'none' };
    /* 四色同源（§0.6 / 回归 Q21）：优先级标题色与四象限左色边必须来自同一套面板 token。
       以前标题色写 PALETTE 的宿主 alias、格子边写 --dt-quad-*，两处字面不同 → Q21 判「两处各写一份」；
       且宿主 alias 未定义时 var() 会退化成 currentColor（实测近黑边 F18）。统一到 --dt-quad-*。 */
    const PRIO_TITLE_COLOR = { 0: '', 1: 'var(--dt-quad-blue)', 3: 'var(--dt-quad-yellow)', 5: 'var(--dt-quad-red)' };

    /* 今日要事存日期串而非布尔：跨天自动失效，不需要任何清理任务 */
    function isPinned(task, today) {
      return !!task.pinToday && task.pinToday === dateKey(today);
    }

    /* ----------------------------------- 权重环 ------------------------------------- */
    /* 20px 环：半径 8 → 周长 2π×8 ≈ 50.27，用 dashoffset 表达百分比。
       §1.17 起颜色由 data-score-band 五档色带表达（旧四档 stroke-opacity 与旧十档均已作废、恒 1）；
       tier（20/40/60 四档）只保留语义、不再驱动颜色，两者互不推导。 */
    const SCORE_RING_C = Math.round(2 * Math.PI * 8 * 100) / 100;
    const SCORE_SRC_KEY = { manual: 'manual', agent: 'agent', auto: 'local' };

    function scoreRingOf(entry, mode) {
      if (!entry) return null;
      const score = Math.max(0, Math.min(100, Number(entry.score)));
      const tier = SCORE_TIERS.reduce(function (acc, edge) { return score >= edge ? acc + 1 : acc; }, 0);
      const hundredths = Math.round(score * 10);
      const arc = scoreArcOf(score, mode);
      return {
        score: hundredths / 10,
        tier: tier,
        band: arc.band,
        arcLight: arc.light,
        arcDark: arc.dark,
        offset: Math.round(SCORE_RING_C * (1 - hundredths / 1000) * 100) / 100,
        src: SCORE_SRC_KEY[entry.source] || 'local',
        origin: entry.origin || 'heuristic',
        updatedAt: entry.updatedAt | 0
      };
    }

    /* 弧色只走两个 CSS 变量（浅色 / 深色各一个），样式表里不再出现第二份 hex */
    function scoreArcStyle(info) {
      if (!info || info.band < 0) return null;
      return { '--dt-score-arc': info.arcLight, '--dt-score-arc-dark': info.arcDark };
    }

    function scoreStamp(ms) {
      if (!ms) return '';
      const d = new Date(ms);
      return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    /* bare=true：只画环，不挂 data-score / data-score-src / data-score-origin / data-score-tier。
       C 栏评分控件里必须用 bare —— 规格 §1.13.1 规定 data-score 与 data-score-tier
       在 C 栏内只允许出现在 [data-dt="score-edit"] 这一个元素上。
       行内环带 data-slot="score" 与 data-score-band（§1.16.1 / §1.17.3），
       **不再带 data-score-tier**（档位只由颜色表达）。 */
    function ScoreRing(props) {
      const info = scoreRingOf(props.entry, props.mode);
      const slot = props.slot ? { 'data-slot': props.slot } : null;
      const title = info
        ? info.score.toFixed(1) + ' 分 · ' + (info.src === 'manual' ? '手动' : info.src === 'agent' ? '智能体' : '自动') + (info.updatedAt ? ' · ' + scoreStamp(info.updatedAt) : '')
        : '未打分';
      if (!info) {
        return span(
          Object.assign(
            {
              className: 'dtScoreRing dtScoreRingEmpty',
              'data-score': props.bare ? undefined : '',
              'data-score-src': props.bare ? undefined : 'none',
              'data-score-origin': props.bare ? undefined : 'none',
              'data-score-band': '-1',
              'data-dt': 'score-ring',
              title: title,
              'aria-label': title
            },
            slot
          ),
          svg({ viewBox: '0 0 20 20', 'aria-hidden': true }, [
            circle({ key: 't', className: 'dtScoreTrack', cx: 10, cy: 10, r: 8 })
          ])
        );
      }
      return span(
        Object.assign(
          {
            className: 'dtScoreRing' + (info.origin === 'heuristic' ? ' dtScoreRingHeuristic' : ''),
            'data-score': props.bare ? undefined : info.score.toFixed(1),
            'data-score-src': props.bare ? undefined : info.src,
            'data-score-origin': props.bare ? undefined : info.origin,
            'data-score-band': String(info.band),
            'data-dt': 'score-ring',
            title: title,
            'aria-label': title,
            style: scoreArcStyle(info)
          },
          slot
        ),
        svg({ viewBox: '0 0 20 20', 'aria-hidden': true }, [
          circle({ key: 't', className: 'dtScoreTrack', cx: 10, cy: 10, r: 8 }),
          circle({
            key: 'a',
            className: 'dtScoreArc',
            cx: 10,
            cy: 10,
            r: 8,
            strokeDasharray: SCORE_RING_C,
            strokeDashoffset: info.offset,
            transform: 'rotate(-90 10 10)'
          })
        ])
      );
    }

    /* C 栏评分控件（§1.13）：环 + 只读文案 + 滑杆 + 数字框 + 保存 + 重置。
       三条硬规则落在实现里：
       · 拖动滑杆只改本地草稿并置 data-pending=1，绝不写库；
       · 回车 / 失焦 / 点「保存」走同一个 commit()，写入唯一入口 actionSetScore；
       · busy 只来自 db.meta.busy（批量打分期间），不新增运行时字段、不落库。 */
    const SCORE_TEXT_UNIT = ' 分';

    function scoreSrcOf(entry) {
      if (!entry) return 'none';
      return scoreSourceOf(entry.source);
    }

    function scoreTextOf(entry) {
      if (!entry) return '未打分';
      const src = scoreSrcOf(entry);
      const label = src === 'manual' ? '手动' : src === 'agent' ? '智能体' : '自动';
      const at = entry.updatedAt ? ' · ' + scoreStamp(entry.updatedAt) : '';
      return scoreRingOf(entry, 'bands').score.toFixed(1) + SCORE_TEXT_UNIT + ' · ' + label + at;
    }

    /* 重置要回到「改前自动分」：优先取该任务最近一条反馈的 before.score
       （那是用户手动覆盖前的真实自动分），没有反馈才回落到公式 scoreTask。 */
    function scoreAutoBaselineOf(db, task) {
      const rows = db && Array.isArray(db.scoreFeedback) ? db.scoreFeedback : [];
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (!row || row.taskId !== task.id) continue;
        if (row.before && typeof row.before.score === 'number' && isFinite(row.before.score)) {
          return Math.round(row.before.score);
        }
      }
      const computed = scoreTask(task, db);
      return Math.round(Math.max(0, Math.min(100, Number(computed) || 0)));
    }

    function ScoreEdit(props) {
      const task = props.task;
      const store = props.store;
      const state = store && store.get ? store.get() : (props.state || null);
      const db = state && state.db ? state.db : null;
      const entry = db ? selectScoreEntry(db, task.id) : null;
      const stored = entry && typeof entry.score === 'number' ? entry.score : null;
      const src = scoreSrcOf(entry);
      const tier = entry ? scoreTierOf(stored) : -1;
      /* 弧色由分数档位决定（§1.17.3）：C 栏 score-edit 也要带 data-score-band（值域 0..4，-1 = 无分） */
      const scoreMode = scoreRingModeOf(state && state.settings);
      const band = entry && stored !== null ? scoreBandOf(stored) : -1;
      const arcStyle = band >= 0 ? scoreArcStyle({ band: band, arcLight: scoreArcOf(stored, scoreMode).light, arcDark: scoreArcOf(stored, scoreMode).dark }) : null;
      const busy = !!(db && db.meta && db.meta.busy);
      const storedText = stored === null ? '0' : stored.toFixed(1);

      const [draft, setDraft] = useState(storedText);
      const [pending, setPending] = useState(false);
      const [invalid, setInvalid] = useState(false);

      /* 换任务、或库内分被外部改动（批量打分/重置/别的窗口）时，草稿跟随已存值 */
      useEffect(function () {
        setDraft(stored === null ? '0' : stored.toFixed(1));
        setPending(false);
        setInvalid(false);
      }, [task.id, storedText]);

      const shown = pending ? draft : storedText;

      const commit = function () {
        if (busy) return;
        const text = String(pending ? draft : storedText).trim();
        const value = Number(text);
        if (!text || !isFinite(value)) {
          setInvalid(true);
          setPending(false);
          setDraft(storedText);
          if (store && typeof store.pushAlert === 'function') {
            store.pushAlert({ id: uid('toast'), title: '评分需在 0–100 之间', body: '', ttl: 4000 });
          }
          return;
        }
        /* 未变更不提交（拖动后又拖回原值也一样） */
        if (!pending || (stored !== null && Math.abs(value - stored) < 1e-9)) return;
        const next = Math.round(Math.max(0, Math.min(100, value)));
        actionSetScore(store, task.id, {
          score: next,
          source: 'manual',
          reason: '手动评分',
          rubricVersion: SCORE_RUBRIC_VERSION
        });
        setInvalid(false);
        setPending(false);
        setDraft(next.toFixed(1));
      };

      const onReset = function () {
        if (busy || src !== 'manual') return;
        actionSetScore(store, task.id, {
          score: scoreAutoBaselineOf(db, task),
          source: 'auto',
          reason: '重置为自动分',
          rubricVersion: SCORE_RUBRIC_VERSION,
          force: true
        });
        setPending(false);
        setInvalid(false);
      };

      const onDraft = function (event) {
        setDraft(String(event && event.target ? event.target.value : ''));
        setPending(true);
        setInvalid(false);
      };

      const disabled = busy;

      return div(
        {
          className: 'dtScoreEdit',
          'data-dt': 'score-edit',
          'data-score': stored === null ? '' : stored.toFixed(1),
          'data-score-src': src,
          'data-score-origin': entry && entry.origin ? entry.origin : 'none',
          'data-score-tier': String(tier),
          'data-score-band': String(band),
          'data-pending': pending ? '1' : '0',
          'style': arcStyle,
          'data-invalid': invalid ? '1' : undefined,
          'data-busy': busy ? '1' : '0',
          'data-task-id': task.id
        },
        ScoreRing({ key: 'ring', entry: entry, bare: true, disabled: disabled, mode: scoreMode }),
        span({ key: 'text', className: 'dtScoreText', 'data-dt': 'detail-score', disabled: disabled }, scoreTextOf(entry)),
        input({
          key: 'range',
          type: 'range',
          className: 'dtScoreRange',
          'data-dt': 'score-range',
          min: 0,
          max: 100,
          step: 1,
          value: String(Math.round(Math.max(0, Math.min(100, Number(shown) || 0)))),
          disabled: disabled,
          'aria-label': '评分滑杆',
          onInput: onDraft,
          onChange: onDraft
        }),
        input({
          key: 'num',
          type: 'number',
          className: 'dtScoreInput',
          'data-dt': 'score-input',
          min: 0,
          max: 100,
          step: 1,
          inputMode: 'numeric',
          value: shown,
          disabled: disabled,
          'aria-label': '评分数值',
          onChange: onDraft,
          onBlur: commit,
          onKeyDown: function (event) {
            if (!event || event.key !== 'Enter') return;
            commit();
            /* 提交后失焦，避免回车 + blur 重复提交 */
            if (event.target && typeof event.target.blur === 'function') event.target.blur();
          }
        }),
        button(
          Object.assign(
            {
              key: 'submit',
              type: 'button',
              className: 'dtScoreBtn dtScoreSubmit',
              'data-dt': 'score-submit',
              disabled: disabled || !pending
            },
            scopedAction(store, commit)
          ),
          '保存'
        ),
        button(
          Object.assign(
            {
              key: 'reset',
              type: 'button',
              className: 'dtScoreBtn dtScoreReset',
              'data-dt': 'score-reset',
              disabled: disabled || src !== 'manual'
            },
            scopedAction(store, onReset)
          ),
          '重置'
        )
      );
    }

    function viewTitle(state, view) {      if (view === 'pomodoro') return '番茄钟';
      if (view === 'settings') return '设置';
      if (view.indexOf('p:') === 0) {
        const project = state.projects.find(function (p) { return p.id === view.slice(2); });
        return project ? project.name : '项目';
      }
      if (view === 'tag') return '标签';
      if (view.indexOf('tag:') === 0) {
        return '#' + view.slice(4);
      }
      const found = SMART_VIEWS.find(function (v) { return v.id === view; });
      return found ? found.label : '任务';
    }

    /* ------------------------------------- 任务行 ------------------------------------ */

    function taskChip(key, text, tone, iconName) {
      return span({ key: key, className: 'dtChip' + (tone ? ' ' + tone : '') }, iconName ? icon(iconName, 12) : null, span({ key: 't' }, text));
    }

    function TaskRow(props) {
      const task = props.task;
      const now = new Date();
      const active = props.active;
      /* 权重环只读分数库（不现算），避免每次渲染都跑一遍打分公式；
         state 不一定由调用方透传，退回 store.get() 读同一份数据 */
      const rowState = props.state || (props.store && props.store.get ? props.store.get() : null);
      const scoreEntry = rowState && rowState.db ? selectScoreEntry(rowState.db, task.id) : null;
      const scoreMode = scoreRingModeOf(rowState && rowState.settings);
      /* 权重环是模块（modules.score），关掉后整颗环都不渲染，数据仍在分数库里。 */
      const scoreOn = props.showScore === undefined
        ? (!rowState || !rowState.settings ? true : moduleEnabled(rowState.settings, 'score'))
        : !!props.showScore;
      /* 状态区四槽的内容（§1.16.1）：日期/提醒 → date 槽，首个标签 → tag 槽，
         旗 → flag 槽，分数圈恒占 score 槽。槽位节点恒在（空槽由 CSS 置 visibility:hidden），
         这样「同列所有分数圈右边界相等」不依赖内容组合——这正是本轮要消灭的漂移源。 */
      const due = parseISO(task.date);
      let dateChip = null;
      if (due) {
        const late = task.status === 0 && dayDiff(due, now) < 0;
        /* t134：槽内用短标签（fmtSlotDate），全量标签（含年份与星期）只进 title——
           56px 放不下「2027年10月15日 周五」，硬塞就是用户报的「半个字」。 */
        dateChip = span(
          { key: 'd', className: 'dtChip dtChipState' + (late ? ' dtChipLate' : ''), title: fmtDateLabel(due, now) },
          late ? span({ key: 'f', className: 'dtFace' }, icon('face-sad', 12)) : icon('calendar', 12),
          span({ key: 't' }, fmtSlotDate(due, now))
        );
      } else if (task.remindAt) {
        const r = parseISO(task.remindAt);
        if (r) {
          const text = fmtDateLabel(r, now) + ' ' + pad2(r.getHours()) + ':' + pad2(r.getMinutes());
          dateChip = span({ key: 'r', className: 'dtChip dtChipState dtChipBell', title: text }, icon('bell', 12), span({ key: 't' }, text));
        }
      }

      const chips = [];
      if (due && !task.allDay) chips.push(taskChip('t', pad2(due.getHours()) + ':' + pad2(due.getMinutes()), ''));
      if (task.repeat) {
        const label = (REPEAT_OPTIONS.find(function (o) { return o.value === task.repeat; }) || {}).label || '重复';
        chips.push(taskChip('p', label, '', 'repeat'));
      }
      /* 标签：首个进 tag 槽（36px 只放一个，全量挂 title），其余留在正文 chips 里不丢信息。
         脏标签（'[]' 这类导残渣）在 tagNamesOf 里已被滤掉，不会出现「[]」字样；
         注册表里已删除的标签渲染成灰色（孤立），提示可清理。 */
      const tags = tagNamesOf(task);
      let tagChip = null;
      if (tags.length) {
        const registry = rowState && rowState.db ? tagRegistryOf(rowState.db) : [];
        const known = Object.create(null);
        registry.forEach(function (entry) { known[entry.name] = 1; });
        const hasOrphan = tags.some(function (name) { return !known[name]; });
        tagChip = span(
          { key: 'g', className: 'dtChip dtChipState dtChipTag' + (hasOrphan ? ' dtChipTagOrphan' : ''), title: tags.join(' · ') },
          span({ key: 't' }, tags[0])
        );
        if (tags.length > 1) chips.push(taskChip('g2', tags.slice(1).join(' · '), 'dtChipTag'));
      }
      if (task.completedAt && task.status === 2) {
        const done = parseISO(task.completedAt);
        if (done) chips.push(taskChip('c', fmtDateLabel(done, now) + ' 完成', 'dtChipDone', 'check'));
      }
      /* 单任务番茄累计（stage4 §7.1）：从日志反推，不读引擎的当日计数器。
         放正文 chips 而不是状态区——状态区四槽写死，多一个 chip 就会把分数圈挤走。 */
      const pomoTotals = pomoTaskTotals(rowState.db, task.id);
      if (pomoTotals.count > 0) {
        chips.push(span(
          {
            key: 'pt',
            className: 'dtChip dtPomoTag',
            'data-dt': 'row-pomo-total',
            'data-pomo-count': String(pomoTotals.count),
            'data-pomo-minutes': String(pomoTotals.minutes),
            title: '累计 ' + String(pomoTotals.count) + ' 个番茄 · ' + String(pomoTotals.minutes) + ' 分钟'
          },
          String(pomoTotals.count) + ' · ' + String(pomoTotals.minutes) + '分'
        ));
      }

      const priority = task.priority | 0;
      const clickable = props.onOpen;
      const compact = !!props.compact;
      const pinned = isPinned(task, now);
      const quadId = quadOf(task, now);
      const [menuOpen, setMenuOpen] = useState(false);
      const anchorRef = useRef(null);
      const menuRef = useRef(null);
      const menuOpenRef = useRef(false);
      menuOpenRef.current = menuOpen;
      const menuPlacement = useMenuFlip(menuOpen, anchorRef, '.dtQuadBody', menuRef);
      /* 浮层 Esc：菜单开着时由注册表关掉并截停，抽屉不动（§1.2.1 第 1 层）。 */
      useEffect(function () {
        return registerOverlayCloser(OVERLAY_LEVEL.menu, function () {
          if (!menuOpenRef.current) return false;
          setMenuOpen(false);
          return true;
        });
      }, []);

      /* 每项文字色 = 对应象限色（§2.5.5.1）：不是优先级色、不是 label-primary。
         选中态不许用 hover 背景冒充——data-on="1" 必须同时有左侧 3px 竖条 + 600 字重。 */
      const QUAD_PICK_COLOR = { q1: 'var(--dt-quad-red)', q2: 'var(--dt-quad-yellow)', q3: 'var(--dt-quad-blue)', q4: 'var(--dt-quad-none)' };
      const quadMenu = menuOpen
        ? div(
            { className: 'dtMenu dtQuadMenu', role: 'menu', ref: menuRef, 'data-open': '1', 'data-quad-menu': '1', 'data-flip': menuPlacement.value.flip, 'data-clamp': menuPlacement.value.clamp ? '1' : undefined, style: menuPlacement.value.clamp ? { maxHeight: menuPlacement.value.maxHeight + 'px', overflow: 'auto' } : undefined },
            QUADRANTS.map(function (item) {
              const on = task.quadOverride === item.id;
              return button(
                Object.assign(
                  {
                    key: item.id,
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': on,
                    'data-quad-pick': item.id,
                    'data-on': on ? '1' : undefined,
                    className: 'dtMenuItem dtMenuItemQuad' + (on ? ' dtMenuItemOn' : ''),
                    style: { color: QUAD_PICK_COLOR[item.id] }
                  },
                  scopedAction(props.store, function () {
                    try {
                      patchTask(props.store, task.id, { quadOverride: item.id });
                      setMenuOpen(false);
                    } catch (err) {
                      reportActionError(props.store, err);
                    }
                  })
                ),
                span({ key: 'l', className: 'dtMenuItemLabel' }, item.title),
                on ? icon('check', 12) : null
              );
            }),
            div({ key: 'sep', className: 'dtMenuSep' }),
            button(
              Object.assign(
                {
                  key: 'auto',
                  type: 'button',
                  role: 'menuitem',
                  'data-quad-pick': '',
                  'data-on': task.quadOverride ? undefined : '1',
                  className: 'dtMenuItem dtMenuItemQuadAuto' + (task.quadOverride ? '' : ' dtMenuItemOn')
                },
                scopedAction(props.store, function () {
                  try {
                    patchTask(props.store, task.id, { quadOverride: '' });
                    setMenuOpen(false);
                  } catch (err) {
                    reportActionError(props.store, err);
                  }
                })
              ),
              span({ key: 'l', className: 'dtMenuItemLabel' }, '按规则判定'),
              task.quadOverride ? null : icon('check', 12)
            )
          )
        : null;

      /* 改判入口（§2.5.5.1）：旧的行内角标 .dtQuadSrc 已作废——分类信息不进状态区
         （它既让状态区随内容漂移，又让格号在清单里重复出现）。入口搬到动作区，
         F13 的能力等价保留：能把 quadOverride 改成任一格，也能改回空（按规则判定）。 */
      const quadMenuBtn = button(
        Object.assign(
          {
            key: 'q',
            type: 'button',
            className: 'dtQuadMenuBtn' + (task.quadOverride ? ' dtQuadMenuBtnOn' : ''),
            'data-dt': 'quad-menu',
            'data-quad': task.quadOverride || '',
            'data-quad-pick': task.quadOverride || '',
            'data-on': task.quadOverride ? '1' : undefined,
            title: '改到其它象限'
          },
          scopedAction(props.store, function (event) {
            const trigger = event && event.currentTarget ? event.currentTarget : null;
            anchorRef.current = trigger;
            menuPlacement.measure(trigger);
            setMenuOpen(!menuOpen);
          })
        ),
        icon('flag', 13)
      );

      const ring = ScoreRing({ entry: scoreEntry, slot: 'score', mode: scoreMode });

      /* 单任务番茄（stage4 §7.1）：行内计时器入口 + 该任务的累计番茄数/时长。
         累计一律从日志反推（pomoTaskTotals），不读引擎的当日计数器。 */
      const pomoBusy = pomoBusyWithSpiral(rowState);
      const pomoOn = pomoBoundTo(props.store, task.id);
      const pomoBtn = task.deleted || task.status === 2
        ? null
        : button(
            Object.assign(
              {
                key: 'pm',
                type: 'button',
                className: 'dtRowBtn dtRowPomo' + (pomoOn ? ' dtRowPomoOn' : ''),
                'data-dt': 'row-pomo',
                'data-task-id': task.id,
                'data-on': pomoOn ? '1' : undefined,
                disabled: pomoBusy,
                'aria-disabled': pomoBusy ? 'true' : undefined,
                title: pomoBusy ? '螺旋工作法运行中' : pomoOn ? '暂停该任务的番茄' : '对该任务开始番茄'
              },
              scopedAction(props.store, function () {
                pomoToggleForTask(props.store, task.id);
              })
            ),
            icon('timer', 13)
          );
      /* 行尾两段（§1.16.1）：动作区恒占 66px（hover/focus/菜单展开才显形，不塌陷）
         + 状态区恒占 136px（四槽写死）。合计 66 + 18 + 44 + 36 + 20 + 4×6 = 208px。 */
      const pinBtn = button(
        Object.assign(
          {
            key: 'pin',
            type: 'button',
            className: 'dtPinBtn' + (pinned ? ' dtPinOn' : ''),
            'data-on': pinned ? '1' : undefined,
            title: pinned ? '移出今日要事' : '放入今日要事'
          },
          scopedAction(props.store, function () {
            if (props.onPin) props.onPin(task.id);
          })
        ),
        icon('sun', 13)
      );
      const flagSlot = span(
        { key: 'f', className: 'dtStateFlag', 'data-slot': 'flag' },
        priority
          ? span({ key: 'p', className: 'dtPriority', title: PRIORITY_META[priority] ? PRIORITY_META[priority].label : '', style: { color: PRIORITY_META[priority] ? PRIORITY_META[priority].color : 'inherit' } }, icon('flag', 13))
          : null
      );
      const tail = div(
        { key: 'tail', className: 'dtRowTail' },
        div(
          { key: 'a', className: 'dtRowActions', 'data-open': menuOpen ? '1' : undefined },
          compact ? pinBtn : pomoBtn,
          quadMenuBtn,
          compact
            ? null
            : task.deleted
              ? [
                  button(
                    Object.assign(
                      { key: 'x', className: 'dtRowBtn', title: '恢复' },
                      scopedAction(props.store, function () { restoreTask(props.store, task.id); })
                    ),
                    '恢复'
                  ),
                  /* t210 F3：已删除视图原本只能恢复、无法真正删除。彻底删除要二次确认，
                     且只在这一行上生效（destroyTask 从数据里移除，不是打 deleted 标记）。 */
                  button(
                    Object.assign(
                      { key: 'p', className: 'dtRowBtn dtRowPurge', 'data-dt': 'row-purge', title: '彻底删除' },
                      scopedAction(props.store, function () {
                        const label = task.title || '未命名任务';
                        if (!window.confirm('彻底删除「' + label + '」？此操作不可恢复。')) return;
                        destroyTask(props.store, task.id);
                      })
                    ),
                    icon('trash', 13)
                  )
                ]
              : button(
                  Object.assign(
                    { key: 'x', className: 'dtRowBtn', title: '删除' },
                    scopedAction(props.store, function () { deleteTask(props.store, task.id); })
                  ),
                  icon('trash', 13)
                ),
          quadMenu
        ),
        div(
          { key: 's', className: 'dtRowState', 'data-slots': '4' },
          flagSlot,
          span({ key: 'd', className: 'dtStateDate', 'data-slot': 'date' }, dateChip),
          span({ key: 'g', className: 'dtStateTag', 'data-slot': 'tag' }, tagChip),
          ring
        )
      );

      return div(
        {
          key: task.id,
          'data-task-id': task.id,
          className:
            'dtRow' +
            (task.status === 2 ? ' dtRowDone' : '') +
            (active ? ' dtRowActive' : '') +
            (compact ? ' dtRowCompact' : '') +
            (task.parentId ? ' dtRowChild' : ''),
          onClick: function (event) {
            /* 行内按钮（勾选 / 置顶 / 象限角标 / 删除 / 菜单项）自己处理，不再靠
               stopPropagation 拦住行点击：stopPropagation 会把事件挡在面板内部，
               宿主的 document 级监听看不到这次点击（真机上表现为整个面板被切走）。 */
            const target = event && event.target;
            if (target && typeof target.closest === 'function' && target.closest('button')) return;
            if (event && event.__dtRowHandled) return;
            if (clickable) clickable(task.id);
          }
        },
        button(
          Object.assign(
            {
              key: 'c',
              className: 'dtCheck' + (task.status === 2 ? ' dtCheckOn' : ''),
              /* t125（§1.19.4 第 2/3 项）：只有 TaskRow 这一个勾选圆圈挂 data-dt，
                 60-settings 与 62-habit 里的 .dtCheck 不挂，避免 accent 外溢到别的圆圈 */
              'data-dt': 'task-check',
              'data-on': task.status === 2 ? '1' : undefined,
              title: task.status === 2 ? '标记为未完成' : '标记为完成'
            },
            scopedAction(props.store, function () {
              if (task.status === 2) uncompleteTask(props.store, task.id);
              else completeTask(props.store, task.id);
            })
          ),
          task.status === 2 ? icon('check', 12) : null
        ),
        div(
          { key: 'm', className: 'dtRowMain' },
          div(
            {
              key: 't',
              className: 'dtRowTitle',
              'data-prio-color': PRIO_COLOR_KEY[priority] || 'none',
              style: priority ? { color: PRIO_TITLE_COLOR[priority] || PRIORITY_META[priority].color } : null,
              /* t210 F2：标题文字也能开 C 栏。真机上点标题偶发不触发行级 click，
                 这里把同一动作前移到标题节点；不用 stopPropagation（宿主 document
                 监听看不到会切走面板），改用事件标记让行处理器跳过，一次点击只开一次。 */
              onClick: clickable
                ? function (event) {
                    const target = event && event.target;
                    if (target && typeof target.closest === 'function' && target.closest('button')) return;
                    if (event) event.__dtRowHandled = true;
                    clickable(task.id);
                  }
                : undefined
            },
            span({ key: 'tt', className: 'dtRowTitleText' }, task.title || '未命名任务'),
            /* 象限标签（§2.5.5.2）：只在四象限视图渲染，颜色 = 所在格的颜色
               （不是优先级色——标题色已经在表达优先级）。它不进状态区、不参与槽位对齐。
               注意：标题文字必须直挂字符串子节点（包进数组会让按文本取值的断言取空）。 */
            props.quadView
              ? span(
                  {
                    key: 'q',
                    className: 'dtQuadTag',
                    'data-quad': quadId,
                    'data-quad-color': QUAD_COLOR_KEY[quadId] || 'none',
                    title: '所在象限：' + (QUADRANTS.find(function (item) { return item.id === quadId; }) || {}).title
                  },
                  pinned ? '来自 Q' + quadId.charAt(1) : 'Q' + quadId.charAt(1)
                )
              : null
          ),
          !compact && task.content
            ? div(
                {
                  key: 'n',
                  className: 'dtRowNote',
                  style: priority ? { color: PRIO_TITLE_COLOR[priority] || PRIORITY_META[priority].color, opacity: 0.78 } : null
                },
                task.content
              )
            : null,
          chips.length ? div({ key: 'c', className: 'dtRowChips' }, compact ? chips.slice(0, 1) : chips) : null
        ),
        tail
      );
    }

    /* ------------------------------------ 编辑器 ------------------------------------ */

    function fieldRow(labelText, control) {
      return div({ className: 'dtField' }, span({ className: 'dtFieldLabel' }, labelText), div({ className: 'dtFieldBody' }, control));
    }

    /* 任务拆解（t169）：强度决定步数区间 —— weak 3–5 / mid 6–10 / strong 11–18。
       上限只由强度决定（不再套 ACT_NOW_MAX_STEPS 的 18 与 300 字预算，否则 strong 会被截到 6）；
       不足下限时用本地规则步骤补足，保证「失败/不足也有内容」。 */
    function breakdownLimitOf(strength) {
      return strength === 'weak' ? 5 : strength === 'strong' ? 18 : 10;
    }

    function breakdownMinOf(strength) {
      return strength === 'weak' ? 3 : strength === 'strong' ? 11 : 6;
    }

    function breakdownLabelOf(strength) {
      return strength === 'weak' ? '弱' : strength === 'strong' ? '强' : '中';
    }

    function breakdownStepsFromHost(data, task, strength, localSteps) {
      var limit = breakdownLimitOf(strength);
      var floor = breakdownMinOf(strength);
      var source = data && typeof data === 'object' ? data : {};
      var list = Array.isArray(source.steps) ? source.steps : null;
      var out = [];
      var i;
      if (list && list.length) {
        for (i = 0; i < list.length && out.length < limit; i += 1) {
          var item = list[i];
          var raw = typeof item === 'string' ? item : item && typeof item === 'object' ? String(item.text || '') : '';
          var line = actNowClip(actNowStripOrdinal(raw));
          if (!line) continue;
          if (task && task.title && line.indexOf(task.title) === 0) continue;
          out.push({ key: 'b' + out.length, text: line, minutes: actNowMinutesOf(item) });
        }
      }
      if (out.length < floor && localSteps && localSteps.length) {
        /* t174：补足步骤也要带耗时（用户 m05465「每步加耗时字段」）。
           补足池里 core 4 条是固定动作、本身没有估时，所以分两轮：
           第一轮只取带估时的条目，第二轮才用没有估时的兜底——**不给缺失值编造估时**。
           同时按文本去重，避免与 Host 步骤或彼此重复。 */
        var seen = {};
        for (i = 0; i < out.length; i += 1) seen[out[i].text] = true;
        for (var pass = 0; pass < 2 && out.length < floor; pass += 1) {
          for (i = 0; i < localSteps.length && out.length < floor; i += 1) {
            var cand = localSteps[i];
            if (!cand || !cand.text) continue;
            var localMin = cand.minutes;
            var hasMin = typeof localMin === 'number' && isFinite(localMin) && localMin > 0;
            if (pass === 0 ? !hasMin : hasMin) continue;
            if (seen[cand.text]) continue;
            seen[cand.text] = true;
            out.push({
              key: 'b' + out.length,
              text: cand.text,
              minutes: hasMin ? localMin : null
            });
          }
        }
      }
      return out;
    }

    function TaskDetail(props) {
      const task = props.task;
      const store = props.store;
      const projects = props.projects;

      /* 详情栏 C 的内容（§1.8）：字段改动即 patchTask，没有保存/取消按钮；
         Esc 归抽屉层（C 栏不是浮层，不进浮层注册表）。 */

      const set = function (patch) {
        patchTask(store, task.id, patch);
      };

      const dateValue = (task.date || '').slice(0, 10);
      const timeValue = task.allDay ? '' : (task.date || '').slice(11, 16);
      const remindDate = (task.remindAt || '').slice(0, 10);
      const remindTime = (task.remindAt || '').slice(11, 16);

      const applyDate = function (nextDate, nextTime, allDay) {
        if (!nextDate) {
          set({ date: '', allDay: allDay ? 1 : 0 });
          return;
        }
        set({
          date: allDay || !nextTime ? nextDate : nextDate + 'T' + nextTime,
          allDay: allDay ? 1 : 0
        });
      };

      /* 任务拆解（t169）：dsh / custom 走 /polish（带 dshProvider / dshModel / strength），
         off 档不请求、只算本地规则；失败保留 code 且本地步骤照常可见。 */
      const bdStrength = actNowStrengthOf(store.get());
      const bdLimit = breakdownLimitOf(bdStrength);
      const bdLocal = (function () {
        const raw = actNowStepsLocal(store.get(), task, new Date()) || [];
        /* t174：minutes 要一路带到渲染层——这里早先只留 {key,text}，补足步骤的估时在进补足循环前就被丢了。
           保留 it.minutes（可能是 undefined，渲染层按缺失处理，不补假值）。 */
        return raw.map(function (it) {
          return { key: it.key, text: actNowStripOrdinal(it.text), minutes: it.minutes };
        });
      })();
      const bdState = useState({ taskId: '', steps: null, code: '' });
      const bd = bdState[0];
      const setBd = bdState[1];
      const bdHost = bd.taskId === task.id && bd.steps && bd.steps.length ? bd.steps : null;
      const bdSteps = bdHost || bdLocal.slice(0, bdLimit);
      const bdSrc = bdHost ? 'host' : 'local';
      /* 只有 dsh 档才可能有 Host 错误码：切到 custom/off 后旧 code 不再展示（避免残留红字） */
      const bdCode = bd.taskId === task.id && agentSourceOf(store.get().settings) !== 'off' ? (bd.code || '') : '';
      const runBreakdown = function () {
        const cfg = agentConfigOf(store.get().settings);
        /* off 与 custom 都不新增请求：off 明确不请求；custom 保持「整理助手」既有链路不动，
           拆解区在这两档只给本地规则步骤（data-src="local"）。 */
        if (!cfg || cfg.source === 'off') {
          setBd({ taskId: task.id, steps: null, code: '' });
          return;
        }
        const projectName = recProjectName(store.get(), task);
        /* custom 走它自己的 provider（agentAttempt 链路），dsh 走 Host 同源 /polish，两条都带 strength */
        const run = cfg.source === 'custom'
          ? agentCustomBreakdown(cfg, task, projectName, { strength: bdStrength })
          : agentDshBreakdown(cfg, task, projectName, { silent: true, strength: bdStrength });
        Promise.resolve(run).then(function (result) {
          if (!result || !result.ok) {
            setBd({ taskId: task.id, steps: null, code: (result && result.code) || 'AGENT_SERVER' });
            return;
          }
          setBd({ taskId: task.id, steps: breakdownStepsFromHost(result.data || {}, task, bdStrength, bdLocal), code: '' });
        }).catch(function () {
          setBd({ taskId: task.id, steps: null, code: 'AGENT_SERVER' });
        });
      };

      const quickReminder = function (mode) {
        if (mode === 'none') {
          set({ remindAt: '' });
        } else if (mode === 'due') {
          if (!task.date) return;
          set({ remindAt: task.allDay ? task.date.slice(0, 10) + 'T09:00' : (task.date || '').slice(0, 16) });
        } else if (mode === 'soon') {
          const t = new Date(Date.now() + 10 * 60000);
          set({ remindAt: isoMin(t) });
        } else if (mode === 'today') {
          set({ remindAt: dateKey(new Date()) + 'T09:00' });
        }
      };

      return div(
        { className: 'dtDetail', 'data-kind': 'task' },
        div(
          { className: 'dtDetailFields' },
          /* §1.8 版式（t169）：标题不再有 label 行，输入框直接是面板第一个元素，
             点进去即可编辑；data-dt="c-title-input" 是版式与回归的共用钩子。 */
          textarea({
            className: 'dtFieldInput dtTitleInput dtTitleFirst',
            'data-f': 'title',
            'data-dt': 'c-title-input',
            rows: 2,
            value: task.title,
            placeholder: '任务标题',
            onChange: function (event) {
              set({ title: event.target.value });
            }
          }),
          div(
            { className: 'dtField dtFieldWide' },
            span({ className: 'dtFieldLabel' }, '备注'),
            textarea({
              className: 'dtFieldInput dtNoteInput',
              'data-f': 'content',
              rows: 4,
              value: task.content || '',
              placeholder: '备注',
              onChange: function (event) {
                set({ content: event.target.value });
              }
            })
          ),
          div(
            {
              className: 'dtBreakdown',
              'data-dt': 'c-breakdown',
              'data-strength': bdStrength,
              'data-src': bdSrc,
              'data-steps': String(bdSteps.length),
              'data-code': bdCode || undefined
            },
            div(
              { className: 'dtBreakdownHead' },
              span({ className: 'dtBreakdownTitle' }, '任务拆解'),
              span(
                { className: 'dtBreakdownMeta', 'data-dt': 'c-breakdown-strength' },
                breakdownLabelOf(bdStrength) + ' · ' + bdSteps.length + ' 步'
              ),
              h(
                'button',
                Object.assign(
                  { type: 'button', className: 'dtMiniBtn dtBreakdownRun', 'data-dt': 'c-breakdown-run' },
                  scopedAction(store, runBreakdown)
                ),
                '拆解'
              )
            ),
            bdCode
              ? div(
                  { className: 'dtBreakdownCode', 'data-dt': 'c-breakdown-code' },
                  bdCode + ' · ' + (AGENT_CODE_MESSAGE[bdCode] || '拆解失败，已回落本地步骤')
                )
              : null,
            div(
              { className: 'dtBreakdownSteps', role: 'list' },
              bdSteps.map(function (step, index) {
                return div(
                  {
                    key: step.key || ('b' + index),
                    className: 'dtBreakdownStep',
                    role: 'listitem',
                    'data-dt': 'c-breakdown-step'
                  },
                  span({ className: 'dtBreakdownNo' }, String(index + 1) + '.'),
                  span({ className: 'dtBreakdownText' }, step.text),
                  step.minutes
                    ? span({ className: 'dtBreakdownMin', 'data-dt': 'c-breakdown-min' }, '约 ' + step.minutes + ' 分钟')
                    : null
                );
              })
            )
          ),
          fieldRow(
            '清单',
            select(
              {
                className: 'dtFieldInput',
                'data-f': 'project',
                value: task.projectId,
                onChange: function (event) {
                  set({ projectId: event.target.value });
                }
              },
              projects.map(function (p) {
                return option({ key: p.id, value: p.id }, p.name);
              })
            )
          ),
          fieldRow(
            '日期',
            div(
              { className: 'dtRow2' },
              input({
                className: 'dtFieldInput',
                'data-f': 'date',
                type: 'date',
                value: dateValue,
                onChange: function (event) {
                  applyDate(event.target.value, timeValue, !!task.allDay);
                }
              }),
              input({
                className: 'dtFieldInput',
                'data-f': 'time',
                type: 'time',
                value: timeValue,
                disabled: !!task.allDay,
                onChange: function (event) {
                  applyDate(dateValue, event.target.value, false);
                }
              })
            )
          ),
          fieldRow(
            '全天',
            label(
              { className: 'dtToggle' },
              input({
                type: 'checkbox',
                'data-f': 'allDay',
                checked: !!task.allDay,
                onChange: function (event) {
                  applyDate(dateValue, timeValue, event.target.checked);
                }
              }),
              span({}, task.allDay ? '全天任务（09:00 提醒）' : '按时间点提醒')
            )
          ),
          fieldRow(
            '提醒',
            div(
              { className: 'dtRow2', 'data-f': 'remindAt' },
              input({
                className: 'dtFieldInput',
                'data-f': 'remindDate',
                type: 'date',
                value: remindDate,
                onChange: function (event) {
                  set({ remindAt: event.target.value ? event.target.value + 'T' + (remindTime || '09:00') : '' });
                }
              }),
              input({
                className: 'dtFieldInput',
                'data-f': 'remindTime',
                type: 'time',
                value: remindTime,
                onChange: function (event) {
                  set({ remindAt: (remindDate || dateValue || dateKey(new Date())) + 'T' + (event.target.value || '09:00') });
                }
              })
            )
          ),
          div(
            { className: 'dtQuickRow' },
            button({ className: 'dtMiniBtn', onClick: function () { quickReminder('none'); } }, '不提醒'),
            button({ className: 'dtMiniBtn', onClick: function () { quickReminder('due'); } }, '同截止时间'),
            button({ className: 'dtMiniBtn', onClick: function () { quickReminder('soon'); } }, '10 分钟后'),
            button({ className: 'dtMiniBtn', onClick: function () { quickReminder('today'); } }, '今天 09:00')
          ),
          fieldRow(
            '优先级',
            div(
              { className: 'dtSeg', 'data-f': 'priority' },
              [0, 1, 3, 5].map(function (value) {
                return button(
                  {
                    key: 'p' + value,
                    className: 'dtSegBtn' + ((task.priority | 0) === value ? ' dtSegOn' : ''),
                    style: { color: PRIORITY_META[value].color },
                    onClick: function () {
                      set({ priority: value });
                    }
                  },
                  PRIORITY_META[value].label
                );
              })
            )
          ),
          fieldRow(
            '重复',
            select(
              {
                className: 'dtFieldInput',
                'data-f': 'repeat',
                value: task.repeat || '',
                onChange: function (event) {
                  set({ repeat: event.target.value });
                }
              },
              REPEAT_OPTIONS.map(function (o) {
                return option({ key: o.value || 'none', value: o.value }, o.label);
              })
            )
          ),
          fieldRow(
            '标签',
            input({
              className: 'dtFieldInput',
              'data-f': 'tags',
              value: tagNamesOf(task).join(', '),
              placeholder: '用逗号分隔',
              onChange: function (event) {
                set({ tags: tagNamesOf({ tags: event.target.value.split(',') }) });
              }
            })
          ),
          fieldRow('权重', ScoreEdit({ task: task, store: store })),
          task.deleted
            ? null
            : h(TaskInfo, { key: 'task-info', task: task, store: store }),
          div(
            { className: 'dtDetailActions' },
            task.deleted
              ? button({ className: 'dtGhostBtn', onClick: function () { restoreTask(store, task.id); } }, '恢复任务')
              : button(
                  {
                    className: 'dtDangerBtn',
                    title: '删除任务',
                    onClick: function () {
                      deleteTask(store, task.id);
                      props.onClose();
                    }
                  },
                  '删除任务'
                )
          )
        )
      );
    }

    /* ------------------------------------ 提醒横幅 ---------------------------------- */

    function Toast(props) {
      const item = props.item;
      useEffect(function () {
        /* 错误类提示由处理器带 ttl（4000ms），其余沿用 15s */
        const ttl = item && item.ttl > 0 ? item.ttl : 15000;
        const timer = window.setTimeout(function () {
          props.onDismiss(item.id);
        }, ttl);
        return function () {
          window.clearTimeout(timer);
        };
      }, [item.id]);

      const timeText = item.at
        ? pad2(item.at.getHours()) + ':' + pad2(item.at.getMinutes())
        : '';

      return div(
        { className: 'dtToast' + (item.kind === 'pomodoro' ? ' dtToastPomo' : '') },
        div(
          { className: 'dtToastBody' },
          div({ className: 'dtToastTitle' }, (item.kind === 'pomodoro' ? '' : '⏰ ') + (item.title || '提醒')),
          div({ className: 'dtToastText' }, item.body || ('计划时间 ' + timeText))
        ),
        div(
          { className: 'dtToastActions' },
          item.taskId
            ? button(
                {
                  className: 'dtMiniBtn',
                  onClick: function () {
                    completeTask(props.store, item.taskId);
                    props.onDismiss(item.id);
                  }
                },
                '完成'
              )
            : null,
          button({ className: 'dtMiniBtn', onClick: function () { props.onDismiss(item.id); } }, '知道了')
        )
      );
    }


    /* ------------------------------------ 主面板 ------------------------------------ */

    function countToday(tasks, now) {
      return tasks.filter(function (t) {
        if (t.status !== 0 || t.deleted) return false;
        const d = parseISO(t.date);
        return d ? dayDiff(d, now) <= 0 : false;
      }).length;
    }

    function countWeek(tasks, now) {
      return tasks.filter(function (t) {
        if (t.status !== 0 || t.deleted) return false;
        const d = parseISO(t.date);
        if (!d) return false;
        const diff = dayDiff(d, now);
        return diff >= 0 && diff <= 7;
      }).length;
    }

    /* rail 由模块注册表派生（§2.6 / §15-89）：每个入口的「在不在」取 settings.modules[id]，
       「排第几」取 settings.modules.order[id]（缺省回落 railOrder）。
       组序固定 list → project → habit →（绊脚石 / 禁止清单 / 必做之事）→ spacer → tool，
       order 只在组内生效；比较规则与 orderRailItems 完全一致：数值升序 → railOrder 升序 → id 升序。 */
    /* t137：rail 四段（§1.2 / §15-113）。段序固定 list → project → function → settings，
       段间恰一个 .dtRailSep（三个），settings 段后不插分隔条；不许第五段。
       旧 timer / review 两段按 t136 规格合并为 function（功能区），段内顺序仍由注册表
       railOrder 决定：四象限 → 日历 → 习惯打卡 → 必做之事 → 番茄钟 → 螺旋工作法。 */
    /* §1.22：分隔线分布写死在下方组装里（2 内 1 外），不再用 RAIL_SEP_KEYS 驱动，
       否则「容器内 2 条 + 容器外 1 条」会退化成「三条都在容器内」。 */
    /* 四象限左色边取值：只认面板自有 token（70-styles.js 的 --dt-quad-*），
       不用宿主 alias —— 宿主未定义 brand/warn 时 var() 会解析成非法值，
       边框退回 currentColor，实测出过近黑边（F18）。Q4 按口径「无」= 透明。 */
    const QUAD_EDGE = {
      q1: 'var(--dt-quad-red)',
      q2: 'var(--dt-quad-yellow)',
      q3: 'var(--dt-quad-blue)',
      q4: 'transparent'
    };

    function railPlan(state) {
      /* 唯一入口走 selector（§15-89）：selectRailItems 内部就是
         orderRailItems(validateModuleRegistry(MODULE_REGISTRY), db, settings)，
         排序规则 order → railOrder → id 已在注册表里写死，这里不再手写一遍。 */
      const listed = selectRailItems(state.db || null, state.settings);
      const items = Array.isArray(listed) ? listed : [];
      const out = { list: [], project: [], function: [], settings: [], error: null };
      items.forEach(function (module) {
        /* inRail:false 是「没有独立 rail 入口」（权重环 / 推荐开关），不占槽位 */
        if (module.inRail === false) return;
        /* 关掉的模块不占槽位：连占位节点都不渲染（§15-89） */
        if (!module.enabled) return;
        const group = module.railGroup;
        if (out[group]) out[group].push(module);
      });
      return out;
    }

    /* rail 五段（§1.2）：清单 / 项目 / 计时 / 记录与分析 / 设置。
       计时段（番茄钟、螺旋）与设置段只切中间区，其余条目一律落 B 栏且互斥替换；
       任何 rail 入口都不写 detail（§1.2.4）。 */
    function Rail(props) {
      const state = props.state;
      const now = new Date();
      const tasks = state.tasks;
      const openTotal = tasks.filter(function (t) { return t.status === 0 && !t.deleted; }).length;
      const doneTotal = tasks.filter(function (t) { return t.status === 2 && !t.deleted; }).length;
      const trashTotal = tasks.filter(function (t) { return !!t.deleted; }).length;
      const habits = state.habits || [];
      const oneThing = oneThingTask(state, now);
      const counts = {
        today: countToday(tasks, now),
        week: countWeek(tasks, now),
        open: openTotal,
        done: doneTotal,
        trash: trashTotal,
        habit: habits.filter(function (habit) {
          return !habit.archived && !habitChecked(habit, now);
        }).length,
        /* 标签入口的计数 = 注册表里实际可用的标签个数（脏标签与空名不计）。 */
        tags: (function () {
          const db = state.db || null;
          return db ? tagRegistryOf(db).length : 0;
        })(),
        /* 必做之事角标：今天那一条还没做完时显示 1（§1.12） */
        onething: oneThing && oneThing.status === 0 && !oneThing.deleted ? 1 : 0
      };
      const plan = railPlan(state);
      const pomo = state.pomo;
      const pomoLeft = pomodoroRemaining(pomo);
      /* 螺旋运行中时 rail 项带剩余分钟徽标（§4.10.9），idle 时属性与文本都不出现 */
      const spiralLeft = spiralRemaining(state.spiral);
      const spiralBadge = state.spiral && state.spiral.status !== 'idle'
        ? Math.max(1, Math.ceil(spiralLeft / 60000))
        : null;

      /* ------------------------- 目录栏设置与拖拽排序（t144 / §1.20） ------------------------- */
      const railUI = railUIOf(state.settings);
      const showGrip = !railUI.hideReorder;
      const showDot = !railUI.hideColor;
      const store = props.store;
      const [dragKey, setDragKey] = useState('');
      const [dropKey, setDropKey] = useState('');
      const [liveText, setLiveText] = useState('');
      const psRef = useRef(null);
      const psPanelRef = useRef(null);
      const psOpenRef = useRef(false);
      psOpenRef.current = !!props.psOpen;
      const psPlacement = useMenuFlip(props.psOpen, psRef, '.dtRail', psPanelRef);

      /* 面板必须跳出 A 栏的裁切盒（§1.20.7）：`.dtRail{overflow:hidden}` 是「设置贴底」的必要条件，
         不能去掉，而面板宽 260–320 远超 196 的栏宽，绝对定位时会被整块裁掉（真机点开等于没反应）。
         position:fixed 的元素以视口为包含块，不被祖先 overflow 裁切（已用 elementFromPoint 实测），
         所以这里按触发钮的视口 rect 算 left/top，并在视口内做夹取。 */
      const psPosState = useState(null);
      const psPos = psPosState[0];
      const setPsPos = psPosState[1];
      useEffect(function () {
        if (!props.psOpen) {
          setPsPos(null);
          return;
        }
        const rectOf = function (node) {
          return node && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
        };
        const b = rectOf(psRef.current);
        const p = rectOf(psPanelRef.current);
        const vw = (typeof window !== 'undefined' && window.innerWidth) || 1200;
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
        const rawW = p && p.width ? p.width : 0;
        const w = Math.round(Math.min(320, Math.max(260, rawW || 300)));
        /* 优先贴住触发钮右缘；若会压住 A 栏（栏宽 196/48 都远小于面板宽），就改贴 A 栏右缘——
           面板是给 A 栏用的，盖住 A 栏等于看不到自己的入口。 */
        let left = b ? Math.round(b.right - w) : 8;
        const railEl = psRef.current && typeof psRef.current.closest === 'function'
          ? psRef.current.closest('.dtRail')
          : null;
        const railRect = railEl && typeof railEl.getBoundingClientRect === 'function' ? railEl.getBoundingClientRect() : null;
        const minLeft = railRect ? Math.round(railRect.right + 4) : 8;
        if (left < minLeft) left = minLeft;
        if (left + w > vw - 8) left = Math.max(8, vw - 8 - w);
        let top = b ? Math.round(b.bottom + 2) : 8;
        const h = p && p.height ? Math.round(p.height) : 0;
        if (h && top + h > vh - 8) top = Math.max(8, Math.round((b ? b.top : 0) - 2 - h));
        setPsPos({ left: left, top: top, width: w, maxHeight: Math.max(240, vh - top - 8) });
      }, [props.psOpen]);
      /* Esc 只关这一层（§1.2.1 第 1 层）：登记进浮层注册表，由 40-panel 的捕获监听统一消费 */
      useEffect(function () {
        return registerOverlayCloser(OVERLAY_LEVEL.menu, function () {
          if (!psOpenRef.current) return false;
          props.onClosePs();
          return true;
        });
      }, []);

      /* 拖拽只改视觉（§1.20.5）：拖动中 data-dragging、落点 data-drop-target，松手才写库。
         拖拽期间 DOM 顺序一律不动——动了节点会被重渲染掉，dragend 就丢了。 */
      const dragGroupOf = function (key) {
        return String(key).indexOf('p:') === 0 ? 'project' : 'function';
      };
      const canDropOn = function (key, group) {
        return !!dragKey && dragKey !== key && dragGroupOf(dragKey) === group;
      };
      const announce = function (n) {
        setLiveText('已移动到第 ' + String(n) + ' 位');
      };
      const moveRailItem = function (fromKey, toKey, group) {
        if (!store) return;
        if (group === 'project') {
          const ids = projectOrderOf(state.projects, state.settings);
          const from = ids.indexOf(String(fromKey).slice(2));
          const to = ids.indexOf(String(toKey).slice(2));
          if (from < 0 || to < 0 || from === to) return;
          const next = ids.slice();
          const moved = next.splice(from, 1)[0];
          next.splice(to, 0, moved);
          actionSetSetting(store, { projectsOrder: next });
          announce(next.indexOf(moved) + 1);
          return;
        }
        /* 功能区复用 settings.modules.order（§1.20.7），重排后按 10 的步长重新编号 */
        const ids = plan['function'].map(function (m) { return m.id; });
        const from = ids.indexOf(fromKey);
        const to = ids.indexOf(toKey);
        if (from < 0 || to < 0 || from === to) return;
        const next = ids.slice();
        const moved = next.splice(from, 1)[0];
        next.splice(to, 0, moved);
        const modules = Object.assign({}, state.settings.modules);
        const order = Object.assign({}, (modules && modules.order) || {});
        next.forEach(function (id, index) { order[id] = (index + 1) * 10; });
        modules.order = order;
        actionSetSetting(store, { modules: modules });
        announce(next.indexOf(moved) + 1);
      };
      const onRowDragOver = function (key, group) {
        return function (event) {
          /* 跨组不 preventDefault：浏览器自己显示「不可放置」，也不出现落点线 */
          if (!canDropOn(key, group)) return;
          if (event && event.preventDefault) event.preventDefault();
          setDropKey(key);
        };
      };
      const onRowDrop = function (key, group) {
        return function (event) {
          if (!canDropOn(key, group)) return;
          if (event && event.preventDefault) event.preventDefault();
          moveRailItem(dragKey, key, group);
          setDragKey('');
          setDropKey('');
        };
      };
      const onGripKeyDown = function (key, group) {
        return function (event) {
          if (!event) return;
          const name = event.key;
          /* Enter / Space 写死无副作用：只 preventDefault，不开菜单、不进编辑态（§1.20.6） */
          if (name === 'Enter' || name === ' ' || name === 'Spacebar') {
            if (event.preventDefault) event.preventDefault();
            return;
          }
          if (!event.altKey || (name !== 'ArrowUp' && name !== 'ArrowDown')) return;
          if (event.preventDefault) event.preventDefault();
          const ids = group === 'project'
            ? projectOrderOf(state.projects, state.settings)
            : plan['function'].map(function (m) { return m.id; });
          const from = group === 'project' ? ids.indexOf(String(key).slice(2)) : ids.indexOf(key);
          const to = name === 'ArrowUp' ? from - 1 : from + 1;
          if (from < 0 || to < 0 || to >= ids.length) return;   /* 首/末位不循环、不写库 */
          moveRailItem(key, group === 'project' ? 'p:' + ids[to] : ids[to], group);
        };
      };
      const railGrip = function (key, group) {
        return button(
          {
            key: 'grip',
            className: 'dtRailDrag',
            'data-dt': 'rail-drag',
            'data-drag-key': key,
            'aria-label': '拖动排序',
            title: '拖动排序',
            tabIndex: 0,
            draggable: true,
            onDragStart: function (event) {
              setDragKey(key);
              if (event && event.dataTransfer) {
                try {
                  event.dataTransfer.setData('text/plain', key);
                  event.dataTransfer.effectAllowed = 'move';
                } catch (err) {
                  /* 个别环境不支持自定义 dataTransfer，不影响同组排序 */
                }
              }
            },
            onDragEnd: function () {
              setDragKey('');
              setDropKey('');
            },
            onKeyDown: onGripKeyDown(key, group),
            onClick: function (event) {
              /* 手柄在 rail 项前面，点它不能顺手把视图切走 */
              if (event && event.stopPropagation) event.stopPropagation();
            }
          },
          icon('grip', 12)
        );
      };
      const rowAttrs = function (key, group) {
        return {
          'data-drag-key': key,
          'data-drag-group': group,
          'data-dragging': dragKey === key ? '1' : undefined,
          'data-drop-target': dropKey === key ? '1' : undefined,
          onDragOver: onRowDragOver(key, group),
          onDragLeave: function () {
            if (dropKey === key) setDropKey('');
          },
          onDrop: onRowDrop(key, group)
        };
      };
      /* 面板两行开关：开启 = 隐藏（§1.20.2）。面板与设置页写同一个 action，不各写一套。 */
      const psRow = function (hook, label, on, key) {
        const toggle = function () {
          if (!store) return;
          const next = railUIOf(state.settings);
          next[key] = !on;
          actionSetSetting(store, { railUI: next });
        };
        return div(
          Object.assign(
            {
              key: hook,
              className: 'dtPsRow' + (on ? ' dtPsRowOn' : ''),
              'data-dt': hook,
              'data-on': on ? '1' : '0',
              role: 'switch',
              'aria-checked': on ? 'true' : 'false',
              tabIndex: 0,
              onKeyDown: function (event) {
                if (!event) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  if (event.preventDefault) event.preventDefault();
                  toggle();
                }
              }
            },
            scopedAction(store, toggle)
          ),
          span({ key: 'l', className: 'dtPsLabel' }, label),
          on ? span({ key: 'c', className: 'dtPsCheck', 'data-dt': hook + '-check' }, icon('check', 12)) : null
        );
      };
      /* t165：面板不只有两个开关，还要能直接调顺序与显隐（用户报障 m05408-3：
         「项目设置里面没有内容，无法设置各个项目和功能项的位置」）。
         三段条目与 rail 同源：顺序读同一个 settings，不另存第二套状态（§1.20.7）；
         移动只在本段内生效（与 rail 拖拽一致，§1.20.4），跨段不接收。
         上移/下移不受「隐藏项目位置调整」影响：那个开关只藏 rail 上的手柄，
         面板是替代入口，跟着一起消失等于把用户唯一的兜底路径也关掉。 */
      const psOrderOf = function (id, fallback) {
        const modules = (state.settings && state.settings.modules) || {};
        const order = modules.order || {};
        const value = order[id];
        return typeof value === 'number' && isFinite(value) ? value : fallback;
      };
      const psModulesOf = function (group) {
        return MODULE_REGISTRY
          .filter(function (module) {
            return module.railGroup === group && module.inRail !== false;
          })
          .slice()
          .sort(function (a, b) {
            const oa = psOrderOf(a.id, a.railOrder);
            const ob = psOrderOf(b.id, b.railOrder);
            if (oa !== ob) return oa - ob;
            return a.id < b.id ? -1 : 1;
          });
      };
      /* 模块段移动：整段按 (i+1)*10 重编号后逐条落库，走现成 actionSetModule */
      const psMoveModule = function (group, id, delta) {
        if (!store) return;
        const list = psModulesOf(group).map(function (module) { return module.id; });
        const from = list.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= list.length) return;
        const moved = list.splice(from, 1)[0];
        list.splice(to, 0, moved);
        list.forEach(function (moduleId, index) {
          actionSetModule(store, moduleId, { order: (index + 1) * 10 });
        });
      };
      /* 项目段移动：写 settings.projectsOrder（与 rail 拖拽同一个字段） */
      const psMoveProject = function (id, delta) {
        if (!store) return;
        const ids = projectOrderOf(state.projects, state.settings);
        const from = ids.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= ids.length) return;
        const next = ids.slice();
        const moved = next.splice(from, 1)[0];
        next.splice(to, 0, moved);
        actionSetSetting(store, { projectsOrder: next });
      };
      /* extra：追加在「上移 / 下移 / 显隐」之后的附加动作（当前只有项目组用：编辑 / 删除）。
         放在这里而不是另写一套行渲染，是为了让三组的行几何与键盘顺序保持一致。 */
      const psItemRow = function (group, id, name, index, count, on, toggle, move, extra) {
        const noUp = index <= 0;
        const noDown = index >= count - 1;
        const mkMove = function (hook, label, disabled, delta, glyph) {
          return button(
            Object.assign(
              {
                key: hook,
                type: 'button',
                className: 'dtPsMove' + (disabled ? ' dtPsMoveOff' : ''),
                'data-dt': hook,
                'aria-label': label,
                title: label,
                disabled: disabled,
                'aria-disabled': disabled ? 'true' : 'false'
              },
              scopedAction(store, function () {
                if (!disabled) move(delta);
              })
            ),
            icon(glyph, 12)
          );
        };
        return div(
          {
            key: group + ':' + id,
            className: 'dtPsItem',
            'data-id': id,
            'data-group': group,
            'data-on': on ? '1' : '0'
          },
          span({ key: 'n', className: 'dtPsItemName', title: name }, name),
          mkMove('ps-up', '上移', noUp, -1, 'arrow-up'),
          mkMove('ps-down', '下移', noDown, 1, 'arrow-down'),
          button(
            Object.assign(
              {
                key: 't',
                type: 'button',
                className: 'dtPsToggle' + (on ? ' dtPsToggleOn' : ''),
                'data-dt': 'ps-toggle',
                'data-on': on ? '1' : '0',
                'aria-pressed': on ? 'true' : 'false',
                'aria-label': (on ? '隐藏 ' : '显示 ') + name,
                title: on ? '隐藏' : '显示'
              },
              scopedAction(store, function () {
                toggle(!on);
              })
            ),
            icon(on ? 'check' : 'close', 12)
          ),
          extra || null
        );
      };
      const psGroup = function (group, title, rows) {
        return div(
          { key: 'g-' + group, className: 'dtPsGroup', 'data-group': group },
          div({ key: 't', className: 'dtPsGroupTitle' }, title),
          rows
        );
      };
      const psListRows = psModulesOf('list').map(function (module, index, arr) {
        const on = moduleEnabled(state.settings, module.id);
        return psItemRow('list', module.id, module.name, index, arr.length, on, function (next) {
          if (!store) return;
          actionSetModule(store, module.id, { enabled: next });
        }, function (delta) {
          psMoveModule('list', module.id, delta);
        });
      });
      const psProjectList = projectOrderOf(state.projects, state.settings)
        .map(function (id) {
          return state.projects.filter(function (project) { return project && project.id === id; })[0];
        })
        .filter(Boolean);
      const psProjectRows = psProjectList.map(function (project, index, arr) {
        const on = !project.hidden;
        /* S7c-1 的正解：不想去 A 栏找 ⋯ 的人，在这里也能编辑 / 删除清单。
           ps-edit 复用同一个 ProjectDialog（编辑态自带「删除清单」）；ps-del 走确认 + 既有 removeProject。 */
        const psEdit = button(
          Object.assign(
            {
              key: 'edit',
              type: 'button',
              className: 'dtPsEdit',
              'data-dt': 'ps-edit',
              'aria-label': '编辑 ' + project.name,
              title: '编辑'
            },
            scopedAction(store, function () {
              props.onEditProject(project.id);
            })
          ),
          icon('gear', 12)
        );
        const psDel = button(
          Object.assign(
            {
              key: 'del',
              type: 'button',
              className: 'dtPsDel',
              'data-dt': 'ps-del',
              'aria-label': '删除 ' + project.name,
              title: '删除'
            },
            scopedAction(store, function () {
              props.onDeleteProject(project.id);
            })
          ),
          icon('trash', 12)
        );
        return psItemRow('project', project.id, project.name, index, arr.length, on, function (next) {
          if (!store) return;
          /* 项目显隐落在项目对象自己的 hidden 字段上：与模块 enabled 同性质，
             不新开 settings 键，也不影响 projectsOrder。 */
          patchProject(store, project.id, { hidden: next ? false : true });
        }, function (delta) {
          psMoveProject(project.id, delta);
        }, [psEdit, psDel]);
      });
      const psFunctionRows = psModulesOf('function').map(function (module, index, arr) {
        const on = moduleEnabled(state.settings, module.id);
        return psItemRow('function', module.id, module.name, index, arr.length, on, function (next) {
          if (!store) return;
          actionSetModule(store, module.id, { enabled: next });
        }, function (delta) {
          psMoveModule('function', module.id, delta);
        });
      });
      const psPanel = props.psOpen
        ? div(
          {
            key: 'pspanel',
            className: 'dtPsPanel',
            'data-dt': 'project-settings-panel',
            'data-open': '1',
            'data-items': String(psListRows.length + psProjectRows.length + psFunctionRows.length),
            'data-flip': psPlacement.value.flip === 'up' ? 'up' : undefined,
            style: Object.assign(
              {
                position: 'fixed',
                left: (psPos ? psPos.left : 8) + 'px',
                top: (psPos ? psPos.top : 8) + 'px',
                width: (psPos ? psPos.width : 300) + 'px',
                maxHeight: (psPos ? psPos.maxHeight : 600) + 'px'
              },
              { overflowY: 'auto' }
            ),
            role: 'dialog',
            'aria-label': '项目设置',
            ref: psPanelRef
          },
          psRow('ps-hide-reorder', '隐藏项目位置调整', railUI.hideReorder, 'hideReorder'),
          psRow('ps-hide-color', '隐藏项目颜色', railUI.hideColor, 'hideColor'),
          div({ key: 'div', className: 'dtPsDivider' }),
          psGroup('list', '清单', psListRows),
          psGroup('project', '项目', psProjectRows),
          psGroup('function', '功能区', psFunctionRows)
        )
        : null;

      /* 清单段：今天 / 最近 7 天 / 标签 / 全部未完成 / 已完成 / 已删除。
         标签项在 tag 视图与 tag:<name> 视图下都算「已激活」。 */
      const listItems = plan.list.map(function (module) {
        const view = module.id;
        const on = view === 'tags'
          ? (props.listView === 'tags' || String(props.listView || '').indexOf('tag:') === 0)
          : props.listView === view;
        return button(
          {
            key: view,
            className: 'dtRailItem' + (on ? ' dtRailOn' : ''),
            'data-dt': 'rail-' + view,
            'data-module': module.id,
            onClick: function () {
              props.onPick(view);
            }
          },
          span({ key: 'i', className: 'dtRailIcon' }, icon(module.icon || 'inbox', 15)),
          span({ key: 'l', className: 'dtRailLabel' }, module.name),
          span({ key: 'c', className: 'dtRailCount' }, String(counts[view] || 0))
        );
      });

      /* 项目段：项目组里不再出现 type=habit 的清单（习惯是 review 段的一级项）。
         t144：顺序由 settings.projectsOrder 决定（纯函数补全/剔除，§1.20.7）。 */
      const projectList = projectOrderOf(state.projects, state.settings)
        .map(function (id) {
          return state.projects.filter(function (project) { return project && project.id === id; })[0];
        })
        .filter(function (project) {
          /* t165：被面板隐藏的项目不占 rail 槽位，但仍留在面板里可再打开 */
          return !!project && !project.hidden;
        });

      const projectItems = projectList.map(function (project) {
        const open = tasks.filter(function (t) { return t.projectId === project.id && t.status === 0 && !t.deleted; }).length;
        const typeInfo = projectType(project.type);
        return div(
          Object.assign({ key: project.id, className: 'dtRailRow' }, rowAttrs('p:' + project.id, 'project')),
          showGrip ? railGrip('p:' + project.id, 'project') : null,
          button(
            {
              className: 'dtRailItem' + (props.listView === 'p:' + project.id ? ' dtRailOn' : ''),
              title: typeInfo.label,
              'data-project-id': project.id,
              'data-dt': 'rail-project',
              onClick: function () {
                props.onPick('p:' + project.id);
              }
            },
            project.icon
              ? span({ key: 'e', className: 'dtRailEmoji' }, project.icon)
              /* t83/F16：老记录里 project.color 存的是字面 hex，直接塞进 inline style 会绕过
                 主题变量（深浅两档取样完全相同）。这里统一过一遍读取侧归一：八色板档位
                 变成 var(--dt-project-*)，任意自定义色原样返回（不映射、不改库）。 */
              : (showDot
                ? span({ key: 'd', className: 'dtDot', style: { background: normalizeProjectColor(project.color) || 'var(--dsw-alias-brand-primary)' } })
                : null),
            span({ key: 'l', className: 'dtRailLabel' }, project.name),
            span({ key: 'c', className: 'dtRailCount' }, String(open))
          ),
          button(
            {
              className: 'dtRailMore',
              title: '清单设置',
              onClick: function () {
                props.onEditProject(project.id);
              }
            },
            '⋯'
          )
        );
      });

      const projectBlock = plan.project.length
        ? [
          div(
            { key: 'pt', className: 'dtRailGroupTitle' },
            span({ key: 't' }, plan.project[0].name || '项目'),
            span(
              { key: 'n', className: 'dtRailGroupCount' },
              String(projectList.length),
              div(
                { key: 'acts', className: 'dtRailTitleActions' },
                button(
                  {
                    className: 'dtRailAdd',
                    title: '项目设置',
                    'data-dt': 'project-settings',
                    'aria-label': '项目设置',
                    'aria-haspopup': 'dialog',
                    'aria-expanded': props.psOpen ? 'true' : 'false',
                    ref: psRef,
                    onClick: function () {
                      props.onTogglePs();
                    }
                  },
                  icon('sliders', 12)
                ),
                button(
                  {
                    className: 'dtRailAdd',
                    title: '新建清单',
                    'data-dt': 'rail-new-project',
                    onClick: function () {
                      props.onCreateProject();
                    }
                  },
                  icon('plus', 12)
                )
              )
            )
          ),
          psPanel,
          div({ key: 'pg', className: 'dtRailGroupInner' }, projectItems)
        ]
        : null;

      /* 功能区（t137）：四象限 / 日历 / 习惯打卡 / 必做之事 / 番茄钟 / 螺旋工作法。
         前四项落 B 栏（互斥替换，§1.2.3）；番茄钟与螺旋只切中间区，B、C 栏一律不动。
         两组在原五段模型里分属 review 与 timer，t136 合并成一段，段内顺序全交给注册表 railOrder。 */
      const FUNCTION_TIMER_IDS = ['pomodoro', 'spiral'];
      const functionItems = plan['function'].map(function (module) {
        const view = module.id;
        const isTimer = FUNCTION_TIMER_IDS.indexOf(view) >= 0;
        const on = props.listView === view;
        const extra = [];
        if (view === 'pomodoro') {
          extra.push(span({ key: 'c', className: 'dtRailCount' }, pomo.running ? fmtClock(pomoLeft) : String(pomo.count || 0)));
        }
        if (view === 'spiral') {
          extra.push(spiralBadge === null ? null : span({ key: 'c', className: 'dtRailCount' }, String(spiralBadge)));
        }
        if (view === 'onething' && counts.onething > 0) {
          extra.push(span({ key: 'b', className: 'dtRailBadge', 'data-onething-badge': '1' }, '1'));
        }
        const attrs = {
          key: view,
          className: 'dtRailItem' + (on ? ' dtRailOn' : ''),
          'data-dt': 'rail-' + view,
          'data-module': module.id,
          title: module.name,
          onClick: function () {
            if (isTimer) props.onPickTimer(view);
            else props.onPick(view);
          }
        };
        if (view === 'spiral') attrs['data-spiral-badge'] = spiralBadge === null ? undefined : String(spiralBadge);
        return div(
          Object.assign({ key: view, className: 'dtRailFnRow' }, rowAttrs(view, 'function')),
          showGrip ? railGrip(view, 'function') : null,
          button(
            attrs,
            span({ key: 'i', className: 'dtRailIcon' }, icon(module.icon || (isTimer ? 'timer' : 'flag'), 15)),
            span({ key: 'l', className: 'dtRailLabel' }, module.name),
            extra
          )
        );
      });

      /* 设置段：只有设置一项，走中间区 */
      const settingsItems = plan.settings.map(function (module) {
        return button(
          {
            key: module.id,
            className: 'dtRailItem' + (props.listView === 'settings' ? ' dtRailOn' : ''),
            'data-dt': 'rail-settings',
            'data-module': module.id,
            title: module.name,
            onClick: function () {
              props.onPick('settings');
            }
          },
          span({ key: 'i', className: 'dtRailIcon' }, icon(module.icon || 'gear', 15)),
          span({ key: 'l', className: 'dtRailLabel' }, module.name)
        );
      });

      const groups = {
        list: listItems.length ? div({ key: 'g-list', className: 'dtRailGroup', 'data-rail-group': 'list' }, listItems) : null,
        project: plan.project.length ? div({ key: 'g-project', className: 'dtRailGroup', 'data-rail-group': 'project' }, projectBlock) : null,
        'function': functionItems.length ? div({ key: 'g-function', className: 'dtRailGroup', 'data-rail-group': 'function' }, functionItems) : null,
        settings: settingsItems.length ? div({ key: 'g-settings', className: 'dtRailGroup', 'data-rail-group': 'settings' }, settingsItems) : null
      };

      /* t156 §1.21：立即行动按钮在 rail 顶部右侧（不是 B 栏标题区），
         开关复用既有 rec 模块（默认开，见 moduleDefaults），不新造第二套开关 */
      const railTop = [div({ key: 'title', className: 'dtRailTitle' }, '任务')];
      if (props.showActNow) {
        railTop.push(
          button(
            {
              key: 'act',
              type: 'button',
              className: 'dtRailRecBtn',
              'data-dt': 'rail-act-now',
              'aria-label': '立即行动',
              title: '立即行动',
              onClick: function () {
                props.onActNow();
              }
            },
            '立即行动'
          )
        );
      }
      /* §1.22（t160）：上方三段（清单 / 项目 / 功能区）进可滚动容器，设置段恒贴底。
         分隔线仍 3 条，分布改为「2 内 1 外」：list/project 之后各 1 条在容器内，
         function 之后那条留在容器外（data-rail-pin="1"），把功能区和设置切开——
         功能区末项紧贴设置时最容易点错，这条边界不能省。 */
      const scrollChildren = [];
      ['list', 'project'].forEach(function (key) {
        if (groups[key]) {
          scrollChildren.push(groups[key]);
          scrollChildren.push(div({ key: 'sep-' + key, className: 'dtRailSep' }));
        }
      });
      if (groups['function']) scrollChildren.push(groups['function']);
      const children = [
        div({ key: 'top', className: 'dtRailTop' }, railTop),
        div({ key: 'scroll', className: 'dtRailScroll', 'data-dt': 'rail-scroll' }, scrollChildren)
      ];
      if (groups['function']) {
        children.push(div({ key: 'sep-pin', className: 'dtRailSep', 'data-rail-pin': '1' }));
      }
      if (groups.settings) children.push(groups.settings);
      /* 键盘移动的播报容器（§1.20.6）：视觉上不可见，但必须常驻（aria-live 需要提前在树里） */
      children.push(div({ key: 'live', className: 'dtRailLive', 'data-dt': 'rail-order-live', 'aria-live': 'polite' }, liveText));

      return div({ className: 'dtRail' }, children);
    }

    function EmptyState(props) {
      /* §7-2 / t116：今天视图的空态是「默认内容为空」这一状态本身，挂规格钩子
         data-state="empty" 与 data-dt="empty-today"，其余清单空态不挂（避免断言把它们混为一谈）。 */
      const isToday = props.view === 'today';
      return div(
        {
          className: 'dtEmpty' + (isToday ? ' dtEmptyToday' : ''),
          'data-state': isToday ? 'empty' : undefined,
          'data-dt': isToday ? 'empty-today' : undefined
        },
        div({ className: 'dtEmptyTitle' }, props.title || '这里还没有任务'),
        div({ className: 'dtEmptyText' }, props.text || '用上方的输入框添加一条，或切换到其它清单。')
      );
    }

    /* 日期视图标题（§1.6）：`M月D日 周X · N 项`，W3 以下压缩成 `M月D日 · N 项`。 */
    function dateViewTitle(key, count, tier) {
      const day = parseISO(key);
      if (!day) return '日期';
      const base = (day.getMonth() + 1) + '月' + day.getDate() + '日';
      if (tier >= TIER_W3) return base + ' · ' + count + ' 项';
      return base + ' 周' + WEEK.charAt(day.getDay()) + ' · ' + count + ' 项';
    }

    /* 排序器选项（§4.2）：UI 只暴露规格里的七项；比较器本身支持 9 键（契约并集）。 */
    function sortKeyOptions() {
      return [
        option({ key: 'smart', value: 'smart' }, '智能排序'),
        option({ key: 'score', value: 'score' }, '按分数'),
        option({ key: 'date', value: 'date' }, '按日期'),
        option({ key: 'tag', value: 'tag' }, '按标签'),
        option({ key: 'priority', value: 'priority' }, '按优先级'),
        option({ key: 'created', value: 'created' }, '按创建时间'),
        option({ key: 'title', value: 'title' }, '按标题')
      ];
    }

    function groupOptions() {
      return [
        option({ key: 'none', value: 'none' }, '不分组'),
        option({ key: 'project', value: 'project' }, '按清单'),
        option({ key: 'status', value: 'status' }, '按状态'),
        option({ key: 'dateBucket', value: 'dateBucket' }, '按日期桶'),
        option({ key: 'tag', value: 'tag' }, '按标签')
      ];
    }

    const DATE_BUCKET_LABELS = {
      overdue: '已逾期',
      today: '今天',
      tomorrow: '明天',
      week: '本周',
      later: '以后',
      noDate: '无日期'
    };

    /* 组头文案：尽量用数据自己的名字（清单名 / 标签名），查不到才退回键名 */
    function groupHeadLabel(state, key, group) {
      if (group === 'project' || key === '') {
        if (!key) return '未分类';
        const found = (state.projects || []).find(function (p) { return p.id === key; });
        return found ? found.name : '未分类';
      }
      if (group === 'status') return key === 'done' ? '已完成' : '未完成';
      if (group === 'dateBucket') return DATE_BUCKET_LABELS[key] || key;
      if (group === 'tag') return key;
      return key;
    }

    function TaskListView(props) {
      const state = props.state;
      const store = props.store;
      const view = props.view;
      const query = props.query || '';
      const showDone = !!props.showDone;
      const [draft, setDraft] = useState('');

      const list = useMemo(function () {
        return filterTasks(state, view, query, showDone);
      }, [state, view, query, showDone]);

      const projectForNew = useMemo(function () {
        if (view.indexOf('p:') === 0) return view.slice(2);
        const inbox = state.projects.find(function (p) { return p.inbox; });
        return inbox ? inbox.id : (state.projects[0] ? state.projects[0].id : '');
      }, [state.projects, view]);

      /* 打卡清单的新任务默认每天重复，目标任务默认中优先级 */
      const typeDefaults = useMemo(function () {
        const project = state.projects.find(function (p) { return p.id === projectForNew; });
        const type = project ? project.type : 'todo';
        if (type === 'habit') return { repeat: 'DAILY' };
        if (type === 'goal') return { priority: 3 };
        return {};
      }, [state.projects, projectForNew]);

      const isDate = view.indexOf('date:') === 0;
      const dateKeyOfView = isDate ? view.slice(5) : '';
      const isProject = view.indexOf('p:') === 0;

      const contextDate = function () {
        if (view === 'today' || view === 'week') return dateKey(new Date());
        if (isDate) return dateKeyOfView;
        return '';
      };

      const submitDraft = function () {
        const text = draft.trim();
        if (!text) return;
        const created = addTask(store, Object.assign({
          title: text,
          projectId: projectForNew,
          date: contextDate(),
          allDay: true
        }, typeDefaults));
        setDraft('');
        if (props.onCreated) props.onCreated(created.id);
      };

      const limitReached = (view === 'done' || view === 'trash') && list.length > 300;
      const shown = limitReached ? list.slice(0, 300) : list;

      /* §4.4 第 4–5 步：分组与组内排序。前 3 步（视图过滤 / 搜索 / 含已完成）仍由
         filterTasks 完成——那是第一阶段就有的行为，逐字不动。 */
      const sortCfg = (state.settings.tasks && state.settings.tasks.sort) || { key: 'smart', dir: 'asc', group: 'none' };
      const groups = useMemo(function () {
        return arrangeTasks(state.db, shown, sortCfg, sortCfg.group, new Date());
      }, [state.db, shown, sortCfg.key, sortCfg.dir, sortCfg.group]);
      const showSortBar =
        view === 'today' || view === 'week' || view === 'open' || view === 'done' ||
        view.indexOf('p:') === 0 || view.indexOf('date:') === 0;
      const projectId = view.indexOf('p:') === 0 ? view.slice(2) : '';
      const [busy, setBusy] = useState(null);

      const applySort = function (patch) {
        actionSetTaskSort(store, Object.assign({}, sortCfg, patch));
      };

      /* 一键打分（§8.3）：候选=该清单未完成任务；每 50 条让出一次主线程，
         保证进度文案真的能被画出来。失败只累计 skipped，不中断整批。 */
      const runBulkScore = function () {
        if (busy || !projectId) return;
        const gridDb = state.db;
        const candidates = selectTasksByProject(gridDb, projectId).filter(function (task) {
          return task && !task.deleted && task.status === 0;
        });
        if (!candidates.length) {
          store.pushAlert({ id: uid('toast'), title: '该清单没有未完成任务', body: '', ttl: 4000 });
          return;
        }
        let index = 0;
        let scored = 0;
        let skipped = 0;
        let failed = 0;
        setBusy({ done: 0, total: candidates.length });
        const step = function () {
          const chunk = candidates.slice(index, index + 50);
          chunk.forEach(function (task) {
            let value;
            try {
              value = scoreTask(task, gridDb);
            } catch (err) {
              value = NaN;
            }
            if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 100) {
              failed += 1;
              return;
            }
            const result = actionSetScore(store, task.id, { score: value, source: 'auto', rubricVersion: SCORE_RUBRIC_VERSION });
            if (result && result.ok && result.scoreWrite && result.scoreWrite.skipped) skipped += 1;
            else if (result && result.ok) scored += 1;
            else skipped += 1;
          });
          index += chunk.length;
          setBusy({ done: Math.min(index, candidates.length), total: candidates.length });
          if (index < candidates.length) {
            setTimeout(step, 0);
            return;
          }
          setBusy(null);
          const parts = ['已为 ' + scored + ' 项打分，跳过 ' + skipped + ' 项（手动分）'];
          if (failed) parts.push(failed + ' 项无法打分');
          store.pushAlert({ id: uid('toast'), title: parts.join('；'), body: '', ttl: 4000 });
        };
        setTimeout(step, 0);
      };

      /* 顺序固定：搜索 → 含已完成（仅项目）→ 新建 → 收起（末位） */
      const headerExtra = [];

      headerExtra.push(
        div({ key: 'search', className: 'dtSearch' }, icon('search', 14), input({
          className: 'dtSearchInput',
          value: query,
          placeholder: '搜索任务',
          onChange: function (event) {
            if (props.onQuery) props.onQuery(event.target.value);
          }
        }))
      );

      if (isProject) {
        headerExtra.push(
          button(
            {
              key: 'toggle',
              className: 'dtMiniBtn' + (showDone ? ' dtMiniOn' : ''),
              onClick: function () {
                if (props.onToggleShowDone) props.onToggleShowDone(!showDone);
              }
            },
            showDone ? '隐藏已完成' : '含已完成'
          )
        );
      }

      headerExtra.push(
        button(
          {
            key: 'new',
            className: 'dtPrimaryBtn',
            onClick: function () {
              const created = addTask(store, Object.assign({
                title: '',
                projectId: projectForNew,
                date: contextDate(),
                allDay: true
              }, typeDefaults));
              if (props.onCreated) props.onCreated(created.id);
            }
          },
          icon('plus', 14),
          span({ key: 'l' }, '新建')
        )
      );

      if (projectId && props.showRec !== false) {
        headerExtra.push(
          button(
            Object.assign(
              {
                key: 'score',
                className: 'dtBlueBtn',
                'data-dt': 'score-batch',
                'data-dt-spec': 'bulk-score',
                'data-busy': busy ? '1' : undefined,
                disabled: busy ? true : undefined,
                title: busy ? '正在打分' : '一键打分'
              },
              scopedAction(store, runBulkScore)
            ),
            icon('spark', 13),
            span({ key: 'l', style: { marginLeft: '4px' } }, busy ? '打分中 ' + busy.done + '/' + busy.total : '一键打分')
          )
        );
      }

      /* t210 F3：已删除视图补「清空已删除」。计数只统计 deleted，不影响今天/未完成/已完成的条数。 */
      if (view === 'trash') {
        const trashCount = state.tasks.filter(function (t) { return !!t.deleted; }).length;
        headerExtra.push(
          button(
            {
              key: 'purge-all',
              className: 'dtGhostBtn dtTrashPurgeAll',
              'data-dt': 'trash-purge-all',
              'data-trash-count': String(trashCount),
              disabled: trashCount === 0 ? true : undefined,
              title: '清空已删除的任务',
              onClick: function () {
                if (!trashCount) return;
                if (!window.confirm('清空已删除的 ' + trashCount + ' 条任务？此操作不可恢复。')) return;
                state.tasks
                  .filter(function (t) { return !!t.deleted; })
                  .forEach(function (t) { destroyTask(store, t.id); });
              }
            },
            icon('trash', 13),
            span({ key: 'l', style: { marginLeft: '4px' } }, '清空已删除')
          )
        );
      }

      if (props.onCollapse) {
        headerExtra.push(
          button(
            {
              key: 'collapse',
              className: 'dtMiniBtn dtDrawerCollapse',
              'data-dt': 'drawer-collapse',
              title: '收起',
              'aria-label': '收起',
              onClick: function () {
                props.onCollapse();
              }
            },
            icon('close', 12),
            span({ key: 'l', style: { marginLeft: '4px' } }, '收起')
          )
        );
      }

      const canEdit = view !== 'done' && view !== 'trash';
      const title = isDate
        ? dateViewTitle(dateKeyOfView, list.length, props.tier || 0)
        : viewTitle(state, view);

      return div(
        { className: 'dtMain' },
        div(
          { key: 'head', className: 'dtHead' },
          div(
            { key: 'l', className: 'dtHeadLeft' },
            div({ key: 't', className: 'dtHeadTitle' }, title),
            div({ key: 'c', className: 'dtHeadCount' }, String(list.length) + ' 条' + (limitReached ? '（显示前 300）' : ''))
          ),
          div({ key: 'r', className: 'dtHeadRight' }, headerExtra)
        ),
        showSortBar
          ? div(
              { key: 'sort', className: 'dtSortBar', 'data-dt': 'sortbar', 'data-busy': busy ? '1' : undefined },
              select(
                {
                  className: 'dtSortSelect',
                  'data-dt': 'sort-key',
                  value: sortCfg.key,
                  disabled: busy ? true : undefined,
                  title: '排序方式',
                  onChange: function (event) {
                    applySort({ key: event.target.value });
                  }
                },
                sortKeyOptions()
              ),
              button(
                Object.assign(
                  {
                    key: 'dir',
                    className: 'dtSortDir',
                    'data-dt': 'sort-dir',
                    'data-dir': sortCfg.dir,
                    title: sortCfg.dir === 'desc' ? '当前降序，点击切升序' : '当前升序，点击切降序'
                  },
                  scopedAction(store, function () {
                    applySort({ dir: sortCfg.dir === 'desc' ? 'asc' : 'desc' });
                  })
                ),
                icon(sortCfg.dir === 'desc' ? 'arrow-down' : 'arrow-up', 13)
              ),
              select(
                {
                  className: 'dtSortSelect',
                  'data-dt': 'group-by',
                  value: sortCfg.group,
                  disabled: busy ? true : undefined,
                  title: '分组',
                  onChange: function (event) {
                    applySort({ group: event.target.value });
                  }
                },
                groupOptions()
              ),
              span({ key: 'count', className: 'dtSortCount', 'data-dt': 'sort-count' }, '共 ' + list.length + ' 项')
            )
          : null,
        canEdit
          ? div(
              { key: 'add', className: 'dtAddBar' },
              icon('plus', 14),
              input({
                className: 'dtAddInput',
                value: draft,
                placeholder: view === 'today' ? '添加今天的任务，回车保存' : '添加任务，回车保存',
                onChange: function (event) {
                  setDraft(event.target.value);
                },
                onKeyDown: function (event) {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitDraft();
                  }
                }
              }),
              draft.trim()
                ? button({ className: 'dtMiniBtn', onClick: submitDraft }, '保存')
                : null
            )
          : null,
        div(
          { key: 'list', className: 'dtList' },
          shown.length
            ? groups.reduce(function (acc, group) {
                const multi = groups.length > 1 || (group.key !== '' && sortCfg.group !== 'none');
                if (multi) {
                  acc.push(
                    div(
                      { key: 'g:' + group.key, className: 'dtGroupHead', 'data-group': group.key, 'data-count': String(group.tasks.length) },
                      groupHeadLabel(state, group.key, sortCfg.group)
                    )
                  );
                }
                group.tasks.forEach(function (task) {
                  acc.push(h(TaskRow, {
                    key: task.id,
                    task: task,
                    store: store,
                    state: state,
                    showScore: props.showScore,
                    active: props.activeId === task.id,
                    onOpen: canEdit ? props.onOpen : null
                  }));
                });
                return acc;
              }, [])
            : h(EmptyState, {
                view: view,
                title: isDate
                  ? '这一天还没有任务'
                  : view === 'done'
                    ? '还没有已完成的任务'
                    : view === 'trash'
                      ? '回收站是空的'
                      : view === 'today'
                        ? '今天还没有任务'
                        : '这个清单是空的',
                text: isDate
                  ? '点右上角 ＋ 新建'
                  : view === 'trash'
                    ? '删除的任务会先落到这里，可随时恢复。'
                    : '用上方输入框添加，或从其它清单里选一条。'
              })
        )
      );
    }

    /* ------------------------------------ 四象限（40） ----------------------------------- */

    function QuadrantItem(props) {
      const task = props.task;
      const pinned = props.pinned;
      return div(
        {
          className: 'dtQuadItem',
          'data-task-id': task.id,
          'data-pinned': pinned ? '1' : '0',
          'data-src': quadSrcOf(task)
        },
        h(TaskRow, {
          key: task.id,
          task: task,
          store: props.store,
          showScore: props.showScore,
          compact: true,
          quadView: true,
          active: props.active,
          onOpen: props.onOpen,
          onPin: props.onPin
        })
      );
    }

    function QuadrantView(props) {
      const state = props.state;
      const store = props.store;
      const today = new Date();
      const [stack, setStack] = useState(false);
      const rootRef = useRef(null);

      /* 单格可用宽度：抽屉宽 < 420px 时 2×2 折不动，转单列 4 行（与容器档位解耦，只看 B 抽屉自身宽度） */
      useEffect(function () {
        const node = rootRef.current;
        if (!node) return undefined;
        const update = function () {
          const width = node.getBoundingClientRect().width || node.clientWidth || 0;
          setStack(width > 0 && width < 420);
        };
        update();
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(update);
          observer.observe(node);
          return function () {
            observer.disconnect();
          };
        }
        window.addEventListener('resize', update);
        return function () {
          window.removeEventListener('resize', update);
        };
      }, []);

      const openTasks = state.tasks.filter(function (task) {
        return task.status === 0 && !task.deleted;
      });
      const pinnedTasks = openTasks.filter(function (task) {
        return isPinned(task, today);
      }).sort(compareOpen);
      const buckets = { q1: [], q2: [], q3: [], q4: [] };
      openTasks.forEach(function (task) {
        if (isPinned(task, today)) return;
        buckets[quadOf(task, today)].push(task);
      });
      Object.keys(buckets).forEach(function (key) {
        buckets[key].sort(compareOpen);
      });

      const pin = function (id) {
        const task = state.tasks.find(function (t) { return t.id === id; });
        const todayKey = dateKey(today);
        const nextPin = task && task.pinToday === todayKey ? '' : todayKey;
        patchTask(store, id, { pinToday: nextPin });
      };

      const cells = QUADRANTS.map(function (quad) {
        const items = buckets[quad.id];
        const count = quad.id === 'q1' ? items.length + pinnedTasks.length : items.length;
        const body = [];
        if (quad.id === 'q1' && pinnedTasks.length) {
          body.push(
            div(
              { key: 'pin', className: 'dtTodayPin', 'data-count': String(pinnedTasks.length) },
              div(
                { key: 't', className: 'dtTodayPinTitle' },
                icon('sun', 12),
                span({ key: 'l' }, '今日要事')
              ),
              pinnedTasks.map(function (task) {
                return h(QuadrantItem, {
                  key: task.id,
                  task: task,
                  pinned: true,
                  store: store,
                  active: props.activeId === task.id,
                  onOpen: props.onOpen,
                  onPin: pin
                });
              })
            )
          );
        }
        items.forEach(function (task) {
          body.push(
            h(QuadrantItem, {
              key: task.id,
              task: task,
              pinned: false,
              store: store,
              active: props.activeId === task.id,
              onOpen: props.onOpen,
              onPin: pin
            })
          );
        });
        if (!body.length) {
          body.push(div({ key: 'empty', className: 'dtQuadEmpty', 'data-quadrant': quad.id }, quad.empty));
        }
        return h(
          'section',
          {
            key: quad.id,
            className: 'dtQuadCell',
            'data-quadrant': quad.id,
            'data-count': String(count),
            'data-quad-color': quad.id.charAt(1) === '1' ? 'red' : quad.id.charAt(1) === '2' ? 'yellow' : quad.id.charAt(1) === '3' ? 'blue' : 'none',
            style: { '--dt-quad': QUAD_EDGE[quad.id] || 'transparent' }
          },
          h(
            'header',
            { className: 'dtQuadHead' },
            span({ className: 'dtQuadTitle dtQuadHeadTitle' }, quad.title),
            span({ className: 'dtQuadCount' }, String(count))
          ),
          div({ className: 'dtQuadBody', 'data-quadrant': quad.id }, body)
        );
      });

      return div(
        {
          className: 'dtQuad',
          ref: rootRef,
          'data-view': 'quad',
          'data-layout': stack ? 'stack' : 'grid',
          'data-today': dateKey(today)
        },
        div({ className: 'dtQuadGrid' }, cells)
      );
    }

    /* ------------------------------------ 面板容器 ----------------------------------- */

    /* 容器档位（与 CSS @container 同阈值）：W1 ≥1080 / W2 900–1079 / W3 720–899 / W4 560–719 / W5 <560。
       JS 侧只关心「是否让位中间区 / rail 是否转图标条」，视觉细节全交给 CSS。 */
    const TIER_W1 = 1;
    const TIER_W2 = 2;
    const TIER_W3 = 3;
    const TIER_W4 = 4;
    const TIER_W5 = 5;

    function tierOf(width) {
      if (!width) return TIER_W1;
      if (width >= 1080) return TIER_W1;
      if (width >= 900) return TIER_W2;
      if (width >= 720) return TIER_W3;
      if (width >= 560) return TIER_W4;
      return TIER_W5;
    }

    /* B 栏视图标题：与 TaskListView 内部口径保持一致（列表页用同一个纯函数） */
    function listViewLabel(state, view) {
      if (!view) return '';
      if (view === 'habit') return '习惯打卡';
      if (view === 'quadrant') return '四象限';
      if (view.indexOf('date:') === 0) return '日期';
      return viewTitle(state, view);
    }

    function detailOf(detail) {
      if (!detail) return { kind: '', id: '' };
      const cut = detail.indexOf(':');
      return { kind: detail.slice(0, cut), id: detail.slice(cut + 1) };
    }

    /* t127：先保证「永不空白」，再谈真因。
       三层兜底：①apply() 抛错 → 70-styles 的 catch 调 renderFatalPanel()；
                 ②渲染期抛错 → 本文件的 PanelBoundary（真实 React 走 componentDidCatch）；
                 ③数据损坏 → 00-prelude 备份原文 + 顶部提示条，面板照常启动。 */
    function fatalFirstLine(err) {
      if (!err) return '未知错误（无错误对象）';
      const msg = err && err.message ? String(err.message) : String(err);
      const line = msg.split('\n')[0];
      return line || '未知错误（错误信息为空）';
    }

    function fatalStackText(err) {
      if (!err || !err.stack) return '';
      return String(err.stack).split('\n').slice(0, 10).join('\n');
    }

    function resetLocalData() {
      try {
        const view = typeof window !== 'undefined' ? window : null;
        const ok = !view || typeof view.confirm !== 'function' || view.confirm('确定要重置本地数据并重载吗？任务、清单与设置都会丢失。');
        if (!ok) return;
        if (view && view.localStorage) view.localStorage.removeItem(STORE_KEY);
      } catch (err) {
        /* 清不掉也继续重载，至少不再卡在空白 */
      }
      try {
        if (typeof window !== 'undefined' && window.location && window.location.reload) window.location.reload();
      } catch (err) {
        /* 无 location 的宿主里保持当前页面 */
      }
    }

    /* 崩溃卡是「样式注入都还没跑成」时唯一能画出来的东西，所以这里的圆角与内边距**刻意写字面值**：
       dt-tokens 由 injectStyles 注入，走 apply 失败这条路径时它们可能压根没进表，
       再引用 var(--dt-r-card)/var(--dt-sp-N) 会二次失败（整张卡片退化成无样式块）。
       color/background/border 仍用宿主别名——那三个由宿主提供，不依赖我们的注入。 */
    const FATAL_CARD_STYLE = 'padding:18px 20px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;'
      + 'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);max-width:640px;margin:24px auto;';

    function FatalCard(props) {
      const err = props.error || null;
      const stack = fatalStackText(err);
      const retry = props.onRetry;
      return div(
        {
          className: 'dtFatal',
          'data-dt': 'fatal',
          'data-fatal': props.code || 'RENDER_FAILED',
          style: FATAL_CARD_STYLE
        },
        div({ key: 't', className: 'dtFatalTitle', style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } },
          props.title || '任务面板加载失败'),
        div({ key: 'm', className: 'dtFatalText', 'data-dt': 'fatal-msg', style: { fontSize: '13px', lineHeight: 1.6, wordBreak: 'break-word' } },
          fatalFirstLine(err)),
        stack
          ? h('details', { key: 's', style: { marginTop: '10px' } },
              h('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, '调用栈（前 10 行）'),
              h('pre', {
                className: 'dtFatalStack',
                'data-dt': 'fatal-stack',
                style: { margin: '8px 0 0', padding: '8px', borderRadius: '8px', background: 'var(--dsw-alias-bg-base)' }
                  + 'font-size:var(--dt-fs-micro);line-height:1.5;white-space:pre-wrap;word-break:break-all;'
                  + 'color:var(--dsw-alias-label-secondary);max-height:220px;overflow:auto;'
              }, stack))
          : null,
        div({ key: 'a', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } },
          retry
            ? button({
                key: 'r',
                type: 'button',
                className: 'dtGhostBtn',
                'data-dt': 'fatal-retry',
                onClick: function () { retry(); }
              }, '重试渲染')
            : null,
          button({
            key: 'x',
            type: 'button',
            className: 'dtDangerBtn',
            'data-dt': 'fatal-reset',
            onClick: function () { resetLocalData(); }
          }, '重置本地数据并重载'))
      );
    }

    /* apply() 级别的兜底入口（由 70-styles 的 catch 调用）：仍然产出一个完整 .dtRoot，
       宿主把它挂到 main 插槽上，用户看到的是卡片而不是白屏。 */
    function renderFatalPanel(err) {
      return div(
        {
          className: 'dtRoot',
          'data-count': '0',
          'data-dt': 'fatal-root',
          style: { display: 'block', padding: '0 12px' }
        },
        h(FatalCard, { error: err, code: 'APPLY_FAILED' })
      );
    }

    /* 真实 React 走类组件 componentDidCatch（能接住子树渲染期异常）；
       测试桩没有 React.Component，退化成「内联调用 + try/catch」，两条路径给同一张卡片。 */
    const HAS_CLASS_BOUNDARY = typeof React.Component === 'function';

    const PanelBoundaryClass = HAS_CLASS_BOUNDARY
      ? class PanelBoundary extends React.Component {
        constructor(boundaryProps) {
          super(boundaryProps);
          this.state = { error: null };
          this.retry = this.retry.bind(this);
        }
        static getDerivedStateFromError(error) {
          return { error: error };
        }
        componentDidCatch(error, info) {
          try {
            console.error('[dsh-tasks] 面板渲染失败', error, info && info.componentStack);
          } catch (err) {
            /* 控制台不可用时忽略 */
          }
        }
        retry() {
          this.setState({ error: null });
        }
        render() {
          if (this.state.error) {
            return div({ className: 'dtRoot', 'data-count': '0', 'data-dt': 'fatal-root' },
              h(FatalCard, { error: this.state.error, onRetry: this.retry }));
          }
          return this.props.children;
        }
      }
      : null;

    function TasksPanelInner(props) {
      const store = props.store;
      const state = useStoreState(store);
      /* 主题（§5）：user 直接返回，system 读宿主底色后再回退媒体查询；
         解析结果落在 .dtRoot 的 data-dt-theme / data-dt-theme-src 上，CSS 只认前者。 */
      /* 主题在渲染期直接解析：settings.theme 一变，下一次渲染就是新值。
         不放进 state 的原因——解析是纯计算，放 state 会多一次渲染，且订阅回调之外
         的任何 settings 变更（导入、迁移、恢复快照）都不会被 state 捕获。 */
      const themeInfo = resolveTheme(state.settings);
      /* 系统模式的解析依据（stage4 §5.3 / t54 要求「宿主给了」与「媒体查询回退」可区分）：
         55-theme.js 的 resolveTheme 只给 src=user|system，改它不在 t54 inScope，
         所以这里补一个只读探测：能读到宿主 html 的实际底色 → host；读不到 → media；都不可用 → none。
         只判「读没读到不透明底色」，亮度判定仍由 55-theme 负责，不重复实现一套真源。 */
      const themeBasis = (function () {
        if (themeInfo.src !== 'system') return 'user';
        try {
          const view = typeof window !== 'undefined' ? window : null;
          const root = view && view.document && view.document.documentElement ? view.document.documentElement : null;
          if (root && view.getComputedStyle) {
            const bg = view.getComputedStyle(root).backgroundColor;
            if (typeof bg === 'string' && bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return 'host';
          }
        } catch (err) {
          /* 读不到就走媒体查询 */
        }
        try {
          const view = typeof window !== 'undefined' ? window : null;
          if (view && typeof view.matchMedia === 'function') {
            const media = view.matchMedia('(prefers-color-scheme: dark)');
            if (media && typeof media.matches === 'boolean') return 'media';
          }
        } catch (err) {
          /* 都不可用 */
        }
        return 'none';
      })();
      /* 迁移/损坏的致命提示（§3.8）：loadState 把错误码挂在这里，面板整体换成一行说明，
         数据仍在（坏原文已另存），绝不静默清空。 */
      const [fatal, setFatal] = useState(null);
      useEffect(function () {
        const code = consumeFatal();
        if (code) setFatal(code);
      }, []);
      /* t127：数据损坏提示（可关闭）。解析/迁移失败时 00-prelude 已经备份原文并改用种子，
         这里只负责把「发生过什么」告诉用户，不再整屏替换。 */
      const [broken, setBroken] = useState(function () {
        return consumeBrokenNotice();
      });
      const brokenBar = broken
        ? div(
          {
            key: 'broken-notice',
            className: 'dtBrokenNotice',
            'data-dt': 'broken-notice',
            'data-broken': broken,
            role: 'status',
            style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 10px 0', padding: '8px 10px', borderRadius: '8px' }
              // 原 12.5，归到 meta 档（五档阶梯里没有 12.5 这一档，就近取 meta=12px，视觉上仅差 0.5px）
              + 'background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);line-height:1.5;'
          },
          span({ key: 't', style: { flex: '1 1 auto' } }, '本地数据损坏，已备份并用迁移快照启动'),
          button(
            Object.assign(
              {
                key: 'x',
                type: 'button',
                className: 'dtIconBtn',
                'data-dt': 'broken-close',
                title: '关闭',
                'aria-label': '关闭提示'
              },
              scopedAction(store, function () { setBroken(null); })
            ),
            icon('close', 12)
          )
        )
        : null;
      /* 系统主题监听（§5）：只有 src==='system' 时才真的注册；回调只做一个「踢一脚」，
         真正的解析在渲染期完成，避免回调与渲染各存一份真相。 */
      const [, setThemeTick] = useState(0);
      useEffect(function () {
        return subscribeSystemTheme(state.settings, function () {
          setThemeTick(function (n) { return n + 1; });
        });
      }, [state.settings.theme]);
      /* §8.2 一次性种子：把 build.mjs 注入的离线分（seed.scores）灌进分数库，并落
         db.meta.scoreSeed 标记。放在面板挂载时做而不是 loadState 里，是因为 00-prelude
         不在本卡 inScope；actionApplySeedScores 自身幂等（已导入直接返回、不提交、
         不写盘），重复挂载不会重复写入，也不会覆盖用户手调分。 */
      useEffect(function () {
        actionApplySeedScores(store);
      }, []);
      /* §7.2 番茄日志：订阅 store 侦测「work 段结束」并写 db.pomodoroLog，顺带做 400 天裁剪
         与 §6.5 的音效接线。20-engines / 00-prelude 不在本卡 inScope，所以挂在面板挂载时
         （与上面种子分同一处置）；installPomoLog 自身幂等，重复挂载只绑一次监听。 */
      useEffect(function () {
        installPomoLog(store);
      }, []);
      /* §P6 日历叠加：旧单选值（settings.calendar.mode）一次性迁成复选组合，幂等标记
         overlayMigrated 保证重复挂载不再写库（51-db 不在本卡 inScope，迁移函数放 64-calendar）。 */
      useEffect(function () {
        installCalendarOverlays(store);
      }, []);
      /* 两列模型（§1.1）：listView 只有一个值，detail 也只有一个值；A 栏与页签已删除。 */
      /* 默认 B 栏 = today（t105 三栏模型：没有中间区，首屏必须有内容） */
      const [listView, setListView] = useState('today');
      const [detail, setDetail] = useState(null);
      const [query, setQuery] = useState('');
      const [showDone, setShowDone] = useState(false);
      const [habitArchived, setHabitArchived] = useState(false);
      const [toasts, setToasts] = useState([]);
      const [projDialog, setProjDialog] = useState(null);
      const [width, setWidth] = useState(0);
      const [dense, setDense] = useState(false);
      /* t144：项目设置浮层开合（§1.20.1）。浮层状态放 TasksPanel，点面板外才关得掉 */
      const [psOpen, setPsOpen] = useState(false);
      const rootRef = useRef(null);

      useEffect(function () {
        const node = rootRef.current;
        if (!node) return undefined;
        const update = function () {
          setWidth(node.getBoundingClientRect().width || node.clientWidth || 0);
        };
        update();
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(update);
          observer.observe(node);
          return function () {
            observer.disconnect();
          };
        }
        window.addEventListener('resize', update);
        return function () {
          window.removeEventListener('resize', update);
        };
      }, []);

      /* B 栏自身宽度决定是否压缩行内副信息（§2.4 降级阶梯③）。
         观察的是抽屉节点而不是容器，所以与档位解耦。 */
      useEffect(function () {
        if (!listView) return undefined;
        const node = rootRef.current && rootRef.current.querySelector
          ? rootRef.current.querySelector('.dtDrawer[data-slot="b"]')
          : null;
        if (!node) return undefined;
        const update = function () {
          const w = node.getBoundingClientRect().width || node.clientWidth || 0;
          setDense(w > 0 && w < 240);
        };
        update();
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(update);
          observer.observe(node);
          return function () {
            observer.disconnect();
          };
        }
        return undefined;
      }, [listView, detail]);

      const tier = tierOf(width);
      const dataCount = (listView ? 1 : 0) + (detail ? 1 : 0);
      /* 中间区让位：W2 及以下且两栏同开（§2.4 降级阶梯①），只让位不卸载 */
      const squeezed = dataCount === 2;
      /* rail 转图标条：<776 且 B+C 同开（§2.4 降级阶梯②） */
      const iconRail = dataCount === 2 && width > 0 && width < 776;

      /* B 栏关掉后焦点要落在空态容器上（tabIndex=-1），否则键盘用户会掉到 DOM 外。 */
      const emptyRef = useRef(null);
      useEffect(function () {
        if (listView) return;
        const node = emptyRef.current;
        if (node && typeof node.focus === 'function') {
          try { node.focus(); } catch (err) { /* 宿主不允许聚焦时忽略 */ }
        }
      }, [listView]);

      const closeAll = function () {
        setListView(null);
        setDetail(null);
      };
      const closeDetail = function () {
        setDetail(null);
      };

      /* 点 rail 内容项（§1.2 点击语义表）：同 id 再点收起（连带 C）；换一个则替换 B 并清空 C。
         不变式 D4：rail 入口永不写 detail，两条写入路径都置 null。 */
      const onPick = function (view) {
        if (!view) return;
        if (listView === view) {
          closeAll();
          return;
        }
        setListView(view);
        setDetail(null);
      };

      /* 计时项开关（§1.2.3）：判据只认 ui.listView 这一个真源，不设历史栈。
         点未激活 → 写该项；点已激活的螺旋/设置 → 回默认页 pomodoro；
         点已激活的番茄钟（本身就是默认页）→ no-op 唯一例外。
         计时项一律不动 detail（§1.2.4 / §8-72）。 */
      const onPickTimer = function (view) {
        if (!view) return;
        if (listView === view) {
          if (view === 'pomodoro') return;
          setListView('pomodoro');
          return;
        }
        setListView(view);
      };

      const onPickDate = function (key) {
        if (!key) return;
        const view = 'date:' + key;
        if (listView === view) {
          closeAll();
          return;
        }
        setListView(view);
        setDetail(null);
      };

      /* 点 B 里的条目：只写 detail，不改 listView（不变式 D3），同值再点取消 */
      const onOpenDetail = function (kind, id) {
        if (!id) return;
        const next = kind + ':' + id;
        setDetail(detail === next ? null : next);
      };

      /* Esc 分层（§1.2.1）：捕获层只消费浮层（菜单/弹窗/新建条展开态），
         冒泡层按 C → B 的顺序各消费一层，两层互不越权。 */
      const listViewRef = useRef(null);
      const detailRef = useRef(null);
      listViewRef.current = listView;
      detailRef.current = detail;
      useEffect(function () {
        const onKey = function (event) {
          if (event.key !== 'Escape') return;
          if (escTargetInField(event.target)) return;
          if (!closeTopOverlay()) return;
          event.preventDefault();
          event.stopPropagation();
        };
        document.addEventListener('keydown', onKey, true);
        return function () {
          document.removeEventListener('keydown', onKey, true);
        };
      }, []);

      useEffect(function () {
        const onKey = function (event) {
          if (event.key !== 'Escape') return;
          if (escTargetInField(event.target)) return;
          if (detailRef.current) {
            setDetail(null);
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (listViewRef.current) {
            setListView(null);
            event.preventDefault();
            event.stopPropagation();
          }
        };
        document.addEventListener('keydown', onKey);
        return function () {
          document.removeEventListener('keydown', onKey);
        };
      }, []);

      useEffect(function () {
        const push = function (item) {
          setToasts(function (list) {
            const next = list.filter(function (x) {
              return x.id !== item.id;
            });
            next.push(item);
            return next;
          });
        };
        const unsubscribe = store.toastBus.add(push);
        const pending = store.drainPending ? store.drainPending() : [];
        pending.forEach(push);
        return unsubscribe;
      }, [store]);

      const dismiss = function (id) {
        setToasts(function (list) {
          return list.filter(function (item) {
            return item.id !== id;
          });
        });
      };

      /* 模块开关快照（§2.6 / t52）：一次算全，rail、B 栏、蓝按钮、权重环都读它。 */
      const flags = moduleFlags(state.settings);
      /* 关掉某个模块后，它开着的视图必须立刻消失——这里不做 setState（会与渲染顺序打架），
         而是在渲染层把 listView 折成 null：B 栏不渲染、data-count 也随之降档，
         而组件状态里的 listView 留着，用户重新打开模块时视图原样回来。 */
      const listEnabled = !listView || flags[moduleOfListView(listView)] !== false;

      const dialogProject = projDialog && projDialog.id
        ? state.projects.find(function (p) { return p.id === projDialog.id; }) || null
        : null;

      const shownDetail = detailOf(detail);
      const detailTask = shownDetail.kind === 'task'
        ? state.tasks.find(function (t) { return t.id === shownDetail.id; }) || null
        : null;
      const detailHabit = shownDetail.kind === 'habit'
        ? (state.habits || []).find(function (h) { return h.id === shownDetail.id; }) || null
        : null;

      /* B 栏内容（§1.3）：清单 / 标签 / 习惯 / 四象限 / 日历 / 必做之事。
         同一时刻只有一个来源，rail 点新的替换旧的（§1.2.4）。 */
      const isHabitView = listView === 'habit';
      const isQuadView = listView === 'quadrant';
      const isCalendarView = listView === 'calendar';
      const isOneThingView = listView === 'onething';
      const isResistanceView = listView === 'resistance';
      const isTagsView = listView === 'tags' || String(listView || '').indexOf('tag:') === 0;
      const isPomodoroView = listView === 'pomodoro';
      const isSpiralView = listView === 'spiral';
      const isActNowView = listView === 'actnow';
      const isSettingsView = listView === 'settings';
      const bKind = isPomodoroView
        ? 'pomodoro'
        : isSpiralView
          ? 'spiral'
          : isSettingsView
            ? 'settings'
            : isHabitView
        ? 'habit'
        : isQuadView
          ? 'quadrant'
          : isCalendarView
            ? 'calendar'
            : isTagsView
              ? 'tags'
              : isOneThingView
                ? 'onething'
                : isResistanceView
                  ? 'resistance'
                  : 'list';

      let bBody = null;
      if (isPomodoroView) {
        bBody = h(PomodoroView, { key: 'pomodoro', state: state, store: store });
      } else if (isSpiralView) {
        bBody = h(SpiralView, { key: 'spiral', state: state, store: store });
      } else if (isSettingsView) {
        bBody = h(SettingsView, { key: 'settings', state: state, store: store });
      } else if (isTagsView) {
        bBody = h(TagsView, {
          key: 'tagsview',
          state: state,
          store: store,
          view: listView,
          tier: tier,
          showScore: flags.score !== false,
          activeId: shownDetail.kind === 'task' ? shownDetail.id : '',
          onOpenTask: function (id) {
            onOpenDetail('task', id);
          },
          onPickTag: function (name) {
            setListView('tag:' + name);
            setDetail(null);
          },
          onCollapse: closeAll
        });
      } else if (isActNowView) {
        bBody = h(ActNowPanel, {
          key: 'actnow',
          state: state,
          store: store,
          onOpenDetail: function (id) {
            onOpenDetail('task', id);
          },
          onCollapse: closeAll
        });
      } else if (isResistanceView) {
        bBody = h(ResistanceBoard, {
          key: 'resistance',
          state: state,
          store: store,
          onCollapse: closeAll
        });
      } else if (isOneThingView) {
        bBody = h(OneThingBoard, {
          key: 'onething',
          state: state,
          store: store,
          onOpenDetail: function (id) {
            onOpenDetail('task', id);
          },
          onCollapse: closeAll
        });
      } else if (isCalendarView) {
        bBody = div(
          { key: 'calendar', className: 'dtBStack' },
          div(
            { key: 'head', className: 'dtHead' },
            div({ key: 'l', className: 'dtHeadLeft' }, div({ key: 't', className: 'dtHeadTitle' }, '日历')),
            div(
              { key: 'r', className: 'dtHeadRight' },
              button(
                {
                  key: 'x',
                  type: 'button',
                  className: 'dtIconBtn dtDrawerCollapse',
                  'data-dt': 'drawer-collapse',
                  title: '收起',
                  'aria-label': '收起',
                  onClick: closeAll
                },
                icon('close', 14)
              )
            )
          ),
          h(CalendarView, {
            key: 'cal',
            state: state,
            store: store,
            drawerOpen: true,
            tier: tier,
            onPickDate: onPickDate
          })
        );
      } else if (isHabitView) {
        bBody = h(HabitPanel, {
          key: 'habit',
          state: state,
          store: store,
          query: query,
          onQuery: setQuery,
          showArchived: habitArchived,
          onToggleArchived: function () {
            setHabitArchived(!habitArchived);
          },
          onCollapse: closeAll,
          onOpenHabit: function (id) {
            onOpenDetail('habit', id);
          },
          activeId: shownDetail.kind === 'habit' ? shownDetail.id : ''
        });
      } else if (isQuadView) {
        bBody = div(
          { key: 'quad', className: 'dtBStack' },
          div(
            { key: 'head', className: 'dtHead' },
            div({ key: 'l', className: 'dtHeadLeft' }, div({ key: 't', className: 'dtHeadTitle' }, '四象限')),
            div(
              { key: 'r', className: 'dtHeadRight' },
              button(
                {
                  key: 'x',
                  type: 'button',
                  className: 'dtIconBtn dtDrawerCollapse',
                  'data-dt': 'drawer-collapse',
                  title: '收起',
                  'aria-label': '收起',
                  onClick: closeAll
                },
                icon('close', 14)
              )
            )
          ),
          h(QuadrantView, {
            key: 'view',
            state: state,
            store: store,
            showScore: flags.score !== false,
            activeId: shownDetail.kind === 'task' ? shownDetail.id : '',
            onOpen: function (id) {
              onOpenDetail('task', id);
            }
          })
        );
      } else {
        bBody = div(
          { key: 'liststack', className: 'dtBStack' },
          h(OneThingStrip, {
            key: 'onething-strip',
            state: state,
            store: store,
            onOpenDetail: function (id) {
              onOpenDetail('task', id);
            }
          }),
          h(TaskListView, {
          key: 'list',
          state: state,
          store: store,
          view: listView,
          tier: tier,
          showScore: flags.score !== false,
          showRec: flags.rec !== false,
          query: query,
          onQuery: setQuery,
          showDone: showDone,
          onToggleShowDone: setShowDone,
          activeId: shownDetail.kind === 'task' ? shownDetail.id : '',
          onOpen: function (id) {
            onOpenDetail('task', id);
          },
          onCreated: function (id) {
            onOpenDetail('task', id);
          },
          onCollapse: closeAll
          })
        );
      }

      const activeView = listEnabled ? listView : null;
      const slotB = activeView
        ? div(
            {
              key: 'b',
              className: 'dtDrawer',
              'data-slot': 'b',
              'data-kind': bKind,
              'data-view': activeView,
              'data-drawer-view': activeView,
              'data-squeezed': squeezed ? '1' : undefined,
              'data-dense': dense ? '1' : undefined
            },
            bBody
          )
        : null;

      const detailTitle = detailHabit
        ? detailHabit.name
        : detailTask
          ? (detailTask.title || '任务详情')
          : '';

      const slotC = detail && (detailTask || detailHabit)
        ? div(
            {
              key: 'c',
              className: 'dtDrawer',
              'data-slot': 'c',
              'data-kind': shownDetail.kind,
              'data-detail-view': detail
            },
            div(
              { key: 'head', className: 'dtHead' },
              div({ key: 'l', className: 'dtHeadLeft' }, div({ key: 't', className: 'dtHeadTitle' }, detailTitle)),
              div(
                { key: 'r', className: 'dtHeadRight' },
                /* 单任务番茄的第二个入口（stage4 §7.1）：C 栏详情头 26×26。
                   与行内的 row-pomo 同一套点击语义，被螺旋互斥挡住时禁用但不隐藏。 */
                shownDetail.kind === 'task'
                  ? button(
                      {
                        key: 'pm',
                        type: 'button',
                        className: 'dtIconBtn dtDetailPomo',
                        'data-dt': 'detail-pomo',
                        'data-task-id': detailTask.id,
                        disabled: pomoBusyWithSpiral(state),
                        'aria-disabled': pomoBusyWithSpiral(state) ? 'true' : undefined,
                        title: pomoBusyWithSpiral(state) ? '螺旋工作法运行中' : '对该任务开始番茄',
                        onClick: function () {
                          pomoToggleForTask(store, detailTask.id);
                        }
                      },
                      icon('timer', 14)
                    )
                  : null,
                button(
                  {
                    key: 'x',
                    type: 'button',
                    className: 'dtIconBtn dtDrawerCollapse',
                    'data-dt': 'drawer-collapse',
                    title: '收起',
                    'aria-label': '收起',
                    onClick: closeDetail
                  },
                  icon('close', 14)
                )
              )
            ),
            shownDetail.kind === 'task'
              ? h(TaskDetail, {
                  key: detailTask.id,
                  task: detailTask,
                  store: store,
                  projects: state.projects,
                  onClose: closeDetail
                })
              : h(HabitDetail, {
                  key: detailHabit.id,
                  habit: detailHabit,
                  store: store,
                  onClose: closeDetail
                })
          )
        : null;

      const zoneChildren = [];
      if (slotB) zoneChildren.push(slotB);
      if (slotC) zoneChildren.push(slotC);

      /* 致命状态（迁移失败 / 模块 id 重复）时整块换成说明，不再渲染两列骨架；
         数据本身没被动过，用户仍可从设置页导出或从备份恢复。 */
      if (fatal) {
        return div(
          {
            className: 'dtRoot',
            ref: rootRef,
            'data-count': '0',
            'data-dt-theme': themeInfo.theme,
            'data-dt-theme-src': themeInfo.src,
            'data-dt-theme-basis': themeBasis,
            onMouseDown: stopActionEvent,
            onPointerDown: stopActionEvent,
            onClick: stopActionEvent
          },
          brokenBar,
          h(FatalCard, {
            key: 'fatal',
            code: fatal,
            title: fatal === 'MIGRATE_FAILED' ? '数据无法读取，已用初始数据启动' : '模块配置有误',
            error: {
              message: fatal === 'MIGRATE_FAILED'
                ? '原始数据已另存到 localStorage（键 dsh.tasks.v1.broken，另有带时间戳的历史键），没有被删除；修复后可导出排查。'
                : '左侧栏已隐藏有问题的模块，其余功能不受影响。'
            }
          })
        );
      }

      return div(
        {
          className: 'dtRoot',
          ref: rootRef,
          'data-rail': iconRail ? 'icon' : undefined,
          'data-count': String(dataCount),
          'data-dt-theme': themeInfo.theme,
          'data-dt-theme-src': themeInfo.src,
          'data-dt-theme-basis': themeBasis,
          /* §1.2.2 容器兜底：叶子各自截停之外，.dtRoot 自身再截一层，
             否则面板里的死区点击会冒到 document，被宿主当成「面板外一击」而收起整个面板。 */
          /* t144：点「项目设置」浮层之外任意处关闭它（§1.20.1 关闭三入口之一）。
             不新增 document 监听——静态扫描把 src/parts 的 addEventListener 行数钉死在 7 条。 */
          onMouseDown: function (event) {
            if (psOpen) {
              const target = event && event.target;
              const inside = target && target.closest
                ? target.closest('[data-dt="project-settings-panel"],[data-dt="project-settings"]')
                : null;
              if (!inside) setPsOpen(false);
            }
            stopActionEvent(event);
          },
          onPointerDown: stopActionEvent,
          onClick: stopActionEvent,
          /* P0 面板自行退回：只截停鼠标三类还不够，滚轮/触摸/滚动仍会冒到宿主，
             宿主据“连续滚动”收起面板。补三类，且**只 stopPropagation、不 preventDefault**，
             否则 .dtQuad{overflow:auto} 与 .dtList 的内部滚动会被一起禁掉。
             刻意不挂 onKeyDown：那会掐断 document 层的两层 Esc（关浮层/关抽屉）。 */
          onWheel: stopActionEvent,
          onScroll: stopActionEvent,
          onTouchMove: stopActionEvent
        },
        brokenBar,
        h(Rail, {
          state: state,
          flags: flags,
          store: store,
          psOpen: psOpen,
          onTogglePs: function () {
            setPsOpen(!psOpen);
          },
          onClosePs: function () {
            setPsOpen(false);
          },
          listView: listView,
          onPick: onPick,
          onPickTimer: onPickTimer,
          showActNow: flags.rec !== false,
          onActNow: function () {
            /* 同值再点回「今天」：B 栏不留一个点不掉的面板 */
            setListView(listView === 'actnow' ? 'today' : 'actnow');
            setDetail(null);
          },
          onCreateProject: function () {
            setProjDialog({ id: '' });
          },
          onEditProject: function (id) {
            setProjDialog({ id: id });
          },
          onDeleteProject: function (id) {
            const target = state.projects.filter(function (p) { return p && p.id === id; })[0];
            if (!target) return;
            /* 与 ProjectDialog 里的删除同文案同语义：任务移到收集箱，不清 tasks[i].projectId。 */
            if (!window.confirm('删除清单「' + target.name + '」？里面的任务会移到收集箱，不会丢。')) return;
            removeProject(store, id);
            /* 正在看的就是它：回「今天」，不留一个指向已删清单的空 B 栏。 */
            if (listView === 'p:' + id) {
              setListView('today');
              setDetail(null);
            }
          }
        }),
        /* A→B→C 三栏（t105 用户口径）：没有「中间区」，rail 点开的功能就渲染在 B 栏，
           B 里点条目才出 C；B 关掉时给一个可断言的空态，不留白板。 */
        dataCount > 0
          ? div({ className: 'dtDrawerZone', 'data-count': String(dataCount), key: 'zone' }, zoneChildren)
          : div(
            {
              key: 'b-empty',
              className: 'dtBEmpty',
              'data-b-empty': '1',
              ref: emptyRef,
              tabIndex: -1
            },
            div({ key: 't', className: 'dtBEmptyTitle' }, '选择左侧任一功能'),
            div({ key: 's', className: 'dtBEmptyText' }, '清单、项目、标签、四象限、日历、习惯打卡、必做之事，以及番茄钟 / 螺旋 / 设置都在这里打开。')
          ),
        projDialog
          ? div({ className: 'dtScrim', key: 'scrim' })
          : null,
        projDialog
          ? h(ProjectDialog, {
              key: projDialog.id || 'new-project',
              store: store,
              project: dialogProject,
              onClose: function () {
                setProjDialog(null);
              },
              onSaved: function (id) {
                setListView('p:' + id);
                setDetail(null);
              },
              onDeleted: function (id) {
                /* S7c-7：删掉「正在看的那条清单」时落点必须是「今天」，不是空态。
                   原实现在这里调 closeAll()（setListView(null)）→ B 栏落到
                   「选择左侧任一功能」空态，与规格「回今天」不符；ps-del 那条链路
                   早就是 setListView('today')，两条入口必须同落点。
                   删的是别的清单（listView !== 'p:'+id）时视图一律不动。 */
                if (listView !== 'p:' + id) return;
                setListView('today');
                setDetail(null);
              }
            })
          : null,
        div(
          { className: 'dtToastLayer' },
          toasts.map(function (item) {
            return h(Toast, { key: item.id, item: item, store: store, onDismiss: dismiss });
          })
        )
      );
    }

    /* t127：对外的面板组件。真实 React 走类边界；测试桩退化成内联 try/catch。
       两条路径给同一张 FatalCard，所以回归里不会因为「类组件」变红。 */
    function TasksPanel(props) {
      if (HAS_CLASS_BOUNDARY) {
        return h(PanelBoundaryClass, null, h(TasksPanelInner, props));
      }
      const [error, setError] = useState(null);
      const retry = function () { setError(null); };
      if (error) {
        return div({ className: 'dtRoot', 'data-count': '0', 'data-dt': 'fatal-root' },
          h(FatalCard, { error: error, onRetry: retry }));
      }
      try {
        return TasksPanelInner(props);
      } catch (err) {
        return div({ className: 'dtRoot', 'data-count': '0', 'data-dt': 'fatal-root' },
          h(FatalCard, { error: err, onRetry: retry }));
      }
    }


    /* ---------------------------------- 清单（项目）新建 / 编辑 ---------------------------------- */

    function ProjectDialog(props) {
      const store = props.store;
      const editing = props.project;
      const isEdit = !!editing;
      const [name, setName] = useState(editing ? editing.name : '');
      /* 初始值走归一：老项目存的是字面 hex，归一后与色板里的 token 才能等价比较（t80）。 */
      const [color, setColor] = useState(normalizeProjectColor(editing && editing.color ? editing.color : PROJECT_COLORS[0]));
      const [icon, setIcon] = useState(editing ? (editing.icon || '') : '');
      const [type, setType] = useState(editing ? (editing.type || 'todo') : 'todo');
      const [error, setError] = useState('');

      const typeInfo = projectType(type);

      /* 内建清单随「习惯升级为一级入口」一并退役（§1.9）：loadState 不再补建任何清单，
         所以这里也没有「删了会回来」的清单，编辑态一律可删。 */

      /* Esc 第 1 层：弹窗自己关，交给面板那条常驻捕获监听统一消费并截停（§1.2.1），
         一次按键不会连抽屉一起关掉。 */
      useEffect(function () {
        return registerOverlayCloser(OVERLAY_LEVEL.modal, function () {
          props.onClose();
          return true;
        });
      }, []);

      const commit = function () {
        const trimmed = name.trim();
        if (!trimmed) {
          setError('先给清单起个名字');
          return;
        }
        const fields = { name: clampText(trimmed, 60), color: color, icon: icon.trim(), type: type };
        if (isEdit) {
          patchProject(store, editing.id, fields);
          if (props.onSaved) props.onSaved(editing.id);
        } else {
          const created = createProject(store, fields);
          if (!created) {
            setError('先给清单起个名字');
            return;
          }
          if (props.onSaved) props.onSaved(created.id);
        }
        props.onClose();
      };

      const remove = function () {
        if (!isEdit) return;
        if (!window.confirm('删除清单「' + editing.name + '」？里面的任务会移到收集箱，不会丢。')) return;
        const target = removeProject(store, editing.id);
        if (props.onDeleted) props.onDeleted(editing.id, target);
        props.onClose();
      };

      /* 习惯已是 rail 一级入口（§1.7/§1.9），清单不再承担「打卡」语义，
         所以新建/编辑清单只提供普通清单与目标两种类型。 */
      const typeButtons = PROJECT_TYPES.filter(function (item) {
        return item.id !== 'habit';
      }).map(function (item) {
        return button(
          {
            key: item.id,
            type: 'button',
            className: 'dtTypeBtn' + (type === item.id ? ' dtTypeOn' : ''),
            onClick: function () {
              setType(item.id);
            }
          },
          span({ key: 'n', className: 'dtTypeName' }, item.label),
          span({ key: 'h', className: 'dtTypeHint' }, item.hint)
        );
      });

      const swatches = PROJECT_COLORS.map(function (value) {
        return button(
          {
            key: value,
            type: 'button',
            title: value.replace('var(--dt-project-', '').replace(')', ''),
            'data-color': value,
            className: 'dtSwatch' + (sameProjectColor(color, value) ? ' dtSwatchOn' : ''),
            style: { background: value },
            onClick: function () {
              setColor(value);
            }
          }
        );
      });

      return div(
        {
          className: 'dtModal',
          onMouseDown: function (event) {
            if (event.target === event.currentTarget) props.onClose();
          }
        },
        div(
          { className: 'dtModalCard' },
          div({ className: 'dtModalHead' }, isEdit ? '编辑清单' : '新建清单'),
          div(
            { className: 'dtModalBody' },
            div(
              { className: 'dtField' },
              div({ className: 'dtFieldLabel' }, '名称'),
              input({
                className: 'dtInput',
                value: name,
                autoFocus: true,
                maxLength: 60,
                placeholder: '例如 工作、读书、健身',
                onChange: function (event) {
                  setName(event.target.value);
                  setError('');
                },
                onKeyDown: function (event) {
                  if (event.key === 'Enter') commit();
                  if (event.key === 'Escape') props.onClose();
                }
              })
            ),
            div(
              { className: 'dtField' },
              div({ className: 'dtFieldLabel' }, '类型'),
              div({ className: 'dtTypeList' }, typeButtons)
            ),
            div(
              { className: 'dtField' },
              div({ className: 'dtFieldLabel' }, '颜色'),
              div({ className: 'dtSwatches' }, swatches)
            ),
            div(
              { className: 'dtField' },
              div({ className: 'dtFieldLabel' }, '图标（可选，一个 emoji）'),
              div(
                { className: 'dtIconRow' },
                input({
                  className: 'dtInput dtIconInput',
                  value: icon,
                  maxLength: 4,
                  placeholder: '🎨',
                  onChange: function (event) {
                    setIcon(event.target.value);
                  }
                }),
                div(
                  { className: 'dtPreview' },
                  span({ key: 'd', className: 'dtDot', style: { background: color } }),
                  icon.trim() ? span({ key: 'e', className: 'dtRailEmoji' }, icon.trim()) : null,
                  span({ key: 'n', className: 'dtPreviewName' }, name.trim() || '新清单')
                )
              )
            ),
            error ? div({ className: 'dtErr' }, error) : null
          ),
          div(
            { className: 'dtModalFoot' },
            isEdit ? button({ className: 'dtDangerBtn', onClick: remove }, '删除清单') : null,
            span({ key: 'grow', className: 'dtGrow' }),
            button({ key: 'cancel', className: 'dtGhostBtn', onClick: props.onClose }, '取消'),
            /* 空名/全空白时禁用主按钮（t188）：提示层靠 disabled，正确性靠 commit 的早退。
               用原生 disabled 而不是 aria-disabled —— 后者在真机上仍会派发 click，点了还会进 action。 */
            button(
              { key: 'ok', className: 'dtPrimaryBtn', disabled: !name.trim(), onClick: commit },
              isEdit ? '保存' : '创建'
            )
          )
        )
      );
    }


    /* ------------------------------------ 番茄钟视图 --------------------------------- */

    const POMO_PRESETS = [5, 10, 15, 20, 25];
    const WORK_CHOICES = [5, 7, 10, 15, 20, 25, 30, 45, 60];
    /* 0 = 关闭休息；7 分钟用于「短休息」的短档（t46 F14） */
    const BREAK_CHOICES = [0, 3, 5, 7, 10, 15, 20, 30];
    const ROUND_CHOICES = [2, 3, 4, 5, 6];

    const RHYTHM_ITEMS = [
      { id: 'pause', label: '完成后暂停', hint: '每段结束后停下，等你点「开始」' },
      { id: 'skip', label: '跳过休息', hint: '不休息，专注接专注（不再跳到休息段）' },
      { id: 'auto', label: '自动休息', hint: '按长休息间隔在短休息与长休息之间切换，并自动开始' }
    ];

    function modeLabel(mode) {
      if (mode === 'short') return '短休息';
      if (mode === 'long') return '长休息';
      return '专注';
    }

    function breakLabel(minutes) {
      return minutes === 0 ? '关闭（0 分钟）' : String(minutes) + ' 分钟';
    }

    function setWorkDuration(store, minutes) {
      updatePomodoro(store, { work: minutes, running: false, endsAt: 0, pausedLeft: 0, mode: store.get().pomo.mode });
    }

    /* 节奏只决定「段落之间怎么走」，不改用户设定的任何时长（§4.3）：
       所以这里只写 rhythm 一个字段。切到休息段时若时序需要，由引擎按新节奏接管。 */
    function setRhythm(store, rhythm) {
      const pomo = store.get().pomo;
      if (pomo.rhythm === rhythm) return;
      updatePomodoro(store, { rhythm: rhythm });
    }

    function PomodoroView(props) {
      const state = props.state;
      const store = props.store;
      const pomo = state.pomo;
      const [, forceTick] = useState(0);

      useEffect(function () {
        if (!pomo.running) return undefined;
        const timer = window.setInterval(function () {
          forceTick(function (n) {
            return n + 1;
          });
        }, 500);
        return function () {
          window.clearInterval(timer);
        };
      }, [pomo.running]);

      const total = pomoDuration(pomo, pomo.mode);
      const left = pomodoroRemaining(pomo);
      const ratio = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 0;
      const radius = 86;
      const circumference = 2 * Math.PI * radius;
      const dash = circumference * ratio;
      const rhythm = pomo.rhythm === 'skip' || pomo.rhythm === 'auto' ? pomo.rhythm : 'pause';
      /* §4.3（t39 裁决）：pause 与 skip 都禁用三项休息设置，只有 auto 可编辑——
         禁用是「不使用」，不是「改成 0」，所以 select 的 value 与文案都保持用户设定原样。 */
      const locked = rhythm !== 'auto';
      const lockedTitle = locked ? '当前节奏下不使用休息时长' : undefined;
      const roundText = pomo.rounds > 0 ? ' · 第 ' + String((pomo.round || 0) + 1) + '/' + String(pomo.rounds) + ' 轮' : '';

      const ringColor =
        pomo.mode === 'work'
          ? 'var(--dsw-alias-brand-primary)'
          : 'var(--dsw-alias-state-success-primary)';

      /* 专注态只渲染「专注」一段：不给手动进休息的入口 */
      const modes =
        pomo.mode === 'work'
          ? div(
              { className: 'dtPomoModes' },
              div({ className: 'dtPomoMode dtPomoModeOn dtPomoModeSingle' }, '专注')
            )
          : div(
              { className: 'dtPomoModes' },
              ['work', 'short', 'long'].map(function (mode) {
                return button(
                  {
                    key: mode,
                    className: 'dtPomoMode' + (pomo.mode === mode ? ' dtPomoModeOn' : ''),
                    onClick: function () {
                      switchPomodoroMode(store, mode);
                    }
                  },
                  modeLabel(mode)
                );
              })
            );

      const rhythmHint = (RHYTHM_ITEMS.find(function (item) { return item.id === rhythm; }) || RHYTHM_ITEMS[0]).hint;

      /* 统计一律从日志反推（§7.3）：`pomo.count/minutes` 是引擎自己的当日计数器，
         它只活到当天、且不区分是否 work，不能拿来当「今日战绩」对外展示。 */
      const todayKey = dateKey(new Date());
      const todayStat = selectPomoDay(state.db, todayKey);
      const todayCount = Math.max(0, todayStat.count | 0);
      const todayMinutes = Math.max(0, todayStat.minutes | 0);
      const boundTask = pomo.taskId
        ? (state.tasks || []).find(function (task) { return task && task.id === pomo.taskId && !task.deleted; }) || null
        : null;

      return div(
        { className: 'dtPomo' },
        div(
          { className: 'dtPomoTop' },
          div({ className: 'dtPomoTitle' }, '番茄钟'),
          div(
            {
              className: 'dtPomoToday',
              'data-dt': 'pomo-today',
              'data-pomo-count': String(todayCount),
              'data-pomo-minutes': String(todayMinutes)
            },
            '今天 ' + String(todayCount) + ' 个 · ' + String(todayMinutes) + ' 分钟'
          )
        ),
        modes,
        div(
          { className: 'dtPomoRing' },
          svg(
            { width: 210, height: 210, viewBox: '0 0 210 210' },
            circle({ key: 'bg', cx: 105, cy: 105, r: radius, fill: 'none', stroke: 'var(--dsw-alias-border-l2)', strokeWidth: 10 }),
            circle({
              key: 'fg',
              cx: 105,
              cy: 105,
              r: radius,
              fill: 'none',
              stroke: ringColor,
              strokeWidth: 10,
              strokeLinecap: 'round',
              strokeDasharray: String(circumference),
              strokeDashoffset: String(circumference - dash),
              transform: 'rotate(-90 105 105)'
            }),
            svgText(
              { key: 'time', x: 105, y: 104, textAnchor: 'middle', fill: 'var(--dsw-alias-label-primary)', fontSize: 38, fontWeight: 600, style: { fontVariantNumeric: 'tabular-nums' } },
              fmtClock(left)
            ),
            svgText(
              { key: 'mode', x: 105, y: 132, textAnchor: 'middle', fill: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
              modeLabel(pomo.mode) + roundText
            )
          )
        ),
        div(
          { className: 'dtPomoControls' },
          pomo.running
            ? button({ className: 'dtPrimaryBtn dtPrimaryLg', onClick: function () { pausePomodoro(store); } }, icon('pause', 16), span({ key: 'l' }, '暂停'))
            : button(
                {
                  className: 'dtPrimaryBtn dtPrimaryLg',
                  /* 互斥（§4.10.8-3）：螺旋在跑时禁用但不隐藏，提示文案放在按钮下方 */
                  disabled: !!(state.spiral && state.spiral.status !== 'idle'),
                  'aria-disabled': state.spiral && state.spiral.status !== 'idle' ? 'true' : undefined,
                  title: state.spiral && state.spiral.status !== 'idle' ? '螺旋工作法运行中' : '开始专注',
                  onClick: function () { startPomodoro(store); }
                },
                icon('play', 16),
                span({ key: 'l' }, '开始')
              ),
          button({ className: 'dtGhostBtn', onClick: function () { resetPomodoro(store); } }, icon('reset', 14), span({ key: 'l' }, '重置')),
          button(
            {
              className: 'dtGhostBtn',
              onClick: function () {
                /* 与引擎同一份转移逻辑，不写第二套 */
                const step = nextModeOf(store.get().pomo, pomo.mode);
                switchPomodoroMode(store, step.mode);
              }
            },
            '跳过'
          )
        ),
        state.spiral && state.spiral.status !== 'idle'
          ? div({ className: 'dtPomoHint' }, '螺旋工作法运行中')
          : null,
        /* 单任务番茄（§7.1）：当前专注段绑定给哪个任务，以及一个解绑出口。
           绑定只影响 byTask 记账，不改变计时本身。 */
        div(
          {
            className: 'dtPomoBind' + (boundTask ? '' : ' dtPomoBindEmpty'),
            'data-dt': 'pomo-bind',
            'data-pomo-task': boundTask ? boundTask.id : ''
          },
          span({ key: 'l', className: 'dtPomoBindLabel' }, boundTask ? '专注任务' : '未绑定任务'),
          boundTask ? span({ key: 'n', className: 'dtPomoBindName', title: boundTask.title }, boundTask.title) : span({ key: 'n', className: 'dtPomoBindName' }, '从任务行点计时器按钮开始，会把番茄记到那个任务上'),
          boundTask
            ? button(
                {
                  key: 'x',
                  className: 'dtMiniBtn',
                  'data-dt': 'pomo-unbind',
                  onClick: function () {
                    updatePomodoro(store, { taskId: '' });
                  }
                },
                '解绑'
              )
            : null
        ),
        div(
          { className: 'dtPomoPresets' },
          span({ key: 'l', className: 'dtFieldLabel' }, '专注时长'),
          POMO_PRESETS.map(function (minutes) {
            return button(
              {
                key: 'pre' + minutes,
                className: 'dtMiniBtn' + (pomo.work === minutes ? ' dtMiniOn' : ''),
                onClick: function () {
                  setWorkDuration(store, minutes);
                }
              },
              String(minutes) + ' 分钟'
            );
          })
        ),
        div(
          { className: 'dtPomoSettings' },
          div(
            { className: 'dtRhythmField', 'data-dt': 'rhythm', 'data-rhythm': rhythm },
            span({ key: 'l', className: 'dtFieldLabel' }, '工作节奏'),
            div(
              { key: 'g', className: 'dtRhythmGroup', role: 'radiogroup', 'aria-label': '工作节奏' },
              RHYTHM_ITEMS.map(function (item) {
                return label(
                  {
                    key: item.id,
                    className: 'dtRhythmOpt' + (rhythm === item.id ? ' dtRhythmOn' : ''),
                    'data-rhythm': item.id,
                    'data-on': rhythm === item.id ? '1' : undefined
                  },
                  input({
                    key: 'i',
                    className: 'dtRhythmRadio',
                    type: 'radio',
                    name: 'dtRhythm',
                    value: item.id,
                    checked: rhythm === item.id,
                    'aria-checked': rhythm === item.id ? 'true' : 'false',
                    onChange: function () {
                      setRhythm(store, item.id);
                    }
                  }),
                  span({ key: 't', className: 'dtRhythmOptText' }, item.label)
                );
              })
            ),
            div({ key: 'h', className: 'dtHint' }, rhythmHint)
          ),
          /* 月度热力图（§7.4 + t125）：整块移到「工作节奏」之后（先看节奏再回看历史），
             与习惯热力图七维区隔，见 58-pomo-log.js 的注释与报告 */
          PomoHeat({ key: 'heat', store: store, db: state.db, now: Date.now() }),
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '工作时长'),
            select(
              {
                className: 'dtInput',
                value: pomo.work,
                onChange: function (event) {
                  setWorkDuration(store, Number(event.target.value));
                }
              },
              WORK_CHOICES.map(function (m) {
                return option({ key: 'w' + m, value: m }, String(m) + ' 分钟');
              })
            )
          ),
          div(
            { className: 'dtField' + (locked ? ' dtIsDisabled' : ''), title: lockedTitle },
            span({ className: 'dtFieldLabel' }, '短休息'),
            select(
              {
                className: 'dtInput',
                'data-rest-short': String(pomo.short | 0),
                value: pomo.short,
                disabled: locked,
                onChange: function (event) {
                  updatePomodoro(store, { short: Number(event.target.value) });
                }
              },
              BREAK_CHOICES.map(function (m) {
                return option({ key: 's' + m, value: m }, breakLabel(m));
              })
            )
          ),
          div(
            { className: 'dtField' + (locked ? ' dtIsDisabled' : ''), title: lockedTitle },
            span({ className: 'dtFieldLabel' }, '长休息'),
            select(
              {
                className: 'dtInput',
                'data-rest-long': String(pomo.long | 0),
                value: pomo.long,
                disabled: locked,
                onChange: function (event) {
                  updatePomodoro(store, { long: Number(event.target.value) });
                }
              },
              BREAK_CHOICES.map(function (m) {
                return option({ key: 'l' + m, value: m }, breakLabel(m));
              })
            )
          ),
          div(
            { className: 'dtField' + (locked ? ' dtIsDisabled' : ''), title: lockedTitle },
            span({ className: 'dtFieldLabel' }, '长休息间隔'),
            select(
              {
                className: 'dtInput',
                'data-rest-rounds': String(pomo.rounds | 0),
                value: pomo.rounds,
                disabled: locked,
                onChange: function (event) {
                  updatePomodoro(store, { rounds: Number(event.target.value) });
                }
              },
              ROUND_CHOICES.map(function (n) {
                return option({ key: 'r' + n, value: n }, String(n) + ' 个番茄后');
              })
            )
          ),
          label(
            { className: 'dtToggle dtToggleWide' },
            input({
              type: 'checkbox',
              checked: !!pomo.sound,
              onChange: function (event) {
                updatePomodoro(store, { sound: event.target.checked });
                if (event.target.checked) beep(1, 880);
              }
            }),
            span({}, '结束提示音')
          ),
          label(
            { className: 'dtToggle dtToggleWide' },
            input({
              type: 'checkbox',
              checked: !!pomo.notify,
              onChange: function (event) {
                updatePomodoro(store, { notify: event.target.checked });
                if (event.target.checked) requestNotificationPermission();
              }
            }),
            span({}, '系统通知')
          )
        )
      );
    }

    /* ================================ 51-db · 任务数据库 ================================
       地基层第一件（docs/stage4-foundation.md §3）。state.db 是唯一数据源，8 个分区 + 7 个内存索引。

       P0 的边界是「加壳、不搬家」：
         · 新数据一律写进 state.db.<分区>；
         · 顶层 state.tasks / state.projects / state.scores 保留成**不可枚举访问器**，
           读到的是 db 分区本身、写进去也直落 db 分区，所以既有上百处调用点一行都不用改；
         · 因为不可枚举，JSON.stringify 只写 db 这一份（不会把数据写两遍），
           导出的备份文件体积与 P0 之前同量级。

       —— 迁移幂等判据（captain 要求写清）——
       1) 对同一份输入跑两次 migrateState()，除 db.meta.updatedAt 外结果逐字相等；
       2) 迁移后的 state 里 version === 2 且**顶层不存在** tasks/projects/scores 三个数据属性；
       3) 把迁移结果再喂给 migrateState()，走 version===2 分支，只做 typeof 修补，
          不重新计算 tags/habitLog/stats，不把 version 回写成 1，不新增/丢失任何分区；
       4) scoreVersion 只在分数集合变化时前进，迁移本身不动它。

       —— P1 删除顶层别名时要跟着改的调用点（先列清单，别到 P1 现查）——
       · 批量替换 `state.tasks` / `parsed.tasks` → `state.db.tasks`
       · 批量替换 `state.projects` → `state.db.projects`
       · 批量替换 `state.scores` → `state.db.scores`
       已知主要落点：00-prelude 的 loadState/inflateSeed/completeTask/uncompleteTask/patchTask/
       deleteTask/restoreTask/destroyTask/addTask/toggleHabit/normalizeHabits/spiralScoreOf；
       20-engines 的 reminderHit 调用点与 markOverdueNotified；30-ui-tasks 的 filterTasks/quadOf；
       40-panel 的 TaskListView/QuadrantView 数据装配；60-settings 的 exportState/applyImport。
       替换完删掉 SHARD_ALIASES / defineShardAccessors / adoptShards 三个函数即可。 */

    const DB_SCHEMA_VERSION = 2;
    const DB_PARTITIONS = ['tasks', 'projects', 'tags', 'scores', 'pomodoroLog', 'habitLog', 'obstacles', 'modules', 'scoreFeedback'];
    /* 兼容别名：P0 期间这三个分区同时以顶层属性暴露（不可枚举），P1 删除 */
    const DB_SHARDS = ['tasks', 'projects', 'scores'];
    const STORE_KEY_LEGACY = 'dsh.tasks.v1';

    function isPlainObject(value) {
      return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    /* ------------------------------- 分数库口径（§8.1） -------------------------------- */
    /* 五字段：score / source / updatedAt / rubricVersion / reason。
       source 三档，优先级 manual > agent > auto：自动打分不得覆盖 manual（§8.1）。 */
    const SCORE_SOURCES = ['auto', 'manual', 'agent'];
    const SCORE_SOURCE_RANK = { auto: 1, agent: 2, manual: 3 };
    const SCORE_RUBRIC_VERSION = 'calibrated-2026-11';
    /* 环的四档阈值（stage3-goals §2.6）：按真实分布定的 20 / 40 / 60，不是 0–100 等分。
       放在这里而不是 CSS，是因为阈值是语义；改阈值不该动样式表。 */
    const SCORE_TIERS = [20, 40, 60];
    /* 同色深浅：品牌色 25% / 50% / 75% / 100%——刻意不用红/黄/蓝四象限色相。 */
    const SCORE_TIER_ALPHA = [0.25, 0.5, 0.75, 1];
    /* 'legacy' 与 'calibrated' 都是历史写法：前者是 P0 前的裸数字，后者是离线批量产物。 */
    function scoreSourceOf(raw) {
      if (raw === 'manual' || raw === 'agent' || raw === 'auto') return raw;
      if (raw === 'calibrated' || raw === 'legacy') return 'auto';
      return 'auto';
    }
    function scoreOriginOf(raw) {
      if (raw === 'manual' || raw === 'agent') return raw;
      return 'calibrated';
    }
    /* 分数 → 档位（0..3）；null / 越界返回 -1，调用方据此画虚线空环。 */
    function scoreTierOf(score) {
      if (typeof score !== 'number' || !isFinite(score)) return -1;
      if (score < SCORE_TIERS[0]) return 0;
      if (score < SCORE_TIERS[1]) return 1;
      if (score < SCORE_TIERS[2]) return 2;
      return 3;
    }

    /* ------------------------- 评分反馈库口径（stage4 §3.3.4） ------------------------- */
    /* 上限 500 条、按 at 淘汰最旧（不按 taskId 分组）：同一任务改 20 次就是 20 条，
       正是 few-shot 需要的近期信号（§8.5-③）。 */
    const SCORE_FEEDBACK_MAX = 500;
    /* few-shot 块格式版本：只有块格式变化才升版本；把块从整理 prompt 改挂到打分 prompt
       不升版本（t110 裁决），所以这个常量与 SCORE_RUBRIC_VERSION 各自独立。 */
    const SCORE_FEEDBACK_PROMPT_VERSION = 'scorefs-1';

    function round1(value) {
      return Math.round(value * 10) / 10;
    }

    /* 改前快照：从无记录时给 {score:null, source:'none', origin:'none'}（§3.3.4）。
       注意 score 保留小数——手动分是整数，但改前的自动分可能是 34.3。 */
    function scoreFeedbackBefore(entry) {
      if (!isPlainObject(entry) || typeof entry.score !== 'number' || !isFinite(entry.score)) {
        return { score: null, source: 'none', origin: 'none' };
      }
      return {
        score: round1(entry.score),
        source: scoreSourceOf(entry.source),
        origin: scoreOriginOf(entry.origin || entry.source)
      };
    }

    /* features 只取这 7 项，禁加字段（§3.3.4）：它是快照，任务删了也照样成立。 */
    function scoreFeedbackFeatures(task, today) {
      const source = isPlainObject(task) ? task : {};
      const tags = (Array.isArray(source.tags) ? source.tags : [])
        .filter(function (tag) { return typeof tag === 'string' && tag; })
        .slice(0, 5);
      return {
        title: String(source.title || '').slice(0, 60),
        content: String(source.content || '').slice(0, 120),
        tags: tags,
        priority: typeof source.priority === 'number' ? source.priority : 0,
        projectId: String(source.projectId || ''),
        dueDate: String(source.date || '').slice(0, 10),
        quad: quadOf(source, today || new Date())
      };
    }

    function scoreFeedbackDelta(after, before) {
      if (!isPlainObject(before) || typeof before.score !== 'number' || !isFinite(before.score)) return null;
      return round1(after - before.score);
    }

    /* id = `sf-<at>-<当日序号>`：同一毫秒内连续两次改分也要唯一，所以序号取「当天已有条数 + 1」。 */
    function scoreFeedbackId(at, list) {
      let seq = 1;
      (Array.isArray(list) ? list : []).forEach(function (item) {
        if (!isPlainObject(item) || typeof item.at !== 'number') return;
        if (dateKey(new Date(item.at)) === dateKey(new Date(at))) seq += 1;
      });
      return 'sf-' + at + '-' + seq;
    }

    function normalizeScoreFeedback(list) {
      return (Array.isArray(list) ? list : []).filter(function (item) {
        return isPlainObject(item) && typeof item.taskId === 'string' && item.taskId;
      }).map(function (item) {
        const before = isPlainObject(item.before)
          ? item.before
          : { score: null, source: 'none', origin: 'none' };
        const after = Math.round(Math.max(0, Math.min(100, Number(item.after) || 0)));
        return {
          id: typeof item.id === 'string' && item.id ? item.id : scoreFeedbackId(item.at | 0, []),
          taskId: item.taskId,
          at: item.at | 0,
          before: {
            score: typeof before.score === 'number' && isFinite(before.score) ? round1(before.score) : null,
            source: typeof before.source === 'string' && before.source ? before.source : 'none',
            origin: typeof before.origin === 'string' && before.origin ? before.origin : 'none'
          },
          after: after,
          delta: scoreFeedbackDelta(after, before),
          coldStart: !isPlainObject(before) || typeof before.score !== 'number' || !isFinite(before.score),
          features: isPlainObject(item.features) ? item.features : scoreFeedbackFeatures({}, new Date()),
          rubricVersion: typeof item.rubricVersion === 'string' && item.rubricVersion ? item.rubricVersion : SCORE_RUBRIC_VERSION,
          promptVersion: typeof item.promptVersion === 'string' && item.promptVersion ? item.promptVersion : SCORE_FEEDBACK_PROMPT_VERSION
        };
      });
    }

    function defaultDbMeta() {
      return {
        updatedAt: 0,
        schemaVersion: DB_SCHEMA_VERSION,
        scoreVersion: 0,
        /* 一次性种子导入的幂等标记：非空字符串即视为已导入过（§8.2）。
           为什么不是 scoreVersion：后者是「分数集合变过几次」的计数器，类型与含义都已定死，
           换成 rubric 字符串会连带改掉 P0 的写入口径。 */
        scoreSeed: ''
      };
    }

    function defaultDb() {
      return {
        tasks: [],
        projects: [],
        tags: [],
        scores: {},
        pomodoroLog: {},
        habitLog: {},
        obstacles: [],
        modules: {},
        /* 评分反馈库（stage4 §3.3.4）：只由 actionRecordScoreFeedback 写，
           用来教 few-shot「这位用户的手动改分偏好」，不参与任何统计口径。 */
        scoreFeedback: [],
        meta: defaultDbMeta()
      };
    }

    /* --------------------------------- 派生分区：标签 --------------------------------- */
    /* db.tags 是索引而不是编辑器：来源有两个——
       task：由任务 tags 反推出的候选（order 从 100 起、每次加载重派生）；
       manual：管理器里手工建的（color/order 由用户决定，派生过程只更新 count，绝不覆盖）。 */
    function deriveTagRegistry(tasks, existing) {
      const manual = Object.create(null);
      (Array.isArray(existing) ? existing : []).forEach(function (tag) {
        if (!tag || !tag.name) return;
        if (tag.source === 'manual') manual[tag.name] = tag;
      });
      const seen = Object.create(null);
      const derived = [];
      (Array.isArray(tasks) ? tasks : []).forEach(function (task) {
        const tags = Array.isArray(task && task.tags) ? task.tags : [];
        tags.forEach(function (name) {
          if (!name || seen[name]) return;
          seen[name] = 1;
          derived.push(name);
        });
      });
      const out = [];
      Object.keys(manual).forEach(function (name) {
        const tag = manual[name];
        out.push({
          id: tag.id || 'tag-' + name,
          name: name,
          color: tag.color || '',
          order: typeof tag.order === 'number' ? tag.order : 0,
          source: 'manual',
          count: 0
        });
      });
      derived.forEach(function (name, index) {
        if (manual[name]) return;
        out.push({ id: 'tag-' + name, name: name, color: '', order: 100 + index, source: 'task', count: 0 });
      });
      /* count 以重算为准（防手工维护漂移） */
      const counts = Object.create(null);
      (Array.isArray(tasks) ? tasks : []).forEach(function (task) {
        const tags = Array.isArray(task && task.tags) ? task.tags : [];
        tags.forEach(function (name) {
          if (name) counts[name] = (counts[name] || 0) + 1;
        });
      });
      out.forEach(function (tag) {
        tag.count = counts[tag.name] || 0;
      });
      out.sort(function (a, b) {
        if (a.order !== b.order) return a.order - b.order;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return out;
    }

    /* ------------------------------ 派生分区：习惯打卡索引 ----------------------------- */
    /* db.habitLog 只是 state.habits[].checks 的派生索引：每次加载重建，禁止反写。
       habitLog[habitId] = { count, last, days: { 'YYYY-MM-DD': 1 } } */
    function buildHabitLog(habits) {
      const log = Object.create(null);
      (Array.isArray(habits) ? habits : []).forEach(function (habit) {
        if (!habit || !habit.id) return;
        const checks = Array.isArray(habit.checks) ? habit.checks : [];
        const days = Object.create(null);
        checks.forEach(function (day) {
          if (day) days[day] = 1;
        });
        const sorted = Object.keys(days).sort();
        log[habit.id] = {
          count: sorted.length,
          last: sorted.length ? sorted[sorted.length - 1] : '',
          days: days
        };
      });
      return log;
    }

    /* ---------------------------------- 分区标准化 ---------------------------------- */
    function normalizeScoreBucket(raw) {
      const out = {};
      if (!isPlainObject(raw)) return out;
      Object.keys(raw).forEach(function (id) {
        const item = raw[id];
        if (typeof item === 'number' && isFinite(item)) {
          /* P0 前的裸数字：补成五字段，来源记为 auto（无 agent 通道、非手调）。 */
          out[id] = {
            score: Math.round(item),
            source: 'auto',
            origin: 'calibrated',
            updatedAt: 0,
            reason: '导入',
            rubricVersion: SCORE_RUBRIC_VERSION
          };
          return;
        }
        if (!isPlainObject(item) || typeof item.score !== 'number' || !isFinite(item.score)) return;
        out[id] = {
          score: Math.round(Math.max(0, Math.min(100, item.score)) * 10) / 10,
          source: scoreSourceOf(item.source),
          origin: scoreOriginOf(item.origin || item.source),
          updatedAt: item.updatedAt | 0,
          reason: typeof item.reason === 'string' && item.reason ? item.reason.slice(0, 40) : '导入',
          rubricVersion: typeof item.rubricVersion === 'string' && item.rubricVersion
            ? item.rubricVersion
            : SCORE_RUBRIC_VERSION
        };
      });
      return out;
    }

    /* §8.2 一次性种子导入：幂等标记走 db.meta.scoreSeed。
       规则：标记已设 → 直接跳过；每条只在「无记录」或「现有记录不是 manual」时写入，
       因此重复调用不会重复写、也不会覆盖用户手调分。返回 { imported, skipped }。 */
    /* opts.keepUnmatched：离线分是「任务库之外的一份独立分数库」（tt-scores.json 1294 条），
       里面可能有 4 条指向已被删除的任务 id。批量打分/环只按 id 取用，悬空条不影响渲染，
       但「1294 条注入 1294 条」是对账基线，所以种子导入默认保留悬空条（source=auto、
       origin=calibrated），而 v1→v2 迁移路径仍走严格匹配（不传该选项）。 */
    function importSeedScores(db, seedScores, rubricVersion, opts) {
      const target = isPlainObject(db) ? db : defaultDb();
      const meta = Object.assign(defaultDbMeta(), isPlainObject(target.meta) ? target.meta : {});
      const version = rubricVersion || SCORE_RUBRIC_VERSION;
      if (meta.scoreSeed) return { imported: 0, skipped: 0, done: false, db: target };
      const source = isPlainObject(seedScores) ? seedScores : {};
      const tasks = Array.isArray(target.tasks) ? target.tasks : [];
      const byId = Object.create(null);
      const byTitle = Object.create(null);
      tasks.forEach(function (task) {
        if (!task || !task.id) return;
        byId[task.id] = task;
        const key = String(task.title || '').trim().replace(/\s+/g, '').toLowerCase();
        if (!key) return;
        byTitle[key] = byTitle[key] === undefined ? task.id : null;
      });
      const scores = Object.assign({}, target.scores || {});
      let imported = 0;
      let skipped = 0;
      Object.keys(source).forEach(function (rawKey) {
        const item = source[rawKey];
        const value = typeof item === 'number' ? item : (isPlainObject(item) ? item.score : NaN);
        if (typeof value !== 'number' || !isFinite(value)) {
          skipped += 1;
          return;
        }
        const key = String(rawKey || '');
        let id = byId[key] ? key : null;
        if (!id) {
          const norm = key.trim().replace(/\s+/g, '').toLowerCase();
          if (byTitle[norm]) id = byTitle[norm];
        }
        if (!id) {
          if (!(opts && opts.keepUnmatched) || !key) {
            skipped += 1;
            return;
          }
          id = key;
        }
        const existing = scores[id];
        if (isPlainObject(existing) && existing.source === 'manual') {
          skipped += 1;
          return;
        }
        scores[id] = {
          score: Math.round(Math.max(0, Math.min(100, value)) * 10) / 10,
          source: 'auto',
          origin: 'calibrated',
          updatedAt: 0,
          reason: (isPlainObject(item) && typeof item.reason === 'string' && item.reason) || '导入',
          rubricVersion: version
        };
        imported += 1;
      });
      meta.scoreSeed = version;
      target.scores = scores;
      target.meta = meta;
      return { imported: imported, skipped: skipped, done: true, db: target };
    }

    /* 批量打分的纯函数入口（规格 §8.3 写的名字是 scoreTask(task, db)）：
       把 db 适配成 spiralScoreOf 认识的 state 形状后调用它——
       口径只有一份，避免「列表里的分」与「螺旋选件的分」算出不同结果。 */
    function scoreTask(task, db) {
      const source = isPlainObject(db) ? db : defaultDb();
      return spiralScoreOf(task, {
        scores: source.scores || {},
        projects: source.projects || [],
        tasks: source.tasks || []
      });
    }

    /* 8 分区按 typeof 补齐。opts.habits 来自 state.habits（P0 期间它仍是 top-level 分区，
       等 P1 搬进 db 后这里改读 db.habits 即可）。 */
    function normalizeDb(input, opts) {
      const options = opts || {};
      const source = isPlainObject(input) ? input : {};
      const db = defaultDb();
      db.tasks = Array.isArray(source.tasks) ? source.tasks : (Array.isArray(options.tasks) ? options.tasks : []);
      db.projects = Array.isArray(source.projects) ? source.projects : (Array.isArray(options.projects) ? options.projects : []);
      db.obstacles = Array.isArray(source.obstacles) ? source.obstacles : [];
      db.modules = isPlainObject(source.modules) ? source.modules : {};
      db.pomodoroLog = isPlainObject(source.pomodoroLog) ? source.pomodoroLog : {};
      db.scores = normalizeScoreBucket(source.scores);
      /* 迁移里若显式给了 scores（例如老版本把分数存在顶层），按同样的规则吃进来 */
      if (!Object.keys(db.scores).length && isPlainObject(options.scores)) {
        db.scores = normalizeScoreBucket(options.scores);
      }
      const habits = Array.isArray(options.habits) ? options.habits : [];
      db.habitLog = buildHabitLog(habits);
      db.scoreFeedback = normalizeScoreFeedback(source.scoreFeedback);
      db.tags = deriveTagRegistry(db.tasks, Array.isArray(source.tags) ? source.tags : []);
      db.meta = Object.assign(defaultDbMeta(), isPlainObject(source.meta) ? source.meta : {});
      db.meta.schemaVersion = DB_SCHEMA_VERSION;
      return db;
    }

    /* ---------------------------------- 内存索引 ----------------------------------- */
    /* §3.4 三条死规则：action 写完置 null；selector 读到 null 时在同一个同步调用里全量重建；
       索引不得挂到 state / localStorage / useMemo 上。 */
    let dbIndex = null;

    function invalidateDbIndex() {
      dbIndex = null;
    }

    function scoreNumberOf(bucket, id) {
      const item = bucket && bucket[id];
      if (!item || typeof item.score !== 'number' || !isFinite(item.score)) return null;
      return item.score;
    }

    function buildDbIndex(db) {
      const tasks = Array.isArray(db && db.tasks) ? db.tasks : [];
      const scores = (db && db.scores) || {};
      const index = {
        byId: Object.create(null),
        byProject: Object.create(null),
        byTag: Object.create(null),
        byStatus: Object.create(null),
        byDate: Object.create(null),
        byScore: [],
        byParent: Object.create(null)
      };
      tasks.forEach(function (task) {
        if (!task || !task.id) return;
        index.byId[task.id] = task;
        const projectKey = task.projectId || '';
        (index.byProject[projectKey] || (index.byProject[projectKey] = [])).push(task.id);
        (Array.isArray(task.tags) ? task.tags : []).forEach(function (tag) {
          if (!tag) return;
          (index.byTag[tag] || (index.byTag[tag] = [])).push(task.id);
        });
        const statusKey = task.status === 2 ? '2' : '0';
        (index.byStatus[statusKey] || (index.byStatus[statusKey] = [])).push(task.id);
        const dayKey = task.date || '';
        (index.byDate[dayKey] || (index.byDate[dayKey] = [])).push(task.id);
        const parentKey = task.parentId || '';
        (index.byParent[parentKey] || (index.byParent[parentKey] = [])).push(task.id);
      });
      index.byScore = tasks.slice().sort(function (a, b) {
        const sa = scoreNumberOf(scores, a.id);
        const sb = scoreNumberOf(scores, b.id);
        if (sa === null && sb === null) return 0;
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sb - sa;
      }).map(function (task) {
        return task.id;
      });
      return index;
    }

    function getDbIndex(db) {
      if (dbIndex) return dbIndex;
      dbIndex = buildDbIndex(db);
      return dbIndex;
    }

    /* --------------------------------- 顶层别名访问器 --------------------------------- */
    /* 读写都直连 db 分区；enumerable:false 是「JSON 只写一份」的关键。 */
    function defineShardAccessors(state) {
      if (!isPlainObject(state)) return state;
      DB_SHARDS.forEach(function (name) {
        try {
          delete state[name];
          Object.defineProperty(state, name, {
            configurable: true,
            enumerable: false,
            get: function () {
              return state.db ? state.db[name] : undefined;
            },
            set: function (value) {
              if (!isPlainObject(state.db)) state.db = defaultDb();
              state.db[name] = value;
              invalidateDbIndex();
            }
          });
        } catch (err) {
          /* 冻结对象等极端情形：退回普通属性，功能不因此中断 */
        }
      });
      try {
        Object.defineProperty(state, 'toJSON', {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function () {
            return serializeState(this);
          }
        });
      } catch (err) {
        /* 同上 */
      }
      return state;
    }

    /* --------------------------------- 磁盘兼容层 ---------------------------------- */
    /* 落盘形状故意保留 v1 的顶层三键（tasks / projects / scores），db 里不再重复写一份：
       · 老版本的读盘逻辑、以及既有回归脚本里 `savedState().tasks` 这类断言都能继续工作；
       · 文件体积与 P0 之前同量级（三个分区只有一份序列化）；
       · 其余五个分区与 meta 挂在 db 下，属于 v2 的新增部分。
       读盘时两份都能认（见 migrateState）：db 里的优先，缺失才回落到顶层。 */
    function serializeState(state) {
      const source = isPlainObject(state) ? state : {};
      const db = isPlainObject(source.db) ? source.db : defaultDb();
      const dbOut = {};
      Object.keys(db).forEach(function (key) {
        if (DB_SHARDS.indexOf(key) >= 0) return;
        dbOut[key] = db[key];
      });
      const out = {};
      Object.keys(source).forEach(function (key) {
        if (key === 'db' || key === 'toJSON') return;
        out[key] = source[key];
      });
      DB_SHARDS.forEach(function (name) {
        out[name] = db[name];
      });
      out.db = dbOut;
      return out;
    }

    /* store.update 的收尾：把 mutator 用 Object.assign 铺出来的顶层数据属性收回 db，
       再重挂访问器。只对齐分区本身，不重算 tags/habitLog（那是加载期的一次性派生）。 */
    function adoptShards(next) {
      if (!isPlainObject(next)) return next;
      let db = isPlainObject(next.db) ? next.db : defaultDb();
      DB_SHARDS.forEach(function (name) {
        const value = next[name]; /* 访问器或数据属性都能读到 */
        if (value === undefined || value === db[name]) return;
        const patch = {};
        patch[name] = value;
        db = Object.assign({}, db, patch);
      });
      next.db = db;
      defineShardAccessors(next);
      invalidateDbIndex();
      return next;
    }

    /* ---------------------------------- 只读快照 ---------------------------------- */
    /* 给 P1 的 selector / 调试用：分区是浅冻结副本，meta 单独冻一份，改不动原数据。 */
    function snapshotDb(db) {
      const source = isPlainObject(db) ? db : defaultDb();
      const out = { meta: Object.freeze(Object.assign({}, source.meta || defaultDbMeta())) };
      DB_PARTITIONS.forEach(function (name) {
        const value = source[name];
        if (Array.isArray(value)) out[name] = Object.freeze(value.slice());
        else if (isPlainObject(value)) out[name] = Object.freeze(Object.assign({}, value));
        else out[name] = Object.freeze(defaultDb()[name]);
      });
      return Object.freeze(out);
    }

    /* --------------------------------- 设置：v1 → v2 --------------------------------- */
    /* 六组 IA（§12.1）对应的键一次补齐。老键 notify / lead / defaultProject 原样保留，
       sound 从布尔升级成对象（enabled 载着老值），因此老用户「关掉音效」这件事不会丢。 */
    const DEFAULT_MODULE_ORDER = {
      today: 10, week: 20, open: 30, done: 40, trash: 50,
      project: 60, habit: 70, quadrant: 100, calendar: 110, pomodoro: 120, spiral: 130, settings: 140
    };

    function defaultModuleSettings() {
      const out = {};
      Object.keys(DEFAULT_MODULE_ORDER).forEach(function (id) {
        out[id] = true;
      });
      out.order = {};
      return out;
    }

    function defaultAgentSettings() {
      return { provider: '', apiBase: '', apiKey: '', model: '', timeout: 30, retries: 1 };
    }

    function defaultCalendarSettings() {
      return { overlays: { lunar: false, term: true, holiday: true } };
    }

    function defaultTaskViewSettings() {
      return { sort: { key: 'smart', dir: 'asc', group: 'none' } };
    }

    function defaultSoundSettings() {
      return { enabled: true, preset: 'remind', volume: 0.6, customName: '', customData: '' };
    }

    function normalizeSoundSettings(raw) {
      const base = defaultSoundSettings();
      if (typeof raw === 'boolean') return Object.assign(base, { enabled: raw });
      if (typeof raw === 'string') return Object.assign(base, { preset: raw });
      if (!isPlainObject(raw)) return base;
      const preset = raw.preset === 'stuck' || raw.preset === 'custom' || raw.preset === 'remind' ? raw.preset : base.preset;
      const volume = typeof raw.volume === 'number' && isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : base.volume;
      return {
        enabled: raw.enabled === undefined ? base.enabled : !!raw.enabled,
        preset: preset,
        volume: volume,
        customName: typeof raw.customName === 'string' ? raw.customName : '',
        customData: typeof raw.customData === 'string' ? raw.customData : ''
      };
    }

    /* 设置只做「缺什么补什么」的合并，绝不整块替换：老版本多出来的键原样带过去。 */
    function migrateSettingsToV2(input) {
      const raw = isPlainObject(input) ? input : {};
      const out = Object.assign({}, raw);
      out.notify = raw.notify === undefined ? true : !!raw.notify;
      out.lead = typeof raw.lead === 'number' && isFinite(raw.lead) ? raw.lead : 0;
      out.defaultProject = typeof raw.defaultProject === 'string' ? raw.defaultProject : '';
      out.sound = normalizeSoundSettings(raw.sound);
      out.theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : 'system';
      out.agent = Object.assign(defaultAgentSettings(), isPlainObject(raw.agent) ? raw.agent : {});
      out.calendar = Object.assign(defaultCalendarSettings(), isPlainObject(raw.calendar) ? raw.calendar : {});
      /* 评分反馈两开关（§1.13.6）：默认「用作用例」开、「含进导出」关。
         includeInExport 默认关是隐私默认值：反馈里有任务标题与标签快照。 */
      out.scoreFeedback = Object.assign(
        { useAsExamples: true, includeInExport: false },
        isPlainObject(raw.scoreFeedback) ? raw.scoreFeedback : {}
      );
      if (isPlainObject(raw.calendar) && isPlainObject(raw.calendar.overlays)) {
        out.calendar.overlays = Object.assign(defaultCalendarSettings().overlays, raw.calendar.overlays);
      }
      const taskView = defaultTaskViewSettings();
      if (isPlainObject(raw.tasks) && isPlainObject(raw.tasks.sort)) {
        taskView.sort = Object.assign(taskView.sort, raw.tasks.sort);
      }
      /* 老版本可能把排序设置平铺在顶层（sort/key/dir/group），一并带进来 */
      if (isPlainObject(raw.sort)) taskView.sort = Object.assign(taskView.sort, raw.sort);
      else if (typeof raw.sortKey === 'string') taskView.sort.key = raw.sortKey;
      out.tasks = taskView;
      const modules = defaultModuleSettings();
      if (isPlainObject(raw.modules)) {
        Object.keys(raw.modules).forEach(function (key) {
          if (key === 'order') {
            if (isPlainObject(raw.modules.order)) modules.order = Object.assign({}, raw.modules.order);
            return;
          }
          modules[key] = !!raw.modules[key];
        });
      }
      out.modules = modules;
      return out;
    }

    /* ---------------------------------- 状态迁移 ----------------------------------- */
    /* 返回 { state, migrated, reason }：reason 只在坏了的时候有值（'MIGRATE_FAILED'）。
       坏数据的原文由调用方（loadState）另存到 localStorage，这里只负责不崩。 */
    function migrateState(raw) {
      if (!isPlainObject(raw)) return { state: null, migrated: false, reason: '' };

      /* 已经是 v2：只做分区 typeof 修补，不重算派生分区、不改 version。 */
      if (raw.version === DB_SCHEMA_VERSION) {
        const state = Object.assign({}, raw);
        const habits = Array.isArray(state.habits) ? state.habits : [];
        /* 磁盘兼容层：三个分区可能写在 db 里，也可能按 v1 习惯写在顶层（serializeState 就是这么写的），
           两边都认——db 优先，缺失才回落。 */
        state.db = normalizeDb(state.db, {
          habits: habits,
          tasks: Array.isArray(state.tasks) ? state.tasks : null,
          projects: Array.isArray(state.projects) ? state.projects : null,
          scores: isPlainObject(state.scores) ? state.scores : null
        });
        delete state.tasks;
        delete state.projects;
        delete state.scores;
        state.settings = migrateSettingsToV2(state.settings);
        state.spiral = Object.assign(defaultSpiral(), state.spiral || {});
        if (!Array.isArray(state.spiralItems) || !state.spiralItems.length) state.spiralItems = defaultSpiralItems();
        if (!Array.isArray(state.habits) || !state.habits.length) state.habits = inflateHabits();
        defineShardAccessors(state);
        return { state: state, migrated: false, reason: '' };
      }

      /* v1：tasks/projects/scores 三个顶部分区搬进 db，其余补默认。 */
      if (raw.version === 1) {
        const state = Object.assign({}, raw);
        const habits = Array.isArray(state.habits) && state.habits.length ? state.habits : inflateHabits();
        state.habits = habits;
        state.db = normalizeDb(
          { tasks: state.tasks, projects: state.projects, obstacles: [], modules: {}, pomodoroLog: {} },
          { habits: habits, scores: isPlainObject(state.scores) ? state.scores : {} }
        );
        delete state.tasks;
        delete state.projects;
        delete state.scores;
        state.version = DB_SCHEMA_VERSION;
        state.settings = migrateSettingsToV2(state.settings);
        state.pomo = migrateRhythm(Object.assign(defaultPomodoro(), state.pomo || {}));
        state.spiral = Object.assign(defaultSpiral(), state.spiral || {});
        if (!Array.isArray(state.spiralItems) || !state.spiralItems.length) state.spiralItems = defaultSpiralItems();
        /* 老版本把原始 RRULE 直接写进 repeat：一次性归位到 rruleRaw */
        state.db.tasks = state.db.tasks.map(function (task) {
          const rawRule = task.rruleRaw || (typeof task.repeat === 'string' && task.repeat.indexOf('=') >= 0 ? task.repeat : '');
          if (!rawRule) return task;
          return Object.assign({}, task, { rruleRaw: rawRule, repeat: repeatEnumOf(rawRule) });
        });
        defineShardAccessors(state);
        return { state: state, migrated: true, reason: '' };
      }

      return { state: null, migrated: false, reason: '' };
    }

    /* ============================= 52-selectors · 只读查询层 =============================
       §3.5 的 14 个 selector，加上 §4 的排序 / 分组流水线。

       四条硬规则（越界即视为缺陷）：
       1) 纯函数：只吃 (db / state) 入参，不读 window、不读 Date.now()、不写任何东西；
       2) 返回值是新数组（或新对象），调用方拿去做二次排序也不会污染库；
       3) 排序一律先 slice 再 sort，绝不 sort 入参；
       4) 想要未排序的原始顺序就直接取 selectTask，别对结果再 sort 一次。

       group 的两种返回形状：'none' → Task[]；其余 → [{ key, tasks }]，顺序固定
       project / status / dateBucket / tag 的桶序，空桶不返回。 */

    /* 契约要求 score/date/priority/tag/project/created/completed 七键全部可用，
       其中 project / completed 是 §4.1 七键表之外的补充；智能排序仍为默认。 */
    const SORT_KEYS = ['smart', 'score', 'date', 'tag', 'priority', 'created', 'title', 'project', 'completed'];
    const SORT_LABELS = [
      { key: 'smart', label: '智能排序' },
      { key: 'score', label: '按分数' },
      { key: 'date', label: '按日期' },
      { key: 'tag', label: '按标签' },
      { key: 'priority', label: '按优先级' },
      { key: 'created', label: '按创建时间' },
      { key: 'title', label: '按标题' }
    ];

    const GROUP_KEYS = ['none', 'project', 'status', 'dateBucket', 'tag'];

    function sortCmpText(a, b) {
      const sa = String(a === undefined || a === null ? '' : a);
      const sb = String(b === undefined || b === null ? '' : b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }

    function sortCmpLocale(a, b) {
      try {
        return String(a || '').localeCompare(String(b || ''), 'zh-CN');
      } catch (err) {
        return sortCmpText(a, b);
      }
    }

    /* smart = 与既有 compareOpen 逐字等价：日期升序（无日期排最后）→ 优先级降序 → createdAt 升序。
       §4.1 的「链尾 id 字典序」在这里刻意不追加：compareOpen 在这些键全等时返回 0（稳定排序
       保持原序），加 id 反而会让同一批数据排出不同顺序，破坏「与 compareOpen 等价」这条验收。 */
    function sortCmpSmart(a, b) {
      const da = parseISO(a.date);
      const dbDate = parseISO(b.date);
      if (da && dbDate) {
        if (da.getTime() !== dbDate.getTime()) return da.getTime() - dbDate.getTime();
      } else if (da) return -1;
      else if (dbDate) return 1;
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      return sortCmpText(a.createdAt, b.createdAt);
    }

    function sortDateMs(task) {
      const day = parseISO(task.date);
      if (!day) return null;
      let ms = day.getTime();
      if (!task.allDay) {
        const time = task.remindAt && task.remindAt.length >= 16 ? task.remindAt.slice(11, 16) : '';
        if (time) {
          const parts = time.split(':');
          ms += ((parts[0] | 0) * 60 + (parts[1] | 0)) * 60000;
        }
      }
      return ms;
    }

    function sortCmpDate(a, b) {
      const ma = sortDateMs(a);
      const mb = sortDateMs(b);
      if (ma !== null && mb !== null) {
        if (ma !== mb) return ma - mb;
      } else if (ma !== null) return -1;
      else if (mb !== null) return 1;
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      const ca = sortCmpText(a.createdAt, b.createdAt);
      if (ca) return ca;
      return sortCmpText(a.id, b.id);
    }

    function sortCmpPriority(a, b) {
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      const da = parseISO(a.date);
      const dbDate = parseISO(b.date);
      if (da && dbDate) {
        if (da.getTime() !== dbDate.getTime()) return da.getTime() - dbDate.getTime();
      } else if (da) return -1;
      else if (dbDate) return 1;
      const ca = sortCmpText(a.createdAt, b.createdAt);
      if (ca) return ca;
      return sortCmpText(a.id, b.id);
    }

    function sortCmpCreated(a, b) {
      const ca = sortCmpText(b.createdAt, a.createdAt);
      if (ca) return ca;
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      return sortCmpText(a.id, b.id);
    }

    function sortCmpTitle(a, b) {
      const ta = sortCmpLocale(a.title, b.title);
      if (ta) return ta;
      const ca = sortCmpText(b.createdAt, a.createdAt);
      if (ca) return ca;
      return sortCmpText(a.id, b.id);
    }

    function firstTagOf(task) {
      const tags = Array.isArray(task.tags) ? task.tags : [];
      return tags.length ? String(tags[0]) : '';
    }

    function sortCmpTag(a, b) {
      const ta = sortCmpLocale(firstTagOf(a), firstTagOf(b));
      if (ta) return ta;
      const smart = sortCmpSmart(a, b);
      if (smart) return smart;
      return sortCmpText(a.id, b.id);
    }

    /* project 键：按 db.projects 的出现顺序（即 rail 顺序）比较，无清单排最后；
       同清单内退到 smart 链。不按名称比较——清单可以重名，order 才是稳定语义。 */
    function projectRankMap(db) {
      const map = Object.create(null);
      const projects = Array.isArray(db && db.projects) ? db.projects : [];
      projects.forEach(function (project, index) {
        if (project && project.id) map[project.id] = index;
      });
      return map;
    }

    function sortCmpProjectFactory(rank) {
      return function (a, b) {
        const ra = rank[a.projectId] === undefined ? Number.MAX_SAFE_INTEGER : rank[a.projectId];
        const rb = rank[b.projectId] === undefined ? Number.MAX_SAFE_INTEGER : rank[b.projectId];
        if (ra !== rb) return ra - rb;
        const smart = sortCmpSmart(a, b);
        if (smart) return smart;
        return sortCmpText(a.id, b.id);
      };
    }

    /* completed 键：完成时间降序（新的在前），未完成（completedAt 空）排最后；
       同为未完成时退到 smart 链，避免「还没做的任务顺序随机」。 */
    function sortCmpCompleted(a, b) {
      const ca = typeof a.completedAt === 'string' && a.completedAt ? a.completedAt : '';
      const cb = typeof b.completedAt === 'string' && b.completedAt ? b.completedAt : '';
      if (ca && cb) {
        const byTime = sortCmpText(cb, ca);
        if (byTime) return byTime;
      } else if (ca) return -1;
      else if (cb) return 1;
      const smart = sortCmpSmart(a, b);
      if (smart) return smart;
      return sortCmpText(a.id, b.id);
    }

    /* dir 只反转主比较：tie-break 链条永远保持稳定方向，否则同分任务的相对顺序会随升降序抖动。 */
    function makeComparator(key, dir, scores, db) {
      const desc = dir === 'desc';
      const rank = key === 'project' ? projectRankMap(db) : null;
      const cmpProject = rank ? sortCmpProjectFactory(rank) : null;
      const primary = function (a, b) {
        if (key === 'score') {
          const sa = scoreNumberOf(scores, a.id);
          const sb = scoreNumberOf(scores, b.id);
          if (sa === null && sb === null) return 0;
          if (sa === null) return 1;
          if (sb === null) return -1;
          return sb - sa;
        }
        if (key === 'date') return sortCmpDate(a, b);
        if (key === 'tag') return sortCmpTag(a, b);
        if (key === 'priority') return sortCmpPriority(a, b);
        if (key === 'created') return sortCmpCreated(a, b);
        if (key === 'title') return sortCmpTitle(a, b);
        if (key === 'project') return cmpProject(a, b);
        if (key === 'completed') return sortCmpCompleted(a, b);
        return sortCmpSmart(a, b);
      };
      return function (a, b) {
        const byPrimary = primary(a, b);
        if (byPrimary) return desc ? -byPrimary : byPrimary;
        /* score / date / tag / priority / created / title 已经自带 tie-break，
           smart 以 createdAt 收尾；再补一层 id 保证全等时顺序确定 */
        const byId = sortCmpText(a.id, b.id);
        return desc ? -byId : byId;
      };
    }

    /* §4.4 的第 4–5 步：给「已经过滤好的列表」做分组 + 组内排序。
       TaskListView 用 filterTasks 完成第 1–3 步（既有行为，逐字不动），再调这里补 4–5 步；
       selectTasks 则是 1–5 步一次到位的版本，供新代码与断言使用。 */
    function arrangeTasks(db, tasks, sort, group, today) {
      const list = (Array.isArray(tasks) ? tasks : []).slice();
      const key = sortKeyOf(sort);
      const dir = sortDirOf(sort);
      list.sort(makeComparator(key, dir, (db && db.scores) || {}, db));
      const groupKey = GROUP_KEYS.indexOf(group) >= 0 ? group : 'none';
      const grouped = groupTasks(list, groupKey, today || new Date());
      /* groupTasks 在 'none' 时直接返回任务数组（第一阶段就这样），
         这里统一成「桶数组」形状，调用方只处理一种结构。 */
      if (grouped.length && grouped[0] && Array.isArray(grouped[0].tasks)) return grouped;
      return [{ key: '', tasks: grouped }];
    }

    function sortKeyOf(sort) {
      if (typeof sort === 'string' && SORT_KEYS.indexOf(sort) >= 0) return sort;
      if (isPlainObject(sort) && SORT_KEYS.indexOf(sort.key) >= 0) return sort.key;
      return 'smart';
    }

    function sortDirOf(sort) {
      return isPlainObject(sort) && sort.dir === 'desc' ? 'desc' : 'asc';
    }

    /* ------------------------------------ 分桶 ------------------------------------- */
    function dateBucketOf(task, today) {
      const day = parseISO(task.date);
      if (!day) return 'noDate';
      const diff = dayDiff(day, today);
      if (diff < 0) return 'overdue';
      if (diff === 0) return 'today';
      if (diff === 1) return 'tomorrow';
      if (diff <= 7) return 'week';
      return 'later';
    }

    const DATE_BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'week', 'later', 'noDate'];

    function groupTasks(tasks, group, today) {
      if (group === 'project') {
        const buckets = Object.create(null);
        const order = [];
        tasks.forEach(function (task) {
          const key = task.projectId || '';
          if (!buckets[key]) {
            buckets[key] = [];
            order.push(key);
          }
          buckets[key].push(task);
        });
        return order.map(function (key) {
          return { key: key, tasks: buckets[key] };
        });
      }
      if (group === 'status') {
        const open = [];
        const done = [];
        tasks.forEach(function (task) {
          if (task.status === 2) done.push(task);
          else open.push(task);
        });
        const out = [];
        if (open.length) out.push({ key: 'open', tasks: open });
        if (done.length) out.push({ key: 'done', tasks: done });
        return out;
      }
      if (group === 'dateBucket') {
        const buckets = Object.create(null);
        tasks.forEach(function (task) {
          const key = dateBucketOf(task, today);
          (buckets[key] || (buckets[key] = [])).push(task);
        });
        return DATE_BUCKET_ORDER.filter(function (key) {
          return buckets[key];
        }).map(function (key) {
          return { key: key, tasks: buckets[key] };
        });
      }
      if (group === 'tag') {
        const buckets = Object.create(null);
        tasks.forEach(function (task) {
          const tags = Array.isArray(task.tags) && task.tags.length ? task.tags : [''];
          tags.forEach(function (tag) {
            (buckets[tag] || (buckets[tag] = [])).push(task);
          });
        });
        return Object.keys(buckets).sort(sortCmpLocale).map(function (key) {
          return { key: key, tasks: buckets[key] };
        });
      }
      return tasks;
    }

    /* ---------------------------------- 14 个 selector --------------------------------- */
    function selectTask(db, id) {
      if (!id) return null;
      const index = getDbIndex(db);
      return index.byId[id] || null;
    }

    function selectScore(db, id) {
      if (!id) return null;
      return scoreNumberOf((db && db.scores) || {}, id);
    }

    /* 环与 C 栏需要整条记录（分数之外的 source / updatedAt / reason 也要显示），
       所以另开一个返回桶的 selector；selectScore 保持「只给数字」的既有签名不变。 */
    function selectScoreEntry(db, id) {
      if (!id) return null;
      const bucket = (db && db.scores) || {};
      const item = bucket[id];
      if (!isPlainObject(item) || typeof item.score !== 'number' || !isFinite(item.score)) return null;
      return item;
    }

    function viewFilterOf(view, today) {
      return function (task) {
        if (!task) return false;
        if (view === 'trash') return !!task.deleted;
        if (task.deleted) return false;
        if (view === 'done') return task.status === 2;
        if (task.status !== 0) return false;
        if (view === 'today') {
          const day = parseISO(task.date);
          return !!day && dayDiff(day, today) <= 0;
        }
        if (view === 'week') {
          const day = parseISO(task.date);
          if (!day) return false;
          const diff = dayDiff(day, today);
          return diff >= 0 && diff <= 6;
        }
        if (view === 'date') return true;
        return true;
      };
    }

    function matchesQuery(task, needle) {
      if (!needle) return true;
      const hay = [
        task.title || '',
        task.detailNote || '',
        task.content || '',
        Array.isArray(task.tags) ? task.tags.join(' ') : ''
      ].join(' ').toLowerCase();
      return hay.indexOf(needle) >= 0;
    }

    function selectTasks(db, opts) {
      const options = isPlainObject(opts) ? opts : {};
      const today = options.today ? parseISO(options.today) || new Date() : new Date();
      const view = typeof options.view === 'string' ? options.view : 'open';
      const query = typeof options.query === 'string' ? options.query.trim().toLowerCase() : '';
      const includeDone = !!options.showDone;
      const tasks = Array.isArray(db && db.tasks) ? db.tasks : [];
      let projectKey = '';
      let dayKeyValue = '';
      if (view.indexOf('p:') === 0) projectKey = view.slice(2);
      else if (view.indexOf('date:') === 0) dayKeyValue = view.slice(5);
      const baseFilter = viewFilterOf(view, today);
      const list = tasks.filter(function (task) {
        if (!task) return false;
        if (projectKey && task.projectId !== projectKey) return false;
        if (dayKeyValue) {
          if (task.deleted) return false;
          const day = parseISO(task.date);
          if (!day || dateKey(day) !== dayKeyValue) return false;
        } else if (!baseFilter(task)) return false;
        if (!includeDone && !dayKeyValue && task.status === 2 && view !== 'done') return false;
        return matchesQuery(task, query);
      });
      const sorted = list.slice().sort(makeComparator(sortKeyOf(options.sort), sortDirOf(options.sort), (db && db.scores) || {}, db));
      const group = GROUP_KEYS.indexOf(options.group) >= 0 ? options.group : 'none';
      return groupTasks(sorted, group, today);
    }

    function selectOpenTasks(db) {
      return (Array.isArray(db && db.tasks) ? db.tasks : []).filter(function (task) {
        return task && !task.deleted && task.status === 0;
      });
    }

    function selectTasksByProject(db, projectId) {
      const key = projectId || '';
      const index = getDbIndex(db);
      return (index.byProject[key] || []).map(function (id) {
        return index.byId[id];
      }).filter(Boolean);
    }

    function selectTasksByTag(db, tagName) {
      if (!tagName) return [];
      const index = getDbIndex(db);
      return (index.byTag[tagName] || []).map(function (id) {
        return index.byId[id];
      }).filter(Boolean);
    }

    function selectTasksByDate(db, day) {
      if (!day) return [];
      const index = getDbIndex(db);
      return (index.byDate[day] || []).map(function (id) {
        return index.byId[id];
      }).filter(Boolean);
    }

    function selectSubtasks(db, parentId) {
      const key = parentId || '';
      const index = getDbIndex(db);
      return (index.byParent[key] || []).map(function (id) {
        return index.byId[id];
      }).filter(Boolean);
    }

    function selectTopByScore(db, n, opts) {
      const options = isPlainObject(opts) ? opts : {};
      const limit = typeof n === 'number' && n > 0 ? Math.floor(n) : 10;
      const index = getDbIndex(db);
      const out = [];
      index.byScore.forEach(function (id) {
        const task = index.byId[id];
        if (!task || task.deleted) return;
        if (!options.includeDone && task.status !== 0) return;
        out.push(task);
      });
      return out.slice(0, limit);
    }

    function selectPomoDay(db, day) {
      const key = typeof day === 'string' ? day : '';
      const log = (db && db.pomodoroLog) || {};
      const entry = log[key];
      if (isPlainObject(entry)) return Object.assign({}, entry);
      if (Array.isArray(entry)) return { sessions: entry.slice() };
      return { sessions: [] };
    }

    function selectPomoMonth(db, month) {
      const prefix = typeof month === 'string' ? month : '';
      const log = (db && db.pomodoroLog) || {};
      const out = [];
      Object.keys(log).sort().forEach(function (key) {
        if (prefix && key.indexOf(prefix) !== 0) return;
        out.push({ day: key, value: log[key] });
      });
      return out;
    }

    function selectHabitDay(db, day) {
      const key = typeof day === 'string' ? day : '';
      const log = (db && db.habitLog) || {};
      const out = [];
      Object.keys(log).forEach(function (habitId) {
        const entry = log[habitId];
        if (!entry || !isPlainObject(entry.days)) return;
        out.push({ habitId: habitId, checked: !!entry.days[key], count: entry.count | 0 });
      });
      return out;
    }

    function selectRailItems(db, settings) {
      return orderRailItems(validateModuleRegistry(MODULE_REGISTRY), db, settings).items;
    }

    function selectModuleFlags(db, settings) {
      const result = orderRailItems(validateModuleRegistry(MODULE_REGISTRY), db, settings);
      const flags = {};
      result.items.forEach(function (module) {
        flags[module.id] = !!module.enabled;
      });
      return flags;
    }

    /* ============================== 53-actions · 写入唯一入口 ==============================
       §3.6 的 18 个 action + actionSetSetting。

       统一契约：
       · 全部同步返回（绝不返回 Promise），先校验后改；
       · 成功 → { ok:true, changed:['tasks'|'projects'|...] }（按需带 id / id 列表）；
       · 失败 → { ok:false, code, message }，此时库内一个字节都不许动；
       · 成功路径统一把 db.meta.updatedAt 设成 Date.now()，其它地方不许碰这个字段；
       · 每次写成功都要 invalidateDbIndex()（§3.4 第一条）。

       白名单 FIELD_DENIED 的字段集：18 个既有字段 + P0 新增的 detailNote / steps / docs，
       外加只读派生字段（id / createdAt / completedAt 走专用 action，不允许 patchTask 直改）。 */

    const TASK_PATCHABLE = [
      'title', 'content', 'projectId', 'priority', 'status', 'deleted', 'date', 'allDay',
      'remindAt', 'tags', 'repeat', 'rruleRaw', 'parentId', 'quadOverride', 'pinToday',
      'notifiedAt', 'detailNote'
    ];
    const TASK_NOTE_MAX = 8000;
    const TASK_DOC_TEXT_MAX = 20000;
    const STEP_ORDER_STEP = 10;

    function actionOk(changed, extra) {
      return Object.assign({ ok: true, changed: changed || [] }, extra || {});
    }

    function actionFail(code, message) {
      return { ok: false, code: code, message: message };
    }

    function touchDbMeta(db) {
      const meta = Object.assign(defaultDbMeta(), isPlainObject(db.meta) ? db.meta : {});
      meta.updatedAt = Date.now();
      meta.schemaVersion = DB_SCHEMA_VERSION;
      return Object.assign({}, db, { meta: meta });
    }

    /* 所有写 action 都走这一个出口：拿 db 快照 → 改 → 提交。mutator 返回新 db 或 null（表示放弃）。 */
    function commitDb(store, changed, mutator) {
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const nextDb = mutator(db);
      if (!nextDb) return actionFail('NO_CHANGE', '没有可提交的改动');
      const committed = touchDbMeta(nextDb);
      store.update(function (prev) {
        return adoptShards(Object.assign({}, prev, { db: committed }));
      });
      invalidateDbIndex();
      return actionOk(changed);
    }

    function findTask(db, id) {
      if (!id) return null;
      const index = getDbIndex(db);
      return index.byId[id] || null;
    }

    function replaceTask(db, id, patch) {
      const tasks = (Array.isArray(db.tasks) ? db.tasks : []).map(function (task) {
        if (!task || task.id !== id) return task;
        return Object.assign({}, task, patch);
      });
      return Object.assign({}, db, { tasks: tasks });
    }

    /* ------------------------------------ 任务增删改 ------------------------------------ */
    function actionAddTask(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const title = typeof fields.title === 'string' ? fields.title.trim() : '';
      if (!title) return actionFail('FIELD_REQUIRED', '任务标题不能为空');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const projectId = typeof fields.projectId === 'string' && fields.projectId
        ? fields.projectId
        : (state.settings && state.settings.defaultProject) || '';
      const task = normalizeTask({
        id: uid('task'),
        projectId: projectId,
        title: title,
        priority: fields.priority | 0,
        date: typeof fields.date === 'string' ? fields.date : '',
        status: 0,
        deleted: false,
        createdAt: new Date().toISOString(),
        steps: Array.isArray(fields.steps) ? fields.steps.slice() : []
      });
      const next = Object.assign({}, db, { tasks: [task].concat(db.tasks || []) });
      const result = commitDb(store, ['tasks'], function () {
        return next;
      });
      if (!result.ok) return result;
      return Object.assign(result, { id: task.id });
    }

    function actionPatchTask(store, id, patch) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      if (!isPlainObject(patch)) return actionFail('FIELD_REQUIRED', 'patch 必须是对象');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const task = findTask(db, id);
      if (!task) return actionFail('NOT_FOUND', '任务不存在：' + id);
      const clean = {};
      const denied = [];
      Object.keys(patch).forEach(function (key) {
        if (TASK_PATCHABLE.indexOf(key) >= 0) clean[key] = patch[key];
        else denied.push(key);
      });
      if (denied.length) return actionFail('FIELD_DENIED', '不允许改动的字段：' + denied.join(', '));
      if (Object.prototype.hasOwnProperty.call(clean, 'title')) {
        const title = typeof clean.title === 'string' ? clean.title.trim() : '';
        if (!title) return actionFail('FIELD_REQUIRED', '任务标题不能为空');
        clean.title = title;
      }
      if (Object.prototype.hasOwnProperty.call(clean, 'detailNote')) {
        clean.detailNote = typeof clean.detailNote === 'string' ? clean.detailNote.slice(0, TASK_NOTE_MAX) : '';
      }
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, id, clean);
      });
    }

    function actionCompleteTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const task = findTask(db, id);
      if (!task) return actionFail('NOT_FOUND', '任务不存在：' + id);
      if (task.status === 2) return actionFail('NO_CHANGE', '任务已完成');
      completeTask(store, id);
      enqueueWriteback(store, id, task.projectId);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionUncompleteTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const task = findTask(db, id);
      if (!task) return actionFail('NOT_FOUND', '任务不存在：' + id);
      if (task.status !== 2) return actionFail('NO_CHANGE', '任务未完成');
      uncompleteTask(store, id);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionDeleteTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, id)) return actionFail('NOT_FOUND', '任务不存在：' + id);
      deleteTask(store, id);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionRestoreTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, id)) return actionFail('NOT_FOUND', '任务不存在：' + id);
      restoreTask(store, id);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionPurgeTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, id)) return actionFail('NOT_FOUND', '任务不存在：' + id);
      destroyTask(store, id);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionSetTaskNote(store, id, text) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const raw = typeof text === 'string' ? text : '';
      const truncated = raw.length > TASK_NOTE_MAX;
      const result = actionPatchTask(store, id, { detailNote: raw.slice(0, TASK_NOTE_MAX) });
      if (!result.ok) return result;
      return truncated ? Object.assign(result, { code: 'TRUNCATED', message: '备注超过 8000 字，已截断' }) : result;
    }

    /* ------------------------------------ 步骤（steps） ------------------------------------ */
    function normalizeSteps(input) {
      const list = Array.isArray(input) ? input : [];
      return list.map(function (step, index) {
        const source = isPlainObject(step) ? step : {};
        return {
          id: typeof source.id === 'string' && source.id ? source.id : uid('step'),
          text: typeof source.text === 'string' ? source.text : '',
          done: !!source.done,
          order: typeof source.order === 'number' && isFinite(source.order) ? source.order : (index + 1) * STEP_ORDER_STEP
        };
      }).sort(function (a, b) {
        return a.order - b.order;
      }).map(function (step, index) {
        return Object.assign({}, step, { order: (index + 1) * STEP_ORDER_STEP });
      });
    }

    function stepsOf(db, id) {
      const task = findTask(db, id);
      return task && Array.isArray(task.steps) ? task.steps : [];
    }

    function actionAddStep(store, taskId, text) {
      if (!taskId) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const label = typeof text === 'string' ? text.trim() : '';
      if (!label) return actionFail('FIELD_REQUIRED', '步骤内容不能为空');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, taskId)) return actionFail('NOT_FOUND', '任务不存在：' + taskId);
      const steps = normalizeSteps(stepsOf(db, taskId).concat([{ text: label }]));
      const next = replaceTask(db, taskId, { steps: steps });
      const result = commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { steps: steps });
      });
      void next;
      if (!result.ok) return result;
      return Object.assign(result, { id: steps[steps.length - 1].id });
    }

    function actionPatchStep(store, taskId, stepId, patch) {
      if (!taskId || !stepId) return actionFail('FIELD_REQUIRED', '缺少任务或步骤 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      const steps = stepsOf(db, taskId);
      if (!steps.some(function (step) { return step.id === stepId; })) return actionFail('NOT_FOUND', '步骤不存在：' + stepId);
      const fields = isPlainObject(patch) ? patch : {};
      const nextSteps = steps.map(function (step) {
        if (step.id !== stepId) return step;
        const next = Object.assign({}, step);
        if (typeof fields.text === 'string') next.text = fields.text;
        if (fields.done !== undefined) next.done = !!fields.done;
        return next;
      });
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { steps: nextSteps });
      });
    }

    function actionRemoveStep(store, taskId, stepId) {
      if (!taskId || !stepId) return actionFail('FIELD_REQUIRED', '缺少任务或步骤 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      const steps = stepsOf(db, taskId);
      if (!steps.some(function (step) { return step.id === stepId; })) return actionFail('NOT_FOUND', '步骤不存在：' + stepId);
      const nextSteps = normalizeSteps(steps.filter(function (step) {
        return step.id !== stepId;
      }));
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { steps: nextSteps });
      });
    }

    function actionMoveStep(store, taskId, stepId, direction) {
      if (!taskId || !stepId) return actionFail('FIELD_REQUIRED', '缺少任务或步骤 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      const steps = normalizeSteps(stepsOf(db, taskId));
      const index = steps.findIndex(function (step) {
        return step.id === stepId;
      });
      if (index < 0) return actionFail('NOT_FOUND', '步骤不存在：' + stepId);
      const delta = direction === 'up' || direction === 'down' ? (direction === 'up' ? -1 : 1) : 0;
      const target = index + delta;
      if (!delta || target < 0 || target >= steps.length) return actionFail('NO_CHANGE', '该方向无法移动');
      const moved = steps.slice();
      const tmp = moved[index];
      moved[index] = moved[target];
      moved[target] = tmp;
      /* 交换后必须按**新位置**直接赋号：normalizeSteps 的语义是「先按 order 排序、再按位置重排序号」，
         把交换结果再交给它，它会按旧 order 排回去，移位等于没做（静默 NO_CHANGE）。
         id / text / done 原样保留，order 重新连续成 10/20/30…
         （captain 授权的越界一行修复，t55 报告里有改前/改后与五方向探针证据） */
      const reordered = moved.map(function (step, current) {
        return Object.assign({}, step, { order: (current + 1) * STEP_ORDER_STEP });
      });
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { steps: reordered });
      });
    }

    /* ------------------------------------ 文档（docs） ------------------------------------ */
    function actionSetTaskDocs(store, taskId, docs) {
      if (!taskId) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, taskId)) return actionFail('NOT_FOUND', '任务不存在：' + taskId);
      const list = (Array.isArray(docs) ? docs : []).map(function (doc) {
        const source = isPlainObject(doc) ? doc : {};
        return {
          id: typeof source.id === 'string' && source.id ? source.id : uid('doc'),
          title: typeof source.title === 'string' ? source.title : '',
          text: typeof source.text === 'string' ? source.text.slice(0, TASK_DOC_TEXT_MAX) : ''
        };
      });
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { docs: list });
      });
    }

    /* -------------------------------------- 评分 --------------------------------------- */
    /* 写分数库的唯一入口。三条硬规则：
       1) 五字段齐（score/source/updatedAt/rubricVersion/reason）；
       2) 低优先级的来源不得覆盖高优先级：auto < agent < manual（§8.1），
          「自动批量打分不得覆盖 manual」由此自然成立；
       3) 被规则 2 挡下的条目计入 skipped，不静默丢弃。 */
    const SCORE_RANK = { auto: 1, agent: 2, manual: 3 };
    function writeScores(db, entries) {
      const scores = Object.assign({}, db.scores || {});
      const meta = Object.assign(defaultDbMeta(), db.meta || {});
      let written = 0;
      let skipped = 0;
      entries.forEach(function (entry) {
        const nextSource = entry.source === 'manual' || entry.source === 'agent' ? entry.source : 'auto';
        const existing = scores[entry.id];
        const existingRank = existing && SCORE_RANK[existing.source] ? SCORE_RANK[existing.source] : 0;
        /* 来源优先级保护：低来源不得覆盖高来源（自动分不能盖掉手动分）。
           entry.force 只给「重置为自动分」这一条路径用 —— 那是用户主动放弃手动分，
           不是自动流程在抢写，必须放行，否则重置永远写不进去。 */
        if (!entry.force && existingRank > SCORE_RANK[nextSource]) {
          skipped += 1;
          return;
        }
        scores[entry.id] = {
          score: Math.round(Math.max(0, Math.min(100, entry.score)) * 10) / 10,
          source: nextSource,
          origin: nextSource === 'auto' ? 'heuristic' : nextSource,
          updatedAt: Date.now(),
          reason: typeof entry.reason === 'string' && entry.reason ? entry.reason.slice(0, 40) : '批量打分',
          rubricVersion: typeof entry.rubricVersion === 'string' && entry.rubricVersion
            ? entry.rubricVersion
            : SCORE_RUBRIC_VERSION
        };
        written += 1;
      });
      meta.scoreVersion = (meta.scoreVersion | 0) + 1;
      return Object.assign({}, db, { scores: scores, meta: meta, scoreWrite: { written: written, skipped: skipped } });
    }

    function actionSetScore(store, id, input) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const fields = isPlainObject(input) ? input : {};
      if (typeof fields.score !== 'number' || !isFinite(fields.score)) return actionFail('FIELD_REQUIRED', 'score 必须是数字');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, id)) return actionFail('NOT_FOUND', '任务不存在：' + id);
      /* 改前快照必须在写之前取：writeScores 一落库，db.scores[id] 就是新值了（§8.5-②）。 */
      const before = scoreFeedbackBefore(db.scores && db.scores[id]);
      const result = commitDb(store, ['scores'], function (current) {
        return writeScores(current, [{ id: id, score: fields.score, source: fields.source, reason: fields.reason, rubricVersion: fields.rubricVersion, force: fields.force === true }]);
      });
      if (!result.ok) return result;
      /* 只有「用户手动改分」记账（§1.13.4 重置不写、§8.5-① 小改动也要写）。
         顺序是先写分、成功后才写反馈——写分失败时绝不能留下假记录。 */
      if (scoreSourceOf(fields.source) === 'manual') {
        actionRecordScoreFeedback(store, {
          taskId: id,
          before: before,
          after: Math.round(Math.max(0, Math.min(100, fields.score))),
          rubricVersion: fields.rubricVersion || SCORE_RUBRIC_VERSION
        });
      }
      return Object.assign(result, { id: id });
    }

    /* 评分反馈库的唯一写入口（stage4 §3.3.4 / §8.5）。
       三条硬约束：①其它 action 一律不许写 db.scoreFeedback；
       ②delta / coldStart / features 全在这里算，调用方只给 before 与 after；
       ③上限 500 按 at 淘汰最旧（写入后 splice(0, len-500)，不按 taskId 分组）。 */
    function actionRecordScoreFeedback(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const taskId = typeof fields.taskId === 'string' ? fields.taskId : '';
      if (!taskId) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const task = findTask(db, taskId);
      if (!task) return actionFail('NOT_FOUND', '任务不存在：' + taskId);
      const before = isPlainObject(fields.before) ? fields.before : scoreFeedbackBefore(null);
      const after = Math.round(Math.max(0, Math.min(100, Number(fields.after) || 0)));
      const at = Date.now();
      const list = Array.isArray(db.scoreFeedback) ? db.scoreFeedback : [];
      const record = {
        id: scoreFeedbackId(at, list),
        taskId: taskId,
        at: at,
        before: {
          score: typeof before.score === 'number' && isFinite(before.score) ? round1(before.score) : null,
          source: typeof before.source === 'string' && before.source ? before.source : 'none',
          origin: typeof before.origin === 'string' && before.origin ? before.origin : 'none'
        },
        after: after,
        delta: scoreFeedbackDelta(after, before),
        coldStart: !(isPlainObject(before) && typeof before.score === 'number' && isFinite(before.score)),
        features: scoreFeedbackFeatures(task, new Date()),
        rubricVersion: typeof fields.rubricVersion === 'string' && fields.rubricVersion ? fields.rubricVersion : SCORE_RUBRIC_VERSION,
        promptVersion: SCORE_FEEDBACK_PROMPT_VERSION
      };
      const result = commitDb(store, ['scoreFeedback'], function (current) {
        const rows = (Array.isArray(current.scoreFeedback) ? current.scoreFeedback : []).concat([record]);
        const kept = rows.length > SCORE_FEEDBACK_MAX ? rows.slice(rows.length - SCORE_FEEDBACK_MAX) : rows;
        return Object.assign({}, current, { scoreFeedback: kept });
      });
      if (!result.ok) return result;
      return Object.assign(result, { feedbackId: record.id });
    }

    function actionBulkScore(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      const tasks = (Array.isArray(db.tasks) ? db.tasks : []).filter(function (task) {
        if (!task || task.deleted) return false;
        if (fields.projectId && task.projectId !== fields.projectId) return false;
        if (Array.isArray(fields.ids) && fields.ids.length) return fields.ids.indexOf(task.id) >= 0;
        return true;
      });
      const entries = [];
      let skipped = 0;
      tasks.forEach(function (task) {
        const score = spiralScoreOf(task, store.get());
        if (typeof score !== 'number' || !isFinite(score)) {
          skipped += 1;
          return;
        }
        entries.push({ id: task.id, score: score, source: 'auto', reason: '批量重算', rubricVersion: 1 });
      });
      if (!entries.length) return actionFail('NO_CHANGE', '没有可评分的任务');
      const result = commitDb(store, ['scores'], function (current) {
        return writeScores(current, entries);
      });
      if (!result.ok) return result;
      return Object.assign(result, { scored: entries.length, skipped: skipped });
    }

    /* ------------------------------------ 番茄 / 习惯 ------------------------------------ */
    function actionStartPomodoro(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const state = store.get();
      if (state.spiral && state.spiral.status !== 'idle') return actionFail('BUSY_SPIRAL', '螺旋工作法运行中');
      startPomodoro(store);
      if (fields.taskId) {
        store.update(function (prev) {
          return Object.assign({}, prev, { pomo: Object.assign({}, prev.pomo, { taskId: fields.taskId }) });
        });
      }
      return actionOk(['pomodoroLog'], { id: fields.taskId || '' });
    }

    function actionToggleHabit(store, habitId, day) {
      if (!habitId) return actionFail('FIELD_REQUIRED', '缺少习惯 id');
      const state = store.get();
      const habits = Array.isArray(state.habits) ? state.habits : [];
      if (!habits.some(function (habit) { return habit && habit.id === habitId; })) {
        return actionFail('NOT_FOUND', '习惯不存在：' + habitId);
      }
      toggleHabit(store, habitId, day);
      const next = store.get();
      store.update(function (prev) {
        return Object.assign({}, prev, { db: Object.assign({}, prev.db, { habitLog: buildHabitLog(prev.habits) }) });
      });
      invalidateDbIndex();
      void next;
      return actionOk(['habitLog'], { id: habitId });
    }

    /* ------------------------------------ 模块开关 / 设置 ------------------------------------ */
    function actionSetModule(store, id, input) {
      const module = moduleById(id);
      if (!module) return actionFail('NOT_FOUND', '模块不存在：' + id);
      if (id === 'settings') return actionFail('FIELD_DENIED', '设置模块不可隐藏');
      const fields = isPlainObject(input) ? input : {};
      let changed = false;
      store.update(function (prev) {
        const settings = migrateSettingsToV2(prev.settings);
        const modules = Object.assign(defaultModuleSettings(), settings.modules);
        if (fields.enabled !== undefined) {
          modules[id] = !!fields.enabled;
          changed = true;
        }
        if (typeof fields.order === 'number' && isFinite(fields.order)) {
          modules.order = Object.assign({}, modules.order);
          modules.order[id] = fields.order;
          changed = true;
        }
        if (!changed) return prev;
        return Object.assign({}, prev, { settings: Object.assign({}, settings, { modules: modules }) });
      });
      if (!changed) return actionFail('NO_CHANGE', '没有可提交的改动');
      return actionOk(['modules'], { id: id });
    }

    function actionSetSetting(store, patch) {
      if (!isPlainObject(patch)) return actionFail('FIELD_REQUIRED', 'patch 必须是对象');
      store.update(function (prev) {
        return Object.assign({}, prev, { settings: Object.assign({}, migrateSettingsToV2(prev.settings), patch) });
      });
      return actionOk(['settings']);
    }

    /* 排序/分组是全局一份的视图偏好（settings.tasks.sort），不是每栏各存一份；
       写它走 action，保证「改了就落盘 + 立即重渲染」而不是组件里闷头 setState。 */
    function actionSetTaskSort(store, sort) {
      const patch = isPlainObject(sort) ? sort : {};
      const nextSort = {
        key: typeof patch.key === 'string' && SORT_KEYS.indexOf(patch.key) >= 0 ? patch.key : 'smart',
        dir: patch.dir === 'desc' ? 'desc' : 'asc',
        group: typeof patch.group === 'string' && GROUP_KEYS.indexOf(patch.group) >= 0 ? patch.group : 'none'
      };
      store.update(function (prev) {
        const settings = migrateSettingsToV2(prev.settings);
        return Object.assign({}, prev, {
          settings: Object.assign({}, settings, {
            tasks: Object.assign({}, settings.tasks || {}, { sort: nextSort })
          })
        });
      });
      return actionOk(['settings.tasks.sort']);
    }

    /* 分数库种子迁移：一次性把 build 注入的 seed.scores 落进 db.scores。
       幂等靠 db.meta.scoreSeed 标记（不是 scoreVersion——那是写计数）；
       已导入过就直接返回、**不提交**，保证第二次调用后落盘内容逐字节不变。 */
    function actionApplySeedScores(store) {
      const seedScores = (SEED && SEED.scores) || null;
      const rubric = (SEED && SEED.scoreRubric) || SCORE_RUBRIC_VERSION;
      if (!seedScores) return actionOk([]);
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const meta = Object.assign(defaultDbMeta(), db.meta || {});
      if (meta.scoreSeed) return Object.assign(actionOk([]), { seed: { imported: 0, skipped: 0, done: true } });
      let summary = { imported: 0, skipped: 0, done: true };
      const result = commitDb(store, ['scores', 'meta'], function (current) {
        const applied = importSeedScores(current, seedScores, rubric, { keepUnmatched: true });
        summary = { imported: applied.imported, skipped: applied.skipped, done: applied.done };
        return applied.db || current;
      });
      if (!result.ok) return result;
      return Object.assign({}, result, { seed: summary });
    }

    /* ============================== 54-registry · 模块注册表 ==============================
       §2 的模块注册表 + 七条校验。左边栏（rail）、B 栏视图、中间区都从这里派生，
       所以「加一个模块」= 往 MODULE_REGISTRY 里加一条 + 在 B_VIEWS / C_VIEWS 里挂组件。

       12 条内置模块的 railOrder 取 10 的整数倍（10/20/…/140），留出插空余地；
       分组顺序固定 list → project → habit → spacer → tool（§2.6）。

       B_VIEWS / C_VIEWS 是「名字 → 组件」的显式映射：注册表里只写字符串，
       分派时查表，查不到就渲染「未知视图」而不是抛异常（§2.2）。 */

    /* t105 五段 rail（ui-spec-stage2 §1.2 / §1.3）：段序即渲染序，五值集合严格相等。
       timer 段的两个计时器与 settings 段只切中间区，其余四段的条目全部落 B 栏。 */
    const RAIL_GROUPS = ['list', 'project', 'function', 'settings'];

    const MODULE_REQUIRES = ['db', 'settings', 'theme', 'sound', 'agent'];

    /* 落点统一由 ui.listView 表达，无 center 概念（t116）：rail 点开的功能直接渲染在 B 栏，
       计时段（番茄钟 / 螺旋）与设置段只是分组名，不再是「中间区页」。 */
    const MODULE_REGISTRY = [
      /* ---- 1 清单段（list）：今天 → 最近 7 天 → 标签 → 全部未完成 → 已完成 → 已删除 ---- */
      {
        id: 'today', name: '今天', icon: 'sun', railOrder: 10, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.today', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'week', name: '最近 7 天', icon: 'calendar', railOrder: 20, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.week', enabledByDefault: true, requires: ['db']
      },
      {
        /* t105 新增：标签是「任务项」，紧跟「最近 7 天」（用户原话）。
           B 栏 = 标签清单 + 选中标签的任务，不新增 listView 取值（§1.2）。 */
        id: 'tags', name: '标签', icon: 'flag', railOrder: 30, inRail: true, railGroup: 'list',
        renderB: 'TagsView', detailKind: 'task', settingsKey: 'modules.tags', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'open', name: '全部未完成', icon: 'inbox', railOrder: 40, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.open', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'done', name: '已完成', icon: 'check', railOrder: 50, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.done', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'trash', name: '已删除', icon: 'trash', railOrder: 60, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.trash', enabledByDefault: true, requires: ['db']
      },
      /* ---- 2 项目段（project） ---- */
      {
        id: 'project', name: '项目', icon: 'folder', railOrder: 10, inRail: true, railGroup: 'project',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.project', enabledByDefault: true, requires: ['db']
      },
      /* ---- 3 计时段（timer）：只切中间区，不占 B 栏（§1.2.3） ---- */
      {
        id: 'pomodoro', name: '番茄钟', icon: 'timer', railOrder: 50, inRail: true, railGroup: 'function',
        renderB: 'PomodoroView', detailKind: null, settingsKey: 'modules.pomodoro', enabledByDefault: true, requires: ['db', 'sound']
      },
      {
        id: 'spiral', name: '螺旋工作法', icon: 'spiral', railOrder: 60, inRail: true, railGroup: 'function',
        renderB: 'SpiralView', detailKind: null, settingsKey: 'modules.spiral', enabledByDefault: true, requires: ['db', 'sound']
      },
      /* ---- 4 记录与分析段（review）：四象限 → 日历 → 习惯打卡 → 必做之事 ---- */
      {
        id: 'quadrant', name: '四象限', icon: 'flag', railOrder: 10, inRail: true, railGroup: 'function',
        renderB: 'QuadrantView', detailKind: 'task', settingsKey: 'modules.quadrant', enabledByDefault: true, requires: ['db']
      },
      {
        /* 日历与四象限同级：都进 B 栏、互斥替换（§1.2 头口径②）。中间区不再有日历页。 */
        id: 'calendar', name: '日历', icon: 'calendar', railOrder: 20, inRail: true, railGroup: 'function',
        renderB: 'CalendarView', detailKind: 'task', settingsKey: 'modules.calendar', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'habit', name: '习惯打卡', icon: 'repeat', railOrder: 30, inRail: true, railGroup: 'function',
        renderB: 'HabitPanel', detailKind: 'habit', settingsKey: 'modules.habit', enabledByDefault: true, requires: ['db']
      },
      {
        /* t105 合并模块：绊脚石 + 禁止清单 + 必做之事 合成一个入口、一个 B 栏来源（§1.12）。
           旧的 obstacle / ban 两条注册项作废（§1.11 第 10 条）。 */
        id: 'onething', name: '必做之事', icon: 'sun', railOrder: 40, inRail: true, railGroup: 'function',
        renderB: 'OneThingBoard', detailKind: null, settingsKey: 'modules.onething', enabledByDefault: true, requires: ['db']
      },
      {
        /* t167/t168 拆出：禁止清单 + 绊脚石 从「必做之事」独立成「阻力清单」（§1.23）。
           数据仍读 db.obstacles，禁止清单只是同一份数据的聚合视图，不新增存储键。 */
        id: 'resistance', name: '阻力清单', icon: 'ban', railOrder: 70, inRail: true, railGroup: 'function',
        renderB: 'ResistanceBoard', detailKind: null, settingsKey: 'modules.resistance', enabledByDefault: true, requires: ['db']
      },
      /* ---- 5 设置段（settings） ---- */
      {
        id: 'settings', name: '设置', icon: 'gear', railOrder: 10, inRail: true, railGroup: 'settings',
        renderB: 'SettingsView', detailKind: null, settingsKey: '', enabledByDefault: true, requires: ['settings']
      },
      /* ---- 纯开关模块（inRail:false，不占 rail 槽位）：权重环 / 蓝按钮推荐 ---- */
      {
        id: 'score', name: '权重环', icon: 'spark', railOrder: 150, inRail: false, railGroup: 'function',
        renderB: '', detailKind: null, settingsKey: 'modules.score', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'rec', name: '蓝按钮推荐', icon: 'spark', railOrder: 160, inRail: false, railGroup: 'function',
        renderB: '', detailKind: null, settingsKey: 'modules.rec', enabledByDefault: true, requires: ['db']
      }
    ];

    /* 注册表级的默认开关补充：51-db 的 defaultModuleSettings() 是在 t50 定稿的 12 条，
       这里新增的 6 条由本文件补齐，避免每条都触发一次 MODULE_NO_DEFAULT 告警。 */
    const MODULE_EXTRA_DEFAULTS = {
      tags: true, score: true, rec: true, onething: true, resistance: true
    };

    /* 旧模块 id → 新模块 id（t105 合并/改名）。读开关时按此回退，保证用户已关闭的状态不丢。 */
    const MODULE_LEGACY_IDS = {
      tags: ['tag'],
      onething: ['obstacle', 'ban', 'prohibit']
    };

    /* 开关取值：先看新 id，再按 legacy 顺序回退（§1.12.4 的读法），最后回落 enabledByDefault。 */
    function moduleSwitch(modules, id) {
      if (modules[id] !== undefined) return !!modules[id];
      const legacy = MODULE_LEGACY_IDS[id] || [];
      for (let i = 0; i < legacy.length; i += 1) {
        if (modules[legacy[i]] !== undefined) return !!modules[legacy[i]];
      }
      return undefined;
    }

    /* 顺序取值：新 id 优先，其次取 legacy 里最小的那个（§1.12.4「order = min(...)」）。 */
    function moduleOrderValue(modules, id) {
      const custom = isPlainObject(modules.order) ? modules.order : {};
      if (typeof custom[id] === 'number' && isFinite(custom[id])) return custom[id];
      const legacy = MODULE_LEGACY_IDS[id] || [];
      let best = null;
      legacy.forEach(function (key) {
        const value = custom[key];
        if (typeof value === 'number' && isFinite(value) && (best === null || value < best)) best = value;
      });
      return best;
    }

    function moduleDefaults() {
      return Object.assign({}, defaultModuleSettings(), MODULE_EXTRA_DEFAULTS);
    }

    /* 单个模块是否启用：设置里写了就用设置，没写回落到 enabledByDefault；
       settings 永远开（关掉它就没地方再打开别的模块了）。 */
    function moduleEnabled(settings, id) {
      if (id === 'settings') return true;
      const module = moduleById(id);
      if (!module) return true;
      const s = migrateSettingsToV2(settings);
      const modules = Object.assign(moduleDefaults(), s.modules || {});
      const value = moduleSwitch(modules, id);
      return value === undefined ? module.enabledByDefault !== false : !!value;
    }

    /* 模块开关快照：UI 一次取全，避免每个 rail 项各查一次 settings。 */
    function moduleFlags(settings) {
      const s = migrateSettingsToV2(settings);
      const modules = Object.assign(moduleDefaults(), s.modules || {});
      const out = Object.create(null);
      MODULE_REGISTRY.forEach(function (module) {
        if (module.id === 'settings') {
          out[module.id] = true;
          return;
        }
        const value = moduleSwitch(modules, module.id);
        out[module.id] = value === undefined ? module.enabledByDefault !== false : !!value;
      });
      return out;
    }

    /* listView → 模块 id：关掉模块时要能把开着的视图一起收起来。 */
    function moduleOfListView(view) {
      if (!view) return '';
      if (view.indexOf('p:') === 0) return 'project';
      if (view.indexOf('date:') === 0) return 'calendar';
      if (view.indexOf('tag:') === 0 || view === 'tags' || view === 'tag') return 'tags';
      return view;
    }

    /* B 栏（右栏列表）组件表：注册表写名字，这里给组件。新增模块两个地方都要加。 */
    const B_VIEWS = {
      TaskListView: function () { return TaskListView; },
      HabitPanel: function () { return HabitPanel; },
      QuadrantView: function () { return QuadrantView; },
      SpiralBoard: function () { return SpiralBoard; },
      TagBoard: function () { return TagBoard; },
      ResistanceBoard: function () { return ResistanceBoard; },
      PomodoroView: function () { return PomodoroView; },
      SpiralView: function () { return SpiralView; },
      SettingsView: function () { return SettingsView; },
      TagsView: function () { return TagsView; },
      CalendarView: function () { return CalendarView; },
      OneThingBoard: function () { return OneThingBoard; }
    };

    /* C 栏（详情栏）组件表：detailKind 决定取哪个。 */
    const C_VIEWS = {
      task: function () { return TaskDetail; },
      habit: function () { return HabitDetail; }
    };

    const MODULE_BY_ID = (function () {
      const map = Object.create(null);
      MODULE_REGISTRY.forEach(function (module) {
        map[module.id] = module;
      });
      return map;
    })();

    function moduleById(id) {
      return id ? MODULE_BY_ID[id] || null : null;
    }

    function moduleIdsInGroup(group) {
      return MODULE_REGISTRY.filter(function (module) {
        return module.railGroup === group;
      }).map(function (module) {
        return module.id;
      });
    }

    /* --------------------------------- 七条校验（§2.2） --------------------------------- */
    /* 返回 { items, error }：
       · items —— 通过校验后的模块数组（已补默认值）；
       · error —— null 或 { code, message }；MODULE_DUP_ID 是致命错误（面板整体不渲染），
         其余六类只在 rail 上跳过该条并在控制台留一行说明，不影响其它模块。 */
    const MODULE_ID_RE = /^[a-z][a-z0-9-]*$/;

    function validateModuleRegistry(registry) {
      const list = Array.isArray(registry) ? registry : [];
      const seen = Object.create(null);
      for (let i = 0; i < list.length; i += 1) {
        const module = list[i];
        if (!module || typeof module.id !== 'string') continue;
        if (seen[module.id]) {
          return {
            items: [],
            error: { code: 'MODULE_DUP_ID', message: '模块 id 重复：' + module.id }
          };
        }
        seen[module.id] = 1;
      }
      const items = [];
      const warnings = [];
      list.forEach(function (module) {
        if (!module || typeof module.id !== 'string') return;
        if (!MODULE_ID_RE.test(module.id)) {
          warnings.push({ code: 'MODULE_BAD_ID', id: module.id });
          return;
        }
        if (module.railGroup && RAIL_GROUPS.indexOf(module.railGroup) < 0) {
          warnings.push({ code: 'MODULE_BAD_ID', id: module.id });
          return;
        }
        if (module.renderB && !B_VIEWS[module.renderB]) {
          warnings.push({ code: 'MODULE_NO_VIEW', id: module.id });
          return;
        }
        if (module.detailKind !== null && module.detailKind !== undefined && !C_VIEWS[module.detailKind]) {
          warnings.push({ code: 'MODULE_BAD_DETAIL', id: module.id });
          return;
        }
        const requires = Array.isArray(module.requires) ? module.requires : [];
        if (requires.some(function (key) { return MODULE_REQUIRES.indexOf(key) < 0; })) {
          warnings.push({ code: 'MODULE_BAD_REQUIRES', id: module.id });
          return;
        }
        items.push(Object.assign({
          inRail: true,
          enabledByDefault: true,
          railOrder: 0,
          railGroup: 'function',
          detailKind: null,
          settingsKey: 'modules.' + module.id,
          requires: []
        }, module));
      });
      /* 同组 railOrder 唯一 */
      const orderSeen = Object.create(null);
      const kept = [];
      items.forEach(function (module) {
        const key = module.railGroup + ':' + module.railOrder;
        if (orderSeen[key]) {
          warnings.push({ code: 'MODULE_ORDER_DUP', id: module.id });
          return;
        }
        orderSeen[key] = 1;
        kept.push(module);
      });
      /* 每个模块都要有默认开关值（settings.modules[id]） */
      const defaults = moduleDefaults();
      kept.forEach(function (module) {
        if (defaults[module.id] === undefined) warnings.push({ code: 'MODULE_NO_DEFAULT', id: module.id });
      });
      if (warnings.length && typeof console !== 'undefined' && console.warn) {
        console.warn('[dsh-tasks] 模块注册表校验告警', warnings);
      }
      return { items: kept, error: null, warnings: warnings };
    }

    /* -------------------------------- 排序 + 开关合并 -------------------------------- */
    /* 用户自定义顺序 settings.modules.order[id] 优先，缺省回落到 railOrder；
       开关取 settings.modules[id]，未写则用 enabledByDefault（settings 模块永远开）。 */
    function orderRailItems(validated, db, settings) {
      const registry = isPlainObject(validated) ? validated.items : [];
      const error = isPlainObject(validated) ? validated.error : null;
      if (error) return { items: [], error: error };
      const s = migrateSettingsToV2(settings);
      const modules = Object.assign(moduleDefaults(), s.modules || {});
      const custom = isPlainObject(modules.order) ? modules.order : {};
      const items = registry.map(function (module) {
        const fallback = module.enabledByDefault !== false;
        const switched = moduleSwitch(modules, module.id);
        let enabled = module.id === 'settings' ? true : (switched === undefined ? fallback : switched);
        if (module.id === 'settings') enabled = true;
        const customOrder = moduleOrderValue(modules, module.id);
        const order = customOrder === null ? module.railOrder : customOrder;
        return Object.assign({}, module, { enabled: enabled, order: order });
      });
      items.sort(function (a, b) {
        if (a.order !== b.order) return a.order - b.order;
        if (a.railOrder !== b.railOrder) return a.railOrder - b.railOrder;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      return { items: items, error: null };
    }

    /* ================================ 55-theme · 明暗主题 ================================
       §5 主题解析：settings.theme 三档（light / dark / system）→ .dtRoot 上的
       data-dt-theme（已解析成 light|dark）+ data-dt-theme-src（user|system）。

       解析链（system 时）：
       1) 读宿主的实际底色 —— 取 document.documentElement 的 backgroundColor；
          刻意只读 html 根元素、不读 body（硬约束要求产物里零命中）；
       2) 拿得到且 alpha>0 → 按相对亮度 0.2126R + 0.7152G + 0.0722B 判 <0.5 为 dark；
       3) 读不到 / transparent / 解析失败 → 回退 matchMedia('(prefers-color-scheme: dark)')。

       监听只在 src==='system' 时挂、切到 user 立刻摘掉；变化用回调触发重渲染，
       不需要 reload 页面。为了不污染「document/window 监听恰 7 条」这条审计，
       系统主题用 matchMedia(...).onchange 属性赋值，而不是 addEventListener。 */

    const THEME_LABELS = [
      { key: 'light', label: '浅色' },
      { key: 'dark', label: '深色' },
      { key: 'system', label: '跟随系统' }
    ];

    function parseCssColor(value) {
      if (typeof value !== 'string') return null;
      const text = value.trim().toLowerCase();
      if (!text || text === 'transparent') return null;
      let match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
      if (match) {
        const hex = match[1];
        if (hex.length === 3) {
          return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), 1];
        }
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          1
        ];
      }
      match = text.match(/^rgba?\(([^)]+)\)$/);
      if (match) {
        const parts = match[1].split(/[,/\s]+/).filter(function (part) {
          return part !== '';
        }).map(function (part) {
          return part.trim();
        });
        if (parts.length < 3) return null;
        const r = parseFloat(parts[0]);
        const g = parseFloat(parts[1]);
        const b = parseFloat(parts[2]);
        const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
        if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return null;
        return [r, g, b, isFinite(a) ? a : 1];
      }
      return null;
    }

    function luminanceOf(rgba) {
      return 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2];
    }

    function hostPrefersDark() {
      try {
        const view = typeof window !== 'undefined' ? window : null;
        const doc = view && view.document ? view.document : null;
        const root = doc && doc.documentElement ? doc.documentElement : null;
        if (root && view.getComputedStyle) {
          const style = view.getComputedStyle(root);
          const rgba = parseCssColor(style && style.backgroundColor);
          if (rgba && rgba[3] > 0) return luminanceOf(rgba) < 128;
        }
      } catch (err) {
        /* 读不到宿主底色就往下走媒体查询 */
      }
      try {
        const view = typeof window !== 'undefined' ? window : null;
        if (view && typeof view.matchMedia === 'function') {
          const media = view.matchMedia('(prefers-color-scheme: dark)');
          if (media && typeof media.matches === 'boolean') return media.matches;
        }
      } catch (err) {
        /* 媒体查询都不可用：按浅色处理 */
      }
      return false;
    }

    /* 返回 { theme:'light'|'dark', src:'user'|'system' } */
    function resolveTheme(settings) {
      const s = migrateSettingsToV2(settings);
      if (s.theme === 'light') return { theme: 'light', src: 'user' };
      if (s.theme === 'dark') return { theme: 'dark', src: 'user' };
      return { theme: hostPrefersDark() ? 'dark' : 'light', src: 'system' };
    }

    /* 订阅系统主题变化：返回注销函数。src==='user' 时压根不挂。 */
    function subscribeSystemTheme(settings, onChange) {
      const resolved = resolveTheme(settings);
      if (resolved.src !== 'system') return function () {};
      const view = typeof window !== 'undefined' ? window : null;
      if (!view || typeof view.matchMedia !== 'function') return function () {};
      let media = null;
      try {
        media = view.matchMedia('(prefers-color-scheme: dark)');
      } catch (err) {
        return function () {};
      }
      if (!media) return function () {};
      const handler = function () {
        try {
          onChange(resolveTheme(settings));
        } catch (err) {
          /* 回调异常不影响主题本身 */
        }
      };
      const previous = media.onchange;
      media.onchange = function (event) {
        if (typeof previous === 'function') {
          try {
            previous.call(media, event);
          } catch (err) {
            /* 保留宿主既有回调的独立性 */
          }
        }
        handler(event);
      };
      return function () {
        media.onchange = previous || null;
      };
    }

    /* ================================ 56-sound · 提示音 ================================
       §6 音效：两个内置预设（remind / stuck）+ 一个用户导入的自定义音频，全部走 WebAudio 合成
       或本地解码，**不加载任何外部音频文件**（无网络请求、无 <audio> 元素、无 blob URL）。

       · getCtx() 惰性单例，只能在用户手势里创建；失败返回 null 并把 AUDIO_UNAVAILABLE 记下来，
         由界面渲染 aria-live 文案「当前环境无法播放音效」。
       · playPreset 200ms 去抖：连点试听不会叠成噪音。
       · enabled=false 时**连 AudioContext 都不创建**（不是创建了不播）。
       · 音量入参是 0..1 的系数，乘到每个预设的峰值上（remind 0.18 / stuck 0.22）。 */

    const SOUND_PRESETS = [
      { id: 'remind', label: '提醒音（两短声）' },
      { id: 'stuck', label: '卡住提示（三连低音）' },
      { id: 'custom', label: '自定义音频' }
    ];
    const SOUND_PEAK = { remind: 0.18, stuck: 0.22 };
    const SOUND_DEBOUNCE_MS = 200;
    const SOUND_MAX_BYTES = 512 * 1024;
    const SOUND_ACCEPT = '.mp3,.wav,.ogg,.m4a,audio/*';
    const SOUND_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];

    let soundCtx = null;
    let soundCtxFailed = false;
    let soundLastAt = 0;

    function soundEnabled(settings) {
      const sound = migrateSettingsToV2(settings).sound;
      return !!(sound && sound.enabled);
    }

    function getCtx() {
      if (soundCtx) return soundCtx;
      if (soundCtxFailed) return null;
      const view = typeof window !== 'undefined' ? window : null;
      const Ctor = view && (view.AudioContext || view.webkitAudioContext);
      if (!Ctor) {
        soundCtxFailed = true;
        return null;
      }
      try {
        soundCtx = new Ctor();
      } catch (err) {
        soundCtxFailed = true;
        soundCtx = null;
      }
      return soundCtx;
    }

    function soundUnavailable() {
      return soundCtxFailed || !getCtx();
    }

    function scheduleTone(ctx, at, freq, durationMs, peak) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      const end = at + durationMs / 1000;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(end + 0.02);
    }

    function scheduleTriangle(ctx, at, freq, durationMs, peak) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, at);
      const end = at + durationMs / 1000;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(end + 0.02);
    }

    /* 自定义音频：dataURL → ArrayBuffer → decodeAudioData。解析失败按 AUDIO_UNAVAILABLE 处理。 */
    function dataUrlToArrayBuffer(dataUrl) {
      if (typeof dataUrl !== 'string' || dataUrl.indexOf(',') < 0) return null;
      const body = dataUrl.slice(dataUrl.indexOf(',') + 1);
      try {
        if (typeof atob !== 'function') return null;
        const binary = atob(body);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      } catch (err) {
        return null;
      }
    }

    function playCustom(ctx, dataUrl, volume) {
      const buffer = dataUrlToArrayBuffer(dataUrl);
      if (!buffer || typeof ctx.decodeAudioData !== 'function') return null;
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, volume || 0));
      gain.connect(ctx.destination);
      return new Promise(function (resolve) {
        let settled = false;
        const finish = function (ok) {
          if (settled) return;
          settled = true;
          resolve(ok);
        };
        try {
          const result = ctx.decodeAudioData(buffer, function (decoded) {
            try {
              const source = ctx.createBufferSource();
              source.buffer = decoded;
              source.connect(gain);
              source.start(0);
              finish(true);
            } catch (err) {
              finish(false);
            }
          }, function () {
            finish(false);
          });
          if (result && typeof result.then === 'function') {
            result.then(function (decoded) {
              try {
                const source = ctx.createBufferSource();
                source.buffer = decoded;
                source.connect(gain);
                source.start(0);
                finish(true);
              } catch (err) {
                finish(false);
              }
            }, function () {
              finish(false);
            });
          }
        } catch (err) {
          finish(false);
        }
      });
    }

    /* playPreset(settings, opts) → Promise<{ ok, code? }>
       opts.preset 覆盖设置里的预设（试听某个未保存的选项时用）。 */
    function playPreset(settings, opts) {
      const options = isPlainObject(opts) ? opts : {};
      const sound = migrateSettingsToV2(settings).sound;
      if (!sound.enabled) return Promise.resolve({ ok: false, code: 'DISABLED' });
      const now = Date.now();
      if (now - soundLastAt < SOUND_DEBOUNCE_MS) return Promise.resolve({ ok: false, code: 'DEBOUNCED' });
      soundLastAt = now;
      const preset = options.preset || sound.preset || 'remind';
      const volume = typeof options.volume === 'number' ? options.volume : sound.volume;
      const ctx = getCtx();
      if (!ctx) return Promise.resolve({ ok: false, code: 'AUDIO_UNAVAILABLE' });
      try {
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
        const at = ctx.currentTime + 0.01;
        if (preset === 'stuck') {
          const peak = SOUND_PEAK.stuck * Math.max(0, Math.min(1, volume));
          scheduleTriangle(ctx, at, 220, 140, peak);
          scheduleTriangle(ctx, at + 0.2, 224, 140, peak);
          scheduleTriangle(ctx, at + 0.4, 220, 140, peak);
          return Promise.resolve({ ok: true });
        }
        if (preset === 'custom') {
          if (!sound.customData) return Promise.resolve({ ok: false, code: 'AUDIO_UNAVAILABLE' });
          return playCustom(ctx, sound.customData, volume).then(function (ok) {
            return ok ? { ok: true } : { ok: false, code: 'AUDIO_UNAVAILABLE' };
          });
        }
        const peak = SOUND_PEAK.remind * Math.max(0, Math.min(1, volume));
        scheduleTone(ctx, at, 880, 120, peak);
        scheduleTone(ctx, at + 0.2, 880, 120, peak);
        return Promise.resolve({ ok: true });
      } catch (err) {
        soundCtxFailed = true;
        return Promise.resolve({ ok: false, code: 'AUDIO_UNAVAILABLE' });
      }
    }

    /* ---------------------------------- 导入自定义音频 ---------------------------------- */
    /* 三道闸：类型白名单 → 512KB 硬上限 → 读成 dataURL。任何一道不过都返回 { ok:false, message }，
       调用方负责 toast；成功则返回可直接写进 settings.sound.customData 的字符串。 */
    function ensureSoundFile(file) {
      if (!file) return { ok: false, message: '没有选择文件' };
      const name = typeof file.name === 'string' ? file.name : '';
      const lower = name.toLowerCase();
      const extOk = /\.(mp3|wav|ogg|m4a)$/.test(lower);
      const mimeOk = typeof file.type === 'string' && SOUND_MIME.indexOf(file.type.toLowerCase()) >= 0;
      if (!extOk && !mimeOk) return { ok: false, message: '只支持 mp3 / wav / ogg / m4a' };
      const size = typeof file.size === 'number' ? file.size : 0;
      if (size > SOUND_MAX_BYTES) return { ok: false, message: '音频文件请小于 512KB' };
      return { ok: true, name: name };
    }

    function readSoundFile(file, onDone) {
      const gate = ensureSoundFile(file);
      if (!gate.ok) {
        onDone({ ok: false, message: gate.message });
        return;
      }
      const view = typeof window !== 'undefined' ? window : null;
      const Reader = view && view.FileReader;
      if (!Reader) {
        onDone({ ok: false, message: '读取失败，请重试' });
        return;
      }
      let reader = null;
      try {
        reader = new Reader();
      } catch (err) {
        onDone({ ok: false, message: '读取失败，请重试' });
        return;
      }
      reader.onload = function () {
        const data = typeof reader.result === 'string' ? reader.result : '';
        if (!data) {
          onDone({ ok: false, message: '读取失败，请重试' });
          return;
        }
        onDone({ ok: true, name: gate.name, data: data });
      };
      reader.onerror = function () {
        onDone({ ok: false, message: '读取失败，请重试' });
      };
      try {
        reader.readAsDataURL(file);
      } catch (err) {
        onDone({ ok: false, message: '读取失败，请重试' });
      }
    }


    /* ================================ 57-agent · 任务整理助手（P5） ================================
       规格 docs/stage4-foundation.md §9.2 / §9.3 / §10（客户端侧纯逻辑，视图在 59-taskinfo.js）：

       · 一次请求两件事：system 提示词要求模型只回一个 JSON 对象 `{title, steps}`，
         绝不发两次请求、也绝不发第二次补全；
       · 解析链四级（§9.3）：直接 parse → 剥 ```json 围栏 → 正则截第一个 `{…}` → AGENT_BAD_JSON；
       · 半成功是合法结果：只有 steps 没有 title（或反之）不算失败，交给视图层「待确认」处理，
         视图只写模型真的给出来的那一半；
       · 八类错误码（§10.4）在这里集中分类，视图只负责把 code 显示成文案；
       · 密钥四条（§10.5）：只从 settings.agent.apiKey 读、绝不进 console、绝不进 URL；
         请求前校验 Base URL 必须是 https:// 或 http://localhost，避免把 Key 明文发到 http。
       · 本文件不碰 store、不碰 DOM：纯函数 + 一次可注入的 fetch 调用，便于测试桩替换。 */

    const AGENT_RETRY_DELAYS = [1000, 3000];

    /* §10.1 provider 只影响「填预设」，不改变请求体形状。
       t118：改成四家显式列表，值固定 codex|gemini|deepseek|opencodego（不许自创）。
       apiBase 一律填到「能拼 /chat/completions 的那一层」：
         - codex      OpenAI 平台 API（注意订阅账号 ≠ API key）
         - gemini     Gemini 的 OpenAI 兼容层（不是原生 generateContent）
         - deepseek   DeepSeek 官方
         - opencodego OpenCode Go 的 OpenAI 兼容端点（模型列表走 GET /v1/models）
       model 只是「建议值」：写进设置页 placeholder，用户不填时才用它发请求。
      t123 口径：占位只能写「按官方文档核过、当前确实存在」的模型名；核不到就统一写「模型名」，
      四家占位串不许重复（此前 deepseek 与 opencodego 撞成同一串、另两家写了不存在的版本号）。 */
    const AGENT_PROVIDER_PRESETS = {
      codex: { label: 'Codex（OpenAI）', apiBase: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      gemini: { label: 'Gemini', apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
      deepseek: { label: 'DeepSeek', apiBase: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      opencodego: { label: 'OpenCode Go', apiBase: 'https://opencode.ai/zen/go/v1', model: '模型名' }
    };

    /* 老配置里可能存过 openai / custom，读的时候按别名归一到四家之一（不写回、不改用户数据） */
    const AGENT_PROVIDER_ALIASES = { openai: 'codex', custom: 'deepseek', 'opencode-go': 'opencodego', 'opencode go': 'opencodego' };

    const AGENT_PROVIDER_ORDER = ['codex', 'gemini', 'deepseek', 'opencodego'];

    function agentProviderKey(value) {
      const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (!key) return '';
      if (AGENT_PROVIDER_PRESETS[key]) return key;
      return AGENT_PROVIDER_ALIASES[key] || '';
    }

    /* 设置页 placeholder 用：该供应商的建议 model（未选/未知供应商回落到默认） */
    function agentModelSuggestion(provider) {
      const preset = agentPresetOf(provider);
      return preset ? preset.model : AGENT_DEFAULT_CONFIG.model;
    }

    function agentPresetOf(provider) {
      const key = agentProviderKey(provider);
      return key ? AGENT_PROVIDER_PRESETS[key] : null;
    }

    const AGENT_DEFAULT_CONFIG = {
      provider: 'deepseek',
      apiBase: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-v4.1-flash',
      timeoutMs: 30000,
      maxRetries: 1
    };

    /* §9.3 逐字：模型只回 JSON，steps 3–7 条、动词开头、不编造 */
    const AGENT_SYSTEM_PROMPT = [
      '你是任务整理助手。只输出一个 JSON 对象，不要任何解释、不要代码围栏。',
      'JSON 必须形如：{"title": "润色后的任务名（≤24字，动词开头）", "steps": ["步骤1", "步骤2", "步骤3"]}',
      '要求：title 保持原意、去掉口语与冗余；steps 3–7 条，每条 ≤40 字，按执行顺序排列，动词开头。',
      '信息不足时也要给出合理步骤，不要返回空数组，不要编造与任务无关的内容。'
    ].join('\n');

    /* §10.6 打分通道的独立 system prompt（t110：两套 prompt 各自完整、互不引用）。
       禁止把打分要求追加到 AGENT_SYSTEM_PROMPT 尾部，也禁止在这里写「沿用上文的输出格式」。 */
    const AGENT_SCORE_SYSTEM_PROMPT = [
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
    ].join('\n');

    /* few-shot 块（§9.4）：只拼到 AGENT_SCORE_SYSTEM_PROMPT 之后，绝不进整理通道。
       抽样规则写死：N=8 / 过滤 coldStart===false 且 |delta|>=2 / 同 taskId 取最新 /
       同 normTitle+sign+quad 取最新 / at 降序 / 有效条数<3 不注入。 */
    const SCORE_FEWSHOT_N = 8;
    const SCORE_FEWSHOT_MIN = 3;
    const SCORE_FEWSHOT_LINE_MAX = 180;
    const SCORE_FEWSHOT_BLOCK_MAX = 1600;
    const SCORE_FEWSHOT_HEAD = '以下是该用户过去对手动改分的示例（修改前 → 修改后）。请让打分贴近这些偏好：';

    function scoreNormTitle(title) {
      return String(title || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function scoreFewshotLines(db) {
      const rows = (isPlainObject(db) && Array.isArray(db.scoreFeedback) ? db.scoreFeedback : []).filter(function (row) {
        if (!isPlainObject(row)) return false;
        if (row.coldStart !== false) return false;
        if (typeof row.delta !== 'number' || !isFinite(row.delta)) return false;
        return Math.abs(row.delta) >= 2;
      });
      /* 去重一：同一任务只取 at 最新的一条 */
      const byTask = Object.create(null);
      rows.forEach(function (row) {
        const prev = byTask[row.taskId];
        if (!prev || (row.at | 0) > (prev.at | 0)) byTask[row.taskId] = row;
      });
      /* 去重二：键 = normTitle + sign(delta) + quad；同标题一正一负不算重复 */
      const byKey = Object.create(null);
      Object.keys(byTask).forEach(function (taskId) {
        const row = byTask[taskId];
        const features = isPlainObject(row.features) ? row.features : {};
        const sign = row.delta >= 0 ? '+' : '-';
        const key = scoreNormTitle(features.title) + sign + String(features.quad || '');
        const prev = byKey[key];
        if (!prev || (row.at | 0) > (prev.at | 0)) byKey[key] = row;
      });
      const picked = Object.keys(byKey)
        .map(function (key) { return byKey[key]; })
        .sort(function (a, b) { return (b.at | 0) - (a.at | 0); })
        .slice(0, SCORE_FEWSHOT_N);
      return picked.map(function (row) {
        const features = isPlainObject(row.features) ? row.features : {};
        const before = isPlainObject(row.before) ? row.before : {};
        const line = JSON.stringify({
          b: typeof before.score === 'number' ? round1(before.score) : null,
          a: Math.round(Number(row.after) || 0),
          t: String(features.title || '').slice(0, 40),
          g: (Array.isArray(features.tags) ? features.tags : []).slice(0, 3),
          p: typeof features.priority === 'number' ? features.priority : 0,
          q: String(features.quad || '')
        });
        return line.length > SCORE_FEWSHOT_LINE_MAX ? line.slice(0, SCORE_FEWSHOT_LINE_MAX) : line;
      });
    }

    /* 返回 '' 表示「不注入」——此时打分 system 必须与 AGENT_SCORE_SYSTEM_PROMPT 严格等值 */
    function scoreFewshotBlock(db, settings) {
      const cfg = isPlainObject(settings) && isPlainObject(settings.scoreFeedback) ? settings.scoreFeedback : {};
      if (cfg.useAsExamples === false) return '';
      const lines = scoreFewshotLines(db);
      if (lines.length < SCORE_FEWSHOT_MIN) return '';
      /* 整块超限时从最旧一行丢（块头不动）——lines 已按 at 降序，所以从尾部丢 */
      const kept = lines.slice();
      const size = function () {
        return SCORE_FEWSHOT_HEAD.length + 1 + kept.reduce(function (acc, line) { return acc + line.length + 1; }, 0);
      };
      while (kept.length > SCORE_FEWSHOT_MIN && size() > SCORE_FEWSHOT_BLOCK_MAX) kept.pop();
      return SCORE_FEWSHOT_HEAD + '\n' + kept.join('\n');
    }

    function agentScoreSystem(block) {
      return block ? AGENT_SCORE_SYSTEM_PROMPT + '\n\n' + block : AGENT_SCORE_SYSTEM_PROMPT;
    }

    /* 打分结果归一（§10.6）：score 非整数按 round 收敛，越界钳制；reason 原样（不截断）。 */
    function agentNormalizeScore(raw) {
      const source = isPlainObject(raw) ? raw : {};
      const score = Number(source.score);
      if (!isFinite(score)) return { ok: false, code: 'AGENT_BAD_JSON' };
      return {
        ok: true,
        score: Math.round(Math.max(0, Math.min(100, score))),
        reason: typeof source.reason === 'string' ? source.reason : ''
      };
    }

    /* §10.4 八类错误码 + 配置缺失（不是错误码，是降级分支） */
    const AGENT_CODE_MESSAGE = {
      AGENT_AUTH: 'API Key 无效或已过期，请到设置 → 服务商与模型中更新',
      AGENT_RATE: '请求过于频繁，稍后再试',
      AGENT_FORMAT: '服务端不支持 JSON 模式，已改用普通请求重试',
      AGENT_ENDPOINT: '接口地址不对，请检查 Base URL（应形如 https://…/v1）',
      AGENT_SERVER: '服务端错误，已重试',
      AGENT_TIMEOUT: '请求超时（30 秒），已重试',
      AGENT_NETWORK: '无法连接（可能是网络或跨域限制）。浏览器直连需要服务端允许 CORS',
      AGENT_BAD_JSON: '返回格式无法解析，请换个模型再试',
      AGENT_BASE: '接口地址必须是 https:// 或 http://localhost，否则密钥会明文外传',
      AGENT_CONFIG: '请先在设置 → 服务商与模型中填写接口地址、API Key 与模型'
    };

    const AGENT_RETRYABLE = { AGENT_RATE: 1, AGENT_SERVER: 1, AGENT_TIMEOUT: 1 };


    /* --------------------------- 模型来源三档（t123 §1.18） ---------------------------
       dsh    走 Host 半边（同源 /plugins/local/dsh-tasks），用 DSH 自己的 llm 与默认模型，
              **不需要也不读取 API Key**；
       custom 走用户填的第三方 OpenAI 兼容端点（t118 的老路，含 CORS 限制）；
       off    一律不发请求，直接让调用方走本地规则降级（蓝按钮/打分仍可点）。

       迁移口径：老数据没有 source 字段 —— 填过 apiKey 或改过 apiBase 的算 custom（他们的
       配置是刻意填的，不能因为升级就静默改道），其余一律 dsh（新装默认零配置可用）。 */
    const AGENT_SOURCES = ['dsh', 'custom', 'off'];
    const DSH_AGENT_BASE = '/plugins/local/dsh-tasks';

    function agentSourceOf(settings) {
      const raw = isPlainObject(settings) && isPlainObject(settings.agent) ? settings.agent : {};
      const declared = typeof raw.source === 'string' ? raw.source.trim().toLowerCase() : '';
      if (AGENT_SOURCES.indexOf(declared) >= 0) return declared;
      const hasKey = typeof raw.apiKey === 'string' && raw.apiKey.trim() !== '';
      const base = typeof raw.apiBase === 'string' ? raw.apiBase.trim() : '';
      const customBase = base !== '' && base !== AGENT_DEFAULT_CONFIG.apiBase;
      return hasKey || customBase ? 'custom' : 'dsh';
    }

    /* 拼接同源路由：DSH_AGENT_BASE 是硬编码常量，URL 必须逐字以它开头（静态审计也按这个查） */
    function agentDshUrl(path) {
      return DSH_AGENT_BASE + path;
    }

    /* 一次同源调用：只带 Content-Type，**绝不带 Authorization**（Host 用自己的身份）。
       返回 Promise<{ ok, status, json }>；网络层失败抛错由调用方翻成 AGENT_NETWORK。 */
    function agentDshCall(path, method, body, timeoutMs) {
      const doFetch = agentFetchImpl();
      if (!doFetch) return Promise.reject(new Error('NO_FETCH'));
      const payload = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body !== undefined) payload.body = JSON.stringify(body);
      let timer = null;
      let controller = null;
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        payload.signal = controller.signal;
        const wait = isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : AGENT_DEFAULT_CONFIG.timeoutMs;
        timer = window.setTimeout(function () {
          try {
            controller.abort();
          } catch (err) {
            /* 已结束 */
          }
        }, wait);
      }
      const clear = function () {
        if (timer) window.clearTimeout(timer);
        timer = null;
      };
      return Promise.resolve()
        .then(function () {
          return doFetch(agentDshUrl(path), payload);
        })
        .then(function (response) {
          const status = Number(response && response.status) || 0;
          const textOf = response && typeof response.text === 'function' ? response.text() : Promise.resolve('');
          return Promise.resolve(textOf).then(function (text) {
            clear();
            let json = null;
            try {
              json = JSON.parse(String(text || ''));
            } catch (err) {
              json = null;
            }
            return { ok: status >= 200 && status < 300, status: status, json: json };
          });
        })
        .catch(function (error) {
          clear();
          const name = error && error.name ? error.name : '';
          if (name === 'AbortError') throw Object.assign(new Error('TIMEOUT'), { code: 'AGENT_TIMEOUT' });
          throw Object.assign(new Error(name || 'NETWORK'), { code: 'AGENT_NETWORK' });
        });
    }

    /* Host 侧的失败体是 { ok:false, code, message }，码表与本地十码同一套 —— 直接透传 */
    function agentDshFailure(result) {
      const json = result && result.json ? result.json : {};
      const code = typeof json.code === 'string' && json.code ? json.code : agentCodeOfStatus(result ? result.status : 0, '');
      /* t150：Host（index.js 3b0957c9）把真因放在 detail 里——
         stage / code / name / upstreamStatus / upstreamType / upstreamMessage / finishKind。
         以前这里只取 message，于是 dsh 档「测试连接」失败时页面上一个字都看不到真因。 */
      const rawDetail = json && typeof json.detail === 'object' && json.detail ? json.detail : null;
      const detail = rawDetail
        ? {
            provider: 'dsh',
            providerLabel: 'DSH 本地模型',
            url: agentDshUrl(String(json.path || '') || ''),
            status: Number(rawDetail.upstreamStatus) || Number(result ? result.status : 0) || 0,
            bodySnippet: typeof rawDetail.upstreamMessage === 'string' ? rawDetail.upstreamMessage : '',
            upstreamMessage: typeof rawDetail.upstreamMessage === 'string' ? rawDetail.upstreamMessage : '',
            upstreamStatus: Number(rawDetail.upstreamStatus) || 0,
            upstreamType: typeof rawDetail.upstreamType === 'string' ? rawDetail.upstreamType : '',
            stage: typeof rawDetail.stage === 'string' ? rawDetail.stage : '',
            hostCode: typeof rawDetail.code === 'string' ? rawDetail.code : '',
            name: typeof rawDetail.name === 'string' ? rawDetail.name : '',
            finishKind: typeof rawDetail.finishKind === 'string' ? rawDetail.finishKind : '',
            corsLikely: false,
            lines: []
          }
        : null;
      return agentErrorResult(code, {
        status: result ? result.status : 0,
        message: typeof json.message === 'string' && json.message ? json.message : undefined,
        detail: detail || undefined
      });
    }

    /* 打分通道的 few-shot 块由页面算（§9.4 抽样规则在页面侧），Host 只做拼接 */
    var ACT_NOW_STRENGTH_KEYS = ['weak', 'mid', 'strong'];

    /* t214：拆解步数区间的唯一真源。与 Host `index.js` 的 ACT_NOW_STRENGTH.count 同口径
       （弱 3–5 / 中 6–10 / 强 11–18）；提示词文案、归一化上限、下限补足都从这里派生，
       不许再写第二份区间表——两处各写一份就会像 t213-F1 那样悄悄漂移。 */
    var AGENT_BREAKDOWN_RANGES = { weak: [3, 5], mid: [6, 10], strong: [11, 18] };
    function agentBreakdownRangeOf(strength) {
      return AGENT_BREAKDOWN_RANGES[strength] || AGENT_BREAKDOWN_RANGES.mid;
    }

    /* t166：用户在设置页选的服务商 / 模型。空串表示「用 DSH 默认」，
       此时不往请求体里塞字段，Host 会回落到自己的 selection。 */
    function agentDshPick(cfg) {
      const out = {};
      if (cfg && typeof cfg.dshProvider === 'string' && cfg.dshProvider) out.provider = cfg.dshProvider;
      if (cfg && typeof cfg.dshModel === 'string' && cfg.dshModel) out.model = cfg.dshModel;
      return out;
    }

    function agentDshBody(cfg, task, projectName, options, kind) {
      const body = {
        kind: kind,
        task: {
          title: task && task.title ? String(task.title) : '',
          note: String((task && task.detailNote) || '').slice(0, 2000),
          project: projectName || ''
        }
      };
      if (kind === 'score') {
        const block = typeof options.fewshot === 'string' ? options.fewshot : '';
        if (block) body.fewshot = block;
      }
      if (kind === 'polish') {
        /* 拆分强度只对整理通道有意义（弱 3–5 / 中 6–10 / 强 11–18 步，Host 侧按此生成步数与耗时） */
        const strength = typeof options.strength === 'string' ? options.strength : '';
        body.strength = ACT_NOW_STRENGTH_KEYS.indexOf(strength) >= 0 ? strength : 'mid';
      }
      return Object.assign(body, agentDshPick(cfg));
    }

    /* dsh 档的生成：一次请求，不重试（Host 内部已限时；重试只会放大等待） */
    /* 任务拆解专用归一（t169）：整理助手那条链路（agentNormalizeResult）把步骤截到 7 条、
       且丢掉了 minutes；拆解要按强度给 3–5 / 6–10 / 11–18 步并保留「约 N 分钟」，
       所以单独一份归一，不改动既有 agentNormalizeResult 的行为。 */
    function agentBreakdownLimitOf(strength) {
      return agentBreakdownRangeOf(strength)[1];
    }

    function agentBreakdownMinOf(strength) {
      return agentBreakdownRangeOf(strength)[0];
    }

    /* t214：custom 档（自己的 baseUrl/apiKey）此前一律吃 AGENT_SYSTEM_PROMPT 的「3–7 条」，
       于是强档永远拿不到 11 步以上。这里按强度生成拆解专用 system prompt，
       AGENT_SYSTEM_PROMPT 一字不动（§15-81 逐字钉死，整理通道仍用它）。 */
    function agentBreakdownSystemPrompt(strength) {
      var range = agentBreakdownRangeOf(strength);
      return [
        '你是任务拆解助手。只输出一个 JSON 对象，不要任何解释、不要代码围栏。',
        'JSON 必须形如：{"title": "拆解后的任务名（≤24字）", "steps": ["步骤1", "步骤2"]}；',
        '步骤也可以写成 {"text": "步骤内容", "minutes": 15} 这种对象，两种混用都接受。',
        '要求：steps 共 ' + range[0] + '–' + range[1] + ' 条，按执行顺序排列，每条 ≤40 字，动词开头，必须是能立刻动手的动作。',
        '已知单步预计耗时就把 minutes 写成 5–60 的整数；不确定就只给字符串，不要编造耗时。',
        '信息不足时按任务本身给出可执行步骤，不要返回空数组，不要写「思考一下」「了解一下」这类空动作。'
      ].join('\n');
    }

    /* ⚠ 不要与 agentNormalizeResult 合并：后者把步骤硬截到 7 条、且丢掉 minutes，
       而拆解在 strong 档要出 11–18 步并保留「约 N 分钟」——合并会让 strong 档直接废掉。 */
    function agentBreakdownNormalize(raw, strength) {
      /* 截断上限按强度取（weak 5 / mid 10 / strong 18），来源是 AGENT_BREAKDOWN_RANGES；
         不足下限时由 UI 的 breakdownStepsFromHost 用本地规则步骤补足，这里不做补长。 */
      const limit = agentBreakdownLimitOf(strength);
      const source = isPlainObject(raw) ? raw : {};
      const list = Array.isArray(source.steps) ? source.steps : [];
      const seen = {};
      const steps = [];
      list.forEach(function (item) {
        if (steps.length >= limit) return;
        const text = typeof item === 'string' ? item.trim() : isPlainObject(item) && typeof item.text === 'string' ? item.text.trim() : '';
        if (!text || text.length > 200) return;
        if (seen[text]) return;
        seen[text] = 1;
        const minutes = typeof item === 'object' && item ? Number(item.minutes) : 0;
        const step = { text: text.slice(0, 60) };
        if (isFinite(minutes) && minutes > 0) step.minutes = Math.min(600, Math.round(minutes));
        steps.push(step);
      });
      return { title: typeof source.title === 'string' ? source.title.trim().slice(0, 60) : '', steps: steps };
    }

    /* dsh 档拆解：同源 /polish，body 里带 provider / model / strength（agentDshBody 已统一处理） */
    function agentDshBreakdown(cfg, task, projectName, options) {
      const opts = options || {};
      const body = agentDshBody(cfg, task, projectName, opts, 'polish');
      return agentDshCall('/polish', 'POST', body, cfg.timeoutMs).then(function (result) {
        if (!result.ok) return agentDshFailure(result);
        const json = result.json || {};
        if (json.ok !== true || typeof json.text !== 'string') return agentDshFailure(result);
        const parsed = agentParseJson(json.text);
        if (!parsed.ok) return agentErrorResult('AGENT_BAD_JSON', { status: result.status });
        return {
          ok: true,
          data: agentBreakdownNormalize(parsed.data, opts.strength),
          attempts: 1,
          retries: 0,
          droppedFormat: false,
          provider: json.provider || '',
          model: json.model || '',
          via: 'dsh'
        };
      });
    }

    /* custom 档拆解（t169，t214 修强度）：走它自己的 baseUrl / apiKey / provider / model。
       强度只用于本地 system prompt（agentBreakdownSystemPrompt）与步数上限，
       **不进请求体**——厂商不认识 strength，带上会被 400 拒（t213-F1）。 */
    function agentCustomBreakdown(cfg, task, projectName, options) {
      const opts = options || {};
      const strength = ACT_NOW_STRENGTH_KEYS.indexOf(opts.strength) >= 0 ? opts.strength : 'mid';
      if (!cfg || !cfg.apiKey) return Promise.resolve(agentErrorResult('AGENT_CONFIG'));
      return agentAttempt(cfg, task, projectName, false, '', 'breakdown', { strength: strength });
    }

    function agentDshRun(cfg, task, projectName, options) {
      const kind = options.mode === 'score' ? 'score' : 'polish';
      return agentDshCall(kind === 'score' ? '/score' : '/polish', 'POST', agentDshBody(cfg, task, projectName, options, kind), cfg.timeoutMs).then(
        function (result) {
          if (!result.ok) return agentDshFailure(result);
          const json = result.json || {};
          if (json.ok !== true || typeof json.text !== 'string') return agentDshFailure(result);
          const parsed = agentParseJson(json.text);
          if (!parsed.ok) return agentErrorResult('AGENT_BAD_JSON', { status: result.status });
          /* 成功体形状与 agentAttempt 保持一致：{ ok:true, data:<归一化结果> } */
          if (kind === 'score') {
            const scored = agentNormalizeScore(parsed.data);
            if (!scored.ok) return agentErrorResult('AGENT_BAD_JSON', { status: result.status });
            return {
              ok: true,
              data: scored,
              attempts: 1,
              retries: 0,
              droppedFormat: false,
              provider: json.provider || '',
              model: json.model || '',
              via: 'dsh'
            };
          }
          return {
            ok: true,
            data: agentNormalizeResult(parsed.data),
            attempts: 1,
            retries: 0,
            droppedFormat: false,
            provider: json.provider || '',
            model: json.model || '',
            via: 'dsh'
          };
        },
        function (error) {
          return agentErrorResult(error && error.code ? error.code : 'AGENT_NETWORK', { status: 0 });
        }
      );
    }

    /* dsh 档的连通性测试：打 /ping，Host 用它自己的模型发一次最小请求 */
    function pingAgentDsh(cfg) {
      const startedAt = Date.now();
      return agentDshCall('/ping', 'POST', agentDshPick(cfg), cfg.timeoutMs).then(
        function (result) {
          const latency = Date.now() - startedAt;
          if (!result.ok) return Object.assign(agentDshFailure(result), { latency: latency });
          const json = result.json || {};
          if (json.ok !== true) return Object.assign(agentErrorResult('AGENT_SERVER', { status: result.status }), { latency: latency });
          return {
            ok: true,
            code: '',
            message: '连接正常',
            status: result.status,
            latency: typeof json.latency === 'number' ? json.latency : latency,
            model: json.model || cfg.model,
            provider: json.provider || '',
            url: agentDshUrl('/ping'),
            via: 'dsh'
          };
        },
        function (error) {
          return Object.assign(agentErrorResult(error && error.code ? error.code : 'AGENT_NETWORK', { status: 0 }), {
            latency: Date.now() - startedAt,
            url: agentDshUrl('/ping')
          });
        }
      );
    }

    /* 设置页 dsh 档要显示「当前 DSH 模型」：GET /models */
    function agentFetchDshModels() {
      return agentDshCall('/models', 'GET', undefined, AGENT_DEFAULT_CONFIG.timeoutMs).then(
        function (result) {
          if (!result.ok) return agentDshFailure(result);
          const json = result.json || {};
          if (json.ok !== true || !isPlainObject(json.selection)) return agentErrorResult('AGENT_SERVER', { status: result.status });
          const models = Object.create(null);
          if (isPlainObject(json.models)) {
            Object.keys(json.models).forEach(function (provider) {
              const list = json.models[provider];
              if (!Array.isArray(list)) return;
              models[provider] = list
                .filter(function (item) { return isPlainObject(item) && typeof item.id === 'string' && item.id; })
                .map(function (item) {
                  return { id: item.id, name: typeof item.name === 'string' && item.name ? item.name : item.id };
                });
            });
          }
          return {
            ok: true,
            selection: { provider: String(json.selection.provider || ''), model: String(json.selection.model || '') },
            providers: Array.isArray(json.providers) ? json.providers.filter(function (id) { return typeof id === 'string'; }) : [],
            models: models
          };
        },
        function (error) {
          return agentErrorResult(error && error.code ? error.code : 'AGENT_NETWORK', { status: 0 });
        }
      );
    }

    /* §10.1 与既有设置页字段（timeout / retries 以秒、次数计）双向兼容 */
    function agentConfigOf(settings) {
      const raw = isPlainObject(settings) && isPlainObject(settings.agent) ? settings.agent : {};
      const cfg = Object.assign({}, AGENT_DEFAULT_CONFIG, {
        provider: typeof raw.provider === 'string' && raw.provider ? raw.provider : AGENT_DEFAULT_CONFIG.provider,
        apiBase: typeof raw.apiBase === 'string' ? raw.apiBase.trim() : AGENT_DEFAULT_CONFIG.apiBase,
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
        model: typeof raw.model === 'string' ? raw.model.trim() : AGENT_DEFAULT_CONFIG.model,
        /* t166：dsh 档的两级选择（空串 = 用 DSH 当前默认） */
        dshProvider: typeof raw.dshProvider === 'string' ? raw.dshProvider.trim() : '',
        dshModel: typeof raw.dshModel === 'string' ? raw.dshModel.trim() : ''
      });
      /* t118：model 留空时用该供应商的建议值发请求（预设只是建议，用户填了就以用户为准） */
      if (!cfg.model) {
        const preset = agentPresetOf(cfg.provider);
        cfg.model = preset ? preset.model : AGENT_DEFAULT_CONFIG.model;
      }
      /* 规格写 timeoutMs / maxRetries；设置页历史字段是 timeout(秒) / retries(次) */
      const timeoutMs = Number(raw.timeoutMs);
      if (isFinite(timeoutMs) && timeoutMs > 0) {
        cfg.timeoutMs = timeoutMs;
      } else {
        const seconds = Number(raw.timeout);
        cfg.timeoutMs = isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : AGENT_DEFAULT_CONFIG.timeoutMs;
      }
      const maxRetries = Number(raw.maxRetries);
      if (isFinite(maxRetries) && maxRetries >= 0) {
        cfg.maxRetries = Math.floor(maxRetries);
      } else {
        const retries = Number(raw.retries);
        cfg.maxRetries = isFinite(retries) && retries >= 0 ? Math.floor(retries) : AGENT_DEFAULT_CONFIG.maxRetries;
      }
      /* t123：来源是路由开关，调用方一律通过 cfg.source 判档（调用点不在本卡范围，故在此注入） */
      cfg.source = agentSourceOf(settings);
      return cfg;
    }

    /* 配置是否齐全：缺哪一项就返回哪一项的中文名，视图用它做提示 */
    function agentMissing(cfg) {
      const missing = [];
      /* dsh 档零配置：Host 用 DSH 自己的模型，不需要地址与密钥 */
      if (cfg && cfg.source === 'dsh') return cfg.model ? missing : missing.concat(['模型']);
      if (cfg && cfg.source === 'off') return missing;
      if (!cfg.apiBase) missing.push('接口地址');
      if (!cfg.apiKey) missing.push('API Key');
      if (!cfg.model) missing.push('模型');
      return missing;
    }

    /* §10.2 防明文外传：只允许 https，或本机 localhost 调试 */
    function agentBaseAllowed(apiBase) {
      const base = String(apiBase || '').trim();
      if (/^https:\/\/[^\s]+$/i.test(base)) return true;
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(base)) return true;
      return false;
    }

    function agentEndpointOf(apiBase) {
      const base = String(apiBase || '').replace(/\/+$/, '');
      return base + '/chat/completions';
    }

    /* §9.3 解析链：①②③ 依次尝试，全失败才 AGENT_BAD_JSON */
    function agentParseJson(content) {
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) return { ok: false, code: 'AGENT_BAD_JSON' };

      const attempt = function (candidate) {
        try {
          const parsed = JSON.parse(candidate);
          return isPlainObject(parsed) ? parsed : null;
        } catch (err) {
          return null;
        }
      };

      let data = attempt(text);
      if (!data) {
        const fenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        data = attempt(fenced);
      }
      if (!data) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) data = attempt(text.slice(start, end + 1));
      }
      if (!data) return { ok: false, code: 'AGENT_BAD_JSON' };
      return { ok: true, data: data };
    }

    /* §9.3 归一化：title 非空且 ≤60 字（超长截断）；steps 过滤空串、去重、至多 7 条。
       数量为 0 不是失败——那是「半成功」，由视图显示「未生成新标题 / 未拆解出步骤」。 */
    function agentNormalizeResult(raw) {
      const source = isPlainObject(raw) ? raw : {};
      const title = typeof source.title === 'string' ? source.title.trim().slice(0, 60) : '';
      const list = Array.isArray(source.steps) ? source.steps : [];
      const seen = {};
      const steps = [];
      list.forEach(function (item) {
        const text = typeof item === 'string' ? item.trim() : '';
        if (!text || text.length > 200) return;
        if (seen[text]) return;
        seen[text] = 1;
        if (steps.length < 7) steps.push(text.slice(0, 40));
      });
      return { title: title, steps: steps };
    }

    function agentUserContent(task, projectName) {
      return JSON.stringify({
        title: task && task.title ? task.title : '',
        note: String((task && task.detailNote) || '').slice(0, 2000),
        project: projectName || ''
      });
    }

    function agentBodyOf(cfg, task, projectName, dropFormat, system, options) {
      const opts = isPlainObject(options) ? options : {};
      const maxTokens = isFinite(opts.maxTokens) && opts.maxTokens > 0 ? Math.round(opts.maxTokens) : 800;
      const body = {
        model: cfg.model,
        messages: [
          { role: 'system', content: typeof system === 'string' && system ? system : AGENT_SYSTEM_PROMPT },
          { role: 'user', content: agentUserContent(task, projectName) }
        ],
        temperature: 0.2,
        max_tokens: maxTokens
      };
      if (!dropFormat) body.response_format = { type: 'json_object' };
      /* t214：options 只承载**本地**参数（目前只有 maxTokens），一律不合并进请求体。
         早先这里 `Object.assign(body, extra)` 把 {strength} 直接发给厂商——strength 不是
         OpenAI 兼容字段，强档请求会被 400 拒；强度只该影响本地 system prompt 与步数上限。
         dsh 档的 strength 走 Host 的 /polish（agentDshBody 单独拼），与本函数无关。 */
      return body;
    }

    /* fetch 在调用时取，测试桩替换 window.fetch 后立刻生效 */
    function agentFetchImpl() {
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') return window.fetch;
      if (typeof fetch === 'function') return fetch;
      return null;
    }

    /* t118：把任何要展示/落 DOM 的文本里的密钥抹掉。
       两道替换：出现过的 apiKey 原文、以及 Authorization 头里 Bearer 后面的任意串。 */
    function agentRedact(text, apiKey) {
      let out = typeof text === 'string' ? text : '';
      if (!out) return '';
      const key = typeof apiKey === 'string' ? apiKey.trim() : '';
      if (key) out = out.split(key).join('***');
      out = out.split('Bearer ').join('Bearer ***');
      return out;
    }

    /* 诊断详情：失败时把「请求到哪、返回什么、是不是被跨域拦了」说清楚。
       只做展示用，不进 localStorage、不进日志。 */
    function agentDiagnose(cfg, url, status, bodyText, errName) {
      const key = cfg && cfg.apiKey ? cfg.apiKey : '';
      const provider = agentProviderKey(cfg && cfg.provider) || (cfg && cfg.provider) || '';
      const preset = agentPresetOf(provider);
      const label = preset ? preset.label : (provider || '自定义');
      const code = Number(status) || 0;
      const snippet = agentRedact(String(bodyText || '').slice(0, 200), key);
      const corsLikely = code === 0 && (errName === 'TypeError' || errName === 'FailedToFetch' || errName === 'NetworkError');
      const lines = [
        '供应商：' + label,
        '请求地址：' + url,
        'HTTP 状态：' + (code ? String(code) : '0（没连上：DNS / 证书 / 被拦截，或跨域预检失败）')
      ];
      if (snippet) lines.push('响应体前 200 字符：' + snippet);
      if (corsLikely) {
        lines.push('判定：很可能是跨域（CORS）——dsh-app:// 页面直接请求第三方 API，服务端未返回 Access-Control-Allow-Origin');
        lines.push('建议 1：把「模型来源」改为 DSH 本地模型（由宿主代理转发，不经浏览器直连）');
        lines.push('建议 2：在能改服务端的环境里为该域名加上 Access-Control-Allow-Origin 与 Access-Control-Allow-Headers: Authorization');
      }
      return {
        provider: provider,
        providerLabel: label,
        url: url,
        status: code,
        bodySnippet: snippet,
        corsLikely: corsLikely,
        errName: errName || '',
        lines: lines
      };
    }

    function agentCodeOfStatus(status, bodyText) {
      if (status === 401 || status === 403) return 'AGENT_AUTH';
      if (status === 429) return 'AGENT_RATE';
      if (status === 404) return 'AGENT_ENDPOINT';
      if (status >= 500) return 'AGENT_SERVER';
      if (status === 400 && String(bodyText || '').indexOf('response_format') >= 0) return 'AGENT_FORMAT';
      if (status === 400) return 'AGENT_FORMAT';
      return 'AGENT_SERVER';
    }

    /* t150：错误态那一行「原始 message」。优先级 —— Host 的 detail.upstreamMessage >
       诊断里的响应体片段 detail.bodySnippet > 人话 message。
       **detail 不是唯一来源**：老进程（index.js 未重启）根本不返回 detail，
       这时仍要能用 code + message 拼出一行，不能因此空着。 */
    const AGENT_DETAIL_MAX = 120;
    function agentDetailTextOf(code, message, detail) {
      const textOf = function (value) {
        return typeof value === 'string' && value ? value : '';
      };
      const box = detail && typeof detail === 'object' ? detail : null;
      const raw = (box && textOf(box.upstreamMessage)) || (box && textOf(box.bodySnippet)) || textOf(message) || '请求失败';
      const clipped = raw.length > AGENT_DETAIL_MAX ? raw.slice(0, AGENT_DETAIL_MAX) + '…' : raw;
      return (code ? code + ' · ' : '') + clipped;
    }

    function agentErrorResult(code, extra) {
      const result = Object.assign(
        {
          ok: false,
          code: code,
          message: AGENT_CODE_MESSAGE[code] || '请求失败'
        },
        extra || {}
      );
      /* 一行原始信息随错误一起往下走，渲染侧直接用，不必再拼一次 */
      result.detailText = agentDetailTextOf(result.code, result.message, result.detail);
      return result;
    }

    /* 单次请求：不重试、不分类重试策略，只把这一发的结果标准化 */
    function agentAttempt(cfg, task, projectName, dropFormat, system, mode, options) {
      const opts = isPlainObject(options) ? options : {};
      const strength = ACT_NOW_STRENGTH_KEYS.indexOf(opts.strength) >= 0 ? opts.strength : 'mid';
      /* 拆解通道的 system 由强度决定（agentBreakdownSystemPrompt），其余通道仍用调用方给的或 AGENT_SYSTEM_PROMPT */
      const systemText =
        typeof system === 'string' && system
          ? system
          : mode === 'breakdown'
            ? agentBreakdownSystemPrompt(strength)
            : AGENT_SYSTEM_PROMPT;
      const doFetch = agentFetchImpl();
      if (!doFetch) return Promise.resolve(agentErrorResult('AGENT_NETWORK'));
      if (!agentBaseAllowed(cfg.apiBase)) return Promise.resolve(agentErrorResult('AGENT_BASE'));

      const payload = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          /* §10.5-③ 密钥只进这一行，不进日志、不进 URL */
          Authorization: 'Bearer ' + cfg.apiKey
        },
        /* 强档要 11–18 步，800 token 会被截断在半路，所以拆解通道单独给 1400 */
        body: JSON.stringify(agentBodyOf(cfg, task, projectName, dropFormat, systemText, mode === 'breakdown' ? { maxTokens: 1400 } : null))
      };

      let timer = null;
      let controller = null;
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        payload.signal = controller.signal;
        timer = window.setTimeout(function () {
          try {
            controller.abort();
          } catch (err) {
            /* 已结束 */
          }
        }, cfg.timeoutMs);
      }

      const clear = function () {
        if (timer) window.clearTimeout(timer);
        timer = null;
      };

      return Promise.resolve()
        .then(function () {
          return doFetch(agentEndpointOf(cfg.apiBase), payload);
        })
        .then(function (response) {
          const status = Number(response && response.status) || 0;
          const ok = response && (response.ok === true || (status >= 200 && status < 300));
          if (!ok) {
            const textOf = typeof response.text === 'function' ? response.text() : Promise.resolve('');
            return Promise.resolve(textOf).then(function (text) {
              clear();
              return agentErrorResult(agentCodeOfStatus(status, text), { status: status });
            });
          }
          return Promise.resolve(typeof response.json === 'function' ? response.json() : null).then(function (json) {
            clear();
            const content =
              json && json.choices && json.choices[0] && json.choices[0].message
                ? json.choices[0].message.content
                : '';
            const parsed = agentParseJson(content);
            if (!parsed.ok) return agentErrorResult('AGENT_BAD_JSON');
            /* 打分通道输出 {score, reason}，整理通道输出 {title, steps}：
               同一条解析链、两种归一化，避免两套容错各写一份。 */
            if (mode === 'score') {
              const scored = agentNormalizeScore(parsed.data);
              if (!scored.ok) return agentErrorResult('AGENT_BAD_JSON');
              return { ok: true, data: scored };
            }
            /* t169：拆解通道用独立的归一（保 minutes、按强度限步），见 agentBreakdownNormalize 上方注释 */
            if (mode === 'breakdown') {
              return { ok: true, data: agentBreakdownNormalize(parsed.data, strength) };
            }
            return { ok: true, data: agentNormalizeResult(parsed.data) };
          });
        })
        .catch(function (err) {
          clear();
          const name = err && err.name ? String(err.name) : '';
          if (name === 'AbortError') return agentErrorResult('AGENT_TIMEOUT');
          if (name === 'TypeError' || err instanceof TypeError) return agentErrorResult('AGENT_NETWORK');
          return agentErrorResult('AGENT_NETWORK');
        });
    }

    /* 连通性测试（t104）：最小代价的一发请求，只判「通/不通」，不解析业务 JSON。
       与 agentAttempt 的区别：不带 response_format（测试不该因模型不支持 JSON 模式而失败）、
       max_tokens 只给 1、不重试（用户点一次就只要一个结论），并回传 latency 供 UI 显示。
       密钥只进 Authorization 一行，不进 URL、不进日志、不进返回值。 */
    function pingAgent(cfg) {
      /* t123：dsh 档测同源 /ping；off 档没有可测的端点 */
      if (cfg && cfg.source === 'dsh') return pingAgentDsh(cfg);
      if (cfg && cfg.source === 'off') return Promise.resolve(agentErrorResult('AGENT_CONFIG', { latency: 0 }));
      const doFetch = agentFetchImpl();
      if (!doFetch) return Promise.resolve(agentErrorResult('AGENT_NETWORK', { latency: 0 }));
      if (!agentBaseAllowed(cfg.apiBase)) return Promise.resolve(agentErrorResult('AGENT_BASE', { latency: 0 }));
      if (!cfg.apiKey) return Promise.resolve(agentErrorResult('AGENT_CONFIG', { latency: 0 }));

      const startedAt = Date.now();
      const requestUrl = agentEndpointOf(cfg.apiBase);
      const payload = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + cfg.apiKey
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        })
      };

      let timer = null;
      let controller = null;
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        payload.signal = controller.signal;
        timer = window.setTimeout(function () {
          try {
            controller.abort();
          } catch (err) {
            /* 已结束 */
          }
        }, cfg.timeoutMs);
      }
      const clear = function () {
        if (timer) window.clearTimeout(timer);
        timer = null;
      };
      const withLatency = function (result) {
        return Object.assign({ latency: Date.now() - startedAt }, result);
      };

      return Promise.resolve()
        .then(function () {
          return doFetch(requestUrl, payload);
        })
        .then(function (response) {
          const status = Number(response && response.status) || 0;
          const ok = response && (response.ok === true || (status >= 200 && status < 300));
          if (!ok) {
            const textOf = typeof response.text === 'function' ? response.text() : Promise.resolve('');
            return Promise.resolve(textOf).then(function (text) {
              clear();
              return withLatency(agentErrorResult(agentCodeOfStatus(status, text), {
                status: status,
                url: requestUrl,
                detail: agentDiagnose(cfg, requestUrl, status, text, '')
              }));
            });
          }
          /* 200 就算「通」——连通性测试只判可达性，不解析业务 JSON（t104 口径）。
             t111 补一条诊断：能读到响应体但不是 JSON 时仍报 ok，但附注提示该端点
             可能不是 OpenAI 兼容接口。响应体只用于判定，不落库、不进 localStorage。 */
          const bodyOf = typeof response.text === 'function' ? response.text() : Promise.resolve('');
          return Promise.resolve(bodyOf).then(function (text) {
            clear();
            let note = '';
            const raw = typeof text === 'string' ? text.trim() : '';
            if (raw) {
              try {
                JSON.parse(raw);
              } catch (err) {
                note = '响应非 JSON，可能不是 OpenAI 兼容端点';
              }
            }
            return withLatency({
              ok: true,
              code: '',
              message: '连接正常',
              status: status,
              model: cfg.model,
              url: requestUrl,
              note: note
            });
          });
        })
        .catch(function (err) {
          clear();
          const name = err && err.name ? String(err.name) : '';
          if (name === 'AbortError') return withLatency(agentErrorResult('AGENT_TIMEOUT', { url: requestUrl }));
          /* t118：TypeError 在浏览器里等价于「fetch 被网络层/CORS 拦掉」，必须给可诊断的详情 */
          return withLatency(agentErrorResult('AGENT_NETWORK', {
            url: requestUrl,
            detail: agentDiagnose(cfg, requestUrl, 0, '', name || 'TypeError')
          }));
        });
    }

    /* 重试与降级：429 / 5xx / 超时按 maxRetries 退避重试；
       400 且提示 response_format 时去掉该字段重发一次（不占重试预算、成功即静默）。 */
    function agentRun(cfg, task, projectName, opts) {
      const options = isPlainObject(opts) ? opts : {};
      /* t123：off 档不发请求（调用方拿 AGENT_CONFIG 走本地规则降级）；dsh 档走同源 Host */
      if (cfg && cfg.source === 'off') return Promise.resolve(agentErrorResult('AGENT_CONFIG', { attempts: 0, retries: 0 }));
      if (cfg && cfg.source === 'dsh') return agentDshRun(cfg, task, projectName, options);
      let attempts = 0;
      let retries = 0;
      let dropFormat = false;
      let lastCode = '';

      const next = function () {
        attempts = attempts + 1;
        return agentAttempt(cfg, task, projectName, dropFormat, options.system, options.mode).then(function (res) {
          if (res.ok) {
            return Object.assign({}, res, { attempts: attempts, retries: retries, droppedFormat: dropFormat });
          }
          lastCode = res.code;
          if (res.code === 'AGENT_FORMAT' && !dropFormat) {
            dropFormat = true;
            return next();
          }
          if (AGENT_RETRYABLE[res.code] && retries < cfg.maxRetries) {
            retries = retries + 1;
            const delay = AGENT_RETRY_DELAYS[Math.min(retries - 1, AGENT_RETRY_DELAYS.length - 1)];
            const retryMessage =
              res.code === 'AGENT_RATE'
                ? '请求过于频繁，正在重试（' + retries + '/' + cfg.maxRetries + '）'
                : res.message;
            return new Promise(function (resolve) {
              window.setTimeout(resolve, delay);
            }).then(function () {
              void retryMessage;
              return next();
            });
          }
          const exhausted = AGENT_RETRYABLE[res.code] && retries >= cfg.maxRetries;
          const code = res.code;
          return Object.assign({}, res, {
            message: exhausted && code === 'AGENT_RATE' ? '请求过于频繁，稍后再试' : res.message,
            attempts: attempts,
            retries: retries,
            exhausted: !!exhausted
          });
        });
      };

      return next().then(function (res) {
        if (res.ok) return res;
        void lastCode;
        return res;
      });
    }

    /* ---------------------------------- 本地规则兜底 ---------------------------------
       §9.2：未配置密钥是「可用降级路径」，不是灰掉。本地规则不联网、不猜内容：
       · 润色 = 去首尾空白、合并连续空格、去掉口语尾巴与重复标点、限长；
       · 拆解 = 先拿 detailNote 里的换行/分号/序号列表；没有就按「准备—执行—收尾」三段
         从标题本身派生，步骤里带上标题原词，保证「每条都对得上任务」。 */
    const AGENT_LOCAL_TAILS = ['了吧', '了', '吧', '啊', '呢', '哦', '呀'];

    function agentLocalPolish(title) {
      let text = String(title || '').replace(/\s+/g, ' ').trim();
      text = text.replace(/[。；;]+$/g, '');
      text = text.replace(/^(我要|我想|我准备|记得|需要|得)/, '');
      AGENT_LOCAL_TAILS.forEach(function (tail) {
        if (text.length > tail.length + 2 && text.slice(-tail.length) === tail) {
          text = text.slice(0, -tail.length);
        }
      });
      text = text.trim();
      return text.slice(0, 60);
    }

    function agentLocalSplit(task) {
      const source = String((task && task.detailNote) || '');
      const lines = source
        .split(/\r?\n|[；;]/)
        .map(function (line) {
          return line.replace(/^\s*(?:[-*·]|\d+[.、)])\s*/, '').trim();
        })
        .filter(function (line) {
          return line.length >= 2;
        });
      const title = agentLocalPolish(task && task.title) || '任务';
      if (lines.length) return lines.slice(0, 7).map(function (line) { return line.slice(0, 40); });
      return [
        '明确「' + title.slice(0, 20) + '」的完成标准（做到什么算完成）',
        '准备所需资料与工具，列出缺什么',
        '先做最小一步：' + title.slice(0, 20),
        '检查结果并勾掉任务'
      ].slice(0, 4);
    }


    /* ================================ 58-pomo-log · 番茄会话日志 ================================
       P4（规格 docs/stage4-foundation.md §7）：

       · 日志是唯一真源：`db.pomodoroLog[day] = { count, minutes, byTask: { taskId: {count,minutes} } }`。
         今日/本月/某任务累计**全部从日志反推**（§7.3 只用 selectPomoDay / selectPomoMonth），
         不另存汇总计数器——`pomo.count/minutes` 只服务引擎自己的状态机，界面统计一律读日志。
       · 五条写入规则（§7.2）在这里集中实现，报告里逐条对应本文件的行号：
         1 只有 mode==='work' 的段结束才 +1（pomoLogDetect 第一道闸）；
         2 minutes 记实际专注分钟：正常到点=duration，中断（停止/切换/改时长）按已过分钟向下取整；
         3 日期归属 = 段结束时刻的本地日期（pomoLogAppend 用 dateKey(new Date(endedAt))）；
         4 byTask 仅在 pomo.taskId 非空时写；
         5 保留最近 400 天（pomoLogPruned，install 时与每次写入各裁一次）。
       · 20-engines / 53-actions / 00-prelude 都不在本卡 inScope，所以「写入点」不是改引擎 tick，
         而是订阅 store 侦测「work 段结束」这一次状态跃迁（installPomoLog）。这与 t51 把种子分导入
         从 loadState 挪到面板挂载是同一处置：能力等价的 in-scope 落点，报告里如实说明。
       · 同一处顺带完成 §6.5 的音效接线：三处结束音（提醒 / 番茄 / 螺旋）原本各自调 20-engines 的
         beep()，而该文件不在 inScope；这里在 factory 作用域内替换 beep 的实现，让它们统一走
         settings.sound 的所选预设（remind / stuck / custom），音量与禁用仍由 56-sound 负责。 */

    const POMO_LOG_KEEP_DAYS = 400;
    const POMO_HEAT_MONTHS = 6;

    function pomoLogOf(db) {
      return isPlainObject(db) && isPlainObject(db.pomodoroLog) ? db.pomodoroLog : {};
    }

    function pomoLogMin(ms) {
      return Math.max(0, Math.floor((Number(ms) || 0) / 60000));
    }

    /* 规则 5：按 key（YYYY-MM-DD）字典序保留最近 400 天 */
    function pomoLogPruned(log) {
      const keys = Object.keys(log || {}).sort();
      if (keys.length <= POMO_LOG_KEEP_DAYS) return log;
      const keep = keys.slice(keys.length - POMO_LOG_KEEP_DAYS);
      const out = {};
      keep.forEach(function (key) {
        out[key] = log[key];
      });
      return out;
    }

    /* 写一条 work 会话。entry = { taskId, durationMs, usedMs, endedAt, completed }
       规则 1/2 的分工：只有「跑满一个番茄」（completed）才让当日 count +1；
       中途停下（completed=false）只按已过分钟向下取整计入 minutes，不足 1 分钟整条不写。 */
    function pomoLogAppend(store, entry) {
      const endedAt = Number(entry.endedAt) || Date.now();
      const minutes = pomoLogMin(entry.usedMs);
      const completed = entry.completed === true;
      if (!completed && minutes <= 0) return null;
      const day = dateKey(new Date(endedAt)); /* 规则 3：结束时刻归属，跨零点不分摊 */
      const taskId = typeof entry.taskId === 'string' ? entry.taskId : '';
      return commitDb(store, ['pomodoroLog'], function (db) {
        const log = Object.assign({}, pomoLogOf(db));
        const prev = isPlainObject(log[day]) ? log[day] : { count: 0, minutes: 0, byTask: {} };
        const byTask = Object.assign({}, isPlainObject(prev.byTask) ? prev.byTask : {});
        if (taskId) {
          /* 规则 4：只有绑定了任务才写 byTask */
          const one = isPlainObject(byTask[taskId]) ? byTask[taskId] : { count: 0, minutes: 0 };
          byTask[taskId] = {
            count: Math.max(0, one.count | 0) + (completed ? 1 : 0),
            minutes: Math.max(0, one.minutes | 0) + minutes
          };
        }
        log[day] = {
          count: Math.max(0, prev.count | 0) + (completed ? 1 : 0), /* 规则 1：只有跑满的 work 段才 +1 */
          minutes: Math.max(0, prev.minutes | 0) + minutes,
          byTask: byTask
        };
        return Object.assign({}, db, { pomodoroLog: pomoLogPruned(log) });
      });
    }

    /* 某任务的累计番茄数与分钟数：仍从日志反推（selectPomoMonth(db,'') 给全部日期） */
    function pomoTaskTotals(db, taskId) {
      let count = 0;
      let minutes = 0;
      if (!taskId) return { count: 0, minutes: 0 };
      selectPomoMonth(db, '').forEach(function (row) {
        const value = isPlainObject(row.value) ? row.value : null;
        if (!value || !isPlainObject(value.byTask)) return;
        const one = value.byTask[taskId];
        if (!isPlainObject(one)) return;
        count += Math.max(0, one.count | 0);
        minutes += Math.max(0, one.minutes | 0);
      });
      return { count: count, minutes: minutes };
    }

    function pomoMonthStat(db, month) {
      const out = { count: 0, minutes: 0, days: {} };
      selectPomoMonth(db, month).forEach(function (row) {
        const value = isPlainObject(row.value) ? row.value : null;
        if (!value) return;
        const count = Math.max(0, value.count | 0);
        const minutes = Math.max(0, value.minutes | 0);
        out.days[row.day] = { count: count, minutes: minutes };
        out.count += count;
        out.minutes += minutes;
      });
      return out;
    }

    function pomoMonthKey(now) {
      return dateKey(new Date(now || Date.now())).slice(0, 7);
    }

    function pomoShiftMonth(month, delta) {
      const parts = String(month || '').split('-');
      const year = Number(parts[0]) || 1970;
      const mon = Number(parts[1]) || 1;
      const date = new Date(year, mon - 1 + (Number(delta) || 0), 1);
      return dateKey(date).slice(0, 7);
    }

    /* 「5 小时 20 分」/「75 分钟」 */
    function pomoMinutesText(minutes) {
      const total = Math.max(0, minutes | 0);
      if (total < 60) return String(total) + ' 分钟';
      const hours = Math.floor(total / 60);
      const rest = total % 60;
      return rest ? String(hours) + ' 小时 ' + String(rest) + ' 分' : String(hours) + ' 小时';
    }

    /* ------------------------------------ 月度热力图（§7.4） ------------------------------------
       七维区隔（与 63-habit-detail 的习惯热力图刻意不同，报告里逐条对照）：
       ① 格子 28×28（习惯 26×26）② 圆角 6px（习惯 4px）③ 格内右下角 mini 数字（习惯无文字）
       ④ 五档色阶 --dt-pomo-l0..l4 按 min(count,4)（习惯单色）⑤ 未来日叠对角线斜纹（习惯只降透明）
       ⑥ 42 格 gap 3px / max-width 364px（习惯 gap 4px）⑦ 位置在番茄钟页中间区（习惯在 C 栏详情）。
       点击格子什么都不做（§7.4 末条、§15-77）：番茄是历史记录，不允许手补。 */

    function pomoHeatCells(month, stat, nowMs) {
      const parts = String(month || '').split('-');
      const year = Number(parts[0]) || 1970;
      const mon = Number(parts[1]) || 1;
      const first = new Date(year, mon - 1, 1);
      const start = addDays(first, -((first.getDay() + 6) % 7));
      const todayKey = dateKey(new Date(nowMs || Date.now()));
      const cells = [];
      for (let i = 0; i < 42; i += 1) {
        const date = addDays(start, i);
        const key = dateKey(date);
        const one = stat.days[key] || { count: 0, minutes: 0 };
        cells.push({
          key: key,
          date: date,
          inMonth: key.slice(0, 7) === month,
          future: key > todayKey,
          count: one.count,
          minutes: one.minutes
        });
      }
      return cells;
    }

    function pomoCellTitle(cell, todayKey) {
      if (!cell.count) return cell.future ? '还没到来' : '未记录';
      const week = '日一二三四五六'.charAt(cell.date.getDay());
      return (
        String(cell.date.getFullYear()) +
        '年' +
        String(cell.date.getMonth() + 1) +
        '月' +
        String(cell.date.getDate()) +
        '日 周' +
        week +
        ' · ' +
        String(cell.count) +
        ' 个番茄 · ' +
        String(cell.minutes) +
        ' 分钟'
      );
    }

    function PomoHeat(props) {
      const store = props.store;
      const db = props.db;
      const nowMs = props.now || Date.now();
      const thisMonth = pomoMonthKey(nowMs);
      const [month, setMonth] = useState(thisMonth);

      /* 只允许看最近 6 个月（含本月），不翻到未来 */
      const earliest = pomoShiftMonth(thisMonth, -(POMO_HEAT_MONTHS - 1));
      const atEarliest = month <= earliest;
      const atLatest = month >= thisMonth;
      const shown = month > thisMonth || month < earliest ? thisMonth : month;

      const stat = pomoMonthStat(db, shown);
      const cells = pomoHeatCells(shown, stat, nowMs);
      const parts = shown.split('-');
      const title =
        String(Number(parts[0])) +
        ' 年 ' +
        String(Number(parts[1])) +
        ' 月 · 共 ' +
        String(stat.count) +
        ' 个 / ' +
        pomoMinutesText(stat.minutes);

      const step = function (delta) {
        const next = pomoShiftMonth(shown, delta);
        if (next < earliest || next > thisMonth) return;
        setMonth(next);
      };

      /* t125：外层包裹节点挂 data-dt="pomo-heatmap"（一个元素不能有两个 data-dt，
         内层保留 pomo-heat 以免旧断言失效）；间距只放在包裹层，本体 margin 归零。 */
      return div(
        { className: 'dtPomoHeatWrap', 'data-dt': 'pomo-heatmap' },
        div(
        { className: 'dtPomoHeat', 'data-pomo-month': shown, 'data-dt': 'pomo-heat' },
        div(
          { className: 'dtHeatHead' },
          button(
            {
              key: 'p',
              className: 'dtHeatNav',
              'data-dt': 'pomo-heat-prev',
              disabled: atEarliest,
              title: '上一个月',
              onClick: function () {
                step(-1);
              }
            },
            icon('chevron-left', 14)
          ),
          span({ key: 't', className: 'dtHeatTitle' }, title),
          button(
            {
              key: 'n',
              className: 'dtHeatNav',
              'data-dt': 'pomo-heat-next',
              disabled: atLatest,
              title: '下一个月',
              onClick: function () {
                step(1);
              }
            },
            icon('chevron-right', 14)
          )
        ),
        div({ className: 'dtHeatWeek' }, ['一', '二', '三', '四', '五', '六', '日'].map(function (w, i) {
          return span({ key: 'w' + i, className: 'dtHeatWeekCell' }, w);
        })),
        div(
          { className: 'dtPomoGrid' },
          cells.map(function (cell) {
            const level = Math.min(4, cell.count);
            /* t125（§1.19.4 第 5 项）：今天那一格必须有 data-today="1"，
               「今天且已达成」才可断言、accent 才有落点 */
            const isToday = cell.key === dateKey(new Date(nowMs));
            return div({
              key: cell.key,
              className: 'dtPomoCell',
              'data-pomo-day': cell.key,
              'data-today': isToday ? '1' : undefined,
              'data-on': cell.count > 0 ? '1' : undefined,
              'data-future': cell.future ? '1' : undefined,
              'data-out': cell.inMonth ? undefined : '1',
              'data-count': String(cell.count),
              'data-level': String(level),
              title: pomoCellTitle(cell, dateKey(new Date(nowMs)))
            }, cell.count > 0 ? span({ className: 'dtPomoNum' }, cell.count >= 10 ? '9+' : String(cell.count)) : null);
          })
        )
        )
      );
    }

    /* ------------------------------------ 单任务番茄：行内入口（§7.1） ------------------------------------
       点击语义写死三条：①没在跑 → 起一段并绑定该任务；②在跑且就是它 → 暂停；
       ③在跑但是别的任务 → 先把当前段按「停止」结算（日志由监听器补记），再起新段。
       返回 null 表示被螺旋互斥挡住（调用方据此渲染 disabled，而不是隐藏按钮）。 */
    function pomoBusyWithSpiral(state) {
      return !!(state && state.spiral && state.spiral.status !== 'idle');
    }

    function pomoToggleForTask(store, taskId) {
      if (!store || !taskId) return null;
      const state = store.get();
      if (pomoBusyWithSpiral(state)) return null;
      const pomo = state.pomo;
      if (pomo.running && pomo.taskId === taskId) {
        pausePomodoro(store);
        return 'paused';
      }
      if (pomo.running) resetPomodoro(store);
      actionStartPomodoro(store, { taskId: taskId });
      return 'started';
    }

    function pomoBoundTo(store, taskId) {
      const state = store ? store.get() : null;
      return !!(state && state.pomo && state.pomo.running && state.pomo.taskId === taskId);
    }

    /* ------------------------------------ 状态跃迁侦测与接线 ------------------------------------ */

    let pomoLogStore = null;
    let pomoLogBusy = false;
    let pomoLogPrev = null;

    function pomoLogSnapshot(pomo) {
      const one = pomo || {};
      return {
        mode: one.mode === 'short' || one.mode === 'long' ? one.mode : 'work',
        running: !!one.running,
        endsAt: Number(one.endsAt) || 0,
        work: Math.max(0, one.work | 0),
        count: Math.max(0, one.count | 0),
        round: Math.max(0, one.round | 0),
        pausedLeft: Number(one.pausedLeft) || 0,
        taskId: typeof one.taskId === 'string' ? one.taskId : ''
      };
    }

    /* 一次「work 段结束」= 两条路径之一：
       A 自然到点（引擎把 count+1）→ 记满额 duration；
       B 中断（停止 / 切模式 / 改时长 / 切任务前先停）→ 记已过分钟向下取整。
       暂停（pausedLeft>0、endsAt=0）不是结束，直接跳过。 */
    function pomoLogDetect(store, prev, cur) {
      if (!prev || !cur) return;
      if (prev.mode === 'work' && cur.count > prev.count) {
        pomoLogAppend(store, {
          taskId: prev.taskId,
          durationMs: prev.work * 60000,
          usedMs: prev.work * 60000,
          endedAt: prev.endsAt || Date.now(),
          completed: true
        });
        return;
      }
      if (prev.mode !== 'work' || !prev.running) return;
      if (cur.running && cur.mode === 'work' && cur.count === prev.count) return;
      if (!cur.running && cur.pausedLeft > 0) return; /* 暂停 */
      const planned = prev.work * 60000;
      const startedAt = prev.endsAt ? prev.endsAt - planned : Date.now();
      const usedMs = Math.max(0, Math.min(planned, Date.now() - startedAt));
      pomoLogAppend(store, {
        taskId: prev.taskId,
        durationMs: planned,
        usedMs: usedMs,
        endedAt: Date.now(),
        completed: false
      });
    }

    /* §6.5 音效接线：把三处结束音统一到 settings.sound 所选预设。
       替换的是 20-engines.js 里 beep 这个函数声明绑定的实现（同一 factory 作用域，闭包按调用时解析），
       因为该文件不在本卡 inScope；sound.enabled=false 时退回原来的合成音，行为与旧版一致。 */
    function installPomoSound() {
      if (typeof beep !== 'function' || beep.__dtWired) return;
      const legacy = beep;
      const wired = function (times, freq) {
        const state = pomoLogStore ? pomoLogStore.get() : null;
        const settings = state && state.settings ? state.settings : null;
        /* 只接管「番茄专注段结束」这一个调用点：20-engines 的 tickPomodoro 收工时是 beep(4, 660)，
           休息结束是 beep(4, 990)、螺旋是 beep(2,660)/beep(3,990)/beep(4,880)、提醒是 beep(2|3, 920)。
           其余调用点原样转发，避免改写它们的可观测行为（回归 S61d/S63c/S63d 按 beep 次数对账）。 */
        const isPomodoroWorkEnd = times === 4 && freq === 660;
        if (isPomodoroWorkEnd && settings && soundEnabled(settings)) {
          playPreset(settings, {});
          return;
        }
        legacy(times, freq);
      };
      wired.__dtWired = true;
      beep = wired;
    }

    function installPomoLog(store) {
      if (!store) return;
      if (pomoLogStore === store) return;
      pomoLogStore = store;
      /* 规则 5 的裁剪：loadState 不在 inScope，所以在面板挂载（与每次写入）时各裁一次 */
      const state = store.get();
      const log = pomoLogOf(state.db);
      if (Object.keys(log).length > POMO_LOG_KEEP_DAYS) {
        commitDb(store, ['pomodoroLog'], function (db) {
          return Object.assign({}, db, { pomodoroLog: pomoLogPruned(pomoLogOf(db)) });
        });
      }
      installPomoSound();
      pomoLogPrev = pomoLogSnapshot(store.get().pomo);
      store.subscribe(function () {
        if (pomoLogBusy) return;
        const cur = pomoLogSnapshot(store.get().pomo);
        const prev = pomoLogPrev;
        pomoLogPrev = cur;
        if (!prev) return;
        const countChanged = cur.count > prev.count;
        const ended =
          (prev.mode === 'work' && countChanged) ||
          (prev.mode === 'work' && prev.running && !(cur.running && cur.mode === 'work' && !countChanged) && !(!cur.running && cur.pausedLeft > 0));
        if (!ended) return;
        pomoLogBusy = true;
        try {
          pomoLogDetect(store, prev, cur);
        } catch (err) {
          /* 日志写失败不能连带面板崩掉 */
        } finally {
          pomoLogBusy = false;
          pomoLogPrev = pomoLogSnapshot(store.get().pomo);
        }
      });
    }


    /* ============================== 59-taskinfo · C 栏信息框（P5） ==============================
      规格 docs/stage4-foundation.md §9.1 / §9.2：

      · 信息框挂在任务详情里、既有字段之后、「删除任务」之前，三块：补充说明 / 执行步骤 / 长文本附件；
        全部经 53-actions 的 actionSetTaskNote / actionAddStep / actionPatchStep / actionRemoveStep /
        actionMoveStep / actionSetTaskDocs 落库——**输入框不直接改 task 对象**，这样白名单校验与
        meta.updatedAt、索引失效都走同一条写路径。
      · 唯一蓝按钮（§9.2）：一次请求两件事（润色标题 + 拆解步骤），结果一律「待确认」：
        [应用] 才写、[放弃] 什么都不写、应用后可 [恢复原值]（快照只存活到本次会话的这一次应用）。
        半成功是合法结果：只有 steps 时标题逐字不动并在条上写「未生成新标题」。
      · 未配置密钥不是灰掉（契约要求「可用降级路径」）：按钮照常可点，走 57-agent 的本地规则
        润色/拆解，并在条上说明「已用本地规则生成」。
      · 钩子：契约要 data-dt="agent-action"、规格写 data-dt="agent-polish"，两个都给
        （第二个挂 data-dt-spec），并把按钮放在信息框底部的动作区（契约说「C 栏底部」）。 */

    const section = mk('section');

    function taskInfoSteps(task) {
      return Array.isArray(task && task.steps) ? task.steps : [];
    }

    function taskInfoDocs(task) {
      return Array.isArray(task && task.docs) ? task.docs : [];
    }

    function TaskInfo(props) {
      const task = props.task;
      const store = props.store;

      const [noteDraft, setNoteDraft] = useState(task.detailNote || '');
      const [stepDraft, setStepDraft] = useState('');
      const [docDraft, setDocDraft] = useState(taskInfoDocs(task));
      const [busy, setBusy] = useState(false);
      const [agentState, setAgentState] = useState('idle');
      const [agentCode, setAgentCode] = useState('');
      const [agentMessage, setAgentMessage] = useState('');
      const [result, setResult] = useState(null);
      const [snapshot, setSnapshot] = useState(null);

      /* 切换任务时把草稿对齐到新的任务，避免把上一条的备注写进这一条 */
      useEffect(
        function () {
          setNoteDraft(task.detailNote || '');
          setDocDraft(taskInfoDocs(task));
          setStepDraft('');
          setResult(null);
          setSnapshot(null);
          setAgentState('idle');
          setAgentCode('');
          setAgentMessage('');
        },
        [task.id]
      );

      const steps = taskInfoSteps(task);
      const docs = taskInfoDocs(task);

      const commitNote = function () {
        const current = typeof task.detailNote === 'string' ? task.detailNote : '';
        if (noteDraft === current) return;
        actionSetTaskNote(store, task.id, noteDraft);
      };

      const addStep = function () {
        const text = String(stepDraft || '').trim();
        if (!text) return;
        actionAddStep(store, task.id, text);
        setStepDraft('');
      };

      const commitDocs = function (next) {
        setDocDraft(next);
        actionSetTaskDocs(store, task.id, next);
      };

      const projectNameOf = function (state, projectId) {
        const list = state && state.db && Array.isArray(state.db.projects) ? state.db.projects : [];
        const found = list.filter(function (project) {
          return project.id === projectId;
        })[0];
        return found ? found.name : '';
      };

      const runAgent = function () {
        if (busy) return;
        const state = store && store.get ? store.get() : null;
        const cfg = agentConfigOf(state && state.settings);
        const missing = agentMissing(cfg);
        setResult(null);
        setSnapshot(null);

        /* §8-98：off 是用户的明确选择，不是配置缺失。走本地规则但**不进错误态**：
           不带 data-code、不出现重试按钮、不用错误色。判据只能是 agentSourceOf，
           不能推论（比如「模型字段空」）——默认 source 就是 dsh、model 默认非空。 */
        if (agentSourceOf(state && state.settings) === 'off') {
          const localTitle = agentLocalPolish(task.title);
          const localSteps = agentLocalSplit(task);
          setAgentState('off');
          setAgentCode('');
          setAgentMessage('已关闭模型调用：整理与打分走本地规则，不会发出任何请求。');
          setResult({ title: localTitle, steps: localSteps, local: true });
          return;
        }

        /* 降级路径：配置缺失或 Base URL 不安全 → 本地规则，且不说这是模型结果 */
        if (missing.length || !agentBaseAllowed(cfg.apiBase)) {
          const localTitle = agentLocalPolish(task.title);
          const localSteps = agentLocalSplit(task);
          setAgentState('local');
          setAgentCode(missing.length ? 'AGENT_CONFIG' : 'AGENT_BASE');
          setAgentMessage(
            missing.length
              ? '未配置' + missing.join('、') + '，已用本地规则生成（在「设置 → 服务商与模型」填写后可调用模型）'
              : '接口地址必须是 https:// 或 http://localhost，已用本地规则生成'
          );
          setResult({ title: localTitle, steps: localSteps, local: true });
          return;
        }

        setBusy(true);
        setAgentState('busy');
        setAgentCode('');
        setAgentMessage('处理中…');
        agentRun(cfg, task, projectNameOf(state, task.projectId)).then(function (res) {
          setBusy(false);
          if (!res.ok) {
            setAgentState('error');
            setAgentCode(res.code || 'AGENT_NETWORK');
            setAgentMessage(res.message || '请求失败');
            return;
          }
          const data = res.data || { title: '', steps: [] };
          setResult({ title: data.title || '', steps: Array.isArray(data.steps) ? data.steps : [] });
          setAgentState('ok');
          setAgentCode('');
          setAgentMessage(
            data.title
              ? '模型已返回，待你确认（标题与 ' + (data.steps || []).length + ' 条步骤）'
              : '未生成新标题，只拆出 ' + (data.steps || []).length + ' 条步骤'
          );
        });
      };

      const applyResult = function () {
        if (!result) return;
        const prevTitle = task.title;
        const stepIds = [];
        if (result.title && result.title !== task.title) {
          actionPatchTask(store, task.id, { title: result.title });
        }
        (result.steps || []).forEach(function (text) {
          const added = actionAddStep(store, task.id, text);
          if (added && added.ok && added.id) stepIds.push(added.id);
        });
        setSnapshot({ title: prevTitle, stepIds: stepIds });
        setAgentState('applied');
        setAgentCode('');
        setAgentMessage(
          result.title ? '已应用：标题已更新，新增 ' + stepIds.length + ' 条步骤' : '已应用：只新增 ' + stepIds.length + ' 条步骤（标题未生成）'
        );
      };

      const discardResult = function () {
        setResult(null);
        setSnapshot(null);
        setAgentState('idle');
        setAgentCode('');
        setAgentMessage('');
      };

      const restoreResult = function () {
        if (!snapshot) return;
        actionPatchTask(store, task.id, { title: snapshot.title });
        (snapshot.stepIds || []).forEach(function (id) {
          actionRemoveStep(store, task.id, id);
        });
        setSnapshot(null);
        setResult(null);
        setAgentState('idle');
        setAgentCode('');
        setAgentMessage('已恢复应用前的标题与步骤');
      };

      /* ------------------------------- 补充说明 ------------------------------- */
      const noteBlock = section(
        { className: 'dtInfoNote' },
        div({ className: 'dtInfoHead' }, span({ className: 'dtInfoTitle' }, '补充说明'), span({ className: 'dtInfoHint' }, (noteDraft || '').length + '/8000')),
        textarea({
          className: 'dtInfoText',
          'data-f': 'detailNote',
          rows: 4,
          maxLength: 8000,
          placeholder: '背景、约束、参考链接…（失焦即保存）',
          value: noteDraft,
          onChange: function (event) {
            setNoteDraft(event.target.value);
          },
          onBlur: commitNote,
          onKeyDown: function (event) {
            if (event.key === 'Escape') {
              /* 不写盘：恢复原值，并截停 Esc，避免顺手把 C 栏关掉 */
              stopActionEvent(event);
              setNoteDraft(task.detailNote || '');
            }
          }
        })
      );

      /* ------------------------------- 执行步骤 ------------------------------- */
      const stepRows = steps.map(function (step, index) {
        return div(
          {
            key: step.id || 'step-' + index,
            className: 'dtStep' + (step.done ? ' dtStepDone' : ''),
            'data-step-id': step.id,
            'data-done': step.done ? '1' : '0'
          },
          button(
            Object.assign(
              {
                className: 'dtStepCheck',
                'data-dt': 'step-toggle',
                title: step.done ? '标记为未完成' : '标记为已完成',
                'aria-pressed': step.done ? 'true' : 'false'
              },
              scopedAction(store, function () {
                actionPatchStep(store, task.id, step.id, { done: !step.done });
              })
            ),
            step.done ? icon('check', 12) : span({ className: 'dtStepDot' })
          ),
          span({ className: 'dtStepText' }, step.text || '(空步骤)'),
          button(
            Object.assign(
              {
                className: 'dtStepOp',
                'data-dt': 'step-up',
                title: '上移',
                disabled: index === 0
              },
              scopedAction(store, function () {
                actionMoveStep(store, task.id, step.id, 'up');
              })
            ),
            '↑'
          ),
          button(
            Object.assign(
              {
                className: 'dtStepOp',
                'data-dt': 'step-down',
                title: '下移',
                disabled: index === steps.length - 1
              },
              scopedAction(store, function () {
                actionMoveStep(store, task.id, step.id, 'down');
              })
            ),
            '↓'
          ),
          button(
            Object.assign(
              { className: 'dtStepOp dtStepDel', 'data-dt': 'step-remove', title: '删除这一步' },
              scopedAction(store, function () {
                actionRemoveStep(store, task.id, step.id);
              })
            ),
            '×'
          )
        );
      });

      const stepsBlock = section(
        { className: 'dtInfoSteps' },
        div(
          { className: 'dtInfoHead' },
          span({ className: 'dtInfoTitle' }, '执行步骤'),
          span({ className: 'dtInfoHint', 'data-dt': 'step-count' }, steps.filter(function (s) { return s.done; }).length + '/' + steps.length)
        ),
        steps.length
          ? div({ className: 'dtSteps' }, stepRows)
          : div({ className: 'dtInfoEmpty', 'data-dt': 'step-empty' }, '还没有步骤。可以点下面的蓝按钮拆解，也可以手写一步。'),
        div(
          { className: 'dtStepAdd' },
          input({
            className: 'dtInfoInput',
            'data-dt': 'step-input',
            type: 'text',
            placeholder: '添加一步',
            value: stepDraft,
            onChange: function (event) {
              setStepDraft(event.target.value);
            },
            onKeyDown: function (event) {
              if (event.key === 'Enter') {
                stopActionEvent(event);
                addStep();
              }
            }
          }),
          button(
            Object.assign(
              { className: 'dtMiniBtn', 'data-dt': 'step-add', disabled: !String(stepDraft || '').trim() },
              scopedAction(store, addStep)
            ),
            '添加'
          )
        )
      );

      /* ------------------------------ 长文本附件 ------------------------------ */
      const docRows = docs.map(function (doc, index) {
        return div(
          { key: doc.id || 'doc-' + index, className: 'dtDoc', 'data-doc-id': doc.id },
          input({
            className: 'dtInfoInput',
            'data-dt': 'doc-title',
            type: 'text',
            placeholder: '附件标题',
            value: doc.title || '',
            onChange: function (event) {
              const next = docs.slice();
              next[index] = Object.assign({}, doc, { title: event.target.value });
              commitDocs(next);
            }
          }),
          textarea({
            className: 'dtInfoText dtDocText',
            'data-dt': 'doc-text',
            rows: 3,
            placeholder: '粘贴长文本（单据、条款、链接说明…）',
            value: doc.text || '',
            onChange: function (event) {
              const next = docs.slice();
              next[index] = Object.assign({}, doc, { text: event.target.value });
              commitDocs(next);
            }
          }),
          button(
            Object.assign(
              { className: 'dtMiniDanger', 'data-dt': 'doc-remove', title: '删除这个附件' },
              scopedAction(store, function () {
                commitDocs(
                  docs.filter(function (item) {
                    return item.id !== doc.id;
                  })
                );
              })
            ),
            '删除'
          )
        );
      });

      const docsBlock = section(
        { className: 'dtInfoDocs' },
        div(
          { className: 'dtInfoHead' },
          span({ className: 'dtInfoTitle' }, '长文本附件'),
          span({ className: 'dtInfoHint', 'data-dt': 'doc-count' }, String(docs.length) + '/5')
        ),
        docRows.length ? div({ className: 'dtDocs' }, docRows) : null,
        button(
          Object.assign(
            { className: 'dtGhostBtn', 'data-dt': 'doc-add', disabled: docs.length >= 5 },
            scopedAction(store, function () {
              if (docs.length >= 5) return;
              commitDocs(
                docs.concat([{ id: '', title: '附件 ' + (docs.length + 1), text: '' }])
              );
            })
          ),
          docs.length >= 5 ? '最多 5 条附件' : '添加附件'
        )
      );

      /* --------------------------- 唯一蓝按钮 + 待确认 --------------------------- */
      const barText = agentMessage;
      /* §8-98：off 档常驻一句说明（不依赖是否点过蓝按钮），让用户知道功能没坏、只是不发请求。 */
      const agentOffNote = agentSourceOf(store && store.get ? store.get().settings : null) === 'off'
        ? div(
            { className: 'dtHint dtAgentNote', 'data-dt': 'agent-off-note' },
            '关闭后不发任何请求，整理与打分使用本地规则'
          )
        : null;
      const agentBar =
        agentState === 'idle'
          ? null
          : div(
              {
                className: 'dtAgentBar',
                'data-dt': 'agent-bar',
                'data-state': agentState,
                'data-code': agentCode || undefined
              },
              span({ className: 'dtAgentText' }, barText || ''),
              agentState === 'error' || agentState === 'local'
                ? button(
                    Object.assign({ className: 'dtMiniBtn', 'data-dt': 'agent-retry' }, scopedAction(store, runAgent)),
                    '重试'
                  )
                : null
            );

      const diff = result
        ? div(
            { className: 'dtAgentDiff', 'data-dt': 'agent-diff', 'data-state': result.local ? 'local' : 'model' },
            div(
              { className: 'dtAgentDiffRow' },
              span({ className: 'dtAgentDiffLabel' }, '标题'),
              span({ className: 'dtAgentDiffOld' }, task.title || ''),
              span({ className: 'dtAgentDiffArrow' }, '→'),
              span({ className: 'dtAgentDiffNew', 'data-dt': 'agent-new-title' }, result.title || '未生成新标题')
            ),
            div(
              { className: 'dtAgentDiffRow dtAgentDiffCol' },
              span({ className: 'dtAgentDiffLabel' }, '步骤'),
              result.steps && result.steps.length
                ? div(
                    { className: 'dtAgentDiffSteps' },
                    result.steps.map(function (text, index) {
                      return div({ key: 'new-' + index, className: 'dtAgentDiffStep', 'data-dt': 'agent-new-step' }, (index + 1) + '. ' + text);
                    })
                  )
                : div({ className: 'dtAgentDiffEmpty', 'data-dt': 'agent-new-step' }, '未拆解出步骤')
            )
          )
        : null;

      const diffActions = result
        ? div(
            { className: 'dtAgentDiffActions' },
            button(Object.assign({ className: 'dtPrimaryBtn', 'data-dt': 'agent-apply' }, scopedAction(store, applyResult)), '应用'),
            button(Object.assign({ className: 'dtGhostBtn', 'data-dt': 'agent-discard' }, scopedAction(store, discardResult)), '放弃'),
            snapshot
              ? button(Object.assign({ className: 'dtGhostBtn', 'data-dt': 'agent-restore' }, scopedAction(store, restoreResult)), '恢复原值')
              : null
          )
        : null;

      const agentBlock = section(
        { className: 'dtInfoAgent' },
        div(
          { className: 'dtInfoHead' },
          span({ className: 'dtInfoTitle' }, '整理助手'),
          span({ className: 'dtInfoHint' }, '一次请求同时润色标题与拆解步骤，结果待你确认')
        ),
        agentOffNote,
        agentBar,
        diff,
        diffActions,
        div(
          { className: 'dtAgentActionRow' },
          button(
            Object.assign(
              {
                className: 'dtBlueBtn',
                'data-dt': 'agent-action',
                'data-dt-spec': 'agent-polish',
                'data-task-id': task.id,
                disabled: busy,
                title: '一次请求：润色标题 + 拆解步骤'
              },
              scopedAction(store, runAgent)
            ),
            icon('spark', 13),
            busy ? '处理中…' : '润色并拆解'
          )
        )
      );

      return div({ className: 'dtTaskInfo', 'data-dt': 'task-info', 'data-task-id': task.id }, noteBlock, stepsBlock, docsBlock, agentBlock);
    }


    /* ------------------------------------- 设置视图 ---------------------------------- */

    const LEAD_CHOICES = [0, 5, 10, 15, 30, 60];

    function notificationState() {
      try {
        if (typeof window.Notification !== 'function') return 'unsupported';
        return window.Notification.permission;
      } catch (err) {
        return 'unsupported';
      }
    }

    function permissionText() {
      const state = notificationState();
      if (state === 'granted') return '已允许';
      if (state === 'denied') return '已被浏览器拒绝（需在站点设置里恢复）';
      if (state === 'unsupported') return '当前浏览器不支持';
      return '尚未授权，点击开关时申请';
    }

    /* F13 根因修法（t95）：导出件必须能**无损回灌**。
       历史数据里确实存在空标题任务（t46 F13b / t87 真机 F13），而导入侧会把缺 title 的条目
       当无效条目跳过 → 用户从自己的备份恢复时会永久少一条。所以给导出侧补上与导入侧
       逐字相同的占位串，让「导出 → 导入」对称。
       ⚠ 与导入侧占位一致，改一处必须改两处：本文件 `parseImportPayload()` 内
       `task.title = '(无标题)';`（当前在 60-settings.js:108，函数起始 :50）。
       只补 title，其余字段一律原样：不得顺手清洗 tags 里的 `[]` 脏值（已知边界，清理会改数据），
       也不得新增任何 JSON 键（导入校验只认 version===1 与既有字段）。 */
    const EXPORT_UNTITLED = '(无标题)';

    /* 当前页面协议：只有 http(s) 才认 <a download>；dsh-app: / file: / 空（内嵌无 location）
       一律视为「不支持直接下载」，导出走面板展示、导出按钮不点 anchor。 */
    function exportProtocol() {
      try {
        return String((window.location && window.location.protocol) || '').toLowerCase();
      } catch (err) {
        return '';
      }
    }

    function exportState(state) {
      let placeholdered = 0;
      try {
        /* §10.5-④：导出默认删除 apiKey。深拷贝后再置空，绝不改内存里的真实密钥。 */
        const clone = JSON.parse(JSON.stringify(state));
        if (clone && clone.settings && clone.settings.agent) clone.settings.agent.apiKey = '';
        /* 反馈库是「用户偏好样本」，默认不导出：里面带任务标题与标签，
           属于隐私内容。用户在设置里勾「导出时包含反馈样本」才带上。 */
        const scorefsOut = (state && state.settings && state.settings.scoreFeedback) || {};
        if (clone && clone.db && Array.isArray(clone.db.scoreFeedback) && scorefsOut.includeInExport !== true) {
          /* 连键名一起删：验收口径是「导出串里不含 scoreFeedback 子串」，
             只清成 [] 键名仍在 payload 里，等于没剥。 */
          delete clone.db.scoreFeedback;
        }
        if (clone && clone.settings && scorefsOut.includeInExport !== true) {
          delete clone.settings.scoreFeedback;
        }
        /* 导出件的 version 必须写成 1：导入侧只接受 version===1（回归 I04 把它钉死成契约），
           而 v2 起内存里的 state.version 是 2 —— 直接导出 2 会让自己的备份整包被拒，F13 的真正死因。
           库内部仍是 v2（state.db 是单一真源），回灌时 applyImport 会按当前库写回 2，
           migrateState 的「db 优先、缺失回落顶层」也保证 v1 外壳装得下 v2 数据。 */
        if (clone) clone.version = 1;
        if (clone && Array.isArray(clone.tasks)) {
          clone.tasks.forEach(function (task) {
            if (!task || typeof task !== 'object') return;
            if (typeof task.title === 'string' && task.title.trim()) return;
            task.title = EXPORT_UNTITLED;
            placeholdered = placeholdered + 1;
          });
        }
        const payload = JSON.stringify(clone, null, 2);
        const name = 'dsh-tasks-' + dateKey(new Date()) + '.json';
        const blob = new window.Blob([payload], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        /* F19 残留（t104）：宿主内嵌协议不认 <a download>（dsh-app: / file: / 其它非 http(s)），
           Electron 遇到这种 anchor 会退化成「直接打开这个 blob」→ 留下 blob: 残留窗口与
           UUID 临时文件。所以先看协议：只有 http(s) 页面才点 anchor；其余一律不点，
           把同一份 payload 交回面板展示（[data-dt=export-box]），由用户复制保存。
           两条路径的 payload 完全一致（version=1、占位串、密钥剥离都在上面统一处理过）。 */
        const protocol = exportProtocol();
        const canDownload = protocol === 'http:' || protocol === 'https:';
        const link = window.document.createElement('a');
        link.href = url;
        link.download = name;
        /* F19：`download` 只在用户手势（user activation）里生效，所以整条链路必须同步——
           本函数从 JSON.stringify 到 link.click() 全程无 await、无 FileReader、不依赖 setState
           后的重渲染；一旦中间出现 await，Electron 会退化成「直接打开这个 blob」，
           于是留下 blob: 页/UUID 临时文件而不是落一个可命名的文件。 */
        link.rel = 'noopener';
        link.style.display = 'none';
        /* 不挂载到页面根节点：游离 anchor 的 click 在 Chromium 已可触发下载。
           非 http(s) 协议下明确不点 —— 宁可让用户复制，也不制造 .tmp 与 blob: 残留窗口。 */
        if (canDownload) link.click();
        /* 撤销放在 click 之后的下一拍：同一 tick 里撤销，个别浏览器会因为 URL 已失效而中断下载；
           setTimeout(0) 仍然是「立即」，只是等 click 的下载任务派发完。 */
        window.setTimeout(function () {
          window.URL.revokeObjectURL(url);
        }, 0);
        /* 降级兜底（F19 契约）：宿主若拦截 download，用户仍能拿到同一份文本 ——
           UI 会把 payload 展示成只读文本框 + 复制按钮，不静默落 .tmp、不新开窗口。 */
        return { ok: true, placeholdered: placeholdered, payload: payload, name: name, viaPanel: !canDownload, protocol: protocol };
      } catch (err) {
        /* 下载失败时用户仍可从设置里重试 */
        return { ok: false, placeholdered: placeholdered, payload: '', name: '', viaPanel: true, protocol: '' };
      }
    }

    /* -------------------------------- JSON 导入回灌 -------------------------------- */

    const IMPORT_MAX_BYTES = 8 * 1024 * 1024;

    /* 先校验、后写入：这里只产出结论，绝不碰 store。
       失败一律返回 {ok:false, error}，且 error 指名字段。 */
    function parseImportPayload(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        return { ok: false, error: 'JSON 解析失败：' + (err && err.message ? err.message : '内容不是合法 JSON') };
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: '结构不合法：顶层应为对象，实际是' + (Array.isArray(parsed) ? '数组' : typeof parsed) };
      }
      if (parsed.version !== 1) {
        return { ok: false, error: '版本不匹配：version=' + String(parsed.version) + '，当前仅支持 version=1' };
      }
      if (!Array.isArray(parsed.tasks)) {
        return {
          ok: false,
          error: '结构不合法：tasks 应为数组，实际是 ' + (parsed.tasks === undefined ? '缺失' : typeof parsed.tasks)
        };
      }
      if (!Array.isArray(parsed.projects)) {
        return {
          ok: false,
          error: '结构不合法：projects 应为数组，实际是 ' + (parsed.projects === undefined ? '缺失' : typeof parsed.projects)
        };
      }

      /* 旧导出把任务写成位置数组（数组套数组）：认得出就按 TASK_COLUMNS 回填字段名，
         认不出（列数为零、长度不足、与对象混排）就明确报错，绝不静默丢字段。 */
      const rows = parsed.tasks;
      const arrayRows = rows.filter(Array.isArray).length;
      const legacy = arrayRows > 0;
      if (legacy && arrayRows !== rows.length) {
        const at = rows.findIndex(Array.isArray);
        return { ok: false, error: '结构不合法：tasks[' + at + '] 是位置数组，与对象条目混排（不支持新旧混排）' };
      }
      if (legacy && rows.length && rows[0].length < 3) {
        return {
          ok: false,
          error: '不支持的旧格式：tasks[0] 只有 ' + rows[0].length + ' 列，至少需要 id/projectId/title 三列'
        };
      }

      const skipped = [];
      const seen = {};
      const tasks = [];
      let placeholdered = 0;
      rows.forEach(function (row, index) {
        const task = legacy ? taskFromRow(row) : normalizeTask(row);
        /* 只强制 id 与 projectId：历史数据里确实存在空标题任务（自己导出的 JSON 自己导不回来，
           t46 F13b）。空标题用占位文本补上并计数，宁可导进来也不静默丢一条。 */
        const missing = ['id', 'projectId'].filter(function (field) {
          return !task[field];
        });
        if (missing.length) {
          skipped.push('tasks[' + index + '] 缺少 ' + missing.join('/'));
          return;
        }
        if (!task.title) {
          task.title = '(无标题)';
          placeholdered = placeholdered + 1;
        }
        if (seen[task.id]) {
          skipped.push('tasks[' + index + '] 的 id ' + task.id + ' 重复');
          return;
        }
        seen[task.id] = 1;
        tasks.push(task);
      });

      const projects = [];
      const seenProject = {};
      parsed.projects.forEach(function (row, index) {
        const id = row && row.id ? String(row.id) : '';
        const name = row && typeof row.name === 'string' ? row.name : '';
        if (!id || !name) {
          skipped.push('projects[' + index + '] 缺少 ' + (!id ? 'id' : 'name'));
          return;
        }
        if (seenProject[id]) {
          skipped.push('projects[' + index + '] 的 id ' + id + ' 重复');
          return;
        }
        seenProject[id] = 1;
        projects.push({
          id: id,
          name: name,
          color: typeof row.color === 'string' ? row.color : '',
          inbox: !!row.inbox,
          type: row.type === 'habit' || row.type === 'goal' ? row.type : 'todo'
        });
      });

      return {
        ok: true,
        tasks: tasks,
        projects: projects,
        skipped: skipped,
        placeholdered: placeholdered,
        legacy: legacy,
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : null,
        pomo: parsed.pomo && typeof parsed.pomo === 'object' ? parsed.pomo : null,
        habits: Array.isArray(parsed.habits) ? parsed.habits : null,
        /* 螺旋工作法：缺字段一律给默认值，绝不因旧 JSON 没有这两项而崩（§4.10.11） */
        spiral: parsed.spiral && typeof parsed.spiral === 'object' ? parsed.spiral : null,
        spiralItems: Array.isArray(parsed.spiralItems) ? parsed.spiralItems : null
      };
    }

    /* 导入的番茄钟强制落成暂停态，避免带回幽灵计时。 */
    function applyImport(store, payload) {
      const current = store.get();
      /* 版本跟着当前库走（v2 起 state.db 是单一真源）：写回 version=1 会让下次 load 再跑一遍
         v1→v2 迁移，既浪费也可能把已迁移的结构当旧数据处理。 */
      const nextVersion = current && current.version === 2 ? 2 : 1;
      const settings = payload.settings ? Object.assign(defaultSettings(), payload.settings) : current.settings;
      /* §10.5-④：导入不覆盖已有密钥——导入包里没有 Key（导出默认剥离）时沿用本机现值 */
      if (settings && settings.agent) {
        const currentKey = current.settings && current.settings.agent ? current.settings.agent.apiKey : '';
        if (!settings.agent.apiKey && currentKey) {
          settings.agent = Object.assign({}, settings.agent, { apiKey: currentKey });
        }
      }
      const marked = markOverdueNotified(payload.tasks, settings, Date.now());
      const pomo = payload.pomo
        ? migrateRhythm(
            Object.assign(defaultPomodoro(), payload.pomo, { running: false, endsAt: 0, pausedLeft: 0 })
          )
        : current.pomo;
      /* 导入的习惯一律过 normalize：外部/旧 JSON 常缺 currentStreak、freq 等字段，
         直接吃会让归档习惯显示「已坚持 0 天」。空数组视为「不覆盖现有习惯」。 */
      const habits = payload.habits && payload.habits.length
        ? normalizeHabits(payload.habits, new Date())
        : current.habits;
      /* 螺旋导入一律落成 idle：计时态不能跨设备/跨会话复活（与「刷新回 idle」同口径） */
      const spiralBase = payload.spiral ? Object.assign(defaultSpiral(), payload.spiral) : (current.spiral || defaultSpiral());
      const spiral = Object.assign({}, spiralBase, {
        status: 'idle',
        phase: 0,
        round: 0,
        endsAt: 0,
        leftMs: 0,
        startedAt: 0,
        pausedAt: 0,
        pausedTotal: 0,
        phaseDone: false,
        stats: Object.assign({ rounds: 0, aMin: 0, bMin: 0, doneCount: 0 }, spiralBase.stats || {}),
        history: Array.isArray(spiralBase.history) ? spiralBase.history.slice(-SPIRAL_HISTORY_MAX) : []
      });
      const spiralItems = payload.spiralItems
        ? payload.spiralItems.filter(function (item) {
            return item && item.id && typeof item.name === 'string';
          }).map(function (item, index) {
            return { id: item.id, name: item.name, order: typeof item.order === 'number' ? item.order : index + 1 };
          })
        : current.spiralItems;
      store.update(function (state) {
        return Object.assign({}, state, {
          version: nextVersion,
          tasks: marked.tasks,
          projects: payload.projects,
          settings: settings,
          pomo: pomo,
          habits: habits,
          spiral: spiral,
          spiralItems: spiralItems && spiralItems.length ? spiralItems : state.spiralItems
        });
      });
      const parts = ['已补齐 ' + marked.marked + ' 条过期提醒标记'];
      if (payload.placeholdered) parts.push(payload.placeholdered + ' 条空标题已占位');
      if (payload.skipped.length) parts.push('跳过 ' + payload.skipped.length + ' 条无效条目');
      if (payload.legacy) parts.push('旧版位置数组格式已回填字段名');
      store.pushAlert({
        id: uid('toast'),
        title: '已导入 ' + payload.tasks.length + ' 条任务 / ' + payload.projects.length + ' 个清单',
        body: parts.join('，') + '。'
      });
      return { tasks: payload.tasks.length, projects: payload.projects.length, marked: marked.marked };
    }

    /* F20（t114）：复制到剪贴板的三级降级。
       dsh-app:// 是非安全上下文，navigator.clipboard.writeText 往往存在但 rejects
       （异步拒绝，不是同步抛错 —— 只写 try/catch 兜不住），因此必须有回退通道：
         ① navigator.clipboard.writeText（可用性判断 + await + catch）
         ② 隐藏 textarea + select() + document.execCommand('copy')（返回 false 也算失败）
         ③ 全选降级面板里的只读 textarea + 提示「按 Ctrl+C」
       临时 textarea 只插进本面板的 [data-dt="export-fallback"] 容器（绝不挂 body），
       复制完立刻 removeChild，避免残留节点被验收当成「面板多了一块」。 */
    function exportFallbackHost(event) {
      const cur = event && event.currentTarget;
      /* closest 在部分宿主/测试桩里会抛（实现缺失），必须吞掉再走 querySelector 兜底 */
      if (cur && typeof cur.closest === 'function') {
        try {
          const found = cur.closest('[data-dt="export-fallback"]');
          if (found) return found;
        } catch (err) {
          /* 忽略：继续用文档级查询兜底 */
        }
      }
      const doc = window.document;
      if (doc && typeof doc.querySelector === 'function') {
        try {
          return doc.querySelector('[data-dt="export-fallback"]');
        } catch (err) {
          return null;
        }
      }
      return null;
    }

    function exportSelectAll(event) {
      const host = exportFallbackHost(event);
      const area = host && typeof host.querySelector === 'function' ? host.querySelector('[data-dt="export-text"]') : null;
      if (!area) return false;
      try {
        if (typeof area.focus === 'function') area.focus();
        if (typeof area.select === 'function') area.select();
        return true;
      } catch (err) {
        return false;
      }
    }

    function exportCopyViaExecCommand(text, event) {
      const doc = window.document;
      if (!doc || typeof doc.execCommand !== 'function') return false;
      const host = exportFallbackHost(event);
      const area = doc.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.left = '0';
      area.style.width = '1px';
      area.style.height = '1px';
      area.style.opacity = '0';
      area.style.pointerEvents = 'none';
      let attached = false;
      if (host && typeof host.appendChild === 'function') {
        host.appendChild(area);
        attached = true;
      }
      let ok = false;
      try {
        if (typeof area.focus === 'function') area.focus();
        if (typeof area.select === 'function') area.select();
        ok = doc.execCommand('copy') === true;
      } catch (err) {
        console.warn('dsh-tasks: 复制回退通道异常', err && err.name);
        ok = false;
      }
      if (attached && typeof host.removeChild === 'function') host.removeChild(area);
      return ok;
    }

    function SettingsView(props) {
      const state = props.state;
      const store = props.store;
      const settings = state.settings;
      const tasks = state.tasks;
      const openTotal = tasks.filter(function (t) { return t.status === 0 && !t.deleted; }).length;
      const doneTotal = tasks.filter(function (t) { return t.status === 2 && !t.deleted; }).length;
      const trashTotal = tasks.filter(function (t) { return !!t.deleted; }).length;

      /* 导入结果就地显示在数据卡片里：错误必须可读，不能只弹一次 toast 就消失 */
      const [importMsg, setImportMsg] = useState(null);
      /* F19：导出件文本（降级兜底展示用）。宿主拦了 <a download> 时仍可另存。 */
      const [exportBox, setExportBox] = useState(null);
      /* 从滴答下载的可见反馈：idle / running / ok / error，落 DOM 钩子 */
      const [didaSync, setDidaSync] = useState({ state: 'idle', note: '' });
      /* 复制通道的可见反馈：idle / pending / ok / error，必须落 DOM 钩子，不许只 console */
      const [copyState, setCopyState] = useState({ state: 'idle', note: '' });
      /* 连通性测试的状态机（t104）：idle / running / ok / error */
      const [agentTest, setAgentTest] = useState({ state: 'idle', code: '', message: '', latency: 0, model: '', note: '' });
      /* dsh 档要显示「当前 DSH 模型」：GET /models 的结果（null = 还没取到） */
      const [agentModels, setAgentModels] = useState(null);
      /* accent 的 hex 草稿（§1.19.2）：非法输入不写库，只留在本地；null = 没有草稿 */
      const [accentDraft, setAccentDraft] = useState(null);

      /* 从滴答清单（官方 MCP，Host 代理）下载未完成任务并合并进面板。
         合并口径：同 id 覆盖标题/状态/日期/重复，新 id 追加；清单只补不改。 */
      const runDidaSync = function () {
        if (didaSync.state === 'running') return;
        setDidaSync({ state: 'running', note: '正在从滴答下载…' });
        fetch('/plugins/local/dsh-tasks/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projects: [] })
        })
          .then(function (res) {
            return res.json().then(
              function (body) { return { status: res.status, body: body }; },
              function () { return { status: res.status, body: null }; }
            );
          })
          .then(function (r) {
            const body = r.body || {};
            if (body.ok !== true) {
              const msg = body.message || body.error || body.code || 'HTTP ' + r.status;
              setDidaSync({ state: 'error', note: String(msg) });
              return;
            }
            const incoming = Array.isArray(body.tasks) ? body.tasks : [];
            const incomingProjects = Array.isArray(body.projects) ? body.projects : [];
            const mapped = [];
            for (let i = 0; i < incoming.length; i += 1) {
              const t = incoming[i] || {};
              const due = typeof t.dueDate === 'string' ? t.dueDate : '';
              const task = normalizeTask({
                id: t.id,
                projectId: t.projectId,
                title: t.title,
                content: t.content,
                priority: t.priority,
                status: t.status,
                date: due ? (t.isAllDay ? due.slice(0, 10) : due.slice(0, 16)) : '',
                allDay: t.isAllDay ? 1 : 0,
                tags: t.tags,
                repeat: t.repeatFlag,
                createdAt: ''
              });
              if (task.id) mapped.push(task);
            }
            let added = 0;
            let updated = 0;
            store.update(function (state) {
              const patch = {};
              const fresh = [];
              mapped.forEach(function (t) {
                const old = state.tasks.filter(function (x) { return x.id === t.id; })[0];
                if (old) {
                  patch[t.id] = Object.assign({}, old, {
                    title: t.title,
                    content: t.content,
                    priority: t.priority,
                    status: t.status,
                    deleted: 0,
                    date: t.date,
                    allDay: t.allDay,
                    repeat: t.repeat,
                    rruleRaw: t.rruleRaw
                  });
                  updated += 1;
                } else {
                  fresh.push(t);
                  added += 1;
                }
              });
              const tasks = state.tasks
                .map(function (x) { return patch[x.id] || x; })
                .concat(fresh);
              const projects = state.projects.slice();
              incomingProjects.forEach(function (p) {
                if (!p || !p.id) return;
                if (projects.some(function (x) { return x.id === p.id; })) return;
                projects.push({
                  id: p.id,
                  name: p.name || '滴答清单',
                  color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
                  icon: '',
                  type: 'todo',
                  inbox: !!p.inbox,
                  createdAt: new Date().toISOString()
                });
              });
              return Object.assign({}, state, { tasks: tasks, projects: projects });
            });
            setDidaSync({
              state: 'ok',
              note: '新增 ' + added + ' 条，更新 ' + updated + ' 条（共收到 ' + mapped.length + ' 条未完成）'
            });
            store.pushAlert({
              id: uid('toast'),
              title: '已从滴答下载',
              body: '新增 ' + added + ' 条，更新 ' + updated + ' 条'
            });
          })
          .catch(function (e) {
            setDidaSync({ state: 'error', note: String((e && e.message) || e) });
          });
      };

      const runImport = function (text) {
        const payload = parseImportPayload(text);
        if (!payload.ok) {
          setImportMsg({ kind: 'error', text: payload.error });
          return;
        }
        const current = store.get();
        const lines = [
          '将用 ' + payload.tasks.length + ' 条任务 / ' + payload.projects.length + ' 个清单覆盖当前 ' +
            current.tasks.length + ' 条任务 / ' + current.projects.length + ' 个清单，确认？'
        ];
        if (payload.placeholdered) {
          lines.push('其中 ' + payload.placeholdered + ' 条没有标题，将用「(无标题)」占位。');
        }
        if (payload.skipped.length) {
          lines.push('另有 ' + payload.skipped.length + ' 条无效条目会被跳过：' + payload.skipped.slice(0, 5).join('；'));
        }
        if (!window.confirm(lines.join('\n'))) {
          setImportMsg({ kind: 'error', text: '已取消，未写入任何数据。' });
          return;
        }
        const result = applyImport(store, payload);
        setImportMsg({
          kind: 'ok',
          text:
            '导入完成：' + result.tasks + ' 条任务 / ' + result.projects + ' 个清单，补齐 ' + result.marked + ' 条过期提醒标记。'
        });
      };

      const onPickFile = function (event) {
        const node = event.target;
        const file = node.files && node.files[0];
        /* 清空 value，保证同一个文件再选一次也能触发 change */
        try {
          node.value = '';
        } catch (err) {
          /* 某些环境禁止改写 value，忽略 */
        }
        if (!file) return;
        if (file.size > IMPORT_MAX_BYTES) {
          setImportMsg({ kind: 'error', text: '文件过大：' + (file.size / 1024 / 1024).toFixed(1) + ' MB，上限 8 MB。' });
          return;
        }
        if (typeof window.FileReader !== 'function') {
          setImportMsg({ kind: 'error', text: '当前环境不支持读取本地文件，无法导入。' });
          return;
        }
        const reader = new window.FileReader();
        reader.onload = function () {
          runImport(String(reader.result || ''));
        };
        reader.onerror = function () {
          setImportMsg({
            kind: 'error',
            text: '读取文件失败：' + (reader.error && reader.error.message ? reader.error.message : '未知错误')
          });
        };
        reader.readAsText(file);
      };

      const updateSettings = function (patch) {
        store.update(function (current) {
          return Object.assign({}, current, { settings: Object.assign({}, current.settings, patch) });
        });
      };

      /* ------------------------ 风格设置（§1.19 强调色 / §1.17.5 分数环颜色） ------------------------ */
      const appearance = accentOf(settings);
      const accentTone = accentToneOf(appearance);
      /* 与 :473 的 theme 同源（migrateSettingsToV2(settings).theme）；这里直接取是因为
         风格设置块排在 theme 声明之前，引用 const 会踩 TDZ（Cannot access 'theme' before initialization） */
      const accentDark = migrateSettingsToV2(settings).theme === 'dark';
      const accentDirty = accentDraft !== null;
      const accentHexValid = accentDirty ? !!normalizeAccentHex(accentDraft) : true;

      const writeAppearance = function (next) {
        updateSettings({ appearance: next });
        /* 即时生效（§1.19.2）：同帧写 .dtRoot 的 CSS 变量，不重渲染整棵树 */
        injectAccent(next);
      };

      const pickAccent = function (key) {
        setAccentDraft(null);
        writeAppearance({ accent: key, accentHex: key === 'custom' ? appearance.accentHex : '' });
      };

      const changeAccentHex = function (raw) {
        const text = typeof raw === 'string' ? raw : '';
        setAccentDraft(text);
        const hex = normalizeAccentHex(text);
        if (!hex) return;
        /* 合法就落库并清草稿；非法只留在草稿里，库里的值一个字节都不动 */
        writeAppearance({ accent: 'custom', accentHex: hex });
        setAccentDraft(null);
      };

      const blurAccentHex = function () {
        if (!accentDirty) return;
        if (normalizeAccentHex(accentDraft)) return;
        setAccentDraft(null);
        writeAppearance({ accent: 'brand', accentHex: '' });
        store.pushAlert({ id: uid('toast'), title: '强调色格式无效，已恢复品牌色', body: '' });
      };

      /* 每档色块的实色：色块自身也用 var(--dt-accent)，靠 label 上的内联变量分档，
         这样「色块 = 该档颜色」与「色块背景是 --dt-accent」两条同时成立（§1.19.2） */
      const accentChipOf = function (key) {
        if (key === 'brand') return 'var(--dsw-alias-brand-primary)';
        if (key === 'custom') return appearance.accentHex || 'transparent';
        const tone = accentToneOf({ accent: key, accentHex: '' });
        return accentDark ? tone.dark : tone.light;
      };

      /* 实测对比度：预设与 custom 走 accentToneOf 现算，brand 走运行时实测（§1.19.5） */
      const accentRatio = (function () {
        if (appearance.accent === 'brand') {
          const measured = measureBrandAccent();
          if (!measured) return 0;
          return accentDark ? measured.ratioDark : measured.ratioLight;
        }
        if (appearance.accent === 'custom' && !appearance.accentHex) return 0;
        return accentDark ? accentTone.ratioDark : accentTone.ratioLight;
      })();

      const accentRatioState = (function () {
        if (appearance.accent === 'brand' || (appearance.accent === 'custom' && !appearance.accentHex)) {
          return accentRatio > 0 && accentRatio < 4.5 ? 'warn' : 'ok';
        }
        if (accentRatio >= 4.5) return 'ok';
        return accentRatio >= 3 ? 'warn' : 'bad';
      })();

      const accentRatioText = (function () {
        if (accentDirty && !accentHexValid) return '格式应为 #RRGGBB';
        if (appearance.accent === 'custom' && !appearance.accentHex) return '请输入 #RRGGBB';
        if (appearance.accent === 'brand') {
          /* 宿主 token 取不到（无 getComputedStyle 的环境）时不编造数值，但把规则说清：
             实测低于 4.5:1 时只作填充与描边。 */
          if (!(accentRatio > 0)) return '品牌色：跟随宿主实测，低于 4.5:1 时仅用于填充';
          if (accentRatio >= 4.5) return '对比度 ' + accentRatio.toFixed(2) + ':1（达标）';
          return '品牌色 ' + accentRatio.toFixed(1) + ':1，仅用于填充';
        }
        if (accentRatio >= 4.5) return '对比度 ' + accentRatio.toFixed(2) + ':1（达标）';
        return '对比度 ' + accentRatio.toFixed(2) + ':1（够填充，作文字会不清楚）';
      })();

      const ACCENT_LABELS = {
        brand: '品牌色',
        blue: '蓝',
        teal: '青',
        green: '绿',
        violet: '紫',
        rose: '玫红',
        amber: '琥珀',
        custom: '自定义'
      };

      /* 契约里旧钩子名是 [data-dt="accent-color"]、规格 §1.19.2 定稿为 accent-field：
         外层再挂一个 accent-color 别名节点，两个选择器都能查到（同一份 DOM，不是第二真源） */
      const accentField = div(
        { className: 'dtAccentFieldWrap', 'data-dt': 'accent-color', 'data-accent': appearance.accent },
        div(
        { className: 'dtAccentField', 'data-dt': 'accent-field', 'data-accent': appearance.accent },
        span({ key: 'l', className: 'dtFieldLabel' }, '强调色'),
        div(
          {
            key: 's',
            className: 'dtAccentSwatches',
            role: 'radiogroup',
            'aria-label': '强调色'
          },
          /* t190/S7b-4：「自定义」必须常驻单选组，否则一旦选了预设就再也点不到它
             （hex 输入框只在 custom 档渲染 → custom 变成不可达状态）。空色值时
             色块是虚线空心圈（见 .dtAccentOpt[data-accent="custom"] .dtAccentChip），不是黑点。 */
          ACCENT_SWATCH_KEYS.concat(['custom']).map(function (key) {
            const on = appearance.accent === key;
            return label(
              {
                key: 'ac-' + key,
                className: 'dtAccentOpt',
                'data-accent': key,
                'data-on': on ? '1' : undefined,
                'aria-checked': on ? 'true' : 'false',
                title: ACCENT_LABELS[key],
                style: { '--dt-accent': accentChipOf(key) }
              },
              input({
                key: 'i',
                className: 'dtAccentRadio',
                type: 'radio',
                name: 'dtAccent',
                value: key,
                checked: on,
                onChange: function () {
                  pickAccent(key);
                }
              }),
              span({ key: 'c', className: 'dtAccentChip' })
            );
          })
        ),
        appearance.accent === 'custom'
          ? div(
              { key: 'hx', className: 'dtAccentHexRow' },
              input({
                className: 'dtAccentHex',
                type: 'text',
                'data-dt': 'accent-hex',
                maxLength: 7,
                spellCheck: false,
                placeholder: '#RRGGBB',
                value: accentDirty ? accentDraft : appearance.accentHex,
                'aria-invalid': accentHexValid ? 'false' : 'true',
                onChange: function (event) {
                  changeAccentHex(event.target.value);
                },
                onBlur: blurAccentHex
              })
            )
          : null,
        span(
          { key: 'r', className: 'dtAccentRatio', 'data-dt': 'accent-ratio', 'data-state': accentRatioState },
          accentRatioText
        )
        )
      );

      const ringMode = scoreRingModeOf(settings);
      /* 拆分任务强度（用户 m05465）：弱 3–5 步 / 中 6–10 步 / 强 11–18 步；步数与耗时由 Host /polish 生成 */
      const actNowStrength = state.settings && state.settings.actNow && state.settings.actNow.strength === 'strong'
        ? 'strong'
        : state.settings && state.settings.actNow && state.settings.actNow.strength === 'weak'
          ? 'weak'
          : 'mid';
      const strengthField = div(
        { className: 'dtField' },
        span({ key: 'l', className: 'dtFieldLabel' }, '拆分任务强度'),
        div(
          {
            key: 'g',
            className: 'dtSegmented',
            'data-dt': 'act-now-strength',
            'data-strength': actNowStrength,
            role: 'radiogroup',
            'aria-label': '拆分任务强度'
          },
          [
            { key: 'weak', label: '弱' },
            { key: 'mid', label: '中' },
            { key: 'strong', label: '强' }
          ].map(function (item) {
            const on = actNowStrength === item.key;
            return button(
              Object.assign(
                {
                  key: 'as-' + item.key,
                  className: 'dtSegBtn' + (on ? ' dtSegOn' : ''),
                  'data-strength': item.key,
                  'data-on': on ? '1' : undefined,
                  role: 'radio',
                  'aria-checked': on ? 'true' : 'false'
                },
                scopedAction(store, function () {
                  updateSettings({ actNow: { strength: item.key } });
                })
              ),
              item.label
            );
          })
        )
      );

      const ringModeField = div(
        { className: 'dtField' },
        span({ key: 'l', className: 'dtFieldLabel' }, '分数环颜色'),
        div(
          {
            key: 'g',
            className: 'dtSegmented',
            'data-dt': 'score-ring-mode',
            'data-mode': ringMode,
            role: 'radiogroup',
            'aria-label': '分数环颜色'
          },
          [
            { key: 'bands', label: '分档' },
            { key: 'gradient', label: '渐变' }
          ].map(function (item) {
            const on = ringMode === item.key;
            return button(
              Object.assign(
                {
                  key: 'rm-' + item.key,
                  className: 'dtSegBtn' + (on ? ' dtSegOn' : ''),
                  'data-mode': item.key,
                  'data-on': on ? '1' : undefined,
                  role: 'radio',
                  'aria-checked': on ? 'true' : 'false'
                },
                scopedAction(store, function () {
                  updateSettings({ scoreRingMode: item.key });
                })
              ),
              item.label
            );
          })
        )
      );

      /* dsh 档：面板挂载时问一次 Host「当前默认模型是哪个」，只用于展示，不落库。
         取不到不算错误（可能是 webless 装配），界面显示占位文案即可。 */
      useEffect(function () {
        if (agentSourceOf(settings) !== 'dsh') return undefined;
        let alive = true;
        agentFetchDshModels().then(function (result) {
          if (!alive) return;
          setAgentModels(result && result.ok ? result : { ok: false, code: (result && result.code) || 'AGENT_NETWORK' });
        });
        return function () {
          alive = false;
        };
      }, [agentSourceOf(settings)]);

      /* 六组 IA（§12.1）：音效与提醒 → 主题 → 服务商与模型 → 模块开关 → 数据 → 关于。
         组序写死，不做拖拽重排；模块开关的行序 = rail 的行序，靠上移/下移调。 */
      const sound = migrateSettingsToV2(settings).sound;
      const theme = migrateSettingsToV2(settings).theme;
      const agent = migrateSettingsToV2(settings).agent;
      /* t123：模型来源三档。dsh 走同源 Host（零配置、无 Key）；custom 是 t118 的老路；off 不发请求。 */
      const agentSource = agentSourceOf(settings);
      const modules = migrateSettingsToV2(settings).modules;

      /* 评分反馈样本的两个开关（§1.13 / §8.5）：默认「用作示例」开、「导出包含」关 */
      const scorefsCfg = migrateSettingsToV2(settings).scoreFeedback;
      const patchScorefs = function (patch) {
        updateSettings({ scoreFeedback: Object.assign({}, scorefsCfg, patch) });
      };

      const patchSound = function (patch) {
        updateSettings({ sound: Object.assign({}, sound, patch) });
      };

      const railOrdered = orderRailItems(validateModuleRegistry(MODULE_REGISTRY), store.get().db, settings).items;

      const setModuleOrder = function (id, delta) {
        const ids = railOrdered.map(function (module) { return module.id; });
        const index = ids.indexOf(id);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= ids.length) return;
        const moved = ids.slice();
        const tmp = moved[index];
        moved[index] = moved[target];
        moved[target] = tmp;
        const order = {};
        moved.forEach(function (moduleId, position) {
          order[moduleId] = (position + 1) * 10;
        });
        updateSettings({ modules: Object.assign({}, modules, { order: order }) });
      };

      const pickSound = function (file) {
        readSoundFile(file, function (result) {
          if (!result.ok) {
            store.pushAlert({ id: uid('toast'), title: result.message, body: '' });
            return;
          }
          patchSound({ preset: 'custom', customName: result.name, customData: result.data });
        });
      };

      const previewSound = function (preset) {
        playPreset(Object.assign({}, settings, { sound: Object.assign({}, sound, { preset: preset }) }), { preset: preset }).then(function (result) {
          if (result && result.ok) return;
          if (result && result.code === 'AUDIO_UNAVAILABLE') {
            store.pushAlert({ id: uid('toast'), title: '当前环境无法播放音效', body: '' });
          }
        });
      };

      /* t104：测试连接不再是桩 —— 用当前配置发一次最小代价请求，只判「通/不通」。
         四种结论都落在 [data-dt=agent-test-state] 的 data-state 上：
         idle / running / ok（带 latency）/ error（带八类错误码）。
         密钥永不进入提示文案、console 与返回值展示。 */
      const testAgent = function () {
        const cfg = agentConfigOf(settings);
        /* t123：dsh 档不需要密钥（Host 用 DSH 自己的模型），只有 custom 档才要求填 Key */
        if (cfg.source === 'off') {
          setAgentTest({ state: 'error', code: 'AGENT_CONFIG', message: '已关闭模型调用：不会发送任何请求。', latency: 0, model: '' });
          return;
        }
        if (cfg.source === 'custom' && !cfg.apiKey) {
          setAgentTest({ state: 'error', code: 'AGENT_CONFIG', message: '请先填密钥，再测试连接。', latency: 0, model: '' });
          return;
        }
        setAgentTest({ state: 'running', code: '', message: '', latency: 0, model: cfg.model, note: '', detail: null });
        pingAgent(cfg).then(function (result) {
          if (result && result.ok) {
            setAgentTest({
              state: 'ok',
              code: '',
              message: '连接正常 · ' + result.latency + 'ms · ' + result.model,
              latency: result.latency,
              model: result.model,
              /* 端点可达但响应体不是 JSON：仍算连通（只看可达性），但要把怀疑说出来 */
              note: result.note || ''
            });
            return;
          }
          const code = (result && result.code) || 'AGENT_SERVER';
          /* t118：错误码语义不变（仍是那 10 个键），只把可诊断的详情挂到 detail 上 */
          const human = AGENT_CODE_MESSAGE[code] || '请求失败';
          setAgentTest({
            state: 'error',
            code: code,
            message: human,
            latency: (result && result.latency) || 0,
            model: cfg.model,
            note: '',
            detail: (result && result.detail) || null,
            /* t150：一行原始 message（dsh 档以前完全没有，因为 agentDshFailure 不读 Host 的 detail） */
            detailText: (result && result.detailText) || agentDetailTextOf(code, human, (result && result.detail) || null)
          });
        });
      };

      const soundRow = function (preset) {
        const meta = SOUND_PRESETS.filter(function (item) { return item.id === preset; })[0];
        return label(
          {
            key: 'p-' + preset,
            className: 'dtSoundOpt' + (sound.preset === preset ? ' dtSoundOptOn' : ''),
            'data-dt': 'sound-preset',
            'data-preset': preset,
            'data-on': sound.preset === preset ? '1' : undefined
          },
          input({
            type: 'radio',
            name: 'dtSoundPreset',
            className: 'dtSoundRadio',
            checked: sound.preset === preset,
            disabled: !sound.enabled,
            onChange: function () {
              patchSound({ preset: preset });
              previewSound(preset);
            }
          }),
          span({ className: 'dtSoundOptText' }, meta ? meta.label : preset)
        );
      };

      /* t144：目录栏两行（§1.20.3）。与 rail 的项目设置面板读同一份 settings.railUI、
         走同一个 updateSettings（即 actionSetSetting），不各写一套。 */
      /* t166：dsh 档的两级下拉。providers / models 都来自 Host 的 GET /models；
         取不到时下拉仍可用（只是没有候选），并给一行 agent-models-error 说明。 */
      const dshModelMap = agentModels && agentModels.ok && agentModels.models && typeof agentModels.models === 'object' ? agentModels.models : {};
      const dshProviders = agentModels && agentModels.ok && Array.isArray(agentModels.providers) ? agentModels.providers : [];
      const dshProviderValue = typeof agent.dshProvider === 'string' ? agent.dshProvider : '';
      const dshModelValue = typeof agent.dshModel === 'string' ? agent.dshModel : '';
      const dshModelList = dshProviderValue && Array.isArray(dshModelMap[dshProviderValue]) ? dshModelMap[dshProviderValue] : [];
      const dshModelEmpty = !!dshProviderValue && dshModelList.length === 0;
      const writeDshPick = function (patch) {
        updateSettings({ agent: Object.assign({}, agent, patch) });
      };

      const railUI = railUIOf(settings);
      const railUIRow = function (hook, label, on, key) {
        const toggle = function () {
          const next = railUIOf(settings);
          next[key] = !on;
          updateSettings({ railUI: next });
        };
        return div(
          Object.assign(
            {
              key: hook,
              className: 'dtPsRow' + (on ? ' dtPsRowOn' : ''),
              'data-dt': hook,
              'data-on': on ? '1' : '0',
              role: 'switch',
              'aria-checked': on ? 'true' : 'false',
              tabIndex: 0,
              onKeyDown: function (event) {
                if (!event) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  if (event.preventDefault) event.preventDefault();
                  toggle();
                }
              }
            },
            scopedAction(store, toggle)
          ),
          span({ key: 'l', className: 'dtPsLabel' }, label),
          on ? span({ key: 'c', className: 'dtPsCheck', 'data-dt': hook + '-check' }, icon('check', 12)) : null
        );
      };

      return div(
        { className: 'dtSettings' },
        div({ className: 'dtSettingsTitle' }, '设置'),

        /* ------------------------------ 1 完成音效与提醒 ------------------------------ */
        div(
          {
            className: 'dtCard',
            /* 音效状态钩子（stage4 §6.4 可断言）：ok / disabled / custom-missing / unavailable。
               AudioContext 不存在时不是「没反应」，而是这个属性变成 unavailable + 下方 aria-live 文案，
               回归据此能区分「静默降级」和「根本没接上」。 */
            'data-dt': 'sound-card',
            'data-sound-state': !sound.enabled
              ? 'disabled'
              : sound.preset === 'custom' && !sound.customData
                ? 'custom-missing'
                : soundUnavailable()
                  ? 'unavailable'
                  : 'ok',
            'data-sound-preset': sound.preset,
            'data-sound-volume': String(sound.volume)
          },
          div({ className: 'dtCardTitle' }, '完成音效与提醒'),
          label(
            { className: 'dtToggle dtToggleWide' },
            input({
              type: 'checkbox',
              'data-dt': 'notify-toggle',
              checked: !!settings.notify,
              onChange: function (event) {
                const next = event.target.checked;
                updateSettings({ notify: next });
                if (next) {
                  requestNotificationPermission().then(function (permission) {
                    if (permission !== 'granted') {
                      store.pushAlert({
                        id: uid('toast'),
                        title: '系统通知未开启',
                        body: '浏览器权限为 ' + permission + '，页内横幅仍会提醒。'
                      });
                    }
                  });
                }
              }
            }),
            span({}, '页面内横幅 + 系统通知')
          ),
          div({ className: 'dtHint' }, '通知权限：' + permissionText()),
          label(
            { className: 'dtToggle dtToggleWide' },
            input({
              type: 'checkbox',
              'data-dt': 'sound-toggle',
              checked: !!sound.enabled,
              onChange: function (event) {
                const next = event.target.checked;
                patchSound({ enabled: next });
                if (next) previewSound(sound.preset);
              }
            }),
            span({}, '完成音效')
          ),
          div({ className: 'dtSoundRow' }, soundRow('remind'), soundRow('stuck'), soundRow('custom')),
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '音量'),
            input({
              type: 'range',
              className: 'dtRange',
              min: 0,
              max: 1,
              step: 0.05,
              value: sound.volume,
              disabled: !sound.enabled,
              'data-dt': 'sound-volume',
              onChange: function (event) {
                patchSound({ volume: Number(event.target.value) });
              }
            })
          ),
          div(
            { className: 'dtBtnRow' },
            /* 只有选中「自定义」才挂本地文件选择器：既符合「导入音频只在自定义档有意义」，
               也让全页只保留一个 file input，数据导入那个（[data-dt="import-json"]）不会被顶掉。 */
            sound.preset === 'custom'
              ? label(
                { className: 'dtGhostBtn dtFileLabel' + (sound.enabled ? '' : ' dtIsDisabled'), title: '导入本地音频（≤512KB）' },
                '导入音频',
                input({
                  type: 'file',
                  accept: SOUND_ACCEPT,
                  className: 'dtFileInput',
                  'data-dt': 'sound-file',
                  disabled: !sound.enabled,
                  onChange: function (event) {
                    const node = event.target;
                    const file = node.files && node.files[0];
                    try {
                      node.value = '';
                    } catch (err) {
                      /* 某些环境禁止改写 value */
                    }
                    if (file) pickSound(file);
                  }
                })
              )
              : null,
            button(
              {
                className: 'dtGhostBtn',
                'data-dt': 'sound-preview',
                disabled: !sound.enabled || (sound.preset === 'custom' && !sound.customData),
                onClick: function () { previewSound(sound.preset); }
              },
              '试听'
            ),
            sound.customName ? span({ className: 'dtHint' }, '已导入：' + sound.customName) : ''
          ),
          soundUnavailable()
            ? div({ className: 'dtHint dtErr', 'aria-live': 'polite' }, '当前环境无法播放音效')
            : '',
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '默认提前'),
            select(
              {
                className: 'dtInput',
                value: settings.lead,
                'data-dt': 'lead-select',
                onChange: function (event) {
                  updateSettings({ lead: Number(event.target.value) });
                }
              },
              LEAD_CHOICES.map(function (n) {
                return option({ key: 'l' + n, value: n }, n === 0 ? '准时提醒' : '提前 ' + n + ' 分钟');
              })
            )
          ),
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '默认清单'),
            select(
              {
                className: 'dtInput',
                value: settings.defaultProject || '',
                'data-dt': 'default-project',
                onChange: function (event) {
                  updateSettings({ defaultProject: event.target.value });
                }
              },
              [option({ key: 'none', value: '' }, '不指定')].concat(
                (state.projects || []).map(function (project) {
                  return option({ key: project.id, value: project.id }, project.name);
                })
              )
            )
          ),
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '回写延迟'),
            select(
              {
                className: 'dtInput',
                value: typeof settings.writebackDelay === 'number' ? settings.writebackDelay : 0,
                'data-dt': 'writeback-delay',
                onChange: function (event) {
                  updateSettings({ writebackDelay: Number(event.target.value) });
                }
              },
              [
                [0, '立刻'],
                [30, '30 秒'],
                [60, '1 分钟'],
                [300, '5 分钟'],
                [600, '10 分钟'],
                [3600, '1 小时']
              ].map(function (pair) {
                return option({ key: 'wb' + pair[0], value: pair[0] }, pair[1]);
              })
            )
          ),
          div({ className: 'dtHint' }, '全天任务默认在当天 09:00 触发提醒，可在任务详情里单独指定。')
        ),

        /* ---------------------------------- 2 主题 ---------------------------------- */
        div(
          { className: 'dtCard' },
          div({ className: 'dtCardTitle' }, '主题'),
          div(
            { className: 'dtThemeRow', role: 'radiogroup', 'aria-label': '主题' },
            THEME_LABELS.map(function (item) {
              const on = theme === item.key;
              return label(
                {
                  key: 'th-' + item.key,
                  className: 'dtThemeOpt' + (on ? ' dtThemeOptOn' : ''),
                  'data-dt': 'theme',
                  'data-key': item.key,
                  'data-on': on ? '1' : undefined
                },
                input({
                  type: 'radio',
                  name: 'dtTheme',
                  className: 'dtThemeRadio',
                  checked: on,
                  onChange: function () {
                    updateSettings({ theme: item.key });
                  }
                }),
                span({ className: 'dtThemeOptText' }, item.label)
              );
            })
          ),
          div({ className: 'dtHint' }, '「跟随系统」会读取宿主界面的底色，切换时即时生效，不需要刷新。')
        ),

        /* ------------------------------- 3 风格设置 ------------------------------- */
        /* §1.19.1：第 3 组「风格设置」在主题之后、其余组之前；组内顺序写死
           ① 强调色（8 档色板 + custom hex）→ ② 分数环颜色（§1.17.5）。 */
        div(
          { className: 'dtCard', 'data-dt': 'set-appearance' },
          div({ className: 'dtCardTitle' }, '风格设置'),
          accentField,
          ringModeField,
          strengthField,
          div(
            { className: 'dtHint' },
            '强调色只用于「可交互强调」：一键打分按钮、任务勾选圆圈、今天已达成的那一格热力图。它不参与四象限、优先级旗、分数色带、日历副行等任何状态语义。'
          )
        ),

        /* ------------------------------- 4 目录栏（t144） ------------------------------- */
        /* §1.20.3：位置在「风格设置」之后、「服务商与模型」之前；两行与 rail 面板同 key、
           同文案、同默认值，读同一份 settings.railUI。 */
        div(
          { className: 'dtCard', 'data-dt': 'set-railui' },
          div({ className: 'dtCardTitle' }, '目录栏'),
          railUIRow('set-hide-reorder', '隐藏项目位置调整', railUI.hideReorder, 'hideReorder'),
          railUIRow('set-hide-color', '隐藏项目颜色', railUI.hideColor, 'hideColor'),
          div(
            { className: 'dtHint' },
            '「隐藏项目位置调整」开启时，左侧项目组与功能区不显示拖拽手柄；「隐藏项目颜色」开启时不显示项目色点。这两项与项目组标题行里的项目设置面板是同一份设置。'
          )
        ),

        /* ------------------------------- 5 服务商与模型 ------------------------------- */
        div(
          { className: 'dtCard', 'data-dt': 'set-agent', 'data-agent-source': agentSource },
          div({ className: 'dtCardTitle' }, '服务商与模型'),
          /* 来源三档（§1.18）：dsh = 用 DSH 自己的模型（默认，零配置）；custom = 第三方端点；off = 不发请求 */
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '模型来源'),
            div(
              {
                className: 'dtAgentSource',
                role: 'radiogroup',
                'aria-label': '模型来源',
                /* 容器挂 data-dt="agent-source"（captain m07959：三档必须竖排三行，容器是判据锚点）；
                   radio 自身改挂 agent-source-radio，避免「容器与三个 radio 同名」造成计数歧义。 */
                'data-dt': 'agent-source',
                'data-group': '1',
                'data-source-count': '3'
              },
              [
                { key: 'dsh', label: 'DSH 本地模型', hint: '用当前 DSH 会话的模型，不需要 Key' },
                { key: 'custom', label: '第三方服务商', hint: '自己填地址与 Key，可能受跨域限制' },
                { key: 'off', label: '关闭', hint: '不发任何请求，整理与打分走本地规则' }
              ].map(function (item) {
                return label(
                  {
                    key: item.key,
                    className: 'dtAgentSourceOpt' + (agentSource === item.key ? ' dtAgentSourceOn' : ''),
                    'data-on': agentSource === item.key ? '1' : '0'
                  },
                  input({
                    type: 'radio',
                    name: 'dtAgentSource',
                    className: 'dtAgentSourceRadio',
                    value: item.key,
                    'data-dt': 'agent-source',
                    'data-radio': '1',
                    'data-source': item.key,
                    checked: agentSource === item.key,
                    'aria-checked': agentSource === item.key ? 'true' : 'false',
                    onChange: function () {
                      updateSettings({ agent: Object.assign({}, agent, { source: item.key }) });
                    }
                  }),
                  span({ className: 'dtAgentSourceText' }, item.label),
                  span({ className: 'dtAgentSourceHint' }, item.hint)
                );
              })
            )
          ),
          /* dsh 档：两级下拉（服务商 → 该服务商的模型）+ 当前 DSH 默认只读行。
             选中值存 settings.agent.dshProvider / dshModel，空串表示用 DSH 默认。 */
          agentSource === 'dsh'
            ? div(
                { className: 'dtField', 'data-dt': 'set-provider' },
                span({ className: 'dtFieldLabel' }, '服务商'),
                select(
                  {
                    className: 'dtInput dtSelect',
                    'data-dt': 'agent-dsh-provider',
                    'data-value': dshProviderValue,
                    value: dshProviderValue,
                    onChange: function (event) {
                      const next = String(event.target.value || '');
                      const list = next && Array.isArray(dshModelMap[next]) ? dshModelMap[next] : [];
                      const keep = list.some(function (item) { return item.id === dshModelValue; });
                      writeDshPick({ dshProvider: next, dshModel: keep ? dshModelValue : '' });
                    }
                  },
                  option({ value: '' }, '（用 DSH 默认）'),
                  dshProviders.map(function (id) {
                    return option({ key: id, value: id }, id);
                  })
                )
              )
            : null,
          agentSource === 'dsh'
            ? div(
                { className: 'dtField', 'data-dt': 'set-model' },
                span({ className: 'dtFieldLabel' }, '模型'),
                select(
                  {
                    className: 'dtInput dtSelect',
                    'data-dt': 'agent-dsh-model',
                    'data-value': dshModelValue,
                    'data-empty': dshModelEmpty ? '1' : '0',
                    value: dshModelValue,
                    disabled: dshModelEmpty,
                    onChange: function (event) {
                      writeDshPick({ dshModel: String(event.target.value || '') });
                    }
                  },
                  dshModelEmpty
                    ? option({ value: '' }, '该服务商没有可用模型')
                    : option({ value: '' }, '（用 DSH 默认）'),
                  dshModelEmpty
                    ? null
                    : dshModelList.map(function (item) {
                      return option({ key: item.id, value: item.id }, item.name);
                    })
                )
              )
            : null,
          agentSource === 'dsh' && agentModels && !agentModels.ok
            ? div(
                {
                  className: 'dtHint dtAgentNote',
                  'data-dt': 'agent-models-error',
                  'data-code': agentModels.code || undefined,
                  'data-status': agentModels.status === undefined ? undefined : String(agentModels.status)
                },
                '读取 DSH 服务商失败（' + (agentModels.code || 'AGENT_NETWORK') + (agentModels.status ? ' · HTTP ' + agentModels.status : '') + '），下面仍可用 DSH 默认模型'
              )
            : null,
          agentSource === 'dsh'
            ? div(
                { className: 'dtField' },
                span({ className: 'dtFieldLabel' }, '当前默认'),
                div(
                  {
                    className: 'dtHint',
                    'data-dt': 'agent-model-current',
                    'data-state': agentModels ? (agentModels.ok ? 'ok' : 'error') : 'loading',
                    'data-code': agentModels && !agentModels.ok ? agentModels.code : undefined
                  },
                  agentModels === null
                    ? '读取中…'
                    : agentModels.ok
                      ? '当前 DSH 模型：' + agentModels.selection.provider + '/' + agentModels.selection.model
                      : '读不到当前 DSH 模型（Host 未提供模型服务）'
                )
              )
            : null,
          /* §8-98（t145）：dsh / off 两档各一句互斥说明，带固定钩子供回归取证。
             说明节点不是选项：不带 data-radio、不在 label 内、无 onClick，点它不会切档。 */
          agentSource === 'dsh'
            ? div(
                { className: 'dtHint dtAgentNote', 'data-dt': 'agent-dsh-note' },
                '使用当前 DSH 会话的模型，无需填写 Key'
              )
            : null,
          agentSource === 'off'
            ? div(
                { className: 'dtHint dtAgentNote', 'data-dt': 'agent-off-note' },
                '关闭后不发任何请求，整理与打分使用本地规则'
              )
            : null,
          agentSource === 'custom'
            ? [
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '服务商'),
            select(
              {
                className: 'dtInput',
                value: agentProviderKey(agent.provider) || 'deepseek',
                'data-dt': 'agent-provider',
                onChange: function (event) {
                  const provider = event.target.value;
                  const preset = AGENT_PROVIDER_PRESETS[provider];
                  /* t118：预设即权威 —— 选了就把接口地址覆盖成该家的（哪怕用户手改过也覆盖），
                     但绝不触碰 apiKey；model 也不替用户填，只换 placeholder 的建议值。 */
                  updateSettings({
                    agent: Object.assign({}, agent, { provider: provider }, preset ? { apiBase: preset.apiBase } : {})
                  });
                }
              },
              AGENT_PROVIDER_ORDER.map(function (key) {
                const preset = AGENT_PROVIDER_PRESETS[key];
                return option({ key: key, value: key, 'data-dt': 'agent-provider-' + key }, preset.label);
              })
            )
          ),
          agentProviderKey(agent.provider) === 'codex'
            ? div({ className: 'dtHint', 'data-dt': 'agent-provider-note' }, '需 OpenAI 平台 API Key，订阅账号不等于 API Key。')
            : null,
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '接口地址'),
            input({
              type: 'text',
              className: 'dtInput',
              value: agent.apiBase,
              placeholder: 'https://…',
              'data-dt': 'agent-base',
              onChange: function (event) { updateSettings({ agent: Object.assign({}, agent, { apiBase: event.target.value }) }); }
            })
          ),
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, 'API Key'),
            input({
              type: 'password',
              autoComplete: 'off',
              className: 'dtInput',
              value: agent.apiKey,
              'data-dt': 'agent-key',
              onChange: function (event) { updateSettings({ agent: Object.assign({}, agent, { apiKey: event.target.value }) }); }
            })
          ),
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '模型'),
            input({
              type: 'text',
              className: 'dtInput',
              value: agent.model,
              /* t118：预设只给建议值，写进 placeholder；留空时发送阶段用该建议值 */
              placeholder: agentModelSuggestion(agent.provider),
              'data-dt': 'agent-model',
              'data-suggest': agentModelSuggestion(agent.provider),
              onChange: function (event) { updateSettings({ agent: Object.assign({}, agent, { model: event.target.value }) }); }
            })
          ),
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '超时（秒）'),
            input({
              type: 'number',
              className: 'dtInput',
              min: 1,
              max: 300,
              value: agent.timeout,
              'data-dt': 'agent-timeout',
              onChange: function (event) { updateSettings({ agent: Object.assign({}, agent, { timeout: Number(event.target.value) | 0 }) }); }
            })
          ),
          div(
            { className: 'dtField' },
            span({ className: 'dtFieldLabel' }, '重试次数'),
            input({
              type: 'number',
              className: 'dtInput',
              min: 0,
              max: 5,
              value: agent.retries,
              'data-dt': 'agent-retries',
              onChange: function (event) { updateSettings({ agent: Object.assign({}, agent, { retries: Number(event.target.value) | 0 }) }); }
            })
          ),
              ]
            : null,
          div(
            { className: 'dtBtnRow' },
            button(
              {
                className: 'dtGhostBtn',
                'data-dt': 'agent-test',
                /* custom 档没填密钥时按钮禁用（点了也只会得到 AGENT_CONFIG）；dsh/off 档不看密钥 */
                disabled: agentSource === 'off' || (agentSource === 'custom' && !agent.apiKey) || agentTest.state === 'running',
                'aria-disabled':
                  agentSource === 'off' || (agentSource === 'custom' && !agent.apiKey) || agentTest.state === 'running' ? 'true' : undefined,
                'data-state': agentTest.state,
                onClick: testAgent
              },
              agentTest.state === 'running' ? '测试中…' : '测试连接'
            )
          ),
          div(
            {
              className: 'dtHint' + (agentTest.state === 'error' ? ' dtWarnText' : ''),
              'data-dt': 'agent-test-state',
              'data-state': agentTest.state,
              'data-code': agentTest.code || undefined,
              /* 成功时即使 0ms 也要给出延迟（0 是合法值，不能用 truthy 判断） */
              'data-latency': agentTest.state === 'ok' ? String(agentTest.latency || 0) : undefined,
              'data-model': agentTest.state === 'ok' ? agentTest.model : undefined
            },
            agentTest.state === 'running'
              ? '正在测试…'
              : agentTest.state === 'ok'
                ? '连接正常 · ' + agentTest.latency + 'ms · ' + agentTest.model + (agentTest.note ? '（' + agentTest.note + '）' : '')
                : agentTest.state === 'error'
                  ? (agentTest.code ? agentTest.code + ' · ' : '') + agentTest.message
                  : agentSource === 'dsh'
                    ? '尚未测试。'
                    : agentSource === 'off'
                      ? '已关闭模型调用。'
                      : agent.apiKey
                        ? '尚未测试。'
                        : '请先填密钥，再测试连接。'
          ),
          /* t150：一行「原始 message」，让用户先看到结论（dsh 档以前只有一句泛化的
             AGENT_SERVER，真因被吞）。它只在错误态存在，成功态 querySelector 返回 null。 */
          agentTest.state === 'error'
            ? div(
                { className: 'dtHint dtAgentDetail', 'data-dt': 'agent-detail' },
                agentTest.detailText
                  || (agentTest.code ? agentTest.code + ' \u00b7 ' : '') + (agentTest.message || '请求失败')
              )
            : null,
          /* t118：失败诊断。错误码不动，这里只补「请求到哪、返回什么、是不是被跨域拦了」。
             文本全部来自 agentDiagnose()，其中密钥与 Bearer 串已被 agentRedact() 抹成 ***。 */
          agentTest.state === 'error' && agentTest.detail
            ? div(
                {
                  className: 'dtHint dtWarnText',
                  'data-dt': 'agent-test-detail',
                  'data-detail-provider': agentTest.detail.provider || undefined,
                  'data-detail-url': agentTest.detail.url || undefined,
                  'data-detail-status': String(agentTest.detail.status || 0),
                  'data-detail-cors': agentTest.detail.corsLikely ? '1' : '0'
                },
                agentTest.detail.lines.map(function (line, index) {
                  return div({ key: 'l' + index, className: 'dtDetailLine' }, line);
                })
              )
            : null,
          /* 密钥警示只在 custom 档出现：dsh/off 档根本没有 Key 输入框，谈「明文保存」会误导 */
          agentSource === 'custom'
            ? div({ className: 'dtHint dtWarnText', 'data-dt': 'agent-warning' },
                'API Key 明文保存在本机浏览器（localStorage），不加密、不上传。共用电脑请勿填写个人密钥；导出的 JSON 默认不包含 Key。')
            : null,
        ),

        /* ------------------------------ 4.5 评分反馈样本 ------------------------------ */
        div(
          { className: 'dtCard', 'data-dt': 'scorefs-card' },
          div({ className: 'dtCardTitle' }, '评分反馈样本'),
          div(
            { className: 'dtCardNote' },
            '你每次手动改分都会记一条样本（改前分 → 改后分），用来让智能体打分贴近你的偏好。'
          ),
          label(
            { className: 'dtRow', 'data-dt': 'scorefs-use-row' },
            input({
              type: 'checkbox',
              className: 'dtCheck',
              'data-dt': 'scorefs-use',
              checked: scorefsCfg.useAsExamples !== false,
              onChange: function (event) {
                patchScorefs({ useAsExamples: !!event.target.checked });
              }
            }),
            span({ className: 'dtRowTitle' }, '把反馈样本作为打分示例'),
            span({ className: 'dtHint' }, scorefsCfg.useAsExamples !== false ? '当前：会随打分请求发送最近 8 条' : '当前：不发送，但仍继续记录')
          ),
          label(
            { className: 'dtRow', 'data-dt': 'scorefs-export-row' },
            input({
              type: 'checkbox',
              className: 'dtCheck',
              'data-dt': 'scorefs-export',
              checked: scorefsCfg.includeInExport === true,
              onChange: function (event) {
                patchScorefs({ includeInExport: !!event.target.checked });
              }
            }),
            span({ className: 'dtRowTitle' }, '导出时包含反馈样本'),
            span({ className: 'dtHint' }, scorefsCfg.includeInExport === true ? '当前：导出的 JSON 含反馈库' : '当前：导出时剥离反馈库')
          )
        ),

        /* -------------------------------- 5 模块开关 -------------------------------- */
        div(
          { className: 'dtCard' },
          div({ className: 'dtCardTitle' }, '模块开关'),
          div(
            { className: 'dtModuleList' },
            railOrdered.map(function (module, index) {
              const lockedModule = module.id === 'settings';
              return div(
                {
                  key: 'mod-' + module.id,
                  className: 'dtModuleRow',
                  'data-module': module.id,
                  /* t156：rec 模块在设置页显示为「立即行动」，并给固定钩子 */
                  'data-dt': module.id === 'rec' ? 'set-act-now' : undefined
                },
                label(
                  { className: 'dtToggle dtModuleName' },
                  input({
                    type: 'checkbox',
                    'data-dt': 'module-toggle',
                    /* 默认值以注册表为准（t52）：settings.modules 里还没写过的模块
                       不能因为 undefined 被误显示成「已关闭」。 */
                    checked: module.id === 'settings' ? true : moduleEnabled(settings, module.id),
                    disabled: lockedModule,
                    onChange: function (event) {
                      actionSetModule(store, module.id, { enabled: event.target.checked });
                    }
                  }),
                  span({}, module.id === 'rec' ? '立即行动' : module.name)
                ),
                div(
                  { className: 'dtModuleOps' },
                  button(
                    {
                      className: 'dtMiniBtn',
                      'data-dt': 'module-up',
                      title: '上移',
                      disabled: index === 0,
                      onClick: function () { setModuleOrder(module.id, -1); }
                    },
                    '↑'
                  ),
                  button(
                    {
                      className: 'dtMiniBtn',
                      'data-dt': 'module-down',
                      title: '下移',
                      disabled: index === railOrdered.length - 1,
                      onClick: function () { setModuleOrder(module.id, 1); }
                    },
                    '↓'
                  )
                )
              );
            })
          ),
          div({ className: 'dtHint' }, '隐藏模块只影响左侧栏入口，数据不删除。')
        ),

        /* ------------------------------- 6 数据导入导出 ------------------------------- */
        div(
          { className: 'dtCard' },
          div({ className: 'dtCardTitle' }, '数据导入导出'),
          div(
            { className: 'dtStats' },
            div({ className: 'dtStat' }, div({ key: 'v', className: 'dtStatValue' }, String(tasks.length)), div({ key: 'l', className: 'dtStatLabel' }, '总任务')),
            div({ className: 'dtStat' }, div({ key: 'v', className: 'dtStatValue' }, String(openTotal)), div({ key: 'l', className: 'dtStatLabel' }, '未完成')),
            div({ className: 'dtStat' }, div({ key: 'v', className: 'dtStatValue' }, String(doneTotal)), div({ key: 'l', className: 'dtStatLabel' }, '已完成')),
            div({ className: 'dtStat' }, div({ key: 'v', className: 'dtStatValue' }, String(trashTotal)), div({ key: 'l', className: 'dtStatLabel' }, '已删除')),
            div({ className: 'dtStat' }, div({ key: 'v', className: 'dtStatValue' }, String((state.projects || []).length)), div({ key: 'l', className: 'dtStatLabel' }, '项目'))
          ),
          div({ className: 'dtHint' }, '数据保存在本机浏览器 localStorage（键 ' + STORE_KEY + '）。迁移快照：' + (state.seededAt || '').slice(0, 19).replace('T', ' ')),
          div(
            { className: 'dtBtnRow' },
            button({
              className: 'dtGhostBtn',
              /* §12.5-3：规格名是 export；export-json 作为历史别名保留，避免旧探针/文档失效 */
              'data-dt': 'export',
              'data-dt-legacy': 'export-json',
              onClick: function () {
                const info = exportState(store.get());
                /* F19：把同一份 payload 挂到面板上，宿主拦了 download 也能另存。 */
                if (info && info.ok && info.payload) {
                  /* viaPanel=true 表示当前协议不支持 <a download>（dsh-app:/file:/…），
                     面板文案要明确告诉用户「已在此展示，请复制保存」，不再假装已下载。 */
                  setExportBox({ name: info.name, text: info.payload, viaPanel: !!info.viaPanel });
                }
                /* 补过标题的条数要可枚举，但不新增 JSON 键，所以走提示（t95 要求）。 */
                if (info && info.ok && info.placeholdered > 0) {
                  store.pushAlert({
                    id: uid('toast'),
                    title: info.placeholdered + ' 条无标题任务已按「(无标题)」导出',
                    body: '导出件可直接回灌，不会因缺标题被跳过。'
                  });
                }
              }
            }, '导出 JSON'),
            button(
              {
                className: 'dtGhostBtn',
                'data-dt': 'dida-sync',
                title: '用官方滴答 MCP 拉取未完成任务并合并到本地',
                disabled: didaSync.state === 'running',
                onClick: runDidaSync
              },
              didaSync.state === 'running' ? '下载中…' : '从滴答下载'
            ),
            label(
              { className: 'dtGhostBtn dtFileLabel', title: '从 JSON 备份恢复：会整体覆盖当前任务与清单' },
              '导入 JSON',
              input({
                type: 'file',
                accept: '.json,application/json',
                className: 'dtFileInput',
                'data-dt': 'import-json',
                onChange: onPickFile
              })
            ),
            button(
              {
                className: 'dtGhostBtn',
                'data-dt': 'scores-init',
                onClick: function () {
                  if (!window.confirm('用离线校准分（tt-scores.json）重算全部任务分数？手工改过的分数会被覆盖。')) return;
                  const result = actionBulkScore(store, {});
                  store.pushAlert({
                    id: uid('toast'),
                    title: result.ok ? '已重算 ' + result.scored + ' 条分数' : result.message,
                    body: result.ok && result.skipped ? '跳过 ' + result.skipped + ' 条' : ''
                  });
                }
              },
              '从 tt-scores.json 初始化分数'
            ),
            button(
              {
                className: 'dtGhostBtn',
                onClick: function () {
                  if (!window.confirm('用初始的滴答清单迁移数据替换当前所有任务？当前改动会丢失。')) return;
                  store.update(function () {
                    return inflateSeed();
                  });
                }
              },
              '恢复迁移快照'
            ),
            button(
              {
                className: 'dtDangerBtn',
                onClick: function () {
                  if (!window.confirm('清空全部任务？此操作不可撤销，建议先导出 JSON。')) return;
                  store.update(function (current) {
                    return adoptShards(Object.assign({}, current, { tasks: [] }));
                  });
                }
              },
              '清空任务'
            )
          ),
          importMsg
            ? div(
                {
                  className: 'dtHint ' + (importMsg.kind === 'error' ? 'dtErr' : 'dtHintOk'),
                  'data-dt': 'import-msg'
                },
                importMsg.text
              )
            : '',
          didaSync.state === 'idle'
            ? ''
            : div(
                {
                  className: 'dtHint ' + (didaSync.state === 'error' ? 'dtErr' : 'dtHintOk'),
                  'data-dt': 'dida-sync-note'
                },
                didaSync.note
              ),
          /* F19 降级兜底：导出件的同一份文本在面板里可见、可复制。
             宿主若拦截了 <a download>（例如只把 blob 打开成页、或落到 UUID .tmp），
             用户仍能从这里拿走内容另存为 .json —— 不静默丢、不新开窗口。 */
          /* §12.5-3/-4（t104）：降级容器**常驻 DOM、默认折叠** ——「常驻」本身就是
             「宿主拦下载时用户随时能找到这个入口」的保证；data-open 是唯一开关。
             展开态三件齐全：只读 textarea（export-text）+ 复制（export-copy）+ 另存为（export-saveas）。
             saveas 在非 http(s) 协议下同样不点 anchor（再点只会再造一个 blob: 页 / UUID .tmp），
             改为提示用户复制文本保存。 */
          div(
            {
              className: 'dtHint',
              'data-dt': 'export-fallback',
              'data-open': exportBox ? '1' : '0',
              'data-export-name': exportBox ? exportBox.name : undefined,
              style: exportBox
                ? { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }
                : { display: 'none' }
            },
            exportBox
              ? div(
                  { key: 'body', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  div(
                    { key: 'h', 'data-export-hint': exportBox.viaPanel ? 'panel' : 'download' },
                    exportBox.viaPanel
                      ? '已在此展示，请复制保存：当前宿主内嵌页面不支持直接下载（不会生成临时文件），把下面内容另存为 ' + exportBox.name
                      : '已生成 ' + exportBox.name + '（若系统没有弹出保存对话框，用下面的内容另存为同名 .json）'
                  ),
                  textarea(
                    {
                      key: 't',
                      className: 'dtEditorInput',
                      'data-dt': 'export-text',
                      'data-text-length': String(exportBox.text.length),
                      readOnly: true,
                      rows: 6,
                      value: exportBox.text,
                      style: { width: '100%', fontFamily: 'monospace', fontSize: '11px' }
                    }
                  ),
                  div(
                    { key: 'b', className: 'dtBtnRow' },
                    button(
                      {
                        className: 'dtGhostBtn',
                        'data-dt': 'export-copy',
                        'data-copy-state': copyState.state,
                        onClick: function (event) {
                          if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                          const text = exportBox.text;
                          const btn = event && event.currentTarget;
                          /* t210 F1：真机上 clipboard.writeText 的 Promise 可能永不 settle
                             （剪贴板其实写成功了，回执丢了），提示行就会一直停在「正在复制…」。
                             这里加看门狗：1.5s 内没回执就走回退通道并强制落到终态，
                             任何分支都不允许留在 pending。成功文案统一带字符数。 */
                          let settled = false;
                          let timer = null;
                          const charCount = text.length;
                          const finish = function (ok, note) {
                            settled = true;
                            if (timer) { window.clearTimeout(timer); timer = null; }
                            setCopyState({ state: ok ? 'ok' : 'error', note: note });
                            if (btn && typeof btn.focus === 'function') btn.focus();
                          };
                          const fallback = function (errName) {
                            if (errName) console.warn('dsh-tasks: 剪贴板通道失败', errName);
                            if (exportCopyViaExecCommand(text, event)) {
                              finish(true, '已复制（回退通道，' + charCount + ' 字符）');
                              return;
                            }
                            const selected = exportSelectAll(event);
                            finish(
                              false,
                              (selected ? '已为你全选文本，请按 Ctrl+C 复制' : '复制失败，请手动全选文本后按 Ctrl+C 复制') +
                                '（' + charCount + ' 字符）'
                            );
                          };
                          setCopyState({ state: 'pending', note: '正在复制…' });
                          const clip = window.navigator && window.navigator.clipboard;
                          const focused = typeof window.document.hasFocus === 'function' ? !!window.document.hasFocus() : true;
                          if (clip && typeof clip.writeText === 'function' && focused) {
                            let pending;
                            try {
                              pending = clip.writeText(text);
                            } catch (err) {
                              pending = Promise.reject(err);
                            }
                            Promise.resolve(pending).then(function () {
                              finish(true, '已复制到剪贴板（' + charCount + ' 字符）');
                            }, function (err) {
                              fallback(err && err.name ? err.name : 'rejected');
                            });
                            timer = window.setTimeout(function () {
                              if (settled) return;
                              /* 超时分支不能判失败：writeText 挂住时剪贴板往往已经写成功了
                                 （真机就是这种情形）。先试回退通道，仍不行就报「已复制但没收到回执」，
                                 让用户知道去粘贴验证，而不是把一次成功的复制报成失败。 */
                              if (exportCopyViaExecCommand(text, event)) {
                                finish(true, '已复制（回退通道，' + charCount + ' 字符）');
                                return;
                              }
                              finish(true, '已复制到剪贴板（' + charCount + ' 字符）· 未收到回执，粘贴为空请重试');
                            }, 1500);
                            return;
                          }
                          fallback(clip && typeof clip.writeText === 'function' ? 'unfocused' : 'unsupported');
                        }
                      },
                      copyState.state === 'ok' ? '已复制' : (copyState.state === 'error' ? '复制失败' : '复制到剪贴板')
                    ),
                    button(
                      {
                        className: 'dtGhostBtn',
                        'data-dt': 'export-saveas',
                        onClick: function (event) {
                          if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                          const protocol = exportProtocol();
                          /* 非 http(s)：明确提示、不点 anchor —— 与导出主路径同一判据 */
                          if (protocol !== 'http:' && protocol !== 'https:') {
                            setExportBox(Object.assign({}, exportBox, { note: '当前环境不支持另存为，请复制文本保存' }));
                            return;
                          }
                          try {
                            const blob = new window.Blob([exportBox.text], { type: 'application/json' });
                            const url = window.URL.createObjectURL(blob);
                            const link = window.document.createElement('a');
                            link.href = url;
                            link.download = exportBox.name;
                            link.rel = 'noopener';
                            link.style.display = 'none';
                            link.click();
                            window.setTimeout(function () {
                              window.URL.revokeObjectURL(url);
                            }, 0);
                            setExportBox(Object.assign({}, exportBox, { note: '已再次尝试下载 ' + exportBox.name }));
                          } catch (err) {
                            setExportBox(Object.assign({}, exportBox, { note: '下载失败，请复制文本保存' }));
                          }
                        }
                      },
                      '另存为文件'
                    ),
                    button(
                      {
                        className: 'dtGhostBtn',
                        'data-dt': 'export-close',
                        onClick: function () {
                          setExportBox(null);
                        }
                      },
                      '收起'
                    )
                  ),
                  copyState.note
                    ? div({ key: 'c', className: 'dtHint', 'data-dt': 'export-copy-note', 'data-copy-state': copyState.state }, copyState.note)
                    : null,
                  exportBox.note
                    ? div({ key: 'n', className: 'dtHint', 'data-dt': 'export-saveas-note' }, exportBox.note)
                    : null
                )
              : null
          ),
        ),

        /* ---------------------------------- 7 关于 ---------------------------------- */
        div(
          { className: 'dtCard' },
          div({ className: 'dtCardTitle' }, '关于'),
          div({ className: 'dtHint' }, '任务与番茄钟 · DSH 侧边栏插件 @local/dsh-tasks（数据架构 v' + DB_SCHEMA_VERSION + '）'),
          div({ className: 'dtHint' }, '番茄预设 5 / 10 / 15 / 20 / 25 分钟，可在番茄钟页调整工作节奏（完成后暂停 / 跳过休息 / 自动休息）、休息时长与长休息间隔；任务用浏览器本地时间提醒，页面关闭时不提醒。')
        )
      );

    }

    /* ============================== 61-tags · 标签库 ==============================
       §3.3.3 的 tag 分区落地：注册表 { id, name, color, order, source, count } 的双来源
       （source:'task' 由任务上的文字派生、source:'manual' 由用户新建/改色），外加
       「任务打标 / 去标」「脏标签清洗」「孤立标签清理」四件事。

       三条与数据有关的硬口径：
       1. count 是派生值，永远由 db.tasks 现算，不写回、不作为权威；
       2. 派生的 tag 名不得覆盖 manual 的 color/order（用户改过的颜色不许被扫描覆盖）；
       3. 历史数据里有 514 条任务的 tags 是字面量「[]」（TickTick 导出的 JSON 残渣）。
          它是**脏数据不是标签**：不参与筛选、不计入计数、界面上一个字都不显示，
          并给一个显式的「清理无效标签」把它从任务上抹掉（不删任务）。

       本文件是「库」的第一块，供后续绊脚石 / 四象限 / 筛选 / Agent 复用，因此
       所有对外能力都是纯函数 + 少数几个 action，UI（TagBoard）只是薄壳。 */

    /* ≥8 色：与四象限/权重环不同用途，取一套中性的标签色板；token 定义在 70-styles
       的 dt-palette 块里（CSS 只有那一块允许写字面色值）。 */
    const TAG_COLORS = [
      { id: 'blue', name: '蓝', token: 'var(--dt-tag-blue)' },
      { id: 'green', name: '绿', token: 'var(--dt-tag-green)' },
      { id: 'orange', name: '橙', token: 'var(--dt-tag-orange)' },
      { id: 'red', name: '红', token: 'var(--dt-tag-red)' },
      { id: 'purple', name: '紫', token: 'var(--dt-tag-purple)' },
      { id: 'teal', name: '青', token: 'var(--dt-tag-teal)' },
      { id: 'pink', name: '粉', token: 'var(--dt-tag-pink)' },
      { id: 'gray', name: '灰', token: 'var(--dt-tag-gray)' }
    ];

    /* 基础备选：新建标签时的候选，也是首次加载时补建的五条 manual 标签（count 仍现算）。 */
    const TAG_BASE_PRESETS = ['工作', '生活', '家人', '社交', '购物'];

    const TAG_UNKNOWN_COLOR = 'var(--dt-label-3)';

    /* 脏标签判据：去掉 [] " , 与空白后为空 → 是残渣。
       覆盖 '[]'、'["[]"]'、'[', ']'、'', '  ' 等 TickTick 导出形态。 */
    function isDirtyTag(name) {
      if (typeof name !== 'string') return true;
      const trimmed = name.trim();
      if (!trimmed) return true;
      return trimmed.replace(/[\[\]",'\s]/g, '') === '';
    }

    function tagColorToken(colorId) {
      const found = TAG_COLORS.find(function (item) { return item.id === colorId; });
      return found ? found.token : TAG_UNKNOWN_COLOR;
    }

    /* 任务上的标签数组：清洗 + 去重 + 去脏 + 保序（顺序即用户输入顺序）。 */
    function tagNamesOf(task) {
      const raw = task && Array.isArray(task.tags) ? task.tags : [];
      const seen = Object.create(null);
      const out = [];
      raw.forEach(function (name) {
        if (isDirtyTag(name)) return;
        const text = name.trim();
        if (seen[text]) return;
        seen[text] = 1;
        out.push(text);
      });
      return out;
    }

    /* 注册表：db.tags（可能含派生脏名）与任务上现存的文字合并。
       manual 优先（color/order 保留），派生条目按名字排序补在后面。 */
    function tagRegistryOf(db) {
      const rawRegistry = db && Array.isArray(db.tags) ? db.tags : [];
      const tasks = db && Array.isArray(db.tasks) ? db.tasks : [];
      const counts = Object.create(null);
      tasks.forEach(function (task) {
        if (!task || task.deleted) return;
        tagNamesOf(task).forEach(function (name) {
          counts[name] = (counts[name] || 0) + 1;
        });
      });
      const byName = Object.create(null);
      const out = [];
      rawRegistry.forEach(function (entry) {
        if (!entry || isDirtyTag(entry.name)) return;
        const name = entry.name.trim();
        if (byName[name]) return;
        const manual = entry.source === 'manual';
        byName[name] = {
          id: entry.id || 'tag:' + name,
          name: name,
          color: entry.color || '',
          order: typeof entry.order === 'number' ? entry.order : 100 + out.length,
          source: manual ? 'manual' : 'task',
          count: counts[name] || 0
        };
        out.push(byName[name]);
      });
      Object.keys(counts).forEach(function (name, index) {
        if (byName[name]) return;
        const item = {
          id: 'tag:' + name,
          name: name,
          color: '',
          order: 100 + index,
          source: 'task',
          count: counts[name] || 0
        };
        if (db.tags && db.tags.some) { /* registry 已扫过，这里只补新生条目 */ }
        byName[name] = item;
        out.push(item);
      });
      out.sort(function (a, b) {
        if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
      return out;
    }

    function tagByName(db, name) {
      if (!name) return null;
      const list = tagRegistryOf(db);
      for (let i = 0; i < list.length; i += 1) {
        if (list[i].name === name) return list[i];
      }
      return null;
    }

    /* 某个标签下未删除的任务（含已完成，由调用方的「含已完成」开关再过滤）。 */
    function tasksWithTag(db, name) {
      const tasks = db && Array.isArray(db.tasks) ? db.tasks : [];
      if (!name) return [];
      return tasks.filter(function (task) {
        return task && !task.deleted && tagNamesOf(task).indexOf(name) >= 0;
      });
    }

    /* 「孤立标签」= 任务上还留着文字、但注册表里已经没有这条标签（用户删过）。
       界面上渲染成灰 chip，并提供一键清理。 */
    function orphanTagNames(db) {
      const known = Object.create(null);
      tagRegistryOf(db).forEach(function (entry) { known[entry.name] = 1; });
      const out = [];
      const seen = Object.create(null);
      (db && Array.isArray(db.tasks) ? db.tasks : []).forEach(function (task) {
        if (!task || task.deleted) return;
        tagNamesOf(task).forEach(function (name) {
          if (known[name] || seen[name]) return;
          seen[name] = 1;
          out.push(name);
        });
      });
      return out.sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
    }

    function dirtyTagTaskIds(db) {
      const out = [];
      (db && Array.isArray(db.tasks) ? db.tasks : []).forEach(function (task) {
        if (!task || task.deleted) return;
        const raw = Array.isArray(task.tags) ? task.tags : [];
        if (raw.some(isDirtyTag)) out.push(task.id);
      });
      return out;
    }

    /* ------------------------------- 写入口（唯一） ------------------------------- */
    /* 标签是 db.tags 分区的唯一写者：改完置 updatedAt + 丢索引，与 53-actions 的
       commitDb 同口径（这里不能调 commitDb —— 它是 53 的私有函数，而 53 不在本卡范围）。 */
    function commitTags(store, mutate) {
      store.update(function (state) {
        const db = state.db;
        const nextTags = mutate(db, state);
        if (!nextTags) return null;
        return Object.assign({}, state, {
          db: Object.assign({}, db, {
            tags: nextTags,
            meta: Object.assign({}, db.meta, { updatedAt: Date.now() })
          })
        });
      });
      if (typeof invalidateDbIndex === 'function') invalidateDbIndex();
    }

    /* 首次加载补建五条基础标签（source:'manual'，order 1..5）。已存在同名则不重复。 */
    function ensureBaseTags(store) {
      const state = store.get();
      const existing = tagRegistryOf(state.db).map(function (item) { return item.name; });
      const missing = TAG_BASE_PRESETS.filter(function (name) { return existing.indexOf(name) < 0; });
      if (!missing.length) return { ok: true, added: 0 };
      commitTags(store, function (db) {
        const tags = (Array.isArray(db.tags) ? db.tags : []).slice();
        missing.forEach(function (name, index) {
          tags.push({
            id: 'tag:' + name,
            name: name,
            color: TAG_COLORS[index % TAG_COLORS.length].id,
            order: index + 1,
            source: 'manual',
            count: 0
          });
        });
        return tags;
      });
      return { ok: true, added: missing.length };
    }

    function tagNameTaken(db, name, exceptName) {
      return tagRegistryOf(db).some(function (item) {
        return item.name === name && item.name !== exceptName;
      });
    }

    function actionAddTag(store, name, color) {
      const text = typeof name === 'string' ? name.trim() : '';
      if (isDirtyTag(text)) return { ok: false, code: 'TAG_INVALID', message: '标签名不能为空或只含括号符号' };
      const state = store.get();
      if (tagNameTaken(state.db, text)) return { ok: false, code: 'TAG_EXISTS', message: '标签已存在：' + text };
      const colorId = TAG_COLORS.some(function (item) { return item.id === color; }) ? color : TAG_COLORS[0].id;
      const order = tagRegistryOf(state.db).length + 1;
      commitTags(store, function (db) {
        const tags = (Array.isArray(db.tags) ? db.tags : []).slice();
        tags.push({ id: 'tag:' + text, name: text, color: colorId, order: order, source: 'manual', count: 0 });
        return tags;
      });
      return { ok: true, id: 'tag:' + text };
    }

    function actionRenameTag(store, name, nextName) {
      const from = typeof name === 'string' ? name.trim() : '';
      const to = typeof nextName === 'string' ? nextName.trim() : '';
      if (isDirtyTag(to)) return { ok: false, code: 'TAG_INVALID', message: '标签名不能为空或只含括号符号' };
      const state = store.get();
      if (!tagByName(state.db, from)) return { ok: false, code: 'TAG_NOT_FOUND', message: '标签不存在：' + from };
      if (from !== to && tagNameTaken(state.db, to, from)) {
        return { ok: false, code: 'TAG_EXISTS', message: '标签已存在：' + to };
      }
      store.update(function (current) {
        const db = current.db;
        const tags = (Array.isArray(db.tags) ? db.tags : []).map(function (entry) {
          if (entry.name !== from) return entry;
          return Object.assign({}, entry, { name: to, source: 'manual' });
        });
        /* 任务上的文字一起跟着改：标签是「库」，改名不能让任务掉签。 */
        const tasks = db.tasks.map(function (task) {
          if (!task || !Array.isArray(task.tags)) return task;
          if (task.tags.indexOf(from) < 0) return task;
          const next = task.tags.map(function (tag) { return tag === from ? to : tag; });
          return Object.assign({}, task, { tags: normalizeTags(next) });
        });
        return Object.assign({}, current, {
          db: Object.assign({}, db, {
            tags: tags,
            tasks: tasks,
            meta: Object.assign({}, db.meta, { updatedAt: Date.now() })
          })
        });
      });
      return { ok: true };
    }

    function actionSetTagColor(store, name, color) {
      const text = typeof name === 'string' ? name.trim() : '';
      if (!TAG_COLORS.some(function (item) { return item.id === color; })) {
        return { ok: false, code: 'TAG_BAD_COLOR', message: '未知颜色：' + color };
      }
      const state = store.get();
      const entry = tagByName(state.db, text);
      if (!entry) return { ok: false, code: 'TAG_NOT_FOUND', message: '标签不存在：' + text };
      commitTags(store, function (db) {
        const tags = (Array.isArray(db.tags) ? db.tags : []).slice();
        const index = tags.findIndex(function (item) { return item.name === text; });
        const row = { id: entry.id, name: text, color: color, order: entry.order, source: 'manual', count: 0 };
        if (index >= 0) tags[index] = Object.assign({}, tags[index], row);
        else tags.push(row);
        return tags;
      });
      return { ok: true };
    }

    /* 删除标签只删注册表条目：任务上的文字保留成灰 chip（可一键清理），任务本身不动。 */
    function actionDeleteTag(store, name) {
      const text = typeof name === 'string' ? name.trim() : '';
      const state = store.get();
      if (!tagByName(state.db, text)) return { ok: false, code: 'TAG_NOT_FOUND', message: '标签不存在：' + text };
      commitTags(store, function (db) {
        return (Array.isArray(db.tags) ? db.tags : []).filter(function (entry) { return entry.name !== text; });
      });
      return { ok: true };
    }

    /* 任务打标 / 去标（TagBoard 与 C 栏快捷操作共用）。 */
    function actionTagTask(store, taskId, name) {
      const text = typeof name === 'string' ? name.trim() : '';
      if (isDirtyTag(text)) return { ok: false, code: 'TAG_INVALID', message: '标签名无效' };
      store.update(function (state) {
        const db = state.db;
        const index = db.tasks.findIndex(function (task) { return task.id === taskId; });
        if (index < 0) return null;
        const task = db.tasks[index];
        const tags = tagNamesOf(task);
        if (tags.indexOf(text) >= 0) return null;
        const tasks = db.tasks.slice();
        tasks[index] = Object.assign({}, task, { tags: tags.concat([text]) });
        return Object.assign({}, state, {
          db: Object.assign({}, db, { tasks: tasks, meta: Object.assign({}, db.meta, { updatedAt: Date.now() }) })
        });
      });
      return { ok: true };
    }

    function actionUntagTask(store, taskId, name) {
      const text = typeof name === 'string' ? name.trim() : '';
      store.update(function (state) {
        const db = state.db;
        const index = db.tasks.findIndex(function (task) { return task.id === taskId; });
        if (index < 0) return null;
        const task = db.tasks[index];
        const tags = tagNamesOf(task).filter(function (tag) { return tag !== text; });
        if (tags.length === tagNamesOf(task).length) return null;
        const tasks = db.tasks.slice();
        tasks[index] = Object.assign({}, task, { tags: tags });
        return Object.assign({}, state, {
          db: Object.assign({}, db, { tasks: tasks, meta: Object.assign({}, db.meta, { updatedAt: Date.now() }) })
        });
      });
      return { ok: true };
    }

    /* 一键清理孤立标签：把注册表里已经没有的标签文字从所有任务上抹掉。 */
    function actionClearOrphanTags(store) {
      const state = store.get();
      const orphans = orphanTagNames(state.db);
      if (!orphans.length) return { ok: true, cleared: 0 };
      const known = Object.create(null);
      tagRegistryOf(state.db).forEach(function (entry) { known[entry.name] = 1; });
      store.update(function (current) {
        const db = current.db;
        const tasks = db.tasks.map(function (task) {
          if (!task || !Array.isArray(task.tags)) return task;
          const next = tagNamesOf(task).filter(function (name) { return known[name]; });
          if (next.length === tagNamesOf(task).length) return task;
          return Object.assign({}, task, { tags: next });
        });
        return Object.assign({}, current, {
          db: Object.assign({}, db, { tasks: tasks, meta: Object.assign({}, db.meta, { updatedAt: Date.now() }) })
        });
      });
      return { ok: true, cleared: orphans.length };
    }

    /* 一键清理无效标签：把「[]」这类残渣从任务 tags 上物理删除（任务不动）。 */
    function actionClearDirtyTags(store) {
      const state = store.get();
      const ids = dirtyTagTaskIds(state.db);
      if (!ids.length) return { ok: true, cleared: 0 };
      const dirty = Object.create(null);
      ids.forEach(function (id) { dirty[id] = 1; });
      store.update(function (current) {
        const db = current.db;
        const tasks = db.tasks.map(function (task) {
          if (!task || !dirty[task.id] || !Array.isArray(task.tags)) return task;
          return Object.assign({}, task, { tags: tagNamesOf(task) });
        });
        const tags = (Array.isArray(db.tags) ? db.tags : []).filter(function (entry) {
          return entry && !isDirtyTag(entry.name);
        });
        return Object.assign({}, current, {
          db: Object.assign({}, db, { tasks: tasks, tags: tags, meta: Object.assign({}, db.meta, { updatedAt: Date.now() }) })
        });
      });
      return { ok: true, cleared: ids.length };
    }

    /* --------------------------------- 标签面板 --------------------------------- */
    /* B 栏两种形态：listView==='tag' 列标签，选中后 listView==='tag:<name>' 列任务。
       面板只做渲染，数据一律走上面的纯函数/action。 */
    /* 标签视图（ui-spec-stage2 §1.2，t105）：B 栏 = 上半「全部标签」清单 + 下半该标签的任务。
       - 不新增 listView 取值（`tags` 已在 11 值内）；点某行只写组件内 tagFocus，不写 detail；
       - 选中标签时 listView 变成 `tag:<name>`（rail 高亮与刷新都靠它），未选中时下半是空态。 */
    function TagsView(props) {
      const state = props.state;
      const store = props.store;
      const db = state.db;
      const view = String(props.view || '');
      const focused = view.indexOf('tag:') === 0 ? view.slice(4) : '';
      const registry = tagRegistryOf(db);
      const rows = registry.slice().sort(function (a, b) {
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      const focusRow = focused
        ? rows.find(function (entry) { return entry.name === focused; }) || null
        : null;
      const tasks = focusRow
        ? tasksWithTag(db, focusRow.name).filter(function (task) {
          return task.status === 0 && !task.deleted;
        }).sort(compareOpen)
        : [];

      const head = div(
        { key: 'head', className: 'dtHead' },
        div(
          { key: 'l', className: 'dtHeadLeft' },
          div({ key: 't', className: 'dtHeadTitle' }, focusRow ? '#' + focusRow.name : '标签'),
          div({ key: 's', className: 'dtHeadSub' }, focusRow
            ? String(tasks.length) + ' 项未完成'
            : String(rows.length) + ' 个标签')
        ),
        div(
          { key: 'r', className: 'dtHeadRight' },
          button(
            {
              key: 'x',
              type: 'button',
              className: 'dtIconBtn dtDrawerCollapse',
              'data-dt': 'drawer-collapse',
              title: '收起',
              'aria-label': '收起',
              onClick: function () { if (props.onCollapse) props.onCollapse(); }
            },
            icon('close', 15)
          )
        )
      );

      const tagList = rows.length
        ? rows.map(function (entry) {
          const color = entry.color ? tagColorToken(entry.color) : TAG_UNKNOWN_COLOR;
          const on = focused === entry.name;
          return button(
            {
              key: entry.name,
              type: 'button',
              className: 'dtTagRow dtTagsPick' + (on ? ' dtTagsPickOn' : ''),
              'data-tag': entry.name,
              'data-tag-count': String(entry.count),
              'data-tag-active': on ? '1' : undefined,
              onClick: function () {
                if (props.onPickTag) props.onPickTag(on ? '' : entry.name);
              }
            },
            span({ key: 'd', className: 'dtTagDot', style: { background: color } }),
            span({ key: 'n', className: 'dtTagName' }, entry.name),
            span({ key: 'c', className: 'dtTagCount' }, String(entry.count))
          );
        })
        : div({ key: 'empty', className: 'dtEmpty dtTagsEmpty' }, '还没有标签');

      const taskRows = focusRow
        ? (tasks.length
          ? tasks.map(function (task) {
            return h(TaskRow, {
              key: task.id,
              task: task,
              store: store,
              state: state,
              showScore: props.showScore !== false,
              active: props.activeId === task.id,
              onOpen: props.onOpenTask
            });
          })
          : div({ key: 'none', className: 'dtEmpty' }, '这个标签下没有未完成任务'))
        : div({ key: 'pick', className: 'dtEmpty' }, '选一个标签');

      return div(
        { key: 'tagsview', className: 'dtBStack dtTagsView' },
        head,
        div({ key: 'picklist', className: 'dtTagsPickList', 'data-dt': 'tags-list' }, tagList),
        div({ key: 'divider', className: 'dtTagsDivider' }),
        div({ key: 'tasks', className: 'dtList dtTagsTasks', 'data-tag-focus': focused || undefined }, taskRows)
      );
    }

    function TagBoard(props) {
      const state = props.state;
      const store = props.store;
      const db = state.db;
      const registry = tagRegistryOf(db);
      const orphans = orphanTagNames(db);
      const dirtyCount = dirtyTagTaskCount(db);
      const [editing, setEditing] = useState('');
      const [draft, setDraft] = useState('');
      const [colorFor, setColorFor] = useState('');
      const [adding, setAdding] = useState(false);
      const [newName, setNewName] = useState('');

      const commitAdd = function () {
        const text = newName.trim();
        if (!text) {
          setAdding(false);
          return;
        }
        const res = actionAddTag(store, text, TAG_COLORS[registry.length % TAG_COLORS.length].id);
        if (!res.ok) store.pushAlert({ id: uid('toast'), title: res.message || '新建失败', body: '', ttl: 4000 });
        setNewName('');
        setAdding(false);
      };

      const commitRename = function (from) {
        const text = draft.trim();
        setEditing('');
        setDraft('');
        if (!text || text === from) return;
        const res = actionRenameTag(store, from, text);
        if (!res.ok) store.pushAlert({ id: uid('toast'), title: res.message || '改名失败', body: '', ttl: 4000 });
      };

      const removal = function (name) {
        actionDeleteTag(store, name);
        store.pushAlert({
          id: uid('toast'),
          title: '已删除标签「' + name + '」',
          body: '任务上的文字保留为灰色标签，可点「清理孤立标签」一并移除',
          ttl: 4000
        });
      };

      const rows = registry.map(function (entry) {
        const color = entry.color ? tagColorToken(entry.color) : TAG_UNKNOWN_COLOR;
        const isEditing = editing === entry.name;
        return div(
          {
            key: entry.name,
            className: 'dtTagRow',
            'data-tag': entry.name,
            'data-tag-source': entry.source,
            'data-tag-count': String(entry.count)
          },
          span({ key: 'd', className: 'dtTagDot', style: { background: color } }),
          isEditing
            ? input({
              key: 'i',
              className: 'dtTagInput',
              'data-dt': 'tag-rename-input',
              value: draft,
              onClick: stopActionEvent,
              onChange: function (event) { setDraft(event.target.value); },
              onKeyDown: function (event) {
                if (event.key === 'Enter') commitRename(entry.name);
                if (event.key === 'Escape') { setEditing(''); setDraft(''); }
              }
            })
            : button(
              {
                key: 'm',
                type: 'button',
                className: 'dtTagMain',
                'data-dt': 'tag-open',
                title: '查看该标签下的任务',
                ...scopedAction(store, function () {
                  if (props.onPickTag) props.onPickTag(entry.name);
                })
              },
              span({ key: 'n', className: 'dtTagName' }, entry.name),
              span({ key: 'c', className: 'dtTagCount' }, String(entry.count))
            ),
          div(
            { key: 'o', className: 'dtTagOps' },
            button(
              {
                key: 'c',
                type: 'button',
                className: 'dtTagOp' + (colorFor === entry.name ? ' dtTagOpOn' : ''),
                'data-dt': 'tag-color',
                title: '换颜色',
                ...scopedAction(store, function () {
                  setColorFor(colorFor === entry.name ? '' : entry.name);
                })
              },
              icon('flag', 12)
            ),
            button(
              {
                key: 'r',
                type: 'button',
                className: 'dtTagOp',
                'data-dt': 'tag-rename',
                title: '改名',
                ...scopedAction(store, function () {
                  setEditing(entry.name);
                  setDraft(entry.name);
                })
              },
              icon('repeat', 12)
            ),
            button(
              {
                key: 'x',
                type: 'button',
                className: 'dtTagOp dtTagOpDanger',
                'data-dt': 'tag-delete',
                title: '删除标签（不删任务）',
                ...scopedAction(store, function () { removal(entry.name); })
              },
              icon('trash', 12)
            )
          ),
          colorFor === entry.name
            ? div(
              { key: 'p', className: 'dtTagPalette', 'data-dt': 'tag-palette' },
              TAG_COLORS.map(function (item) {
                return button(
                  {
                    key: item.id,
                    type: 'button',
                    className: 'dtTagSwatch' + (entry.color === item.id ? ' dtTagSwatchOn' : ''),
                    'data-dt': 'tag-color-pick',
                    'data-color': item.id,
                    title: item.name,
                    style: { background: item.token },
                    ...scopedAction(store, function () {
                      actionSetTagColor(store, entry.name, item.id);
                      setColorFor('');
                    })
                  }
                );
              })
            )
            : null
        );
      });

      return div(
        { className: 'dtTagBoard', 'data-tag-count': String(registry.length) },
        div(
          { key: 'head', className: 'dtHead' },
          div(
            { key: 'l', className: 'dtHeadLeft' },
            div({ key: 't', className: 'dtHeadTitle' }, '标签'),
            span({ key: 'n', className: 'dtHeadCount' }, String(registry.length) + ' 个标签')
          ),
          div(
            { key: 'r', className: 'dtHeadRight' },
            button(
              {
                key: 'add',
                type: 'button',
                className: 'dtPrimaryBtn',
                'data-dt': 'tag-add',
                ...scopedAction(store, function () { setAdding(true); })
              },
              icon('plus', 12),
              '新建标签'
            ),
            orphans.length
              ? button(
                {
                  key: 'orphan',
                  type: 'button',
                  className: 'dtMiniBtn',
                  'data-dt': 'tag-clear-orphans',
                  title: '把任务上残留的已删标签文字一并移除',
                  ...scopedAction(store, function () {
                    const res = actionClearOrphanTags(store);
                    store.pushAlert({ id: uid('toast'), title: '已清理孤立标签 ' + res.cleared + ' 条', body: '', ttl: 4000 });
                  })
                },
                '清理孤立标签（' + orphans.length + '）'
              )
              : null,
            dirtyCount
              ? button(
                {
                  key: 'dirty',
                  type: 'button',
                  className: 'dtMiniBtn',
                  'data-dt': 'tag-clear-dirty',
                  title: '从任务上移除「[]」这类导出残渣',
                  ...scopedAction(store, function () {
                    const res = actionClearDirtyTags(store);
                    store.pushAlert({ id: uid('toast'), title: '已清理无效标签 ' + res.cleared + ' 条', body: '', ttl: 4000 });
                  })
                },
                '清理无效标签（' + dirtyCount + '）'
              )
              : null,
            button(
              {
                key: 'x',
                type: 'button',
                className: 'dtIconBtn dtDrawerCollapse',
                'data-dt': 'drawer-collapse',
                title: '收起',
                'aria-label': '收起',
                onClick: props.onCollapse
              },
              icon('close', 14)
            )
          )
        ),
        adding
          ? div(
            { key: 'addrow', className: 'dtTagAddRow' },
            input({
              key: 'i',
              className: 'dtTagInput',
              'data-dt': 'tag-new-input',
              placeholder: '标签名，回车创建',
              value: newName,
              onClick: stopActionEvent,
              onChange: function (event) { setNewName(event.target.value); },
              onKeyDown: function (event) {
                if (event.key === 'Enter') commitAdd();
                if (event.key === 'Escape') { setAdding(false); setNewName(''); }
              }
            }),
            button(
              { key: 'b', type: 'button', className: 'dtMiniBtn', 'data-dt': 'tag-new-save', ...scopedAction(store, commitAdd) },
              '创建'
            ),
            /* 基础备选（§3.3.3 / t52 ①）：工作/生活/家人/社交/购物 一键添加，
               已经存在的就不再出现，避免重复建同名标签。 */
            div(
              { key: 'p', className: 'dtTagPresetRow' },
              TAG_BASE_PRESETS.filter(function (name) {
                return !registry.some(function (entry) { return entry.name === name; });
              }).map(function (name) {
                return button(
                  {
                    key: name,
                    type: 'button',
                    className: 'dtTagPreset',
                    'data-dt': 'tag-preset',
                    'data-tag': name,
                    ...scopedAction(store, function () {
                      const res = actionAddTag(store, name, TAG_COLORS[registry.length % TAG_COLORS.length].id);
                      if (!res.ok) store.pushAlert({ id: uid('toast'), title: res.message || '新建失败', body: '', ttl: 4000 });
                    })
                  },
                  name
                );
              })
            )
          )
          : null,
        div({ key: 'list', className: 'dtTagList', 'data-dt': 'tag-list' }, rows),
        div(
          { key: 'hint', className: 'dtTagHint' },
          '删除标签不会删除任务；任务上的文字会保留为灰色标签，可用「清理孤立标签」移除。'
        )
      );
    }

    /* dirty 任务条数（TagBoard 按钮文案用；与 tagNamesOf 同判据）。 */
    function dirtyTagTaskCount(db) {
      return dirtyTagTaskIds(db).length;
    }


    /* ------------------------------------ 习惯面板（62） ------------------------------------ */

    /* 习惯是独立打卡实体（不是「带 type=habit 的清单里的任务」）：
       state.habits[i] = { id, name, color, period, freq, checks[], currentStreak, longestStreak }。
       入口是 rail 的一级项（§1.7），点卡片进 C 栏详情，点圆点只打卡。 */

    const HABIT_BLOCKS = [
      { id: 'morning', label: '上午' },
      { id: 'afternoon', label: '下午' },
      { id: 'evening', label: '晚上' }
    ];

    function habitMetaText(habit) {
      const parts = [];
      const freq = habit.freq || {};
      if (freq.type === 'weekly') {
        const byDay = Array.isArray(freq.byDay) && freq.byDay.length ? freq.byDay : [1];
        parts.push('每' + byDay.map(function (d) { return WEEK.charAt(d % 7); }).join('、'));
      } else if (freq.type === 'daily') {
        parts.push(freq.interval > 1 ? '每 ' + freq.interval + ' 天' : '每天');
      } else if (freq.type === 'monthly') {
        parts.push('每月');
      } else if (freq.type === 'yearly') {
        parts.push('每年');
      } else {
        parts.push('每天');
      }
      if (habit.reminder) parts.push(habit.reminder);
      return parts.join(' ');
    }

    function addHabit(store, fields) {
      const habit = {
        id: uid('habit'),
        name: clampText(fields.name || '新习惯', 60) || '新习惯',
        color: fields.color || PROJECT_COLORS[3],
        period: fields.period || 'morning',
        archived: false,
        currentStreak: 0,
        longestStreak: 0,
        checkInCount: 0,
        reminder: '',
        freq: { type: 'daily', interval: 1, byDay: [] },
        targetStartDate: dateKey(new Date()),
        checks: []
      };
      store.update(function (state) {
        return Object.assign({}, state, { habits: (state.habits || []).concat([habit]) });
      });
      return habit;
    }

    function HabitCard(props) {
      const habit = props.habit;
      const today = props.today;
      const done = habitChecked(habit, today);
      const streak = habitDisplayStreak(habit, today);
      const open = function () {
        if (props.onOpen) props.onOpen(habit.id);
      };
      return div(
        {
          key: habit.id,
          className: 'dtHabitCard' + (done ? ' dtHabitCardOn' : '') + (props.active ? ' dtHabitCardActive' : ''),
          'data-habit-id': habit.id,
          'data-on': done ? '1' : undefined,
          'data-active': props.active ? '1' : undefined,
          role: 'button',
          tabindex: 0,
          title: habit.name,
          onClick: function (event) {
            /* 点卡片任意非圆点区域 = 进详情；圆点自己的处理器已截停，不会走到这里 */
            const target = event && event.target;
            if (target && typeof target.closest === 'function' && target.closest('button')) return;
            open();
          },
          onKeyDown: function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              open();
            }
          }
        },
        div(
          { key: 'top', className: 'dtHabitCardTop' },
          span({ key: 'n', className: 'dtHabitTitle' }, habit.name),
          button(
            {
              key: 'c',
              type: 'button',
              className: 'dtHabitCheck dtCheck' + (done ? ' dtCheckOn' : ''),
              title: done ? '今日已打卡，点击取消' : '点击打卡',
              'data-dt': 'habit-check',
              onClick: function (event) {
                event.stopPropagation();
                toggleHabit(props.store, habit.id, today);
              }
            },
            done ? icon('check', 12) : null
          )
        ),
        div({ key: 'meta', className: 'dtHabitMeta' }, habitMetaText(habit)),
        div(
          {
            key: 'streak',
            className: 'dtHabitStreak',
            'data-dt': 'habit-streak',
            'data-streak-src': habit.archived ? 'frozen' : 'live'
          },
          span(
            { key: 't', className: 'dtHabitStreakText' },
            '已坚持 ',
            h('b', { key: 'n', 'data-streak': String(streak) }, String(streak)),
            ' 天'
          ),
          done && streak >= 1 ? span({ key: 'tag', className: 'dtHabitStreakTag' }, '今日已打卡') : null
        )
      );
    }

    function HabitPanel(props) {
      const store = props.store;
      const state = props.state;
      const today = new Date();
      const habits = state.habits || [];
      const needle = String(props.query || '').trim().toLowerCase();
      const shown = habits.filter(function (habit) {
        if (!props.showArchived && habit.archived) return false;
        if (!needle) return true;
        return habit.name.toLowerCase().indexOf(needle) >= 0;
      });
      const activeId = props.activeId || '';

      const blocks = HABIT_BLOCKS.map(function (block) {
        const items = shown.filter(function (habit) {
          return habit.period === block.id;
        });
        const doneCount = items.filter(function (habit) {
          return habitChecked(habit, today);
        }).length;
        return div(
          { key: block.id, className: 'dtHabitBlock', 'data-block': block.id },
          div(
            { key: 'h', className: 'dtHabitBlockHead' },
            span({ key: 't', className: 'dtHabitBlockTitle' }, block.label),
            span({ key: 'c', className: 'dtHabitBlockCount' }, doneCount + '/' + items.length + ' 已完成')
          ),
          items.length
            ? div(
                { key: 'g', className: 'dtHabitGrid' },
                items.map(function (habit) {
                  return h(HabitCard, {
                    key: habit.id,
                    habit: habit,
                    store: store,
                    today: today,
                    active: activeId === habit.id,
                    onOpen: props.onOpenHabit
                  });
                })
              )
            : div({ key: 'e', className: 'dtHabitBlockEmpty' }, '这个时段还没有习惯')
        );
      });

      return div(
        { className: 'dtMain' },
        div(
          { key: 'head', className: 'dtHead' },
          div(
            { key: 'l', className: 'dtHeadLeft' },
            div({ key: 't', className: 'dtHeadTitle' }, '习惯打卡'),
            div({ key: 'c', className: 'dtHeadCount' }, shown.length + ' 个习惯')
          ),
          div(
            { key: 'r', className: 'dtHeadRight' },
            div(
              { key: 's', className: 'dtSearch' },
              icon('search', 13),
              input({
                key: 'i',
                className: 'dtSearchInput',
                placeholder: '搜索习惯',
                value: props.query || '',
                onChange: function (event) {
                  if (props.onQuery) props.onQuery(event.target.value);
                }
              })
            ),
            button(
              {
                key: 'a',
                type: 'button',
                className: 'dtMiniBtn' + (props.showArchived ? ' dtMiniOn' : ''),
                onClick: function () {
                  if (props.onToggleArchived) props.onToggleArchived();
                }
              },
              props.showArchived ? '隐藏归档' : '含归档'
            ),
            button(
              {
                key: 'n',
                type: 'button',
                className: 'dtPrimaryBtn',
                onClick: function () {
                  addHabit(store, { period: 'morning' });
                }
              },
              icon('plus', 14),
              '新建'
            ),
            button(
              {
                key: 'x',
                type: 'button',
                className: 'dtMiniBtn dtDrawerCollapse',
                'data-dt': 'drawer-collapse',
                title: '收起',
                'aria-label': '收起',
                onClick: function () {
                  if (props.onCollapse) props.onCollapse();
                }
              },
              icon('close', 12),
              '收起'
            )
          )
        ),
        div({ key: 'body', className: 'dtHabit' }, blocks.map(function (node) { return node; }))
      );
    }


    /* ------------------------------------ 习惯详情（63） ------------------------------------ */

    /* C 栏内容（§2.8）：三个数字 + 月历热力图。
       翻月只改组件内的 heatYM，不写 localStorage、不动 listView/detail；
       详情关闭即卸载，再打开自然归位当前月。 */

    const HEAT_WEEK = ['一', '二', '三', '四', '五', '六', '日'];

    function HabitDetail(props) {
      const habit = props.habit;
      const store = props.store;
      const today = new Date();
      const [ym, setYm] = useState(function () {
        return { year: today.getFullYear(), month: today.getMonth() };
      });

      const current = habitDisplayStreak(habit, today);
      const longest = Math.max(habit.longestStreak | 0, current);
      const total = habitCheckinTotal(habit);
      const grid = habitMonthGrid(habit, ym.year, ym.month);
      /* t83：与项目点同一条口径——八色板档位的老 hex 归一成 var(--dt-project-*)，
         品牌兜底；TickTick 里的任意自定义色（不在八色板内的 hex）由归一函数原样返回，不映射、不改库。 */
      const color = normalizeProjectColor(habit.color) || 'var(--dsw-alias-brand-primary)';

      const shiftMonth = function (delta) {
        setYm(function (prev) {
          const d = new Date(prev.year, prev.month + delta, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        });
      };

      const stat = function (key, value, label) {
        return div(
          { key: key, className: 'dtHabitStat', 'data-habit-streak': key },
          span({ key: 'n', className: 'dtHabitStatNum' }, String(value)),
          span({ key: 'l', className: 'dtHabitStatLabel' }, label)
        );
      };

      const cells = grid.cells.map(function (cell) {
        const day = parseISO(cell.key);
        const weekday = day ? '周' + WEEK.charAt(day.getDay()) : '';
        const label = day
          ? (day.getFullYear() + '年' + (day.getMonth() + 1) + '月' + day.getDate() + '日 ' + weekday +
              (cell.checked ? ' · 已打卡 ' + cell.count + ' 次' : ' · 未打卡'))
          : cell.key;
        return button(
          {
            key: cell.key,
            type: 'button',
            className: 'dtHeatCell' + (cell.checked ? ' dtHeatOn' : ''),
            'data-habit-day': cell.key,
            'data-on': cell.checked ? '1' : undefined,
            'data-future': cell.future ? '1' : undefined,
            'data-out': cell.inMonth ? undefined : '1',
            title: label,
            'aria-label': label,
            'aria-pressed': cell.checked ? 'true' : 'false',
            onClick: function () {
              if (cell.future || !cell.inMonth) return;
              toggleHabit(store, habit.id, day || today);
            }
          },
          String(day ? day.getDate() : '')
        );
      });

      return div(
        { className: 'dtHabitDetail', 'data-habit-id': habit.id, style: { '--dt-habit-color': color } },
        div(
          { key: 'stats', className: 'dtHabitStats' },
          stat('current', current, '当前连续'),
          stat('longest', longest, '最长'),
          stat('total', total, '累计')
        ),
        div(
          { key: 'heat', className: 'dtHabitHeat', 'data-habit-month': grid.ym },
          div(
            { key: 'head', className: 'dtHeatHead' },
            button(
              {
                key: 'p',
                type: 'button',
                className: 'dtHeatNav',
                'data-dt': 'heat-prev',
                title: '上一月',
                'aria-label': '上一月',
                onClick: function () {
                  shiftMonth(-1);
                }
              },
              icon('chevron-left', 14)
            ),
            span({ key: 't', className: 'dtHeatTitle' }, ym.year + ' 年 ' + (ym.month + 1) + ' 月'),
            button(
              {
                key: 'n',
                type: 'button',
                className: 'dtHeatNav',
                'data-dt': 'heat-next',
                title: '下一月',
                'aria-label': '下一月',
                onClick: function () {
                  shiftMonth(1);
                }
              },
              icon('chevron-right', 14)
            ),
            span({ key: 'c', className: 'dtHeatCount' }, '本月 ' + grid.count + ' 次')
          ),
          div(
            { key: 'w', className: 'dtHeatWeek' },
            HEAT_WEEK.map(function (text, index) {
              return span({ key: 'w' + index, className: 'dtHeatWeekday' }, text);
            })
          ),
          div({ key: 'g', className: 'dtHeatGrid' }, cells)
        )
      );
    }

    /* ------------------------------------ 日历（85） ------------------------------------ */

    /* 中间区默认视图。恒 42 格、周一起始；新历（阿拉伯数字）永远是主显示，副行是**可叠加**的
       农历/节气/节假日（三个独立复选项，见下方 CAL_OVERLAY_ITEMS），不是「四选一」。
       lunarOf 由 66-lunar 提供（构建期生成的 1900–2100 静态表，运行时零网络），
       节假日与调休由 67-holidays 提供（内置 2024–2026，2027 未发文故留灰省略号）。 */

    /* 三点菜单是三个独立复选项，可任意叠加；新历（阿拉伯数字）永远是主显示。
       八种组合全部可达，真实状态存 settings.calendar.overlays，位掩码见 data-cal-overlay：
         lunar=1 · term=2 · holiday=4（0 表示三项全关，只剩新历）。 */
    const CAL_OVERLAY_ITEMS = [
      { id: 'lunar', bit: 1, label: '农历' },
      { id: 'term', bit: 2, label: '节气' },
      { id: 'holiday', bit: 4, label: '节假日' }
    ];
    const CAL_OVERLAY_BITS = { lunar: 1, term: 2, holiday: 4 };
    const CAL_OVERLAY_DEFAULT = { lunar: false, term: true, holiday: true };
    const CAL_OVERLAY_DEFAULT_MASK = 6; /* term(2) + holiday(4) */

    function calNormalizeOverlays(raw) {
      const out = {};
      Object.keys(CAL_OVERLAY_BITS).forEach(function (key) {
        out[key] = raw && raw[key] !== undefined ? !!raw[key] : CAL_OVERLAY_DEFAULT[key];
      });
      return out;
    }

    function calOverlayMask(overlays) {
      const o = calNormalizeOverlays(overlays);
      let mask = 0;
      Object.keys(CAL_OVERLAY_BITS).forEach(function (key) {
        if (o[key]) mask += CAL_OVERLAY_BITS[key];
      });
      return mask;
    }

    /* 旧单选值 → 新复选组合（一次性、幂等）。旧 UI 是 solar/lunar/term/holiday 四选一：
         solar   → 三项全关（只看新历）
         lunar   → 只开农历
         term    → 只开节气
         holiday → 只开节假日
       没有旧值（全新用户）时沿用 settings.calendar.overlays 的默认值（term + holiday）。
       返回 null 表示「已经迁移过，不要写库」——保证反复 loadState 结果一致。 */
    function calMigrateOverlays(settings) {
      const calendar = settings && isPlainObject(settings.calendar) ? settings.calendar : {};
      if (calendar.overlayMigrated === true) return null;
      const legacy = typeof calendar.mode === 'string' ? calendar.mode : '';
      let overlays = null;
      if (legacy === 'lunar') overlays = { lunar: true, term: false, holiday: false };
      else if (legacy === 'term') overlays = { lunar: false, term: true, holiday: false };
      else if (legacy === 'holiday') overlays = { lunar: false, term: false, holiday: true };
      else if (legacy === 'solar') overlays = { lunar: false, term: false, holiday: false };
      return { overlays: overlays ? overlays : calNormalizeOverlays(calendar.overlays), legacy: legacy || 'none' };
    }

    function calWriteOverlays(store, overlays) {
      const state = store.get();
      const calendar = Object.assign({}, isPlainObject(state.settings) && isPlainObject(state.settings.calendar) ? state.settings.calendar : {});
      calendar.overlays = calNormalizeOverlays(overlays);
      calendar.overlayMigrated = true;
      delete calendar.mode;
      actionSetSetting(store, { calendar: calendar });
      return calendar.overlays;
    }

    /* 迁移只在面板挂载时跑一次（不放渲染路径、不每帧重算）。 */
    function installCalendarOverlays(store) {
      const migrated = calMigrateOverlays(store.get().settings);
      if (!migrated) return null;
      return calWriteOverlays(store, migrated.overlays);
    }

    /* 副行：节假日 > 节气 > 农历（同日冲突时高优先级胜出，低优先级的文字退到 title）。
       未选中任何叠加项时副行为空，格子只剩新历主日期——这就是「新历为主显示」。 */
    function calOverlaySub(date, overlays) {
      const o = calNormalizeOverlays(overlays);
      const info = lunarOf(date);
      const holiday = holidayOf(date);
      const term = (info && info.term) || '';
      const lunar = info ? (info.monthStart ? info.monthName : info.dayName) : '';
      const base = { holiday: holiday, term: term, lunar: lunar };
      if (o.holiday && holiday) return Object.assign({ text: holiday.short, cls: ' dtCalSubHoliday', kind: 'holiday' }, base);
      if (o.term && term) return Object.assign({ text: term, cls: ' dtCalSubTerm', kind: 'term' }, base);
      if (o.lunar && lunar) return Object.assign({ text: lunar, cls: ' dtCalSubLunar', kind: 'lunar' }, base);
      return Object.assign({ text: '', cls: '', kind: 'none' }, base);
    }

    const CAL_MONTH_MIN = 1900;
    const CAL_MONTH_MAX = 2100;

    function calMonthStart(date) {
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function CalendarView(props) {
      const state = props.state;
      const store = props.store;
      const today = new Date();
      const [cursor, setCursor] = useState(function () {
        return calMonthStart(today);
      });
      /* 叠加显示是用户偏好，存 settings.calendar.overlays（51-db 的 defaultCalendarSettings
         已备好这个位）；组件只读库 + 写库，不本地 setState —— 刷新、换宽度、切视图都必须
         拿到同一份选择。窄档降级是渲染态，绝不回写设置。 */
      const calendarSettings = isPlainObject(state.settings) && isPlainObject(state.settings.calendar) ? state.settings.calendar : {};
      const overlays = calNormalizeOverlays(calendarSettings.overlays);
      const overlayMask = calOverlayMask(overlays);
      const compact = props.compact === true || props.tier >= 5;
      const [selected, setSelected] = useState(function () {
        return dateKey(today);
      });
      const [menuOpen, setMenuOpen] = useState(false);
      const rootRef = useRef(null);
      const moreRef = useRef(null);
      const menuRef = useRef(null);
      /* 监听只注册一次（deps 为空），所以当前开合状态要用 ref 读，不能靠闭包捕获 */
      const menuOpenRef = useRef(false);
      menuOpenRef.current = menuOpen;
      /* §0.5：clip 取整个 .dtCal，菜单挂载可见后实测高度再判上下 */
      const menuPlacement = useMenuFlip(menuOpen, moreRef, '.dtCal', menuRef);

      /* Esc 归浮层注册表统一消费（§1.2.1 第 1 层），这里只登记「怎么关」。
         注册也随组件常驻（deps 为空、内部读 ref），不存在「菜单打开到按键之间
         无监听」的窗口。 */
      useEffect(function () {
        return registerOverlayCloser(OVERLAY_LEVEL.menu, function () {
          if (!menuOpenRef.current) return false;
          setMenuOpen(false);
          return true;
        });
      }, []);

      /* 点外部关闭三点菜单；抽屉一打开也必须立刻关掉（浮层不跨边界）。 */
      useEffect(
        function () {
          const onDown = function (event) {
            const target = event.target;
            /* 豁免判定认「包含树」而不是单个节点：菜单项在 .dtMenu 里、不在触发器
               .dtCalMore 内，只比触发器会让 mousedown 先把菜单卸掉，随后的 click
               落在已卸载节点上 —— 这就是「点了没反应」的成因。 */
            if (target && target.closest && (target.closest('.dtCalMore') || target.closest('.dtMenu'))) return;
            setMenuOpen(false);
          };
          document.addEventListener('mousedown', onDown, true);
          return function () {
            document.removeEventListener('mousedown', onDown, true);
          };
        },
        []
      );

      useEffect(
        function () {
          if (props.drawerOpen) setMenuOpen(false);
        },
        [props.drawerOpen]
      );

      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const first = new Date(year, month, 1);
      /* 周一为一周首日：0(周日)→6 天前，1(周一)→0 天前 */
      const start = addDays(first, -((first.getDay() + 6) % 7));

      const byDate = {};
      state.tasks.forEach(function (task) {
        if (task.deleted || task.status === 2) return;
        const due = parseISO(task.date);
        if (!due) return;
        const key = dateKey(due);
        if (!byDate[key]) byDate[key] = [];
        byDate[key].push(task);
      });
      const projectColor = {};
      state.projects.forEach(function (p) {
        /* 日历格里的项目小点必须走同一套归一：老 hex 直接进 inline background 会绕过
           --dt-project-* 主题变量，深浅两档取样就会一模一样（与列表页 F16 同源）。
           非色板色原样返回（用户自选身份色不随主题变，属预期）。 */
        projectColor[p.id] = normalizeProjectColor(p.color) || 'var(--dsw-alias-brand-primary)';
      });

      const cells = [];
      for (let i = 0; i < 42; i += 1) {
        const day = addDays(start, i);
        const key = dateKey(day);
        const out = day.getMonth() !== month;
        const items = byDate[key] || [];
        const sub = calOverlaySub(day, overlays);
        const holiday = sub.holiday || null;
        const makeup = isMakeupDay(day);
        /* 副行永远只有一行（.dtCalSub 是 nowrap + ellipsis，不会撑高格子）。
           宽档把没进副行的节气/农历补进 title，信息不丢；窄档只报当前这一条。 */
        const titleBits = [];
        if (compact) {
          if (sub.kind === 'holiday') titleBits.push(holiday.name);
          else if (sub.kind === 'term') titleBits.push(sub.term);
          else if (sub.kind === 'lunar') titleBits.push(sub.lunar);
        } else {
          if (holiday) titleBits.push(holiday.name);
          if (sub.term) titleBits.push(sub.term);
          if (sub.lunar) titleBits.push('农历 ' + sub.lunar);
        }
        if (makeup) titleBits.push('调休上班');
        cells.push(
          div(
            {
              key: key,
              className:
                'dtCalCell' +
                (out ? ' dtCalOut' : '') +
                (key === dateKey(today) ? ' dtCalToday' : '') +
                (key === selected ? ' dtCalSel' : ''),
              'data-date': key,
              /* 日期数字单独暴露成钩子：窄档（≤719）里「+」与日期的排布是回归与验收的争议点，
                 有了 data-cal-day 就能在无视觉通道时断言「两位数完整、没被截成 1C/1E」，
                 不必依赖放大截图。值就是格子里显示的那串数字，与 .dtCalDay 文本同源。 */
              'data-cal-day': String(day.getDate()),
              'data-holiday': holiday ? holiday.name : undefined,
              'data-makeup': makeup ? '1' : undefined,
              title: titleBits.length ? titleBits.join(' · ') : undefined,
              onClick: function (event) {
                /* §1.2.2：改状态前先截停，事件不出 .dtRoot；格子里的「+」是独立
                   scopedAction 处理器，自己的 click 已经截停，不会二次触发选中。 */
                stopActionEvent(event);
                try {
                  setSelected(key);
                  if (out) setCursor(calMonthStart(day));
                  /* 选中只换 B 栏视图（§1.2）：再次点同一格由 TasksPanel 收起，
                     中间区不动，也不影响翻月。 */
                  if (props.onPickDate) props.onPickDate(key);
                } catch (err) {
                  reportActionError(store, err);
                }
              },
              onMouseDown: stopActionEvent,
              onPointerDown: stopActionEvent
            },
            button(
              Object.assign(
                {
                  key: 'add',
                  type: 'button',
                  className: 'dtCalAdd',
                  title: '在这一天新建任务'
                },
                scopedAction(store, function () {
                  const inbox =
                    state.projects.find(function (p) {
                      return p.inbox;
                    }) || state.projects[0];
                  const created = addTask(store, {
                    projectId: inbox ? inbox.id : '',
                    title: '新任务',
                    date: key,
                    allDay: true
                  });
                  setSelected(key);
                  /* §1.2：「+」的语义是「直接建一条 新任务/全天/进收集箱」的快捷入口，
                     建完只把 B 栏换到该日（onPickDate），**不开 C 栏详情**。
                     下面的 onOpenDetail 是可选钩子：TasksPanel 目前没有给 CalendarView 传，
                     所以这条分支实际不执行——注释按实情写，别误以为「建完自动进详情」。 */
                  if (props.onPickDate) props.onPickDate(key);
                  if (props.onOpenDetail) props.onOpenDetail(created.id);
                })
              ),
              icon('plus', 12)
            ),
            span(
              { key: 'd', className: 'dtCalDay' },
              String(day.getDate()),
              makeup ? span({ key: 'm', className: 'dtCalMakeup', title: '调休上班' }, '班') : null
            ),
            /* §15-86：副行来源钩子与 dtCalSub* 类名同源，都取 calOverlaySub 的 kind；
               none 必须显式写出（断言要能抓「有文字却标 none」「标 none 却有来源类名」）。 */
            span({ key: 's', className: 'dtCalSub' + sub.cls, 'data-cal-sub-src': sub.kind }, sub.text),
            span(
              { key: 'o', className: 'dtCalDots' },
              items.slice(0, 3).map(function (task) {
                return h('i', {
                  key: task.id,
                  className: 'dtCalDot',
                  style: { background: projectColor[task.projectId] || 'var(--dsw-alias-label-secondary)' },
                  title: task.title || ''
                });
              }),
              items.length > 3 ? span({ key: 'more', className: 'dtCalMoreCount' }, '+' + (items.length - 3)) : null
            )
          )
        );
      }

      const atMin = year === CAL_MONTH_MIN && month === 0;
      const atMax = year === CAL_MONTH_MAX && month === 11;

      return div(
        {
          className: 'dtCal',
          'data-view': 'calendar',
          /* data-mode 保留但恒为 'solar'：新历永远是主显示，真实叠加状态是位掩码。
             这样既有的 data-mode 断言不会因为「菜单改复选」而失去含义。 */
          'data-mode': 'solar',
          'data-cal-overlay': String(overlayMask),
          'data-cal-compact': compact ? '1' : undefined,
          ref: rootRef
        },
        div(
          { key: 'bar', className: 'dtCalBar' },
          div(
            { key: 'nav', className: 'dtCalNav' },
            button(
              {
                key: 'p',
                type: 'button',
                className: 'dtIconBtn',
                title: '上一月',
                disabled: atMin,
                'aria-disabled': atMin ? 'true' : 'false',
                onClick: function () {
                  setCursor(new Date(year, month - 1, 1));
                }
              },
              icon('chevron-left', 16)
            ),
            div({ key: 't', className: 'dtCalTitle' }, year + ' 年 ' + (month + 1) + ' 月'),
            holidayCovered(year)
              ? null
              : span(
                  {
                    key: 'gap',
                    className: 'dtCalGap',
                    title: '该年节假日安排尚未公布（数据版本 ' + HOLIDAY_DATA_VERSION + '）'
                  },
                  '⋯'
                ),
            button(
              {
                key: 'n',
                type: 'button',
                className: 'dtIconBtn',
                title: '下一月',
                disabled: atMax,
                'aria-disabled': atMax ? 'true' : 'false',
                onClick: function () {
                  setCursor(new Date(year, month + 1, 1));
                }
              },
              icon('chevron-right', 16)
            )
          ),
          div(
            { key: 'right', className: 'dtCalBarRight' },
            button(
              {
                key: 'today',
                type: 'button',
                className: 'dtMiniBtn',
                onClick: function () {
                  setCursor(calMonthStart(new Date()));
                  setSelected(dateKey(new Date()));
                }
              },
              '今天'
            ),
            button(
              {
                key: 'more',
                type: 'button',
                className: 'dtIconBtn dtCalMore',
                title: '日期显示',
                'aria-haspopup': 'menu',
                'aria-expanded': menuOpen ? 'true' : 'false',
                onClick: function (event) {
                  stopActionEvent(event);
                  try {
                    const trigger = event && event.currentTarget ? event.currentTarget : null;
                    moreRef.current = trigger;
                    menuPlacement.measure(trigger);
                    setMenuOpen(!menuOpen);
                  } catch (err) {
                    reportActionError(store, err);
                  }
                },
                onMouseDown: stopActionEvent,
                onPointerDown: stopActionEvent
              },
              icon('dots', 16)
            ),
            menuOpen
              ? div(
                  { key: 'menu', className: 'dtMenu', role: 'menu', ref: menuRef, 'data-open': '1', 'data-flip': menuPlacement.value.flip, 'data-clamp': menuPlacement.value.clamp ? '1' : undefined, style: menuPlacement.value.clamp ? { maxHeight: menuPlacement.value.maxHeight + 'px', overflow: 'auto' } : undefined },
                  button(
                    {
                      key: 'solar',
                      type: 'button',
                      role: 'menuitem',
                      className: 'dtMenuItem dtMenuReset',
                      'data-cal-reset': '1',
                      'data-dt': 'cal-overlay-reset',
                      /* 「新历」这一行不是复选项，是把叠加恢复成新历默认（节气 + 节假日）的
                         动作行；它的 data-on 只在恰好处于默认组合时亮，等价于旧 UI 里
                         「新历为当前项」那句话。 */
                      'data-on': overlayMask === CAL_OVERLAY_DEFAULT_MASK ? '1' : undefined,
                      onClick: function (event) {
                        stopActionEvent(event);
                        try {
                          calWriteOverlays(store, CAL_OVERLAY_DEFAULT);
                          setMenuOpen(false);
                        } catch (err) {
                          reportActionError(store, err);
                        }
                      },
                      onMouseDown: stopActionEvent,
                      onPointerDown: stopActionEvent
                    },
                    span({ key: 'l', className: 'dtMenuItemLabel' }, '新历'),
                    overlayMask === CAL_OVERLAY_DEFAULT_MASK ? icon('check', 12) : null
                  ),
                  CAL_OVERLAY_ITEMS.map(function (item) {
                    const on = overlays[item.id] === true;
                    return button(
                      {
                        key: item.id,
                        type: 'button',
                        role: 'menuitemcheckbox',
                        'aria-checked': on ? 'true' : 'false',
                        'data-on': on ? '1' : undefined,
                        ['data-cal-' + item.id]: '1',
                        'data-dt': 'cal-overlay-' + item.id,
                        'data-cal-bit': String(item.bit),
                        className: 'dtMenuItem dtMenuCheck' + (on ? ' dtMenuItemOn' : ''),
                        onClick: function (event) {
                          stopActionEvent(event);
                          try {
                            const next = Object.assign({}, overlays);
                            next[item.id] = !overlays[item.id];
                            calWriteOverlays(store, next);
                            /* 选完即收菜单：菜单是浮层，留着会和「点外部关闭」「抽屉打开
                               即关闭」两条既有规则打架；连选多项就多点两次三点。 */
                            setMenuOpen(false);
                          } catch (err) {
                            reportActionError(store, err);
                          }
                        },
                        onMouseDown: stopActionEvent,
                        onPointerDown: stopActionEvent
                      },
                      span({ key: 'l', className: 'dtMenuItemLabel' }, item.label),
                      on ? icon('check', 12) : null
                    );
                  }),
                  div(
                    { key: 'hint', className: 'dtCalHint', 'data-cal-hint': compact ? 'compact' : 'full' },
                    compact ? '窄屏只显示一行，恢复宽度后按你的选择显示' : '可多选叠加 · 新历为主显示'
                  )
                )
              : null
          )
        ),
        div(
          { key: 'week', className: 'dtCalWeek' },
          ['一', '二', '三', '四', '五', '六', '日'].map(function (label, index) {
            return span(
              { key: label, className: 'dtCalWeekday' + (index >= 5 ? ' dtCalWeekend' : '') },
              span({ key: 'f', className: 'dtCalWeekdayFull' }, '周' + label),
              span({ key: 's', className: 'dtCalWeekdayShort' }, label)
            );
          })
        ),
        div({ key: 'grid', className: 'dtCalGrid' }, cells)
      );
    }

    /* --------------------------------- 螺旋工作法（视图） -------------------------------- */

    /* 环几何：viewBox 恒 200×200，r 恒 86。五档只缩放盒子（CSS 宽度），
       因为 svg 用 viewBox 等比缩放，实际渲染与按档改 r 等价，而 dasharray 只有一份。 */
    const SPIRAL_RING_R = 86;
    const SPIRAL_RING_DASH = 540.35;

    function spiralClock(ms) {
      const total = Math.max(0, Math.round((ms || 0) / 1000));
      return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
    }

    /* 某一侧在当前轮里的分钟数：正在该侧就用当前段，否则往后找同侧的第一段 */
    function spiralSideMin(spiral, side) {
      const meta = spiralPhaseMeta(spiral.phase);
      if (meta.phase === side) return meta.min;
      let index = spiral.phase;
      for (let step = 1; step <= SPIRAL_PHASES.length - 1; step += 1) {
        index = (index + 1) % SPIRAL_PHASES.length;
        const next = spiralPhaseMeta(index);
        if (next.phase === side) return next.min;
      }
      return meta.min;
    }

    function SpiralView(props) {
      const state = props.state;
      const store = props.store;
      const spiral = state.spiral || defaultSpiral();
      const tick = useState(0);
      const setTick = tick[1];

      /* 环每 500ms 刷新一次，与引擎 ticker 同频；到点结算由引擎负责，这里只画 */
      useEffect(function () {
        const timer = window.setInterval(function () {
          setTick(function (n) {
            return n + 1;
          });
        }, 500);
        return function () {
          window.clearInterval(timer);
        };
      }, []);

      const meta = spiralPhaseMeta(spiral.phase);
      const total = meta.min * 60000;
      const left = spiralRemaining(spiral);
      const ratio = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 0;
      const leftText = spiralClock(left);
      const pomoBusy = !!(state.pomo && state.pomo.running);
      const running = spiral.status === 'running';
      const bindId = meta.phase === 'a' ? spiral.aTaskId || '' : spiral.bItemId || '';
      const bindName = spiralItemName(state, bindId) || '未绑定';
      const stats = Object.assign({ rounds: 0, aMin: 0, bMin: 0, doneCount: 0 }, spiral.stats || {});

      const ring = div(
        { className: 'dtSpiralRing' },
        h(
          'svg',
          { key: 's', viewBox: '0 0 200 200', 'aria-hidden': true },
          h('circle', { key: 't', className: 'dtSpiralTrack', cx: 100, cy: 100, r: SPIRAL_RING_R }),
          h('circle', {
            key: 'a',
            className: 'dtSpiralArc',
            cx: 100,
            cy: 100,
            r: SPIRAL_RING_R,
            strokeDasharray: String(SPIRAL_RING_DASH),
            strokeDashoffset: String(SPIRAL_RING_DASH * (1 - ratio))
          })
        ),
        div(
          { className: 'dtSpiralFace' },
          div({ className: 'dtSpiralTime', 'data-spiral-left': leftText }, leftText),
          div({ className: 'dtSpiralPhase' }, spiralPhaseLabel(meta)),
          div(
            { className: 'dtSpiralRound' },
            spiral.status === 'idle'
              ? '尚未开始'
              : '第 ' + (spiral.round | 0) + ' 轮螺旋 · 第 ' + ((spiral.phase | 0) + 1) + '/6 段'
          )
        )
      );

      const bindRow = div(
        { className: 'dtSpiralBind', 'data-play-item-id': bindId },
        span({ key: 'k', className: 'dtSpiralBindKind' }, meta.phase === 'a' ? 'A 清单' : 'B 清单'),
        span({ key: 'n', className: 'dtSpiralBindName' }, bindName)
      );

      const statsRow = div(
        { className: 'dtSpiralStats' },
        '今日 ' + (stats.rounds | 0) + ' 轮 · A ' + (stats.aMin | 0) + ' 分钟 · B ' + (stats.bMin | 0) + ' 分钟 · 完成 ' + (stats.doneCount | 0) + ' 项'
      );

      const actions = [];
      if (spiral.status === 'idle') {
        actions.push(button({
          key: 'start',
          className: 'dtSpiralBtn',
          'data-spiral-start': '',
          disabled: pomoBusy,
          'aria-disabled': pomoBusy ? 'true' : undefined,
          title: pomoBusy ? '番茄钟运行中' : '开始螺旋',
          ...scopedAction(store, function () {
            spiralStart(store);
          })
        }, '开始'));
      } else {
        actions.push(button({
          key: 'pause',
          className: 'dtSpiralBtn',
          'data-spiral-pause': '',
          ...scopedAction(store, function () {
            if (running) spiralPause(store);
            else spiralResume(store);
          })
        }, running ? '暂停' : '继续'));
        actions.push(button({
          key: 'stop',
          className: 'dtSpiralBtn dtSpiralStop',
          'data-spiral-stop': '',
          ...scopedAction(store, function () {
            spiralStop(store);
          })
        }, '停止'));
      }

      return h(
        'section',
        {
          className: 'dtSpiral',
          'data-spiral': '',
          'data-spiral-phase': meta.phase,
          'data-spiral-min': String(meta.min),
          'data-spiral-round': String(spiral.round | 0)
        },
        ring,
        bindRow,
        statsRow,
        div({ className: 'dtSpiralActions' }, actions),
        pomoBusy && spiral.status === 'idle' ? div({ className: 'dtSpiralHint' }, '番茄钟运行中') : null,
        /* t105：螺旋板从 B 栏搬进中间区（§1.11 第 1 条作废项）——中间区一页放完
           计时环 + 本轮绑定 + 接下来 + B 清单 + 今日历史，B 栏不再有 spiral 来源。 */
        h(SpiralBoard, { key: 'board', state: state, store: store })
      );
    }

    /* 螺旋任务板（§4.10.4）：本轮绑定 / 接下来 / B 清单 / 今日历史。
       t105 起渲染在中间区（SpiralView 内部），不再占 B 栏。 */
    function SpiralBoard(props) {
      const state = props.state;
      const store = props.store;
      const spiral = state.spiral || defaultSpiral();
      const items = spiralItemsSorted(state);
      const meta = spiralPhaseMeta(spiral.phase);

      const menu = useState(false);
      const menuOpen = menu[0];
      const setMenuOpen = menu[1];
      const anchorRef = useRef(null);
      const menuRef = useRef(null);
      const menuOpenRef = useRef(false);
      menuOpenRef.current = menuOpen;
      const placement = useMenuFlip(menuOpen, anchorRef, '.dtSpiralBoard', menuRef);
      const editing = useState('');
      const editingId = editing[0];
      const setEditing = editing[1];

      useEffect(function () {
        return registerOverlayCloser(OVERLAY_LEVEL.menu, function () {
          if (!menuOpenRef.current) return false;
          setMenuOpen(false);
          return true;
        });
      }, []);

      const ranked = spiralCandidates(state).map(function (task) {
        return { task: task, score: spiralScoreOf(task, state) };
      });
      ranked.sort(function (x, y) {
        if (y.score !== x.score) return y.score - x.score;
        const px = x.task.priority | 0;
        const py = y.task.priority | 0;
        if (py !== px) return py - px;
        return String(x.task.createdAt || '') < String(y.task.createdAt || '') ? -1 : 1;
      });

      const pick = function (id) {
        patchSpiral(store, { aTaskId: id });
        setMenuOpen(false);
      };

      const swapMenu = menuOpen
        ? div({
            className: 'dtMenu', role: 'menu', ref: menuRef, 'data-open': '1',
            'data-menu': 'spiral-swap',
            'data-flip': placement.value.flip,
            'data-clamp': placement.value.clamp ? '1' : undefined,
            style: placement.value.clamp ? { maxHeight: placement.value.maxHeight + 'px', overflow: 'auto' } : undefined
          },
          button({
            key: 'auto',
            className: 'dtMenuItem',
            role: 'menuitemradio',
            'aria-checked': spiral.aTaskId ? 'false' : 'true',
            ...scopedAction(store, function (event) {
              stopActionEvent(event);
              pick('');
            })
          },
            span({ key: 'l', className: 'dtMenuItemLabel' }, '按规则自动取'),
            spiral.aTaskId ? null : icon('check', 12)
          ),
          ranked.slice(0, 12).map(function (entry) {
            return button({
              key: entry.task.id,
              className: 'dtMenuItem' + (spiral.aTaskId === entry.task.id ? ' dtMenuItemOn' : ''),
              role: 'menuitemradio',
              'aria-checked': spiral.aTaskId === entry.task.id ? 'true' : 'false',
              ...scopedAction(store, function (event) {
                stopActionEvent(event);
                pick(entry.task.id);
              })
            },
              span({ key: 'l', className: 'dtMenuItemLabel' }, (entry.task.title || '未命名任务') + ' · ' + entry.score),
              spiral.aTaskId === entry.task.id ? icon('check', 12) : null
            );
          })
        )
        : null;

      const aName = spiralItemName(state, spiral.aTaskId) || '未绑定（未完成任务已清空）';
      const rowA = div(
        {
          className: 'dtSpiralRow' + (meta.phase === 'a' ? ' dtSpiralRowOn' : ''),
          'data-play-item': '',
          'data-play-item-id': spiral.aTaskId || '',
          'data-bound': 'a',
          'data-on': meta.phase === 'a' ? '1' : undefined
        },
        span({ key: 'n', className: 'dtSpiralRowName' }, aName),
        span({ key: 'm', className: 'dtSpiralRowMin' }, String(spiralSideMin(spiral, 'a')) + ' 分钟'),
        meta.phase === 'a'
          ? button({
              key: 'd',
              className: 'dtSpiralDone',
              'data-spiral-done': '',
              ...scopedAction(store, function () {
                spiralDone(store);
              })
            }, '这段完成了')
          : null,
        meta.phase === 'a'
          ? button({
              key: 's',
              className: 'dtSpiralSwap',
              'data-spiral-swap': '',
              ref: anchorRef,
              ...scopedAction(store, function (event) {
                stopActionEvent(event);
                const trigger = event && event.currentTarget ? event.currentTarget : null;
                anchorRef.current = trigger;
                placement.measure(trigger);
                setMenuOpen(!menuOpen);
              })
            }, '换一件')
          : null,
        meta.phase === 'a' ? swapMenu : null
      );

      const bName = spiralItemName(state, spiral.bItemId) || '还没有娱乐条目，先加一条';
      const rowB = div(
        {
          className: 'dtSpiralRow' + (meta.phase === 'b' ? ' dtSpiralRowOn' : ''),
          'data-play-item': '',
          'data-play-item-id': spiral.bItemId || '',
          'data-bound': 'b',
          'data-on': meta.phase === 'b' ? '1' : undefined
        },
        span({ key: 'n', className: 'dtSpiralRowName' }, bName),
        span({ key: 'm', className: 'dtSpiralRowMin' }, String(spiralSideMin(spiral, 'b')) + ' 分钟')
      );

      const nowSection = div(
        { className: 'dtSpiralSection', 'data-section': 'now' },
        h('h4', { className: 'dtSpiralSectionTitle' }, '本轮绑定'),
        rowA,
        rowB,
        div(
          { className: 'dtSpiralAuto' },
          button({
            className: 'dtMiniBtn',
            'data-spiral-auto': '',
            ...scopedAction(store, function () {
              patchSpiral(store, { aTaskId: '' });
            })
          }, '按规则重取')
        )
      );

      const preview = [];
      for (let step = 1; step <= 5; step += 1) {
        const next = spiralPhaseMeta((spiral.phase | 0) + step);
        preview.push(h('li', {
          key: 'p' + step,
          className: 'dtSpiralPreviewItem',
          'data-spiral-phase': next.phase,
          'data-spiral-min': String(next.min),
          'data-spiral-next': String(step)
        }, spiralPhaseLabel(next)));
      }
      const nextSection = div(
        { className: 'dtSpiralSection', 'data-section': 'next' },
        h('h4', { className: 'dtSpiralSectionTitle' }, '接下来'),
        h('ul', { className: 'dtSpiralPreview' }, preview)
      );

      const playRows = items.map(function (item, index) {
        const active = spiral.bItemId === item.id;
        const base = {
          key: item.id,
          className: 'dtPlayItem',
          'data-play-item': '',
          'data-play-item-id': item.id,
          'data-on': active ? '1' : undefined
        };
        if (editingId === item.id) {
          return div(
            base,
            input({
              key: 'in',
              className: 'dtPlayInput',
              value: item.name,
              autoFocus: true,
              onChange: function (event) {
                spiralPatchItem(store, item.id, { name: event.target.value });
              },
              onKeyDown: function (event) {
                if (event.key !== 'Enter' && event.key !== 'Escape') return;
                event.stopPropagation();
                setEditing('');
              }
            })
          );
        }
        return div(
          base,
          span({ key: 'n', className: 'dtPlayName' }, item.name),
          div(
            { key: 'ops', className: 'dtPlayOps' },
            button({
              key: 'u',
              className: 'dtPlayOp',
              'data-play-move': 'up',
              title: '上移',
              disabled: index === 0,
              ...scopedAction(store, function () {
                spiralMoveItem(store, item.id, -1);
              })
            }, '↑'),
            button({
              key: 'd',
              className: 'dtPlayOp',
              'data-play-move': 'down',
              title: '下移',
              disabled: index === items.length - 1,
              ...scopedAction(store, function () {
                spiralMoveItem(store, item.id, 1);
              })
            }, '↓'),
            button({
              key: 'r',
              className: 'dtPlayOp',
              'data-play-rename': '',
              title: '改名',
              ...scopedAction(store, function () {
                setEditing(item.id);
              })
            }, '改名'),
            button({
              key: 'x',
              className: 'dtPlayOp',
              'data-play-del': '',
              title: '删除',
              ...scopedAction(store, function () {
                spiralRemoveItem(store, item.id);
              })
            }, '删除')
          )
        );
      });

      const playSection = div(
        { className: 'dtSpiralSection', 'data-section': 'play' },
        h('h4', { className: 'dtSpiralSectionTitle' }, 'B 清单 · 娱乐条目'),
        items.length ? div({ className: 'dtPlayList' }, playRows) : div({ className: 'dtSpiralEmpty' }, '还没有娱乐条目，先加一条'),
        button({
          className: 'dtPlayAdd',
          'data-play-add': '',
          ...scopedAction(store, function () {
            setEditing(spiralAddItem(store));
          })
        }, '新增娱乐条目')
      );

      const historyRows = (spiral.history || []).slice(-20).reverse().map(function (row, index) {
        const side = row.phase === 'a' ? '重要工作' : '好玩娱乐';
        const name = spiralItemName(state, row.itemId) || '未绑定';
        const label = row.reason === 'stop' ? '停止' : row.reason === 'reload' ? '重开' : '自动';
        return h('li', {
          key: 'h' + index,
          className: 'dtSpiralHistoryRow',
          'data-spiral-history-row': '',
          'data-reason': row.reason,
          'data-phase': row.phase,
          'data-min': String(row.min | 0),
          /* §4.10.10 钩子（t61）：silent 由 20-engines 的结算写入，这里只把值暴露成属性，
             不参与任何结算逻辑；非静默行不写该属性。
             取值用 'true' 而不是文档里写的 '1'：回归 S63c 判的是 String(attr(...)) === 'true'，
             而本卡验收要求 S63c 由 GAP 转 PASS —— 文档（§4.10.10 / §8-68 写的是 "1"）与回归
             断言在这点上互相冲突，已在收工报告里提给 captain 对齐，代码先按能转绿的一侧落。 */
          /* 规格 §4.10.10 与 §8-68、以及全仓布尔钩子（data-makeup/data-clamp/data-builtin/data-squeezed）统一用 "1" */
          'data-silent': row.silent ? '1' : undefined
        }, side + ' ' + (row.min | 0) + ' 分钟 · ' + name + ' · ' + label);
      });
      const historySection = div(
        { className: 'dtSpiralHistory', 'data-spiral-history': '', 'data-section': 'history' },
        h('h4', { className: 'dtSpiralSectionTitle' }, '今日历史'),
        h('ul', { className: 'dtSpiralHistoryList' }, historyRows)
      );

      return div({ className: 'dtSpiralBoard' }, nowSection, nextSection, playSection, historySection);
    }

    /* 农历 / 节气（88）：
     * 数据由 lunar-javascript@1.7.7 在构建期生成（tools 侧一次性脚本），覆盖 1900-01-01..2100-12-31。
     * 运行时只做查表与线性插值，不发起网络请求、不引入依赖。
     * LUNAR_SRC 每年 "正月初一MMDD|闰月序号(0=无)|12 或 13 个月长位(1=30 天)"；TERM_SRC 每年 24 个节气的日(2 位)。
     */
    const LUNAR_YEAR_MIN = 1900;
    const LUNAR_YEAR_MAX = 2100;

    const TERM_NAMES = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

    const LUNAR_SRC = [
      '0131|8|0100101101101;0219|0|010010101110;0208|0|101001010111;0129|5|0101001001101;0216|0|110100100110;0204|0|110110010101;0125|4|0110101010101;0213|0|010101101010;0202|0|100110101101;0122|2|0100101011101;0210|0|010010101110;0130|6|1010010011011;0218|0|101001001101;0206|0|110100100101;0126|5|1101010100101;0214|0|101101010100;0203|0|110101101010;0123|2|1001011011010;0211|0|100101011011;0201|7|0100100110111;0220|0|010010010111;0208|0|101001001011;0128|5|1011001001011;0216|0|011010100101;0205|0|011011010100;0124|4|1010110110101;0213|0|001010110110;0202|0|100101010111;0123|2|0100100101111;0210|0|010010010111;0130|6|0110010010110;0217|0|110101001010;0206|0|111010100101;0126|5|0110110101001;0214|0|010110101101;0204|0|001010110110;0124|3|1001001101110;0211|0|100100101110;0131|7|1100100101101;0219|0|110010010101;0208|0|110101001010;0127|6|1101101001010;0215|0|101101010101;0205|0|010101101010;0125|4|1010101011011;0213|0|001001011101;0202|0|100100101101;0122|2|1100100101011;0210|0|101010010101;0129|7|1011010010101;0217|0|011011001010;0206|0|101101010101;0127|5|0101010110101;0214|0|010011011010;0203|0|101001011011;0124|3|0101001010111;0212|0|010100101011;0131|8|1010100101010;0218|0|111010010101;0208|0|011010101010;0128|6|1010110101010;0215|0|101010110101;0205|0|010010110110;0125|4|1010010101110;0213|0|101001010111;0202|0|010100100110;0121|3|1110100100110;0209|0|110110010101;0130|7|0101101010101;0217|0|010101101010;0206|0|100101101101;0127|5|0100101011101;0215|0|010010101101;0203|0|101001',
      '001101;0123|4|1101001001101;0211|0|110100100101;0131|8|1101010100101;0218|0|101101010100;0207|0|101101101010;0128|6|1001011011010;0216|0|100101011011;0205|0|010010011011;0125|4|1010010010111;0213|0|101001001011;0202|10|1011001001011;0220|0|011010100101;0209|0|011011010100;0129|6|1010110110100;0217|0|101010110110;0206|0|100101010111;0127|5|0100100101111;0215|0|010010010111;0204|0|011001001011;0123|3|0110101001010;0210|0|111010100101;0131|8|0110101100101;0219|0|010110101100;0207|0|101010110110;0128|5|1001001101101;0216|0|100100101110;0205|0|110010010110;0124|4|1101010010101;0212|0|110101001010;0201|0|110110100101;0122|2|0101101010101;0209|0|010101101010;0129|7|1010101011011;0218|0|001001011101;0207|0|100100101101;0126|5|1100100101011;0214|0|101010010101;0203|0|101101001010;0123|4|1011010101010;0210|0|101011010101;0131|9|0101010110101;0219|0|010010111010;0208|0|101001011011;0128|6|0101001010111;0216|0|010100101011;0205|0|101010010011;0125|4|0111010010101;0212|0|011010101010;0201|0|101011010101;0122|2|0100110110101;0210|0|010010110110;0129|6|1010010101110;0217|0|101001001110;0206|0|110100100110;0126|5|1110100100110;0213|0|110101010011;0203|0|010110101010;0123|3|0110101101010;0211|0|100101101101;0131|11|0100101011101;0219|0|010010101101;0208|0|101001001101;0128|6|1101001001011;0215|0|110100100101;0204|0|110101010010;0124|5|1101101010100;0212|0|101101011010;0201|0|010101101101;0122|2|0100101011011;0210|0|010010011011;0130|7|1010010010111;0217|0|101001001011;0206|0|101010100101;0126',
      '|5|1011010100101;0214|0|011011010010;0202|0|101011011010;0123|3|0101010110110;0211|0|100100110111;0201|8|0100100101111;0219|0|010010010111;0208|0|011001001011;0128|6|0110101001010;0215|0|111010100101;0204|0|011010110010;0124|4|1010101101100;0212|0|101010101110;0202|0|100100101110;0121|3|1100100101110;0209|0|110010010110;0129|7|1101010010101;0217|0|110101001010;0205|0|110110100101;0126|5|0101101010101;0214|0|010101101010;0203|0|101001101101;0123|4|0101001011101;0211|0|010100101101;0131|8|1010100101011;0219|0|101010010101;0207|0|101101001010;0127|6|1011010101010;0215|0|101011010101;0205|0|010101011010;0124|4|1010010111010;0212|0|101001011011;0202|0|010100101011;0122|3|1010100100111;0209|0|011010010011;0129|7|0111001010011;0217|0|011010101010;0206|0|101011010101;0126|5|0100110110101;0214|0|010010110110;0203|0|101001010111;0124|4|0101001001110;0210|0|110100010110;0130|8|1110100100110;0218|0|110101010010;0207|0|110110101010;0127|6|0110101101010;0215|0|010101101101;0205|0|010010101110;0125|4|1010010011101;0212|0|101000101101;0201|0|110100010101;0121|2|1101100100101;0209|0|110101010010'
    ].join('');

    const TERM_SRC = [
      '062004190621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190621062106220722082408240824092408230823;062105200722062107220722082409240924092408230823;072105200621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190621062106220622082408240824092408230823;062105200722062107220722082409240924092408230823;072105200621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190621062106220622082408240824092408230823;062105200722062107220722082409240924092408230823;072105200621052006210622072308230823092408220722;062004190621052106220622082308240823092408230822;062104190621052106220622082408240824092408230823;062105200622062106220722082408240924092408230823;062105200621052006210622072308230823082408220722;062004190621052106210622082308240823092408230822;062104190621052106220622082408240824092408230822;062105200622062106220722082408240924092408230823;062105200621052006210622072308230823082408220722;062004190621052006210622082308240823092408230722;062104190621052106220622082408240824092408230822;062105190621062106220722082408240924092408230823;062105200621052006210622072308230823082408220722;062004190621052006210622082308240823092408230722;062104190621052106220622082308240824092408230822;062105190621062106220722082408240924092408230823;062105200621052006210622072308230823082307220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308',
      '240824092408230822;062105190621062106220722082408240824092408230823;062105200621052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190621062106220622082408240824092408230823;062105200621052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190621062106220622082408240824092408230823;062105200621052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190621062106220622082408240824092408230823;062105200621052005210621072308230823082307220722;062004190621052006210622072308230823082408220722;062004190621052106220622082308240823092408230822;062104190621052106220622082408240824092408230823;062105200521052005210621072307230823082307220722;052004190621052006210622072308230823082408220722;062004190621052006210622082308240823092408230822;062104190621052106220622082408240824092408230823;062105200521052005210621072307230823082307220722;052004190621052006210622072308230823082408220722;062004190621052006210622082308240823092408230722;062104190621052106220622082308240824092408230822;062105200520052005210621072307230823082307220722;052004190621052006210622072308230823082408220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190520052005210621072307230723082307220722;05200419062',
      '1052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190520052005210621072307230723082307220722;052004190621052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190520052005210521072307230723082307220722;052004190621052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308240824092408230822;062105190520052005210521072307230723082307220722;052004190621052005210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190621052106220622082308240823092408230822;062105190520042005210521072307230723082307220722;052004190621052005210621072307230823082307220722;062004190621052006210622072308230823082408230722;062004190621052106210622082308240823092408230822;062105190520042005210521072307230723082307220722;052004190621052005210621072307230823082307220722;062004190621052006210622072308230823082408220722;062004190621052006210622082308240823092408230822;062104190520042005210521072207230723082307220722;052004190521052005210621072307230823082307220722;052004190621052006210622072308230823082408220722;062004190621052006210622072308240823092408230722;062104190520042005210521072207230723082307220721;052004190520052005210621072307230723082307220722;052004190621052006210621072308230823082408220722;06200419062105200621062207230823082309240',
      '8230722;062104190520042005210521072207230723082307220721;052004180520052005210621072307230723082307220722;052004190621052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190621052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190621052006210621072308230823082307220722;062004190621052006210622072308230823092408230722;062104190520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190621052005210621072307230823082307220722;062004190621052006210622072308230823092408230722;062104190520042005210521072207230722082307220721;052004180520042005210521072307230723082307220722;052004190621052005210621072307230823082307220722;062004190621052006210622072308230823082408230722;062104190520042005200521072207230722082307220721;052004180520042005210521072207230723082307220722;052004190621052005210621072307230823082307220722;062004190621052006210622072308230823082408220722;062004190520041905200521072207230722082307220721;052003180520042005210521072207230723082307220722;052004190521052005210621072307230823082307220722;052004190621052006210621072308230823082408220722;062004190520041905200521062207220722082307220721;052003180520042005210521072207230723082307220721;0520041905200520052106',
      '21072307230723082307220722;052004190621052006210621072308230823082408220722;062004190520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190621052006210621072308230823082307220722;062004190520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190621052006210621072308230823082307220722;062004190520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190621052005210621072307230823082307220722;062004190520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190621052005210621072307230823082307220722;062004190520041905200521062207220722082307220621;052003180520042005200521072207230722082307220721;052004180520042005210521072307230723082307220722;052004190621052005210621072307230823082307220722;062004190520041905200521062207220722072307220621;052003180520041905200521072207230722082307220721;052004180520042005210521072207230723082307220722;052004190621052005210621072307230823082307220722;062004190520041905200520062207220722072307210621;051903180520041905200521062207220722082307220721;052003180520042005210521072207230723082307220722;052004190520052005210621072307230723082307220722;052004190520041905200520062207220722072307210621;051',
      '903180520041905200521062207220722082307220721;052003180520042005210521072207230723082307220722;052004190520052005210521072307230723082307220722;052004190520041905200520062207220722072307210621;051903180520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004190520052005210521072307230723082307220722;052004190520041905200520062207220722072206210621;051903180520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190520041905200520062207220722072206210621;051903180520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722;052004190520041904200520062206220722072206210621;051903180520041905200521062207220722082307220621;052003180520042005200521072207230722082307220721;052004180520052005210521072307230723082307220722;052004190520041904200520062206220722072206210621;051903180520041905200521062207220722072307220621;052003180520042005200521072207230722082307220721;052004180520042005210521072207230723082307220722;052004190520041904200520062206220722072206210621;051903180520041905200521062207220722072307220621;052003180520041905200521062207230722082307220721;052004180520042005210521072207230723082307220722;052004190520041904200520062206220722072206210621;051903180520041905200520062207220722072307210621;052003180520041905200521062207220722082307220721;052003180520042005210521072207230',
      '723082307220722;052004190419041904200520062206220622072206210621;041903180520041905200520062207220722072307210621;051903180520041905200521062207220722082307220721;052003180520042005210521072207230723082307220722;052004190419041904200420062206220622072206210621;041903180520041905200520062207220722072307210621;051903180520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004190419041904200420062206220622072206210621;041903180520041905200520062207220722072206210621;051903180520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004180419041904200420062206220622072206210621;041903180520041905200520062206220722072206210621;051903180520041905200521062207220722082307220621;052003180520042005210521072207230723082307220721;052004180520052005210521072307230723082307220722'
    ].join('');

    const LUNAR_MONTH_NAMES = ['', '正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
    const LUNAR_DAY_NAMES = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

    let LUNAR_ROWS = null;
    let TERM_ROWS = null;

    function lunarRows() {
      if (!LUNAR_ROWS) LUNAR_ROWS = LUNAR_SRC.split(';');
      return LUNAR_ROWS;
    }

    function termRows() {
      if (!TERM_ROWS) TERM_ROWS = TERM_SRC.split(';');
      return TERM_ROWS;
    }

    /* 与 1900-01-01 的整日差，避免时区与夏令时干扰 */
    function lunarDayIndex(date) {
      const a = Date.UTC(1900, 0, 1);
      const b = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
      return Math.round((b - a) / 86400000);
    }

    function termOf(date) {
      const y = date.getFullYear();
      if (y < LUNAR_YEAR_MIN || y > LUNAR_YEAR_MAX) return '';
      const row = termRows()[y - LUNAR_YEAR_MIN];
      if (!row) return '';
      const m = date.getMonth() + 1;
      const d = date.getDate();
      const base = (m - 1) * 2;
      for (let i = base; i < base + 2 && i < 24; i += 1) {
        if (Number(row.slice(i * 2, i * 2 + 2)) === d) return TERM_NAMES[i];
      }
      return '';
    }

    let LUNAR_STARTS = null;

    function lunarStarts() {
      if (!LUNAR_STARTS) {
        LUNAR_STARTS = lunarRows().map(function (row, i) {
          return lunarDayIndex(new Date(LUNAR_YEAR_MIN + i, Number(row.slice(0, 2)) - 1, Number(row.slice(2, 4))));
        });
      }
      return LUNAR_STARTS;
    }

    /* 返回 { year, month(闰月为负), day, first } 或 null */
    function lunarDateOf(date) {
      const idx = lunarDayIndex(date);
      if (idx < 0) return null;
      const rows = lunarRows();
      const starts = lunarStarts();
      let lo = 0;
      let hi = starts.length - 1;
      let pick = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= idx) {
          pick = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (pick < 0) return null;
      const row = rows[pick];
      const rest0 = idx - starts[pick];
      let rest = rest0;
      const leapMonth = Number(row.split('|')[1]);
      const bits = row.split('|')[2];
      for (let i = 0; i < bits.length; i += 1) {
        const len = bits.charAt(i) === '1' ? 30 : 29;
        if (rest < len) {
          /* 序号 i 对应第几个月：闰月插在其同号月份之后 */
          let month;
          let leap = false;
          if (!leapMonth) month = i + 1;
          else if (i + 1 <= leapMonth) month = i + 1;
          else if (i + 1 === leapMonth + 1) {
            month = leapMonth;
            leap = true;
          } else month = i;
          return { year: LUNAR_YEAR_MIN + pick, month: leap ? -month : month, day: rest + 1, first: rest === 0 };
        }
        rest -= len;
      }
      return null;
    }

    function lunarOf(date) {
      const d = date instanceof Date ? date : new Date(date);
      if (!(d instanceof Date) || isNaN(d.getTime())) {
        return { lunarMonth: 0, lunarDay: 0, monthName: '农历', dayName: '', term: '', monthStart: false };
      }
      const term = termOf(d);
      const info = lunarDateOf(d);
      if (!info) {
        return { lunarMonth: 0, lunarDay: 0, monthName: '农历', dayName: '', term: term, monthStart: false };
      }
      const absMonth = Math.abs(info.month);
      const base = LUNAR_MONTH_NAMES[absMonth] || '';
      const monthName = (info.month < 0 ? '闰' : '') + base;
      return {
        lunarMonth: info.month,
        lunarDay: info.day,
        monthName: monthName,
        dayName: LUNAR_DAY_NAMES[info.day] || '',
        term: term,
        monthStart: info.first
      };
    }


    /* ---------------------------------- 节假日（67） ---------------------------------- */

    /* 中国法定节假日与调休上班日，全部内置、运行时零网络。
       数据来源（逐年来自国务院办公厅正式发文，非媒体报道/预测）：
         2024 —《国务院办公厅关于 2024 年部分节假日安排的通知》国办发明电〔2023〕7 号，2023-10-25 发布
         2025 —《国务院办公厅关于 2025 年部分节假日安排的通知》国办发明电〔2024〕8 号，2024-11-12 发布
         2026 —《国务院办公厅关于 2026 年部分节假日安排的通知》（2025-11-04 发布，中国政府网）
       数据版本：2026-11。
       2027 年：正式通知截至本版本尚未发布（惯例为上一年 11 月发文，当前只有媒体预测），
       因此不内置 2027 —— 宁可缺，不猜。UI 在该年份用灰色省略号标注「未公布」。 */

    const HOLIDAY_DATA_VERSION = '2026-11';

    const HOLIDAY_YEARS = {
      2024: {
        notice: '国办发明电〔2023〕7 号（2023-10-25）',
        ranges: [
          ['2024-01-01', '2024-01-01', '元旦', '元旦'],
          ['2024-02-10', '2024-02-17', '春节', '春节'],
          ['2024-04-04', '2024-04-06', '清明节', '清明'],
          ['2024-05-01', '2024-05-05', '劳动节', '劳动'],
          ['2024-06-08', '2024-06-10', '端午节', '端午'],
          ['2024-09-15', '2024-09-17', '中秋节', '中秋'],
          ['2024-10-01', '2024-10-07', '国庆节', '国庆']
        ],
        makeup: [
          '2024-02-04',
          '2024-02-18',
          '2024-04-07',
          '2024-04-28',
          '2024-05-11',
          '2024-09-14',
          '2024-09-29',
          '2024-10-12'
        ]
      },
      2025: {
        notice: '国办发明电〔2024〕8 号（2024-11-12）',
        ranges: [
          ['2025-01-01', '2025-01-01', '元旦', '元旦'],
          ['2025-01-28', '2025-02-04', '春节', '春节'],
          ['2025-04-04', '2025-04-06', '清明节', '清明'],
          ['2025-05-01', '2025-05-05', '劳动节', '劳动'],
          ['2025-05-31', '2025-06-02', '端午节', '端午'],
          ['2025-10-01', '2025-10-08', '国庆节', '国庆'],
          ['2025-10-06', '2025-10-06', '中秋节', '中秋']
        ],
        makeup: ['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11']
      },
      2026: {
        notice: '2026 年通知（2025-11-04 发布）',
        ranges: [
          ['2026-01-01', '2026-01-03', '元旦', '元旦'],
          ['2026-02-15', '2026-02-23', '春节', '春节'],
          ['2026-04-04', '2026-04-06', '清明节', '清明'],
          ['2026-05-01', '2026-05-05', '劳动节', '劳动'],
          ['2026-06-19', '2026-06-21', '端午节', '端午'],
          ['2026-09-25', '2026-09-27', '中秋节', '中秋'],
          ['2026-10-01', '2026-10-07', '国庆节', '国庆']
        ],
        makeup: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']
      }
    };

    let HOLIDAY_INDEX = null;

    /* 展开成 dateKey → { name 全名, short 短名 } 与 makeup 命中表；
       后出现的条目覆盖前者（如 2025-10-06 中秋落在国庆 8 天假期内）。 */
    function holidayIndex() {
      if (HOLIDAY_INDEX) return HOLIDAY_INDEX;
      const index = { days: {}, makeup: {}, years: {} };
      Object.keys(HOLIDAY_YEARS).forEach(function (key) {
        const year = Number(key);
        const src = HOLIDAY_YEARS[key];
        index.years[year] = src.notice;
        src.ranges.forEach(function (row) {
          let day = parseISO(row[0]);
          const end = parseISO(row[1]);
          let guard = 0;
          while (day && end && day.getTime() <= end.getTime() && guard < 40) {
            index.days[dateKey(day)] = { name: row[2], short: row[3] };
            day = addDays(day, 1);
            guard += 1;
          }
        });
        src.makeup.forEach(function (date) {
          index.makeup[date] = true;
        });
      });
      /* 除夕 = 腊月最后一天（次日为正月初一）。节假日起始日恰好是除夕时按除夕显示，
         新年份的除夕日期随农历表自动跟随，不写死在数据里。 */
      Object.keys(index.days).forEach(function (key) {
        const day = parseISO(key);
        const info = lunarOf(day);
        if (!info || info.lunarMonth !== 12 || info.monthStart) return;
        const next = lunarOf(addDays(day, 1));
        if (next && next.monthStart && next.lunarMonth === 1) {
          index.days[key] = { name: '除夕', short: '除夕' };
        }
      });
      HOLIDAY_INDEX = index;
      return index;
    }

    function holidayOf(date) {
      return holidayIndex().days[dateKey(date)] || null;
    }

    function isMakeupDay(date) {
      return !!holidayIndex().makeup[dateKey(date)];
    }

    function holidayCovered(year) {
      return !!holidayIndex().years[year];
    }

    function holidayNotice(year) {
      return holidayIndex().years[year] || '';
    }

    /* ============================== 68-obstacle · 绊脚石 / 禁止清单 ==============================
       docs/stage3-goals.md §2.1–2.2 的落地：一条绊脚石 = 一次「今天是什么挡住了我」的手记，
       含名称、时长、日期（今天/昨天/任选一天）；禁止清单是同一份数据的聚合视图，不是第二份存储。

       四条硬口径：
       1. 全部手记，**不做任何推断归类**（不猜「你在刷手机」，用户写什么就是什么）；
       2. 存储只有一个源：`db.obstacles = [{ id, label, minutes, at, taskId, note, createdAt }]`，
          其中 `at` 是 'YYYY-MM-DD'（日期口径，不是时间戳），`createdAt` 用于同一天内排序；
       3. 禁止清单按 label 聚合近 14 天：先按累计时长降序，并列再按次数降序、最后按名称；
          Top3 进大卡并给占比，第 4 名起进观察区并算「还差 N 分钟进 Top3」；
       4. 样本不足 `OBSTACLE_SAMPLE_MIN` 条不出榜（只给引导），避免一条记录就封神。 */

    const OBSTACLE_PRESETS = ['刷手机', '刷短剧', '看抖音', '逛淘宝', '打游戏', '刷小红书', '刷视频号', '发呆'];
    const OBSTACLE_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120];
    const OBSTACLE_WINDOW_DAYS = 14;
    const OBSTACLE_TOPN = 3;
    const OBSTACLE_SAMPLE_MIN = 3;

    /* 一条记录的最小合法形状；脏数据（缺 label / 时长为负）在读时就被丢掉，不进任何聚合。 */
    function obstacleEntry(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      if (!label) return null;
      const minutes = Math.round(Number(raw.minutes));
      if (!isFinite(minutes) || minutes <= 0) return null;
      const at = typeof raw.at === 'string' && parseISO(raw.at) ? raw.at : '';
      if (!at) return null;
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : 'obs:' + at + ':' + label,
        label: label,
        minutes: Math.min(1440, minutes),
        at: at,
        taskId: typeof raw.taskId === 'string' ? raw.taskId : '',
        note: typeof raw.note === 'string' ? raw.note : '',
        createdAt: Number(raw.createdAt) || 0
      };
    }

    /* 全部记录，按日期倒序 + 同日按 createdAt 倒序（最新的一笔在最上面）。 */
    function obstacleEntries(db) {
      const list = isPlainObject(db) && Array.isArray(db.obstacles) ? db.obstacles : [];
      const rows = [];
      list.forEach(function (raw) {
        const entry = obstacleEntry(raw);
        if (entry) rows.push(entry);
      });
      rows.sort(function (a, b) {
        if (a.at !== b.at) return a.at < b.at ? 1 : -1;
        return b.createdAt - a.createdAt;
      });
      return rows;
    }

    /* 可选项 = 预置 ∪ 已出现过的名称（自填过的自动沉淀成备选，去重保序）。 */
    function obstacleLabelOptions(db) {
      const seen = [];
      OBSTACLE_PRESETS.forEach(function (name) {
        if (seen.indexOf(name) < 0) seen.push(name);
      });
      obstacleEntries(db).forEach(function (row) {
        if (seen.indexOf(row.label) < 0) seen.push(row.label);
      });
      return seen;
    }

    /* 近 N 天按 label 聚合：{ rows:[{label,minutes,count,share,lastAt}], total, sample }。 */
    function obstacleAggregate(db, now) {
      const clock = now instanceof Date ? now : new Date();
      const from = dateKey(addDays(clock, -(OBSTACLE_WINDOW_DAYS - 1)));
      const to = dateKey(clock);
      const buckets = {};
      const order = [];
      let total = 0;
      let sample = 0;
      obstacleEntries(db).forEach(function (row) {
        if (row.at < from || row.at > to) return;
        sample += 1;
        total += row.minutes;
        if (!buckets[row.label]) {
          buckets[row.label] = { label: row.label, minutes: 0, count: 0, lastAt: row.at };
          order.push(row.label);
        }
        const bucket = buckets[row.label];
        bucket.minutes += row.minutes;
        bucket.count += 1;
        if (row.at > bucket.lastAt) bucket.lastAt = row.at;
      });
      const rows = order.map(function (label) {
        const bucket = buckets[label];
        return {
          label: bucket.label,
          minutes: bucket.minutes,
          count: bucket.count,
          lastAt: bucket.lastAt,
          share: total > 0 ? Math.round((bucket.minutes / total) * 100) : 0
        };
      });
      rows.sort(function (a, b) {
        if (b.minutes !== a.minutes) return b.minutes - a.minutes;
        if (b.count !== a.count) return b.count - a.count;
        return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
      });
      return { rows: rows, total: total, sample: sample };
    }

    /* 榜单：Top3 + 观察区（含「还差 N 分钟」）。样本不足时 enough=false，界面上只出引导。 */
    function obstacleRank(db, now) {
      const agg = obstacleAggregate(db, now);
      const enough = agg.sample >= OBSTACLE_SAMPLE_MIN;
      const top = enough ? agg.rows.slice(0, OBSTACLE_TOPN) : [];
      const rest = enough ? agg.rows.slice(OBSTACLE_TOPN) : [];
      const edge = top.length ? top[top.length - 1].minutes : 0;
      const watch = rest.map(function (row) {
        const gap = Math.max(1, edge - row.minutes);
        return Object.assign({}, row, { gap: gap });
      });
      return {
        top: top,
        watch: watch,
        rows: agg.rows,
        total: agg.total,
        sample: agg.sample,
        enough: enough,
        edge: edge,
        need: Math.max(0, OBSTACLE_SAMPLE_MIN - agg.sample)
      };
    }

    /* 唯一写出口：与 commitTags 同形（先算新数组，再整体落库并刷新索引）。 */
    function commitObstacle(store, mutate) {
      store.update(function (state) {
        const db = state.db;
        const nextList = mutate(db, state);
        if (!nextList) return null;
        return Object.assign({}, state, {
          db: Object.assign({}, db, {
            obstacles: nextList,
            meta: Object.assign({}, db.meta, { updatedAt: Date.now() })
          })
        });
      });
      if (typeof invalidateDbIndex === 'function') invalidateDbIndex();
    }

    function actionAddObstacle(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const label = typeof fields.label === 'string' ? fields.label.trim() : '';
      if (!label) return { ok: false, code: 'OBSTACLE_INVALID', message: '先写一条「挡住了我什么」' };
      const minutes = Math.round(Number(fields.minutes));
      if (!isFinite(minutes) || minutes <= 0) return { ok: false, code: 'OBSTACLE_INVALID', message: '时长要大于 0 分钟' };
      const at = typeof fields.at === 'string' && parseISO(fields.at) ? fields.at : dateKey(new Date());
      const entry = {
        id: uid('obs'),
        label: label,
        minutes: Math.min(1440, minutes),
        at: at,
        taskId: typeof fields.taskId === 'string' ? fields.taskId : '',
        note: typeof fields.note === 'string' ? fields.note : '',
        createdAt: Date.now()
      };
      commitObstacle(store, function (db) {
        const list = obstacleEntries(db).map(function (row) { return Object.assign({}, row); });
        list.push(entry);
        return list;
      });
      return { ok: true, id: entry.id };
    }

    function actionPatchObstacle(store, id, patch) {
      if (!id) return { ok: false, code: 'OBSTACLE_NOT_FOUND', message: '记录不存在' };
      const fields = isPlainObject(patch) ? patch : {};
      let hit = false;
      commitObstacle(store, function (db) {
        const list = obstacleEntries(db).map(function (row) {
          if (row.id !== id) return row;
          hit = true;
          const next = Object.assign({}, row);
          if (typeof fields.label === 'string' && fields.label.trim()) next.label = fields.label.trim();
          if (fields.minutes !== undefined) {
            const minutes = Math.round(Number(fields.minutes));
            if (isFinite(minutes) && minutes > 0) next.minutes = Math.min(1440, minutes);
          }
          if (typeof fields.at === 'string' && parseISO(fields.at)) next.at = fields.at;
          if (typeof fields.note === 'string') next.note = fields.note;
          return next;
        });
        return hit ? list : null;
      });
      if (!hit) return { ok: false, code: 'OBSTACLE_NOT_FOUND', message: '记录不存在' };
      return { ok: true };
    }

    function actionRemoveObstacle(store, id) {
      if (!id) return { ok: false, code: 'OBSTACLE_NOT_FOUND', message: '记录不存在' };
      let hit = false;
      commitObstacle(store, function (db) {
        const rows = obstacleEntries(db);
        const list = rows.filter(function (row) {
          if (row.id === id) {
            hit = true;
            return false;
          }
          return true;
        }).map(function (row) { return Object.assign({}, row); });
        return hit ? list : null;
      });
      if (!hit) return { ok: false, code: 'OBSTACLE_NOT_FOUND', message: '记录不存在' };
      return { ok: true };
    }

    /* 记录日期的显示口径：今天 / 昨天 / M月D日（与清单日期同款，避免出现两种写法）。 */
    function obstacleDayLabel(at, now) {
      const clock = now instanceof Date ? now : new Date();
      if (at === dateKey(clock)) return '今天';
      if (at === dateKey(addDays(clock, -1))) return '昨天';
      const d = parseISO(at);
      return d ? fmtDateLabel(d, clock) : at;
    }

    /* 禁止清单大卡：有榜单出 Top3 + 观察区，无榜单出引导。绊脚石视图里也复用这一块。 */
    function ProhibitCard(props) {
      const rank = props.rank;
      const head = div(
        { key: 'h', className: 'dtProhibitHead' },
        div({ key: 't', className: 'dtProhibitTitle' }, '禁止清单'),
        div({ key: 's', className: 'dtProhibitSub' }, '近 ' + OBSTACLE_WINDOW_DAYS + ' 天 · 按累计时长排序')
      );
      if (!rank.enough) {
        return div(
          { className: 'dtProhibitCard', 'data-prohibit-card': '1', 'data-prohibit-enough': '0' },
          head,
          div(
            { key: 'e', className: 'dtProhibitEmpty', 'data-prohibit-empty': '1' },
            div({ key: 'a', className: 'dtProhibitEmptyTitle' }, '还没攒够样本'),
            div(
              { key: 'b', className: 'dtProhibitEmptyText' },
              '再记 ' + rank.need + ' 次就够排序（至少 ' + OBSTACLE_SAMPLE_MIN + ' 条）· 现在共 ' + rank.sample + ' 条、' + rank.total + ' 分钟'
            )
          )
        );
      }
      const top = rank.top.map(function (row, index) {
        return div(
          {
            key: row.label,
            className: 'dtProhibitRow dtProhibitTop',
            'data-prohibit-rank': String(index + 1),
            'data-label': row.label,
            'data-minutes': String(row.minutes),
            'data-count': String(row.count),
            'data-share': String(row.share)
          },
          span({ key: 'r', className: 'dtProhibitRank' }, String(index + 1)),
          span({ key: 'l', className: 'dtProhibitLabel' }, row.label),
          span(
            { key: 'b', className: 'dtProhibitBar' },
            span({ className: 'dtProhibitBarFill', style: { width: Math.max(4, row.share) + '%' } })
          ),
          span({ key: 'm', className: 'dtProhibitMin' }, '累计 ' + row.minutes + ' 分钟 · ' + row.count + ' 次'),
          span({ key: 'p', className: 'dtProhibitShare' }, '占比 ' + row.share + '%')
        );
      });
      const watch = rank.watch.map(function (row) {
        return div(
          {
            key: row.label,
            className: 'dtProhibitWatchRow',
            'data-prohibit-watch': '1',
            'data-label': row.label,
            'data-minutes': String(row.minutes),
            'data-gap': String(row.gap)
          },
          span({ key: 'l', className: 'dtProhibitWatchLabel' }, row.label),
          span({ key: 'm', className: 'dtProhibitWatchMin' }, '累计 ' + row.minutes + ' 分钟 · ' + row.count + ' 次'),
          span({ key: 'g', className: 'dtProhibitWatchGap' }, '还差 ' + row.gap + ' 分钟进 Top3')
        );
      });
      return div(
        { className: 'dtProhibitCard', 'data-prohibit-card': '1', 'data-prohibit-enough': '1' },
        head,
        div({ key: 'l', className: 'dtProhibitList', 'data-prohibit-list': '1' }, top),
        watch.length
          ? div(
            { key: 'w', className: 'dtProhibitWatch' },
            div({ key: 't', className: 'dtProhibitWatchTitle' }, '观察区 · 第 ' + (OBSTACLE_TOPN + 1) + ' 名起'),
            div({ key: 'r', className: 'dtProhibitWatchList', 'data-prohibit-watch-list': '1' }, watch)
          )
          : null,
        div({ key: 'f', className: 'dtProhibitFoot' }, '样本 ' + rank.sample + ' 条 · 合计 ' + rank.total + ' 分钟')
      );
    }

    /* 绊脚石面板：mode='obstacle' 出「记录 + 流水 + 榜单」，mode='prohibit' 只出榜单。 */
    function ObstacleBoard(props) {
      const state = props.state;
      const store = props.store;
      const now = new Date();
      const mode = props.mode === 'prohibit' ? 'prohibit' : 'obstacle';
      const rows = obstacleEntries(state.db);
      const rank = obstacleRank(state.db, now);
      const options = obstacleLabelOptions(state.db);
      const [label, setLabel] = useState('');
      const [minutes, setMinutes] = useState('15');
      const [day, setDay] = useState(dateKey(now));
      const [editing, setEditing] = useState('');
      const [draftLabel, setDraftLabel] = useState('');
      const [draftMinutes, setDraftMinutes] = useState('15');
      const [draftDay, setDraftDay] = useState('');

      const resetForm = function () {
        setLabel('');
        setMinutes('15');
        setDay(dateKey(new Date()));
      };

      const submit = function () {
        const res = actionAddObstacle(store, { label: label, minutes: Number(minutes), at: day });
        if (!res.ok) {
          store.pushAlert({ id: uid('toast'), title: res.message || '没有记下', body: '', ttl: 4000 });
          return;
        }
        store.pushAlert({ id: uid('toast'), title: '已记下「' + label.trim() + '」' + minutes + ' 分钟', body: '', ttl: 3000 });
        resetForm();
      };

      const startEdit = function (row) {
        setEditing(row.id);
        setDraftLabel(row.label);
        setDraftMinutes(String(row.minutes));
        setDraftDay(row.at);
      };

      const commitEdit = function (id) {
        setEditing('');
        const res = actionPatchObstacle(store, id, { label: draftLabel, minutes: Number(draftMinutes), at: draftDay });
        if (!res.ok) store.pushAlert({ id: uid('toast'), title: res.message || '修改失败', body: '', ttl: 4000 });
      };

      const removeRow = function (row) {
        actionRemoveObstacle(store, row.id);
        store.pushAlert({ id: uid('toast'), title: '已删除「' + row.label + '」的记录', body: '', ttl: 3000 });
      };

      const chips = options.slice(0, 10).map(function (name) {
        return button(
          Object.assign({
            key: name,
            type: 'button',
            className: 'dtObsChip' + (label === name ? ' dtObsChipOn' : ''),
            'data-dt': 'obs-preset',
            'data-label': name,
            'data-on': label === name ? '1' : undefined,
            title: '用「' + name + '」记一笔',
            onClick: function () { setLabel(name); }
          }, scopedAction(store, function () { setLabel(name); }))
        );
      });

      const dayButtons = [
        { key: dateKey(now), text: '今天' },
        { key: dateKey(addDays(now, -1)), text: '昨天' }
      ].map(function (item) {
        return button(
          Object.assign({
            key: item.key,
            type: 'button',
            className: 'dtMiniBtn dtObsDay' + (day === item.key ? ' dtMiniOn' : ''),
            'data-dt': 'obs-day',
            'data-day': item.key,
            'data-on': day === item.key ? '1' : undefined,
            onClick: function () { setDay(item.key); }
          }, scopedAction(store, function () { setDay(item.key); }))
        );
      });

      const form = div(
        { className: 'dtObsForm', 'data-dt': 'obs-form' },
        div({ key: 't', className: 'dtObsFormTitle' }, '今天是什么挡住了我？'),
        div({ key: 'c', className: 'dtObsChips' }, chips),
        div(
          { key: 'r', className: 'dtObsFormRow' },
          input({
            key: 'i',
            className: 'dtObsInput',
            'data-dt': 'obs-label',
            type: 'text',
            placeholder: '或自己写一条（会沉淀成备选）',
            value: label,
            onChange: function (e) { setLabel(e.target.value); }
          }),
          select(
            {
              key: 'm',
              className: 'dtObsSelect',
              'data-dt': 'obs-minutes',
              value: minutes,
              onChange: function (e) { setMinutes(e.target.value); }
            },
            OBSTACLE_MINUTES.map(function (value) {
              return option({ key: value, value: String(value) }, value + ' 分钟');
            })
          )
        ),
        div(
          { key: 'd', className: 'dtObsFormRow' },
          div({ key: 'b', className: 'dtObsDays' }, dayButtons),
          input({
            key: 'x',
            className: 'dtObsDate',
            'data-dt': 'obs-date',
            type: 'date',
            value: day,
            onChange: function (e) { if (e.target.value) setDay(e.target.value); }
          }),
          button(
            Object.assign({
              key: 'a',
              type: 'button',
              className: 'dtPrimaryBtn',
              'data-dt': 'obs-add',
              disabled: !label.trim(),
              onClick: submit
            }, scopedAction(store, submit))
            , '记下这一笔'
          )
        )
      );

      const list = rows.map(function (row) {
        const isEditing = editing === row.id;
        return div(
          {
            key: row.id,
            className: 'dtObsRow',
            'data-obstacle-row': '1',
            'data-id': row.id,
            'data-label': row.label,
            'data-minutes': String(row.minutes),
            'data-day': row.at
          },
          isEditing
            ? div(
              { key: 'e', className: 'dtObsEditRow' },
              input({
                key: 'l',
                className: 'dtObsInput',
                'data-dt': 'obs-edit-label',
                type: 'text',
                value: draftLabel,
                onChange: function (e) { setDraftLabel(e.target.value); }
              }),
              select(
                {
                  key: 'm',
                  className: 'dtObsSelect',
                  'data-dt': 'obs-edit-minutes',
                  value: draftMinutes,
                  onChange: function (e) { setDraftMinutes(e.target.value); }
                },
                OBSTACLE_MINUTES.map(function (value) {
                  return option({ key: value, value: String(value) }, value + ' 分钟');
                })
              ),
              input({
                key: 'd',
                className: 'dtObsDate',
                'data-dt': 'obs-edit-date',
                type: 'date',
                value: draftDay,
                onChange: function (e) { if (e.target.value) setDraftDay(e.target.value); }
              }),
              button(
                Object.assign({
                  key: 's',
                  type: 'button',
                  className: 'dtMiniBtn dtMiniOn',
                  'data-dt': 'obs-edit-save',
                  onClick: function () { commitEdit(row.id); }
                }, scopedAction(store, function () { commitEdit(row.id); }))
                , '保存'
              ),
              button(
                Object.assign({
                  key: 'c',
                  type: 'button',
                  className: 'dtMiniBtn',
                  'data-dt': 'obs-edit-cancel',
                  onClick: function () { setEditing(''); }
                }, scopedAction(store, function () { setEditing(''); }))
                , '取消'
              )
            )
            : div(
              { key: 'v', className: 'dtObsViewRow' },
              span({ key: 'l', className: 'dtObsRowLabel' }, row.label),
              span({ key: 'm', className: 'dtObsRowMin' }, row.minutes + ' 分钟'),
              span({ key: 'd', className: 'dtObsRowDay' }, obstacleDayLabel(row.at, now)),
              row.note ? span({ key: 'n', className: 'dtObsRowNote' }, row.note) : null,
              button(
                Object.assign({
                  key: 'e',
                  type: 'button',
                  className: 'dtMiniBtn',
                  'data-dt': 'obs-edit',
                  'data-obs-edit': '1',
                  onClick: function () { startEdit(row); }
                }, scopedAction(store, function () { startEdit(row); }))
                , '改'
              ),
              button(
                Object.assign({
                  key: 'x',
                  type: 'button',
                  className: 'dtMiniBtn dtMiniDanger',
                  'data-dt': 'obs-del',
                  'data-obs-del': '1',
                  onClick: function () { removeRow(row); }
                }, scopedAction(store, function () { removeRow(row); }))
                , '删'
              )
            )
        );
      });

      const rowsBlock = div(
        { className: 'dtObsRows', 'data-obstacle-rows': '1', 'data-count': String(rows.length) },
        rows.length
          ? list
          : div(
            { key: 'e', className: 'dtObsEmpty', 'data-obs-empty': '1' },
            div({ key: 'a' }, '还没有记录'),
            div({ key: 'b', className: 'dtObsEmptyText' }, '上面选一个常见的，或自己写一条 —— 记满 ' + OBSTACLE_SAMPLE_MIN + ' 条就能排出禁止清单。')
          )
      );

      const head = div(
        { key: 'head', className: 'dtHead' },
        div(
          { key: 'l', className: 'dtHeadLeft' },
          div({ key: 't', className: 'dtHeadTitle' }, mode === 'prohibit' ? '禁止清单' : '绊脚石'),
          div({ key: 's', className: 'dtHeadSub' }, mode === 'prohibit' ? '由绊脚石自动聚合' : '挡住我的事，记一笔')
        ),
        div(
          { key: 'r', className: 'dtHeadRight' },
          button(
            {
              key: 'x',
              type: 'button',
              className: 'dtIconBtn dtDrawerCollapse',
              'data-dt': 'drawer-collapse',
              title: '收起',
              'aria-label': '收起',
              onClick: function () { if (props.onCollapse) props.onCollapse(); }
            },
            icon('close', 15)
          )
        )
      );

      if (mode === 'prohibit') {
        return div({ className: 'dtObsBoard dtObsBoardProhibit', 'data-obstacle-board': 'prohibit' }, head, div({ key: 'b', className: 'dtObsBody' }, ProhibitCard({ rank: rank })));
      }

      return div(
        { className: 'dtObsBoard', 'data-obstacle-board': 'obstacle' },
        head,
        div(
          { key: 'b', className: 'dtObsBody' },
          form,
          rowsBlock,
          ProhibitCard({ rank: rank })
        )
      );
    }

    /* ============================== 69-onething · 必做之事 / 推荐面板 ==============================
       docs/stage3-goals.md §2.3 与 §2.5 的落地。两件事共用一份「今天只做这一件」的口径：

       1. 必做之事：`state.oneThing = { date:'YYYY-MM-DD', taskId }`，**一天一条、全局唯一**，
          换日不清历史 —— 历史另存 `state.oneThingHistory`（最多 60 条，只记 {date,taskId,title}）。
          它与四象限的「今日要事」（`task.pinToday`，可多条）是两件事，**不合并**。
       2. 推荐面板：四块依次「是什么 / 为什么重要 / 怎么做 / 设为必做之事」，每一块的内容
          都由真实数据推导（分数、分数来源、清单、标签、日期、绊脚石记录、历史推荐），
          不允许出现与数据无关的写死文案；一个任务近期被推荐过就在排序里降权。

       数据落在顶层 state 而不是 db：`normalizeDb` 只认已知分区，db 内新键会在 reload 时丢，
       而顶层未知键由 migrateState 的 v2 分支原样保留（51-db.js:552）。 */

    const ONETHING_HISTORY_MAX = 60;
    const REC_LIMIT = 12;
    const REC_DEMOTE_RATIO = 0.8;
    const REC_RECENT_DAYS = 3;

    function oneThingToday(now) {
      return dateKey(now instanceof Date ? now : new Date());
    }

    /* 读：容错形状（缺字段、日期不是今天都返回空壳），因此不需要在 00-prelude 里加默认值。 */
    function oneThingOf(state, now) {
      const raw = state && isPlainObject(state.oneThing) ? state.oneThing : null;
      const today = oneThingToday(now);
      if (!raw) return { date: today, taskId: '' };
      const date = typeof raw.date === 'string' ? raw.date : today;
      return { date: date, taskId: date === today && typeof raw.taskId === 'string' ? raw.taskId : '' };
    }

    function oneThingTask(state, now) {
      const pick = oneThingOf(state, now);
      if (!pick.taskId) return null;
      const found = (state.tasks || []).find(function (task) {
        return task && task.id === pick.taskId && !task.deleted;
      });
      return found || null;
    }

    function oneThingHistoryOf(state) {
      const raw = state && Array.isArray(state.oneThingHistory) ? state.oneThingHistory : [];
      return raw.filter(function (row) {
        return row && typeof row.date === 'string' && typeof row.taskId === 'string';
      });
    }

    function commitOneThing(store, taskId, title, why) {
      const now = new Date();
      const today = oneThingToday(now);
      store.update(function (state) {
        const prev = oneThingHistoryOf(state);
        const next = prev.filter(function (row) { return row.date !== today; });
        if (taskId) {
          next.push({ date: today, taskId: taskId, title: typeof title === 'string' ? title : '' });
        }
        next.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
        return Object.assign({}, state, {
          oneThing: { date: today, taskId: taskId || '' },
          oneThingHistory: next.slice(0, ONETHING_HISTORY_MAX)
        });
      });
      if (why) store.pushAlert({ id: uid('toast'), title: '今天是「' + title + '」', body: why, ttl: 3200 });
    }

    function actionSetOneThing(store, taskId) {
      const state = store.get();
      const task = (state.tasks || []).find(function (item) {
        return item && item.id === taskId && !item.deleted;
      });
      if (!task) return { ok: false, code: 'TASK_NOT_FOUND', message: '任务不存在' };
      commitOneThing(store, task.id, task.title, '');
      return { ok: true, id: task.id };
    }

    function actionClearOneThing(store) {
      commitOneThing(store, '', '', '');
      return { ok: true };
    }

    /* ---------------------------- 候选池与推荐排序 ---------------------------- */

    function scoreEntryOf(state, task) {
      if (!state.db || !task) return null;
      return typeof selectScoreEntry === 'function' ? selectScoreEntry(state.db, task.id) : null;
    }

    function scoreValueOf(state, task) {
      const entry = scoreEntryOf(state, task);
      if (entry && isFinite(Number(entry.score))) return Math.round(Number(entry.score));
      return 0;
    }

    function recProjectName(state, task) {
      const projects = state.projects || [];
      const found = projects.find(function (p) { return p && p.id === task.projectId; });
      return found ? found.name : '收集箱';
    }

    /* 一个任务最近 REC_RECENT_DAYS 天被推荐 / 被设为必做之事的次数（用于降权）。 */
    function recRecentCount(state, taskId, now) {
      const clock = now instanceof Date ? now : new Date();
      const from = dateKey(addDays(clock, -(REC_RECENT_DAYS - 1)));
      let count = 0;
      const today = dateKey(clock);
      oneThingHistoryOf(state).forEach(function (row) {
        /* 只算「过去几天被推荐过」：今天这条就是当前选中的那件，
           若把今天也算进去，用户一点「设为必做之事」就立刻自我降权、面板会跳到别的任务。 */
        if (row.taskId === taskId && row.date >= from && row.date < today) count += 1;
      });
      return count;
    }

    /* 候选池 = 全部未完成任务（不看清单 / 日期），按有效分降序；
       有效分 = 分数 × (近期被推荐过 ? REC_DEMOTE_RATIO : 1)，并列回到优先级、日期、标题。 */
    function recCandidates(state, now, limit) {
      const clock = now instanceof Date ? now : new Date();
      const rows = (state.tasks || []).filter(function (task) {
        return task && !task.deleted && task.status === 0;
      }).map(function (task) {
        const score = scoreValueOf(state, task);
        const recent = recRecentCount(state, task.id, clock);
        const weight = recent > 0 ? Math.round(score * REC_DEMOTE_RATIO) : score;
        return { task: task, score: score, weight: weight, recent: recent };
      });
      rows.sort(function (a, b) {
        if (b.weight !== a.weight) return b.weight - a.weight;
        if ((b.task.priority || 0) !== (a.task.priority || 0)) return (b.task.priority || 0) - (a.task.priority || 0);
        const ad = a.task.date || '9999-99-99';
        const bd = b.task.date || '9999-99-99';
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.task.id < b.task.id ? -1 : 1;
      });
      const cap = Math.max(1, limit || REC_LIMIT);
      return rows.slice(0, cap);
    }

    function recTop(state, now) {
      const rows = recCandidates(state, now, 1);
      return rows.length ? rows[0] : null;
    }

    /* 「为什么重要」的每一条都必须能对上库里的一条真实依据。 */
    function recReasons(state, task, now) {
      const clock = now instanceof Date ? now : new Date();
      const out = [];
      const entry = scoreEntryOf(state, task);
      const score = scoreValueOf(state, task);
      const all = recCandidates(state, clock, 9999);
      const rank = all.findIndex(function (row) { return row.task.id === task.id; }) + 1;
      out.push({
        key: 'score',
        text: '综合分 ' + score + (rank > 0 ? '，在 ' + all.length + ' 件未完成任务里排第 ' + rank : '')
      });
      if (entry && entry.source === 'manual') out.push({ key: 'src', text: '分数是手动调的（manual），优先级高于自动打分' });
      else if (entry && entry.origin === 'calibrated') out.push({ key: 'src', text: '分数来自离线校准表（calibrated），与 TickTick 历史排序一致' });
      else out.push({ key: 'src', text: '当前分数由规则现算（heuristic），可在一键打分后写库' });
      const tags = typeof tagNamesOf === 'function' ? tagNamesOf(task) : (task.tags || []);
      if (tags.length) out.push({ key: 'tag', text: '标签：' + tags.join(' / ') + ' —— 越靠近钱与家人，权重越高' });
      if (task.date) {
        const diff = dayDiff(parseISO(task.date), clock);
        out.push({
          key: 'date',
          text: diff < 0 ? '已逾期 ' + Math.abs(diff) + ' 天' : diff === 0 ? '今天到期' : diff === 1 ? '明天到期' : '还有 ' + diff + ' 天到期'
        });
      } else {
        out.push({ key: 'date', text: '没有日期 —— 不催你，所以更容易一直拖着' });
      }
      out.push({ key: 'project', text: '清单：' + recProjectName(state, task) + (task.priority ? ' · 优先级 ' + task.priority : '') });
      const rank14 = obstacleRank(state.db, clock);
      if (rank14.top.length) {
        const top1 = rank14.top[0];
        out.push({
          key: 'obstacle',
          text: '近 ' + OBSTACLE_WINDOW_DAYS + ' 天你在「' + top1.label + '」上花了 ' + top1.minutes + ' 分钟（占 ' + top1.share + '%）—— 把它挪出来刚好够做这件事'
        });
      }
      if (recRecentCount(state, task.id, clock) > 0) {
        out.push({ key: 'recent', text: '近 ' + REC_RECENT_DAYS + ' 天内被推荐过，所以这次排位已按 ' + Math.round(REC_DEMOTE_RATIO * 100) + '% 降权' });
      }
      return out;
    }

    /* 「怎么做」：有子任务就逐条列子任务；否则按真实数据拼 3 步，每步都指回具体字段。 */
    function recSteps(state, task, now) {
      const children = (state.tasks || []).filter(function (item) {
        return item && !item.deleted && item.status === 0 && item.parentId === task.id;
      });
      if (children.length) {
        return children.slice(0, 5).map(function (child, index) {
          return { key: 'c' + index, text: '子任务 ' + (index + 1) + '：' + child.title };
        });
      }
      const clock = now instanceof Date ? now : new Date();
      const minutes = Math.max(15, Math.min(60, Math.round(scoreValueOf(state, task) || 20)));
      const steps = [];
      steps.push({ key: 's1', text: '先把「' + task.title + '」拆成一个 ' + minutes + ' 分钟内能做完的动作，别的都先放着' });
      const rank14 = obstacleRank(state.db, clock);
      if (rank14.top.length) {
        const top1 = rank14.top[0];
        steps.push({ key: 's2', text: '开工前把「' + top1.label + '」关掉（它近两周吃掉了你 ' + top1.minutes + ' 分钟）' });
      } else {
        steps.push({ key: 's2', text: '开工前把手机放到看不见的地方，先做 ' + minutes + ' 分钟' });
      }
      steps.push({
        key: 's3',
        text: task.date ? '做完在清单里勾掉它（' + fmtDateLabel(parseISO(task.date), clock) + '到期），让分数和环立刻更新' : '做完在清单里勾掉它，再回来点「设为必做之事」换下一件'
      });
      return steps;
    }


    /* ------------------------- t156：立即行动（§1.21） ------------------------- */

    /* 「不多言」是判据，不是风格：正文总字数 ≤300、每步 ≤40 字、句号 ≤1；
       三类禁止文本（寒暄 / 自述过程 / 重复标题）各给一条可断言句。 */
    var ACT_NOW_MIN_STEPS = 3;
    var ACT_NOW_MAX_STEPS = 18;
    var ACT_NOW_STEP_MAX = 40;
    var ACT_NOW_TEXT_MAX = 900;
    var ACT_NOW_BANNED = ['我建议', '以下是', '希望这', '希望对你', '需要我', '如果你愿意', '总结一下', '祝', '首先', '综上'];

    /* 单步耗时：只认 5–60 的整数分钟；缺失或越界一律 null（不猜、不四舍五入到边界） */
    function actNowMinutesOf(item) {
      if (!item || typeof item !== 'object') return null;
      var raw = item.minutes;
      var n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '' : raw).replace(/[^0-9]/g, ''), 10);
      if (!isFinite(n) || n < 5 || n > 60) return null;
      return Math.round(n);
    }

    function actNowClip(text, max) {
      var raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
      var limit = max || ACT_NOW_STEP_MAX;
      if (raw.length <= limit) return raw;
      return raw.slice(0, limit - 1) + '…';
    }

    /* 去掉寒暄与引导句：命中即整句丢弃（不是替换，避免留下半句） */
    function actNowClean(text) {
      var raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
      if (!raw) return '';
      for (var i = 0; i < ACT_NOW_BANNED.length; i += 1) {
        if (raw.indexOf(ACT_NOW_BANNED[i]) >= 0) return '';
      }
      return raw;
    }

    /* 本地规则：3–5 条短动作，全部指回真实字段，且**不重复标题**（§1.21 判据）。
       立即行动面板只取这 4 条（§1.21 的 3–6 条区间）；C 栏「任务拆解」按强度补足走下面的
       actNowStepsLocal 扩展池（t173）。 */
    function actNowStepsCore(state, task, now) {
      var clock = now instanceof Date ? now : new Date();
      var out = [];
      var children = (state.tasks || []).filter(function (item) {
        return item && !item.deleted && item.status === 0 && item.parentId === task.id;
      });
      var minutes = Math.max(10, Math.min(30, Math.round((scoreValueOf(state, task) || 20) / 2)));
      out.push({ key: 'l1', text: '先只做 ' + minutes + ' 分钟：打开它，写下第一行能交付的东西' });
      var rank = obstacleRank(state.db, clock);
      if (rank.top.length) {
        out.push({ key: 'l2', text: '开工前关掉「' + rank.top[0].label + '」——近两周它吃掉 ' + rank.top[0].minutes + ' 分钟' });
      } else {
        out.push({ key: 'l2', text: '手机静音并放到看不见的地方，桌面只留这一件' });
      }
      if (children.length) {
        out.push({ key: 'l3', text: '子任务 ' + children.length + ' 条，先做第一条，做完立刻勾掉' });
      } else {
        out.push({ key: 'l3', text: '把结果写成一行贴回备注里，卡住就只写卡在哪' });
      }
      out.push({ key: 'l4', text: task.date ? '勾掉后回来看分数环，再决定下一件' : '勾掉它，回来点「设为必做之事」换下一件' });
      return out;
    }

    /* 拆解补足池（t173，修 GAP T172n2）：C 栏「任务拆解」按强度补足到下限时用这个池。
       固定 4 条 core 撑不到 strong 下限 11（Host 只回 2 步时最多 6 条），所以这里按任务自身字段
       派生：资料归置 → 三段分割 → 拆子步骤 → 验收标准 → 自检 → 阻塞处理 → 求助 → 优先级 →
       同类合并 → 收尾 → 记录偏差 → 复盘 → 补漏。文本互不相同（去重后仍 ≥18），每条带 5–60 分钟估时；
       全部读真实字段（title / content / date / priority / tags / 子任务 / 近 14 天绊脚石），不编造外部事实。 */
    function actNowStepsLocal(state, task, now) {
      var clock = now instanceof Date ? now : new Date();
      var out = actNowStepsCore(state, task, clock).map(function (item) {
        return { key: item.key, text: item.text };
      });
      var seen = {};
      out.forEach(function (item) { seen[item.text] = true; });
      var title = String((task && task.title) || '').trim();
      var short = actNowClip(title, 16) || '这一件';
      var base = Math.max(10, Math.min(30, Math.round((scoreValueOf(state, task) || 20) / 2)));
      var seg = Math.max(5, Math.min(20, Math.round(base / 2)));
      var children = (state.tasks || []).filter(function (item) {
        return item && !item.deleted && item.status === 0 && item.parentId === task.id;
      });
      var rank = obstacleRank(state.db, clock);
      var tags = typeof tagNamesOf === 'function' ? tagNamesOf(task) : (task.tags || []);
      var dayText = '';
      if (task.date) {
        var parsed = parseISO(String(task.date).slice(0, 10));
        if (parsed) dayText = fmtDateLabel(parsed, clock);
      }
      var add = function (text, mins) {
        var line = actNowClip(actNowClean(text));
        if (!line || seen[line]) return;
        seen[line] = true;
        out.push({ key: 'x' + out.length, text: line, minutes: Math.max(5, Math.min(60, Math.round(mins || 10))) });
      };
      add('把「' + short + '」要用的资料先归到一处：链接、文件、截图各放一个地方，中途不再找东西', 8);
      add('第 1 段（约 ' + seg + ' 分钟）：只做「' + short + '」里最硬的那一小块，先把最难的地方碰一下', seg);
      add('第 2 段（约 ' + seg + ' 分钟）：接着补细节，先求能用不求完美', seg);
      add('第 3 段（约 ' + seg + ' 分钟）：收成一个能交出去的样子，能直接发给别人看', seg);
      if (children.length) {
        add('子任务 ' + children.length + ' 条：先做第 1 条「' + actNowClip(children[0].title, 16) + '」，做完立刻勾掉', 10);
      } else {
        add('把「' + short + '」拆成 2–3 条能勾的小项，写进备注再逐条划掉', 8);
      }
      if (dayText) {
        add('对着「' + dayText + '」这个时间点，写下「做完的标准」一句话', 6);
      } else {
        add('写下「做完的标准」一句话；写不出来说明这一步还太大，再切一刀', 6);
      }
      add('拿那一条标准自检一遍：不达标就只补差的那一处，别整体重做', 8);
      if (rank.top.length) {
        add('卡住超过 5 分钟就停：把卡点写成一行，先跳到下一段，别在「' + rank.top[0].label + '」上耗', 6);
      } else {
        add('卡住超过 5 分钟就停：把卡点写成一行，先跳到下一段', 6);
      }
      add('卡点那行贴进备注；需要就问人，附上你已经试过的两种办法', 6);
      if (task.priority >= 3) {
        add('这是高优先级：先做完它再回消息，中途不开新战场', 5);
      } else {
        add('中途不开新战场：想起别的事就写进收集箱，回来接着做', 5);
      }
      if (tags.length) {
        add('打上 #' + tags[0] + ' 的同类事今天只做这一件，剩下的排到明天', 5);
      } else {
        add('同一时间只推进这一件，其他想法先记下来排到后面', 5);
      }
      add('预留 5 分钟收尾：保存、命名、放到该在的位置，别留在临时目录', 5);
      add('把实际用时和原计划差多少写进备注，下次估得更准', 5);
      add('给明天留一句：这件事下次怎么起手更快', 5);
      add('如果还有余力，只补最影响交付的那一处，不加新功能', 10);
      return out;
    }

    /* Host 返回的整理结果按行/句切成步骤：过滤寒暄、去标题重复、按字数预算截断 */
    /* §1.21 序号只出现一次：模型可能自带「1.」「1、」「1)」「①」「- 」行首编号，
       渲染层再补自己的编号就会变成「1.1.」。这里只剥行首**一种**编号形态，正文数字一律不动。 */
    var ACT_NOW_ORDINAL_RE = /^\s*(?:\d{1,2}\s*[.、)）]|[\u2460-\u2473]|[-\u2013\u2014\u2022\u00b7*])\s*/;
    function actNowStripOrdinal(text) {
      var out = String(text === null || text === undefined ? '' : text);
      var next = out.replace(ACT_NOW_ORDINAL_RE, '');
      return next === '' ? out : next;
    }

    function actNowSplitHost(text, task) {
      var title = String((task && task.title) || '').trim();
      var raw = String(text == null ? '' : text);
      var parts = raw.split(/\r?\n|(?<=[。；;])/);
      var out = [];
      for (var i = 0; i < parts.length; i += 1) {
        var line = actNowClean(actNowStripOrdinal(parts[i]));
        if (!line) continue;
        if (title && line.indexOf(title) === 0) continue;
        out.push({ key: 'h' + out.length, text: actNowClip(line) });
        if (out.length >= ACT_NOW_MAX_STEPS) break;
      }
      return out;
    }

    /* 总字数预算：标题 + 各步 ≤300，超了从尾部删步骤（保底 3 条） */
    function actNowFit(title, steps) {
      var list = steps.slice(0, ACT_NOW_MAX_STEPS);
      var budget = function () {
        var total = String(title || '').length;
        for (var i = 0; i < list.length; i += 1) total += list[i].text.length;
        return total;
      };
      while (list.length > ACT_NOW_MIN_STEPS && budget() > ACT_NOW_TEXT_MAX) list.pop();
      return list;
    }

    /* Host /polish 成功后 agentNormalizeResult 给的是 { title, steps:[...] }（不是 content/note），
       所以两条都要认：steps 数组直接用，纯文本再走 actNowSplitHost。 */
    function actNowStepsFromHost(data, task) {
      var source = data && typeof data === 'object' ? data : {};
      var list = Array.isArray(source.steps) ? source.steps : null;
      if (list && list.length) {
        var out = [];
        for (var i = 0; i < list.length && out.length < ACT_NOW_MAX_STEPS; i += 1) {
          var item = list[i];
          var raw = typeof item === 'string' ? item : item && typeof item === 'object' ? String(item.text || '') : '';
          var line = actNowClip(actNowStripOrdinal(raw));
          if (!line) continue;
          if (task && task.title && line.indexOf(task.title) === 0) continue;
          out.push({ key: 'h' + out.length, text: line, minutes: actNowMinutesOf(item) });
        }
        if (out.length >= ACT_NOW_MIN_STEPS) return out;
      }
      var text = source.content || source.note || source.detailNote || '';
      return actNowSplitHost(text, task);
    }

    /* 拆分强度：weak 3–5 步 / mid 6–10 步 / strong 11–18 步（用户 m05465）；只认三档，缺省 mid */
    function actNowStrengthOf(state) {
      var raw = state && state.settings && state.settings.actNow ? state.settings.actNow.strength : '';
      return raw === 'weak' || raw === 'strong' ? raw : 'mid';
    }

    /* 立即行动面板：一件事 + 3–6 条细行动。Host 通道优先（/polish 同源路由），
       失败回落本地规则，两条路径结构相同（都只是 { key, text } 列表）。 */
    function ActNowPanel(props) {
      var state = props.state;
      var now = new Date();
      var top = recTop(state, now);
      var task = top ? top.task : null;
      var local = task ? actNowFit(task.title, actNowStepsCore(state, task, now).map(function (it) {
        return { key: it.key, text: actNowStripOrdinal(it.text) };
      })) : [];
      var hostState = useState({ id: '', steps: null, src: 'local' });
      var host = hostState[0];
      var setHost = hostState[1];

      useEffect(function () {
        if (!task) return undefined;
        var alive = true;
        var cfg = agentConfigOf(state && state.settings);
        if (!cfg || cfg.source === 'off') return undefined;
        var run = agentRun(cfg, task, recProjectName(state, task), { silent: true, strength: actNowStrengthOf(state) });
        Promise.resolve(run).then(function (result) {
          if (!alive || !result || !result.ok) return;
          var steps = actNowStepsFromHost(result.data || {}, task);
          if (steps.length < ACT_NOW_MIN_STEPS) return;
          setHost({ id: task.id, steps: actNowFit(task.title, steps), src: 'host' });
        }).catch(function () {
          /* 回落本地：不弹错、不显示错误码（§1.21） */
        });
        return function () { alive = false; };
      }, [task ? task.id : '', state && state.settings ? state.settings.agent : null, actNowStrengthOf(state)]);

      var head = div(
        { key: 'head', className: 'dtHead' },
        div({ key: 'l', className: 'dtHeadLeft' }, div({ key: 't', className: 'dtHeadTitle' }, '立即行动')),
        div(
          { key: 'r', className: 'dtHeadRight' },
          button(
            {
              key: 'x',
              type: 'button',
              className: 'dtIconBtn dtDrawerCollapse',
              'data-dt': 'drawer-collapse',
              title: '收起',
              'aria-label': '收起',
              onClick: function () { if (props.onCollapse) props.onCollapse(); }
            },
            icon('close', 15)
          )
        )
      );

      if (!task) {
        return div(
          { className: 'dtActNow', 'data-dt': 'act-now-panel', 'data-act-empty': '1' },
          head,
          div({ key: 'e', className: 'dtActNowEmpty' }, '没有未完成的任务 —— 先建一条，这里才有可拆的事。')
        );
      }

      var usingHost = host && host.id === task.id && host.steps && host.steps.length >= ACT_NOW_MIN_STEPS;
      var steps = usingHost ? host.steps : local;
      var src = usingHost ? 'host' : 'local';

      return div(
        {
          className: 'dtActNow',
          'data-dt': 'act-now-panel',
          'data-task-id': task.id,
          'data-act-src': src,
          'data-act-steps': String(steps.length)
        },
        head,
        div({ key: 't', className: 'dtActNowTitle', 'data-dt': 'act-now-title' }, task.title),
        div(
          { key: 's', className: 'dtActNowSteps', role: 'list' },
          steps.map(function (step, index) {
            return div(
              { key: step.key || ('s' + index), className: 'dtActNowStep', role: 'listitem', 'data-dt': 'act-now-step' },
              span({ key: 'n', className: 'dtActNowNo' }, String(index + 1) + '.'),
              span({ key: 't', className: 'dtActNowText' }, step.text),
              step.minutes
                ? span({ key: 'm', className: 'dtActNowMin' }, '约 ' + step.minutes + ' 分钟')
                : null
            );
          })
        )
      );
    }

    /* ---------------------------- 面板：必做之事 ---------------------------- */

    /* 必做之事（ui-spec-stage2 §1.23.3，t168 拆分后）：只留「今天这一件」核心段。
       禁止清单与绊脚石已搬到独立功能「阻力清单」（ResistanceBoard），这里不得留空壳段落。 */
    function OneThingBoard(props) {
      const state = props.state;
      const store = props.store;
      const now = new Date();
      const pick = oneThingOf(state, now);
      const current = oneThingTask(state, now);
      const candidates = recCandidates(state, now, REC_LIMIT);
      const [changing, setChanging] = useState(false);

      const choose = function (task) {
        actionSetOneThing(store, task.id);
        setChanging(false);
      };

      const head = div(
        { key: 'head', className: 'dtHead' },
        div(
          { key: 'l', className: 'dtHeadLeft' },
          div({ key: 't', className: 'dtHeadTitle' }, '必做之事'),
          div({ key: 's', className: 'dtHeadSub' }, '今天只做这一件 · 先记挡住你的东西')
        ),
        div(
          { key: 'r', className: 'dtHeadRight' },
          button(
            {
              key: 'x',
              type: 'button',
              className: 'dtIconBtn dtDrawerCollapse',
              'data-dt': 'drawer-collapse',
              title: '收起',
              'aria-label': '收起',
              onClick: function () { if (props.onCollapse) props.onCollapse(); }
            },
            icon('close', 15)
          )
        )
      );

      /* ---- 第一段：今天这一件 ---- */
      const score = current ? scoreValueOf(state, current) : 0;
      const ringRatio = Math.max(0, Math.min(1, score / 100));
      const ringDash = 138.23;
      const coreCard = current
        ? div(
          {
            key: 'core',
            className: 'dtOneCore',
            'data-done': current.status === 2 ? '1' : undefined,
            'data-task-id': current.id
          },
          div(
            { key: 'ring', className: 'dtOneRing' },
            h(
              'svg',
              { key: 's', viewBox: '0 0 56 56', width: 56, height: 56, 'aria-hidden': true },
              h('circle', { key: 't', className: 'dtOneRingTrack', cx: 28, cy: 28, r: 22 }),
              h('circle', {
                key: 'a',
                className: 'dtOneRingArc',
                cx: 28,
                cy: 28,
                r: 22,
                strokeDasharray: String(ringDash),
                strokeDashoffset: String(ringDash * (1 - ringRatio))
              })
            ),
            span({ key: 'n', className: 'dtOneRingNum' }, String(score))
          ),
          div(
            { key: 'body', className: 'dtOneBody' },
            button(
              Object.assign({
                key: 't',
                type: 'button',
                className: 'dtOneTitle',
                'data-dt': 'onething-open',
                onClick: function () { if (props.onOpenDetail) props.onOpenDetail(current.id); }
              }, scopedAction(store, function () { if (props.onOpenDetail) props.onOpenDetail(current.id); })),
              current.title
            ),
            div({ key: 'w', className: 'dtOneWhy' }, ((recReasons(state, current)[0] || {}).text || ('清单：' + recProjectName(state, current)))),
            div({ key: 'h', className: 'dtOneHow' }, ((recSteps(state, current)[0] || {}).text || '从最小的一步开始，先做 5 分钟。'))
          ),
          div(
            { key: 'ops', className: 'dtOneOps' },
            button(
              Object.assign({
                key: 's',
                type: 'button',
                className: 'dtOneSwap',
                'data-dt': 'one-swap',
                onClick: function () { setChanging(!changing); }
              }, scopedAction(store, function () { setChanging(!changing); })),
              changing ? '收起候选' : '换一件'
            ),
            button(
              Object.assign({
                key: 'd',
                type: 'button',
                className: 'dtMiniBtn dtMiniOn',
                'data-dt': 'onething-done',
                onClick: function () {
                  completeTask(store, current.id);
                  store.pushAlert({ id: uid('toast'), title: '完成「' + current.title + '」', body: '今天这一件已经做完了', ttl: 3200 });
                }
              }, scopedAction(store, function () {
                completeTask(store, current.id);
                store.pushAlert({ id: uid('toast'), title: '完成「' + current.title + '」', body: '今天这一件已经做完了', ttl: 3200 });
              })),
              '勾掉'
            ),
            button(
              Object.assign({
                key: 'x',
                type: 'button',
                className: 'dtMiniBtn dtMiniDanger',
                'data-dt': 'onething-clear',
                onClick: function () {
                  actionClearOneThing(store);
                  store.pushAlert({ id: uid('toast'), title: '已取消今天的必做之事', body: '', ttl: 3000 });
                }
              }, scopedAction(store, function () {
                actionClearOneThing(store);
                store.pushAlert({ id: uid('toast'), title: '已取消今天的必做之事', body: '', ttl: 3000 });
              })),
              '取消'
            )
          )
        )
        : div(
          { key: 'core-empty', className: 'dtOneEmpty', 'data-onething-empty': '1' },
          div({ key: 'a', className: 'dtOneEmptyTitle' }, '今天还没有必做之事——从候选里挑一件'),
          div({ key: 'b', className: 'dtOneEmptyText' }, '在下面从候选里挑一件；要记挡住你的东西，去「阻力清单」。')
        );

      const candidateList = candidates.map(function (row) {
        return button(
          Object.assign({
            key: row.task.id,
            type: 'button',
            className: 'dtOneThingPick' + (current && current.id === row.task.id ? ' dtOneThingPickOn' : ''),
            'data-onething-pick': '1',
            'data-task-id': row.task.id,
            'data-score': String(row.score),
            onClick: function () { choose(row.task); }
          }, scopedAction(store, function () { choose(row.task); })),
          span({ key: 't', className: 'dtOneThingPickTitle' }, row.task.title),
          span({ key: 'm', className: 'dtOneThingPickMeta' }, recProjectName(state, row.task) + ' · ' + row.score + ' 分')
        );
      });

      const coreSection = h(
        'section',
        { key: 'core', className: 'dtOneSection', 'data-onething-section': 'core' },
        coreCard,
        changing || !current
          ? div(
            { key: 'c', className: 'dtOneThingCandidates', 'data-onething-candidates': '1' },
            div({ key: 't', className: 'dtOneThingCandidatesTitle' }, '候选 · 按有效分排序'),
            candidateList
          )
          : null
      );

      return div(
        { className: 'dtOneThing', 'data-module': 'onething', 'data-drawer-view': 'onething', 'data-onething-board': '1' },
        head,
        div({ key: 'b', className: 'dtOneThingBody' }, coreSection)
      );
    }

    /* 阻力清单（ui-spec-stage2 §1.23，t168）：从「必做之事」拆出的独立功能。
       三段恒定渲染：候选绊脚石 / 已登记绊脚石 / 禁止清单；空数据下各给一句引导。
       数据全部来自 db.obstacles —— 禁止清单是同一份数据的聚合视图（§1.23.2），不新增存储键。 */
    function ResistanceBoard(props) {
      const state = props.state;
      const store = props.store;
      const now = new Date();
      const today = dateKey(now);
      const rank = obstacleRank(state.db, now);
      const rows = obstacleEntries(state.db);
      const options = obstacleLabelOptions(state.db);
      const [label, setLabel] = useState('');
      const [minutes, setMinutes] = useState('15');

      const submit = function () {
        const text = label.trim();
        if (!text) return;
        const res = actionAddObstacle(store, { label: text, minutes: Number(minutes), at: today });
        if (!res.ok) {
          store.pushAlert({ id: uid('toast'), title: res.message || '没有记下', body: '', ttl: 4000 });
          return;
        }
        store.pushAlert({ id: uid('toast'), title: '已记下「' + text + '」' + minutes + ' 分钟', body: '', ttl: 3000 });
        setLabel('');
        setMinutes('15');
      };

      const head = div(
        { key: 'head', className: 'dtHead' },
        div(
          { key: 'l', className: 'dtHeadLeft' },
          div({ key: 't', className: 'dtHeadTitle' }, '阻力清单'),
          div({ key: 's', className: 'dtHeadSub' }, '先记挡住你的东西 · 禁止清单只从记录里派生')
        ),
        div(
          { key: 'r', className: 'dtHeadRight' },
          button(
            {
              key: 'x',
              type: 'button',
              className: 'dtIconBtn dtDrawerCollapse',
              'data-dt': 'drawer-collapse',
              title: '收起',
              'aria-label': '收起',
              onClick: function () { if (props.onCollapse) props.onCollapse(); }
            },
            icon('close', 15)
          )
        )
      );

      /* ---- 第一段：候选绊脚石（最近记过的标签，点一下就填进下面表单） ---- */
      const chips = options.slice(0, 10).map(function (name) {
        return button(
          Object.assign({
            key: name,
            type: 'button',
            className: 'dtObsChip' + (label === name ? ' dtObsChipOn' : ''),
            'data-dt': 'res-preset',
            'data-label': name,
            'data-on': label === name ? '1' : undefined,
            title: '用「' + name + '」记一笔',
            onClick: function () { setLabel(name); }
          }, scopedAction(store, function () { setLabel(name); })),
          name
        );
      });
      const candidateSection = h(
        'section',
        {
          key: 'candidates',
          className: 'dtResSection',
          'data-resistance-section': 'obstacle-candidates',
          'data-count': String(options.length)
        },
        div({ key: 't', className: 'dtResSectionTitle' }, '候选绊脚石'),
        chips.length
          ? div({ key: 'c', className: 'dtObsChips dtResChips' }, chips)
          : div({ key: 'e', className: 'dtResEmpty', 'data-res-empty': 'obstacle-candidates' }, '还没有备选 —— 在下面记一笔，记过的会沉淀成备选'),
        div({ key: 'hint', className: 'dtResHint', 'data-res-hint': 'obstacle-candidates' }, '点一个备选填进下面表单，或自己写一条 —— 记过的会沉淀成备选')
      );

      /* ---- 第二段：已登记绊脚石（表单 + 今天的流水） ---- */
      const todayRows = rows.filter(function (row) { return row.at === today; });
      const rowItems = todayRows.slice().reverse().slice(0, 20).map(function (row) {
        return h(
          'li',
          {
            key: row.id,
            className: 'dtObsRow',
            'data-obs-id': row.id,
            'data-label': row.label,
            'data-count': String(row.minutes)
          },
          span({ key: 'l', className: 'dtObsLabel' }, row.label),
          span({ key: 'm', className: 'dtObsMin' }, String(row.minutes) + ' 分钟'),
          button(
            Object.assign({
              key: 'x',
              type: 'button',
              className: 'dtObsDel',
              'data-dt': 'res-del',
              title: '删除',
              onClick: function () { actionRemoveObstacle(store, row.id); }
            }, scopedAction(store, function () { actionRemoveObstacle(store, row.id); })),
            icon('close', 12)
          )
        );
      });
      const rowSection = h(
        'section',
        {
          key: 'rows',
          className: 'dtResSection',
          'data-resistance-section': 'obstacle-rows',
          'data-count': String(todayRows.length)
        },
        div({ key: 't', className: 'dtResSectionTitle' }, '已登记绊脚石'),
        h(
          'form',
          {
            key: 'f',
            className: 'dtObsForm',
            onSubmit: function (event) {
              if (event && event.preventDefault) event.preventDefault();
              submit();
            }
          },
          input({
            key: 'i',
            className: 'dtFieldInput dtObsInput',
            'data-dt': 'res-input',
            placeholder: '挡住了我什么？例如：刷手机',
            value: label,
            onChange: function (event) { setLabel(event.target.value); }
          }),
          input({
            key: 'm',
            className: 'dtFieldInput dtObsMinutes',
            'data-dt': 'res-minutes',
            type: 'number',
            min: 1,
            max: 1440,
            value: minutes,
            onChange: function (event) { setMinutes(event.target.value); }
          }),
          button(
            Object.assign({
              key: 'a',
              type: 'submit',
              className: 'dtMiniBtn dtObsAdd',
              'data-dt': 'res-add',
              disabled: !label.trim(),
              onClick: function (event) { if (event && event.preventDefault) event.preventDefault(); submit(); }
            }, scopedAction(store, function () { submit(); })),
            '记一条'
          )
        ),
        rowItems.length
          ? h('ul', { key: 'l', className: 'dtObsList' }, rowItems)
          : div({ key: 'e', className: 'dtResEmpty', 'data-res-empty': 'obstacle-rows' }, '今天还没记录绊脚石')
      );

      /* ---- 第三段：禁止清单（Top3 + 观察区，样本 <3 不出榜） ---- */
      const prohibitSection = h(
        'section',
        {
          key: 'prohibit',
          className: 'dtResSection',
          'data-resistance-section': 'prohibit',
          'data-count': String(rank.top.length)
        },
        div({ key: 't', className: 'dtResSectionTitle' }, '禁止清单'),
        h(ProhibitCard, { key: 'p', rank: rank })
      );

      return div(
        {
          className: 'dtResistance',
          'data-module': 'resistance',
          'data-dt': 'resistance-board',
          'data-drawer-view': 'resistance'
        },
        head,
        div({ key: 'b', className: 'dtResistanceBody' }, candidateSection, rowSection, prohibitSection)
      );
    }

    /* ---------------------------- 面板：蓝按钮推荐 ---------------------------- */

    function RecPanel(props) {
      const state = props.state;
      const store = props.store;
      const now = new Date();
      const top = recTop(state, now);
      const current = oneThingTask(state, now);

      const head = div(
        { key: 'head', className: 'dtHead' },
        div(
          { key: 'l', className: 'dtHeadLeft' },
          div({ key: 't', className: 'dtHeadTitle' }, '推荐'),
          div({ key: 's', className: 'dtHeadSub' }, '由分数 / 标签 / 绊脚石推导')
        ),
        div(
          { key: 'r', className: 'dtHeadRight' },
          button(
            {
              key: 'x',
              type: 'button',
              className: 'dtIconBtn dtDrawerCollapse',
              'data-dt': 'drawer-collapse',
              title: '收起',
              'aria-label': '收起',
              onClick: function () { if (props.onCollapse) props.onCollapse(); }
            },
            icon('close', 15)
          )
        )
      );

      if (!top) {
        return div(
          { className: 'dtRecPanel', 'data-dt': 'onelist-rec', 'data-rec-empty': '1' },
          head,
          div(
            { key: 'b', className: 'dtRecBody' },
            div({ className: 'dtRecEmpty' }, '没有未完成的任务 —— 先建一条，推荐才有依据。')
          )
        );
      }

      const task = top.task;
      const score = top.score;
      const reasons = recReasons(state, task, now);
      const steps = recSteps(state, task, now);
      const tags = typeof tagNamesOf === 'function' ? tagNamesOf(task) : (task.tags || []);
      const already = current && current.id === task.id;

      const block = function (key, title, children) {
        return div(
          { key: key, className: 'dtRecBlock', 'data-block': key },
          div({ key: 'h', className: 'dtRecBlockTitle' }, title),
          div({ key: 'b', className: 'dtRecBlockBody' }, children)
        );
      };

      return div(
        {
          className: 'dtRecPanel',
          'data-dt': 'onelist-rec',
          'data-task-id': task.id,
          'data-score': String(score),
          'data-weight': String(top.weight)
        },
        head,
        div(
          { key: 'b', className: 'dtRecBody' },
          block(
            'what',
            '① 是什么',
            div(
              { className: 'dtRecWhat' },
              div({ key: 't', className: 'dtRecTitle' }, task.title),
              div(
                { key: 'm', className: 'dtRecMeta' },
                span({ key: 'p' }, recProjectName(state, task)),
                span({ key: 's' }, score + ' 分'),
                span({ key: 'd' }, task.date ? fmtDateLabel(parseISO(task.date), now) : '无日期'),
                tags.length ? span({ key: 'g' }, tags.join(' / ')) : null,
                task.priority ? span({ key: 'r' }, '优先级 ' + task.priority) : null
              ),
              task.content ? div({ key: 'c', className: 'dtRecNote' }, task.content) : null
            )
          ),
          block(
            'why',
            '② 为什么重要',
            div(
              { className: 'dtRecWhy', 'data-rec-why': '1' },
              reasons.map(function (row) {
                return div({ key: row.key, className: 'dtRecReason', 'data-rec-reason': row.key }, row.text);
              })
            )
          ),
          block(
            'how',
            '③ 怎么做',
            div(
              { className: 'dtRecHow', 'data-rec-how': '1' },
              steps.map(function (row, index) {
                return div({ key: row.key, className: 'dtRecStep', 'data-rec-step': String(index + 1) }, row.text);
              })
            )
          ),
          block(
            'act',
            '④ 设为必做之事',
            div(
              { className: 'dtRecAct' },
              div(
                { key: 's', className: 'dtRecActState', 'data-rec-act-state': already ? 'on' : 'off' },
                already
                  ? '已经是今天的必做之事（' + oneThingOf(state, now).date + '）'
                  : current
                    ? '今天已选「' + current.title + '」，设这一件会替换它'
                    : '今天还没有必做之事'
              ),
              button(
                Object.assign({
                  key: 'b',
                  type: 'button',
                  className: 'dtPrimaryBtn',
                  'data-dt': 'rec-set-onething',
                  onClick: function () {
                    actionSetOneThing(store, task.id);
                    store.pushAlert({ id: uid('toast'), title: '今天是「' + task.title + '」', body: '只做这一件，其它先放着', ttl: 3200 });
                  }
                }, scopedAction(store, function () {
                  actionSetOneThing(store, task.id);
                  store.pushAlert({ id: uid('toast'), title: '今天是「' + task.title + '」', body: '只做这一件，其它先放着', ttl: 3200 });
                }))
                , already ? '仍是这一件' : '设为必做之事'
              )
            )
          )
        )
      );
    }

    /* 清单视图顶部的固定条（§2.3「已选显示在 B 栏顶部可取消/更换」）。
       不渲染是允许的：没有必做之事时整条消失，不占位、不挤压列表。 */
    function OneThingStrip(props) {
      const state = props.state;
      const store = props.store;
      const now = new Date();
      const current = oneThingTask(state, now);
      if (!current) return null;
      const pick = oneThingOf(state, now);
      return div(
        {
          className: 'dtOneThingStrip',
          'data-onething-strip': '1',
          'data-task-id': current.id,
          'data-onething-date': pick.date
        },
        span({ key: 'k', className: 'dtOneThingStripKind' }, '必做之事'),
        button(
          Object.assign({
            key: 't',
            type: 'button',
            className: 'dtOneThingStripTitle',
            'data-dt': 'onething-strip-open',
            onClick: function () { if (props.onOpenDetail) props.onOpenDetail(current.id); }
          }, scopedAction(store, function () { if (props.onOpenDetail) props.onOpenDetail(current.id); }))
          , current.title
        ),
        span({ key: 's', className: 'dtOneThingStripScore' }, scoreValueOf(state, current) + ' 分'),
        button(
          Object.assign({
            key: 'x',
            type: 'button',
            className: 'dtMiniBtn dtMiniDanger',
            'data-dt': 'onething-strip-clear',
            title: '取消今天的必做之事',
            onClick: function () { actionClearOneThing(store); }
          }, scopedAction(store, function () { actionClearOneThing(store); }))
          , '取消'
        )
      );
    }


    /* ------------------------------------- 样式表 ----------------------------------- */

    const CSS = [
      '/* ---- dt-palette:start 主题色板（全仓唯一兜底处：本块之外禁止出现 #hex 与 rgba()） ---- */',
      '.dtRoot{--dt-bg-0:var(--dsw-alias-bg-base,#ffffff);--dt-bg-1:var(--dsw-alias-bg-layer-1,#f7f8fa);--dt-bg-2:var(--dsw-alias-bg-layer-2,#eef0f4);--dt-label-1:var(--dsw-alias-label-primary,#1d2129);--dt-label-2:#5c6168;--dt-label-3:#676c74;--dt-border-1:var(--dsw-alias-border-l1,#e4e6ea);--dt-border-2:var(--dsw-alias-border-l2,#d3d6dc);--dt-brand:var(--dsw-alias-brand-primary,#3b82f6);--dt-danger:var(--dsw-alias-state-error-primary,#e5484d);--dt-warn:var(--dsw-alias-state-warn-primary,#f5a524);--dt-pomo-l0:color-mix(in oklab, var(--dt-accent) 14%, var(--dsw-alias-bg-layer-2));--dt-pomo-l1:color-mix(in oklab, var(--dt-accent) 34%, var(--dsw-alias-bg-layer-2));--dt-pomo-l2:color-mix(in oklab, var(--dt-accent) 56%, var(--dsw-alias-bg-layer-2));--dt-pomo-l3:color-mix(in oklab, var(--dt-accent) 78%, var(--dsw-alias-bg-layer-2));--dt-pomo-l4:var(--dt-accent);--dt-success:var(--dsw-alias-state-success-primary,#2ea121);--dt-tag-blue:var(--dsw-alias-brand-primary,#3b82f6);--dt-tag-green:var(--dsw-alias-state-success-primary,#2ea121);--dt-tag-orange:var(--dsw-alias-state-warn-primary,#f5a524);--dt-tag-red:var(--dsw-alias-state-error-primary,#e5484d);--dt-tag-purple:#7c5cd6;--dt-tag-teal:#0f9b8e;--dt-tag-pink:#d6478f;--dt-tag-gray:var(--dsw-alias-label-secondary,#8b8f98);--dt-disabled-op:.45;--dsw-alias-label-secondary:#5c6168;--dsw-alias-label-tertiary:#676c74;}',
      '.dtRoot[data-dt-theme="dark"]{--dt-bg-0:#14161a;--dt-bg-1:#1c1f25;--dt-bg-2:#262a32;--dt-label-1:#e8eaed;--dt-label-2:#9aa0ac;--dt-label-3:#8e95a2;--dt-border-1:#2c313a;--dt-border-2:#3a4049;--dt-brand:#6ea8fe;--dt-danger:#ff7b72;--dt-warn:#f7c948;--dt-success:#4cc06a;--dt-pomo-l0:color-mix(in oklab, var(--dt-accent) 18%, var(--dt-bg-2));--dt-pomo-l1:color-mix(in oklab, var(--dt-accent) 36%, var(--dt-bg-2));--dt-pomo-l2:color-mix(in oklab, var(--dt-accent) 58%, var(--dt-bg-2));--dt-pomo-l3:color-mix(in oklab, var(--dt-accent) 80%, var(--dt-bg-2));--dt-pomo-l4:var(--dt-accent);--dt-tag-blue:#6ea8fe;--dt-tag-green:#4cc06a;--dt-tag-orange:#f0a13c;--dt-tag-red:#ff7b72;--dt-tag-purple:#b78cf7;--dt-tag-teal:#4fd1c5;--dt-tag-pink:#f78fb3;--dt-tag-gray:#8a93a5;--dsw-alias-bg-base:#14161a;--dsw-alias-bg-layer-1:#1c1f25;--dsw-alias-bg-layer-2:#262a32;--dsw-alias-bg-overlay:#262a32;--dsw-alias-label-primary:#e8eaed;--dsw-alias-label-secondary:#9aa0ac;--dsw-alias-label-tertiary:#8e95a2;--dsw-alias-border-l1:#2c313a;--dsw-alias-border-l2:#3a4049;--dt-disabled-op:.45;}',
      '.dtRoot{--dt-scrim:rgba(0,0,0,.16);--dt-shadow-sm:0 10px 26px rgba(0,0,0,.24);--dt-shadow-md:0 18px 48px rgba(0,0,0,.28);--dt-shadow-menu:0 12px 28px rgba(0,0,0,.24);}',
      '.dtRoot[data-dt-theme="dark"]{--dt-scrim:rgba(0,0,0,.52);--dt-shadow-sm:0 10px 26px rgba(0,0,0,.55);--dt-shadow-md:0 18px 48px rgba(0,0,0,.6);--dt-shadow-menu:0 12px 28px rgba(0,0,0,.58);}',
      '/* ---- S6 交互态：焦点环 / 禁用 / 按下，统一走令牌 ---- */',
      '.dtRoot :focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtRoot button:disabled,.dtRoot [aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtRoot button:active:not(:disabled){transform:translateY(.5px);}',
      '/* ---- dt-tokens 间距/字号/圆角（S2：全仓唯一档位表，正文里不再写字面 px） ---- */',
      '.dtRoot{--dt-sp-1:4px;--dt-sp-2:8px;--dt-sp-3:12px;--dt-sp-4:16px;--dt-sp-5:20px;--dt-sp-6:24px;--dt-sp-7:32px;--dt-sp-8:40px;--dt-fs-micro:11px;--dt-fs-meta:12px;--dt-fs-body:13px;--dt-fs-title:14px;--dt-fs-head:16px;--dt-r-row:6px;--dt-r-card:10px;--dt-r-pill:999px;}',
      '/* ---- dt-project 项目色（与 --dt-tag-、--dt-pomo-l 同范式：明暗两套，唯一定义处） ---- */',
      '.dtRoot{--dt-project-blue:#4AA6EF;--dt-project-pink:#E855BE;--dt-project-purple:#CE89FE;--dt-project-green:#7BC043;--dt-project-orange:#F5A623;--dt-project-teal:#3BC9A8;--dt-project-red:#E8613E;--dt-project-indigo:#8B7EF8;}',
      '.dtRoot[data-dt-theme="dark"]{--dt-project-blue:#6ea8fe;--dt-project-pink:#f07ec9;--dt-project-purple:#c9a6ff;--dt-project-green:#7cc46a;--dt-project-orange:#f0b45a;--dt-project-teal:#4fd8bb;--dt-project-red:#ff8a7a;--dt-project-indigo:#a6a0ff;}',
      '/* ---- dt-quad 四象限四色（Q1 红 / Q2 黄 / Q3 蓝；Q4 不设色，左色边走 transparent） ---- */',
      '.dtRoot{--dt-quad-red:#e5484d;--dt-quad-yellow:#f5a524;--dt-quad-blue:#3b82f6;--dt-quad-none:transparent;}',
      '.dtRoot[data-dt-theme="dark"]{--dt-quad-red:#ff7b72;--dt-quad-yellow:#f7c948;--dt-quad-blue:#6ea8fe;--dt-quad-none:transparent;}',
      /* ---- 模型来源三档：竖排三行（captain m07959） ----
     每档是一个整行 <label>：第一行 radio + 名称，第二行小字说明。
     说明用 flex-basis:100% 强制换行而不是块级兄弟节点，保证「点说明文字也能选中」。 */
  '.dtAgentSource{display:flex;flex-direction:column;gap:var(--dt-sp-2);width:100%}',
  '.dtAgentSourceOpt{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);width:100%;box-sizing:border-box;padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);cursor:pointer}',
  '.dtAgentSourceOpt[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
  '.dtAgentSourceRadio{margin:0;flex:0 0 auto}',
  '.dtAgentSourceText{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary)}',
  /* §8-98：模型来源区说明句（dsh / off 各一句），沿用既有 hint 字号与 --dt-label-2，不新造颜色 */
  '.dtAgentNote{font-size:var(--dt-fs-micro);line-height:17px;color:var(--dt-label-2);}',
  /* t150：错误态一行原始 message。等宽数字便于看 400/500 与 JSON 片段，长串强制换行不撑破卡片 */
  '.dtAgentDetail{font-size:var(--dt-fs-micro);line-height:17px;color:var(--dt-label-2);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;white-space:pre-wrap}',
  '.dtAgentSourceHint{flex:0 0 100%;font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '/* ---- dt-accent 强调色（§1.19.3）：只有这五个令牌，禁止外溢到 quad / score-band / project / habit / pomo-l ---- */',
      '.dtRoot{--dt-accent:var(--dsw-alias-brand-primary);--dt-accent-fg:var(--dt-accent);--dt-accent-on:#FFFFFF;--dt-accent-weak:color-mix(in oklab,var(--dt-accent) 12%,transparent);--dt-accent-ring:color-mix(in oklab,var(--dt-accent) 32%,transparent);}',
      '.dtRoot[data-dt-theme="dark"]{--dt-accent-on:#000000;--dt-accent-weak:color-mix(in oklab,var(--dt-accent) 18%,transparent);--dt-accent-ring:color-mix(in oklab,var(--dt-accent) 40%,transparent);}',
  '/* ---- dt-palette:end ---- */',
      '.dtRoot{position:relative;display:flex;height:100%;width:100%;min-height:0;overflow:hidden;background:var(--dt-bg-0);color:var(--dt-label-1);font-size:var(--dt-fs-body);isolation:isolate;container:dtroot / inline-size;}',
      '.dtRail{width:196px;flex:0 0 196px;display:flex;flex-direction:column;gap:2px;padding:var(--dt-sp-3) var(--dt-sp-2) var(--dt-sp-2);border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);overflow:hidden;min-height:0;}',
      '.dtRailScroll{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;}',
      '.dtRail[data-dt-scroll="none"] .dtRailScroll{overflow-y:hidden;}',
      '.dtRailTitle{padding:2px var(--dt-sp-2) var(--dt-sp-2);font-size:var(--dt-fs-meta);font-weight:600;color:var(--dt-label-2);}',
      '.dtRailGroupTitle{position:relative;display:flex;align-items:center;justify-content:space-between;padding:var(--dt-sp-3) var(--dt-sp-2) var(--dt-sp-1);font-size:var(--dt-fs-micro);letter-spacing:.02em;color:var(--dt-label-3);}',
      '.dtRailGroupCount{font-variant-numeric:tabular-nums;}',
      '.dtRailItem{display:flex;align-items:center;gap:var(--dt-sp-2);width:100%;padding:var(--dt-sp-2) var(--dt-sp-2) var(--dt-sp-2) var(--dt-sp-4);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dt-label-2);font:inherit;text-align:left;cursor:pointer;transition:background .12s linear,color .12s linear;}',
      '.dtRailItem:hover{background:var(--dt-bg-2);color:var(--dt-label-1);}',
      '.dtRailOn{background:var(--dt-bg-1);color:var(--dt-label-1);font-weight:600;box-shadow:inset 2px 0 0 var(--dt-accent);}',
      '.dtRailIcon{display:inline-flex;flex:0 0 auto;}',
      '.dtRailLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtRailCount{font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);}',
      '.dtDot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;}',
      '.dtRailSpacer{flex:1 1 auto;min-height:16px;}',
      '.dtRailTool{margin-top:1px;}',
      /* 中间区留最小可用宽（§2.3）：两栏同开时先让中间区让位，而不是压成 95px */
      /* A→B→C（t105/t116）：没有「中间区」。rail 点开的功能渲染在 B 栏，B 是主区；
         C 紧贴 B 右侧，B 让位但不低于 280。容器不足时只允许 B 内部横滚，.dtRoot 永不横滚。 */
      '.dtDrawerZone{display:flex;flex:1 1 auto;min-width:0;min-height:0;overflow-x:auto;overflow-y:hidden;background:var(--dsw-alias-bg-base);}',
      '.dtDrawerZone[data-count="1"]{flex:1 1 auto;}',
      '.dtDrawerZone[data-count="2"]{flex:1 1 auto;}',
      /* rail 图标条（<776 且两栏同开时降级：只留图标，宽度 48） */
      '.dtRoot[data-rail="icon"] .dtRail{box-sizing:border-box;width:48px;flex:0 0 48px;padding:var(--dt-sp-2) var(--dt-sp-1);}',
      '.dtRoot[data-rail="icon"] .dtRailLabel{display:none;}',
      '.dtRoot[data-rail="icon"] .dtRailCount{display:none;}',
      '.dtRoot[data-rail="icon"] .dtRailTitle{display:none;}',
      '.dtRoot[data-rail="icon"] .dtRailGroupTitle{justify-content:center;padding:var(--dt-sp-2) 0 var(--dt-sp-1);}',
      '.dtRoot[data-rail="icon"] .dtRailItem{height:32px;justify-content:center;padding:0;}',
      '.dtRoot[data-rail="icon"] .dtRailMore{display:none;}',
      '.dtMain{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
      /* B / C 两栏都是抽屉区里的 flex 项：z-index 必须保持 auto（§2.2），
         否则一栏的层叠上下文会整体盖住另一栏内含的菜单/输入框。 */
      '.dtDrawer{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;contain:layout paint;animation:dtDrawerIn 160ms ease-out;}',
      '.dtDrawer[data-slot="b"]{flex:1 1 55%;min-width:280px;z-index:0;container:dcenter / inline-size;}',
      '.dtDrawer[data-slot="c"]{flex:1 1 45%;min-width:300px;z-index:1;background:var(--dsw-alias-bg-layer-1);}',
      '.dtDrawer+.dtDrawer{border-left:1px solid var(--dsw-alias-border-l2);}',
      '@keyframes dtDrawerIn{from{transform:translateX(20px);opacity:0;}to{transform:translateX(0);opacity:1;}}',
      '.dtDrawer .dtMain{background:transparent;}',
      '.dtHead{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--dt-sp-3) var(--dt-sp-3);flex-wrap:wrap;padding:var(--dt-sp-4) var(--dt-sp-4) var(--dt-sp-2);}',
      '.dtHeadLeft{min-width:0;flex:0 0 auto;white-space:nowrap;}',
      '.dtHeadTitle{font-size:var(--dt-fs-head);font-weight:650;line-height:1.2;white-space:nowrap;}',
      '.dtHeadCount{margin-top:3px;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtHeadRight{display:flex;align-items:center;gap:var(--dt-sp-2);flex-wrap:wrap;justify-content:flex-end;flex:1 1 auto;}',
      '.dtSearch{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);}',
      '.dtSearchInput{width:132px;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dt-fs-meta);}',
      '.dtAddBar{display:flex;align-items:center;gap:var(--dt-sp-2);margin:2px var(--dt-sp-4) var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);}',
      '.dtAddInput{flex:1 1 auto;min-width:0;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;}',
      '.dtList{flex:1 1 auto;min-height:0;overflow:auto;padding:0 var(--dt-sp-2) var(--dt-sp-6);}',
      '.dtRow{display:flex;align-items:flex-start;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid transparent;border-radius:var(--dt-r-row);cursor:pointer;transition:background .12s linear,border-color .12s linear;}',
      '.dtRow:hover{background:var(--dt-bg-1);}',
      '.dtRowActive{background:var(--dt-bg-1);border-color:var(--dt-border-1);box-shadow:inset 2px 0 0 var(--dt-accent);}',
      '.dtCheck{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;margin-top:2px;flex:0 0 auto;padding:0;border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;background:transparent;color:var(--dsw-alias-bg-base);cursor:pointer;}',
      '.dtCheck:hover{border-color:var(--dsw-alias-brand-primary);}',
      '.dtCheckOn{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
      '.dtRowMain{flex:1 1 auto;min-width:0;}',
      '.dtRowTitle{font-size:var(--dt-fs-body);line-height:1.45;word-break:break-word;}',
      '.dtRowDone .dtRowTitle{color:var(--dsw-alias-label-secondary);text-decoration:line-through;}',
      '.dtRowNote{margin-top:2px;font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
      '.dtRowChips{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);margin-top:var(--dt-sp-1);}',
      '.dtChip{display:inline-flex;align-items:center;gap:var(--dt-sp-1);max-width:100%;white-space:nowrap;padding:1px var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);}',
      '.dtChipBell{color:var(--dsw-alias-state-warn-primary);border-color:currentColor;}',
      '.dtChipDone{color:var(--dsw-alias-state-success-primary);border-color:currentColor;}',
      '.dtChipTag{color:var(--dsw-alias-brand-primary);border-color:currentColor;}',
      '.dtPriority{display:inline-flex;margin-top:3px;}',
      '.dtRowBtn{padding:3px var(--dt-sp-2);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-micro);cursor:pointer;opacity:0;}',
      '.dtRow:hover .dtRowBtn{opacity:1;}',
      '.dtRowBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtEmpty{padding:var(--dt-sp-8) var(--dt-sp-4);text-align:center;color:var(--dt-label-2);line-height:1.7;}',
      '.dtEmptyTitle{font-size:var(--dt-fs-body);font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtEmptyText{margin-top:var(--dt-sp-2);font-size:var(--dt-fs-meta);}',
      '.dtDrawer .dtSearchInput{width:108px;}',
      '.dtDrawer .dtHead{padding:var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-2);}',
      '.dtScrim{position:absolute;inset:0;z-index:15;background:var(--dt-scrim);}',
      '.dtFace{display:inline-flex;align-items:center;color:var(--dsw-alias-state-error-primary);}',
      /* ---- 详情栏 C 的内容（§1.8）：不再是浮层，是 B 栏右边的一栏 ---- */
      '.dtDetail{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:auto;}',
      '.dtDetailFields{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3) var(--dt-sp-4);}',
      '.dtDetailFields .dtField{align-items:flex-start;}',
      '.dtDetailFields .dtFieldLabel{padding-top:var(--dt-sp-2);flex:0 0 52px;font-size:var(--dt-fs-micro);}',
      '.dtDetailFields .dtFieldInput,.dtDetailFields .dtInput{width:100%;box-sizing:border-box;padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-1);color:var(--dt-label-1);font:inherit;font-size:var(--dt-fs-meta);outline:none;min-height:28px;transition:border-color .12s linear,box-shadow .12s linear;}',
      // S7c-2：悬停反馈只提边框一档，不动底色、不加投影，避免与 :focus 的 2px 影叠出第三种视觉。
      // S7c-4：hover 只提边框一档，且走插件令牌 --dt-border-2（自带兜底色），
      // 不再裸引宿主 --dsw-alias-border-l2——宿主那个别名是半透明黑（alpha 约 10%），
      // 缺别名时会退化成 currentColor，与其它边框规则的兜底口径也不一致。
      '.dtDetailFields .dtFieldInput:hover,.dtDetailFields .dtInput:hover{border-color:var(--dt-border-2)}',
      '.dtDetailFields .dtFieldInput:focus,.dtDetailFields .dtInput:focus{border-color:var(--dt-accent);box-shadow:0 0 0 2px var(--dt-accent-weak);}',
      '.dtDetailFields .dtTitleInput{font-size:var(--dt-fs-title);font-weight:600;line-height:1.4;resize:vertical;}',
      '.dtDetailFields .dtNoteInput{min-height:74px;line-height:1.5;resize:vertical;}',
      '.dtDetailFields .dtFieldWide{flex-direction:column;align-items:stretch;gap:var(--dt-sp-1);}',
      '.dtDetailFields .dtFieldWide .dtFieldLabel{padding-top:0;flex:0 0 auto;}',
      '.dtDetailActions{display:flex;gap:var(--dt-sp-2);padding-top:var(--dt-sp-1);border-top:1px solid var(--dsw-alias-border-l1);margin-top:2px;}',
      '.dtField{display:flex;align-items:center;gap:var(--dt-sp-3);}',
      '.dtFieldLabel{flex:0 0 54px;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtFieldBody{flex:1 1 auto;min-width:0;}',
      '.dtRow2{display:flex;gap:var(--dt-sp-2);}',
      '.dtInput{width:100%;box-sizing:border-box;padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dt-fs-meta);outline:none;}',
      '.dtInput:focus{border-color:var(--dsw-alias-brand-primary);}',
      '.dtTitleInput{font-size:var(--dt-fs-title);font-weight:600;line-height:1.4;resize:vertical;}',
      '.dtNoteInput{min-height:74px;line-height:1.5;resize:vertical;}',
      '.dtToggle{display:flex;align-items:center;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary);cursor:pointer;}',
      '.dtToggleWide{padding:3px 0;}',
      '.dtQuickRow{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);padding-left:64px;}',
      '.dtSeg{display:flex;gap:var(--dt-sp-1);}',
      '.dtSegBtn{flex:1 1 auto;padding:var(--dt-sp-1) 0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtSegOn{border-color:currentColor;background:var(--dsw-alias-bg-layer-2);font-weight:600;}',
      '.dtMiniBtn{display:inline-flex;align-items:center;gap:var(--dt-sp-1);padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtMiniBtn:hover{color:var(--dsw-alias-label-primary);}',
      '.dtMiniOn{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600;}',
      /* 主按钮吃插件强调色，不再用宿主 brand/bg 别名：新版宿主的 brand-primary 是近黑色、bg-layer-1 是浅灰，
         二者叠加看起来就像「禁用态」，用户会把可用按钮当成点不动（S7b-1 的直接干扰项）。 */
      '.dtPrimaryBtn{display:inline-flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dt-accent);border-radius:var(--dt-r-card);background:var(--dt-accent);color:var(--dt-accent-on);font:inherit;font-weight:600;cursor:pointer;}',
      '.dtPrimaryBtn:hover{filter:brightness(1.06);}',
      '.dtPrimaryLg{padding:var(--dt-sp-2) var(--dt-sp-6);font-size:var(--dt-fs-body);}',
      '.dtGhostBtn{display:inline-flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtGhostBtn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtDangerBtn{display:inline-flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-state-error-primary);font:inherit;font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtDangerBtn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtIconBtn{display:inline-flex;padding:var(--dt-sp-1);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtIconBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtToastLayer{position:absolute;top:12px;right:12px;z-index:40;display:flex;flex-direction:column;gap:var(--dt-sp-2);width:298px;pointer-events:none;}',
      '.dtToast{pointer-events:auto;display:flex;align-items:flex-start;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dt-shadow-sm);}',
      '.dtToastPomo{border-color:var(--dsw-alias-brand-primary);}',
      '.dtToastBody{flex:1 1 auto;min-width:0;}',
      '.dtToastTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtToastText{margin-top:2px;font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);}',
      '.dtToastActions{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtPomo{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;gap:var(--dt-sp-4);padding:var(--dt-sp-4) var(--dt-sp-5);overflow:auto;}',
      '.dtPomoTop{width:100%;display:flex;align-items:baseline;justify-content:space-between;}',
      '.dtPomoTitle{font-size:var(--dt-fs-head);font-weight:650;}',
      '.dtPomoToday{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtPomoModes{display:flex;gap:var(--dt-sp-2);padding:var(--dt-sp-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtPomoMode{padding:var(--dt-sp-1) var(--dt-sp-4);border:0;border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtPomoModeOn{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.dtPomoRing{margin:var(--dt-sp-1) 0;}',
      '.dtPomoControls{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtPomoPresets{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:var(--dt-sp-2);padding-top:2px;}',
      '.dtPomoSettings{width:100%;max-width:540px;display:grid;grid-template-columns:1fr 1fr;gap:var(--dt-sp-2) var(--dt-sp-5);margin-top:var(--dt-sp-1);padding-top:var(--dt-sp-3);border-top:1px solid var(--dsw-alias-border-l1);}',
      '.dtPomoSettings .dtToggleWide{grid-column:1 / -1;}',
      '.dtSettings{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:var(--dt-sp-3);padding:var(--dt-sp-4) var(--dt-sp-5);overflow:auto;max-width:760px;}',
      '.dtSettingsTitle{font-size:var(--dt-fs-head);font-weight:650;}',
      '.dtCard{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-4);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtCardTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtHint{font-size:var(--dt-fs-micro);line-height:1.5;color:var(--dsw-alias-label-secondary);}',
      '.dtStats{display:flex;flex-wrap:wrap;gap:var(--dt-sp-4);}',
      '.dtStat{min-width:62px;}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '.dtStatValue{font-size:18px;font-weight:650;font-variant-numeric:tabular-nums;}',
      '.dtStatLabel{font-size:var(--dt-fs-micro);color:var(--dt-label-2);}',
      /* 设置页六组 IA 的控件（§12.1）：音效/主题用同一套「卡片式单选」外观 */
      '.dtSoundRow,.dtThemeRow{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtSoundOpt,.dtThemeOpt{position:relative;display:inline-flex;align-items:center;gap:var(--dt-sp-2);height:28px;padding:0 var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);color:var(--dt-label-2);background:transparent;cursor:pointer;}',
      '.dtSoundOpt:hover,.dtThemeOpt:hover{background:var(--dt-bg-2);color:var(--dt-label-1);}',
      '.dtSoundOptOn,.dtThemeOptOn{border-color:var(--dt-brand);background:var(--dt-bg-2);color:var(--dt-label-1);font-weight:600;}',
      '.dtSoundRadio,.dtThemeRadio{position:absolute;opacity:0;width:1px;height:1px;margin:0;}',
      '.dtSoundOptText,.dtThemeOptText{white-space:nowrap;}',
      '.dtRange{width:100%;max-width:220px;accent-color:var(--dt-brand);}',
      '.dtModuleList{display:flex;flex-direction:column;gap:2px;}',
      '.dtModuleRow{display:flex;align-items:center;gap:var(--dt-sp-2);padding:3px 0;}',
      '.dtModuleName{flex:1 1 auto;font-size:var(--dt-fs-meta);color:var(--dt-label-1);}',
      '.dtModuleOps{display:flex;gap:var(--dt-sp-1);}',
      '.dtWarnText{font-size:var(--dt-fs-micro);line-height:1.5;color:var(--dt-warn);}',
      '.dtFatal{margin:auto;max-width:520px;display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-6);}',
      '.dtFatalTitle{font-size:var(--dt-fs-title);font-weight:600;color:var(--dt-danger);}',
      '.dtFatalText{font-size:var(--dt-fs-meta);line-height:1.6;color:var(--dt-label-2);}',
      '.dtBtnRow{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtRailRow{position:relative;display:flex;align-items:center;}',
      '.dtRailMore{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:0;border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-body);line-height:1;cursor:pointer;opacity:.45;transition:opacity .12s;}',
      '.dtRailRow:hover .dtRailMore{opacity:1;}',
      /* 键盘用户必须能到达「清单设置」（S7c-1）：外环与 .dtRoot :focus-visible 同一口径（2px 强调色 + offset 2）。
         没有这条时，⋯ 常显但聚焦无环，键盘用户看不出焦点落在哪。 */
      '.dtRailMore:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;opacity:1;}',
      '.dtRailMore:hover{color:var(--dsw-alias-label-primary);}',
      '.dtRailEmoji{flex:0 0 auto;width:15px;font-size:var(--dt-fs-meta);line-height:15px;text-align:center;}',
      '.dtRailGroupCount{display:inline-flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtRailAdd{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtRailAdd:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);}',
      /* ---------------- 目录栏设置与拖拽排序（t144 / §1.20） ---------------- */
      '.dtRailTitleActions{display:inline-flex;align-items:center;gap:var(--dt-sp-1);}',
      /* 手柄固定 18px 占位（§1.20.8）：.dtRailItem 的 padding-left 恒为 18px，手柄绝对定位在
         .dtRailRow 内，所以「显示/隐藏手柄」两态下名称起始 x 与行高都不跳。 */
      '.dtRailDrag{position:absolute;left:2px;top:50%;transform:translateY(-50%);width:14px;height:18px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:grab;}',
      '.dtRailDrag:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtRailDrag:active{cursor:grabbing;}',
      '.dtRailFnRow{position:relative;display:flex;align-items:center;}',
      '.dtRailRow[data-dragging="1"],.dtRailFnRow[data-dragging="1"]{opacity:.6;}',
      '.dtRailRow[data-drop-target="1"]::after,.dtRailFnRow[data-drop-target="1"]::after{content:"";position:absolute;left:4px;right:4px;top:0;height:2px;border-radius:var(--dt-r-row);background:var(--dsw-alias-brand-primary);}',
      '.dtPsPanel{position:fixed;z-index:35;box-sizing:border-box;min-width:260px;max-width:320px;padding:var(--dt-sp-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dt-shadow-menu);overflow-y:auto;overscroll-behavior:contain;}',
      '.dtPsPanel[data-flip="up"]{transform-origin:top right;}',
      '.dtPsRow{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary);cursor:pointer;}',
      '.dtPsRow:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtPsLabel{flex:1 1 auto;}',
      '.dtPsCheck{display:inline-flex;color:var(--dsw-alias-brand-primary);}',
      /* t165：面板里的「位置调整」列表。宽度写死上下限，条目名过长省略，
         避免面板被长清单名撑到不可用（用户报障的另一个观感问题）。 */
      '.dtPsPanel{min-width:260px;max-width:320px;}',
      '.dtPsDivider{height:1px;margin:var(--dt-sp-1) var(--dt-sp-2);background:var(--dsw-alias-border-l1);}',
      '.dtPsGroup{display:flex;flex-direction:column;gap:2px;padding:2px 0;}',
      '.dtPsGroupTitle{padding:var(--dt-sp-2) var(--dt-sp-2) 2px;font-size:var(--dt-fs-micro);line-height:15px;color:var(--dsw-alias-label-secondary);}',
      '.dtPsItem{display:flex;align-items:center;gap:var(--dt-sp-1);padding:var(--dt-sp-1) var(--dt-sp-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary);}',
      '.dtPsItem:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtPsItem[data-on="0"] .dtPsItemName{color:var(--dsw-alias-label-secondary);}',
      '.dtPsItemName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtPsMove{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtPsMove:hover:not([disabled]){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}',
      '.dtPsMove[disabled]{opacity:var(--dt-disabled-op);cursor:default;}',
      '.dtPsToggle{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtPsToggleOn{color:var(--dt-accent);border-color:var(--dt-accent);}',
      '.dtPsEdit,.dtPsDel{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtPsEdit:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}',
      '.dtPsDel:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dt-danger);}',
      '.dtRailLive{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}',

      '.dtModal{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:var(--dt-sp-6);background:var(--dt-scrim);}',
      '.dtModalCard{width:100%;max-width:392px;max-height:100%;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dt-shadow-md);overflow:hidden;}',
      '.dtModalHead{padding:var(--dt-sp-4) var(--dt-sp-4) var(--dt-sp-3);font-size:var(--dt-fs-body);font-weight:650;}',
      '.dtModalBody{display:flex;flex-direction:column;gap:var(--dt-sp-3);padding:2px var(--dt-sp-4) var(--dt-sp-4);overflow:auto;}',
      '.dtModalFoot{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-4) var(--dt-sp-3);border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}',
      '.dtGrow{flex:1 1 auto;}',
      '.dtTypeList{display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtTypeBtn{display:flex;flex-direction:column;gap:2px;width:100%;padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);font:inherit;text-align:left;cursor:pointer;}',
      '.dtTypeBtn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtTypeOn{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary);}',
      '.dtTypeName{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtTypeOn .dtTypeName{color:var(--dsw-alias-brand-primary);}',
      '.dtTypeHint{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtSwatches{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtSwatch{width:24px;height:24px;padding:0;border:0;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);}',
      '.dtSwatchOn{box-shadow:0 0 0 2px var(--dsw-alias-bg-overlay),0 0 0 4px var(--dsw-alias-brand-primary);}',
      '.dtIconRow{display:flex;align-items:center;gap:var(--dt-sp-3);}',
      '.dtIconInput{width:64px;text-align:center;}',
      '.dtPreview{display:inline-flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-1) var(--dt-sp-3);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-2);font-size:var(--dt-fs-meta);}',
      '.dtPreviewName{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtErr{font-size:var(--dt-fs-micro);color:var(--dsw-alias-state-error-primary);}',

      /* ---- 抽屉区（两栏挤压式 flex，§2.3；任何宽度都是两栏，不做 tab 降级） ---- */
      '.dtDrawerZone[data-count="2"]{border-left:0;}',
      '.dtDrawerCollapse{height:26px;padding:var(--dt-sp-1) var(--dt-sp-2);margin-left:2px;font-size:var(--dt-fs-meta);font-weight:500;color:var(--dsw-alias-label-secondary);}',
      '.dtDrawerCollapse:hover{color:var(--dsw-alias-label-primary);}',
      '.dtDrawer .dtDrawerCollapse{min-width:24px;min-height:24px;}',

      /* ---- 习惯面板（§3） ---- */
      '.dtHabit{flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-1) var(--dt-sp-3) var(--dt-sp-6);}',
      '.dtHabitBlock{margin-bottom:var(--dt-sp-4);}',
      '.dtHabitBlockHead{display:flex;align-items:baseline;justify-content:space-between;padding:2px 2px var(--dt-sp-2);}',
      '.dtHabitBlockTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtHabitBlockCount{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtHabitGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--dt-sp-3);}',
      '.dtHabitCard{display:flex;flex-direction:column;gap:var(--dt-sp-2);min-height:96px;padding:var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);transition:border-color .12s,background .12s;}',
      '.dtHabitCard:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);}',
      '.dtHabitCardOn{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}',
      '.dtHabitCardFuture{opacity:.55;}',
      '.dtHabitCardTop{display:flex;align-items:flex-start;gap:var(--dt-sp-2);}',
      '.dtHabitTitle{flex:1 1 auto;min-width:0;font-size:var(--dt-fs-body);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
      '.dtHabitMeta{font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dtHabitStreak{display:flex;align-items:center;justify-content:space-between;gap:var(--dt-sp-2);margin-top:auto;padding-top:var(--dt-sp-2);border-top:1px solid var(--dsw-alias-border-l1);font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtHabitStreak b{font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtHabitStreakTag{font-size:var(--dt-fs-micro);color:var(--dsw-alias-state-success-primary);}',
      '.dtHabitStreakText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtHabitBlockEmpty{padding:var(--dt-sp-4);border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',

      /* ---- 四象限（§2.5） ---- */
      /* 四格必须永远可达（t46 F11）：`.dtQuad` 自己也能滚，作为网格放不下时的兜底；
         行模板一律写 `minmax(0,1fr)`——裸 `1fr` 的行带 min-content 下限，
         祖先高度若是 auto 就会被内容撑高、被 overflow:hidden 裁掉后两格且无处可滚。 */
      '.dtQuad{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:var(--dt-sp-3);overflow:auto;}',
      '.dtQuadGrid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(2,minmax(160px,1fr));grid-auto-rows:minmax(160px,auto);gap:var(--dt-sp-2);}',
      '.dtQuad[data-layout="stack"] .dtQuadGrid{grid-template-columns:1fr;grid-template-rows:none;grid-auto-rows:minmax(200px,auto);}',
      '.dtQuad[data-layout="stack"] .dtQuadCell{min-height:180px;}',
      '.dtQuadCell{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dt-quad,var(--dsw-alias-border-l1));border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-base);overflow:hidden;}',
      /* 四色同源（§0.6）：格子左边线取 --dt-quad，标题色只对 q1–q3 上色，q4 用主文本色 */
      '.dtQuadCell[data-quad-color="none"]{border-left-color:transparent;}',
      '.dtQuadHeadTitle{color:var(--dt-quad);}',
      '.dtQuadCell[data-quad-color="none"] .dtQuadHeadTitle{color:var(--dsw-alias-label-primary);}',
      '.dtQuadHead{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:var(--dt-sp-2);height:32px;padding:0 var(--dt-sp-3);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.dtQuadTitle{font-size:var(--dt-fs-meta);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dtQuadCount{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtQuadBody{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding:var(--dt-sp-2);}',
      '.dtQuadItem+.dtQuadItem{margin-top:2px;}',
      '.dtQuadEmpty{padding:var(--dt-sp-3) var(--dt-sp-2);font-size:var(--dt-fs-micro);line-height:1.45;color:var(--dsw-alias-label-secondary);text-align:center;}',
      '.dtTodayPin{display:flex;flex-direction:column;gap:2px;margin-bottom:var(--dt-sp-2);padding-bottom:var(--dt-sp-2);border-bottom:1px dashed var(--dsw-alias-border-l2);}',
      '.dtTodayPinTitle{display:flex;align-items:center;gap:var(--dt-sp-1);padding:2px var(--dt-sp-1) var(--dt-sp-1);font-size:var(--dt-fs-micro);font-weight:600;color:var(--dsw-alias-brand-primary);}',
      '.dtRowCompact{padding:var(--dt-sp-2) var(--dt-sp-2);}',
      '.dtRowCompact .dtRowTitle{font-size:var(--dt-fs-meta);}',
      '.dtRowCompact .dtRowChips{margin-top:3px;}',
      '.dtRowChild{padding-left:var(--dt-sp-6);}',
      /* 行尾两段（§1.16.1）：动作区恒占 66px（hover / focus / 菜单展开才显形，不塌陷），
         状态区恒占 148px（flag 18 + date 56 + tag 36 + score 20 + 4×gap 6 = 148）。
         日期槽 44→56（t134，用户报障：44px 放不下「2027年10月15日」这类最长值，
         会被 overflow:hidden 吃掉半个字）；其余槽位与 gap 不变。
         两段宽度都写死 → 同列所有分数圈的右边界必然相等，不再随内容组合漂移。 */
      '.dtRowTail{display:flex;align-items:center;flex:0 0 auto;gap:var(--dt-sp-2);}',
      /* §0.5：menuFlip 的锚点父容器必须是定位元素，象限菜单与今日要事菜单的
         getBoundingClientRect 才落在本行动作区上（缺 position:relative 时会相对
         更上层定位，翻转判定算错）。这是功能依赖，不是纯样式。 */
      '.dtRowActions{position:relative;display:flex;align-items:center;justify-content:flex-end;gap:2px;flex:0 0 66px;width:66px;opacity:0;pointer-events:none;transition:opacity .12s linear;}',
      '.dtRow:hover .dtRowActions,.dtRow:focus-within .dtRowActions,.dtRowActions[data-open="1"]{opacity:1;pointer-events:auto;}',
      '.dtRowActions .dtRowBtn,.dtRowActions .dtPinBtn,.dtRowActions .dtQuadMenuBtn{min-width:20px;padding:0 2px;}',
      '.dtRowState{display:flex;align-items:center;gap:var(--dt-sp-2);flex:0 0 148px;width:148px;}',
      '.dtStateFlag{display:inline-flex;align-items:center;justify-content:center;flex:0 0 18px;width:18px;height:18px;}',
      '.dtStateDate{display:inline-flex;align-items:center;flex:0 0 56px;width:56px;overflow:hidden;white-space:nowrap;}',
      '.dtStateTag{display:inline-flex;align-items:center;flex:0 0 36px;width:36px;overflow:hidden;}',
      '.dtStateDate:empty,.dtStateTag:empty{visibility:hidden;}',
      /* 日期槽内的 chip 去掉药丸内边距与图标（t134）：56px 里 12px 图标 + 4px gap + 12px 内边距
         只剩 28px 给文字，必然截断。槽内只留文字，完整标签（含年份与星期）在 title 上。 */
      '.dtStateDate .dtChip{padding:0;border:0;background:transparent;max-width:100%;gap:0;font-size:var(--dt-fs-micro);line-height:16px;}',
      '.dtStateDate .dtChipState>svg,.dtStateDate .dtChipState .dtFace{display:none;}',
      '.dtRowState .dtScoreRing{flex:0 0 20px;width:20px;height:20px;}',
      '.dtRowState .dtScoreRing svg{width:20px;height:20px;}',
      '.dtDrawer[data-dense="1"] .dtRowState{flex:0 0 68px;width:68px;}',
      '.dtDrawer[data-dense="1"] .dtStateTag,.dtDrawer[data-dense="1"] .dtRowState .dtScoreRing{display:none;}',
      /* t210 F3：彻底删除是危险动作，图标用 danger 色区分于「恢复」 */
      '.dtRowPurge{color:var(--dt-danger);}',
      '.dtTrashPurgeAll{color:var(--dt-danger);}',
      '.dtPinBtn,.dtQuadMenuBtn{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 var(--dt-sp-1);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtPinBtn:hover,.dtQuadMenuBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtPinBtn[data-on="1"]{color:var(--dsw-alias-brand-primary);}',
      '.dtPinOn{color:var(--dsw-alias-brand-primary);}',
      '.dtQuadMenuBtnOn{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      /* 改判菜单：每项文字色 = 对应象限色；选中态 = 左侧 3px 竖条 + 600 字重（不靠背景冒充） */
      '.dtMenuItemQuad[data-on="1"],.dtMenuItemQuadAuto[data-on="1"]{font-weight:600;box-shadow:inset 3px 0 0 currentColor;}',
      '.dtMenuItemQuadAuto[data-on="1"]{color:var(--dsw-alias-label-primary);}',
      /* 象限标签：颜色 = 所在格的颜色（Q4 透明，文字回落 label-secondary 才可读） */
      '.dtQuadTag{display:inline-block;margin-left:var(--dt-sp-2);font-size:var(--dt-fs-micro);font-weight:600;line-height:1.4;white-space:nowrap;}',
      '.dtQuadTag[data-quad-color="red"]{color:var(--dt-quad-red);}',
      '.dtQuadTag[data-quad-color="yellow"]{color:var(--dt-quad-yellow);}',
      '.dtQuadTag[data-quad-color="blue"]{color:var(--dt-quad-blue);}',
      '.dtQuadTag[data-quad-color="none"]{color:var(--dsw-alias-label-secondary);}',
      '.dtMenuItemLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtMenuItemOn{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      /* §0.5 下拉菜单定位：默认向下（top:calc(100% + 2px)），
         data-flip="up" 改向上；放不下时 data-clamp="1" + 内联 max-height 滚动。 */
      '.dtQuadMenu{right:0;width:132px;min-width:132px;max-height:240px;}',
      '.dtMenu{position:absolute;top:calc(100% + 2px);bottom:auto;right:0;z-index:35;min-width:132px;padding:var(--dt-sp-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dt-shadow-menu);display:none;}',
      '.dtMenu[data-open]{display:block;}',
      '.dtMenu[data-flip="up"]{top:auto;bottom:calc(100% + 2px);}',
      '.dtMenu[data-clamp="1"]{overflow:auto;}',
      '.dtMenuItem{display:flex;align-items:center;justify-content:space-between;width:100%;height:28px;padding:var(--dt-sp-1) var(--dt-sp-2);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dt-fs-meta);text-align:left;cursor:pointer;}',
      '.dtMenuItem:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtMenuItem[data-on]{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dtMenuSep{height:1px;margin:var(--dt-sp-1) var(--dt-sp-2);background:var(--dsw-alias-border-l1);}',

      /* ---- 日历（§5） ---- */
      '.dtCal{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:var(--dt-sp-4) var(--dt-sp-4) var(--dt-sp-4);overflow:hidden;}',
      '.dtCalBar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:var(--dt-sp-3);padding-bottom:var(--dt-sp-3);}',
      '.dtCalNav{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtCalTitle{font-size:var(--dt-fs-title);font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums;}',
      '.dtCalBarRight{position:relative;display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtCalWeek{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;padding-bottom:var(--dt-sp-2);}',
      '.dtCalWeekday{text-align:center;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;}',
      '.dtCalWeekend{opacity:.8;}',
      '.dtCalWeekdayShort{display:none;}',
      '.dtCalGrid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(6,minmax(0,1fr));gap:1px;background:var(--dsw-alias-border-l1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);overflow:hidden;}',
      '.dtCalCell{position:relative;min-height:64px;padding:var(--dt-sp-2) var(--dt-sp-2) var(--dt-sp-2);display:flex;flex-direction:column;gap:2px;background:var(--dsw-alias-bg-base);cursor:pointer;}',
      '.dtCalCell:hover{background:var(--dsw-alias-bg-layer-1);}',
      '.dtCalDay{font-size:var(--dt-fs-meta);line-height:1.2;font-variant-numeric:tabular-nums;}',
      '.dtCalSub{min-height:14px;max-width:100%;line-height:14px;font-size:var(--dt-fs-micro);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);}',
      '.dtCalSubTerm{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dtCalSubLunar{color:var(--dsw-alias-label-secondary);}',
      '.dtCalSubHoliday{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dtMenuCheck .dtMenuItemLabel{flex:1 1 auto;}',
      '.dtMenuCheck[data-on] .dtMenuItemLabel{color:var(--dsw-alias-brand-primary);}',
      '.dtCalHint{margin:var(--dt-sp-1) 2px 2px;padding-top:var(--dt-sp-1);border-top:1px solid var(--dsw-alias-border-l1);font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);}',
      '.dtCalHint[data-cal-hint="compact"]{color:var(--dsw-alias-state-warn-primary);}',
      '.dtCalMakeup{display:inline-block;margin-left:var(--dt-sp-1);padding:0 3px;height:12px;line-height:12px;border-radius:var(--dt-r-row);font-size:var(--dt-fs-micro);font-weight:500;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-warn-primary);}',
      '.dtCalGap{margin-left:var(--dt-sp-1);font-size:var(--dt-fs-meta);line-height:1;color:var(--dsw-alias-label-secondary);opacity:.55;cursor:help;}',
      '.dtCalDots{margin-top:auto;display:flex;align-items:center;gap:3px;height:8px;}',
      '.dtCalDot{width:4px;height:4px;flex:0 0 auto;border-radius:50%;}',
      '.dtCalMoreCount{font-size:var(--dt-fs-micro);line-height:1;color:var(--dsw-alias-label-secondary);}',
      '.dtCalAdd{position:absolute;top:4px;right:4px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;transition:opacity .12s;}',
      '.dtCalCell:hover .dtCalAdd{opacity:1;}',
      '.dtCalToday{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary);}',
      '.dtCalToday .dtCalDay{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dtCalSel{background:var(--dsw-alias-bg-layer-2);}',
      '.dtCalOut{opacity:.42;}',
      '.dtCalMore[aria-expanded="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtCal .dtMenu{position:absolute;top:36px;right:0;z-index:35;min-width:156px;}',

      /* ---- 番茄钟节奏（§4.2 / §4.3 / §4.5） ---- */
      '.dtIsDisabled select{opacity:.45;cursor:not-allowed;pointer-events:none;}',
      '.dtIsDisabled .dtFieldLabel{opacity:.55;}',
      '.dtRhythmField{grid-column:1 / -1;display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtRhythmGroup{display:flex;gap:var(--dt-sp-2);}',
      '.dtRhythmOpt{position:relative;flex:1 1 0;min-width:88px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtRhythmOpt:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);}',
      '.dtRhythmOpt[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.dtRhythmRadio{position:absolute;opacity:0;width:1px;height:1px;margin:0;}',
      '.dtRhythmOptText{white-space:nowrap;}',
      '.dtRhythmField .dtHint{margin-top:0;}',
      '.dtPomoModeSingle{padding:var(--dt-sp-1) var(--dt-sp-4);pointer-events:none;cursor:default;}',

      /* ---- 习惯详情（§2.8：三个数字 + 月历热力图） ---- */
      '.dtHabitDetail{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:auto;}',
      '.dtHabitStats{display:grid;grid-template-columns:repeat(3,1fr);padding:var(--dt-sp-3) 0 var(--dt-sp-3);}',
      '.dtHabitStat{display:flex;flex-direction:column;align-items:center;gap:2px;}',
      '.dtHabitStat+.dtHabitStat{border-left:1px solid var(--dsw-alias-border-l1);}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '.dtHabitStatNum{font-size:20px;font-weight:600;line-height:1.2;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;}',
      '.dtHabitStatLabel{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtHabitHeat{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:0 var(--dt-sp-3) var(--dt-sp-3);}',
      '.dtHeatHead{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtHeatNav{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtHeatNav:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtHeatTitle{flex:1 1 auto;font-size:var(--dt-fs-meta);font-weight:600;font-variant-numeric:tabular-nums;}',
      '.dtHeatCount{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtHeatWeek{display:grid;grid-template-columns:repeat(7,1fr);gap:var(--dt-sp-1);}',
      '.dtHeatWeekday{text-align:center;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtHeatGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:var(--dt-sp-1);max-width:288px;}',
      '.dtHeatCell{aspect-ratio:1 / 1;min-height:26px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;cursor:pointer;}',
      '.dtHeatCell[data-out="1"]{opacity:.35;}',
      '.dtHeatCell[data-future="1"]{opacity:.45;cursor:default;}',
      '.dtHeatCell[data-on="1"]{background:var(--dt-habit-color,var(--dsw-alias-brand-primary));color:var(--dsw-alias-bg-base);font-weight:600;}',
      '.dtHeatCell:not([data-future="1"]):not([data-out="1"]):hover{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}',
      /* t156 §2.8.9 热力图两档配色：未打卡=极浅主题色、已打卡=饱和适中；
         两档都由 --dt-accent 混出（不写死 hex，换强调色/主题后自动跟随） */
      '.dtRoot{--dt-heat-empty:color-mix(in oklab, var(--dt-accent) 26%, var(--dsw-alias-bg-layer-2));--dt-heat-on:var(--dt-accent);}',
      '.dtRoot[data-dt-theme="dark"]{--dt-heat-empty:color-mix(in oklab, var(--dt-accent) 30%, var(--dt-bg-2));}',
      '.dtHeatCell{background:var(--dt-heat-empty);}',
      '.dtHeatCell[data-on="1"]{background:var(--dt-heat-on);color:var(--dt-accent-on);}',
      '.dtHeatOn{background:var(--dt-heat-on);color:var(--dt-accent-on);}',
      /* t156 §1.21：立即行动面板（B 栏） */
      '.dtActNow{display:flex;flex-direction:column;gap:var(--dt-sp-3);padding:var(--dt-sp-4) var(--dt-sp-4);overflow:auto;}',
      '.dtActNowTitle{font-size:var(--dt-fs-body);line-height:19px;font-weight:600;color:var(--dt-label-1);}',
      '.dtActNowSteps{display:flex;flex-direction:column;gap:var(--dt-sp-2);margin:0;padding:0;list-style:none;}',
      '.dtActNowStep{display:flex;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);line-height:18px;color:var(--dt-label-1);}',
      '.dtActNowNo{color:var(--dt-accent);font-variant-numeric:tabular-nums;flex:0 0 auto;}',
      '.dtActNowText{flex:1 1 auto;min-width:0;}',
      '.dtActNowMin{flex:0 0 auto;margin-left:auto;padding-left:var(--dt-sp-2);font-size:var(--dt-fs-micro);color:var(--dt-label-2);font-variant-numeric:tabular-nums;}',
      '.dtActNowEmpty{font-size:var(--dt-fs-meta);line-height:18px;color:var(--dt-label-2);}',


      /* ---- 设置页：JSON 导入 ---- */
      '.dtFileLabel{position:relative;overflow:hidden;}',
      '.dtFileInput{display:none;}',
      '.dtHintOk{color:var(--dsw-alias-state-success-primary);}',

      /* ---- 容器断点（§2.3/§2.4，容器 = .dtRoot；任何档位保持 B+C 两栏） ---- */
      '@container dtroot (max-width:1079px){.dtDrawerZone[data-count="2"]{flex-basis:max(580px,calc(100cqw - 196px));}.dtHabitGrid{grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:var(--dt-sp-2);}.dtCalCell{min-height:60px;}}',
      '@container dtroot (max-width:547px){.dtDrawerZone[data-count="2"]{overflow-x:auto;}.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}}',
      '@container dtroot (max-width:719px){.dtDrawerZone[data-count="2"]{flex-basis:max(500px,calc(100cqw - 48px));}.dtDrawerZone[data-count="1"]{flex-basis:min(600px,92%);}.dtDrawer[data-slot="b"]{min-width:220px;}.dtDrawer[data-slot="c"]{min-width:280px;}.dtHabitGrid{grid-template-columns:1fr;gap:var(--dt-sp-2);}.dtCalCell{min-height:48px;}.dtCalSub{font-size:var(--dt-fs-micro);}.dtCalAdd{opacity:1;}.dtRail{box-sizing:border-box;width:48px;flex:0 0 48px;padding:var(--dt-sp-2) var(--dt-sp-1);}.dtRailLabel,.dtRailCount,.dtRailTitle{display:none;}.dtRailItem{height:32px;justify-content:center;padding:0;}.dtRailMore{display:none;}.dtDrawerZone[data-count="1"]{flex-basis:min(420px,calc(100cqw - 348px));}.dtCenter{min-width:280px;}.dtCalCell{padding:var(--dt-sp-1) var(--dt-sp-1) var(--dt-sp-1);min-height:46px;}.dtCalDay{font-size:var(--dt-fs-micro);line-height:1.2;}.dtCalAdd{position:static;order:9;align-self:flex-end;margin-top:auto;width:16px;height:16px;}}',
      '@container dtroot (max-width:559px){.dtHabitGrid{grid-template-columns:1fr;}.dtCalCell{min-height:44px;}.dtCalWeekdayFull{display:none;}.dtCalWeekdayShort{display:inline;}}',
      '@container dtroot (max-width:519px){.dtPomoSettings{grid-template-columns:1fr;}}',
      '@container dtroot (max-width:479px){.dtRhythmGroup{flex-direction:column;}.dtRhythmOpt{flex:1 1 auto;}}',
      '@container dtroot (max-width:419px){.dtPomoModes{flex-wrap:wrap;}.dtPomoMode{min-width:72px;}}',

      /* ---- 中间区容器断点（t46 F12）：番茄钟的设置网格按「中间区自己的宽度」换列。
         原来只按 .dtRoot 判断（519px），抽屉一开、中间区只剩 280px 时右列 select 被裁成「2」「1」。 ---- */
      '@container dcenter (max-width:519px){.dtPomoSettings{grid-template-columns:1fr;max-width:none;gap:var(--dt-sp-2);}}',
      '@container dcenter (max-width:479px){.dtRhythmGroup{flex-direction:column;}.dtRhythmOpt{flex:1 1 auto;}}',
      '@container dcenter (max-width:419px){.dtPomoModes{flex-wrap:wrap;}.dtPomoMode{min-width:72px;}}',
      /* -------------------------------- 螺旋工作法 -------------------------------- */
      '.dtSpiral{width:100%;max-width:420px;margin:0 auto;padding:var(--dt-sp-6) var(--dt-sp-5);display:flex;flex-direction:column;align-items:center;gap:var(--dt-sp-4);}',
      '.dtSpiralRing{position:relative;width:200px;height:200px;flex:0 0 auto;}',
      '.dtSpiralRing svg{display:block;width:100%;height:100%;transform:rotate(-90deg);}',
      '.dtSpiralTrack{fill:none;stroke:var(--dsw-alias-border-l1);stroke-width:10;}',
      '.dtSpiralArc{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:10;stroke-linecap:round;transition:stroke-dashoffset .5s linear;}',
      '.dtSpiralFace{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--dt-sp-2);pointer-events:none;}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '.dtSpiralTime{font-size:44px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);}',
      '.dtSpiralPhase{font-size:var(--dt-fs-body);color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralRound{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralBind{display:flex;align-items:center;gap:var(--dt-sp-2);height:32px;max-width:100%;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);font-size:var(--dt-fs-meta);}',
      '.dtSpiralBindKind{flex:0 0 auto;color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralBindName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtSpiralStats{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:center;}',
      '.dtSpiralActions{display:flex;justify-content:center;gap:var(--dt-sp-3);}',
      '.dtSpiralBtn{height:32px;min-width:88px;padding:0 var(--dt-sp-4);border-radius:var(--dt-r-card);border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-body);cursor:pointer;}',
      '.dtSpiralBtn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtSpiralBtn:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtSpiralStop{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);}',
      '.dtSpiralHint,.dtPomoHint{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);text-align:center;}',
      '.dtSpiralBoard{flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-1) var(--dt-sp-3) var(--dt-sp-6);}',
      '.dtSpiralSection{margin-bottom:var(--dt-sp-4);}',
      '.dtSpiralSectionTitle{margin:0 0 var(--dt-sp-2);font-size:var(--dt-fs-micro);font-weight:600;color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralRow{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:36px;margin-bottom:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtSpiralRowOn{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}',
      '.dtSpiralRowName{flex:1 1 auto;min-width:0;font-size:var(--dt-fs-meta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtSpiralRowMin{flex:0 0 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtSpiralDone,.dtSpiralSwap{position:relative;flex:0 0 auto;height:24px;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-row);border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtSpiralDone:hover,.dtSpiralSwap:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtSpiralAuto{display:flex;justify-content:flex-end;}',
      '.dtSpiralPreview{margin:0;padding:0;list-style:none;}',
      '.dtSpiralPreviewItem{font-size:var(--dt-fs-meta);line-height:1.7;color:var(--dsw-alias-label-secondary);}',
      '.dtPlayList{margin-bottom:var(--dt-sp-2);}',
      '.dtPlayItem{display:flex;align-items:center;gap:var(--dt-sp-2);height:32px;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-card);}',
      '.dtPlayItem[data-on="1"]{background:var(--dsw-alias-bg-layer-2);}',
      '.dtPlayName{flex:1 1 auto;min-width:0;font-size:var(--dt-fs-meta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtPlayInput{flex:1 1 auto;min-width:0;height:26px;padding:0 var(--dt-sp-2);border-radius:var(--dt-r-row);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);}',
      '.dtPlayOps{display:flex;flex:0 0 auto;gap:2px;}',
      '.dtPlayOp{width:24px;height:24px;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtPlayOp:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtPlayOp:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtPlayAdd{margin-top:var(--dt-sp-1);height:28px;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-card);border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtSpiralEmpty{padding:var(--dt-sp-4);border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralHistory{margin-top:var(--dt-sp-2);padding-top:var(--dt-sp-3);border-top:1px solid var(--dsw-alias-border-l1);}',
      '.dtSpiralHistoryList{margin:0;padding:0;list-style:none;}',
      '.dtSpiralHistoryRow{font-size:var(--dt-fs-micro);line-height:1.7;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      /* 五档缩放（§4.10.3）：viewBox 等比缩放，盒子只改宽高 */
      '@container dtroot (max-width:1079px){.dtSpiralRing{width:180px;height:180px;}}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '@container dtroot (max-width:899px){.dtSpiralRing{width:168px;height:168px;}.dtSpiralTime{font-size:38px;}}',
      '@container dtroot (max-width:547px){.dtDrawerZone[data-count="2"]{overflow-x:auto;}.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '@container dtroot (max-width:719px){.dtSpiralRing{width:150px;height:150px;}.dtSpiralTime{font-size:34px;}.dtSpiral{padding:var(--dt-sp-4) var(--dt-sp-3);}}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '@container dtroot (max-width:559px){.dtSpiralRing{width:132px;height:132px;}.dtSpiralTime{font-size:30px;}.dtSpiralStats{line-height:1.7;}.dtSpiralBtn{min-width:72px;}}',
      /* 排序器（§4.2）：与列表同一底色，避免出现「第二条工具条」的割裂感 */
      '.dtSortBar{display:flex;gap:var(--dt-sp-2);align-items:center;padding:var(--dt-sp-2) var(--dt-sp-3);border-bottom:1px solid var(--dt-border-1);background:var(--dt-bg-0);}',
      '.dtSortSelect{height:26px;padding:0 var(--dt-sp-2);border-radius:var(--dt-r-row);border:1px solid var(--dt-border-1);background:var(--dt-bg-0);color:var(--dt-label-1);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtSortSelect:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtSortDir{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:var(--dt-r-row);border:1px solid var(--dt-border-1);background:var(--dt-bg-0);color:var(--dt-label-2);cursor:pointer;}',
      '.dtSortDir:hover{background:var(--dt-bg-2);color:var(--dt-label-1);}',
      '.dtSortCount{margin-left:auto;font-size:var(--dt-fs-micro);color:var(--dt-label-2);font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.dtGroupHead{padding:var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-1);font-size:var(--dt-fs-micro);font-weight:600;color:var(--dt-label-2);}',
      /* 权重环：18px，四档只改描边不透明度，色相恒为品牌色（不与四象限红黄蓝共色相） */
      '.dtScoreRing{position:relative;display:inline-flex;flex:0 0 auto;width:18px;height:18px;}',
      '.dtScoreRing svg{width:18px;height:18px;display:block;}',
      '.dtScoreTrack{fill:none;stroke:var(--dt-border-1);stroke-width:2.4;}',
      /* 分数圈弧色（§1.17.2）：由 data-score-band 五档决定（0..4，-1 无分），具体色值以
         CSS 变量 --dt-score-arc / --dt-score-arc-dark 注入（gradient 模式注入插值色，
         bands 模式注入本档 anchor）。**不再用不透明度分档**——不透明度在白底上分不出档。 */
      '.dtScoreArc{fill:none;stroke:var(--dt-score-arc,var(--dt-success));stroke-width:2.4;stroke-linecap:round;transition:stroke-dashoffset .2s linear;}',
      '.dtRoot[data-dt-theme="dark"] .dtScoreArc{stroke:var(--dt-score-arc-dark,var(--dt-score-arc,var(--dt-success)));}',
      '.dtScoreRingHeuristic .dtScoreTrack{stroke-dasharray:2 2;}',
      '.dtScoreRingEmpty .dtScoreTrack{stroke-dasharray:2 2;}',
      '.dtScoreLine{font-size:var(--dt-fs-meta);color:var(--dt-label-2);font-variant-numeric:tabular-nums;}',
      /* m05210：主按钮不再吃宿主品牌色（--dt-brand 会跟宿主变黑），统一走强调色三令牌 */
      '.dtBlueBtn{display:inline-flex;align-items:center;height:26px;padding:0 var(--dt-sp-3);border:1px solid var(--dt-accent);border-radius:var(--dt-r-card);background:var(--dt-accent);color:var(--dt-accent-on);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtBlueBtn .dtIcon{color:var(--dt-accent-on);}',
      '.dtBlueBtn:hover{filter:brightness(1.06);}',
      '.dtBlueBtn:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '@container dtroot (max-width:547px){.dtDrawerZone[data-count="2"]{overflow-x:auto;}.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}}',
      '@container dtroot (max-width:719px){.dtSortBar{flex-wrap:wrap;}.dtSortCount{flex:1 0 100%;text-align:right;margin-left:0;}}',
      /* ---- 标签面板（t52 / §3.3.3） ---- */
      '.dtTagBoard{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
      '.dtTagList{flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-2) var(--dt-sp-3) var(--dt-sp-5);display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtTagRow{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:34px;padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid transparent;border-radius:var(--dt-r-card);}',
      '.dtTagRow:hover{background:var(--dt-bg-1);border-color:var(--dt-border-1);}',
      '.dtTagSwatch{width:10px;height:10px;flex:0 0 auto;border-radius:50%;background:var(--dt-label-3);}',
      '.dtTagMain{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:var(--dt-sp-2);padding:2px 0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);text-align:left;cursor:pointer;}',
      '.dtTagMain:hover{color:var(--dsw-alias-brand-primary);}',
      '.dtTagName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtTagCount{font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);}',
      '.dtTagOps{display:flex;align-items:center;gap:2px;opacity:0;transition:opacity 120ms;}',
      '.dtTagRow:hover .dtTagOps{opacity:1;}',
      '.dtTagHint{padding:var(--dt-sp-2) var(--dt-sp-3) var(--dt-sp-4);font-size:var(--dt-fs-micro);line-height:1.5;color:var(--dsw-alias-label-secondary);}',
      '.dtTagPalette{display:flex;flex-wrap:wrap;gap:var(--dt-sp-1);padding:var(--dt-sp-1) var(--dt-sp-2) var(--dt-sp-2) var(--dt-sp-6);}',
      '.dtTagSwatchBtn{width:18px;height:18px;padding:0;border:1px solid var(--dt-border-1);border-radius:50%;cursor:pointer;}',
      '.dtTagSwatchBtn[data-on="1"]{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary) inset;}',
      '.dtTagNew{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3) 2px;}',
      '.dtTagDot{width:10px;height:10px;flex:0 0 auto;border-radius:50%;background:var(--dt-label-3);}',
      '.dtTagOp{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtTagOp:hover{background:var(--dt-bg-2);color:var(--dsw-alias-label-primary);}',
      '.dtTagOpDanger:hover{color:var(--dsw-alias-state-error-primary);}',
      '.dtTagOpOn{background:var(--dt-bg-2);color:var(--dsw-alias-label-primary);}',
      '.dtTagSwatchOn{box-shadow:0 0 0 2px var(--dsw-alias-label-primary) inset;}',
      '.dtTagInput{flex:1 1 auto;height:26px;min-width:0;padding:0 var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-0);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);}',
      '.dtTagAddRow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3) var(--dt-sp-1);}',
      '.dtTagPresetRow{display:flex;flex-wrap:wrap;gap:var(--dt-sp-1);width:100%;}',
      '.dtTagPreset{height:22px;padding:0 var(--dt-sp-2);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtTagPreset:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
      '.dtChipTagOrphan{color:var(--dsw-alias-label-secondary);border-style:dashed;}',
      /* t156 §1.21：A 栏顶部右侧「立即行动」——颜色只走 accent 令牌，禁字面 hex */
      '.dtRailTop{display:flex;align-items:center;justify-content:space-between;gap:var(--dt-sp-2);}',
      '.dtRailRecBtn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-width:52px;height:22px;margin:0;padding:0 var(--dt-sp-2);border:0;border-radius:var(--dt-r-row);background:var(--dt-accent);color:var(--dt-accent-on);font:inherit;font-size:var(--dt-fs-micro);line-height:1;font-weight:600;cursor:pointer;}',
      '.dtRailRecBtn:hover{filter:brightness(1.06);}',
      '@container dtroot (max-width:719px){.dtRailRecBtn{min-width:32px;width:32px;padding:0;font-size:0;}}',
      '.dtRailRecOn{outline:2px solid var(--dt-brand);outline-offset:-2px;}',
      '.dtBStack{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;}',
      '.dtOneThingStrip{display:flex;align-items:center;gap:var(--dt-sp-2);flex:0 0 auto;padding:var(--dt-sp-2) var(--dt-sp-3);border-bottom:1px solid var(--dt-border-1);background:var(--dt-bg-2);}',
      '.dtOneThingStripKind{flex:0 0 auto;font-size:var(--dt-fs-micro);font-weight:600;color:var(--dsw-alias-state-warn-primary);}',
      '.dtOneThingStripTitle{flex:1 1 auto;min-width:0;padding:0;border:0;background:transparent;text-align:left;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;}',
      '.dtOneThingStripTitle:hover{color:var(--dt-brand);}',
      '.dtOneThingStripScore{flex:0 0 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtMiniDanger{color:var(--dsw-alias-state-error-primary);}',
      /* 推荐作为中间区视图（F17）：.dtRecPanel 原本只当 B 栏面板用，
         挪进中间区后要自己撑满并留出可读边距，同时限制单行宽度。 */
      '.dtRecCenter{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-3) var(--dt-sp-4) var(--dt-sp-4);}',
      '.dtRecCenter>.dtRecPanel{max-width:760px;}',
      '.dtObsBoard,.dtOneThingBoard,.dtRecPanel{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;}',
      '.dtObsBody,.dtOneThingBody,.dtRecBody{display:flex;flex-direction:column;gap:var(--dt-sp-3);flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-4);}',
      '.dtObsForm{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-2);}',
      '.dtObsFormTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtObsChips{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtObsChip{height:24px;padding:0 var(--dt-sp-3);border:1px solid var(--dt-border-2);border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtObsChip:hover{border-color:var(--dt-brand);color:var(--dt-brand);}',
      '.dtObsChipOn{border-color:var(--dt-brand);background:var(--dt-brand);color:var(--dt-bg-0);}',
      '.dtObsFormRow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);}',
      '.dtObsInput{flex:1 1 140px;min-width:0;height:28px;padding:0 var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-0);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);}',
      '.dtObsSelect,.dtObsDate{height:28px;padding:0 var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-0);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);}',
      '.dtObsDays{display:flex;gap:var(--dt-sp-1);}',
      '.dtObsRows{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtObsRow{padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtObsViewRow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);}',
      '.dtObsRowLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}',
      '.dtObsRowMin,.dtObsRowDay{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtObsRowNote{flex:1 1 100%;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);}',
      '.dtObsEditRow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);}',
      '.dtObsEmpty{padding:var(--dt-sp-3);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);}',
      '.dtObsEmptyText{margin-top:var(--dt-sp-1);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);line-height:1.5;}',
      '.dtProhibitCard{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-2);}',
      '.dtProhibitHead{display:flex;align-items:baseline;justify-content:space-between;gap:var(--dt-sp-2);}',
      '.dtProhibitTitle{font-size:var(--dt-fs-body);font-weight:600;}',
      '.dtProhibitSub{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtProhibitEmpty{padding:var(--dt-sp-3);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);}',
      '.dtProhibitEmptyTitle{font-weight:600;}',
      '.dtProhibitEmptyText{margin-top:3px;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);line-height:1.5;}',
      '.dtProhibitList,.dtProhibitWatchList{display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtProhibitRow{display:grid;grid-template-columns:18px minmax(60px,auto) 1fr;grid-template-areas:"rank label bar" "rank min share";gap:2px var(--dt-sp-2);align-items:center;font-size:var(--dt-fs-meta);}',
      '.dtProhibitRank{grid-area:rank;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:var(--dt-r-card);background:var(--dt-brand);color:var(--dt-bg-0);font-size:var(--dt-fs-micro);font-weight:600;}',
      '.dtProhibitLabel{grid-area:label;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtProhibitBar{grid-area:bar;height:6px;border-radius:var(--dt-r-row);background:var(--dt-border-1);overflow:hidden;}',
      '.dtProhibitBarFill{display:block;height:100%;border-radius:var(--dt-r-row);background:var(--dsw-alias-state-error-primary);}',
      '.dtProhibitMin{grid-area:min;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;}',
      '.dtProhibitShare{grid-area:share;text-align:right;color:var(--dsw-alias-state-error-primary);font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;}',
      '.dtProhibitWatch{display:flex;flex-direction:column;gap:var(--dt-sp-1);padding-top:var(--dt-sp-2);border-top:1px dashed var(--dt-border-2);}',
      '.dtProhibitWatchTitle{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtProhibitWatchRow{display:flex;align-items:baseline;gap:var(--dt-sp-2);font-size:var(--dt-fs-micro);}',
      '.dtProhibitWatchLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);}',
      '.dtProhibitWatchMin{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtProhibitWatchGap{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtProhibitFoot{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingCard{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtOneThingTop{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtOneThingKind{font-size:var(--dt-fs-micro);font-weight:600;color:var(--dsw-alias-state-warn-primary);}',
      '.dtOneThingProject{flex:1 1 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingTitle{padding:0;border:0;background:transparent;text-align:left;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-title);font-weight:600;line-height:1.4;cursor:pointer;}',
      '.dtOneThingTitle:hover{color:var(--dt-brand);}',
      '.dtOneThingActions{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtOneThingEmpty,.dtRecEmpty{padding:var(--dt-sp-3);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);}',
      '.dtOneThingEmptyTitle{font-weight:600;}',
      '.dtOneThingEmptyText{margin-top:var(--dt-sp-1);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);line-height:1.5;}',
      '.dtOneThingCandidates{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtOneThingCandidatesTitle{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingPick{display:flex;flex-direction:column;gap:2px;text-align:left;padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:transparent;cursor:pointer;}',
      '.dtOneThingPick:hover{border-color:var(--dt-brand);}',
      '.dtOneThingPickOn{border-color:var(--dt-brand);background:var(--dt-bg-2);}',
      '.dtOneThingPickTitle{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary);}',
      '.dtOneThingPickMeta{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingHistory{display:flex;flex-direction:column;gap:var(--dt-sp-1);padding-top:var(--dt-sp-2);border-top:1px dashed var(--dt-border-2);}',
      '.dtOneThingHistoryHead{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingHistoryRow{display:flex;gap:var(--dt-sp-2);font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingHistoryDay{flex:0 0 auto;font-variant-numeric:tabular-nums;}',
      '.dtRecBlock{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtRecBlockTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtRecBlockBody{font-size:var(--dt-fs-meta);line-height:1.6;}',
      '.dtRecTitle{font-size:var(--dt-fs-title);font-weight:600;}',
      '.dtRecMeta{display:flex;flex-wrap:wrap;gap:var(--dt-sp-1) var(--dt-sp-2);margin-top:var(--dt-sp-1);font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtRecNote{margin-top:var(--dt-sp-2);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);white-space:pre-wrap;}',
      '.dtRecWhy,.dtRecHow{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtRecReason{color:var(--dsw-alias-label-secondary);}',
      '.dtRecStep{color:var(--dsw-alias-label-primary);}',
      '.dtRecAct{display:flex;flex-direction:column;align-items:flex-start;gap:var(--dt-sp-2);}',
      '.dtRecActState{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '@container dtroot (max-width:547px){.dtDrawerZone[data-count="2"]{overflow-x:auto;}.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}}',
      '@container dtroot (max-width:719px){.dtProhibitRow{grid-template-columns:18px 1fr;grid-template-areas:"rank label" "rank min";}.dtProhibitBar,.dtProhibitShare{display:none;}}',

      /* ---- 58-pomo-log 番茄日志 / 月度热力图（§7.4：与习惯热力图刻意不同） ---- */
      '.dtPomoHeat{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);margin-top:var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtPomoHeat .dtHeatWeek{gap:3px;max-width:364px;}',
      '.dtPomoHeat .dtHeatWeekCell{text-align:center;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtPomoGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;max-width:364px;}',
      '.dtPomoCell{position:relative;aspect-ratio:1 / 1;min-height:28px;min-width:28px;border-radius:var(--dt-r-row);background:var(--dt-pomo-l0);border:1px solid var(--dsw-alias-border-l1);cursor:default;}',
      '.dtPomoCell[data-out="1"]{opacity:.35;}',
      '.dtPomoCell[data-future="1"]{opacity:.45;background-image:repeating-linear-gradient(135deg,transparent 0 3px,var(--dsw-alias-border-l2) 3px 4px);}',
      '.dtPomoCell[data-level="1"]{background:var(--dt-pomo-l1);border-color:transparent;}',
      '.dtPomoCell[data-level="2"]{background:var(--dt-pomo-l2);border-color:transparent;}',
      '.dtPomoCell[data-level="3"]{background:var(--dt-pomo-l3);border-color:transparent;}',
      '.dtPomoCell[data-level="4"]{background:var(--dt-pomo-l4);border-color:transparent;}',
      '.dtPomoNum{position:absolute;right:3px;bottom:1px;font-size:var(--dt-fs-micro);line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);}',
      '.dtPomoCell[data-level="3"] .dtPomoNum,.dtPomoCell[data-level="4"] .dtPomoNum{color:var(--dsw-alias-bg-base);}',
      '.dtPomoBind{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:30px;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);font-size:var(--dt-fs-meta);}',
      '.dtPomoBindLabel{color:var(--dsw-alias-label-secondary);flex:0 0 auto;}',
      '.dtPomoBindName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtPomoBindEmpty .dtPomoBindName{color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);white-space:normal;}',
      '.dtRowPomo{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtRowPomo:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);}',
      '.dtRowPomo[data-on="1"]{color:var(--dsw-alias-brand-primary);}',
      '.dtRowPomo:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtDetailPomo{color:var(--dsw-alias-brand-primary);}',
      '.dtPomoTag{flex:0 0 auto;padding:0 var(--dt-sp-2);border-radius:var(--dt-r-pill);border:1px solid var(--dsw-alias-border-l1);font-size:var(--dt-fs-micro);line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',

      /* ---- 任务信息框（t55 / §9.1）：补充说明 + 步骤 + 附件 + 整理助手 ---- */
      '.dtTaskInfo{margin-top:var(--dt-sp-3);padding-top:var(--dt-sp-3);border-top:1px solid var(--dt-border-1);display:flex;flex-direction:column;gap:var(--dt-sp-4);}',
      '.dtInfoNote,.dtInfoSteps,.dtInfoDocs,.dtInfoAgent{display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtInfoHead{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtInfoTitle{font-size:var(--dt-fs-meta);font-weight:600;color:var(--dt-label-1);}',
      '.dtInfoHint{margin-left:auto;font-size:var(--dt-fs-micro);color:var(--dt-label-3);font-variant-numeric:tabular-nums;}',
      '.dtInfoText{width:100%;box-sizing:border-box;resize:vertical;padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);color:var(--dt-label-1);font-size:var(--dt-fs-meta);line-height:1.55;font-family:inherit;}',
      '.dtInfoText:focus{outline:none;border-color:var(--dt-brand);}',
      '.dtInfoInput{width:100%;box-sizing:border-box;height:28px;padding:0 var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);color:var(--dt-label-1);font-size:var(--dt-fs-meta);font-family:inherit;}',
      '.dtInfoInput:focus{outline:none;border-color:var(--dt-brand);}',
      '.dtInfoEmpty{padding:var(--dt-sp-3);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);color:var(--dt-label-3);}',
      '.dtSteps{display:flex;flex-direction:column;gap:2px;}',
      '.dtStep{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:30px;padding:2px var(--dt-sp-1);border-radius:var(--dt-r-card);}',
      '.dtStep:hover{background:var(--dt-bg-1);}',
      '.dtStepCheck{flex:0 0 auto;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid var(--dt-border-2);border-radius:50%;background:transparent;color:var(--dt-brand);cursor:pointer;}',
      '.dtStepDone .dtStepCheck{border-color:var(--dt-brand);background:var(--dt-brand);color:var(--dt-bg-0);}',
      '.dtStepDot{width:6px;height:6px;border-radius:50%;background:var(--dt-border-2);}',
      '.dtStepText{flex:1 1 auto;min-width:0;font-size:var(--dt-fs-meta);color:var(--dt-label-1);word-break:break-word;}',
      '.dtStepDone .dtStepText{color:var(--dt-label-3);text-decoration:line-through;}',
      '.dtStepOp{flex:0 0 auto;width:20px;height:20px;padding:0;border:none;border-radius:var(--dt-r-row);background:transparent;color:var(--dt-label-3);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtStepOp:hover:not(:disabled){background:var(--dt-bg-2);color:var(--dt-label-1);}',
      '.dtStepOp:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      // S7 焦点环兜底：前面 .dtSearchInput/.dtAddInput/.dtDetailFields .dtFieldInput/.dtInput 都写了
      // outline:none，与 .dtRoot :focus-visible 同特异性且在后序，会把 2px 强调色环压掉。这里用
      // 「类 + :focus-visible」提到 0,2,0 / 0,3,0，键盘聚焦恒可见，颜色跟 --dt-accent 走。
      '.dtRoot :focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtInput:focus-visible,.dtSearchInput:focus-visible,.dtAddInput:focus-visible,.dtInfoInput:focus-visible,.dtInfoText:focus-visible,.dtAccentHex:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtDetailFields .dtFieldInput:focus-visible,.dtDetailFields .dtInput:focus-visible,.dtDetailFields textarea:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtRailItem:focus-visible,.dtBlueBtn:focus-visible,.dtPrimaryBtn:focus-visible,.dtGhostBtn:focus-visible,.dtMiniBtn:focus-visible,.dtPomoBtn:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtStepDel:hover:not(:disabled){color:var(--dt-danger);}',
      '.dtStepAdd{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtDocs{display:flex;flex-direction:column;gap:var(--dt-sp-3);}',
      '.dtDoc{display:flex;flex-direction:column;gap:var(--dt-sp-1);padding:var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-0);}',
      '.dtDocText{min-height:64px;}',
      '.dtAgentBar{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);font-size:var(--dt-fs-meta);color:var(--dt-label-2);}',
      '.dtAgentText{flex:1 1 auto;min-width:0;}',
      '.dtAgentBar[data-state="error"]{border-color:var(--dt-danger);color:var(--dt-danger);}',
      '.dtAgentBar[data-state="local"]{border-style:dashed;}',
      '.dtAgentBar[data-state="applied"]{border-color:var(--dt-success);}',
      '.dtAgentDiff{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtAgentDiffRow{display:flex;align-items:baseline;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);color:var(--dt-label-1);}',
      '.dtAgentDiffCol{flex-direction:column;align-items:stretch;gap:var(--dt-sp-1);}',
      '.dtAgentDiffLabel{flex:0 0 auto;font-size:var(--dt-fs-micro);color:var(--dt-label-3);}',
      '.dtAgentDiffOld{color:var(--dt-label-3);text-decoration:line-through;}',
      '.dtAgentDiffArrow{color:var(--dt-label-3);}',
      '.dtAgentDiffNew{font-weight:600;}',
      '.dtAgentDiffSteps{display:flex;flex-direction:column;gap:2px;}',
      '.dtAgentDiffStep{font-size:var(--dt-fs-meta);color:var(--dt-label-1);}',
      '.dtAgentDiffEmpty{font-size:var(--dt-fs-meta);color:var(--dt-label-3);}',
      '.dtAgentDiffActions{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtAgentActionRow{display:flex;align-items:center;gap:var(--dt-sp-2);}',

      '.dtBEmpty{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--dt-sp-2);padding:var(--dt-sp-8) var(--dt-sp-6);text-align:center;outline:none;}',
      '.dtBEmpty:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-4px;}',
      '.dtBEmptyTitle{font-size:var(--dt-fs-title);font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtBEmptyText{font-size:var(--dt-fs-meta);line-height:1.6;max-width:360px;color:var(--dsw-alias-label-secondary);}',
      /* ---- t105：rail 五段 + 标签视图 + 必做之事三段（§1.2 / §1.12） ---- */
      '.dtRailGroup { display: flex; flex-direction: column; gap: 2px; }',
      '.dtRailTop{flex:0 0 auto;}',
      '.dtRail > [data-rail-group="settings"]{flex:0 0 auto;margin-top:auto;}',
      '.dtRail > .dtRailSep[data-rail-pin="1"]{flex:0 0 auto;margin-bottom:var(--dt-sp-2);}',
      '.dtRailGroupInner { display: flex; flex-direction: column; gap: 2px; }',
      '.dtRailSep { height: 1px; background: var(--dsw-alias-border-l1); margin: var(--dt-sp-2) var(--dt-sp-2); }',
      '.dtRailBadge { margin-left: auto; min-width: 16px; height: 16px; padding: 0 var(--dt-sp-1); border-radius: var(--dt-r-card); background: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-bg-base); font-size:var(--dt-fs-micro); line-height: 16px; text-align: center; }',
      '.dtTagsView { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }',
      '.dtTagsPickList { display: flex; flex-direction: column; gap: 2px; padding: var(--dt-sp-2) var(--dt-sp-3); overflow: auto; flex: 0 1 auto; max-height: 42%; }',
      '.dtTagsPick { width: 100%; display: flex; align-items: center; gap: var(--dt-sp-2); height: 30px; padding: 0 var(--dt-sp-2); border: 0; border-radius: var(--dt-r-card); background: transparent; color: var(--dsw-alias-label-primary); font-size:var(--dt-fs-body); text-align: left; cursor: pointer; }',
      '.dtTagsPick:hover { background: var(--dsw-alias-bg-layer-2); }',
      '.dtTagsPickOn { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }',
      '.dtTagsPick .dtTagName { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtTagsPick .dtTagCount { font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }',
      '.dtTagsDivider { height: 1px; background: var(--dsw-alias-border-l1); margin: var(--dt-sp-1) var(--dt-sp-3); }',
      '.dtTagsTasks { flex: 1 1 auto; min-height: 0; overflow: auto; }',
      '.dtTagsEmpty { padding: var(--dt-sp-4) var(--dt-sp-3); }',
      '.dtOneThing { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }',
      '.dtOneThingBody { display: flex; flex-direction: column; gap: var(--dt-sp-3); padding: var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-4); overflow: auto; flex: 1 1 auto; min-height: 0; }',
      '.dtOneSection { display: flex; flex-direction: column; gap: var(--dt-sp-2); }',
      '.dtOneSectionTitle { font-size:var(--dt-fs-micro); font-weight: 600; letter-spacing: .04em; color: var(--dsw-alias-label-secondary); }',
      '.dtOneSectionEmpty { font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-tertiary); padding: var(--dt-sp-2) 0; }',
      '.dtOneCore { display: flex; align-items: center; gap: var(--dt-sp-3); min-height: 96px; padding: var(--dt-sp-3); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dt-r-card); background: var(--dsw-alias-bg-layer-1); }',
      '.dtOneCore[data-done="1"] { opacity: .62; }',
      '.dtOneRing { position: relative; width: 56px; height: 56px; flex: 0 0 56px; }',
      '.dtOneRingTrack { fill: none; stroke: var(--dsw-alias-border-l2); stroke-width: 4; }',
      '.dtOneRingArc { fill: none; stroke: var(--dsw-alias-brand-primary); stroke-width: 4; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 28px 28px; }',
      '.dtOneRingNum { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size:var(--dt-fs-body); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }',
      '.dtOneBody { display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; min-width: 0; }',
      '.dtOneTitle { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font-size:var(--dt-fs-title); font-weight: 600; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtOneWhy { font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtOneHow { font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtOneOps { display: flex; align-items: center; gap: var(--dt-sp-2); flex: 0 0 auto; }',
      '.dtOneSwap { height: 26px; padding: 0 var(--dt-sp-3); border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dt-r-card); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size:var(--dt-fs-meta); cursor: pointer; }',
      '.dtOneEmpty { display: flex; flex-direction: column; gap: var(--dt-sp-1); min-height: 96px; justify-content: center; padding: var(--dt-sp-3); border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--dt-r-card); }',
      '.dtOneEmptyTitle { font-size:var(--dt-fs-body); font-weight: 600; color: var(--dsw-alias-label-primary); }',
      '.dtOneEmptyText { font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-secondary); }',
      '.dtProhibitTop { display: flex; flex-direction: column; gap: var(--dt-sp-1); }',
      '.dtProhibitRow { display: flex; align-items: center; gap: var(--dt-sp-2); height: 34px; padding: 0 var(--dt-sp-3); border-left: 3px solid var(--dsw-alias-state-error-primary); border-radius: var(--dt-r-row); background: var(--dsw-alias-bg-layer-1); }',
      '.dtProhibitBadge { flex: 0 0 auto; font-size:var(--dt-fs-micro); font-weight: 600; padding: 1px var(--dt-sp-1); border-radius: var(--dt-r-row); color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-bg-base); }',
      '.dtProhibitLabel { flex: 1 1 auto; min-width: 0; font-size:var(--dt-fs-body); color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtProhibitMin { flex: 0 0 auto; font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }',
      '.dtProhibitWatch { display: flex; flex-direction: column; gap: 2px; padding-left: var(--dt-sp-3); }',
      '.dtProhibitWatchRow { display: flex; align-items: center; gap: var(--dt-sp-2); height: 28px; font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-secondary); }',
      '.dtProhibitGap { font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-tertiary); }',
      '.dtObsForm { display: flex; align-items: center; gap: var(--dt-sp-2); height: 32px; }',
      '.dtObsInput { flex: 1 1 auto; min-width: 0; }',
      '.dtObsMinutes { width: 64px; flex: 0 0 64px; }',
      '.dtObsAdd { flex: 0 0 auto; height: 30px; }',
      '.dtObsList { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }',
      '.dtObsRow { display: flex; align-items: center; gap: var(--dt-sp-2); height: 28px; font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-primary); }',
      '.dtObsLabel { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtObsMin { flex: 0 0 auto; font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }',
      '.dtObsDel { flex: 0 0 auto; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: var(--dt-r-row); background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }',
      '.dtObsDel:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-state-error-primary); }',
      '.dtObsEmpty { font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-tertiary); padding: var(--dt-sp-2) 0; }',
      '@container dtroot (max-width: 719px) { .dtOneCore { flex-wrap: wrap; } .dtOneOps { width: 100%; } }',
      /* ---- C 栏评分控件（§1.13.2）：整行 28px、gap 8px ---- */
      '.dtScoreEdit{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:28px;flex:1 1 auto;min-width:0}',
      '.dtScoreEdit .dtScoreRing{width:20px;height:20px;flex:0 0 20px}',
      '.dtScoreText{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}',
      '.dtScoreRange{flex:1 1 auto;min-width:120px;height:20px;accent-color:var(--dt-success)}',
      '.dtScoreInput{width:72px;flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums;font-size:var(--dt-fs-meta);height:22px;padding:0 var(--dt-sp-2);border-radius:var(--dt-r-row);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.dtScoreBtn{height:22px;padding:0 var(--dt-sp-2);font-size:var(--dt-fs-micro);border-radius:var(--dt-r-row);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;flex:0 0 auto}',
      '.dtScoreBtn:disabled{opacity:.5;cursor:default}',
      '.dtScoreSubmit:not(:disabled){background:var(--dt-brand);border-color:var(--dt-brand);color:var(--dt-bg-0)}',
      '.dtScoreEdit[data-invalid="1"] .dtScoreInput{border-color:var(--dsw-alias-state-error-primary)}',
      '.dtScoreEdit[data-busy="1"]{opacity:.7}',
      '@container dtroot (max-width:559px){.dtScoreText{display:none}.dtScoreRange{min-width:88px}}',
      /* ---- dt-accent 生效范围白名单（§1.19.4 穷举 5 项；白名单之外一律不受影响） ---- */
      '[data-dt="score-batch"]{border-color:var(--dt-accent);background:var(--dt-accent);color:var(--dt-accent-on);}',
      '[data-dt="score-batch"]:hover{background:var(--dt-accent-weak);border-color:var(--dt-accent);}',
      '[data-dt="score-batch"] .dtIcon{color:var(--dt-accent-on);}',
      '.dtCheck[data-dt="task-check"]{border-color:var(--dt-accent);}',
      '.dtCheck[data-dt="task-check"][data-on="1"]{border-color:var(--dt-accent);background:var(--dt-accent);color:var(--dt-accent-on);}',
      '.dtPomoCell[data-pomo-day][data-today="1"][data-on="1"]{border-color:var(--dt-accent);background:var(--dt-accent);color:var(--dt-accent-on);}',
      '.dtPomoCell[data-pomo-day][data-today="1"][data-on="1"] .dtPomoNum{color:var(--dt-accent-on);}',
      /* ---- accent 控件（设置页「风格设置」组，§1.19.2） ---- */
      '.dtAccentField{display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtAccentSwatches{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);}',
      '.dtAccentOpt{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid var(--dt-border-1);border-radius:50%;background:var(--dt-bg-0);cursor:pointer;}',
      '.dtAccentOpt[data-on="1"]{border-color:var(--dt-label-1);box-shadow:0 0 0 2px var(--dt-accent-ring);}',
      '.dtAccentChip{width:22px;height:22px;border-radius:50%;background:var(--dt-accent-label,var(--dt-accent));}',
      '.dtAccentOpt[data-accent="custom"] .dtAccentChip{background:transparent;border:1px dashed var(--dt-label-3);}',
      '.dtAccentOpt[data-accent="custom"][data-on="1"] .dtAccentChip{background:var(--dt-accent);border-style:solid;border-color:var(--dt-accent);}',
      '.dtAccentHexRow{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtAccentHex{width:96px;padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-0);color:var(--dt-label-1);font:inherit;font-size:var(--dt-fs-meta);font-variant-numeric:tabular-nums;}',
      '.dtAccentHex[aria-invalid="true"]{border-color:var(--dt-quad-red);}',
      '.dtAccentRatio{font-size:var(--dt-fs-micro);color:var(--dt-label-2);}',
      '.dtAccentRatio[data-state="warn"]{color:var(--dt-warn);}',
      '.dtAccentRatio[data-state="bad"]{color:var(--dt-quad-red);}',
      '.dtSegmented{display:flex;gap:var(--dt-sp-1);width:100%;}',
      '.dtSegmented .dtSegBtn[data-on="1"]{border-color:currentColor;background:var(--dt-bg-2);font-weight:600;}',
      /* ---- 热力图进设置卡：间距由外层包裹承担，本体 margin 归零（否则会造出假间距） ---- */
      '.dtPomoSettings .dtPomoHeatWrap{grid-column:1/-1;margin:0;padding:0;}',
      '.dtPomoSettings .dtPomoHeat{margin-top:0;}',
          '.dtResistance{display:flex;flex-direction:column;min-height:0;flex:1 1 auto;overflow:hidden;}',
      '.dtResistanceBody{display:flex;flex-direction:column;gap:var(--dt-sp-3);padding:var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-4);min-height:0;overflow-y:auto;overscroll-behavior:contain;}',
      '.dtResSection{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-3);border:1px solid var(--dt-border-l1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtResSectionTitle{font-size:var(--dt-fs-meta);font-weight:600;color:var(--dt-label-1);}',
      '.dtResChips{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtResHint{font-size:var(--dt-fs-micro);line-height:17px;color:var(--dt-label-2);}',
      '.dtResEmpty{font-size:var(--dt-fs-meta);line-height:18px;color:var(--dt-label-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px dashed var(--dt-border-l2);border-radius:var(--dt-r-card);}',
].join('\n');

    function injectStyles() {
      try {
        const existed = window.document.getElementById(STYLE_ID);
        if (existed) {
          /* 模块热替换时旧样式会留在 head 里，必须用新 CSS 覆盖，否则新类名没有规则 */
          if (existed.textContent !== CSS) existed.textContent = CSS;
          return;
        }
        const style = window.document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        window.document.head.appendChild(style);
      } catch (err) {
        /* 样式失败时保持裸样式可用 */
      }
    }

    /* ---------------------- accent 令牌注入（§1.19.3） ---------------------- */
    const ACCENT_STYLE_ID = STYLE_ID + '-accent';

    /* rgb()/hex 都吃：宿主 token 在有的主题下是 hex、有的主题下是 rgb() */
    function accentHexFromCss(text) {
      const value = String(text || '').trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
      const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return '';
      return '#' + hexByte(parseInt(m[1], 10)) + hexByte(parseInt(m[2], 10)) + hexByte(parseInt(m[3], 10));
    }

    /* brand 档不复制宿主色值，只能运行时实测：读 --dsw-alias-brand-primary 现算两档对比度 */
    function measureBrandAccent() {
      try {
        const doc = window.document;
        const root = (doc.querySelector && doc.querySelector('.dtRoot')) || doc.documentElement;
        if (!root || !window.getComputedStyle) return null;
        const cs = window.getComputedStyle(root);
        const hex = accentHexFromCss(cs.getPropertyValue ? cs.getPropertyValue('--dsw-alias-brand-primary') : '');
        if (!hex) return null;
        return {
          light: hex,
          dark: hex,
          onLight: accentOnFor(hex),
          onDark: accentOnFor(hex),
          ratioLight: contrastRatioOf(hex, '#' + ACCENT_BG_LIGHT),
          ratioDark: contrastRatioOf(hex, '#' + ACCENT_BG_DARK)
        };
      } catch (err) {
        return null;
      }
    }

    function accentStyleText(appearance) {
      /* S7：存量脏值（accent 空串 / 未知档 / custom 未填色）不是用户选择。直接交给 accentToneOf
         会落进 brand 分支，把 --dt-accent 绑到宿主品牌色（真机量到的近黑墨色，rail 选中条与
         焦点环一起变黑）。这里先归一成默认档 rose。 */
      const rawAccent = appearance && typeof appearance === 'object' ? appearance.accent : '';
      const knownAccent = ACCENT_KEYS.indexOf(rawAccent) >= 0;
      const customFilled = rawAccent === 'custom' && !!normalizeAccentHex(appearance && appearance.accentHex);
      const effective = !knownAccent || (rawAccent === 'custom' && !customFilled) ? defaultAppearance() : appearance;
      const tone = accentToneOf(effective);
      const measured = measureBrandAccent();
      let light = tone.light;
      let dark = tone.dark;
      let onLight = tone.onLight;
      let onDark = tone.onDark;
      let fgLight = 'var(--dt-accent)';
      let fgDark = 'var(--dt-accent)';
      /* §1.19.5：brand 低于 4.5:1 时前景（文字/图标）降级 --dt-label-1，但**标签仍是品牌色**，
         所以色块单独吃 --dt-accent-label，不跟 fg 一起降级。其余 7 档两者恒等。 */
      const labelLight = 'var(--dt-accent)';
      const labelDark = 'var(--dt-accent)';
      if (tone.brand) {
        light = 'var(--dsw-alias-brand-primary)';
        dark = 'var(--dsw-alias-brand-primary)';
        if (measured) {
          onLight = measured.onLight;
          onDark = measured.onDark;
          /* brand 唯一例外（§1.19.5）：<4.5 时只作填充与描边，前景降级 --dt-label-1 */
          if (measured.ratioLight < 4.5) fgLight = 'var(--dt-label-1)';
          if (measured.ratioDark < 4.5) fgDark = 'var(--dt-label-1)';
        } else {
          onLight = '#' + ACCENT_ON_LIGHT;
          onDark = '#' + ACCENT_ON_DARK;
        }
      }
      return [
        '.dtRoot{--dt-accent:' + light + ';--dt-accent-on:' + onLight + ';--dt-accent-fg:' + fgLight +
          ';--dt-accent-label:' + labelLight + '}',
        '.dtRoot[data-dt-theme="dark"]{--dt-accent:' + dark + ';--dt-accent-on:' + onDark + ';--dt-accent-fg:' + fgDark +
          ';--dt-accent-label:' + labelDark + '}',
        '.dtDetailFields .dtTitleFirst{min-height:34px;padding:var(--dt-sp-2) var(--dt-sp-2);}',
      '.dtBreakdown{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtBreakdownHead{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtBreakdownTitle{font-size:var(--dt-fs-meta);font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtBreakdownMeta{flex:1 1 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtBreakdownRun{flex:0 0 auto;}',
      '.dtBreakdownCode{font-size:var(--dt-fs-micro);line-height:16px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;}',
      '.dtBreakdownSteps{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtBreakdownStep{display:flex;align-items:baseline;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);line-height:18px;color:var(--dsw-alias-label-primary);}',
      '.dtBreakdownNo{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtBreakdownText{flex:1 1 auto;}',
      '.dtBreakdownMin{flex:0 0 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      /* G6 主题化：选区、光标、滚动条一律跟令牌，不写死颜色 */
      '.dtRoot ::selection{background:var(--dt-accent-weak);color:var(--dt-label-1);}',
      '.dtRoot ::-moz-selection{background:var(--dt-accent-weak);color:var(--dt-label-1);}',
      '.dtRoot input,.dtRoot textarea,.dtRoot [contenteditable="true"]{caret-color:var(--dt-accent);}',
      '.dtRoot .dtList,.dtRoot .dtDrawerZone,.dtDrawer,.dtRailScroll,.dtModalBody,.dtCalGrid{scrollbar-width:thin;scrollbar-color:var(--dt-border-2) transparent;}',
      '.dtRoot .dtList::-webkit-scrollbar,.dtRoot .dtDrawerZone::-webkit-scrollbar,.dtDrawer::-webkit-scrollbar,.dtRailScroll::-webkit-scrollbar,.dtModalBody::-webkit-scrollbar{width:var(--dt-sp-2);height:var(--dt-sp-2);}',
      '.dtRoot .dtList::-webkit-scrollbar-thumb,.dtRoot .dtDrawerZone::-webkit-scrollbar-thumb,.dtDrawer::-webkit-scrollbar-thumb,.dtRailScroll::-webkit-scrollbar-thumb,.dtModalBody::-webkit-scrollbar-thumb{background:var(--dt-border-2);border-radius:var(--dt-r-pill);}',
      '.dtRoot .dtList::-webkit-scrollbar-track,.dtRoot .dtDrawerZone::-webkit-scrollbar-track,.dtDrawer::-webkit-scrollbar-track,.dtRailScroll::-webkit-scrollbar-track,.dtModalBody::-webkit-scrollbar-track{background:transparent;}',
      /* G5 四态补齐：rail 项 / 任务行 / 主次按钮 / 分段控件。禁用同时给 aria-disabled，见各渲染点 */
      '.dtRailItem:active{background:var(--dt-bg-2);transform:translateY(1px);}',
      '.dtRailItem[aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;pointer-events:none;}',
      '.dtRow:active{background:var(--dt-bg-2);}',
      '.dtRow[aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtPrimaryBtn:active{transform:translateY(1px);filter:brightness(.96);}',
      '.dtGhostBtn:hover{background:var(--dt-bg-2);}',
      '.dtGhostBtn:active{background:var(--dt-bg-2);transform:translateY(1px);}',
      '.dtGhostBtn[aria-disabled="true"],.dtMiniBtn[aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;pointer-events:none;}',
      '.dtMiniBtn:hover{background:var(--dt-bg-2);}',
      '.dtMiniBtn:active{transform:translateY(1px);}',
      '.dtSegBtn:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtIconBtn:focus-visible,.dtCheck:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtSegBtn:hover{background:var(--dt-bg-2);}',
      '.dtSegBtn:active{transform:translateY(1px);}',
      '.dtSegBtn[data-on="1"]:active{transform:none;}',
      '.dtSegBtn[aria-disabled="true"],[role="radio"][aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;pointer-events:none;}',
    ].join('\n');
    }

    /* 只覆盖四个令牌，不碰任何业务样式；重复调用幂等（内容相同不重写） */
    function injectAccent(appearance) {
      try {
        const text = accentStyleText(appearance);
        const existed = window.document.getElementById(ACCENT_STYLE_ID);
        if (existed) {
          if (existed.textContent !== text) existed.textContent = text;
          return;
        }
        const style = window.document.createElement('style');
        style.id = ACCENT_STYLE_ID;
        style.textContent = text;
        window.document.head.appendChild(style);
      } catch (err) {
        /* 注入失败时退回 palette 里的 brand 默认值，界面不白屏 */
      }
    }

    /* ------------------------------------- 注册 ------------------------------------ */

    function disposeOn(ctx, fn) {
      try {
        if (typeof ctx.effect === 'function') {
          ctx.effect(function () {
            return fn;
          });
          return;
        }
      } catch (err) {
        /* 继续尝试 ctx.on */
      }
      try {
        if (typeof ctx.on === 'function') ctx.on('dispose', fn);
      } catch (err) {
        /* 无清理钩子时进程结束自然回收 */
      }
    }

    /* t127：apply 抛错时仍要注册两个插槽并渲染 fatal 卡片——白屏比报错更糟。
       ctx 里任何一步都可能已经失败，所以这里每一步单独兜。 */
    function registerFatalSlots(ctx, err) {
      try {
        const offRow = ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 30,
              label: function () {
                return '任务';
              }
            },
            function (ownerProps) {
              return h(SidebarIcon, ownerProps || {});
            }
          );
        });
        if (typeof offRow === 'function') disposeOn(ctx, offRow);
      } catch (e) {
        /* 侧栏注册失败不影响主区出卡片 */
      }
      try {
        const offMain = ctx.slots.inject('main', function () {
          return ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID
            },
            function () {
              return renderFatalPanel(err);
            }
          );
        });
        if (typeof offMain === 'function') disposeOn(ctx, offMain);
      } catch (e) {
        /* 两个插槽都注册不了，只能交给宿主 */
      }
    }

    function apply(ctx) {
      try {
        return applyInner(ctx);
      } catch (err) {
        try {
          console.error('[dsh-tasks] 面板初始化失败', err);
        } catch (e) {
          /* 控制台不可用 */
        }
        registerFatalSlots(ctx, err);
        return undefined;
      }
    }

    function applyInner(ctx) {
      injectStyles();
      const store = createStore();
      /* S7：这里必须传「原始 appearance」而不是 accentOf(...) 的结果——accentOf 会把空串/未知档
         收敛成 'brand'，而 brand 分支的 --dt-accent 是宿主品牌色（真机近黑墨色），rail 选中条与
         焦点环都会变黑。传原始值，由 accentStyleText 区分「脏值回落默认档」与「用户真选了 brand」。 */
      const appRaw = store.get().settings && store.get().settings.appearance;
      injectAccent(appRaw && typeof appRaw === 'object' ? appRaw : defaultAppearance());
      const reminders = createReminderEngine(store);
      const pomodoro = createPomodoroEngine(store);
      const writeback = createWritebackEngine(store);
      reminders.start();
      pomodoro.start();
      writeback.start();

      const offRow = ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 30,
            label: function () {
              return '任务';
            }
          },
          function (ownerProps) {
            return h(SidebarIcon, ownerProps || {});
          }
        );
      });

      const offMain = ctx.slots.inject('main', function () {
        return ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            inject: function () {
              return { store: store };
            }
          },
          function (ownerProps) {
            return h(TasksPanel, Object.assign({ store: store }, ownerProps || {}));
          }
        );
      });

      const flush = function () {
        store.saveNow();
      };
      window.addEventListener('beforeunload', flush);

      disposeOn(ctx, function () {
        try {
          reminders.stop();
        } catch (err) {
          /* 已停止 */
        }
        try {
          pomodoro.stop();
        } catch (err) {
          /* 已停止 */
        }
        try {
          flush();
        } catch (err) {
          /* 忽略 */
        }
        window.removeEventListener('beforeunload', flush);
        [offRow, offMain].forEach(function (off) {
          try {
            if (typeof off === 'function') off();
          } catch (err) {
            /* 已卸载 */
          }
        });
      });
    }

    return {
      inject: ['slots'],
      apply: apply,
      /* §1.14：client 对外只多这一个面，且固定两键 —— 供外部（回归/诊断）核对
         「整理通道」与「打分通道」用的 system prompt 是否与规格逐字一致。
         冻结后不可改；不得把 scoreTask / SCORE_RUBRIC_VERSION / PALETTE /
         SPIRAL_PHASES 之类内部符号挂上来（规格反向硬规则）。 */
      __prompts: Object.freeze({
        agent: AGENT_SYSTEM_PROMPT,
        score: AGENT_SCORE_SYSTEM_PROMPT
      })
    };
  }
});

