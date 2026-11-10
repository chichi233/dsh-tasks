    /* ============================= 52-selectors · 只读查询层 =============================
       §3.5 的 14 个 selector，加上 §4 的排序 / 分组流水线。

       四条硬规则（越界即视为缺陷）：
       1) 纯函数：只吃 (db / state) 入参，不读 window、不读 Date.now()、不写任何东西；
       2) 返回值是新数组（或新对象），调用方拿去做二次排序也不会污染库；
       3) 排序一律先 slice 再 sort，绝不 sort 入参；
       4) 想要未排序的原始顺序就直接取 selectTask，别对结果再 sort 一次。

       group 的两种返回形状：'none' → Task[]；其余 → [{ key, tasks }]，顺序固定
       project / status / dateBucket / tag 的桶序，空桶不返回。 */

    /* 契约要求 score/date/priority/tag/project/created/completed 七键全部可用，
       其中 project / completed 是 §4.1 七键表之外的补充；智能排序仍为默认。 */
    const SORT_KEYS = ['smart', 'score', 'date', 'tag', 'priority', 'created', 'title', 'project', 'completed'];
    const SORT_LABELS = [
      { key: 'smart', label: '智能排序' },
      { key: 'score', label: '按分数' },
      { key: 'date', label: '按日期' },
      { key: 'tag', label: '按标签' },
      { key: 'priority', label: '按优先级' },
      { key: 'created', label: '按创建时间' },
      { key: 'title', label: '按标题' }
    ];

    const GROUP_KEYS = ['none', 'project', 'status', 'dateBucket', 'tag'];

    function sortCmpText(a, b) {
      const sa = String(a === undefined || a === null ? '' : a);
      const sb = String(b === undefined || b === null ? '' : b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }

    function sortCmpLocale(a, b) {
      try {
        return String(a || '').localeCompare(String(b || ''), 'zh-CN');
      } catch (err) {
        return sortCmpText(a, b);
      }
    }

    /* smart = 与既有 compareOpen 逐字等价：日期升序（无日期排最后）→ 优先级降序 → createdAt 升序。
       §4.1 的「链尾 id 字典序」在这里刻意不追加：compareOpen 在这些键全等时返回 0（稳定排序
       保持原序），加 id 反而会让同一批数据排出不同顺序，破坏「与 compareOpen 等价」这条验收。 */
    function sortCmpSmart(a, b) {
      const da = parseISO(a.date);
      const dbDate = parseISO(b.date);
      if (da && dbDate) {
        if (da.getTime() !== dbDate.getTime()) return da.getTime() - dbDate.getTime();
      } else if (da) return -1;
      else if (dbDate) return 1;
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      return sortCmpText(a.createdAt, b.createdAt);
    }

    function sortDateMs(task) {
      const day = parseISO(task.date);
      if (!day) return null;
      let ms = day.getTime();
      if (!task.allDay) {
        const time = task.remindAt && task.remindAt.length >= 16 ? task.remindAt.slice(11, 16) : '';
        if (time) {
          const parts = time.split(':');
          ms += ((parts[0] | 0) * 60 + (parts[1] | 0)) * 60000;
        }
      }
      return ms;
    }

    function sortCmpDate(a, b) {
      const ma = sortDateMs(a);
      const mb = sortDateMs(b);
      if (ma !== null && mb !== null) {
        if (ma !== mb) return ma - mb;
      } else if (ma !== null) return -1;
      else if (mb !== null) return 1;
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      const ca = sortCmpText(a.createdAt, b.createdAt);
      if (ca) return ca;
      return sortCmpText(a.id, b.id);
    }

    function sortCmpPriority(a, b) {
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      const da = parseISO(a.date);
      const dbDate = parseISO(b.date);
      if (da && dbDate) {
        if (da.getTime() !== dbDate.getTime()) return da.getTime() - dbDate.getTime();
      } else if (da) return -1;
      else if (dbDate) return 1;
      const ca = sortCmpText(a.createdAt, b.createdAt);
      if (ca) return ca;
      return sortCmpText(a.id, b.id);
    }

    function sortCmpCreated(a, b) {
      const ca = sortCmpText(b.createdAt, a.createdAt);
      if (ca) return ca;
      const pa = a.priority | 0;
      const pb = b.priority | 0;
      if (pa !== pb) return pb - pa;
      return sortCmpText(a.id, b.id);
    }

    function sortCmpTitle(a, b) {
      const ta = sortCmpLocale(a.title, b.title);
      if (ta) return ta;
      const ca = sortCmpText(b.createdAt, a.createdAt);
      if (ca) return ca;
      return sortCmpText(a.id, b.id);
    }

    function firstTagOf(task) {
      const tags = Array.isArray(task.tags) ? task.tags : [];
      return tags.length ? String(tags[0]) : '';
    }

    function sortCmpTag(a, b) {
      const ta = sortCmpLocale(firstTagOf(a), firstTagOf(b));
      if (ta) return ta;
      const smart = sortCmpSmart(a, b);
      if (smart) return smart;
      return sortCmpText(a.id, b.id);
    }

    /* project 键：按 db.projects 的出现顺序（即 rail 顺序）比较，无清单排最后；
       同清单内退到 smart 链。不按名称比较——清单可以重名，order 才是稳定语义。 */
    function projectRankMap(db) {
      const map = Object.create(null);
      const projects = Array.isArray(db && db.projects) ? db.projects : [];
      projects.forEach(function (project, index) {
        if (project && project.id) map[project.id] = index;
      });
      return map;
    }

    function sortCmpProjectFactory(rank) {
      return function (a, b) {
        const ra = rank[a.projectId] === undefined ? Number.MAX_SAFE_INTEGER : rank[a.projectId];
        const rb = rank[b.projectId] === undefined ? Number.MAX_SAFE_INTEGER : rank[b.projectId];
        if (ra !== rb) return ra - rb;
        const smart = sortCmpSmart(a, b);
        if (smart) return smart;
        return sortCmpText(a.id, b.id);
      };
    }

    /* completed 键：完成时间降序（新的在前），未完成（completedAt 空）排最后；
       同为未完成时退到 smart 链，避免「还没做的任务顺序随机」。 */
    function sortCmpCompleted(a, b) {
      const ca = typeof a.completedAt === 'string' && a.completedAt ? a.completedAt : '';
      const cb = typeof b.completedAt === 'string' && b.completedAt ? b.completedAt : '';
      if (ca && cb) {
        const byTime = sortCmpText(cb, ca);
        if (byTime) return byTime;
      } else if (ca) return -1;
      else if (cb) return 1;
      const smart = sortCmpSmart(a, b);
      if (smart) return smart;
      return sortCmpText(a.id, b.id);
    }

    /* dir 只反转主比较：tie-break 链条永远保持稳定方向，否则同分任务的相对顺序会随升降序抖动。 */
    function makeComparator(key, dir, scores, db) {
      const desc = dir === 'desc';
      const rank = key === 'project' ? projectRankMap(db) : null;
      const cmpProject = rank ? sortCmpProjectFactory(rank) : null;
      const primary = function (a, b) {
        if (key === 'score') {
          const sa = scoreNumberOf(scores, a.id);
          const sb = scoreNumberOf(scores, b.id);
          if (sa === null && sb === null) return 0;
          if (sa === null) return 1;
          if (sb === null) return -1;
          return sb - sa;
        }
        if (key === 'date') return sortCmpDate(a, b);
        if (key === 'tag') return sortCmpTag(a, b);
        if (key === 'priority') return sortCmpPriority(a, b);
        if (key === 'created') return sortCmpCreated(a, b);
        if (key === 'title') return sortCmpTitle(a, b);
        if (key === 'project') return cmpProject(a, b);
        if (key === 'completed') return sortCmpCompleted(a, b);
        return sortCmpSmart(a, b);
      };
      return function (a, b) {
        const byPrimary = primary(a, b);
        if (byPrimary) return desc ? -byPrimary : byPrimary;
        /* score / date / tag / priority / created / title 已经自带 tie-break，
           smart 以 createdAt 收尾；再补一层 id 保证全等时顺序确定 */
        const byId = sortCmpText(a.id, b.id);
        return desc ? -byId : byId;
      };
    }

    /* §4.4 的第 4–5 步：给「已经过滤好的列表」做分组 + 组内排序。
       TaskListView 用 filterTasks 完成第 1–3 步（既有行为，逐字不动），再调这里补 4–5 步；
       selectTasks 则是 1–5 步一次到位的版本，供新代码与断言使用。 */
    function arrangeTasks(db, tasks, sort, group, today) {
      const list = (Array.isArray(tasks) ? tasks : []).slice();
      const key = sortKeyOf(sort);
      const dir = sortDirOf(sort);
      list.sort(makeComparator(key, dir, (db && db.scores) || {}, db));
      const groupKey = GROUP_KEYS.indexOf(group) >= 0 ? group : 'none';
      const grouped = groupTasks(list, groupKey, today || new Date());
      /* groupTasks 在 'none' 时直接返回任务数组（第一阶段就这样），
         这里统一成「桶数组」形状，调用方只处理一种结构。 */
      if (grouped.length && grouped[0] && Array.isArray(grouped[0].tasks)) return grouped;
      return [{ key: '', tasks: grouped }];
    }

    function sortKeyOf(sort) {
      if (typeof sort === 'string' && SORT_KEYS.indexOf(sort) >= 0) return sort;
      if (isPlainObject(sort) && SORT_KEYS.indexOf(sort.key) >= 0) return sort.key;
      return 'smart';
    }

    function sortDirOf(sort) {
      return isPlainObject(sort) && sort.dir === 'desc' ? 'desc' : 'asc';
    }

    /* ------------------------------------ 分桶 ------------------------------------- */
    function dateBucketOf(task, today) {
      const day = parseISO(task.date);
      if (!day) return 'noDate';
      const diff = dayDiff(day, today);
      if (diff < 0) return 'overdue';
      if (diff === 0) return 'today';
      if (diff === 1) return 'tomorrow';
      if (diff <= 7) return 'week';
      return 'later';
    }

    const DATE_BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'week', 'later', 'noDate'];

    function groupTasks(tasks, group, today) {
      if (group === 'project') {
        const buckets = Object.create(null);
        const order = [];
        tasks.forEach(function (task) {
          const key = task.projectId || '';
          if (!buckets[key]) {
            buckets[key] = [];
            order.push(key);
          }
          buckets[key].push(task);
        });
        return order.map(function (key) {
          return { key: key, tasks: buckets[key] };
        });
      }
      if (group === 'status') {
        const open = [];
        const done = [];
        tasks.forEach(function (task) {
          if (task.status === 2) done.push(task);
          else open.push(task);
        });
        const out = [];
        if (open.length) out.push({ key: 'open', tasks: open });
        if (done.length) out.push({ key: 'done', tasks: done });
        return out;
      }
      if (group === 'dateBucket') {
        const buckets = Object.create(null);
        tasks.forEach(function (task) {
          const key = dateBucketOf(task, today);
          (buckets[key] || (buckets[key] = [])).push(task);
        });
        return DATE_BUCKET_ORDER.filter(function (key) {
          return buckets[key];
        }).map(function (key) {
          return { key: key, tasks: buckets[key] };
        });
      }
      if (group === 'tag') {
        const buckets = Object.create(null);
        tasks.forEach(function (task) {
          const tags = Array.isArray(task.tags) && task.tags.length ? task.tags : [''];
          tags.forEach(function (tag) {
            (buckets[tag] || (buckets[tag] = [])).push(task);
          });
        });
        return Object.keys(buckets).sort(sortCmpLocale).map(function (key) {
          return { key: key, tasks: buckets[key] };
        });
      }
      return tasks;
    }

    /* ---------------------------------- 14 个 selector --------------------------------- */
    function selectTask(db, id) {
      if (!id) return null;
      const index = getDbIndex(db);
      return index.byId[id] || null;
    }

    function selectScore(db, id) {
      if (!id) return null;
      return scoreNumberOf((db && db.scores) || {}, id);
    }

    /* 环与 C 栏需要整条记录（分数之外的 source / updatedAt / reason 也要显示），
       所以另开一个返回桶的 selector；selectScore 保持「只给数字」的既有签名不变。 */
    function selectScoreEntry(db, id) {
      if (!id) return null;
      const bucket = (db && db.scores) || {};
      const item = bucket[id];
      if (!isPlainObject(item) || typeof item.score !== 'number' || !isFinite(item.score)) return null;
      return item;
    }

    function viewFilterOf(view, today) {
      return function (task) {
        if (!task) return false;
        if (view === 'trash') return !!task.deleted;
        if (task.deleted) return false;
        if (view === 'done') return task.status === 2;
        if (task.status !== 0) return false;
        if (view === 'today') {
          const day = parseISO(task.date);
          return !!day && dayDiff(day, today) <= 0;
        }
        if (view === 'week') {
          const day = parseISO(task.date);
          if (!day) return false;
          const diff = dayDiff(day, today);
          return diff >= 0 && diff <= 6;
        }
        if (view === 'date') return true;
        return true;
      };
    }

    function matchesQuery(task, needle) {
      if (!needle) return true;
      const hay = [
        task.title || '',
        task.detailNote || '',
        task.content || '',
        Array.isArray(task.tags) ? task.tags.join(' ') : ''
      ].join(' ').toLowerCase();
      return hay.indexOf(needle) >= 0;
    }

    function selectTasks(db, opts) {
      const options = isPlainObject(opts) ? opts : {};
      const today = options.today ? parseISO(options.today) || new Date() : new Date();
      const view = typeof options.view === 'string' ? options.view : 'open';
      const query = typeof options.query === 'string' ? options.query.trim().toLowerCase() : '';
      const includeDone = !!options.showDone;
      const tasks = Array.isArray(db && db.tasks) ? db.tasks : [];
      let projectKey = '';
      let dayKeyValue = '';
      if (view.indexOf('p:') === 0) projectKey = view.slice(2);
      else if (view.indexOf('date:') === 0) dayKeyValue = view.slice(5);
      const baseFilter = viewFilterOf(view, today);
      const list = tasks.filter(function (task) {
        if (!task) return false;
        if (projectKey && task.projectId !== projectKey) return false;
        if (dayKeyValue) {
          if (task.deleted) return false;
          const day = parseISO(task.date);
          if (!day || dateKey(day) !== dayKeyValue) return false;
        } else if (!baseFilter(task)) return false;
        if (!includeDone && !dayKeyValue && task.status === 2 && view !== 'done') return false;
        return matchesQuery(task, query);
      });
      const sorted = list.slice().sort(makeComparator(sortKeyOf(options.sort), sortDirOf(options.sort), (db && db.scores) || {}, db));
      const group = GROUP_KEYS.indexOf(options.group) >= 0 ? options.group : 'none';
      return groupTasks(sorted, group, today);
    }

    function selectOpenTasks(db) {
      return (Array.isArray(db && db.tasks) ? db.tasks : []).filter(function (task) {
        return task && !task.deleted && task.status === 0;
      });
    }

    function selectTasksByProject(db, projectId) {
      const key = projectId || '';
      const index = getDbIndex(db);
      return (index.byProject[key] || []).map(function (id) {
        return index.byId[id];
      }).filter(Boolean);
    }

    function selectTasksByTag(db, tagName) {
      if (!tagName) return [];
      const index = getDbIndex(db);
      return (index.byTag[tagName] || []).map(function (id) {
        return index.byId[id];
      }).filter(Boolean);
    }

    function selectTasksByDate(db, day) {
      if (!day) return [];
      const index = getDbIndex(db);
      return (index.byDate[day] || []).map(function (id) {
        return index.byId[id];
      }).filter(Boolean);
    }

    function selectSubtasks(db, parentId) {
      const key = parentId || '';
      const index = getDbIndex(db);
      return (index.byParent[key] || []).map(function (id) {
        return index.byId[id];
      }).filter(Boolean);
    }

    function selectTopByScore(db, n, opts) {
      const options = isPlainObject(opts) ? opts : {};
      const limit = typeof n === 'number' && n > 0 ? Math.floor(n) : 10;
      const index = getDbIndex(db);
      const out = [];
      index.byScore.forEach(function (id) {
        const task = index.byId[id];
        if (!task || task.deleted) return;
        if (!options.includeDone && task.status !== 0) return;
        out.push(task);
      });
      return out.slice(0, limit);
    }

    function selectPomoDay(db, day) {
      const key = typeof day === 'string' ? day : '';
      const log = (db && db.pomodoroLog) || {};
      const entry = log[key];
      if (isPlainObject(entry)) return Object.assign({}, entry);
      if (Array.isArray(entry)) return { sessions: entry.slice() };
      return { sessions: [] };
    }

    function selectPomoMonth(db, month) {
      const prefix = typeof month === 'string' ? month : '';
      const log = (db && db.pomodoroLog) || {};
      const out = [];
      Object.keys(log).sort().forEach(function (key) {
        if (prefix && key.indexOf(prefix) !== 0) return;
        out.push({ day: key, value: log[key] });
      });
      return out;
    }

    function selectHabitDay(db, day) {
      const key = typeof day === 'string' ? day : '';
      const log = (db && db.habitLog) || {};
      const out = [];
      Object.keys(log).forEach(function (habitId) {
        const entry = log[habitId];
        if (!entry || !isPlainObject(entry.days)) return;
        out.push({ habitId: habitId, checked: !!entry.days[key], count: entry.count | 0 });
      });
      return out;
    }

    function selectRailItems(db, settings) {
      return orderRailItems(validateModuleRegistry(MODULE_REGISTRY), db, settings).items;
    }

    function selectModuleFlags(db, settings) {
      const result = orderRailItems(validateModuleRegistry(MODULE_REGISTRY), db, settings);
      const flags = {};
      result.items.forEach(function (module) {
        flags[module.id] = !!module.enabled;
      });
      return flags;
    }
