
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
