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
