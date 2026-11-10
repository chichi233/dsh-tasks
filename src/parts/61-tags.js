    /* ============================== 61-tags · 标签库 ==============================
       §3.3.3 的 tag 分区落地：注册表 { id, name, color, order, source, count } 的双来源
       （source:'task' 由任务上的文字派生、source:'manual' 由用户新建/改色），外加
       「任务打标 / 去标」「脏标签清洗」「孤立标签清理」四件事。

       三条与数据有关的硬口径：
       1. count 是派生值，永远由 db.tasks 现算，不写回、不作为权威；
       2. 派生的 tag 名不得覆盖 manual 的 color/order（用户改过的颜色不许被扫描覆盖）；
       3. 历史数据里有 514 条任务的 tags 是字面量「[]」（TickTick 导出的 JSON 残渣）。
          它是**脏数据不是标签**：不参与筛选、不计入计数、界面上一个字都不显示，
          并给一个显式的「清理无效标签」把它从任务上抹掉（不删任务）。

       本文件是「库」的第一块，供后续绊脚石 / 四象限 / 筛选 / Agent 复用，因此
       所有对外能力都是纯函数 + 少数几个 action，UI（TagBoard）只是薄壳。 */

    /* ≥8 色：与四象限/权重环不同用途，取一套中性的标签色板；token 定义在 70-styles
       的 dt-palette 块里（CSS 只有那一块允许写字面色值）。 */
    const TAG_COLORS = [
      { id: 'blue', name: '蓝', token: 'var(--dt-tag-blue)' },
      { id: 'green', name: '绿', token: 'var(--dt-tag-green)' },
      { id: 'orange', name: '橙', token: 'var(--dt-tag-orange)' },
      { id: 'red', name: '红', token: 'var(--dt-tag-red)' },
      { id: 'purple', name: '紫', token: 'var(--dt-tag-purple)' },
      { id: 'teal', name: '青', token: 'var(--dt-tag-teal)' },
      { id: 'pink', name: '粉', token: 'var(--dt-tag-pink)' },
      { id: 'gray', name: '灰', token: 'var(--dt-tag-gray)' }
    ];

    /* 基础备选：新建标签时的候选，也是首次加载时补建的五条 manual 标签（count 仍现算）。 */
    const TAG_BASE_PRESETS = ['工作', '生活', '家人', '社交', '购物'];

    const TAG_UNKNOWN_COLOR = 'var(--dt-label-3)';

    /* 脏标签判据：去掉 [] " , 与空白后为空 → 是残渣。
       覆盖 '[]'、'["[]"]'、'[', ']'、'', '  ' 等 TickTick 导出形态。 */
    function isDirtyTag(name) {
      if (typeof name !== 'string') return true;
      const trimmed = name.trim();
      if (!trimmed) return true;
      return trimmed.replace(/[\[\]",'\s]/g, '') === '';
    }

    function tagColorToken(colorId) {
      const found = TAG_COLORS.find(function (item) { return item.id === colorId; });
      return found ? found.token : TAG_UNKNOWN_COLOR;
    }

    /* 任务上的标签数组：清洗 + 去重 + 去脏 + 保序（顺序即用户输入顺序）。 */
    function tagNamesOf(task) {
      const raw = task && Array.isArray(task.tags) ? task.tags : [];
      const seen = Object.create(null);
      const out = [];
      raw.forEach(function (name) {
        if (isDirtyTag(name)) return;
        const text = name.trim();
        if (seen[text]) return;
        seen[text] = 1;
        out.push(text);
      });
      return out;
    }

    /* 注册表：db.tags（可能含派生脏名）与任务上现存的文字合并。
       manual 优先（color/order 保留），派生条目按名字排序补在后面。 */
    function tagRegistryOf(db) {
      const rawRegistry = db && Array.isArray(db.tags) ? db.tags : [];
      const tasks = db && Array.isArray(db.tasks) ? db.tasks : [];
      const counts = Object.create(null);
      tasks.forEach(function (task) {
        if (!task || task.deleted) return;
        tagNamesOf(task).forEach(function (name) {
          counts[name] = (counts[name] || 0) + 1;
        });
      });
      const byName = Object.create(null);
      const out = [];
      rawRegistry.forEach(function (entry) {
        if (!entry || isDirtyTag(entry.name)) return;
        const name = entry.name.trim();
        if (byName[name]) return;
        const manual = entry.source === 'manual';
        byName[name] = {
          id: entry.id || 'tag:' + name,
          name: name,
          color: entry.color || '',
          order: typeof entry.order === 'number' ? entry.order : 100 + out.length,
          source: manual ? 'manual' : 'task',
          count: counts[name] || 0
        };
        out.push(byName[name]);
      });
      Object.keys(counts).forEach(function (name, index) {
        if (byName[name]) return;
        const item = {
          id: 'tag:' + name,
          name: name,
          color: '',
          order: 100 + index,
          source: 'task',
          count: counts[name] || 0
        };
        if (db.tags && db.tags.some) { /* registry 已扫过，这里只补新生条目 */ }
        byName[name] = item;
        out.push(item);
      });
      out.sort(function (a, b) {
        if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
      return out;
    }

    function tagByName(db, name) {
      if (!name) return null;
      const list = tagRegistryOf(db);
      for (let i = 0; i < list.length; i += 1) {
        if (list[i].name === name) return list[i];
      }
      return null;
    }

    /* 某个标签下未删除的任务（含已完成，由调用方的「含已完成」开关再过滤）。 */
    function tasksWithTag(db, name) {
      const tasks = db && Array.isArray(db.tasks) ? db.tasks : [];
      if (!name) return [];
      return tasks.filter(function (task) {
        return task && !task.deleted && tagNamesOf(task).indexOf(name) >= 0;
      });
    }

    /* 「孤立标签」= 任务上还留着文字、但注册表里已经没有这条标签（用户删过）。
       界面上渲染成灰 chip，并提供一键清理。 */
    function orphanTagNames(db) {
      const known = Object.create(null);
      tagRegistryOf(db).forEach(function (entry) { known[entry.name] = 1; });
      const out = [];
      const seen = Object.create(null);
      (db && Array.isArray(db.tasks) ? db.tasks : []).forEach(function (task) {
        if (!task || task.deleted) return;
        tagNamesOf(task).forEach(function (name) {
          if (known[name] || seen[name]) return;
          seen[name] = 1;
          out.push(name);
        });
      });
      return out.sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
    }

    function dirtyTagTaskIds(db) {
      const out = [];
      (db && Array.isArray(db.tasks) ? db.tasks : []).forEach(function (task) {
        if (!task || task.deleted) return;
        const raw = Array.isArray(task.tags) ? task.tags : [];
        if (raw.some(isDirtyTag)) out.push(task.id);
      });
      return out;
    }

    /* ------------------------------- 写入口（唯一） ------------------------------- */
    /* 标签是 db.tags 分区的唯一写者：改完置 updatedAt + 丢索引，与 53-actions 的
       commitDb 同口径（这里不能调 commitDb —— 它是 53 的私有函数，而 53 不在本卡范围）。 */
    function commitTags(store, mutate) {
      store.update(function (state) {
        const db = state.db;
        const nextTags = mutate(db, state);
        if (!nextTags) return null;
        return Object.assign({}, state, {
          db: Object.assign({}, db, {
            tags: nextTags,
            meta: Object.assign({}, db.meta, { updatedAt: Date.now() })
          })
        });
      });
      if (typeof invalidateDbIndex === 'function') invalidateDbIndex();
    }

    /* 首次加载补建五条基础标签（source:'manual'，order 1..5）。已存在同名则不重复。 */
    function ensureBaseTags(store) {
      const state = store.get();
      const existing = tagRegistryOf(state.db).map(function (item) { return item.name; });
      const missing = TAG_BASE_PRESETS.filter(function (name) { return existing.indexOf(name) < 0; });
      if (!missing.length) return { ok: true, added: 0 };
      commitTags(store, function (db) {
        const tags = (Array.isArray(db.tags) ? db.tags : []).slice();
        missing.forEach(function (name, index) {
          tags.push({
            id: 'tag:' + name,
            name: name,
            color: TAG_COLORS[index % TAG_COLORS.length].id,
            order: index + 1,
            source: 'manual',
            count: 0
          });
        });
        return tags;
      });
      return { ok: true, added: missing.length };
    }

    function tagNameTaken(db, name, exceptName) {
      return tagRegistryOf(db).some(function (item) {
        return item.name === name && item.name !== exceptName;
      });
    }

    function actionAddTag(store, name, color) {
      const text = typeof name === 'string' ? name.trim() : '';
      if (isDirtyTag(text)) return { ok: false, code: 'TAG_INVALID', message: '标签名不能为空或只含括号符号' };
      const state = store.get();
      if (tagNameTaken(state.db, text)) return { ok: false, code: 'TAG_EXISTS', message: '标签已存在：' + text };
      const colorId = TAG_COLORS.some(function (item) { return item.id === color; }) ? color : TAG_COLORS[0].id;
      const order = tagRegistryOf(state.db).length + 1;
      commitTags(store, function (db) {
        const tags = (Array.isArray(db.tags) ? db.tags : []).slice();
        tags.push({ id: 'tag:' + text, name: text, color: colorId, order: order, source: 'manual', count: 0 });
        return tags;
      });
      return { ok: true, id: 'tag:' + text };
    }

    function actionRenameTag(store, name, nextName) {
      const from = typeof name === 'string' ? name.trim() : '';
      const to = typeof nextName === 'string' ? nextName.trim() : '';
      if (isDirtyTag(to)) return { ok: false, code: 'TAG_INVALID', message: '标签名不能为空或只含括号符号' };
      const state = store.get();
      if (!tagByName(state.db, from)) return { ok: false, code: 'TAG_NOT_FOUND', message: '标签不存在：' + from };
      if (from !== to && tagNameTaken(state.db, to, from)) {
        return { ok: false, code: 'TAG_EXISTS', message: '标签已存在：' + to };
      }
      store.update(function (current) {
        const db = current.db;
        const tags = (Array.isArray(db.tags) ? db.tags : []).map(function (entry) {
          if (entry.name !== from) return entry;
          return Object.assign({}, entry, { name: to, source: 'manual' });
        });
        /* 任务上的文字一起跟着改：标签是「库」，改名不能让任务掉签。 */
        const tasks = db.tasks.map(function (task) {
          if (!task || !Array.isArray(task.tags)) return task;
          if (task.tags.indexOf(from) < 0) return task;
          const next = task.tags.map(function (tag) { return tag === from ? to : tag; });
          return Object.assign({}, task, { tags: normalizeTags(next) });
        });
        return Object.assign({}, current, {
          db: Object.assign({}, db, {
            tags: tags,
            tasks: tasks,
            meta: Object.assign({}, db.meta, { updatedAt: Date.now() })
          })
        });
      });
      return { ok: true };
    }

    function actionSetTagColor(store, name, color) {
      const text = typeof name === 'string' ? name.trim() : '';
      if (!TAG_COLORS.some(function (item) { return item.id === color; })) {
        return { ok: false, code: 'TAG_BAD_COLOR', message: '未知颜色：' + color };
      }
      const state = store.get();
      const entry = tagByName(state.db, text);
      if (!entry) return { ok: false, code: 'TAG_NOT_FOUND', message: '标签不存在：' + text };
      commitTags(store, function (db) {
        const tags = (Array.isArray(db.tags) ? db.tags : []).slice();
        const index = tags.findIndex(function (item) { return item.name === text; });
        const row = { id: entry.id, name: text, color: color, order: entry.order, source: 'manual', count: 0 };
        if (index >= 0) tags[index] = Object.assign({}, tags[index], row);
        else tags.push(row);
        return tags;
      });
      return { ok: true };
    }

    /* 删除标签只删注册表条目：任务上的文字保留成灰 chip（可一键清理），任务本身不动。 */
    function actionDeleteTag(store, name) {
      const text = typeof name === 'string' ? name.trim() : '';
      const state = store.get();
      if (!tagByName(state.db, text)) return { ok: false, code: 'TAG_NOT_FOUND', message: '标签不存在：' + text };
      commitTags(store, function (db) {
        return (Array.isArray(db.tags) ? db.tags : []).filter(function (entry) { return entry.name !== text; });
      });
      return { ok: true };
    }

    /* 任务打标 / 去标（TagBoard 与 C 栏快捷操作共用）。 */
    function actionTagTask(store, taskId, name) {
      const text = typeof name === 'string' ? name.trim() : '';
      if (isDirtyTag(text)) return { ok: false, code: 'TAG_INVALID', message: '标签名无效' };
      store.update(function (state) {
        const db = state.db;
        const index = db.tasks.findIndex(function (task) { return task.id === taskId; });
        if (index < 0) return null;
        const task = db.tasks[index];
        const tags = tagNamesOf(task);
        if (tags.indexOf(text) >= 0) return null;
        const tasks = db.tasks.slice();
        tasks[index] = Object.assign({}, task, { tags: tags.concat([text]) });
        return Object.assign({}, state, {
          db: Object.assign({}, db, { tasks: tasks, meta: Object.assign({}, db.meta, { updatedAt: Date.now() }) })
        });
      });
      return { ok: true };
    }

    function actionUntagTask(store, taskId, name) {
      const text = typeof name === 'string' ? name.trim() : '';
      store.update(function (state) {
        const db = state.db;
        const index = db.tasks.findIndex(function (task) { return task.id === taskId; });
        if (index < 0) return null;
        const task = db.tasks[index];
        const tags = tagNamesOf(task).filter(function (tag) { return tag !== text; });
        if (tags.length === tagNamesOf(task).length) return null;
        const tasks = db.tasks.slice();
        tasks[index] = Object.assign({}, task, { tags: tags });
        return Object.assign({}, state, {
          db: Object.assign({}, db, { tasks: tasks, meta: Object.assign({}, db.meta, { updatedAt: Date.now() }) })
        });
      });
      return { ok: true };
    }

    /* 一键清理孤立标签：把注册表里已经没有的标签文字从所有任务上抹掉。 */
    function actionClearOrphanTags(store) {
      const state = store.get();
      const orphans = orphanTagNames(state.db);
      if (!orphans.length) return { ok: true, cleared: 0 };
      const known = Object.create(null);
      tagRegistryOf(state.db).forEach(function (entry) { known[entry.name] = 1; });
      store.update(function (current) {
        const db = current.db;
        const tasks = db.tasks.map(function (task) {
          if (!task || !Array.isArray(task.tags)) return task;
          const next = tagNamesOf(task).filter(function (name) { return known[name]; });
          if (next.length === tagNamesOf(task).length) return task;
          return Object.assign({}, task, { tags: next });
        });
        return Object.assign({}, current, {
          db: Object.assign({}, db, { tasks: tasks, meta: Object.assign({}, db.meta, { updatedAt: Date.now() }) })
        });
      });
      return { ok: true, cleared: orphans.length };
    }

    /* 一键清理无效标签：把「[]」这类残渣从任务 tags 上物理删除（任务不动）。 */
    function actionClearDirtyTags(store) {
      const state = store.get();
      const ids = dirtyTagTaskIds(state.db);
      if (!ids.length) return { ok: true, cleared: 0 };
      const dirty = Object.create(null);
      ids.forEach(function (id) { dirty[id] = 1; });
      store.update(function (current) {
        const db = current.db;
        const tasks = db.tasks.map(function (task) {
          if (!task || !dirty[task.id] || !Array.isArray(task.tags)) return task;
          return Object.assign({}, task, { tags: tagNamesOf(task) });
        });
        const tags = (Array.isArray(db.tags) ? db.tags : []).filter(function (entry) {
          return entry && !isDirtyTag(entry.name);
        });
        return Object.assign({}, current, {
          db: Object.assign({}, db, { tasks: tasks, tags: tags, meta: Object.assign({}, db.meta, { updatedAt: Date.now() }) })
        });
      });
      return { ok: true, cleared: ids.length };
    }

    /* --------------------------------- 标签面板 --------------------------------- */
    /* B 栏两种形态：listView==='tag' 列标签，选中后 listView==='tag:<name>' 列任务。
       面板只做渲染，数据一律走上面的纯函数/action。 */
    /* 标签视图（ui-spec-stage2 §1.2，t105）：B 栏 = 上半「全部标签」清单 + 下半该标签的任务。
       - 不新增 listView 取值（`tags` 已在 11 值内）；点某行只写组件内 tagFocus，不写 detail；
       - 选中标签时 listView 变成 `tag:<name>`（rail 高亮与刷新都靠它），未选中时下半是空态。 */
    function TagsView(props) {
      const state = props.state;
      const store = props.store;
      const db = state.db;
      const view = String(props.view || '');
      const focused = view.indexOf('tag:') === 0 ? view.slice(4) : '';
      const registry = tagRegistryOf(db);
      const rows = registry.slice().sort(function (a, b) {
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      const focusRow = focused
        ? rows.find(function (entry) { return entry.name === focused; }) || null
        : null;
      const tasks = focusRow
        ? tasksWithTag(db, focusRow.name).filter(function (task) {
          return task.status === 0 && !task.deleted;
        }).sort(compareOpen)
        : [];

      const head = div(
        { key: 'head', className: 'dtHead' },
        div(
          { key: 'l', className: 'dtHeadLeft' },
          div({ key: 't', className: 'dtHeadTitle' }, focusRow ? '#' + focusRow.name : '标签'),
          div({ key: 's', className: 'dtHeadSub' }, focusRow
            ? String(tasks.length) + ' 项未完成'
            : String(rows.length) + ' 个标签')
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

      const tagList = rows.length
        ? rows.map(function (entry) {
          const color = entry.color ? tagColorToken(entry.color) : TAG_UNKNOWN_COLOR;
          const on = focused === entry.name;
          return button(
            {
              key: entry.name,
              type: 'button',
              className: 'dtTagRow dtTagsPick' + (on ? ' dtTagsPickOn' : ''),
              'data-tag': entry.name,
              'data-tag-count': String(entry.count),
              'data-tag-active': on ? '1' : undefined,
              onClick: function () {
                if (props.onPickTag) props.onPickTag(on ? '' : entry.name);
              }
            },
            span({ key: 'd', className: 'dtTagDot', style: { background: color } }),
            span({ key: 'n', className: 'dtTagName' }, entry.name),
            span({ key: 'c', className: 'dtTagCount' }, String(entry.count))
          );
        })
        : div({ key: 'empty', className: 'dtEmpty dtTagsEmpty' }, '还没有标签');

      const taskRows = focusRow
        ? (tasks.length
          ? tasks.map(function (task) {
            return h(TaskRow, {
              key: task.id,
              task: task,
              store: store,
              state: state,
              showScore: props.showScore !== false,
              active: props.activeId === task.id,
              onOpen: props.onOpenTask
            });
          })
          : div({ key: 'none', className: 'dtEmpty' }, '这个标签下没有未完成任务'))
        : div({ key: 'pick', className: 'dtEmpty' }, '选一个标签');

      return div(
        { key: 'tagsview', className: 'dtBStack dtTagsView' },
        head,
        div({ key: 'picklist', className: 'dtTagsPickList', 'data-dt': 'tags-list' }, tagList),
        div({ key: 'divider', className: 'dtTagsDivider' }),
        div({ key: 'tasks', className: 'dtList dtTagsTasks', 'data-tag-focus': focused || undefined }, taskRows)
      );
    }

    function TagBoard(props) {
      const state = props.state;
      const store = props.store;
      const db = state.db;
      const registry = tagRegistryOf(db);
      const orphans = orphanTagNames(db);
      const dirtyCount = dirtyTagTaskCount(db);
      const [editing, setEditing] = useState('');
      const [draft, setDraft] = useState('');
      const [colorFor, setColorFor] = useState('');
      const [adding, setAdding] = useState(false);
      const [newName, setNewName] = useState('');

      const commitAdd = function () {
        const text = newName.trim();
        if (!text) {
          setAdding(false);
          return;
        }
        const res = actionAddTag(store, text, TAG_COLORS[registry.length % TAG_COLORS.length].id);
        if (!res.ok) store.pushAlert({ id: uid('toast'), title: res.message || '新建失败', body: '', ttl: 4000 });
        setNewName('');
        setAdding(false);
      };

      const commitRename = function (from) {
        const text = draft.trim();
        setEditing('');
        setDraft('');
        if (!text || text === from) return;
        const res = actionRenameTag(store, from, text);
        if (!res.ok) store.pushAlert({ id: uid('toast'), title: res.message || '改名失败', body: '', ttl: 4000 });
      };

      const removal = function (name) {
        actionDeleteTag(store, name);
        store.pushAlert({
          id: uid('toast'),
          title: '已删除标签「' + name + '」',
          body: '任务上的文字保留为灰色标签，可点「清理孤立标签」一并移除',
          ttl: 4000
        });
      };

      const rows = registry.map(function (entry) {
        const color = entry.color ? tagColorToken(entry.color) : TAG_UNKNOWN_COLOR;
        const isEditing = editing === entry.name;
        return div(
          {
            key: entry.name,
            className: 'dtTagRow',
            'data-tag': entry.name,
            'data-tag-source': entry.source,
            'data-tag-count': String(entry.count)
          },
          span({ key: 'd', className: 'dtTagDot', style: { background: color } }),
          isEditing
            ? input({
              key: 'i',
              className: 'dtTagInput',
              'data-dt': 'tag-rename-input',
              value: draft,
              onClick: stopActionEvent,
              onChange: function (event) { setDraft(event.target.value); },
              onKeyDown: function (event) {
                if (event.key === 'Enter') commitRename(entry.name);
                if (event.key === 'Escape') { setEditing(''); setDraft(''); }
              }
            })
            : button(
              {
                key: 'm',
                type: 'button',
                className: 'dtTagMain',
                'data-dt': 'tag-open',
                title: '查看该标签下的任务',
                ...scopedAction(store, function () {
                  if (props.onPickTag) props.onPickTag(entry.name);
                })
              },
              span({ key: 'n', className: 'dtTagName' }, entry.name),
              span({ key: 'c', className: 'dtTagCount' }, String(entry.count))
            ),
          div(
            { key: 'o', className: 'dtTagOps' },
            button(
              {
                key: 'c',
                type: 'button',
                className: 'dtTagOp' + (colorFor === entry.name ? ' dtTagOpOn' : ''),
                'data-dt': 'tag-color',
                title: '换颜色',
                ...scopedAction(store, function () {
                  setColorFor(colorFor === entry.name ? '' : entry.name);
                })
              },
              icon('flag', 12)
            ),
            button(
              {
                key: 'r',
                type: 'button',
                className: 'dtTagOp',
                'data-dt': 'tag-rename',
                title: '改名',
                ...scopedAction(store, function () {
                  setEditing(entry.name);
                  setDraft(entry.name);
                })
              },
              icon('repeat', 12)
            ),
            button(
              {
                key: 'x',
                type: 'button',
                className: 'dtTagOp dtTagOpDanger',
                'data-dt': 'tag-delete',
                title: '删除标签（不删任务）',
                ...scopedAction(store, function () { removal(entry.name); })
              },
              icon('trash', 12)
            )
          ),
          colorFor === entry.name
            ? div(
              { key: 'p', className: 'dtTagPalette', 'data-dt': 'tag-palette' },
              TAG_COLORS.map(function (item) {
                return button(
                  {
                    key: item.id,
                    type: 'button',
                    className: 'dtTagSwatch' + (entry.color === item.id ? ' dtTagSwatchOn' : ''),
                    'data-dt': 'tag-color-pick',
                    'data-color': item.id,
                    title: item.name,
                    style: { background: item.token },
                    ...scopedAction(store, function () {
                      actionSetTagColor(store, entry.name, item.id);
                      setColorFor('');
                    })
                  }
                );
              })
            )
            : null
        );
      });

      return div(
        { className: 'dtTagBoard', 'data-tag-count': String(registry.length) },
        div(
          { key: 'head', className: 'dtHead' },
          div(
            { key: 'l', className: 'dtHeadLeft' },
            div({ key: 't', className: 'dtHeadTitle' }, '标签'),
            span({ key: 'n', className: 'dtHeadCount' }, String(registry.length) + ' 个标签')
          ),
          div(
            { key: 'r', className: 'dtHeadRight' },
            button(
              {
                key: 'add',
                type: 'button',
                className: 'dtPrimaryBtn',
                'data-dt': 'tag-add',
                ...scopedAction(store, function () { setAdding(true); })
              },
              icon('plus', 12),
              '新建标签'
            ),
            orphans.length
              ? button(
                {
                  key: 'orphan',
                  type: 'button',
                  className: 'dtMiniBtn',
                  'data-dt': 'tag-clear-orphans',
                  title: '把任务上残留的已删标签文字一并移除',
                  ...scopedAction(store, function () {
                    const res = actionClearOrphanTags(store);
                    store.pushAlert({ id: uid('toast'), title: '已清理孤立标签 ' + res.cleared + ' 条', body: '', ttl: 4000 });
                  })
                },
                '清理孤立标签（' + orphans.length + '）'
              )
              : null,
            dirtyCount
              ? button(
                {
                  key: 'dirty',
                  type: 'button',
                  className: 'dtMiniBtn',
                  'data-dt': 'tag-clear-dirty',
                  title: '从任务上移除「[]」这类导出残渣',
                  ...scopedAction(store, function () {
                    const res = actionClearDirtyTags(store);
                    store.pushAlert({ id: uid('toast'), title: '已清理无效标签 ' + res.cleared + ' 条', body: '', ttl: 4000 });
                  })
                },
                '清理无效标签（' + dirtyCount + '）'
              )
              : null,
            button(
              {
                key: 'x',
                type: 'button',
                className: 'dtIconBtn dtDrawerCollapse',
                'data-dt': 'drawer-collapse',
                title: '收起',
                'aria-label': '收起',
                onClick: props.onCollapse
              },
              icon('close', 14)
            )
          )
        ),
        adding
          ? div(
            { key: 'addrow', className: 'dtTagAddRow' },
            input({
              key: 'i',
              className: 'dtTagInput',
              'data-dt': 'tag-new-input',
              placeholder: '标签名，回车创建',
              value: newName,
              onClick: stopActionEvent,
              onChange: function (event) { setNewName(event.target.value); },
              onKeyDown: function (event) {
                if (event.key === 'Enter') commitAdd();
                if (event.key === 'Escape') { setAdding(false); setNewName(''); }
              }
            }),
            button(
              { key: 'b', type: 'button', className: 'dtMiniBtn', 'data-dt': 'tag-new-save', ...scopedAction(store, commitAdd) },
              '创建'
            ),
            /* 基础备选（§3.3.3 / t52 ①）：工作/生活/家人/社交/购物 一键添加，
               已经存在的就不再出现，避免重复建同名标签。 */
            div(
              { key: 'p', className: 'dtTagPresetRow' },
              TAG_BASE_PRESETS.filter(function (name) {
                return !registry.some(function (entry) { return entry.name === name; });
              }).map(function (name) {
                return button(
                  {
                    key: name,
                    type: 'button',
                    className: 'dtTagPreset',
                    'data-dt': 'tag-preset',
                    'data-tag': name,
                    ...scopedAction(store, function () {
                      const res = actionAddTag(store, name, TAG_COLORS[registry.length % TAG_COLORS.length].id);
                      if (!res.ok) store.pushAlert({ id: uid('toast'), title: res.message || '新建失败', body: '', ttl: 4000 });
                    })
                  },
                  name
                );
              })
            )
          )
          : null,
        div({ key: 'list', className: 'dtTagList', 'data-dt': 'tag-list' }, rows),
        div(
          { key: 'hint', className: 'dtTagHint' },
          '删除标签不会删除任务；任务上的文字会保留为灰色标签，可用「清理孤立标签」移除。'
        )
      );
    }

    /* dirty 任务条数（TagBoard 按钮文案用；与 tagNamesOf 同判据）。 */
    function dirtyTagTaskCount(db) {
      return dirtyTagTaskIds(db).length;
    }
