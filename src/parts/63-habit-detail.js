
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
