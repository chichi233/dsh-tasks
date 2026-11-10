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
