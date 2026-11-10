
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
