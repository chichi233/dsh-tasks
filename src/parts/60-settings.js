
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
