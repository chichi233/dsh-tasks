
    /* ------------------------------------ 主面板 ------------------------------------ */

    function countToday(tasks, now) {
      return tasks.filter(function (t) {
        if (t.status !== 0 || t.deleted) return false;
        const d = parseISO(t.date);
        return d ? dayDiff(d, now) <= 0 : false;
      }).length;
    }

    function countWeek(tasks, now) {
      return tasks.filter(function (t) {
        if (t.status !== 0 || t.deleted) return false;
        const d = parseISO(t.date);
        if (!d) return false;
        const diff = dayDiff(d, now);
        return diff >= 0 && diff <= 7;
      }).length;
    }

    /* rail 由模块注册表派生（§2.6 / §15-89）：每个入口的「在不在」取 settings.modules[id]，
       「排第几」取 settings.modules.order[id]（缺省回落 railOrder）。
       组序固定 list → project → habit →（绊脚石 / 禁止清单 / 必做之事）→ spacer → tool，
       order 只在组内生效；比较规则与 orderRailItems 完全一致：数值升序 → railOrder 升序 → id 升序。 */
    /* t137：rail 四段（§1.2 / §15-113）。段序固定 list → project → function → settings，
       段间恰一个 .dtRailSep（三个），settings 段后不插分隔条；不许第五段。
       旧 timer / review 两段按 t136 规格合并为 function（功能区），段内顺序仍由注册表
       railOrder 决定：四象限 → 日历 → 习惯打卡 → 必做之事 → 番茄钟 → 螺旋工作法。 */
    /* §1.22：分隔线分布写死在下方组装里（2 内 1 外），不再用 RAIL_SEP_KEYS 驱动，
       否则「容器内 2 条 + 容器外 1 条」会退化成「三条都在容器内」。 */
    /* 四象限左色边取值：只认面板自有 token（70-styles.js 的 --dt-quad-*），
       不用宿主 alias —— 宿主未定义 brand/warn 时 var() 会解析成非法值，
       边框退回 currentColor，实测出过近黑边（F18）。Q4 按口径「无」= 透明。 */
    const QUAD_EDGE = {
      q1: 'var(--dt-quad-red)',
      q2: 'var(--dt-quad-yellow)',
      q3: 'var(--dt-quad-blue)',
      q4: 'transparent'
    };

    function railPlan(state) {
      /* 唯一入口走 selector（§15-89）：selectRailItems 内部就是
         orderRailItems(validateModuleRegistry(MODULE_REGISTRY), db, settings)，
         排序规则 order → railOrder → id 已在注册表里写死，这里不再手写一遍。 */
      const listed = selectRailItems(state.db || null, state.settings);
      const items = Array.isArray(listed) ? listed : [];
      const out = { list: [], project: [], function: [], settings: [], error: null };
      items.forEach(function (module) {
        /* inRail:false 是「没有独立 rail 入口」（权重环 / 推荐开关），不占槽位 */
        if (module.inRail === false) return;
        /* 关掉的模块不占槽位：连占位节点都不渲染（§15-89） */
        if (!module.enabled) return;
        const group = module.railGroup;
        if (out[group]) out[group].push(module);
      });
      return out;
    }

    /* rail 五段（§1.2）：清单 / 项目 / 计时 / 记录与分析 / 设置。
       计时段（番茄钟、螺旋）与设置段只切中间区，其余条目一律落 B 栏且互斥替换；
       任何 rail 入口都不写 detail（§1.2.4）。 */
    function Rail(props) {
      const state = props.state;
      const now = new Date();
      const tasks = state.tasks;
      const openTotal = tasks.filter(function (t) { return t.status === 0 && !t.deleted; }).length;
      const doneTotal = tasks.filter(function (t) { return t.status === 2 && !t.deleted; }).length;
      const trashTotal = tasks.filter(function (t) { return !!t.deleted; }).length;
      const habits = state.habits || [];
      const oneThing = oneThingTask(state, now);
      const counts = {
        today: countToday(tasks, now),
        week: countWeek(tasks, now),
        open: openTotal,
        done: doneTotal,
        trash: trashTotal,
        habit: habits.filter(function (habit) {
          return !habit.archived && !habitChecked(habit, now);
        }).length,
        /* 标签入口的计数 = 注册表里实际可用的标签个数（脏标签与空名不计）。 */
        tags: (function () {
          const db = state.db || null;
          return db ? tagRegistryOf(db).length : 0;
        })(),
        /* 必做之事角标：今天那一条还没做完时显示 1（§1.12） */
        onething: oneThing && oneThing.status === 0 && !oneThing.deleted ? 1 : 0
      };
      const plan = railPlan(state);
      const pomo = state.pomo;
      const pomoLeft = pomodoroRemaining(pomo);
      /* 螺旋运行中时 rail 项带剩余分钟徽标（§4.10.9），idle 时属性与文本都不出现 */
      const spiralLeft = spiralRemaining(state.spiral);
      const spiralBadge = state.spiral && state.spiral.status !== 'idle'
        ? Math.max(1, Math.ceil(spiralLeft / 60000))
        : null;

      /* ------------------------- 目录栏设置与拖拽排序（t144 / §1.20） ------------------------- */
      const railUI = railUIOf(state.settings);
      const showGrip = !railUI.hideReorder;
      const showDot = !railUI.hideColor;
      const store = props.store;
      const [dragKey, setDragKey] = useState('');
      const [dropKey, setDropKey] = useState('');
      const [liveText, setLiveText] = useState('');
      const psRef = useRef(null);
      const psPanelRef = useRef(null);
      const psOpenRef = useRef(false);
      psOpenRef.current = !!props.psOpen;
      const psPlacement = useMenuFlip(props.psOpen, psRef, '.dtRail', psPanelRef);

      /* 面板必须跳出 A 栏的裁切盒（§1.20.7）：`.dtRail{overflow:hidden}` 是「设置贴底」的必要条件，
         不能去掉，而面板宽 260–320 远超 196 的栏宽，绝对定位时会被整块裁掉（真机点开等于没反应）。
         position:fixed 的元素以视口为包含块，不被祖先 overflow 裁切（已用 elementFromPoint 实测），
         所以这里按触发钮的视口 rect 算 left/top，并在视口内做夹取。 */
      const psPosState = useState(null);
      const psPos = psPosState[0];
      const setPsPos = psPosState[1];
      useEffect(function () {
        if (!props.psOpen) {
          setPsPos(null);
          return;
        }
        const rectOf = function (node) {
          return node && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
        };
        const b = rectOf(psRef.current);
        const p = rectOf(psPanelRef.current);
        const vw = (typeof window !== 'undefined' && window.innerWidth) || 1200;
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
        const rawW = p && p.width ? p.width : 0;
        const w = Math.round(Math.min(320, Math.max(260, rawW || 300)));
        /* 优先贴住触发钮右缘；若会压住 A 栏（栏宽 196/48 都远小于面板宽），就改贴 A 栏右缘——
           面板是给 A 栏用的，盖住 A 栏等于看不到自己的入口。 */
        let left = b ? Math.round(b.right - w) : 8;
        const railEl = psRef.current && typeof psRef.current.closest === 'function'
          ? psRef.current.closest('.dtRail')
          : null;
        const railRect = railEl && typeof railEl.getBoundingClientRect === 'function' ? railEl.getBoundingClientRect() : null;
        const minLeft = railRect ? Math.round(railRect.right + 4) : 8;
        if (left < minLeft) left = minLeft;
        if (left + w > vw - 8) left = Math.max(8, vw - 8 - w);
        let top = b ? Math.round(b.bottom + 2) : 8;
        const h = p && p.height ? Math.round(p.height) : 0;
        if (h && top + h > vh - 8) top = Math.max(8, Math.round((b ? b.top : 0) - 2 - h));
        setPsPos({ left: left, top: top, width: w, maxHeight: Math.max(240, vh - top - 8) });
      }, [props.psOpen]);
      /* Esc 只关这一层（§1.2.1 第 1 层）：登记进浮层注册表，由 40-panel 的捕获监听统一消费 */
      useEffect(function () {
        return registerOverlayCloser(OVERLAY_LEVEL.menu, function () {
          if (!psOpenRef.current) return false;
          props.onClosePs();
          return true;
        });
      }, []);

      /* 拖拽只改视觉（§1.20.5）：拖动中 data-dragging、落点 data-drop-target，松手才写库。
         拖拽期间 DOM 顺序一律不动——动了节点会被重渲染掉，dragend 就丢了。 */
      const dragGroupOf = function (key) {
        return String(key).indexOf('p:') === 0 ? 'project' : 'function';
      };
      const canDropOn = function (key, group) {
        return !!dragKey && dragKey !== key && dragGroupOf(dragKey) === group;
      };
      const announce = function (n) {
        setLiveText('已移动到第 ' + String(n) + ' 位');
      };
      const moveRailItem = function (fromKey, toKey, group) {
        if (!store) return;
        if (group === 'project') {
          const ids = projectOrderOf(state.projects, state.settings);
          const from = ids.indexOf(String(fromKey).slice(2));
          const to = ids.indexOf(String(toKey).slice(2));
          if (from < 0 || to < 0 || from === to) return;
          const next = ids.slice();
          const moved = next.splice(from, 1)[0];
          next.splice(to, 0, moved);
          actionSetSetting(store, { projectsOrder: next });
          announce(next.indexOf(moved) + 1);
          return;
        }
        /* 功能区复用 settings.modules.order（§1.20.7），重排后按 10 的步长重新编号 */
        const ids = plan['function'].map(function (m) { return m.id; });
        const from = ids.indexOf(fromKey);
        const to = ids.indexOf(toKey);
        if (from < 0 || to < 0 || from === to) return;
        const next = ids.slice();
        const moved = next.splice(from, 1)[0];
        next.splice(to, 0, moved);
        const modules = Object.assign({}, state.settings.modules);
        const order = Object.assign({}, (modules && modules.order) || {});
        next.forEach(function (id, index) { order[id] = (index + 1) * 10; });
        modules.order = order;
        actionSetSetting(store, { modules: modules });
        announce(next.indexOf(moved) + 1);
      };
      const onRowDragOver = function (key, group) {
        return function (event) {
          /* 跨组不 preventDefault：浏览器自己显示「不可放置」，也不出现落点线 */
          if (!canDropOn(key, group)) return;
          if (event && event.preventDefault) event.preventDefault();
          setDropKey(key);
        };
      };
      const onRowDrop = function (key, group) {
        return function (event) {
          if (!canDropOn(key, group)) return;
          if (event && event.preventDefault) event.preventDefault();
          moveRailItem(dragKey, key, group);
          setDragKey('');
          setDropKey('');
        };
      };
      const onGripKeyDown = function (key, group) {
        return function (event) {
          if (!event) return;
          const name = event.key;
          /* Enter / Space 写死无副作用：只 preventDefault，不开菜单、不进编辑态（§1.20.6） */
          if (name === 'Enter' || name === ' ' || name === 'Spacebar') {
            if (event.preventDefault) event.preventDefault();
            return;
          }
          if (!event.altKey || (name !== 'ArrowUp' && name !== 'ArrowDown')) return;
          if (event.preventDefault) event.preventDefault();
          const ids = group === 'project'
            ? projectOrderOf(state.projects, state.settings)
            : plan['function'].map(function (m) { return m.id; });
          const from = group === 'project' ? ids.indexOf(String(key).slice(2)) : ids.indexOf(key);
          const to = name === 'ArrowUp' ? from - 1 : from + 1;
          if (from < 0 || to < 0 || to >= ids.length) return;   /* 首/末位不循环、不写库 */
          moveRailItem(key, group === 'project' ? 'p:' + ids[to] : ids[to], group);
        };
      };
      const railGrip = function (key, group) {
        return button(
          {
            key: 'grip',
            className: 'dtRailDrag',
            'data-dt': 'rail-drag',
            'data-drag-key': key,
            'aria-label': '拖动排序',
            title: '拖动排序',
            tabIndex: 0,
            draggable: true,
            onDragStart: function (event) {
              setDragKey(key);
              if (event && event.dataTransfer) {
                try {
                  event.dataTransfer.setData('text/plain', key);
                  event.dataTransfer.effectAllowed = 'move';
                } catch (err) {
                  /* 个别环境不支持自定义 dataTransfer，不影响同组排序 */
                }
              }
            },
            onDragEnd: function () {
              setDragKey('');
              setDropKey('');
            },
            onKeyDown: onGripKeyDown(key, group),
            onClick: function (event) {
              /* 手柄在 rail 项前面，点它不能顺手把视图切走 */
              if (event && event.stopPropagation) event.stopPropagation();
            }
          },
          icon('grip', 12)
        );
      };
      const rowAttrs = function (key, group) {
        return {
          'data-drag-key': key,
          'data-drag-group': group,
          'data-dragging': dragKey === key ? '1' : undefined,
          'data-drop-target': dropKey === key ? '1' : undefined,
          onDragOver: onRowDragOver(key, group),
          onDragLeave: function () {
            if (dropKey === key) setDropKey('');
          },
          onDrop: onRowDrop(key, group)
        };
      };
      /* 面板两行开关：开启 = 隐藏（§1.20.2）。面板与设置页写同一个 action，不各写一套。 */
      const psRow = function (hook, label, on, key) {
        const toggle = function () {
          if (!store) return;
          const next = railUIOf(state.settings);
          next[key] = !on;
          actionSetSetting(store, { railUI: next });
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
      /* t165：面板不只有两个开关，还要能直接调顺序与显隐（用户报障 m05408-3：
         「项目设置里面没有内容，无法设置各个项目和功能项的位置」）。
         三段条目与 rail 同源：顺序读同一个 settings，不另存第二套状态（§1.20.7）；
         移动只在本段内生效（与 rail 拖拽一致，§1.20.4），跨段不接收。
         上移/下移不受「隐藏项目位置调整」影响：那个开关只藏 rail 上的手柄，
         面板是替代入口，跟着一起消失等于把用户唯一的兜底路径也关掉。 */
      const psOrderOf = function (id, fallback) {
        const modules = (state.settings && state.settings.modules) || {};
        const order = modules.order || {};
        const value = order[id];
        return typeof value === 'number' && isFinite(value) ? value : fallback;
      };
      const psModulesOf = function (group) {
        return MODULE_REGISTRY
          .filter(function (module) {
            return module.railGroup === group && module.inRail !== false;
          })
          .slice()
          .sort(function (a, b) {
            const oa = psOrderOf(a.id, a.railOrder);
            const ob = psOrderOf(b.id, b.railOrder);
            if (oa !== ob) return oa - ob;
            return a.id < b.id ? -1 : 1;
          });
      };
      /* 模块段移动：整段按 (i+1)*10 重编号后逐条落库，走现成 actionSetModule */
      const psMoveModule = function (group, id, delta) {
        if (!store) return;
        const list = psModulesOf(group).map(function (module) { return module.id; });
        const from = list.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= list.length) return;
        const moved = list.splice(from, 1)[0];
        list.splice(to, 0, moved);
        list.forEach(function (moduleId, index) {
          actionSetModule(store, moduleId, { order: (index + 1) * 10 });
        });
      };
      /* 项目段移动：写 settings.projectsOrder（与 rail 拖拽同一个字段） */
      const psMoveProject = function (id, delta) {
        if (!store) return;
        const ids = projectOrderOf(state.projects, state.settings);
        const from = ids.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= ids.length) return;
        const next = ids.slice();
        const moved = next.splice(from, 1)[0];
        next.splice(to, 0, moved);
        actionSetSetting(store, { projectsOrder: next });
      };
      /* extra：追加在「上移 / 下移 / 显隐」之后的附加动作（当前只有项目组用：编辑 / 删除）。
         放在这里而不是另写一套行渲染，是为了让三组的行几何与键盘顺序保持一致。 */
      const psItemRow = function (group, id, name, index, count, on, toggle, move, extra) {
        const noUp = index <= 0;
        const noDown = index >= count - 1;
        const mkMove = function (hook, label, disabled, delta, glyph) {
          return button(
            Object.assign(
              {
                key: hook,
                type: 'button',
                className: 'dtPsMove' + (disabled ? ' dtPsMoveOff' : ''),
                'data-dt': hook,
                'aria-label': label,
                title: label,
                disabled: disabled,
                'aria-disabled': disabled ? 'true' : 'false'
              },
              scopedAction(store, function () {
                if (!disabled) move(delta);
              })
            ),
            icon(glyph, 12)
          );
        };
        return div(
          {
            key: group + ':' + id,
            className: 'dtPsItem',
            'data-id': id,
            'data-group': group,
            'data-on': on ? '1' : '0'
          },
          span({ key: 'n', className: 'dtPsItemName', title: name }, name),
          mkMove('ps-up', '上移', noUp, -1, 'arrow-up'),
          mkMove('ps-down', '下移', noDown, 1, 'arrow-down'),
          button(
            Object.assign(
              {
                key: 't',
                type: 'button',
                className: 'dtPsToggle' + (on ? ' dtPsToggleOn' : ''),
                'data-dt': 'ps-toggle',
                'data-on': on ? '1' : '0',
                'aria-pressed': on ? 'true' : 'false',
                'aria-label': (on ? '隐藏 ' : '显示 ') + name,
                title: on ? '隐藏' : '显示'
              },
              scopedAction(store, function () {
                toggle(!on);
              })
            ),
            icon(on ? 'check' : 'close', 12)
          ),
          extra || null
        );
      };
      const psGroup = function (group, title, rows) {
        return div(
          { key: 'g-' + group, className: 'dtPsGroup', 'data-group': group },
          div({ key: 't', className: 'dtPsGroupTitle' }, title),
          rows
        );
      };
      const psListRows = psModulesOf('list').map(function (module, index, arr) {
        const on = moduleEnabled(state.settings, module.id);
        return psItemRow('list', module.id, module.name, index, arr.length, on, function (next) {
          if (!store) return;
          actionSetModule(store, module.id, { enabled: next });
        }, function (delta) {
          psMoveModule('list', module.id, delta);
        });
      });
      const psProjectList = projectOrderOf(state.projects, state.settings)
        .map(function (id) {
          return state.projects.filter(function (project) { return project && project.id === id; })[0];
        })
        .filter(Boolean);
      const psProjectRows = psProjectList.map(function (project, index, arr) {
        const on = !project.hidden;
        /* S7c-1 的正解：不想去 A 栏找 ⋯ 的人，在这里也能编辑 / 删除清单。
           ps-edit 复用同一个 ProjectDialog（编辑态自带「删除清单」）；ps-del 走确认 + 既有 removeProject。 */
        const psEdit = button(
          Object.assign(
            {
              key: 'edit',
              type: 'button',
              className: 'dtPsEdit',
              'data-dt': 'ps-edit',
              'aria-label': '编辑 ' + project.name,
              title: '编辑'
            },
            scopedAction(store, function () {
              props.onEditProject(project.id);
            })
          ),
          icon('gear', 12)
        );
        const psDel = button(
          Object.assign(
            {
              key: 'del',
              type: 'button',
              className: 'dtPsDel',
              'data-dt': 'ps-del',
              'aria-label': '删除 ' + project.name,
              title: '删除'
            },
            scopedAction(store, function () {
              props.onDeleteProject(project.id);
            })
          ),
          icon('trash', 12)
        );
        return psItemRow('project', project.id, project.name, index, arr.length, on, function (next) {
          if (!store) return;
          /* 项目显隐落在项目对象自己的 hidden 字段上：与模块 enabled 同性质，
             不新开 settings 键，也不影响 projectsOrder。 */
          patchProject(store, project.id, { hidden: next ? false : true });
        }, function (delta) {
          psMoveProject(project.id, delta);
        }, [psEdit, psDel]);
      });
      const psFunctionRows = psModulesOf('function').map(function (module, index, arr) {
        const on = moduleEnabled(state.settings, module.id);
        return psItemRow('function', module.id, module.name, index, arr.length, on, function (next) {
          if (!store) return;
          actionSetModule(store, module.id, { enabled: next });
        }, function (delta) {
          psMoveModule('function', module.id, delta);
        });
      });
      const psPanel = props.psOpen
        ? div(
          {
            key: 'pspanel',
            className: 'dtPsPanel',
            'data-dt': 'project-settings-panel',
            'data-open': '1',
            'data-items': String(psListRows.length + psProjectRows.length + psFunctionRows.length),
            'data-flip': psPlacement.value.flip === 'up' ? 'up' : undefined,
            style: Object.assign(
              {
                position: 'fixed',
                left: (psPos ? psPos.left : 8) + 'px',
                top: (psPos ? psPos.top : 8) + 'px',
                width: (psPos ? psPos.width : 300) + 'px',
                maxHeight: (psPos ? psPos.maxHeight : 600) + 'px'
              },
              { overflowY: 'auto' }
            ),
            role: 'dialog',
            'aria-label': '项目设置',
            ref: psPanelRef
          },
          psRow('ps-hide-reorder', '隐藏项目位置调整', railUI.hideReorder, 'hideReorder'),
          psRow('ps-hide-color', '隐藏项目颜色', railUI.hideColor, 'hideColor'),
          div({ key: 'div', className: 'dtPsDivider' }),
          psGroup('list', '清单', psListRows),
          psGroup('project', '项目', psProjectRows),
          psGroup('function', '功能区', psFunctionRows)
        )
        : null;

      /* 清单段：今天 / 最近 7 天 / 标签 / 全部未完成 / 已完成 / 已删除。
         标签项在 tag 视图与 tag:<name> 视图下都算「已激活」。 */
      const listItems = plan.list.map(function (module) {
        const view = module.id;
        const on = view === 'tags'
          ? (props.listView === 'tags' || String(props.listView || '').indexOf('tag:') === 0)
          : props.listView === view;
        return button(
          {
            key: view,
            className: 'dtRailItem' + (on ? ' dtRailOn' : ''),
            'data-dt': 'rail-' + view,
            'data-module': module.id,
            onClick: function () {
              props.onPick(view);
            }
          },
          span({ key: 'i', className: 'dtRailIcon' }, icon(module.icon || 'inbox', 15)),
          span({ key: 'l', className: 'dtRailLabel' }, module.name),
          span({ key: 'c', className: 'dtRailCount' }, String(counts[view] || 0))
        );
      });

      /* 项目段：项目组里不再出现 type=habit 的清单（习惯是 review 段的一级项）。
         t144：顺序由 settings.projectsOrder 决定（纯函数补全/剔除，§1.20.7）。 */
      const projectList = projectOrderOf(state.projects, state.settings)
        .map(function (id) {
          return state.projects.filter(function (project) { return project && project.id === id; })[0];
        })
        .filter(function (project) {
          /* t165：被面板隐藏的项目不占 rail 槽位，但仍留在面板里可再打开 */
          return !!project && !project.hidden;
        });

      const projectItems = projectList.map(function (project) {
        const open = tasks.filter(function (t) { return t.projectId === project.id && t.status === 0 && !t.deleted; }).length;
        const typeInfo = projectType(project.type);
        return div(
          Object.assign({ key: project.id, className: 'dtRailRow' }, rowAttrs('p:' + project.id, 'project')),
          showGrip ? railGrip('p:' + project.id, 'project') : null,
          button(
            {
              className: 'dtRailItem' + (props.listView === 'p:' + project.id ? ' dtRailOn' : ''),
              title: typeInfo.label,
              'data-project-id': project.id,
              'data-dt': 'rail-project',
              onClick: function () {
                props.onPick('p:' + project.id);
              }
            },
            project.icon
              ? span({ key: 'e', className: 'dtRailEmoji' }, project.icon)
              /* t83/F16：老记录里 project.color 存的是字面 hex，直接塞进 inline style 会绕过
                 主题变量（深浅两档取样完全相同）。这里统一过一遍读取侧归一：八色板档位
                 变成 var(--dt-project-*)，任意自定义色原样返回（不映射、不改库）。 */
              : (showDot
                ? span({ key: 'd', className: 'dtDot', style: { background: normalizeProjectColor(project.color) || 'var(--dsw-alias-brand-primary)' } })
                : null),
            span({ key: 'l', className: 'dtRailLabel' }, project.name),
            span({ key: 'c', className: 'dtRailCount' }, String(open))
          ),
          button(
            {
              className: 'dtRailMore',
              title: '清单设置',
              onClick: function () {
                props.onEditProject(project.id);
              }
            },
            '⋯'
          )
        );
      });

      const projectBlock = plan.project.length
        ? [
          div(
            { key: 'pt', className: 'dtRailGroupTitle' },
            span({ key: 't' }, plan.project[0].name || '项目'),
            span(
              { key: 'n', className: 'dtRailGroupCount' },
              String(projectList.length),
              div(
                { key: 'acts', className: 'dtRailTitleActions' },
                button(
                  {
                    className: 'dtRailAdd',
                    title: '项目设置',
                    'data-dt': 'project-settings',
                    'aria-label': '项目设置',
                    'aria-haspopup': 'dialog',
                    'aria-expanded': props.psOpen ? 'true' : 'false',
                    ref: psRef,
                    onClick: function () {
                      props.onTogglePs();
                    }
                  },
                  icon('sliders', 12)
                ),
                button(
                  {
                    className: 'dtRailAdd',
                    title: '新建清单',
                    'data-dt': 'rail-new-project',
                    onClick: function () {
                      props.onCreateProject();
                    }
                  },
                  icon('plus', 12)
                )
              )
            )
          ),
          psPanel,
          div({ key: 'pg', className: 'dtRailGroupInner' }, projectItems)
        ]
        : null;

      /* 功能区（t137）：四象限 / 日历 / 习惯打卡 / 必做之事 / 番茄钟 / 螺旋工作法。
         前四项落 B 栏（互斥替换，§1.2.3）；番茄钟与螺旋只切中间区，B、C 栏一律不动。
         两组在原五段模型里分属 review 与 timer，t136 合并成一段，段内顺序全交给注册表 railOrder。 */
      const FUNCTION_TIMER_IDS = ['pomodoro', 'spiral'];
      const functionItems = plan['function'].map(function (module) {
        const view = module.id;
        const isTimer = FUNCTION_TIMER_IDS.indexOf(view) >= 0;
        const on = props.listView === view;
        const extra = [];
        if (view === 'pomodoro') {
          extra.push(span({ key: 'c', className: 'dtRailCount' }, pomo.running ? fmtClock(pomoLeft) : String(pomo.count || 0)));
        }
        if (view === 'spiral') {
          extra.push(spiralBadge === null ? null : span({ key: 'c', className: 'dtRailCount' }, String(spiralBadge)));
        }
        if (view === 'onething' && counts.onething > 0) {
          extra.push(span({ key: 'b', className: 'dtRailBadge', 'data-onething-badge': '1' }, '1'));
        }
        const attrs = {
          key: view,
          className: 'dtRailItem' + (on ? ' dtRailOn' : ''),
          'data-dt': 'rail-' + view,
          'data-module': module.id,
          title: module.name,
          onClick: function () {
            if (isTimer) props.onPickTimer(view);
            else props.onPick(view);
          }
        };
        if (view === 'spiral') attrs['data-spiral-badge'] = spiralBadge === null ? undefined : String(spiralBadge);
        return div(
          Object.assign({ key: view, className: 'dtRailFnRow' }, rowAttrs(view, 'function')),
          showGrip ? railGrip(view, 'function') : null,
          button(
            attrs,
            span({ key: 'i', className: 'dtRailIcon' }, icon(module.icon || (isTimer ? 'timer' : 'flag'), 15)),
            span({ key: 'l', className: 'dtRailLabel' }, module.name),
            extra
          )
        );
      });

      /* 设置段：只有设置一项，走中间区 */
      const settingsItems = plan.settings.map(function (module) {
        return button(
          {
            key: module.id,
            className: 'dtRailItem' + (props.listView === 'settings' ? ' dtRailOn' : ''),
            'data-dt': 'rail-settings',
            'data-module': module.id,
            title: module.name,
            onClick: function () {
              props.onPick('settings');
            }
          },
          span({ key: 'i', className: 'dtRailIcon' }, icon(module.icon || 'gear', 15)),
          span({ key: 'l', className: 'dtRailLabel' }, module.name)
        );
      });

      const groups = {
        list: listItems.length ? div({ key: 'g-list', className: 'dtRailGroup', 'data-rail-group': 'list' }, listItems) : null,
        project: plan.project.length ? div({ key: 'g-project', className: 'dtRailGroup', 'data-rail-group': 'project' }, projectBlock) : null,
        'function': functionItems.length ? div({ key: 'g-function', className: 'dtRailGroup', 'data-rail-group': 'function' }, functionItems) : null,
        settings: settingsItems.length ? div({ key: 'g-settings', className: 'dtRailGroup', 'data-rail-group': 'settings' }, settingsItems) : null
      };

      /* t156 §1.21：立即行动按钮在 rail 顶部右侧（不是 B 栏标题区），
         开关复用既有 rec 模块（默认开，见 moduleDefaults），不新造第二套开关 */
      const railTop = [div({ key: 'title', className: 'dtRailTitle' }, '任务')];
      if (props.showActNow) {
        railTop.push(
          button(
            {
              key: 'act',
              type: 'button',
              className: 'dtRailRecBtn',
              'data-dt': 'rail-act-now',
              'aria-label': '立即行动',
              title: '立即行动',
              onClick: function () {
                props.onActNow();
              }
            },
            '立即行动'
          )
        );
      }
      /* §1.22（t160）：上方三段（清单 / 项目 / 功能区）进可滚动容器，设置段恒贴底。
         分隔线仍 3 条，分布改为「2 内 1 外」：list/project 之后各 1 条在容器内，
         function 之后那条留在容器外（data-rail-pin="1"），把功能区和设置切开——
         功能区末项紧贴设置时最容易点错，这条边界不能省。 */
      const scrollChildren = [];
      ['list', 'project'].forEach(function (key) {
        if (groups[key]) {
          scrollChildren.push(groups[key]);
          scrollChildren.push(div({ key: 'sep-' + key, className: 'dtRailSep' }));
        }
      });
      if (groups['function']) scrollChildren.push(groups['function']);
      const children = [
        div({ key: 'top', className: 'dtRailTop' }, railTop),
        div({ key: 'scroll', className: 'dtRailScroll', 'data-dt': 'rail-scroll' }, scrollChildren)
      ];
      if (groups['function']) {
        children.push(div({ key: 'sep-pin', className: 'dtRailSep', 'data-rail-pin': '1' }));
      }
      if (groups.settings) children.push(groups.settings);
      /* 键盘移动的播报容器（§1.20.6）：视觉上不可见，但必须常驻（aria-live 需要提前在树里） */
      children.push(div({ key: 'live', className: 'dtRailLive', 'data-dt': 'rail-order-live', 'aria-live': 'polite' }, liveText));

      return div({ className: 'dtRail' }, children);
    }

    function EmptyState(props) {
      /* §7-2 / t116：今天视图的空态是「默认内容为空」这一状态本身，挂规格钩子
         data-state="empty" 与 data-dt="empty-today"，其余清单空态不挂（避免断言把它们混为一谈）。 */
      const isToday = props.view === 'today';
      return div(
        {
          className: 'dtEmpty' + (isToday ? ' dtEmptyToday' : ''),
          'data-state': isToday ? 'empty' : undefined,
          'data-dt': isToday ? 'empty-today' : undefined
        },
        div({ className: 'dtEmptyTitle' }, props.title || '这里还没有任务'),
        div({ className: 'dtEmptyText' }, props.text || '用上方的输入框添加一条，或切换到其它清单。')
      );
    }

    /* 日期视图标题（§1.6）：`M月D日 周X · N 项`，W3 以下压缩成 `M月D日 · N 项`。 */
    function dateViewTitle(key, count, tier) {
      const day = parseISO(key);
      if (!day) return '日期';
      const base = (day.getMonth() + 1) + '月' + day.getDate() + '日';
      if (tier >= TIER_W3) return base + ' · ' + count + ' 项';
      return base + ' 周' + WEEK.charAt(day.getDay()) + ' · ' + count + ' 项';
    }

    /* 排序器选项（§4.2）：UI 只暴露规格里的七项；比较器本身支持 9 键（契约并集）。 */
    function sortKeyOptions() {
      return [
        option({ key: 'smart', value: 'smart' }, '智能排序'),
        option({ key: 'score', value: 'score' }, '按分数'),
        option({ key: 'date', value: 'date' }, '按日期'),
        option({ key: 'tag', value: 'tag' }, '按标签'),
        option({ key: 'priority', value: 'priority' }, '按优先级'),
        option({ key: 'created', value: 'created' }, '按创建时间'),
        option({ key: 'title', value: 'title' }, '按标题')
      ];
    }

    function groupOptions() {
      return [
        option({ key: 'none', value: 'none' }, '不分组'),
        option({ key: 'project', value: 'project' }, '按清单'),
        option({ key: 'status', value: 'status' }, '按状态'),
        option({ key: 'dateBucket', value: 'dateBucket' }, '按日期桶'),
        option({ key: 'tag', value: 'tag' }, '按标签')
      ];
    }

    const DATE_BUCKET_LABELS = {
      overdue: '已逾期',
      today: '今天',
      tomorrow: '明天',
      week: '本周',
      later: '以后',
      noDate: '无日期'
    };

    /* 组头文案：尽量用数据自己的名字（清单名 / 标签名），查不到才退回键名 */
    function groupHeadLabel(state, key, group) {
      if (group === 'project' || key === '') {
        if (!key) return '未分类';
        const found = (state.projects || []).find(function (p) { return p.id === key; });
        return found ? found.name : '未分类';
      }
      if (group === 'status') return key === 'done' ? '已完成' : '未完成';
      if (group === 'dateBucket') return DATE_BUCKET_LABELS[key] || key;
      if (group === 'tag') return key;
      return key;
    }

    function TaskListView(props) {
      const state = props.state;
      const store = props.store;
      const view = props.view;
      const query = props.query || '';
      const showDone = !!props.showDone;
      const [draft, setDraft] = useState('');

      const list = useMemo(function () {
        return filterTasks(state, view, query, showDone);
      }, [state, view, query, showDone]);

      const projectForNew = useMemo(function () {
        if (view.indexOf('p:') === 0) return view.slice(2);
        const inbox = state.projects.find(function (p) { return p.inbox; });
        return inbox ? inbox.id : (state.projects[0] ? state.projects[0].id : '');
      }, [state.projects, view]);

      /* 打卡清单的新任务默认每天重复，目标任务默认中优先级 */
      const typeDefaults = useMemo(function () {
        const project = state.projects.find(function (p) { return p.id === projectForNew; });
        const type = project ? project.type : 'todo';
        if (type === 'habit') return { repeat: 'DAILY' };
        if (type === 'goal') return { priority: 3 };
        return {};
      }, [state.projects, projectForNew]);

      const isDate = view.indexOf('date:') === 0;
      const dateKeyOfView = isDate ? view.slice(5) : '';
      const isProject = view.indexOf('p:') === 0;

      const contextDate = function () {
        if (view === 'today' || view === 'week') return dateKey(new Date());
        if (isDate) return dateKeyOfView;
        return '';
      };

      const submitDraft = function () {
        const text = draft.trim();
        if (!text) return;
        const created = addTask(store, Object.assign({
          title: text,
          projectId: projectForNew,
          date: contextDate(),
          allDay: true
        }, typeDefaults));
        setDraft('');
        if (props.onCreated) props.onCreated(created.id);
      };

      const limitReached = (view === 'done' || view === 'trash') && list.length > 300;
      const shown = limitReached ? list.slice(0, 300) : list;

      /* §4.4 第 4–5 步：分组与组内排序。前 3 步（视图过滤 / 搜索 / 含已完成）仍由
         filterTasks 完成——那是第一阶段就有的行为，逐字不动。 */
      const sortCfg = (state.settings.tasks && state.settings.tasks.sort) || { key: 'smart', dir: 'asc', group: 'none' };
      const groups = useMemo(function () {
        return arrangeTasks(state.db, shown, sortCfg, sortCfg.group, new Date());
      }, [state.db, shown, sortCfg.key, sortCfg.dir, sortCfg.group]);
      const showSortBar =
        view === 'today' || view === 'week' || view === 'open' || view === 'done' ||
        view.indexOf('p:') === 0 || view.indexOf('date:') === 0;
      const projectId = view.indexOf('p:') === 0 ? view.slice(2) : '';
      const [busy, setBusy] = useState(null);

      const applySort = function (patch) {
        actionSetTaskSort(store, Object.assign({}, sortCfg, patch));
      };

      /* 一键打分（§8.3）：候选=该清单未完成任务；每 50 条让出一次主线程，
         保证进度文案真的能被画出来。失败只累计 skipped，不中断整批。 */
      const runBulkScore = function () {
        if (busy || !projectId) return;
        const gridDb = state.db;
        const candidates = selectTasksByProject(gridDb, projectId).filter(function (task) {
          return task && !task.deleted && task.status === 0;
        });
        if (!candidates.length) {
          store.pushAlert({ id: uid('toast'), title: '该清单没有未完成任务', body: '', ttl: 4000 });
          return;
        }
        let index = 0;
        let scored = 0;
        let skipped = 0;
        let failed = 0;
        setBusy({ done: 0, total: candidates.length });
        const step = function () {
          const chunk = candidates.slice(index, index + 50);
          chunk.forEach(function (task) {
            let value;
            try {
              value = scoreTask(task, gridDb);
            } catch (err) {
              value = NaN;
            }
            if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 100) {
              failed += 1;
              return;
            }
            const result = actionSetScore(store, task.id, { score: value, source: 'auto', rubricVersion: SCORE_RUBRIC_VERSION });
            if (result && result.ok && result.scoreWrite && result.scoreWrite.skipped) skipped += 1;
            else if (result && result.ok) scored += 1;
            else skipped += 1;
          });
          index += chunk.length;
          setBusy({ done: Math.min(index, candidates.length), total: candidates.length });
          if (index < candidates.length) {
            setTimeout(step, 0);
            return;
          }
          setBusy(null);
          const parts = ['已为 ' + scored + ' 项打分，跳过 ' + skipped + ' 项（手动分）'];
          if (failed) parts.push(failed + ' 项无法打分');
          store.pushAlert({ id: uid('toast'), title: parts.join('；'), body: '', ttl: 4000 });
        };
        setTimeout(step, 0);
      };

      /* 顺序固定：搜索 → 含已完成（仅项目）→ 新建 → 收起（末位） */
      const headerExtra = [];

      headerExtra.push(
        div({ key: 'search', className: 'dtSearch' }, icon('search', 14), input({
          className: 'dtSearchInput',
          value: query,
          placeholder: '搜索任务',
          onChange: function (event) {
            if (props.onQuery) props.onQuery(event.target.value);
          }
        }))
      );

      if (isProject) {
        headerExtra.push(
          button(
            {
              key: 'toggle',
              className: 'dtMiniBtn' + (showDone ? ' dtMiniOn' : ''),
              onClick: function () {
                if (props.onToggleShowDone) props.onToggleShowDone(!showDone);
              }
            },
            showDone ? '隐藏已完成' : '含已完成'
          )
        );
      }

      headerExtra.push(
        button(
          {
            key: 'new',
            className: 'dtPrimaryBtn',
            onClick: function () {
              const created = addTask(store, Object.assign({
                title: '',
                projectId: projectForNew,
                date: contextDate(),
                allDay: true
              }, typeDefaults));
              if (props.onCreated) props.onCreated(created.id);
            }
          },
          icon('plus', 14),
          span({ key: 'l' }, '新建')
        )
      );

      if (projectId && props.showRec !== false) {
        headerExtra.push(
          button(
            Object.assign(
              {
                key: 'score',
                className: 'dtBlueBtn',
                'data-dt': 'score-batch',
                'data-dt-spec': 'bulk-score',
                'data-busy': busy ? '1' : undefined,
                disabled: busy ? true : undefined,
                title: busy ? '正在打分' : '一键打分'
              },
              scopedAction(store, runBulkScore)
            ),
            icon('spark', 13),
            span({ key: 'l', style: { marginLeft: '4px' } }, busy ? '打分中 ' + busy.done + '/' + busy.total : '一键打分')
          )
        );
      }

      /* t210 F3：已删除视图补「清空已删除」。计数只统计 deleted，不影响今天/未完成/已完成的条数。 */
      if (view === 'trash') {
        const trashCount = state.tasks.filter(function (t) { return !!t.deleted; }).length;
        headerExtra.push(
          button(
            {
              key: 'purge-all',
              className: 'dtGhostBtn dtTrashPurgeAll',
              'data-dt': 'trash-purge-all',
              'data-trash-count': String(trashCount),
              disabled: trashCount === 0 ? true : undefined,
              title: '清空已删除的任务',
              onClick: function () {
                if (!trashCount) return;
                if (!window.confirm('清空已删除的 ' + trashCount + ' 条任务？此操作不可恢复。')) return;
                state.tasks
                  .filter(function (t) { return !!t.deleted; })
                  .forEach(function (t) { destroyTask(store, t.id); });
              }
            },
            icon('trash', 13),
            span({ key: 'l', style: { marginLeft: '4px' } }, '清空已删除')
          )
        );
      }

      if (props.onCollapse) {
        headerExtra.push(
          button(
            {
              key: 'collapse',
              className: 'dtMiniBtn dtDrawerCollapse',
              'data-dt': 'drawer-collapse',
              title: '收起',
              'aria-label': '收起',
              onClick: function () {
                props.onCollapse();
              }
            },
            icon('close', 12),
            span({ key: 'l', style: { marginLeft: '4px' } }, '收起')
          )
        );
      }

      const canEdit = view !== 'done' && view !== 'trash';
      const title = isDate
        ? dateViewTitle(dateKeyOfView, list.length, props.tier || 0)
        : viewTitle(state, view);

      return div(
        { className: 'dtMain' },
        div(
          { key: 'head', className: 'dtHead' },
          div(
            { key: 'l', className: 'dtHeadLeft' },
            div({ key: 't', className: 'dtHeadTitle' }, title),
            div({ key: 'c', className: 'dtHeadCount' }, String(list.length) + ' 条' + (limitReached ? '（显示前 300）' : ''))
          ),
          div({ key: 'r', className: 'dtHeadRight' }, headerExtra)
        ),
        showSortBar
          ? div(
              { key: 'sort', className: 'dtSortBar', 'data-dt': 'sortbar', 'data-busy': busy ? '1' : undefined },
              select(
                {
                  className: 'dtSortSelect',
                  'data-dt': 'sort-key',
                  value: sortCfg.key,
                  disabled: busy ? true : undefined,
                  title: '排序方式',
                  onChange: function (event) {
                    applySort({ key: event.target.value });
                  }
                },
                sortKeyOptions()
              ),
              button(
                Object.assign(
                  {
                    key: 'dir',
                    className: 'dtSortDir',
                    'data-dt': 'sort-dir',
                    'data-dir': sortCfg.dir,
                    title: sortCfg.dir === 'desc' ? '当前降序，点击切升序' : '当前升序，点击切降序'
                  },
                  scopedAction(store, function () {
                    applySort({ dir: sortCfg.dir === 'desc' ? 'asc' : 'desc' });
                  })
                ),
                icon(sortCfg.dir === 'desc' ? 'arrow-down' : 'arrow-up', 13)
              ),
              select(
                {
                  className: 'dtSortSelect',
                  'data-dt': 'group-by',
                  value: sortCfg.group,
                  disabled: busy ? true : undefined,
                  title: '分组',
                  onChange: function (event) {
                    applySort({ group: event.target.value });
                  }
                },
                groupOptions()
              ),
              span({ key: 'count', className: 'dtSortCount', 'data-dt': 'sort-count' }, '共 ' + list.length + ' 项')
            )
          : null,
        canEdit
          ? div(
              { key: 'add', className: 'dtAddBar' },
              icon('plus', 14),
              input({
                className: 'dtAddInput',
                value: draft,
                placeholder: view === 'today' ? '添加今天的任务，回车保存' : '添加任务，回车保存',
                onChange: function (event) {
                  setDraft(event.target.value);
                },
                onKeyDown: function (event) {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitDraft();
                  }
                }
              }),
              draft.trim()
                ? button({ className: 'dtMiniBtn', onClick: submitDraft }, '保存')
                : null
            )
          : null,
        div(
          { key: 'list', className: 'dtList' },
          shown.length
            ? groups.reduce(function (acc, group) {
                const multi = groups.length > 1 || (group.key !== '' && sortCfg.group !== 'none');
                if (multi) {
                  acc.push(
                    div(
                      { key: 'g:' + group.key, className: 'dtGroupHead', 'data-group': group.key, 'data-count': String(group.tasks.length) },
                      groupHeadLabel(state, group.key, sortCfg.group)
                    )
                  );
                }
                group.tasks.forEach(function (task) {
                  acc.push(h(TaskRow, {
                    key: task.id,
                    task: task,
                    store: store,
                    state: state,
                    showScore: props.showScore,
                    active: props.activeId === task.id,
                    onOpen: canEdit ? props.onOpen : null
                  }));
                });
                return acc;
              }, [])
            : h(EmptyState, {
                view: view,
                title: isDate
                  ? '这一天还没有任务'
                  : view === 'done'
                    ? '还没有已完成的任务'
                    : view === 'trash'
                      ? '回收站是空的'
                      : view === 'today'
                        ? '今天还没有任务'
                        : '这个清单是空的',
                text: isDate
                  ? '点右上角 ＋ 新建'
                  : view === 'trash'
                    ? '删除的任务会先落到这里，可随时恢复。'
                    : '用上方输入框添加，或从其它清单里选一条。'
              })
        )
      );
    }

    /* ------------------------------------ 四象限（40） ----------------------------------- */

    function QuadrantItem(props) {
      const task = props.task;
      const pinned = props.pinned;
      return div(
        {
          className: 'dtQuadItem',
          'data-task-id': task.id,
          'data-pinned': pinned ? '1' : '0',
          'data-src': quadSrcOf(task)
        },
        h(TaskRow, {
          key: task.id,
          task: task,
          store: props.store,
          showScore: props.showScore,
          compact: true,
          quadView: true,
          active: props.active,
          onOpen: props.onOpen,
          onPin: props.onPin
        })
      );
    }

    function QuadrantView(props) {
      const state = props.state;
      const store = props.store;
      const today = new Date();
      const [stack, setStack] = useState(false);
      const rootRef = useRef(null);

      /* 单格可用宽度：抽屉宽 < 420px 时 2×2 折不动，转单列 4 行（与容器档位解耦，只看 B 抽屉自身宽度） */
      useEffect(function () {
        const node = rootRef.current;
        if (!node) return undefined;
        const update = function () {
          const width = node.getBoundingClientRect().width || node.clientWidth || 0;
          setStack(width > 0 && width < 420);
        };
        update();
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(update);
          observer.observe(node);
          return function () {
            observer.disconnect();
          };
        }
        window.addEventListener('resize', update);
        return function () {
          window.removeEventListener('resize', update);
        };
      }, []);

      const openTasks = state.tasks.filter(function (task) {
        return task.status === 0 && !task.deleted;
      });
      const pinnedTasks = openTasks.filter(function (task) {
        return isPinned(task, today);
      }).sort(compareOpen);
      const buckets = { q1: [], q2: [], q3: [], q4: [] };
      openTasks.forEach(function (task) {
        if (isPinned(task, today)) return;
        buckets[quadOf(task, today)].push(task);
      });
      Object.keys(buckets).forEach(function (key) {
        buckets[key].sort(compareOpen);
      });

      const pin = function (id) {
        const task = state.tasks.find(function (t) { return t.id === id; });
        const todayKey = dateKey(today);
        const nextPin = task && task.pinToday === todayKey ? '' : todayKey;
        patchTask(store, id, { pinToday: nextPin });
      };

      const cells = QUADRANTS.map(function (quad) {
        const items = buckets[quad.id];
        const count = quad.id === 'q1' ? items.length + pinnedTasks.length : items.length;
        const body = [];
        if (quad.id === 'q1' && pinnedTasks.length) {
          body.push(
            div(
              { key: 'pin', className: 'dtTodayPin', 'data-count': String(pinnedTasks.length) },
              div(
                { key: 't', className: 'dtTodayPinTitle' },
                icon('sun', 12),
                span({ key: 'l' }, '今日要事')
              ),
              pinnedTasks.map(function (task) {
                return h(QuadrantItem, {
                  key: task.id,
                  task: task,
                  pinned: true,
                  store: store,
                  active: props.activeId === task.id,
                  onOpen: props.onOpen,
                  onPin: pin
                });
              })
            )
          );
        }
        items.forEach(function (task) {
          body.push(
            h(QuadrantItem, {
              key: task.id,
              task: task,
              pinned: false,
              store: store,
              active: props.activeId === task.id,
              onOpen: props.onOpen,
              onPin: pin
            })
          );
        });
        if (!body.length) {
          body.push(div({ key: 'empty', className: 'dtQuadEmpty', 'data-quadrant': quad.id }, quad.empty));
        }
        return h(
          'section',
          {
            key: quad.id,
            className: 'dtQuadCell',
            'data-quadrant': quad.id,
            'data-count': String(count),
            'data-quad-color': quad.id.charAt(1) === '1' ? 'red' : quad.id.charAt(1) === '2' ? 'yellow' : quad.id.charAt(1) === '3' ? 'blue' : 'none',
            style: { '--dt-quad': QUAD_EDGE[quad.id] || 'transparent' }
          },
          h(
            'header',
            { className: 'dtQuadHead' },
            span({ className: 'dtQuadTitle dtQuadHeadTitle' }, quad.title),
            span({ className: 'dtQuadCount' }, String(count))
          ),
          div({ className: 'dtQuadBody', 'data-quadrant': quad.id }, body)
        );
      });

      return div(
        {
          className: 'dtQuad',
          ref: rootRef,
          'data-view': 'quad',
          'data-layout': stack ? 'stack' : 'grid',
          'data-today': dateKey(today)
        },
        div({ className: 'dtQuadGrid' }, cells)
      );
    }

    /* ------------------------------------ 面板容器 ----------------------------------- */

    /* 容器档位（与 CSS @container 同阈值）：W1 ≥1080 / W2 900–1079 / W3 720–899 / W4 560–719 / W5 <560。
       JS 侧只关心「是否让位中间区 / rail 是否转图标条」，视觉细节全交给 CSS。 */
    const TIER_W1 = 1;
    const TIER_W2 = 2;
    const TIER_W3 = 3;
    const TIER_W4 = 4;
    const TIER_W5 = 5;

    function tierOf(width) {
      if (!width) return TIER_W1;
      if (width >= 1080) return TIER_W1;
      if (width >= 900) return TIER_W2;
      if (width >= 720) return TIER_W3;
      if (width >= 560) return TIER_W4;
      return TIER_W5;
    }

    /* B 栏视图标题：与 TaskListView 内部口径保持一致（列表页用同一个纯函数） */
    function listViewLabel(state, view) {
      if (!view) return '';
      if (view === 'habit') return '习惯打卡';
      if (view === 'quadrant') return '四象限';
      if (view.indexOf('date:') === 0) return '日期';
      return viewTitle(state, view);
    }

    function detailOf(detail) {
      if (!detail) return { kind: '', id: '' };
      const cut = detail.indexOf(':');
      return { kind: detail.slice(0, cut), id: detail.slice(cut + 1) };
    }

    /* t127：先保证「永不空白」，再谈真因。
       三层兜底：①apply() 抛错 → 70-styles 的 catch 调 renderFatalPanel()；
                 ②渲染期抛错 → 本文件的 PanelBoundary（真实 React 走 componentDidCatch）；
                 ③数据损坏 → 00-prelude 备份原文 + 顶部提示条，面板照常启动。 */
    function fatalFirstLine(err) {
      if (!err) return '未知错误（无错误对象）';
      const msg = err && err.message ? String(err.message) : String(err);
      const line = msg.split('\n')[0];
      return line || '未知错误（错误信息为空）';
    }

    function fatalStackText(err) {
      if (!err || !err.stack) return '';
      return String(err.stack).split('\n').slice(0, 10).join('\n');
    }

    function resetLocalData() {
      try {
        const view = typeof window !== 'undefined' ? window : null;
        const ok = !view || typeof view.confirm !== 'function' || view.confirm('确定要重置本地数据并重载吗？任务、清单与设置都会丢失。');
        if (!ok) return;
        if (view && view.localStorage) view.localStorage.removeItem(STORE_KEY);
      } catch (err) {
        /* 清不掉也继续重载，至少不再卡在空白 */
      }
      try {
        if (typeof window !== 'undefined' && window.location && window.location.reload) window.location.reload();
      } catch (err) {
        /* 无 location 的宿主里保持当前页面 */
      }
    }

    /* 崩溃卡是「样式注入都还没跑成」时唯一能画出来的东西，所以这里的圆角与内边距**刻意写字面值**：
       dt-tokens 由 injectStyles 注入，走 apply 失败这条路径时它们可能压根没进表，
       再引用 var(--dt-r-card)/var(--dt-sp-N) 会二次失败（整张卡片退化成无样式块）。
       color/background/border 仍用宿主别名——那三个由宿主提供，不依赖我们的注入。 */
    const FATAL_CARD_STYLE = 'padding:18px 20px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;'
      + 'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);max-width:640px;margin:24px auto;';

    function FatalCard(props) {
      const err = props.error || null;
      const stack = fatalStackText(err);
      const retry = props.onRetry;
      return div(
        {
          className: 'dtFatal',
          'data-dt': 'fatal',
          'data-fatal': props.code || 'RENDER_FAILED',
          style: FATAL_CARD_STYLE
        },
        div({ key: 't', className: 'dtFatalTitle', style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } },
          props.title || '任务面板加载失败'),
        div({ key: 'm', className: 'dtFatalText', 'data-dt': 'fatal-msg', style: { fontSize: '13px', lineHeight: 1.6, wordBreak: 'break-word' } },
          fatalFirstLine(err)),
        stack
          ? h('details', { key: 's', style: { marginTop: '10px' } },
              h('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, '调用栈（前 10 行）'),
              h('pre', {
                className: 'dtFatalStack',
                'data-dt': 'fatal-stack',
                style: { margin: '8px 0 0', padding: '8px', borderRadius: '8px', background: 'var(--dsw-alias-bg-base)' }
                  + 'font-size:var(--dt-fs-micro);line-height:1.5;white-space:pre-wrap;word-break:break-all;'
                  + 'color:var(--dsw-alias-label-secondary);max-height:220px;overflow:auto;'
              }, stack))
          : null,
        div({ key: 'a', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } },
          retry
            ? button({
                key: 'r',
                type: 'button',
                className: 'dtGhostBtn',
                'data-dt': 'fatal-retry',
                onClick: function () { retry(); }
              }, '重试渲染')
            : null,
          button({
            key: 'x',
            type: 'button',
            className: 'dtDangerBtn',
            'data-dt': 'fatal-reset',
            onClick: function () { resetLocalData(); }
          }, '重置本地数据并重载'))
      );
    }

    /* apply() 级别的兜底入口（由 70-styles 的 catch 调用）：仍然产出一个完整 .dtRoot，
       宿主把它挂到 main 插槽上，用户看到的是卡片而不是白屏。 */
    function renderFatalPanel(err) {
      return div(
        {
          className: 'dtRoot',
          'data-count': '0',
          'data-dt': 'fatal-root',
          style: { display: 'block', padding: '0 12px' }
        },
        h(FatalCard, { error: err, code: 'APPLY_FAILED' })
      );
    }

    /* 真实 React 走类组件 componentDidCatch（能接住子树渲染期异常）；
       测试桩没有 React.Component，退化成「内联调用 + try/catch」，两条路径给同一张卡片。 */
    const HAS_CLASS_BOUNDARY = typeof React.Component === 'function';

    const PanelBoundaryClass = HAS_CLASS_BOUNDARY
      ? class PanelBoundary extends React.Component {
        constructor(boundaryProps) {
          super(boundaryProps);
          this.state = { error: null };
          this.retry = this.retry.bind(this);
        }
        static getDerivedStateFromError(error) {
          return { error: error };
        }
        componentDidCatch(error, info) {
          try {
            console.error('[dsh-tasks] 面板渲染失败', error, info && info.componentStack);
          } catch (err) {
            /* 控制台不可用时忽略 */
          }
        }
        retry() {
          this.setState({ error: null });
        }
        render() {
          if (this.state.error) {
            return div({ className: 'dtRoot', 'data-count': '0', 'data-dt': 'fatal-root' },
              h(FatalCard, { error: this.state.error, onRetry: this.retry }));
          }
          return this.props.children;
        }
      }
      : null;

    function TasksPanelInner(props) {
      const store = props.store;
      const state = useStoreState(store);
      /* 主题（§5）：user 直接返回，system 读宿主底色后再回退媒体查询；
         解析结果落在 .dtRoot 的 data-dt-theme / data-dt-theme-src 上，CSS 只认前者。 */
      /* 主题在渲染期直接解析：settings.theme 一变，下一次渲染就是新值。
         不放进 state 的原因——解析是纯计算，放 state 会多一次渲染，且订阅回调之外
         的任何 settings 变更（导入、迁移、恢复快照）都不会被 state 捕获。 */
      const themeInfo = resolveTheme(state.settings);
      /* 系统模式的解析依据（stage4 §5.3 / t54 要求「宿主给了」与「媒体查询回退」可区分）：
         55-theme.js 的 resolveTheme 只给 src=user|system，改它不在 t54 inScope，
         所以这里补一个只读探测：能读到宿主 html 的实际底色 → host；读不到 → media；都不可用 → none。
         只判「读没读到不透明底色」，亮度判定仍由 55-theme 负责，不重复实现一套真源。 */
      const themeBasis = (function () {
        if (themeInfo.src !== 'system') return 'user';
        try {
          const view = typeof window !== 'undefined' ? window : null;
          const root = view && view.document && view.document.documentElement ? view.document.documentElement : null;
          if (root && view.getComputedStyle) {
            const bg = view.getComputedStyle(root).backgroundColor;
            if (typeof bg === 'string' && bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return 'host';
          }
        } catch (err) {
          /* 读不到就走媒体查询 */
        }
        try {
          const view = typeof window !== 'undefined' ? window : null;
          if (view && typeof view.matchMedia === 'function') {
            const media = view.matchMedia('(prefers-color-scheme: dark)');
            if (media && typeof media.matches === 'boolean') return 'media';
          }
        } catch (err) {
          /* 都不可用 */
        }
        return 'none';
      })();
      /* 迁移/损坏的致命提示（§3.8）：loadState 把错误码挂在这里，面板整体换成一行说明，
         数据仍在（坏原文已另存），绝不静默清空。 */
      const [fatal, setFatal] = useState(null);
      useEffect(function () {
        const code = consumeFatal();
        if (code) setFatal(code);
      }, []);
      /* t127：数据损坏提示（可关闭）。解析/迁移失败时 00-prelude 已经备份原文并改用种子，
         这里只负责把「发生过什么」告诉用户，不再整屏替换。 */
      const [broken, setBroken] = useState(function () {
        return consumeBrokenNotice();
      });
      const brokenBar = broken
        ? div(
          {
            key: 'broken-notice',
            className: 'dtBrokenNotice',
            'data-dt': 'broken-notice',
            'data-broken': broken,
            role: 'status',
            style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 10px 0', padding: '8px 10px', borderRadius: '8px' }
              // 原 12.5，归到 meta 档（五档阶梯里没有 12.5 这一档，就近取 meta=12px，视觉上仅差 0.5px）
              + 'background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);line-height:1.5;'
          },
          span({ key: 't', style: { flex: '1 1 auto' } }, '本地数据损坏，已备份并用迁移快照启动'),
          button(
            Object.assign(
              {
                key: 'x',
                type: 'button',
                className: 'dtIconBtn',
                'data-dt': 'broken-close',
                title: '关闭',
                'aria-label': '关闭提示'
              },
              scopedAction(store, function () { setBroken(null); })
            ),
            icon('close', 12)
          )
        )
        : null;
      /* 系统主题监听（§5）：只有 src==='system' 时才真的注册；回调只做一个「踢一脚」，
         真正的解析在渲染期完成，避免回调与渲染各存一份真相。 */
      const [, setThemeTick] = useState(0);
      useEffect(function () {
        return subscribeSystemTheme(state.settings, function () {
          setThemeTick(function (n) { return n + 1; });
        });
      }, [state.settings.theme]);
      /* §8.2 一次性种子：把 build.mjs 注入的离线分（seed.scores）灌进分数库，并落
         db.meta.scoreSeed 标记。放在面板挂载时做而不是 loadState 里，是因为 00-prelude
         不在本卡 inScope；actionApplySeedScores 自身幂等（已导入直接返回、不提交、
         不写盘），重复挂载不会重复写入，也不会覆盖用户手调分。 */
      useEffect(function () {
        actionApplySeedScores(store);
      }, []);
      /* §7.2 番茄日志：订阅 store 侦测「work 段结束」并写 db.pomodoroLog，顺带做 400 天裁剪
         与 §6.5 的音效接线。20-engines / 00-prelude 不在本卡 inScope，所以挂在面板挂载时
         （与上面种子分同一处置）；installPomoLog 自身幂等，重复挂载只绑一次监听。 */
      useEffect(function () {
        installPomoLog(store);
      }, []);
      /* §P6 日历叠加：旧单选值（settings.calendar.mode）一次性迁成复选组合，幂等标记
         overlayMigrated 保证重复挂载不再写库（51-db 不在本卡 inScope，迁移函数放 64-calendar）。 */
      useEffect(function () {
        installCalendarOverlays(store);
      }, []);
      /* 两列模型（§1.1）：listView 只有一个值，detail 也只有一个值；A 栏与页签已删除。 */
      /* 默认 B 栏 = today（t105 三栏模型：没有中间区，首屏必须有内容） */
      const [listView, setListView] = useState('today');
      const [detail, setDetail] = useState(null);
      const [query, setQuery] = useState('');
      const [showDone, setShowDone] = useState(false);
      const [habitArchived, setHabitArchived] = useState(false);
      const [toasts, setToasts] = useState([]);
      const [projDialog, setProjDialog] = useState(null);
      const [width, setWidth] = useState(0);
      const [dense, setDense] = useState(false);
      /* t144：项目设置浮层开合（§1.20.1）。浮层状态放 TasksPanel，点面板外才关得掉 */
      const [psOpen, setPsOpen] = useState(false);
      const rootRef = useRef(null);

      useEffect(function () {
        const node = rootRef.current;
        if (!node) return undefined;
        const update = function () {
          setWidth(node.getBoundingClientRect().width || node.clientWidth || 0);
        };
        update();
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(update);
          observer.observe(node);
          return function () {
            observer.disconnect();
          };
        }
        window.addEventListener('resize', update);
        return function () {
          window.removeEventListener('resize', update);
        };
      }, []);

      /* B 栏自身宽度决定是否压缩行内副信息（§2.4 降级阶梯③）。
         观察的是抽屉节点而不是容器，所以与档位解耦。 */
      useEffect(function () {
        if (!listView) return undefined;
        const node = rootRef.current && rootRef.current.querySelector
          ? rootRef.current.querySelector('.dtDrawer[data-slot="b"]')
          : null;
        if (!node) return undefined;
        const update = function () {
          const w = node.getBoundingClientRect().width || node.clientWidth || 0;
          setDense(w > 0 && w < 240);
        };
        update();
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(update);
          observer.observe(node);
          return function () {
            observer.disconnect();
          };
        }
        return undefined;
      }, [listView, detail]);

      const tier = tierOf(width);
      const dataCount = (listView ? 1 : 0) + (detail ? 1 : 0);
      /* 中间区让位：W2 及以下且两栏同开（§2.4 降级阶梯①），只让位不卸载 */
      const squeezed = dataCount === 2;
      /* rail 转图标条：<776 且 B+C 同开（§2.4 降级阶梯②） */
      const iconRail = dataCount === 2 && width > 0 && width < 776;

      /* B 栏关掉后焦点要落在空态容器上（tabIndex=-1），否则键盘用户会掉到 DOM 外。 */
      const emptyRef = useRef(null);
      useEffect(function () {
        if (listView) return;
        const node = emptyRef.current;
        if (node && typeof node.focus === 'function') {
          try { node.focus(); } catch (err) { /* 宿主不允许聚焦时忽略 */ }
        }
      }, [listView]);

      const closeAll = function () {
        setListView(null);
        setDetail(null);
      };
      const closeDetail = function () {
        setDetail(null);
      };

      /* 点 rail 内容项（§1.2 点击语义表）：同 id 再点收起（连带 C）；换一个则替换 B 并清空 C。
         不变式 D4：rail 入口永不写 detail，两条写入路径都置 null。 */
      const onPick = function (view) {
        if (!view) return;
        if (listView === view) {
          closeAll();
          return;
        }
        setListView(view);
        setDetail(null);
      };

      /* 计时项开关（§1.2.3）：判据只认 ui.listView 这一个真源，不设历史栈。
         点未激活 → 写该项；点已激活的螺旋/设置 → 回默认页 pomodoro；
         点已激活的番茄钟（本身就是默认页）→ no-op 唯一例外。
         计时项一律不动 detail（§1.2.4 / §8-72）。 */
      const onPickTimer = function (view) {
        if (!view) return;
        if (listView === view) {
          if (view === 'pomodoro') return;
          setListView('pomodoro');
          return;
        }
        setListView(view);
      };

      const onPickDate = function (key) {
        if (!key) return;
        const view = 'date:' + key;
        if (listView === view) {
          closeAll();
          return;
        }
        setListView(view);
        setDetail(null);
      };

      /* 点 B 里的条目：只写 detail，不改 listView（不变式 D3），同值再点取消 */
      const onOpenDetail = function (kind, id) {
        if (!id) return;
        const next = kind + ':' + id;
        setDetail(detail === next ? null : next);
      };

      /* Esc 分层（§1.2.1）：捕获层只消费浮层（菜单/弹窗/新建条展开态），
         冒泡层按 C → B 的顺序各消费一层，两层互不越权。 */
      const listViewRef = useRef(null);
      const detailRef = useRef(null);
      listViewRef.current = listView;
      detailRef.current = detail;
      useEffect(function () {
        const onKey = function (event) {
          if (event.key !== 'Escape') return;
          if (escTargetInField(event.target)) return;
          if (!closeTopOverlay()) return;
          event.preventDefault();
          event.stopPropagation();
        };
        document.addEventListener('keydown', onKey, true);
        return function () {
          document.removeEventListener('keydown', onKey, true);
        };
      }, []);

      useEffect(function () {
        const onKey = function (event) {
          if (event.key !== 'Escape') return;
          if (escTargetInField(event.target)) return;
          if (detailRef.current) {
            setDetail(null);
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (listViewRef.current) {
            setListView(null);
            event.preventDefault();
            event.stopPropagation();
          }
        };
        document.addEventListener('keydown', onKey);
        return function () {
          document.removeEventListener('keydown', onKey);
        };
      }, []);

      useEffect(function () {
        const push = function (item) {
          setToasts(function (list) {
            const next = list.filter(function (x) {
              return x.id !== item.id;
            });
            next.push(item);
            return next;
          });
        };
        const unsubscribe = store.toastBus.add(push);
        const pending = store.drainPending ? store.drainPending() : [];
        pending.forEach(push);
        return unsubscribe;
      }, [store]);

      const dismiss = function (id) {
        setToasts(function (list) {
          return list.filter(function (item) {
            return item.id !== id;
          });
        });
      };

      /* 模块开关快照（§2.6 / t52）：一次算全，rail、B 栏、蓝按钮、权重环都读它。 */
      const flags = moduleFlags(state.settings);
      /* 关掉某个模块后，它开着的视图必须立刻消失——这里不做 setState（会与渲染顺序打架），
         而是在渲染层把 listView 折成 null：B 栏不渲染、data-count 也随之降档，
         而组件状态里的 listView 留着，用户重新打开模块时视图原样回来。 */
      const listEnabled = !listView || flags[moduleOfListView(listView)] !== false;

      const dialogProject = projDialog && projDialog.id
        ? state.projects.find(function (p) { return p.id === projDialog.id; }) || null
        : null;

      const shownDetail = detailOf(detail);
      const detailTask = shownDetail.kind === 'task'
        ? state.tasks.find(function (t) { return t.id === shownDetail.id; }) || null
        : null;
      const detailHabit = shownDetail.kind === 'habit'
        ? (state.habits || []).find(function (h) { return h.id === shownDetail.id; }) || null
        : null;

      /* B 栏内容（§1.3）：清单 / 标签 / 习惯 / 四象限 / 日历 / 必做之事。
         同一时刻只有一个来源，rail 点新的替换旧的（§1.2.4）。 */
      const isHabitView = listView === 'habit';
      const isQuadView = listView === 'quadrant';
      const isCalendarView = listView === 'calendar';
      const isOneThingView = listView === 'onething';
      const isResistanceView = listView === 'resistance';
      const isTagsView = listView === 'tags' || String(listView || '').indexOf('tag:') === 0;
      const isPomodoroView = listView === 'pomodoro';
      const isSpiralView = listView === 'spiral';
      const isActNowView = listView === 'actnow';
      const isSettingsView = listView === 'settings';
      const bKind = isPomodoroView
        ? 'pomodoro'
        : isSpiralView
          ? 'spiral'
          : isSettingsView
            ? 'settings'
            : isHabitView
        ? 'habit'
        : isQuadView
          ? 'quadrant'
          : isCalendarView
            ? 'calendar'
            : isTagsView
              ? 'tags'
              : isOneThingView
                ? 'onething'
                : isResistanceView
                  ? 'resistance'
                  : 'list';

      let bBody = null;
      if (isPomodoroView) {
        bBody = h(PomodoroView, { key: 'pomodoro', state: state, store: store });
      } else if (isSpiralView) {
        bBody = h(SpiralView, { key: 'spiral', state: state, store: store });
      } else if (isSettingsView) {
        bBody = h(SettingsView, { key: 'settings', state: state, store: store });
      } else if (isTagsView) {
        bBody = h(TagsView, {
          key: 'tagsview',
          state: state,
          store: store,
          view: listView,
          tier: tier,
          showScore: flags.score !== false,
          activeId: shownDetail.kind === 'task' ? shownDetail.id : '',
          onOpenTask: function (id) {
            onOpenDetail('task', id);
          },
          onPickTag: function (name) {
            setListView('tag:' + name);
            setDetail(null);
          },
          onCollapse: closeAll
        });
      } else if (isActNowView) {
        bBody = h(ActNowPanel, {
          key: 'actnow',
          state: state,
          store: store,
          onOpenDetail: function (id) {
            onOpenDetail('task', id);
          },
          onCollapse: closeAll
        });
      } else if (isResistanceView) {
        bBody = h(ResistanceBoard, {
          key: 'resistance',
          state: state,
          store: store,
          onCollapse: closeAll
        });
      } else if (isOneThingView) {
        bBody = h(OneThingBoard, {
          key: 'onething',
          state: state,
          store: store,
          onOpenDetail: function (id) {
            onOpenDetail('task', id);
          },
          onCollapse: closeAll
        });
      } else if (isCalendarView) {
        bBody = div(
          { key: 'calendar', className: 'dtBStack' },
          div(
            { key: 'head', className: 'dtHead' },
            div({ key: 'l', className: 'dtHeadLeft' }, div({ key: 't', className: 'dtHeadTitle' }, '日历')),
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
                  onClick: closeAll
                },
                icon('close', 14)
              )
            )
          ),
          h(CalendarView, {
            key: 'cal',
            state: state,
            store: store,
            drawerOpen: true,
            tier: tier,
            onPickDate: onPickDate
          })
        );
      } else if (isHabitView) {
        bBody = h(HabitPanel, {
          key: 'habit',
          state: state,
          store: store,
          query: query,
          onQuery: setQuery,
          showArchived: habitArchived,
          onToggleArchived: function () {
            setHabitArchived(!habitArchived);
          },
          onCollapse: closeAll,
          onOpenHabit: function (id) {
            onOpenDetail('habit', id);
          },
          activeId: shownDetail.kind === 'habit' ? shownDetail.id : ''
        });
      } else if (isQuadView) {
        bBody = div(
          { key: 'quad', className: 'dtBStack' },
          div(
            { key: 'head', className: 'dtHead' },
            div({ key: 'l', className: 'dtHeadLeft' }, div({ key: 't', className: 'dtHeadTitle' }, '四象限')),
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
                  onClick: closeAll
                },
                icon('close', 14)
              )
            )
          ),
          h(QuadrantView, {
            key: 'view',
            state: state,
            store: store,
            showScore: flags.score !== false,
            activeId: shownDetail.kind === 'task' ? shownDetail.id : '',
            onOpen: function (id) {
              onOpenDetail('task', id);
            }
          })
        );
      } else {
        bBody = div(
          { key: 'liststack', className: 'dtBStack' },
          h(OneThingStrip, {
            key: 'onething-strip',
            state: state,
            store: store,
            onOpenDetail: function (id) {
              onOpenDetail('task', id);
            }
          }),
          h(TaskListView, {
          key: 'list',
          state: state,
          store: store,
          view: listView,
          tier: tier,
          showScore: flags.score !== false,
          showRec: flags.rec !== false,
          query: query,
          onQuery: setQuery,
          showDone: showDone,
          onToggleShowDone: setShowDone,
          activeId: shownDetail.kind === 'task' ? shownDetail.id : '',
          onOpen: function (id) {
            onOpenDetail('task', id);
          },
          onCreated: function (id) {
            onOpenDetail('task', id);
          },
          onCollapse: closeAll
          })
        );
      }

      const activeView = listEnabled ? listView : null;
      const slotB = activeView
        ? div(
            {
              key: 'b',
              className: 'dtDrawer',
              'data-slot': 'b',
              'data-kind': bKind,
              'data-view': activeView,
              'data-drawer-view': activeView,
              'data-squeezed': squeezed ? '1' : undefined,
              'data-dense': dense ? '1' : undefined
            },
            bBody
          )
        : null;

      const detailTitle = detailHabit
        ? detailHabit.name
        : detailTask
          ? (detailTask.title || '任务详情')
          : '';

      const slotC = detail && (detailTask || detailHabit)
        ? div(
            {
              key: 'c',
              className: 'dtDrawer',
              'data-slot': 'c',
              'data-kind': shownDetail.kind,
              'data-detail-view': detail
            },
            div(
              { key: 'head', className: 'dtHead' },
              div({ key: 'l', className: 'dtHeadLeft' }, div({ key: 't', className: 'dtHeadTitle' }, detailTitle)),
              div(
                { key: 'r', className: 'dtHeadRight' },
                /* 单任务番茄的第二个入口（stage4 §7.1）：C 栏详情头 26×26。
                   与行内的 row-pomo 同一套点击语义，被螺旋互斥挡住时禁用但不隐藏。 */
                shownDetail.kind === 'task'
                  ? button(
                      {
                        key: 'pm',
                        type: 'button',
                        className: 'dtIconBtn dtDetailPomo',
                        'data-dt': 'detail-pomo',
                        'data-task-id': detailTask.id,
                        disabled: pomoBusyWithSpiral(state),
                        'aria-disabled': pomoBusyWithSpiral(state) ? 'true' : undefined,
                        title: pomoBusyWithSpiral(state) ? '螺旋工作法运行中' : '对该任务开始番茄',
                        onClick: function () {
                          pomoToggleForTask(store, detailTask.id);
                        }
                      },
                      icon('timer', 14)
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
                    onClick: closeDetail
                  },
                  icon('close', 14)
                )
              )
            ),
            shownDetail.kind === 'task'
              ? h(TaskDetail, {
                  key: detailTask.id,
                  task: detailTask,
                  store: store,
                  projects: state.projects,
                  onClose: closeDetail
                })
              : h(HabitDetail, {
                  key: detailHabit.id,
                  habit: detailHabit,
                  store: store,
                  onClose: closeDetail
                })
          )
        : null;

      const zoneChildren = [];
      if (slotB) zoneChildren.push(slotB);
      if (slotC) zoneChildren.push(slotC);

      /* 致命状态（迁移失败 / 模块 id 重复）时整块换成说明，不再渲染两列骨架；
         数据本身没被动过，用户仍可从设置页导出或从备份恢复。 */
      if (fatal) {
        return div(
          {
            className: 'dtRoot',
            ref: rootRef,
            'data-count': '0',
            'data-dt-theme': themeInfo.theme,
            'data-dt-theme-src': themeInfo.src,
            'data-dt-theme-basis': themeBasis,
            onMouseDown: stopActionEvent,
            onPointerDown: stopActionEvent,
            onClick: stopActionEvent
          },
          brokenBar,
          h(FatalCard, {
            key: 'fatal',
            code: fatal,
            title: fatal === 'MIGRATE_FAILED' ? '数据无法读取，已用初始数据启动' : '模块配置有误',
            error: {
              message: fatal === 'MIGRATE_FAILED'
                ? '原始数据已另存到 localStorage（键 dsh.tasks.v1.broken，另有带时间戳的历史键），没有被删除；修复后可导出排查。'
                : '左侧栏已隐藏有问题的模块，其余功能不受影响。'
            }
          })
        );
      }

      return div(
        {
          className: 'dtRoot',
          ref: rootRef,
          'data-rail': iconRail ? 'icon' : undefined,
          'data-count': String(dataCount),
          'data-dt-theme': themeInfo.theme,
          'data-dt-theme-src': themeInfo.src,
          'data-dt-theme-basis': themeBasis,
          /* §1.2.2 容器兜底：叶子各自截停之外，.dtRoot 自身再截一层，
             否则面板里的死区点击会冒到 document，被宿主当成「面板外一击」而收起整个面板。 */
          /* t144：点「项目设置」浮层之外任意处关闭它（§1.20.1 关闭三入口之一）。
             不新增 document 监听——静态扫描把 src/parts 的 addEventListener 行数钉死在 7 条。 */
          onMouseDown: function (event) {
            if (psOpen) {
              const target = event && event.target;
              const inside = target && target.closest
                ? target.closest('[data-dt="project-settings-panel"],[data-dt="project-settings"]')
                : null;
              if (!inside) setPsOpen(false);
            }
            stopActionEvent(event);
          },
          onPointerDown: stopActionEvent,
          onClick: stopActionEvent,
          /* P0 面板自行退回：只截停鼠标三类还不够，滚轮/触摸/滚动仍会冒到宿主，
             宿主据“连续滚动”收起面板。补三类，且**只 stopPropagation、不 preventDefault**，
             否则 .dtQuad{overflow:auto} 与 .dtList 的内部滚动会被一起禁掉。
             刻意不挂 onKeyDown：那会掐断 document 层的两层 Esc（关浮层/关抽屉）。 */
          onWheel: stopActionEvent,
          onScroll: stopActionEvent,
          onTouchMove: stopActionEvent
        },
        brokenBar,
        h(Rail, {
          state: state,
          flags: flags,
          store: store,
          psOpen: psOpen,
          onTogglePs: function () {
            setPsOpen(!psOpen);
          },
          onClosePs: function () {
            setPsOpen(false);
          },
          listView: listView,
          onPick: onPick,
          onPickTimer: onPickTimer,
          showActNow: flags.rec !== false,
          onActNow: function () {
            /* 同值再点回「今天」：B 栏不留一个点不掉的面板 */
            setListView(listView === 'actnow' ? 'today' : 'actnow');
            setDetail(null);
          },
          onCreateProject: function () {
            setProjDialog({ id: '' });
          },
          onEditProject: function (id) {
            setProjDialog({ id: id });
          },
          onDeleteProject: function (id) {
            const target = state.projects.filter(function (p) { return p && p.id === id; })[0];
            if (!target) return;
            /* 与 ProjectDialog 里的删除同文案同语义：任务移到收集箱，不清 tasks[i].projectId。 */
            if (!window.confirm('删除清单「' + target.name + '」？里面的任务会移到收集箱，不会丢。')) return;
            removeProject(store, id);
            /* 正在看的就是它：回「今天」，不留一个指向已删清单的空 B 栏。 */
            if (listView === 'p:' + id) {
              setListView('today');
              setDetail(null);
            }
          }
        }),
        /* A→B→C 三栏（t105 用户口径）：没有「中间区」，rail 点开的功能就渲染在 B 栏，
           B 里点条目才出 C；B 关掉时给一个可断言的空态，不留白板。 */
        dataCount > 0
          ? div({ className: 'dtDrawerZone', 'data-count': String(dataCount), key: 'zone' }, zoneChildren)
          : div(
            {
              key: 'b-empty',
              className: 'dtBEmpty',
              'data-b-empty': '1',
              ref: emptyRef,
              tabIndex: -1
            },
            div({ key: 't', className: 'dtBEmptyTitle' }, '选择左侧任一功能'),
            div({ key: 's', className: 'dtBEmptyText' }, '清单、项目、标签、四象限、日历、习惯打卡、必做之事，以及番茄钟 / 螺旋 / 设置都在这里打开。')
          ),
        projDialog
          ? div({ className: 'dtScrim', key: 'scrim' })
          : null,
        projDialog
          ? h(ProjectDialog, {
              key: projDialog.id || 'new-project',
              store: store,
              project: dialogProject,
              onClose: function () {
                setProjDialog(null);
              },
              onSaved: function (id) {
                setListView('p:' + id);
                setDetail(null);
              },
              onDeleted: function (id) {
                /* S7c-7：删掉「正在看的那条清单」时落点必须是「今天」，不是空态。
                   原实现在这里调 closeAll()（setListView(null)）→ B 栏落到
                   「选择左侧任一功能」空态，与规格「回今天」不符；ps-del 那条链路
                   早就是 setListView('today')，两条入口必须同落点。
                   删的是别的清单（listView !== 'p:'+id）时视图一律不动。 */
                if (listView !== 'p:' + id) return;
                setListView('today');
                setDetail(null);
              }
            })
          : null,
        div(
          { className: 'dtToastLayer' },
          toasts.map(function (item) {
            return h(Toast, { key: item.id, item: item, store: store, onDismiss: dismiss });
          })
        )
      );
    }

    /* t127：对外的面板组件。真实 React 走类边界；测试桩退化成内联 try/catch。
       两条路径给同一张 FatalCard，所以回归里不会因为「类组件」变红。 */
    function TasksPanel(props) {
      if (HAS_CLASS_BOUNDARY) {
        return h(PanelBoundaryClass, null, h(TasksPanelInner, props));
      }
      const [error, setError] = useState(null);
      const retry = function () { setError(null); };
      if (error) {
        return div({ className: 'dtRoot', 'data-count': '0', 'data-dt': 'fatal-root' },
          h(FatalCard, { error: error, onRetry: retry }));
      }
      try {
        return TasksPanelInner(props);
      } catch (err) {
        return div({ className: 'dtRoot', 'data-count': '0', 'data-dt': 'fatal-root' },
          h(FatalCard, { error: err, onRetry: retry }));
      }
    }
