
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
