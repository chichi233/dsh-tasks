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
