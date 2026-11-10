    /* ============================== 68-obstacle · 绊脚石 / 禁止清单 ==============================
       docs/stage3-goals.md §2.1–2.2 的落地：一条绊脚石 = 一次「今天是什么挡住了我」的手记，
       含名称、时长、日期（今天/昨天/任选一天）；禁止清单是同一份数据的聚合视图，不是第二份存储。

       四条硬口径：
       1. 全部手记，**不做任何推断归类**（不猜「你在刷手机」，用户写什么就是什么）；
       2. 存储只有一个源：`db.obstacles = [{ id, label, minutes, at, taskId, note, createdAt }]`，
          其中 `at` 是 'YYYY-MM-DD'（日期口径，不是时间戳），`createdAt` 用于同一天内排序；
       3. 禁止清单按 label 聚合近 14 天：先按累计时长降序，并列再按次数降序、最后按名称；
          Top3 进大卡并给占比，第 4 名起进观察区并算「还差 N 分钟进 Top3」；
       4. 样本不足 `OBSTACLE_SAMPLE_MIN` 条不出榜（只给引导），避免一条记录就封神。 */

    const OBSTACLE_PRESETS = ['刷手机', '刷短剧', '看抖音', '逛淘宝', '打游戏', '刷小红书', '刷视频号', '发呆'];
    const OBSTACLE_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120];
    const OBSTACLE_WINDOW_DAYS = 14;
    const OBSTACLE_TOPN = 3;
    const OBSTACLE_SAMPLE_MIN = 3;

    /* 一条记录的最小合法形状；脏数据（缺 label / 时长为负）在读时就被丢掉，不进任何聚合。 */
    function obstacleEntry(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      if (!label) return null;
      const minutes = Math.round(Number(raw.minutes));
      if (!isFinite(minutes) || minutes <= 0) return null;
      const at = typeof raw.at === 'string' && parseISO(raw.at) ? raw.at : '';
      if (!at) return null;
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : 'obs:' + at + ':' + label,
        label: label,
        minutes: Math.min(1440, minutes),
        at: at,
        taskId: typeof raw.taskId === 'string' ? raw.taskId : '',
        note: typeof raw.note === 'string' ? raw.note : '',
        createdAt: Number(raw.createdAt) || 0
      };
    }

    /* 全部记录，按日期倒序 + 同日按 createdAt 倒序（最新的一笔在最上面）。 */
    function obstacleEntries(db) {
      const list = isPlainObject(db) && Array.isArray(db.obstacles) ? db.obstacles : [];
      const rows = [];
      list.forEach(function (raw) {
        const entry = obstacleEntry(raw);
        if (entry) rows.push(entry);
      });
      rows.sort(function (a, b) {
        if (a.at !== b.at) return a.at < b.at ? 1 : -1;
        return b.createdAt - a.createdAt;
      });
      return rows;
    }

    /* 可选项 = 预置 ∪ 已出现过的名称（自填过的自动沉淀成备选，去重保序）。 */
    function obstacleLabelOptions(db) {
      const seen = [];
      OBSTACLE_PRESETS.forEach(function (name) {
        if (seen.indexOf(name) < 0) seen.push(name);
      });
      obstacleEntries(db).forEach(function (row) {
        if (seen.indexOf(row.label) < 0) seen.push(row.label);
      });
      return seen;
    }

    /* 近 N 天按 label 聚合：{ rows:[{label,minutes,count,share,lastAt}], total, sample }。 */
    function obstacleAggregate(db, now) {
      const clock = now instanceof Date ? now : new Date();
      const from = dateKey(addDays(clock, -(OBSTACLE_WINDOW_DAYS - 1)));
      const to = dateKey(clock);
      const buckets = {};
      const order = [];
      let total = 0;
      let sample = 0;
      obstacleEntries(db).forEach(function (row) {
        if (row.at < from || row.at > to) return;
        sample += 1;
        total += row.minutes;
        if (!buckets[row.label]) {
          buckets[row.label] = { label: row.label, minutes: 0, count: 0, lastAt: row.at };
          order.push(row.label);
        }
        const bucket = buckets[row.label];
        bucket.minutes += row.minutes;
        bucket.count += 1;
        if (row.at > bucket.lastAt) bucket.lastAt = row.at;
      });
      const rows = order.map(function (label) {
        const bucket = buckets[label];
        return {
          label: bucket.label,
          minutes: bucket.minutes,
          count: bucket.count,
          lastAt: bucket.lastAt,
          share: total > 0 ? Math.round((bucket.minutes / total) * 100) : 0
        };
      });
      rows.sort(function (a, b) {
        if (b.minutes !== a.minutes) return b.minutes - a.minutes;
        if (b.count !== a.count) return b.count - a.count;
        return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
      });
      return { rows: rows, total: total, sample: sample };
    }

    /* 榜单：Top3 + 观察区（含「还差 N 分钟」）。样本不足时 enough=false，界面上只出引导。 */
    function obstacleRank(db, now) {
      const agg = obstacleAggregate(db, now);
      const enough = agg.sample >= OBSTACLE_SAMPLE_MIN;
      const top = enough ? agg.rows.slice(0, OBSTACLE_TOPN) : [];
      const rest = enough ? agg.rows.slice(OBSTACLE_TOPN) : [];
      const edge = top.length ? top[top.length - 1].minutes : 0;
      const watch = rest.map(function (row) {
        const gap = Math.max(1, edge - row.minutes);
        return Object.assign({}, row, { gap: gap });
      });
      return {
        top: top,
        watch: watch,
        rows: agg.rows,
        total: agg.total,
        sample: agg.sample,
        enough: enough,
        edge: edge,
        need: Math.max(0, OBSTACLE_SAMPLE_MIN - agg.sample)
      };
    }

    /* 唯一写出口：与 commitTags 同形（先算新数组，再整体落库并刷新索引）。 */
    function commitObstacle(store, mutate) {
      store.update(function (state) {
        const db = state.db;
        const nextList = mutate(db, state);
        if (!nextList) return null;
        return Object.assign({}, state, {
          db: Object.assign({}, db, {
            obstacles: nextList,
            meta: Object.assign({}, db.meta, { updatedAt: Date.now() })
          })
        });
      });
      if (typeof invalidateDbIndex === 'function') invalidateDbIndex();
    }

    function actionAddObstacle(store, input) {
      const fields = isPlainObject(input) ? input : {};
      const label = typeof fields.label === 'string' ? fields.label.trim() : '';
      if (!label) return { ok: false, code: 'OBSTACLE_INVALID', message: '先写一条「挡住了我什么」' };
      const minutes = Math.round(Number(fields.minutes));
      if (!isFinite(minutes) || minutes <= 0) return { ok: false, code: 'OBSTACLE_INVALID', message: '时长要大于 0 分钟' };
      const at = typeof fields.at === 'string' && parseISO(fields.at) ? fields.at : dateKey(new Date());
      const entry = {
        id: uid('obs'),
        label: label,
        minutes: Math.min(1440, minutes),
        at: at,
        taskId: typeof fields.taskId === 'string' ? fields.taskId : '',
        note: typeof fields.note === 'string' ? fields.note : '',
        createdAt: Date.now()
      };
      commitObstacle(store, function (db) {
        const list = obstacleEntries(db).map(function (row) { return Object.assign({}, row); });
        list.push(entry);
        return list;
      });
      return { ok: true, id: entry.id };
    }

    function actionPatchObstacle(store, id, patch) {
      if (!id) return { ok: false, code: 'OBSTACLE_NOT_FOUND', message: '记录不存在' };
      const fields = isPlainObject(patch) ? patch : {};
      let hit = false;
      commitObstacle(store, function (db) {
        const list = obstacleEntries(db).map(function (row) {
          if (row.id !== id) return row;
          hit = true;
          const next = Object.assign({}, row);
          if (typeof fields.label === 'string' && fields.label.trim()) next.label = fields.label.trim();
          if (fields.minutes !== undefined) {
            const minutes = Math.round(Number(fields.minutes));
            if (isFinite(minutes) && minutes > 0) next.minutes = Math.min(1440, minutes);
          }
          if (typeof fields.at === 'string' && parseISO(fields.at)) next.at = fields.at;
          if (typeof fields.note === 'string') next.note = fields.note;
          return next;
        });
        return hit ? list : null;
      });
      if (!hit) return { ok: false, code: 'OBSTACLE_NOT_FOUND', message: '记录不存在' };
      return { ok: true };
    }

    function actionRemoveObstacle(store, id) {
      if (!id) return { ok: false, code: 'OBSTACLE_NOT_FOUND', message: '记录不存在' };
      let hit = false;
      commitObstacle(store, function (db) {
        const rows = obstacleEntries(db);
        const list = rows.filter(function (row) {
          if (row.id === id) {
            hit = true;
            return false;
          }
          return true;
        }).map(function (row) { return Object.assign({}, row); });
        return hit ? list : null;
      });
      if (!hit) return { ok: false, code: 'OBSTACLE_NOT_FOUND', message: '记录不存在' };
      return { ok: true };
    }

    /* 记录日期的显示口径：今天 / 昨天 / M月D日（与清单日期同款，避免出现两种写法）。 */
    function obstacleDayLabel(at, now) {
      const clock = now instanceof Date ? now : new Date();
      if (at === dateKey(clock)) return '今天';
      if (at === dateKey(addDays(clock, -1))) return '昨天';
      const d = parseISO(at);
      return d ? fmtDateLabel(d, clock) : at;
    }

    /* 禁止清单大卡：有榜单出 Top3 + 观察区，无榜单出引导。绊脚石视图里也复用这一块。 */
    function ProhibitCard(props) {
      const rank = props.rank;
      const head = div(
        { key: 'h', className: 'dtProhibitHead' },
        div({ key: 't', className: 'dtProhibitTitle' }, '禁止清单'),
        div({ key: 's', className: 'dtProhibitSub' }, '近 ' + OBSTACLE_WINDOW_DAYS + ' 天 · 按累计时长排序')
      );
      if (!rank.enough) {
        return div(
          { className: 'dtProhibitCard', 'data-prohibit-card': '1', 'data-prohibit-enough': '0' },
          head,
          div(
            { key: 'e', className: 'dtProhibitEmpty', 'data-prohibit-empty': '1' },
            div({ key: 'a', className: 'dtProhibitEmptyTitle' }, '还没攒够样本'),
            div(
              { key: 'b', className: 'dtProhibitEmptyText' },
              '再记 ' + rank.need + ' 次就够排序（至少 ' + OBSTACLE_SAMPLE_MIN + ' 条）· 现在共 ' + rank.sample + ' 条、' + rank.total + ' 分钟'
            )
          )
        );
      }
      const top = rank.top.map(function (row, index) {
        return div(
          {
            key: row.label,
            className: 'dtProhibitRow dtProhibitTop',
            'data-prohibit-rank': String(index + 1),
            'data-label': row.label,
            'data-minutes': String(row.minutes),
            'data-count': String(row.count),
            'data-share': String(row.share)
          },
          span({ key: 'r', className: 'dtProhibitRank' }, String(index + 1)),
          span({ key: 'l', className: 'dtProhibitLabel' }, row.label),
          span(
            { key: 'b', className: 'dtProhibitBar' },
            span({ className: 'dtProhibitBarFill', style: { width: Math.max(4, row.share) + '%' } })
          ),
          span({ key: 'm', className: 'dtProhibitMin' }, '累计 ' + row.minutes + ' 分钟 · ' + row.count + ' 次'),
          span({ key: 'p', className: 'dtProhibitShare' }, '占比 ' + row.share + '%')
        );
      });
      const watch = rank.watch.map(function (row) {
        return div(
          {
            key: row.label,
            className: 'dtProhibitWatchRow',
            'data-prohibit-watch': '1',
            'data-label': row.label,
            'data-minutes': String(row.minutes),
            'data-gap': String(row.gap)
          },
          span({ key: 'l', className: 'dtProhibitWatchLabel' }, row.label),
          span({ key: 'm', className: 'dtProhibitWatchMin' }, '累计 ' + row.minutes + ' 分钟 · ' + row.count + ' 次'),
          span({ key: 'g', className: 'dtProhibitWatchGap' }, '还差 ' + row.gap + ' 分钟进 Top3')
        );
      });
      return div(
        { className: 'dtProhibitCard', 'data-prohibit-card': '1', 'data-prohibit-enough': '1' },
        head,
        div({ key: 'l', className: 'dtProhibitList', 'data-prohibit-list': '1' }, top),
        watch.length
          ? div(
            { key: 'w', className: 'dtProhibitWatch' },
            div({ key: 't', className: 'dtProhibitWatchTitle' }, '观察区 · 第 ' + (OBSTACLE_TOPN + 1) + ' 名起'),
            div({ key: 'r', className: 'dtProhibitWatchList', 'data-prohibit-watch-list': '1' }, watch)
          )
          : null,
        div({ key: 'f', className: 'dtProhibitFoot' }, '样本 ' + rank.sample + ' 条 · 合计 ' + rank.total + ' 分钟')
      );
    }

    /* 绊脚石面板：mode='obstacle' 出「记录 + 流水 + 榜单」，mode='prohibit' 只出榜单。 */
    function ObstacleBoard(props) {
      const state = props.state;
      const store = props.store;
      const now = new Date();
      const mode = props.mode === 'prohibit' ? 'prohibit' : 'obstacle';
      const rows = obstacleEntries(state.db);
      const rank = obstacleRank(state.db, now);
      const options = obstacleLabelOptions(state.db);
      const [label, setLabel] = useState('');
      const [minutes, setMinutes] = useState('15');
      const [day, setDay] = useState(dateKey(now));
      const [editing, setEditing] = useState('');
      const [draftLabel, setDraftLabel] = useState('');
      const [draftMinutes, setDraftMinutes] = useState('15');
      const [draftDay, setDraftDay] = useState('');

      const resetForm = function () {
        setLabel('');
        setMinutes('15');
        setDay(dateKey(new Date()));
      };

      const submit = function () {
        const res = actionAddObstacle(store, { label: label, minutes: Number(minutes), at: day });
        if (!res.ok) {
          store.pushAlert({ id: uid('toast'), title: res.message || '没有记下', body: '', ttl: 4000 });
          return;
        }
        store.pushAlert({ id: uid('toast'), title: '已记下「' + label.trim() + '」' + minutes + ' 分钟', body: '', ttl: 3000 });
        resetForm();
      };

      const startEdit = function (row) {
        setEditing(row.id);
        setDraftLabel(row.label);
        setDraftMinutes(String(row.minutes));
        setDraftDay(row.at);
      };

      const commitEdit = function (id) {
        setEditing('');
        const res = actionPatchObstacle(store, id, { label: draftLabel, minutes: Number(draftMinutes), at: draftDay });
        if (!res.ok) store.pushAlert({ id: uid('toast'), title: res.message || '修改失败', body: '', ttl: 4000 });
      };

      const removeRow = function (row) {
        actionRemoveObstacle(store, row.id);
        store.pushAlert({ id: uid('toast'), title: '已删除「' + row.label + '」的记录', body: '', ttl: 3000 });
      };

      const chips = options.slice(0, 10).map(function (name) {
        return button(
          Object.assign({
            key: name,
            type: 'button',
            className: 'dtObsChip' + (label === name ? ' dtObsChipOn' : ''),
            'data-dt': 'obs-preset',
            'data-label': name,
            'data-on': label === name ? '1' : undefined,
            title: '用「' + name + '」记一笔',
            onClick: function () { setLabel(name); }
          }, scopedAction(store, function () { setLabel(name); }))
        );
      });

      const dayButtons = [
        { key: dateKey(now), text: '今天' },
        { key: dateKey(addDays(now, -1)), text: '昨天' }
      ].map(function (item) {
        return button(
          Object.assign({
            key: item.key,
            type: 'button',
            className: 'dtMiniBtn dtObsDay' + (day === item.key ? ' dtMiniOn' : ''),
            'data-dt': 'obs-day',
            'data-day': item.key,
            'data-on': day === item.key ? '1' : undefined,
            onClick: function () { setDay(item.key); }
          }, scopedAction(store, function () { setDay(item.key); }))
        );
      });

      const form = div(
        { className: 'dtObsForm', 'data-dt': 'obs-form' },
        div({ key: 't', className: 'dtObsFormTitle' }, '今天是什么挡住了我？'),
        div({ key: 'c', className: 'dtObsChips' }, chips),
        div(
          { key: 'r', className: 'dtObsFormRow' },
          input({
            key: 'i',
            className: 'dtObsInput',
            'data-dt': 'obs-label',
            type: 'text',
            placeholder: '或自己写一条（会沉淀成备选）',
            value: label,
            onChange: function (e) { setLabel(e.target.value); }
          }),
          select(
            {
              key: 'm',
              className: 'dtObsSelect',
              'data-dt': 'obs-minutes',
              value: minutes,
              onChange: function (e) { setMinutes(e.target.value); }
            },
            OBSTACLE_MINUTES.map(function (value) {
              return option({ key: value, value: String(value) }, value + ' 分钟');
            })
          )
        ),
        div(
          { key: 'd', className: 'dtObsFormRow' },
          div({ key: 'b', className: 'dtObsDays' }, dayButtons),
          input({
            key: 'x',
            className: 'dtObsDate',
            'data-dt': 'obs-date',
            type: 'date',
            value: day,
            onChange: function (e) { if (e.target.value) setDay(e.target.value); }
          }),
          button(
            Object.assign({
              key: 'a',
              type: 'button',
              className: 'dtPrimaryBtn',
              'data-dt': 'obs-add',
              disabled: !label.trim(),
              onClick: submit
            }, scopedAction(store, submit))
            , '记下这一笔'
          )
        )
      );

      const list = rows.map(function (row) {
        const isEditing = editing === row.id;
        return div(
          {
            key: row.id,
            className: 'dtObsRow',
            'data-obstacle-row': '1',
            'data-id': row.id,
            'data-label': row.label,
            'data-minutes': String(row.minutes),
            'data-day': row.at
          },
          isEditing
            ? div(
              { key: 'e', className: 'dtObsEditRow' },
              input({
                key: 'l',
                className: 'dtObsInput',
                'data-dt': 'obs-edit-label',
                type: 'text',
                value: draftLabel,
                onChange: function (e) { setDraftLabel(e.target.value); }
              }),
              select(
                {
                  key: 'm',
                  className: 'dtObsSelect',
                  'data-dt': 'obs-edit-minutes',
                  value: draftMinutes,
                  onChange: function (e) { setDraftMinutes(e.target.value); }
                },
                OBSTACLE_MINUTES.map(function (value) {
                  return option({ key: value, value: String(value) }, value + ' 分钟');
                })
              ),
              input({
                key: 'd',
                className: 'dtObsDate',
                'data-dt': 'obs-edit-date',
                type: 'date',
                value: draftDay,
                onChange: function (e) { if (e.target.value) setDraftDay(e.target.value); }
              }),
              button(
                Object.assign({
                  key: 's',
                  type: 'button',
                  className: 'dtMiniBtn dtMiniOn',
                  'data-dt': 'obs-edit-save',
                  onClick: function () { commitEdit(row.id); }
                }, scopedAction(store, function () { commitEdit(row.id); }))
                , '保存'
              ),
              button(
                Object.assign({
                  key: 'c',
                  type: 'button',
                  className: 'dtMiniBtn',
                  'data-dt': 'obs-edit-cancel',
                  onClick: function () { setEditing(''); }
                }, scopedAction(store, function () { setEditing(''); }))
                , '取消'
              )
            )
            : div(
              { key: 'v', className: 'dtObsViewRow' },
              span({ key: 'l', className: 'dtObsRowLabel' }, row.label),
              span({ key: 'm', className: 'dtObsRowMin' }, row.minutes + ' 分钟'),
              span({ key: 'd', className: 'dtObsRowDay' }, obstacleDayLabel(row.at, now)),
              row.note ? span({ key: 'n', className: 'dtObsRowNote' }, row.note) : null,
              button(
                Object.assign({
                  key: 'e',
                  type: 'button',
                  className: 'dtMiniBtn',
                  'data-dt': 'obs-edit',
                  'data-obs-edit': '1',
                  onClick: function () { startEdit(row); }
                }, scopedAction(store, function () { startEdit(row); }))
                , '改'
              ),
              button(
                Object.assign({
                  key: 'x',
                  type: 'button',
                  className: 'dtMiniBtn dtMiniDanger',
                  'data-dt': 'obs-del',
                  'data-obs-del': '1',
                  onClick: function () { removeRow(row); }
                }, scopedAction(store, function () { removeRow(row); }))
                , '删'
              )
            )
        );
      });

      const rowsBlock = div(
        { className: 'dtObsRows', 'data-obstacle-rows': '1', 'data-count': String(rows.length) },
        rows.length
          ? list
          : div(
            { key: 'e', className: 'dtObsEmpty', 'data-obs-empty': '1' },
            div({ key: 'a' }, '还没有记录'),
            div({ key: 'b', className: 'dtObsEmptyText' }, '上面选一个常见的，或自己写一条 —— 记满 ' + OBSTACLE_SAMPLE_MIN + ' 条就能排出禁止清单。')
          )
      );

      const head = div(
        { key: 'head', className: 'dtHead' },
        div(
          { key: 'l', className: 'dtHeadLeft' },
          div({ key: 't', className: 'dtHeadTitle' }, mode === 'prohibit' ? '禁止清单' : '绊脚石'),
          div({ key: 's', className: 'dtHeadSub' }, mode === 'prohibit' ? '由绊脚石自动聚合' : '挡住我的事，记一笔')
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

      if (mode === 'prohibit') {
        return div({ className: 'dtObsBoard dtObsBoardProhibit', 'data-obstacle-board': 'prohibit' }, head, div({ key: 'b', className: 'dtObsBody' }, ProhibitCard({ rank: rank })));
      }

      return div(
        { className: 'dtObsBoard', 'data-obstacle-board': 'obstacle' },
        head,
        div(
          { key: 'b', className: 'dtObsBody' },
          form,
          rowsBlock,
          ProhibitCard({ rank: rank })
        )
      );
    }
