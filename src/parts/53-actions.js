    /* ============================== 53-actions · 写入唯一入口 ==============================
       §3.6 的 18 个 action + actionSetSetting。

       统一契约：
       · 全部同步返回（绝不返回 Promise），先校验后改；
       · 成功 → { ok:true, changed:['tasks'|'projects'|...] }（按需带 id / id 列表）；
       · 失败 → { ok:false, code, message }，此时库内一个字节都不许动；
       · 成功路径统一把 db.meta.updatedAt 设成 Date.now()，其它地方不许碰这个字段；
       · 每次写成功都要 invalidateDbIndex()（§3.4 第一条）。

       白名单 FIELD_DENIED 的字段集：18 个既有字段 + P0 新增的 detailNote / steps / docs，
       外加只读派生字段（id / createdAt / completedAt 走专用 action，不允许 patchTask 直改）。 */

    const TASK_PATCHABLE = [
      'title', 'content', 'projectId', 'priority', 'status', 'deleted', 'date', 'allDay',
      'remindAt', 'tags', 'repeat', 'rruleRaw', 'parentId', 'quadOverride', 'pinToday',
      'notifiedAt', 'detailNote'
    ];
    const TASK_NOTE_MAX = 8000;
    const TASK_DOC_TEXT_MAX = 20000;
    const STEP_ORDER_STEP = 10;

    function actionOk(changed, extra) {
      return Object.assign({ ok: true, changed: changed || [] }, extra || {});
    }

    function actionFail(code, message) {
      return { ok: false, code: code, message: message };
    }

    function touchDbMeta(db) {
      const meta = Object.assign(defaultDbMeta(), isPlainObject(db.meta) ? db.meta : {});
      meta.updatedAt = Date.now();
      meta.schemaVersion = DB_SCHEMA_VERSION;
      return Object.assign({}, db, { meta: meta });
    }

    /* 所有写 action 都走这一个出口：拿 db 快照 → 改 → 提交。mutator 返回新 db 或 null（表示放弃）。 */
    function commitDb(store, changed, mutator) {
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const nextDb = mutator(db);
      if (!nextDb) return actionFail('NO_CHANGE', '没有可提交的改动');
      const committed = touchDbMeta(nextDb);
      store.update(function (prev) {
        return adoptShards(Object.assign({}, prev, { db: committed }));
      });
      invalidateDbIndex();
      return actionOk(changed);
    }

    function findTask(db, id) {
      if (!id) return null;
      const index = getDbIndex(db);
      return index.byId[id] || null;
    }

    function replaceTask(db, id, patch) {
      const tasks = (Array.isArray(db.tasks) ? db.tasks : []).map(function (task) {
        if (!task || task.id !== id) return task;
        return Object.assign({}, task, patch);
      });
      return Object.assign({}, db, { tasks: tasks });
    }

    /* ------------------------------------ 任务增删改 ------------------------------------ */
    function actionAddTask(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const title = typeof fields.title === 'string' ? fields.title.trim() : '';
      if (!title) return actionFail('FIELD_REQUIRED', '任务标题不能为空');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const projectId = typeof fields.projectId === 'string' && fields.projectId
        ? fields.projectId
        : (state.settings && state.settings.defaultProject) || '';
      const task = normalizeTask({
        id: uid('task'),
        projectId: projectId,
        title: title,
        priority: fields.priority | 0,
        date: typeof fields.date === 'string' ? fields.date : '',
        status: 0,
        deleted: false,
        createdAt: new Date().toISOString(),
        steps: Array.isArray(fields.steps) ? fields.steps.slice() : []
      });
      const next = Object.assign({}, db, { tasks: [task].concat(db.tasks || []) });
      const result = commitDb(store, ['tasks'], function () {
        return next;
      });
      if (!result.ok) return result;
      return Object.assign(result, { id: task.id });
    }

    function actionPatchTask(store, id, patch) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      if (!isPlainObject(patch)) return actionFail('FIELD_REQUIRED', 'patch 必须是对象');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const task = findTask(db, id);
      if (!task) return actionFail('NOT_FOUND', '任务不存在：' + id);
      const clean = {};
      const denied = [];
      Object.keys(patch).forEach(function (key) {
        if (TASK_PATCHABLE.indexOf(key) >= 0) clean[key] = patch[key];
        else denied.push(key);
      });
      if (denied.length) return actionFail('FIELD_DENIED', '不允许改动的字段：' + denied.join(', '));
      if (Object.prototype.hasOwnProperty.call(clean, 'title')) {
        const title = typeof clean.title === 'string' ? clean.title.trim() : '';
        if (!title) return actionFail('FIELD_REQUIRED', '任务标题不能为空');
        clean.title = title;
      }
      if (Object.prototype.hasOwnProperty.call(clean, 'detailNote')) {
        clean.detailNote = typeof clean.detailNote === 'string' ? clean.detailNote.slice(0, TASK_NOTE_MAX) : '';
      }
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, id, clean);
      });
    }

    function actionCompleteTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const task = findTask(db, id);
      if (!task) return actionFail('NOT_FOUND', '任务不存在：' + id);
      if (task.status === 2) return actionFail('NO_CHANGE', '任务已完成');
      completeTask(store, id);
      enqueueWriteback(store, id, task.projectId);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionUncompleteTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const task = findTask(db, id);
      if (!task) return actionFail('NOT_FOUND', '任务不存在：' + id);
      if (task.status !== 2) return actionFail('NO_CHANGE', '任务未完成');
      uncompleteTask(store, id);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionDeleteTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, id)) return actionFail('NOT_FOUND', '任务不存在：' + id);
      deleteTask(store, id);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionRestoreTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, id)) return actionFail('NOT_FOUND', '任务不存在：' + id);
      restoreTask(store, id);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionPurgeTask(store, id) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, id)) return actionFail('NOT_FOUND', '任务不存在：' + id);
      destroyTask(store, id);
      invalidateDbIndex();
      return actionOk(['tasks'], { id: id });
    }

    function actionSetTaskNote(store, id, text) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const raw = typeof text === 'string' ? text : '';
      const truncated = raw.length > TASK_NOTE_MAX;
      const result = actionPatchTask(store, id, { detailNote: raw.slice(0, TASK_NOTE_MAX) });
      if (!result.ok) return result;
      return truncated ? Object.assign(result, { code: 'TRUNCATED', message: '备注超过 8000 字，已截断' }) : result;
    }

    /* ------------------------------------ 步骤（steps） ------------------------------------ */
    function normalizeSteps(input) {
      const list = Array.isArray(input) ? input : [];
      return list.map(function (step, index) {
        const source = isPlainObject(step) ? step : {};
        return {
          id: typeof source.id === 'string' && source.id ? source.id : uid('step'),
          text: typeof source.text === 'string' ? source.text : '',
          done: !!source.done,
          order: typeof source.order === 'number' && isFinite(source.order) ? source.order : (index + 1) * STEP_ORDER_STEP
        };
      }).sort(function (a, b) {
        return a.order - b.order;
      }).map(function (step, index) {
        return Object.assign({}, step, { order: (index + 1) * STEP_ORDER_STEP });
      });
    }

    function stepsOf(db, id) {
      const task = findTask(db, id);
      return task && Array.isArray(task.steps) ? task.steps : [];
    }

    function actionAddStep(store, taskId, text) {
      if (!taskId) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const label = typeof text === 'string' ? text.trim() : '';
      if (!label) return actionFail('FIELD_REQUIRED', '步骤内容不能为空');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, taskId)) return actionFail('NOT_FOUND', '任务不存在：' + taskId);
      const steps = normalizeSteps(stepsOf(db, taskId).concat([{ text: label }]));
      const next = replaceTask(db, taskId, { steps: steps });
      const result = commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { steps: steps });
      });
      void next;
      if (!result.ok) return result;
      return Object.assign(result, { id: steps[steps.length - 1].id });
    }

    function actionPatchStep(store, taskId, stepId, patch) {
      if (!taskId || !stepId) return actionFail('FIELD_REQUIRED', '缺少任务或步骤 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      const steps = stepsOf(db, taskId);
      if (!steps.some(function (step) { return step.id === stepId; })) return actionFail('NOT_FOUND', '步骤不存在：' + stepId);
      const fields = isPlainObject(patch) ? patch : {};
      const nextSteps = steps.map(function (step) {
        if (step.id !== stepId) return step;
        const next = Object.assign({}, step);
        if (typeof fields.text === 'string') next.text = fields.text;
        if (fields.done !== undefined) next.done = !!fields.done;
        return next;
      });
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { steps: nextSteps });
      });
    }

    function actionRemoveStep(store, taskId, stepId) {
      if (!taskId || !stepId) return actionFail('FIELD_REQUIRED', '缺少任务或步骤 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      const steps = stepsOf(db, taskId);
      if (!steps.some(function (step) { return step.id === stepId; })) return actionFail('NOT_FOUND', '步骤不存在：' + stepId);
      const nextSteps = normalizeSteps(steps.filter(function (step) {
        return step.id !== stepId;
      }));
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { steps: nextSteps });
      });
    }

    function actionMoveStep(store, taskId, stepId, direction) {
      if (!taskId || !stepId) return actionFail('FIELD_REQUIRED', '缺少任务或步骤 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      const steps = normalizeSteps(stepsOf(db, taskId));
      const index = steps.findIndex(function (step) {
        return step.id === stepId;
      });
      if (index < 0) return actionFail('NOT_FOUND', '步骤不存在：' + stepId);
      const delta = direction === 'up' || direction === 'down' ? (direction === 'up' ? -1 : 1) : 0;
      const target = index + delta;
      if (!delta || target < 0 || target >= steps.length) return actionFail('NO_CHANGE', '该方向无法移动');
      const moved = steps.slice();
      const tmp = moved[index];
      moved[index] = moved[target];
      moved[target] = tmp;
      /* 交换后必须按**新位置**直接赋号：normalizeSteps 的语义是「先按 order 排序、再按位置重排序号」，
         把交换结果再交给它，它会按旧 order 排回去，移位等于没做（静默 NO_CHANGE）。
         id / text / done 原样保留，order 重新连续成 10/20/30…
         （captain 授权的越界一行修复，t55 报告里有改前/改后与五方向探针证据） */
      const reordered = moved.map(function (step, current) {
        return Object.assign({}, step, { order: (current + 1) * STEP_ORDER_STEP });
      });
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { steps: reordered });
      });
    }

    /* ------------------------------------ 文档（docs） ------------------------------------ */
    function actionSetTaskDocs(store, taskId, docs) {
      if (!taskId) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, taskId)) return actionFail('NOT_FOUND', '任务不存在：' + taskId);
      const list = (Array.isArray(docs) ? docs : []).map(function (doc) {
        const source = isPlainObject(doc) ? doc : {};
        return {
          id: typeof source.id === 'string' && source.id ? source.id : uid('doc'),
          title: typeof source.title === 'string' ? source.title : '',
          text: typeof source.text === 'string' ? source.text.slice(0, TASK_DOC_TEXT_MAX) : ''
        };
      });
      return commitDb(store, ['tasks'], function (current) {
        return replaceTask(current, taskId, { docs: list });
      });
    }

    /* -------------------------------------- 评分 --------------------------------------- */
    /* 写分数库的唯一入口。三条硬规则：
       1) 五字段齐（score/source/updatedAt/rubricVersion/reason）；
       2) 低优先级的来源不得覆盖高优先级：auto < agent < manual（§8.1），
          「自动批量打分不得覆盖 manual」由此自然成立；
       3) 被规则 2 挡下的条目计入 skipped，不静默丢弃。 */
    const SCORE_RANK = { auto: 1, agent: 2, manual: 3 };
    function writeScores(db, entries) {
      const scores = Object.assign({}, db.scores || {});
      const meta = Object.assign(defaultDbMeta(), db.meta || {});
      let written = 0;
      let skipped = 0;
      entries.forEach(function (entry) {
        const nextSource = entry.source === 'manual' || entry.source === 'agent' ? entry.source : 'auto';
        const existing = scores[entry.id];
        const existingRank = existing && SCORE_RANK[existing.source] ? SCORE_RANK[existing.source] : 0;
        /* 来源优先级保护：低来源不得覆盖高来源（自动分不能盖掉手动分）。
           entry.force 只给「重置为自动分」这一条路径用 —— 那是用户主动放弃手动分，
           不是自动流程在抢写，必须放行，否则重置永远写不进去。 */
        if (!entry.force && existingRank > SCORE_RANK[nextSource]) {
          skipped += 1;
          return;
        }
        scores[entry.id] = {
          score: Math.round(Math.max(0, Math.min(100, entry.score)) * 10) / 10,
          source: nextSource,
          origin: nextSource === 'auto' ? 'heuristic' : nextSource,
          updatedAt: Date.now(),
          reason: typeof entry.reason === 'string' && entry.reason ? entry.reason.slice(0, 40) : '批量打分',
          rubricVersion: typeof entry.rubricVersion === 'string' && entry.rubricVersion
            ? entry.rubricVersion
            : SCORE_RUBRIC_VERSION
        };
        written += 1;
      });
      meta.scoreVersion = (meta.scoreVersion | 0) + 1;
      return Object.assign({}, db, { scores: scores, meta: meta, scoreWrite: { written: written, skipped: skipped } });
    }

    function actionSetScore(store, id, input) {
      if (!id) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const fields = isPlainObject(input) ? input : {};
      if (typeof fields.score !== 'number' || !isFinite(fields.score)) return actionFail('FIELD_REQUIRED', 'score 必须是数字');
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      if (!findTask(db, id)) return actionFail('NOT_FOUND', '任务不存在：' + id);
      /* 改前快照必须在写之前取：writeScores 一落库，db.scores[id] 就是新值了（§8.5-②）。 */
      const before = scoreFeedbackBefore(db.scores && db.scores[id]);
      const result = commitDb(store, ['scores'], function (current) {
        return writeScores(current, [{ id: id, score: fields.score, source: fields.source, reason: fields.reason, rubricVersion: fields.rubricVersion, force: fields.force === true }]);
      });
      if (!result.ok) return result;
      /* 只有「用户手动改分」记账（§1.13.4 重置不写、§8.5-① 小改动也要写）。
         顺序是先写分、成功后才写反馈——写分失败时绝不能留下假记录。 */
      if (scoreSourceOf(fields.source) === 'manual') {
        actionRecordScoreFeedback(store, {
          taskId: id,
          before: before,
          after: Math.round(Math.max(0, Math.min(100, fields.score))),
          rubricVersion: fields.rubricVersion || SCORE_RUBRIC_VERSION
        });
      }
      return Object.assign(result, { id: id });
    }

    /* 评分反馈库的唯一写入口（stage4 §3.3.4 / §8.5）。
       三条硬约束：①其它 action 一律不许写 db.scoreFeedback；
       ②delta / coldStart / features 全在这里算，调用方只给 before 与 after；
       ③上限 500 按 at 淘汰最旧（写入后 splice(0, len-500)，不按 taskId 分组）。 */
    function actionRecordScoreFeedback(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const taskId = typeof fields.taskId === 'string' ? fields.taskId : '';
      if (!taskId) return actionFail('FIELD_REQUIRED', '缺少任务 id');
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const task = findTask(db, taskId);
      if (!task) return actionFail('NOT_FOUND', '任务不存在：' + taskId);
      const before = isPlainObject(fields.before) ? fields.before : scoreFeedbackBefore(null);
      const after = Math.round(Math.max(0, Math.min(100, Number(fields.after) || 0)));
      const at = Date.now();
      const list = Array.isArray(db.scoreFeedback) ? db.scoreFeedback : [];
      const record = {
        id: scoreFeedbackId(at, list),
        taskId: taskId,
        at: at,
        before: {
          score: typeof before.score === 'number' && isFinite(before.score) ? round1(before.score) : null,
          source: typeof before.source === 'string' && before.source ? before.source : 'none',
          origin: typeof before.origin === 'string' && before.origin ? before.origin : 'none'
        },
        after: after,
        delta: scoreFeedbackDelta(after, before),
        coldStart: !(isPlainObject(before) && typeof before.score === 'number' && isFinite(before.score)),
        features: scoreFeedbackFeatures(task, new Date()),
        rubricVersion: typeof fields.rubricVersion === 'string' && fields.rubricVersion ? fields.rubricVersion : SCORE_RUBRIC_VERSION,
        promptVersion: SCORE_FEEDBACK_PROMPT_VERSION
      };
      const result = commitDb(store, ['scoreFeedback'], function (current) {
        const rows = (Array.isArray(current.scoreFeedback) ? current.scoreFeedback : []).concat([record]);
        const kept = rows.length > SCORE_FEEDBACK_MAX ? rows.slice(rows.length - SCORE_FEEDBACK_MAX) : rows;
        return Object.assign({}, current, { scoreFeedback: kept });
      });
      if (!result.ok) return result;
      return Object.assign(result, { feedbackId: record.id });
    }

    function actionBulkScore(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const db = isPlainObject(store.get().db) ? store.get().db : defaultDb();
      const tasks = (Array.isArray(db.tasks) ? db.tasks : []).filter(function (task) {
        if (!task || task.deleted) return false;
        if (fields.projectId && task.projectId !== fields.projectId) return false;
        if (Array.isArray(fields.ids) && fields.ids.length) return fields.ids.indexOf(task.id) >= 0;
        return true;
      });
      const entries = [];
      let skipped = 0;
      tasks.forEach(function (task) {
        const score = spiralScoreOf(task, store.get());
        if (typeof score !== 'number' || !isFinite(score)) {
          skipped += 1;
          return;
        }
        entries.push({ id: task.id, score: score, source: 'auto', reason: '批量重算', rubricVersion: 1 });
      });
      if (!entries.length) return actionFail('NO_CHANGE', '没有可评分的任务');
      const result = commitDb(store, ['scores'], function (current) {
        return writeScores(current, entries);
      });
      if (!result.ok) return result;
      return Object.assign(result, { scored: entries.length, skipped: skipped });
    }

    /* ------------------------------------ 番茄 / 习惯 ------------------------------------ */
    function actionStartPomodoro(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const state = store.get();
      if (state.spiral && state.spiral.status !== 'idle') return actionFail('BUSY_SPIRAL', '螺旋工作法运行中');
      startPomodoro(store);
      if (fields.taskId) {
        store.update(function (prev) {
          return Object.assign({}, prev, { pomo: Object.assign({}, prev.pomo, { taskId: fields.taskId }) });
        });
      }
      return actionOk(['pomodoroLog'], { id: fields.taskId || '' });
    }

    function actionToggleHabit(store, habitId, day) {
      if (!habitId) return actionFail('FIELD_REQUIRED', '缺少习惯 id');
      const state = store.get();
      const habits = Array.isArray(state.habits) ? state.habits : [];
      if (!habits.some(function (habit) { return habit && habit.id === habitId; })) {
        return actionFail('NOT_FOUND', '习惯不存在：' + habitId);
      }
      toggleHabit(store, habitId, day);
      const next = store.get();
      store.update(function (prev) {
        return Object.assign({}, prev, { db: Object.assign({}, prev.db, { habitLog: buildHabitLog(prev.habits) }) });
      });
      invalidateDbIndex();
      void next;
      return actionOk(['habitLog'], { id: habitId });
    }

    /* ------------------------------------ 模块开关 / 设置 ------------------------------------ */
    function actionSetModule(store, id, input) {
      const module = moduleById(id);
      if (!module) return actionFail('NOT_FOUND', '模块不存在：' + id);
      if (id === 'settings') return actionFail('FIELD_DENIED', '设置模块不可隐藏');
      const fields = isPlainObject(input) ? input : {};
      let changed = false;
      store.update(function (prev) {
        const settings = migrateSettingsToV2(prev.settings);
        const modules = Object.assign(defaultModuleSettings(), settings.modules);
        if (fields.enabled !== undefined) {
          modules[id] = !!fields.enabled;
          changed = true;
        }
        if (typeof fields.order === 'number' && isFinite(fields.order)) {
          modules.order = Object.assign({}, modules.order);
          modules.order[id] = fields.order;
          changed = true;
        }
        if (!changed) return prev;
        return Object.assign({}, prev, { settings: Object.assign({}, settings, { modules: modules }) });
      });
      if (!changed) return actionFail('NO_CHANGE', '没有可提交的改动');
      return actionOk(['modules'], { id: id });
    }

    function actionSetSetting(store, patch) {
      if (!isPlainObject(patch)) return actionFail('FIELD_REQUIRED', 'patch 必须是对象');
      store.update(function (prev) {
        return Object.assign({}, prev, { settings: Object.assign({}, migrateSettingsToV2(prev.settings), patch) });
      });
      return actionOk(['settings']);
    }

    /* 排序/分组是全局一份的视图偏好（settings.tasks.sort），不是每栏各存一份；
       写它走 action，保证「改了就落盘 + 立即重渲染」而不是组件里闷头 setState。 */
    function actionSetTaskSort(store, sort) {
      const patch = isPlainObject(sort) ? sort : {};
      const nextSort = {
        key: typeof patch.key === 'string' && SORT_KEYS.indexOf(patch.key) >= 0 ? patch.key : 'smart',
        dir: patch.dir === 'desc' ? 'desc' : 'asc',
        group: typeof patch.group === 'string' && GROUP_KEYS.indexOf(patch.group) >= 0 ? patch.group : 'none'
      };
      store.update(function (prev) {
        const settings = migrateSettingsToV2(prev.settings);
        return Object.assign({}, prev, {
          settings: Object.assign({}, settings, {
            tasks: Object.assign({}, settings.tasks || {}, { sort: nextSort })
          })
        });
      });
      return actionOk(['settings.tasks.sort']);
    }

    /* 分数库种子迁移：一次性把 build 注入的 seed.scores 落进 db.scores。
       幂等靠 db.meta.scoreSeed 标记（不是 scoreVersion——那是写计数）；
       已导入过就直接返回、**不提交**，保证第二次调用后落盘内容逐字节不变。 */
    function actionApplySeedScores(store) {
      const seedScores = (SEED && SEED.scores) || null;
      const rubric = (SEED && SEED.scoreRubric) || SCORE_RUBRIC_VERSION;
      if (!seedScores) return actionOk([]);
      const state = store.get();
      const db = isPlainObject(state.db) ? state.db : defaultDb();
      const meta = Object.assign(defaultDbMeta(), db.meta || {});
      if (meta.scoreSeed) return Object.assign(actionOk([]), { seed: { imported: 0, skipped: 0, done: true } });
      let summary = { imported: 0, skipped: 0, done: true };
      const result = commitDb(store, ['scores', 'meta'], function (current) {
        const applied = importSeedScores(current, seedScores, rubric, { keepUnmatched: true });
        summary = { imported: applied.imported, skipped: applied.skipped, done: applied.done };
        return applied.db || current;
      });
      if (!result.ok) return result;
      return Object.assign({}, result, { seed: summary });
    }
