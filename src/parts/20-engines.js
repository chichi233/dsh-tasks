
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
