
    /* ============================== 59-taskinfo · C 栏信息框（P5） ==============================
      规格 docs/stage4-foundation.md §9.1 / §9.2：

      · 信息框挂在任务详情里、既有字段之后、「删除任务」之前，三块：补充说明 / 执行步骤 / 长文本附件；
        全部经 53-actions 的 actionSetTaskNote / actionAddStep / actionPatchStep / actionRemoveStep /
        actionMoveStep / actionSetTaskDocs 落库——**输入框不直接改 task 对象**，这样白名单校验与
        meta.updatedAt、索引失效都走同一条写路径。
      · 唯一蓝按钮（§9.2）：一次请求两件事（润色标题 + 拆解步骤），结果一律「待确认」：
        [应用] 才写、[放弃] 什么都不写、应用后可 [恢复原值]（快照只存活到本次会话的这一次应用）。
        半成功是合法结果：只有 steps 时标题逐字不动并在条上写「未生成新标题」。
      · 未配置密钥不是灰掉（契约要求「可用降级路径」）：按钮照常可点，走 57-agent 的本地规则
        润色/拆解，并在条上说明「已用本地规则生成」。
      · 钩子：契约要 data-dt="agent-action"、规格写 data-dt="agent-polish"，两个都给
        （第二个挂 data-dt-spec），并把按钮放在信息框底部的动作区（契约说「C 栏底部」）。 */

    const section = mk('section');

    function taskInfoSteps(task) {
      return Array.isArray(task && task.steps) ? task.steps : [];
    }

    function taskInfoDocs(task) {
      return Array.isArray(task && task.docs) ? task.docs : [];
    }

    function TaskInfo(props) {
      const task = props.task;
      const store = props.store;

      const [noteDraft, setNoteDraft] = useState(task.detailNote || '');
      const [stepDraft, setStepDraft] = useState('');
      const [docDraft, setDocDraft] = useState(taskInfoDocs(task));
      const [busy, setBusy] = useState(false);
      const [agentState, setAgentState] = useState('idle');
      const [agentCode, setAgentCode] = useState('');
      const [agentMessage, setAgentMessage] = useState('');
      const [result, setResult] = useState(null);
      const [snapshot, setSnapshot] = useState(null);

      /* 切换任务时把草稿对齐到新的任务，避免把上一条的备注写进这一条 */
      useEffect(
        function () {
          setNoteDraft(task.detailNote || '');
          setDocDraft(taskInfoDocs(task));
          setStepDraft('');
          setResult(null);
          setSnapshot(null);
          setAgentState('idle');
          setAgentCode('');
          setAgentMessage('');
        },
        [task.id]
      );

      const steps = taskInfoSteps(task);
      const docs = taskInfoDocs(task);

      const commitNote = function () {
        const current = typeof task.detailNote === 'string' ? task.detailNote : '';
        if (noteDraft === current) return;
        actionSetTaskNote(store, task.id, noteDraft);
      };

      const addStep = function () {
        const text = String(stepDraft || '').trim();
        if (!text) return;
        actionAddStep(store, task.id, text);
        setStepDraft('');
      };

      const commitDocs = function (next) {
        setDocDraft(next);
        actionSetTaskDocs(store, task.id, next);
      };

      const projectNameOf = function (state, projectId) {
        const list = state && state.db && Array.isArray(state.db.projects) ? state.db.projects : [];
        const found = list.filter(function (project) {
          return project.id === projectId;
        })[0];
        return found ? found.name : '';
      };

      const runAgent = function () {
        if (busy) return;
        const state = store && store.get ? store.get() : null;
        const cfg = agentConfigOf(state && state.settings);
        const missing = agentMissing(cfg);
        setResult(null);
        setSnapshot(null);

        /* §8-98：off 是用户的明确选择，不是配置缺失。走本地规则但**不进错误态**：
           不带 data-code、不出现重试按钮、不用错误色。判据只能是 agentSourceOf，
           不能推论（比如「模型字段空」）——默认 source 就是 dsh、model 默认非空。 */
        if (agentSourceOf(state && state.settings) === 'off') {
          const localTitle = agentLocalPolish(task.title);
          const localSteps = agentLocalSplit(task);
          setAgentState('off');
          setAgentCode('');
          setAgentMessage('已关闭模型调用：整理与打分走本地规则，不会发出任何请求。');
          setResult({ title: localTitle, steps: localSteps, local: true });
          return;
        }

        /* 降级路径：配置缺失或 Base URL 不安全 → 本地规则，且不说这是模型结果 */
        if (missing.length || !agentBaseAllowed(cfg.apiBase)) {
          const localTitle = agentLocalPolish(task.title);
          const localSteps = agentLocalSplit(task);
          setAgentState('local');
          setAgentCode(missing.length ? 'AGENT_CONFIG' : 'AGENT_BASE');
          setAgentMessage(
            missing.length
              ? '未配置' + missing.join('、') + '，已用本地规则生成（在「设置 → 服务商与模型」填写后可调用模型）'
              : '接口地址必须是 https:// 或 http://localhost，已用本地规则生成'
          );
          setResult({ title: localTitle, steps: localSteps, local: true });
          return;
        }

        setBusy(true);
        setAgentState('busy');
        setAgentCode('');
        setAgentMessage('处理中…');
        agentRun(cfg, task, projectNameOf(state, task.projectId)).then(function (res) {
          setBusy(false);
          if (!res.ok) {
            setAgentState('error');
            setAgentCode(res.code || 'AGENT_NETWORK');
            setAgentMessage(res.message || '请求失败');
            return;
          }
          const data = res.data || { title: '', steps: [] };
          setResult({ title: data.title || '', steps: Array.isArray(data.steps) ? data.steps : [] });
          setAgentState('ok');
          setAgentCode('');
          setAgentMessage(
            data.title
              ? '模型已返回，待你确认（标题与 ' + (data.steps || []).length + ' 条步骤）'
              : '未生成新标题，只拆出 ' + (data.steps || []).length + ' 条步骤'
          );
        });
      };

      const applyResult = function () {
        if (!result) return;
        const prevTitle = task.title;
        const stepIds = [];
        if (result.title && result.title !== task.title) {
          actionPatchTask(store, task.id, { title: result.title });
        }
        (result.steps || []).forEach(function (text) {
          const added = actionAddStep(store, task.id, text);
          if (added && added.ok && added.id) stepIds.push(added.id);
        });
        setSnapshot({ title: prevTitle, stepIds: stepIds });
        setAgentState('applied');
        setAgentCode('');
        setAgentMessage(
          result.title ? '已应用：标题已更新，新增 ' + stepIds.length + ' 条步骤' : '已应用：只新增 ' + stepIds.length + ' 条步骤（标题未生成）'
        );
      };

      const discardResult = function () {
        setResult(null);
        setSnapshot(null);
        setAgentState('idle');
        setAgentCode('');
        setAgentMessage('');
      };

      const restoreResult = function () {
        if (!snapshot) return;
        actionPatchTask(store, task.id, { title: snapshot.title });
        (snapshot.stepIds || []).forEach(function (id) {
          actionRemoveStep(store, task.id, id);
        });
        setSnapshot(null);
        setResult(null);
        setAgentState('idle');
        setAgentCode('');
        setAgentMessage('已恢复应用前的标题与步骤');
      };

      /* ------------------------------- 补充说明 ------------------------------- */
      const noteBlock = section(
        { className: 'dtInfoNote' },
        div({ className: 'dtInfoHead' }, span({ className: 'dtInfoTitle' }, '补充说明'), span({ className: 'dtInfoHint' }, (noteDraft || '').length + '/8000')),
        textarea({
          className: 'dtInfoText',
          'data-f': 'detailNote',
          rows: 4,
          maxLength: 8000,
          placeholder: '背景、约束、参考链接…（失焦即保存）',
          value: noteDraft,
          onChange: function (event) {
            setNoteDraft(event.target.value);
          },
          onBlur: commitNote,
          onKeyDown: function (event) {
            if (event.key === 'Escape') {
              /* 不写盘：恢复原值，并截停 Esc，避免顺手把 C 栏关掉 */
              stopActionEvent(event);
              setNoteDraft(task.detailNote || '');
            }
          }
        })
      );

      /* ------------------------------- 执行步骤 ------------------------------- */
      const stepRows = steps.map(function (step, index) {
        return div(
          {
            key: step.id || 'step-' + index,
            className: 'dtStep' + (step.done ? ' dtStepDone' : ''),
            'data-step-id': step.id,
            'data-done': step.done ? '1' : '0'
          },
          button(
            Object.assign(
              {
                className: 'dtStepCheck',
                'data-dt': 'step-toggle',
                title: step.done ? '标记为未完成' : '标记为已完成',
                'aria-pressed': step.done ? 'true' : 'false'
              },
              scopedAction(store, function () {
                actionPatchStep(store, task.id, step.id, { done: !step.done });
              })
            ),
            step.done ? icon('check', 12) : span({ className: 'dtStepDot' })
          ),
          span({ className: 'dtStepText' }, step.text || '(空步骤)'),
          button(
            Object.assign(
              {
                className: 'dtStepOp',
                'data-dt': 'step-up',
                title: '上移',
                disabled: index === 0
              },
              scopedAction(store, function () {
                actionMoveStep(store, task.id, step.id, 'up');
              })
            ),
            '↑'
          ),
          button(
            Object.assign(
              {
                className: 'dtStepOp',
                'data-dt': 'step-down',
                title: '下移',
                disabled: index === steps.length - 1
              },
              scopedAction(store, function () {
                actionMoveStep(store, task.id, step.id, 'down');
              })
            ),
            '↓'
          ),
          button(
            Object.assign(
              { className: 'dtStepOp dtStepDel', 'data-dt': 'step-remove', title: '删除这一步' },
              scopedAction(store, function () {
                actionRemoveStep(store, task.id, step.id);
              })
            ),
            '×'
          )
        );
      });

      const stepsBlock = section(
        { className: 'dtInfoSteps' },
        div(
          { className: 'dtInfoHead' },
          span({ className: 'dtInfoTitle' }, '执行步骤'),
          span({ className: 'dtInfoHint', 'data-dt': 'step-count' }, steps.filter(function (s) { return s.done; }).length + '/' + steps.length)
        ),
        steps.length
          ? div({ className: 'dtSteps' }, stepRows)
          : div({ className: 'dtInfoEmpty', 'data-dt': 'step-empty' }, '还没有步骤。可以点下面的蓝按钮拆解，也可以手写一步。'),
        div(
          { className: 'dtStepAdd' },
          input({
            className: 'dtInfoInput',
            'data-dt': 'step-input',
            type: 'text',
            placeholder: '添加一步',
            value: stepDraft,
            onChange: function (event) {
              setStepDraft(event.target.value);
            },
            onKeyDown: function (event) {
              if (event.key === 'Enter') {
                stopActionEvent(event);
                addStep();
              }
            }
          }),
          button(
            Object.assign(
              { className: 'dtMiniBtn', 'data-dt': 'step-add', disabled: !String(stepDraft || '').trim() },
              scopedAction(store, addStep)
            ),
            '添加'
          )
        )
      );

      /* ------------------------------ 长文本附件 ------------------------------ */
      const docRows = docs.map(function (doc, index) {
        return div(
          { key: doc.id || 'doc-' + index, className: 'dtDoc', 'data-doc-id': doc.id },
          input({
            className: 'dtInfoInput',
            'data-dt': 'doc-title',
            type: 'text',
            placeholder: '附件标题',
            value: doc.title || '',
            onChange: function (event) {
              const next = docs.slice();
              next[index] = Object.assign({}, doc, { title: event.target.value });
              commitDocs(next);
            }
          }),
          textarea({
            className: 'dtInfoText dtDocText',
            'data-dt': 'doc-text',
            rows: 3,
            placeholder: '粘贴长文本（单据、条款、链接说明…）',
            value: doc.text || '',
            onChange: function (event) {
              const next = docs.slice();
              next[index] = Object.assign({}, doc, { text: event.target.value });
              commitDocs(next);
            }
          }),
          button(
            Object.assign(
              { className: 'dtMiniDanger', 'data-dt': 'doc-remove', title: '删除这个附件' },
              scopedAction(store, function () {
                commitDocs(
                  docs.filter(function (item) {
                    return item.id !== doc.id;
                  })
                );
              })
            ),
            '删除'
          )
        );
      });

      const docsBlock = section(
        { className: 'dtInfoDocs' },
        div(
          { className: 'dtInfoHead' },
          span({ className: 'dtInfoTitle' }, '长文本附件'),
          span({ className: 'dtInfoHint', 'data-dt': 'doc-count' }, String(docs.length) + '/5')
        ),
        docRows.length ? div({ className: 'dtDocs' }, docRows) : null,
        button(
          Object.assign(
            { className: 'dtGhostBtn', 'data-dt': 'doc-add', disabled: docs.length >= 5 },
            scopedAction(store, function () {
              if (docs.length >= 5) return;
              commitDocs(
                docs.concat([{ id: '', title: '附件 ' + (docs.length + 1), text: '' }])
              );
            })
          ),
          docs.length >= 5 ? '最多 5 条附件' : '添加附件'
        )
      );

      /* --------------------------- 唯一蓝按钮 + 待确认 --------------------------- */
      const barText = agentMessage;
      /* §8-98：off 档常驻一句说明（不依赖是否点过蓝按钮），让用户知道功能没坏、只是不发请求。 */
      const agentOffNote = agentSourceOf(store && store.get ? store.get().settings : null) === 'off'
        ? div(
            { className: 'dtHint dtAgentNote', 'data-dt': 'agent-off-note' },
            '关闭后不发任何请求，整理与打分使用本地规则'
          )
        : null;
      const agentBar =
        agentState === 'idle'
          ? null
          : div(
              {
                className: 'dtAgentBar',
                'data-dt': 'agent-bar',
                'data-state': agentState,
                'data-code': agentCode || undefined
              },
              span({ className: 'dtAgentText' }, barText || ''),
              agentState === 'error' || agentState === 'local'
                ? button(
                    Object.assign({ className: 'dtMiniBtn', 'data-dt': 'agent-retry' }, scopedAction(store, runAgent)),
                    '重试'
                  )
                : null
            );

      const diff = result
        ? div(
            { className: 'dtAgentDiff', 'data-dt': 'agent-diff', 'data-state': result.local ? 'local' : 'model' },
            div(
              { className: 'dtAgentDiffRow' },
              span({ className: 'dtAgentDiffLabel' }, '标题'),
              span({ className: 'dtAgentDiffOld' }, task.title || ''),
              span({ className: 'dtAgentDiffArrow' }, '→'),
              span({ className: 'dtAgentDiffNew', 'data-dt': 'agent-new-title' }, result.title || '未生成新标题')
            ),
            div(
              { className: 'dtAgentDiffRow dtAgentDiffCol' },
              span({ className: 'dtAgentDiffLabel' }, '步骤'),
              result.steps && result.steps.length
                ? div(
                    { className: 'dtAgentDiffSteps' },
                    result.steps.map(function (text, index) {
                      return div({ key: 'new-' + index, className: 'dtAgentDiffStep', 'data-dt': 'agent-new-step' }, (index + 1) + '. ' + text);
                    })
                  )
                : div({ className: 'dtAgentDiffEmpty', 'data-dt': 'agent-new-step' }, '未拆解出步骤')
            )
          )
        : null;

      const diffActions = result
        ? div(
            { className: 'dtAgentDiffActions' },
            button(Object.assign({ className: 'dtPrimaryBtn', 'data-dt': 'agent-apply' }, scopedAction(store, applyResult)), '应用'),
            button(Object.assign({ className: 'dtGhostBtn', 'data-dt': 'agent-discard' }, scopedAction(store, discardResult)), '放弃'),
            snapshot
              ? button(Object.assign({ className: 'dtGhostBtn', 'data-dt': 'agent-restore' }, scopedAction(store, restoreResult)), '恢复原值')
              : null
          )
        : null;

      const agentBlock = section(
        { className: 'dtInfoAgent' },
        div(
          { className: 'dtInfoHead' },
          span({ className: 'dtInfoTitle' }, '整理助手'),
          span({ className: 'dtInfoHint' }, '一次请求同时润色标题与拆解步骤，结果待你确认')
        ),
        agentOffNote,
        agentBar,
        diff,
        diffActions,
        div(
          { className: 'dtAgentActionRow' },
          button(
            Object.assign(
              {
                className: 'dtBlueBtn',
                'data-dt': 'agent-action',
                'data-dt-spec': 'agent-polish',
                'data-task-id': task.id,
                disabled: busy,
                title: '一次请求：润色标题 + 拆解步骤'
              },
              scopedAction(store, runAgent)
            ),
            icon('spark', 13),
            busy ? '处理中…' : '润色并拆解'
          )
        )
      );

      return div({ className: 'dtTaskInfo', 'data-dt': 'task-info', 'data-task-id': task.id }, noteBlock, stepsBlock, docsBlock, agentBlock);
    }
