    /* ============================== 54-registry · 模块注册表 ==============================
       §2 的模块注册表 + 七条校验。左边栏（rail）、B 栏视图、中间区都从这里派生，
       所以「加一个模块」= 往 MODULE_REGISTRY 里加一条 + 在 B_VIEWS / C_VIEWS 里挂组件。

       12 条内置模块的 railOrder 取 10 的整数倍（10/20/…/140），留出插空余地；
       分组顺序固定 list → project → habit → spacer → tool（§2.6）。

       B_VIEWS / C_VIEWS 是「名字 → 组件」的显式映射：注册表里只写字符串，
       分派时查表，查不到就渲染「未知视图」而不是抛异常（§2.2）。 */

    /* t105 五段 rail（ui-spec-stage2 §1.2 / §1.3）：段序即渲染序，五值集合严格相等。
       timer 段的两个计时器与 settings 段只切中间区，其余四段的条目全部落 B 栏。 */
    const RAIL_GROUPS = ['list', 'project', 'function', 'settings'];

    const MODULE_REQUIRES = ['db', 'settings', 'theme', 'sound', 'agent'];

    /* 落点统一由 ui.listView 表达，无 center 概念（t116）：rail 点开的功能直接渲染在 B 栏，
       计时段（番茄钟 / 螺旋）与设置段只是分组名，不再是「中间区页」。 */
    const MODULE_REGISTRY = [
      /* ---- 1 清单段（list）：今天 → 最近 7 天 → 标签 → 全部未完成 → 已完成 → 已删除 ---- */
      {
        id: 'today', name: '今天', icon: 'sun', railOrder: 10, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.today', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'week', name: '最近 7 天', icon: 'calendar', railOrder: 20, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.week', enabledByDefault: true, requires: ['db']
      },
      {
        /* t105 新增：标签是「任务项」，紧跟「最近 7 天」（用户原话）。
           B 栏 = 标签清单 + 选中标签的任务，不新增 listView 取值（§1.2）。 */
        id: 'tags', name: '标签', icon: 'flag', railOrder: 30, inRail: true, railGroup: 'list',
        renderB: 'TagsView', detailKind: 'task', settingsKey: 'modules.tags', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'open', name: '全部未完成', icon: 'inbox', railOrder: 40, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.open', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'done', name: '已完成', icon: 'check', railOrder: 50, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.done', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'trash', name: '已删除', icon: 'trash', railOrder: 60, inRail: true, railGroup: 'list',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.trash', enabledByDefault: true, requires: ['db']
      },
      /* ---- 2 项目段（project） ---- */
      {
        id: 'project', name: '项目', icon: 'folder', railOrder: 10, inRail: true, railGroup: 'project',
        renderB: 'TaskListView', detailKind: 'task', settingsKey: 'modules.project', enabledByDefault: true, requires: ['db']
      },
      /* ---- 3 计时段（timer）：只切中间区，不占 B 栏（§1.2.3） ---- */
      {
        id: 'pomodoro', name: '番茄钟', icon: 'timer', railOrder: 50, inRail: true, railGroup: 'function',
        renderB: 'PomodoroView', detailKind: null, settingsKey: 'modules.pomodoro', enabledByDefault: true, requires: ['db', 'sound']
      },
      {
        id: 'spiral', name: '螺旋工作法', icon: 'spiral', railOrder: 60, inRail: true, railGroup: 'function',
        renderB: 'SpiralView', detailKind: null, settingsKey: 'modules.spiral', enabledByDefault: true, requires: ['db', 'sound']
      },
      /* ---- 4 记录与分析段（review）：四象限 → 日历 → 习惯打卡 → 必做之事 ---- */
      {
        id: 'quadrant', name: '四象限', icon: 'flag', railOrder: 10, inRail: true, railGroup: 'function',
        renderB: 'QuadrantView', detailKind: 'task', settingsKey: 'modules.quadrant', enabledByDefault: true, requires: ['db']
      },
      {
        /* 日历与四象限同级：都进 B 栏、互斥替换（§1.2 头口径②）。中间区不再有日历页。 */
        id: 'calendar', name: '日历', icon: 'calendar', railOrder: 20, inRail: true, railGroup: 'function',
        renderB: 'CalendarView', detailKind: 'task', settingsKey: 'modules.calendar', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'habit', name: '习惯打卡', icon: 'repeat', railOrder: 30, inRail: true, railGroup: 'function',
        renderB: 'HabitPanel', detailKind: 'habit', settingsKey: 'modules.habit', enabledByDefault: true, requires: ['db']
      },
      {
        /* t105 合并模块：绊脚石 + 禁止清单 + 必做之事 合成一个入口、一个 B 栏来源（§1.12）。
           旧的 obstacle / ban 两条注册项作废（§1.11 第 10 条）。 */
        id: 'onething', name: '必做之事', icon: 'sun', railOrder: 40, inRail: true, railGroup: 'function',
        renderB: 'OneThingBoard', detailKind: null, settingsKey: 'modules.onething', enabledByDefault: true, requires: ['db']
      },
      {
        /* t167/t168 拆出：禁止清单 + 绊脚石 从「必做之事」独立成「阻力清单」（§1.23）。
           数据仍读 db.obstacles，禁止清单只是同一份数据的聚合视图，不新增存储键。 */
        id: 'resistance', name: '阻力清单', icon: 'ban', railOrder: 70, inRail: true, railGroup: 'function',
        renderB: 'ResistanceBoard', detailKind: null, settingsKey: 'modules.resistance', enabledByDefault: true, requires: ['db']
      },
      /* ---- 5 设置段（settings） ---- */
      {
        id: 'settings', name: '设置', icon: 'gear', railOrder: 10, inRail: true, railGroup: 'settings',
        renderB: 'SettingsView', detailKind: null, settingsKey: '', enabledByDefault: true, requires: ['settings']
      },
      /* ---- 纯开关模块（inRail:false，不占 rail 槽位）：权重环 / 蓝按钮推荐 ---- */
      {
        id: 'score', name: '权重环', icon: 'spark', railOrder: 150, inRail: false, railGroup: 'function',
        renderB: '', detailKind: null, settingsKey: 'modules.score', enabledByDefault: true, requires: ['db']
      },
      {
        id: 'rec', name: '蓝按钮推荐', icon: 'spark', railOrder: 160, inRail: false, railGroup: 'function',
        renderB: '', detailKind: null, settingsKey: 'modules.rec', enabledByDefault: true, requires: ['db']
      }
    ];

    /* 注册表级的默认开关补充：51-db 的 defaultModuleSettings() 是在 t50 定稿的 12 条，
       这里新增的 6 条由本文件补齐，避免每条都触发一次 MODULE_NO_DEFAULT 告警。 */
    const MODULE_EXTRA_DEFAULTS = {
      tags: true, score: true, rec: true, onething: true, resistance: true
    };

    /* 旧模块 id → 新模块 id（t105 合并/改名）。读开关时按此回退，保证用户已关闭的状态不丢。 */
    const MODULE_LEGACY_IDS = {
      tags: ['tag'],
      onething: ['obstacle', 'ban', 'prohibit']
    };

    /* 开关取值：先看新 id，再按 legacy 顺序回退（§1.12.4 的读法），最后回落 enabledByDefault。 */
    function moduleSwitch(modules, id) {
      if (modules[id] !== undefined) return !!modules[id];
      const legacy = MODULE_LEGACY_IDS[id] || [];
      for (let i = 0; i < legacy.length; i += 1) {
        if (modules[legacy[i]] !== undefined) return !!modules[legacy[i]];
      }
      return undefined;
    }

    /* 顺序取值：新 id 优先，其次取 legacy 里最小的那个（§1.12.4「order = min(...)」）。 */
    function moduleOrderValue(modules, id) {
      const custom = isPlainObject(modules.order) ? modules.order : {};
      if (typeof custom[id] === 'number' && isFinite(custom[id])) return custom[id];
      const legacy = MODULE_LEGACY_IDS[id] || [];
      let best = null;
      legacy.forEach(function (key) {
        const value = custom[key];
        if (typeof value === 'number' && isFinite(value) && (best === null || value < best)) best = value;
      });
      return best;
    }

    function moduleDefaults() {
      return Object.assign({}, defaultModuleSettings(), MODULE_EXTRA_DEFAULTS);
    }

    /* 单个模块是否启用：设置里写了就用设置，没写回落到 enabledByDefault；
       settings 永远开（关掉它就没地方再打开别的模块了）。 */
    function moduleEnabled(settings, id) {
      if (id === 'settings') return true;
      const module = moduleById(id);
      if (!module) return true;
      const s = migrateSettingsToV2(settings);
      const modules = Object.assign(moduleDefaults(), s.modules || {});
      const value = moduleSwitch(modules, id);
      return value === undefined ? module.enabledByDefault !== false : !!value;
    }

    /* 模块开关快照：UI 一次取全，避免每个 rail 项各查一次 settings。 */
    function moduleFlags(settings) {
      const s = migrateSettingsToV2(settings);
      const modules = Object.assign(moduleDefaults(), s.modules || {});
      const out = Object.create(null);
      MODULE_REGISTRY.forEach(function (module) {
        if (module.id === 'settings') {
          out[module.id] = true;
          return;
        }
        const value = moduleSwitch(modules, module.id);
        out[module.id] = value === undefined ? module.enabledByDefault !== false : !!value;
      });
      return out;
    }

    /* listView → 模块 id：关掉模块时要能把开着的视图一起收起来。 */
    function moduleOfListView(view) {
      if (!view) return '';
      if (view.indexOf('p:') === 0) return 'project';
      if (view.indexOf('date:') === 0) return 'calendar';
      if (view.indexOf('tag:') === 0 || view === 'tags' || view === 'tag') return 'tags';
      return view;
    }

    /* B 栏（右栏列表）组件表：注册表写名字，这里给组件。新增模块两个地方都要加。 */
    const B_VIEWS = {
      TaskListView: function () { return TaskListView; },
      HabitPanel: function () { return HabitPanel; },
      QuadrantView: function () { return QuadrantView; },
      SpiralBoard: function () { return SpiralBoard; },
      TagBoard: function () { return TagBoard; },
      ResistanceBoard: function () { return ResistanceBoard; },
      PomodoroView: function () { return PomodoroView; },
      SpiralView: function () { return SpiralView; },
      SettingsView: function () { return SettingsView; },
      TagsView: function () { return TagsView; },
      CalendarView: function () { return CalendarView; },
      OneThingBoard: function () { return OneThingBoard; }
    };

    /* C 栏（详情栏）组件表：detailKind 决定取哪个。 */
    const C_VIEWS = {
      task: function () { return TaskDetail; },
      habit: function () { return HabitDetail; }
    };

    const MODULE_BY_ID = (function () {
      const map = Object.create(null);
      MODULE_REGISTRY.forEach(function (module) {
        map[module.id] = module;
      });
      return map;
    })();

    function moduleById(id) {
      return id ? MODULE_BY_ID[id] || null : null;
    }

    function moduleIdsInGroup(group) {
      return MODULE_REGISTRY.filter(function (module) {
        return module.railGroup === group;
      }).map(function (module) {
        return module.id;
      });
    }

    /* --------------------------------- 七条校验（§2.2） --------------------------------- */
    /* 返回 { items, error }：
       · items —— 通过校验后的模块数组（已补默认值）；
       · error —— null 或 { code, message }；MODULE_DUP_ID 是致命错误（面板整体不渲染），
         其余六类只在 rail 上跳过该条并在控制台留一行说明，不影响其它模块。 */
    const MODULE_ID_RE = /^[a-z][a-z0-9-]*$/;

    function validateModuleRegistry(registry) {
      const list = Array.isArray(registry) ? registry : [];
      const seen = Object.create(null);
      for (let i = 0; i < list.length; i += 1) {
        const module = list[i];
        if (!module || typeof module.id !== 'string') continue;
        if (seen[module.id]) {
          return {
            items: [],
            error: { code: 'MODULE_DUP_ID', message: '模块 id 重复：' + module.id }
          };
        }
        seen[module.id] = 1;
      }
      const items = [];
      const warnings = [];
      list.forEach(function (module) {
        if (!module || typeof module.id !== 'string') return;
        if (!MODULE_ID_RE.test(module.id)) {
          warnings.push({ code: 'MODULE_BAD_ID', id: module.id });
          return;
        }
        if (module.railGroup && RAIL_GROUPS.indexOf(module.railGroup) < 0) {
          warnings.push({ code: 'MODULE_BAD_ID', id: module.id });
          return;
        }
        if (module.renderB && !B_VIEWS[module.renderB]) {
          warnings.push({ code: 'MODULE_NO_VIEW', id: module.id });
          return;
        }
        if (module.detailKind !== null && module.detailKind !== undefined && !C_VIEWS[module.detailKind]) {
          warnings.push({ code: 'MODULE_BAD_DETAIL', id: module.id });
          return;
        }
        const requires = Array.isArray(module.requires) ? module.requires : [];
        if (requires.some(function (key) { return MODULE_REQUIRES.indexOf(key) < 0; })) {
          warnings.push({ code: 'MODULE_BAD_REQUIRES', id: module.id });
          return;
        }
        items.push(Object.assign({
          inRail: true,
          enabledByDefault: true,
          railOrder: 0,
          railGroup: 'function',
          detailKind: null,
          settingsKey: 'modules.' + module.id,
          requires: []
        }, module));
      });
      /* 同组 railOrder 唯一 */
      const orderSeen = Object.create(null);
      const kept = [];
      items.forEach(function (module) {
        const key = module.railGroup + ':' + module.railOrder;
        if (orderSeen[key]) {
          warnings.push({ code: 'MODULE_ORDER_DUP', id: module.id });
          return;
        }
        orderSeen[key] = 1;
        kept.push(module);
      });
      /* 每个模块都要有默认开关值（settings.modules[id]） */
      const defaults = moduleDefaults();
      kept.forEach(function (module) {
        if (defaults[module.id] === undefined) warnings.push({ code: 'MODULE_NO_DEFAULT', id: module.id });
      });
      if (warnings.length && typeof console !== 'undefined' && console.warn) {
        console.warn('[dsh-tasks] 模块注册表校验告警', warnings);
      }
      return { items: kept, error: null, warnings: warnings };
    }

    /* -------------------------------- 排序 + 开关合并 -------------------------------- */
    /* 用户自定义顺序 settings.modules.order[id] 优先，缺省回落到 railOrder；
       开关取 settings.modules[id]，未写则用 enabledByDefault（settings 模块永远开）。 */
    function orderRailItems(validated, db, settings) {
      const registry = isPlainObject(validated) ? validated.items : [];
      const error = isPlainObject(validated) ? validated.error : null;
      if (error) return { items: [], error: error };
      const s = migrateSettingsToV2(settings);
      const modules = Object.assign(moduleDefaults(), s.modules || {});
      const custom = isPlainObject(modules.order) ? modules.order : {};
      const items = registry.map(function (module) {
        const fallback = module.enabledByDefault !== false;
        const switched = moduleSwitch(modules, module.id);
        let enabled = module.id === 'settings' ? true : (switched === undefined ? fallback : switched);
        if (module.id === 'settings') enabled = true;
        const customOrder = moduleOrderValue(modules, module.id);
        const order = customOrder === null ? module.railOrder : customOrder;
        return Object.assign({}, module, { enabled: enabled, order: order });
      });
      items.sort(function (a, b) {
        if (a.order !== b.order) return a.order - b.order;
        if (a.railOrder !== b.railOrder) return a.railOrder - b.railOrder;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      return { items: items, error: null };
    }
