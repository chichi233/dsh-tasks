
    /* ---------------------------------- 清单（项目）新建 / 编辑 ---------------------------------- */

    function ProjectDialog(props) {
      const store = props.store;
      const editing = props.project;
      const isEdit = !!editing;
      const [name, setName] = useState(editing ? editing.name : '');
      /* 初始值走归一：老项目存的是字面 hex，归一后与色板里的 token 才能等价比较（t80）。 */
      const [color, setColor] = useState(normalizeProjectColor(editing && editing.color ? editing.color : PROJECT_COLORS[0]));
      const [icon, setIcon] = useState(editing ? (editing.icon || '') : '');
      const [type, setType] = useState(editing ? (editing.type || 'todo') : 'todo');
      const [error, setError] = useState('');

      const typeInfo = projectType(type);

      /* 内建清单随「习惯升级为一级入口」一并退役（§1.9）：loadState 不再补建任何清单，
         所以这里也没有「删了会回来」的清单，编辑态一律可删。 */

      /* Esc 第 1 层：弹窗自己关，交给面板那条常驻捕获监听统一消费并截停（§1.2.1），
         一次按键不会连抽屉一起关掉。 */
      useEffect(function () {
        return registerOverlayCloser(OVERLAY_LEVEL.modal, function () {
          props.onClose();
          return true;
        });
      }, []);

      const commit = function () {
        const trimmed = name.trim();
        if (!trimmed) {
          setError('先给清单起个名字');
          return;
        }
        const fields = { name: clampText(trimmed, 60), color: color, icon: icon.trim(), type: type };
        if (isEdit) {
          patchProject(store, editing.id, fields);
          if (props.onSaved) props.onSaved(editing.id);
        } else {
          const created = createProject(store, fields);
          if (!created) {
            setError('先给清单起个名字');
            return;
          }
          if (props.onSaved) props.onSaved(created.id);
        }
        props.onClose();
      };

      const remove = function () {
        if (!isEdit) return;
        if (!window.confirm('删除清单「' + editing.name + '」？里面的任务会移到收集箱，不会丢。')) return;
        const target = removeProject(store, editing.id);
        if (props.onDeleted) props.onDeleted(editing.id, target);
        props.onClose();
      };

      /* 习惯已是 rail 一级入口（§1.7/§1.9），清单不再承担「打卡」语义，
         所以新建/编辑清单只提供普通清单与目标两种类型。 */
      const typeButtons = PROJECT_TYPES.filter(function (item) {
        return item.id !== 'habit';
      }).map(function (item) {
        return button(
          {
            key: item.id,
            type: 'button',
            className: 'dtTypeBtn' + (type === item.id ? ' dtTypeOn' : ''),
            onClick: function () {
              setType(item.id);
            }
          },
          span({ key: 'n', className: 'dtTypeName' }, item.label),
          span({ key: 'h', className: 'dtTypeHint' }, item.hint)
        );
      });

      const swatches = PROJECT_COLORS.map(function (value) {
        return button(
          {
            key: value,
            type: 'button',
            title: value.replace('var(--dt-project-', '').replace(')', ''),
            'data-color': value,
            className: 'dtSwatch' + (sameProjectColor(color, value) ? ' dtSwatchOn' : ''),
            style: { background: value },
            onClick: function () {
              setColor(value);
            }
          }
        );
      });

      return div(
        {
          className: 'dtModal',
          onMouseDown: function (event) {
            if (event.target === event.currentTarget) props.onClose();
          }
        },
        div(
          { className: 'dtModalCard' },
          div({ className: 'dtModalHead' }, isEdit ? '编辑清单' : '新建清单'),
          div(
            { className: 'dtModalBody' },
            div(
              { className: 'dtField' },
              div({ className: 'dtFieldLabel' }, '名称'),
              input({
                className: 'dtInput',
                value: name,
                autoFocus: true,
                maxLength: 60,
                placeholder: '例如 工作、读书、健身',
                onChange: function (event) {
                  setName(event.target.value);
                  setError('');
                },
                onKeyDown: function (event) {
                  if (event.key === 'Enter') commit();
                  if (event.key === 'Escape') props.onClose();
                }
              })
            ),
            div(
              { className: 'dtField' },
              div({ className: 'dtFieldLabel' }, '类型'),
              div({ className: 'dtTypeList' }, typeButtons)
            ),
            div(
              { className: 'dtField' },
              div({ className: 'dtFieldLabel' }, '颜色'),
              div({ className: 'dtSwatches' }, swatches)
            ),
            div(
              { className: 'dtField' },
              div({ className: 'dtFieldLabel' }, '图标（可选，一个 emoji）'),
              div(
                { className: 'dtIconRow' },
                input({
                  className: 'dtInput dtIconInput',
                  value: icon,
                  maxLength: 4,
                  placeholder: '🎨',
                  onChange: function (event) {
                    setIcon(event.target.value);
                  }
                }),
                div(
                  { className: 'dtPreview' },
                  span({ key: 'd', className: 'dtDot', style: { background: color } }),
                  icon.trim() ? span({ key: 'e', className: 'dtRailEmoji' }, icon.trim()) : null,
                  span({ key: 'n', className: 'dtPreviewName' }, name.trim() || '新清单')
                )
              )
            ),
            error ? div({ className: 'dtErr' }, error) : null
          ),
          div(
            { className: 'dtModalFoot' },
            isEdit ? button({ className: 'dtDangerBtn', onClick: remove }, '删除清单') : null,
            span({ key: 'grow', className: 'dtGrow' }),
            button({ key: 'cancel', className: 'dtGhostBtn', onClick: props.onClose }, '取消'),
            /* 空名/全空白时禁用主按钮（t188）：提示层靠 disabled，正确性靠 commit 的早退。
               用原生 disabled 而不是 aria-disabled —— 后者在真机上仍会派发 click，点了还会进 action。 */
            button(
              { key: 'ok', className: 'dtPrimaryBtn', disabled: !name.trim(), onClick: commit },
              isEdit ? '保存' : '创建'
            )
          )
        )
      );
    }
