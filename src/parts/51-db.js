    /* ================================ 51-db · 任务数据库 ================================
       地基层第一件（docs/stage4-foundation.md §3）。state.db 是唯一数据源，8 个分区 + 7 个内存索引。

       P0 的边界是「加壳、不搬家」：
         · 新数据一律写进 state.db.<分区>；
         · 顶层 state.tasks / state.projects / state.scores 保留成**不可枚举访问器**，
           读到的是 db 分区本身、写进去也直落 db 分区，所以既有上百处调用点一行都不用改；
         · 因为不可枚举，JSON.stringify 只写 db 这一份（不会把数据写两遍），
           导出的备份文件体积与 P0 之前同量级。

       —— 迁移幂等判据（captain 要求写清）——
       1) 对同一份输入跑两次 migrateState()，除 db.meta.updatedAt 外结果逐字相等；
       2) 迁移后的 state 里 version === 2 且**顶层不存在** tasks/projects/scores 三个数据属性；
       3) 把迁移结果再喂给 migrateState()，走 version===2 分支，只做 typeof 修补，
          不重新计算 tags/habitLog/stats，不把 version 回写成 1，不新增/丢失任何分区；
       4) scoreVersion 只在分数集合变化时前进，迁移本身不动它。

       —— P1 删除顶层别名时要跟着改的调用点（先列清单，别到 P1 现查）——
       · 批量替换 `state.tasks` / `parsed.tasks` → `state.db.tasks`
       · 批量替换 `state.projects` → `state.db.projects`
       · 批量替换 `state.scores` → `state.db.scores`
       已知主要落点：00-prelude 的 loadState/inflateSeed/completeTask/uncompleteTask/patchTask/
       deleteTask/restoreTask/destroyTask/addTask/toggleHabit/normalizeHabits/spiralScoreOf；
       20-engines 的 reminderHit 调用点与 markOverdueNotified；30-ui-tasks 的 filterTasks/quadOf；
       40-panel 的 TaskListView/QuadrantView 数据装配；60-settings 的 exportState/applyImport。
       替换完删掉 SHARD_ALIASES / defineShardAccessors / adoptShards 三个函数即可。 */

    const DB_SCHEMA_VERSION = 2;
    const DB_PARTITIONS = ['tasks', 'projects', 'tags', 'scores', 'pomodoroLog', 'habitLog', 'obstacles', 'modules', 'scoreFeedback'];
    /* 兼容别名：P0 期间这三个分区同时以顶层属性暴露（不可枚举），P1 删除 */
    const DB_SHARDS = ['tasks', 'projects', 'scores'];
    const STORE_KEY_LEGACY = 'dsh.tasks.v1';

    function isPlainObject(value) {
      return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    /* ------------------------------- 分数库口径（§8.1） -------------------------------- */
    /* 五字段：score / source / updatedAt / rubricVersion / reason。
       source 三档，优先级 manual > agent > auto：自动打分不得覆盖 manual（§8.1）。 */
    const SCORE_SOURCES = ['auto', 'manual', 'agent'];
    const SCORE_SOURCE_RANK = { auto: 1, agent: 2, manual: 3 };
    const SCORE_RUBRIC_VERSION = 'calibrated-2026-11';
    /* 环的四档阈值（stage3-goals §2.6）：按真实分布定的 20 / 40 / 60，不是 0–100 等分。
       放在这里而不是 CSS，是因为阈值是语义；改阈值不该动样式表。 */
    const SCORE_TIERS = [20, 40, 60];
    /* 同色深浅：品牌色 25% / 50% / 75% / 100%——刻意不用红/黄/蓝四象限色相。 */
    const SCORE_TIER_ALPHA = [0.25, 0.5, 0.75, 1];
    /* 'legacy' 与 'calibrated' 都是历史写法：前者是 P0 前的裸数字，后者是离线批量产物。 */
    function scoreSourceOf(raw) {
      if (raw === 'manual' || raw === 'agent' || raw === 'auto') return raw;
      if (raw === 'calibrated' || raw === 'legacy') return 'auto';
      return 'auto';
    }
    function scoreOriginOf(raw) {
      if (raw === 'manual' || raw === 'agent') return raw;
      return 'calibrated';
    }
    /* 分数 → 档位（0..3）；null / 越界返回 -1，调用方据此画虚线空环。 */
    function scoreTierOf(score) {
      if (typeof score !== 'number' || !isFinite(score)) return -1;
      if (score < SCORE_TIERS[0]) return 0;
      if (score < SCORE_TIERS[1]) return 1;
      if (score < SCORE_TIERS[2]) return 2;
      return 3;
    }

    /* ------------------------- 评分反馈库口径（stage4 §3.3.4） ------------------------- */
    /* 上限 500 条、按 at 淘汰最旧（不按 taskId 分组）：同一任务改 20 次就是 20 条，
       正是 few-shot 需要的近期信号（§8.5-③）。 */
    const SCORE_FEEDBACK_MAX = 500;
    /* few-shot 块格式版本：只有块格式变化才升版本；把块从整理 prompt 改挂到打分 prompt
       不升版本（t110 裁决），所以这个常量与 SCORE_RUBRIC_VERSION 各自独立。 */
    const SCORE_FEEDBACK_PROMPT_VERSION = 'scorefs-1';

    function round1(value) {
      return Math.round(value * 10) / 10;
    }

    /* 改前快照：从无记录时给 {score:null, source:'none', origin:'none'}（§3.3.4）。
       注意 score 保留小数——手动分是整数，但改前的自动分可能是 34.3。 */
    function scoreFeedbackBefore(entry) {
      if (!isPlainObject(entry) || typeof entry.score !== 'number' || !isFinite(entry.score)) {
        return { score: null, source: 'none', origin: 'none' };
      }
      return {
        score: round1(entry.score),
        source: scoreSourceOf(entry.source),
        origin: scoreOriginOf(entry.origin || entry.source)
      };
    }

    /* features 只取这 7 项，禁加字段（§3.3.4）：它是快照，任务删了也照样成立。 */
    function scoreFeedbackFeatures(task, today) {
      const source = isPlainObject(task) ? task : {};
      const tags = (Array.isArray(source.tags) ? source.tags : [])
        .filter(function (tag) { return typeof tag === 'string' && tag; })
        .slice(0, 5);
      return {
        title: String(source.title || '').slice(0, 60),
        content: String(source.content || '').slice(0, 120),
        tags: tags,
        priority: typeof source.priority === 'number' ? source.priority : 0,
        projectId: String(source.projectId || ''),
        dueDate: String(source.date || '').slice(0, 10),
        quad: quadOf(source, today || new Date())
      };
    }

    function scoreFeedbackDelta(after, before) {
      if (!isPlainObject(before) || typeof before.score !== 'number' || !isFinite(before.score)) return null;
      return round1(after - before.score);
    }

    /* id = `sf-<at>-<当日序号>`：同一毫秒内连续两次改分也要唯一，所以序号取「当天已有条数 + 1」。 */
    function scoreFeedbackId(at, list) {
      let seq = 1;
      (Array.isArray(list) ? list : []).forEach(function (item) {
        if (!isPlainObject(item) || typeof item.at !== 'number') return;
        if (dateKey(new Date(item.at)) === dateKey(new Date(at))) seq += 1;
      });
      return 'sf-' + at + '-' + seq;
    }

    function normalizeScoreFeedback(list) {
      return (Array.isArray(list) ? list : []).filter(function (item) {
        return isPlainObject(item) && typeof item.taskId === 'string' && item.taskId;
      }).map(function (item) {
        const before = isPlainObject(item.before)
          ? item.before
          : { score: null, source: 'none', origin: 'none' };
        const after = Math.round(Math.max(0, Math.min(100, Number(item.after) || 0)));
        return {
          id: typeof item.id === 'string' && item.id ? item.id : scoreFeedbackId(item.at | 0, []),
          taskId: item.taskId,
          at: item.at | 0,
          before: {
            score: typeof before.score === 'number' && isFinite(before.score) ? round1(before.score) : null,
            source: typeof before.source === 'string' && before.source ? before.source : 'none',
            origin: typeof before.origin === 'string' && before.origin ? before.origin : 'none'
          },
          after: after,
          delta: scoreFeedbackDelta(after, before),
          coldStart: !isPlainObject(before) || typeof before.score !== 'number' || !isFinite(before.score),
          features: isPlainObject(item.features) ? item.features : scoreFeedbackFeatures({}, new Date()),
          rubricVersion: typeof item.rubricVersion === 'string' && item.rubricVersion ? item.rubricVersion : SCORE_RUBRIC_VERSION,
          promptVersion: typeof item.promptVersion === 'string' && item.promptVersion ? item.promptVersion : SCORE_FEEDBACK_PROMPT_VERSION
        };
      });
    }

    function defaultDbMeta() {
      return {
        updatedAt: 0,
        schemaVersion: DB_SCHEMA_VERSION,
        scoreVersion: 0,
        /* 一次性种子导入的幂等标记：非空字符串即视为已导入过（§8.2）。
           为什么不是 scoreVersion：后者是「分数集合变过几次」的计数器，类型与含义都已定死，
           换成 rubric 字符串会连带改掉 P0 的写入口径。 */
        scoreSeed: ''
      };
    }

    function defaultDb() {
      return {
        tasks: [],
        projects: [],
        tags: [],
        scores: {},
        pomodoroLog: {},
        habitLog: {},
        obstacles: [],
        modules: {},
        /* 评分反馈库（stage4 §3.3.4）：只由 actionRecordScoreFeedback 写，
           用来教 few-shot「这位用户的手动改分偏好」，不参与任何统计口径。 */
        scoreFeedback: [],
        meta: defaultDbMeta()
      };
    }

    /* --------------------------------- 派生分区：标签 --------------------------------- */
    /* db.tags 是索引而不是编辑器：来源有两个——
       task：由任务 tags 反推出的候选（order 从 100 起、每次加载重派生）；
       manual：管理器里手工建的（color/order 由用户决定，派生过程只更新 count，绝不覆盖）。 */
    function deriveTagRegistry(tasks, existing) {
      const manual = Object.create(null);
      (Array.isArray(existing) ? existing : []).forEach(function (tag) {
        if (!tag || !tag.name) return;
        if (tag.source === 'manual') manual[tag.name] = tag;
      });
      const seen = Object.create(null);
      const derived = [];
      (Array.isArray(tasks) ? tasks : []).forEach(function (task) {
        const tags = Array.isArray(task && task.tags) ? task.tags : [];
        tags.forEach(function (name) {
          if (!name || seen[name]) return;
          seen[name] = 1;
          derived.push(name);
        });
      });
      const out = [];
      Object.keys(manual).forEach(function (name) {
        const tag = manual[name];
        out.push({
          id: tag.id || 'tag-' + name,
          name: name,
          color: tag.color || '',
          order: typeof tag.order === 'number' ? tag.order : 0,
          source: 'manual',
          count: 0
        });
      });
      derived.forEach(function (name, index) {
        if (manual[name]) return;
        out.push({ id: 'tag-' + name, name: name, color: '', order: 100 + index, source: 'task', count: 0 });
      });
      /* count 以重算为准（防手工维护漂移） */
      const counts = Object.create(null);
      (Array.isArray(tasks) ? tasks : []).forEach(function (task) {
        const tags = Array.isArray(task && task.tags) ? task.tags : [];
        tags.forEach(function (name) {
          if (name) counts[name] = (counts[name] || 0) + 1;
        });
      });
      out.forEach(function (tag) {
        tag.count = counts[tag.name] || 0;
      });
      out.sort(function (a, b) {
        if (a.order !== b.order) return a.order - b.order;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return out;
    }

    /* ------------------------------ 派生分区：习惯打卡索引 ----------------------------- */
    /* db.habitLog 只是 state.habits[].checks 的派生索引：每次加载重建，禁止反写。
       habitLog[habitId] = { count, last, days: { 'YYYY-MM-DD': 1 } } */
    function buildHabitLog(habits) {
      const log = Object.create(null);
      (Array.isArray(habits) ? habits : []).forEach(function (habit) {
        if (!habit || !habit.id) return;
        const checks = Array.isArray(habit.checks) ? habit.checks : [];
        const days = Object.create(null);
        checks.forEach(function (day) {
          if (day) days[day] = 1;
        });
        const sorted = Object.keys(days).sort();
        log[habit.id] = {
          count: sorted.length,
          last: sorted.length ? sorted[sorted.length - 1] : '',
          days: days
        };
      });
      return log;
    }

    /* ---------------------------------- 分区标准化 ---------------------------------- */
    function normalizeScoreBucket(raw) {
      const out = {};
      if (!isPlainObject(raw)) return out;
      Object.keys(raw).forEach(function (id) {
        const item = raw[id];
        if (typeof item === 'number' && isFinite(item)) {
          /* P0 前的裸数字：补成五字段，来源记为 auto（无 agent 通道、非手调）。 */
          out[id] = {
            score: Math.round(item),
            source: 'auto',
            origin: 'calibrated',
            updatedAt: 0,
            reason: '导入',
            rubricVersion: SCORE_RUBRIC_VERSION
          };
          return;
        }
        if (!isPlainObject(item) || typeof item.score !== 'number' || !isFinite(item.score)) return;
        out[id] = {
          score: Math.round(Math.max(0, Math.min(100, item.score)) * 10) / 10,
          source: scoreSourceOf(item.source),
          origin: scoreOriginOf(item.origin || item.source),
          updatedAt: item.updatedAt | 0,
          reason: typeof item.reason === 'string' && item.reason ? item.reason.slice(0, 40) : '导入',
          rubricVersion: typeof item.rubricVersion === 'string' && item.rubricVersion
            ? item.rubricVersion
            : SCORE_RUBRIC_VERSION
        };
      });
      return out;
    }

    /* §8.2 一次性种子导入：幂等标记走 db.meta.scoreSeed。
       规则：标记已设 → 直接跳过；每条只在「无记录」或「现有记录不是 manual」时写入，
       因此重复调用不会重复写、也不会覆盖用户手调分。返回 { imported, skipped }。 */
    /* opts.keepUnmatched：离线分是「任务库之外的一份独立分数库」（tt-scores.json 1294 条），
       里面可能有 4 条指向已被删除的任务 id。批量打分/环只按 id 取用，悬空条不影响渲染，
       但「1294 条注入 1294 条」是对账基线，所以种子导入默认保留悬空条（source=auto、
       origin=calibrated），而 v1→v2 迁移路径仍走严格匹配（不传该选项）。 */
    function importSeedScores(db, seedScores, rubricVersion, opts) {
      const target = isPlainObject(db) ? db : defaultDb();
      const meta = Object.assign(defaultDbMeta(), isPlainObject(target.meta) ? target.meta : {});
      const version = rubricVersion || SCORE_RUBRIC_VERSION;
      if (meta.scoreSeed) return { imported: 0, skipped: 0, done: false, db: target };
      const source = isPlainObject(seedScores) ? seedScores : {};
      const tasks = Array.isArray(target.tasks) ? target.tasks : [];
      const byId = Object.create(null);
      const byTitle = Object.create(null);
      tasks.forEach(function (task) {
        if (!task || !task.id) return;
        byId[task.id] = task;
        const key = String(task.title || '').trim().replace(/\s+/g, '').toLowerCase();
        if (!key) return;
        byTitle[key] = byTitle[key] === undefined ? task.id : null;
      });
      const scores = Object.assign({}, target.scores || {});
      let imported = 0;
      let skipped = 0;
      Object.keys(source).forEach(function (rawKey) {
        const item = source[rawKey];
        const value = typeof item === 'number' ? item : (isPlainObject(item) ? item.score : NaN);
        if (typeof value !== 'number' || !isFinite(value)) {
          skipped += 1;
          return;
        }
        const key = String(rawKey || '');
        let id = byId[key] ? key : null;
        if (!id) {
          const norm = key.trim().replace(/\s+/g, '').toLowerCase();
          if (byTitle[norm]) id = byTitle[norm];
        }
        if (!id) {
          if (!(opts && opts.keepUnmatched) || !key) {
            skipped += 1;
            return;
          }
          id = key;
        }
        const existing = scores[id];
        if (isPlainObject(existing) && existing.source === 'manual') {
          skipped += 1;
          return;
        }
        scores[id] = {
          score: Math.round(Math.max(0, Math.min(100, value)) * 10) / 10,
          source: 'auto',
          origin: 'calibrated',
          updatedAt: 0,
          reason: (isPlainObject(item) && typeof item.reason === 'string' && item.reason) || '导入',
          rubricVersion: version
        };
        imported += 1;
      });
      meta.scoreSeed = version;
      target.scores = scores;
      target.meta = meta;
      return { imported: imported, skipped: skipped, done: true, db: target };
    }

    /* 批量打分的纯函数入口（规格 §8.3 写的名字是 scoreTask(task, db)）：
       把 db 适配成 spiralScoreOf 认识的 state 形状后调用它——
       口径只有一份，避免「列表里的分」与「螺旋选件的分」算出不同结果。 */
    function scoreTask(task, db) {
      const source = isPlainObject(db) ? db : defaultDb();
      return spiralScoreOf(task, {
        scores: source.scores || {},
        projects: source.projects || [],
        tasks: source.tasks || []
      });
    }

    /* 8 分区按 typeof 补齐。opts.habits 来自 state.habits（P0 期间它仍是 top-level 分区，
       等 P1 搬进 db 后这里改读 db.habits 即可）。 */
    function normalizeDb(input, opts) {
      const options = opts || {};
      const source = isPlainObject(input) ? input : {};
      const db = defaultDb();
      db.tasks = Array.isArray(source.tasks) ? source.tasks : (Array.isArray(options.tasks) ? options.tasks : []);
      db.projects = Array.isArray(source.projects) ? source.projects : (Array.isArray(options.projects) ? options.projects : []);
      db.obstacles = Array.isArray(source.obstacles) ? source.obstacles : [];
      db.modules = isPlainObject(source.modules) ? source.modules : {};
      db.pomodoroLog = isPlainObject(source.pomodoroLog) ? source.pomodoroLog : {};
      db.scores = normalizeScoreBucket(source.scores);
      /* 迁移里若显式给了 scores（例如老版本把分数存在顶层），按同样的规则吃进来 */
      if (!Object.keys(db.scores).length && isPlainObject(options.scores)) {
        db.scores = normalizeScoreBucket(options.scores);
      }
      const habits = Array.isArray(options.habits) ? options.habits : [];
      db.habitLog = buildHabitLog(habits);
      db.scoreFeedback = normalizeScoreFeedback(source.scoreFeedback);
      db.tags = deriveTagRegistry(db.tasks, Array.isArray(source.tags) ? source.tags : []);
      db.meta = Object.assign(defaultDbMeta(), isPlainObject(source.meta) ? source.meta : {});
      db.meta.schemaVersion = DB_SCHEMA_VERSION;
      return db;
    }

    /* ---------------------------------- 内存索引 ----------------------------------- */
    /* §3.4 三条死规则：action 写完置 null；selector 读到 null 时在同一个同步调用里全量重建；
       索引不得挂到 state / localStorage / useMemo 上。 */
    let dbIndex = null;

    function invalidateDbIndex() {
      dbIndex = null;
    }

    function scoreNumberOf(bucket, id) {
      const item = bucket && bucket[id];
      if (!item || typeof item.score !== 'number' || !isFinite(item.score)) return null;
      return item.score;
    }

    function buildDbIndex(db) {
      const tasks = Array.isArray(db && db.tasks) ? db.tasks : [];
      const scores = (db && db.scores) || {};
      const index = {
        byId: Object.create(null),
        byProject: Object.create(null),
        byTag: Object.create(null),
        byStatus: Object.create(null),
        byDate: Object.create(null),
        byScore: [],
        byParent: Object.create(null)
      };
      tasks.forEach(function (task) {
        if (!task || !task.id) return;
        index.byId[task.id] = task;
        const projectKey = task.projectId || '';
        (index.byProject[projectKey] || (index.byProject[projectKey] = [])).push(task.id);
        (Array.isArray(task.tags) ? task.tags : []).forEach(function (tag) {
          if (!tag) return;
          (index.byTag[tag] || (index.byTag[tag] = [])).push(task.id);
        });
        const statusKey = task.status === 2 ? '2' : '0';
        (index.byStatus[statusKey] || (index.byStatus[statusKey] = [])).push(task.id);
        const dayKey = task.date || '';
        (index.byDate[dayKey] || (index.byDate[dayKey] = [])).push(task.id);
        const parentKey = task.parentId || '';
        (index.byParent[parentKey] || (index.byParent[parentKey] = [])).push(task.id);
      });
      index.byScore = tasks.slice().sort(function (a, b) {
        const sa = scoreNumberOf(scores, a.id);
        const sb = scoreNumberOf(scores, b.id);
        if (sa === null && sb === null) return 0;
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sb - sa;
      }).map(function (task) {
        return task.id;
      });
      return index;
    }

    function getDbIndex(db) {
      if (dbIndex) return dbIndex;
      dbIndex = buildDbIndex(db);
      return dbIndex;
    }

    /* --------------------------------- 顶层别名访问器 --------------------------------- */
    /* 读写都直连 db 分区；enumerable:false 是「JSON 只写一份」的关键。 */
    function defineShardAccessors(state) {
      if (!isPlainObject(state)) return state;
      DB_SHARDS.forEach(function (name) {
        try {
          delete state[name];
          Object.defineProperty(state, name, {
            configurable: true,
            enumerable: false,
            get: function () {
              return state.db ? state.db[name] : undefined;
            },
            set: function (value) {
              if (!isPlainObject(state.db)) state.db = defaultDb();
              state.db[name] = value;
              invalidateDbIndex();
            }
          });
        } catch (err) {
          /* 冻结对象等极端情形：退回普通属性，功能不因此中断 */
        }
      });
      try {
        Object.defineProperty(state, 'toJSON', {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function () {
            return serializeState(this);
          }
        });
      } catch (err) {
        /* 同上 */
      }
      return state;
    }

    /* --------------------------------- 磁盘兼容层 ---------------------------------- */
    /* 落盘形状故意保留 v1 的顶层三键（tasks / projects / scores），db 里不再重复写一份：
       · 老版本的读盘逻辑、以及既有回归脚本里 `savedState().tasks` 这类断言都能继续工作；
       · 文件体积与 P0 之前同量级（三个分区只有一份序列化）；
       · 其余五个分区与 meta 挂在 db 下，属于 v2 的新增部分。
       读盘时两份都能认（见 migrateState）：db 里的优先，缺失才回落到顶层。 */
    function serializeState(state) {
      const source = isPlainObject(state) ? state : {};
      const db = isPlainObject(source.db) ? source.db : defaultDb();
      const dbOut = {};
      Object.keys(db).forEach(function (key) {
        if (DB_SHARDS.indexOf(key) >= 0) return;
        dbOut[key] = db[key];
      });
      const out = {};
      Object.keys(source).forEach(function (key) {
        if (key === 'db' || key === 'toJSON') return;
        out[key] = source[key];
      });
      DB_SHARDS.forEach(function (name) {
        out[name] = db[name];
      });
      out.db = dbOut;
      return out;
    }

    /* store.update 的收尾：把 mutator 用 Object.assign 铺出来的顶层数据属性收回 db，
       再重挂访问器。只对齐分区本身，不重算 tags/habitLog（那是加载期的一次性派生）。 */
    function adoptShards(next) {
      if (!isPlainObject(next)) return next;
      let db = isPlainObject(next.db) ? next.db : defaultDb();
      DB_SHARDS.forEach(function (name) {
        const value = next[name]; /* 访问器或数据属性都能读到 */
        if (value === undefined || value === db[name]) return;
        const patch = {};
        patch[name] = value;
        db = Object.assign({}, db, patch);
      });
      next.db = db;
      defineShardAccessors(next);
      invalidateDbIndex();
      return next;
    }

    /* ---------------------------------- 只读快照 ---------------------------------- */
    /* 给 P1 的 selector / 调试用：分区是浅冻结副本，meta 单独冻一份，改不动原数据。 */
    function snapshotDb(db) {
      const source = isPlainObject(db) ? db : defaultDb();
      const out = { meta: Object.freeze(Object.assign({}, source.meta || defaultDbMeta())) };
      DB_PARTITIONS.forEach(function (name) {
        const value = source[name];
        if (Array.isArray(value)) out[name] = Object.freeze(value.slice());
        else if (isPlainObject(value)) out[name] = Object.freeze(Object.assign({}, value));
        else out[name] = Object.freeze(defaultDb()[name]);
      });
      return Object.freeze(out);
    }

    /* --------------------------------- 设置：v1 → v2 --------------------------------- */
    /* 六组 IA（§12.1）对应的键一次补齐。老键 notify / lead / defaultProject 原样保留，
       sound 从布尔升级成对象（enabled 载着老值），因此老用户「关掉音效」这件事不会丢。 */
    const DEFAULT_MODULE_ORDER = {
      today: 10, week: 20, open: 30, done: 40, trash: 50,
      project: 60, habit: 70, quadrant: 100, calendar: 110, pomodoro: 120, spiral: 130, settings: 140
    };

    function defaultModuleSettings() {
      const out = {};
      Object.keys(DEFAULT_MODULE_ORDER).forEach(function (id) {
        out[id] = true;
      });
      out.order = {};
      return out;
    }

    function defaultAgentSettings() {
      return { provider: '', apiBase: '', apiKey: '', model: '', timeout: 30, retries: 1 };
    }

    function defaultCalendarSettings() {
      return { overlays: { lunar: false, term: true, holiday: true } };
    }

    function defaultTaskViewSettings() {
      return { sort: { key: 'smart', dir: 'asc', group: 'none' } };
    }

    function defaultSoundSettings() {
      return { enabled: true, preset: 'remind', volume: 0.6, customName: '', customData: '' };
    }

    function normalizeSoundSettings(raw) {
      const base = defaultSoundSettings();
      if (typeof raw === 'boolean') return Object.assign(base, { enabled: raw });
      if (typeof raw === 'string') return Object.assign(base, { preset: raw });
      if (!isPlainObject(raw)) return base;
      const preset = raw.preset === 'stuck' || raw.preset === 'custom' || raw.preset === 'remind' ? raw.preset : base.preset;
      const volume = typeof raw.volume === 'number' && isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : base.volume;
      return {
        enabled: raw.enabled === undefined ? base.enabled : !!raw.enabled,
        preset: preset,
        volume: volume,
        customName: typeof raw.customName === 'string' ? raw.customName : '',
        customData: typeof raw.customData === 'string' ? raw.customData : ''
      };
    }

    /* 设置只做「缺什么补什么」的合并，绝不整块替换：老版本多出来的键原样带过去。 */
    function migrateSettingsToV2(input) {
      const raw = isPlainObject(input) ? input : {};
      const out = Object.assign({}, raw);
      out.notify = raw.notify === undefined ? true : !!raw.notify;
      out.lead = typeof raw.lead === 'number' && isFinite(raw.lead) ? raw.lead : 0;
      out.defaultProject = typeof raw.defaultProject === 'string' ? raw.defaultProject : '';
      out.sound = normalizeSoundSettings(raw.sound);
      out.theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : 'system';
      out.agent = Object.assign(defaultAgentSettings(), isPlainObject(raw.agent) ? raw.agent : {});
      out.calendar = Object.assign(defaultCalendarSettings(), isPlainObject(raw.calendar) ? raw.calendar : {});
      /* 评分反馈两开关（§1.13.6）：默认「用作用例」开、「含进导出」关。
         includeInExport 默认关是隐私默认值：反馈里有任务标题与标签快照。 */
      out.scoreFeedback = Object.assign(
        { useAsExamples: true, includeInExport: false },
        isPlainObject(raw.scoreFeedback) ? raw.scoreFeedback : {}
      );
      if (isPlainObject(raw.calendar) && isPlainObject(raw.calendar.overlays)) {
        out.calendar.overlays = Object.assign(defaultCalendarSettings().overlays, raw.calendar.overlays);
      }
      const taskView = defaultTaskViewSettings();
      if (isPlainObject(raw.tasks) && isPlainObject(raw.tasks.sort)) {
        taskView.sort = Object.assign(taskView.sort, raw.tasks.sort);
      }
      /* 老版本可能把排序设置平铺在顶层（sort/key/dir/group），一并带进来 */
      if (isPlainObject(raw.sort)) taskView.sort = Object.assign(taskView.sort, raw.sort);
      else if (typeof raw.sortKey === 'string') taskView.sort.key = raw.sortKey;
      out.tasks = taskView;
      const modules = defaultModuleSettings();
      if (isPlainObject(raw.modules)) {
        Object.keys(raw.modules).forEach(function (key) {
          if (key === 'order') {
            if (isPlainObject(raw.modules.order)) modules.order = Object.assign({}, raw.modules.order);
            return;
          }
          modules[key] = !!raw.modules[key];
        });
      }
      out.modules = modules;
      return out;
    }

    /* ---------------------------------- 状态迁移 ----------------------------------- */
    /* 返回 { state, migrated, reason }：reason 只在坏了的时候有值（'MIGRATE_FAILED'）。
       坏数据的原文由调用方（loadState）另存到 localStorage，这里只负责不崩。 */
    function migrateState(raw) {
      if (!isPlainObject(raw)) return { state: null, migrated: false, reason: '' };

      /* 已经是 v2：只做分区 typeof 修补，不重算派生分区、不改 version。 */
      if (raw.version === DB_SCHEMA_VERSION) {
        const state = Object.assign({}, raw);
        const habits = Array.isArray(state.habits) ? state.habits : [];
        /* 磁盘兼容层：三个分区可能写在 db 里，也可能按 v1 习惯写在顶层（serializeState 就是这么写的），
           两边都认——db 优先，缺失才回落。 */
        state.db = normalizeDb(state.db, {
          habits: habits,
          tasks: Array.isArray(state.tasks) ? state.tasks : null,
          projects: Array.isArray(state.projects) ? state.projects : null,
          scores: isPlainObject(state.scores) ? state.scores : null
        });
        delete state.tasks;
        delete state.projects;
        delete state.scores;
        state.settings = migrateSettingsToV2(state.settings);
        state.spiral = Object.assign(defaultSpiral(), state.spiral || {});
        if (!Array.isArray(state.spiralItems) || !state.spiralItems.length) state.spiralItems = defaultSpiralItems();
        if (!Array.isArray(state.habits) || !state.habits.length) state.habits = inflateHabits();
        defineShardAccessors(state);
        return { state: state, migrated: false, reason: '' };
      }

      /* v1：tasks/projects/scores 三个顶部分区搬进 db，其余补默认。 */
      if (raw.version === 1) {
        const state = Object.assign({}, raw);
        const habits = Array.isArray(state.habits) && state.habits.length ? state.habits : inflateHabits();
        state.habits = habits;
        state.db = normalizeDb(
          { tasks: state.tasks, projects: state.projects, obstacles: [], modules: {}, pomodoroLog: {} },
          { habits: habits, scores: isPlainObject(state.scores) ? state.scores : {} }
        );
        delete state.tasks;
        delete state.projects;
        delete state.scores;
        state.version = DB_SCHEMA_VERSION;
        state.settings = migrateSettingsToV2(state.settings);
        state.pomo = migrateRhythm(Object.assign(defaultPomodoro(), state.pomo || {}));
        state.spiral = Object.assign(defaultSpiral(), state.spiral || {});
        if (!Array.isArray(state.spiralItems) || !state.spiralItems.length) state.spiralItems = defaultSpiralItems();
        /* 老版本把原始 RRULE 直接写进 repeat：一次性归位到 rruleRaw */
        state.db.tasks = state.db.tasks.map(function (task) {
          const rawRule = task.rruleRaw || (typeof task.repeat === 'string' && task.repeat.indexOf('=') >= 0 ? task.repeat : '');
          if (!rawRule) return task;
          return Object.assign({}, task, { rruleRaw: rawRule, repeat: repeatEnumOf(rawRule) });
        });
        defineShardAccessors(state);
        return { state: state, migrated: true, reason: '' };
      }

      return { state: null, migrated: false, reason: '' };
    }
