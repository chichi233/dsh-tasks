
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
