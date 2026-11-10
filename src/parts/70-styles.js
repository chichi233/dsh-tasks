
    /* ------------------------------------- 样式表 ----------------------------------- */

    const CSS = [
      '/* ---- dt-palette:start 主题色板（全仓唯一兜底处：本块之外禁止出现 #hex 与 rgba()） ---- */',
      '.dtRoot{--dt-bg-0:var(--dsw-alias-bg-base,#ffffff);--dt-bg-1:var(--dsw-alias-bg-layer-1,#f7f8fa);--dt-bg-2:var(--dsw-alias-bg-layer-2,#eef0f4);--dt-label-1:var(--dsw-alias-label-primary,#1d2129);--dt-label-2:#5c6168;--dt-label-3:#676c74;--dt-border-1:var(--dsw-alias-border-l1,#e4e6ea);--dt-border-2:var(--dsw-alias-border-l2,#d3d6dc);--dt-brand:var(--dsw-alias-brand-primary,#3b82f6);--dt-danger:var(--dsw-alias-state-error-primary,#e5484d);--dt-warn:var(--dsw-alias-state-warn-primary,#f5a524);--dt-pomo-l0:color-mix(in oklab, var(--dt-accent) 14%, var(--dsw-alias-bg-layer-2));--dt-pomo-l1:color-mix(in oklab, var(--dt-accent) 34%, var(--dsw-alias-bg-layer-2));--dt-pomo-l2:color-mix(in oklab, var(--dt-accent) 56%, var(--dsw-alias-bg-layer-2));--dt-pomo-l3:color-mix(in oklab, var(--dt-accent) 78%, var(--dsw-alias-bg-layer-2));--dt-pomo-l4:var(--dt-accent);--dt-success:var(--dsw-alias-state-success-primary,#2ea121);--dt-tag-blue:var(--dsw-alias-brand-primary,#3b82f6);--dt-tag-green:var(--dsw-alias-state-success-primary,#2ea121);--dt-tag-orange:var(--dsw-alias-state-warn-primary,#f5a524);--dt-tag-red:var(--dsw-alias-state-error-primary,#e5484d);--dt-tag-purple:#7c5cd6;--dt-tag-teal:#0f9b8e;--dt-tag-pink:#d6478f;--dt-tag-gray:var(--dsw-alias-label-secondary,#8b8f98);--dt-disabled-op:.45;--dsw-alias-label-secondary:#5c6168;--dsw-alias-label-tertiary:#676c74;}',
      '.dtRoot[data-dt-theme="dark"]{--dt-bg-0:#14161a;--dt-bg-1:#1c1f25;--dt-bg-2:#262a32;--dt-label-1:#e8eaed;--dt-label-2:#9aa0ac;--dt-label-3:#8e95a2;--dt-border-1:#2c313a;--dt-border-2:#3a4049;--dt-brand:#6ea8fe;--dt-danger:#ff7b72;--dt-warn:#f7c948;--dt-success:#4cc06a;--dt-pomo-l0:color-mix(in oklab, var(--dt-accent) 18%, var(--dt-bg-2));--dt-pomo-l1:color-mix(in oklab, var(--dt-accent) 36%, var(--dt-bg-2));--dt-pomo-l2:color-mix(in oklab, var(--dt-accent) 58%, var(--dt-bg-2));--dt-pomo-l3:color-mix(in oklab, var(--dt-accent) 80%, var(--dt-bg-2));--dt-pomo-l4:var(--dt-accent);--dt-tag-blue:#6ea8fe;--dt-tag-green:#4cc06a;--dt-tag-orange:#f0a13c;--dt-tag-red:#ff7b72;--dt-tag-purple:#b78cf7;--dt-tag-teal:#4fd1c5;--dt-tag-pink:#f78fb3;--dt-tag-gray:#8a93a5;--dsw-alias-bg-base:#14161a;--dsw-alias-bg-layer-1:#1c1f25;--dsw-alias-bg-layer-2:#262a32;--dsw-alias-bg-overlay:#262a32;--dsw-alias-label-primary:#e8eaed;--dsw-alias-label-secondary:#9aa0ac;--dsw-alias-label-tertiary:#8e95a2;--dsw-alias-border-l1:#2c313a;--dsw-alias-border-l2:#3a4049;--dt-disabled-op:.45;}',
      '.dtRoot{--dt-scrim:rgba(0,0,0,.16);--dt-shadow-sm:0 10px 26px rgba(0,0,0,.24);--dt-shadow-md:0 18px 48px rgba(0,0,0,.28);--dt-shadow-menu:0 12px 28px rgba(0,0,0,.24);}',
      '.dtRoot[data-dt-theme="dark"]{--dt-scrim:rgba(0,0,0,.52);--dt-shadow-sm:0 10px 26px rgba(0,0,0,.55);--dt-shadow-md:0 18px 48px rgba(0,0,0,.6);--dt-shadow-menu:0 12px 28px rgba(0,0,0,.58);}',
      '/* ---- S6 交互态：焦点环 / 禁用 / 按下，统一走令牌 ---- */',
      '.dtRoot :focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtRoot button:disabled,.dtRoot [aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtRoot button:active:not(:disabled){transform:translateY(.5px);}',
      '/* ---- dt-tokens 间距/字号/圆角（S2：全仓唯一档位表，正文里不再写字面 px） ---- */',
      '.dtRoot{--dt-sp-1:4px;--dt-sp-2:8px;--dt-sp-3:12px;--dt-sp-4:16px;--dt-sp-5:20px;--dt-sp-6:24px;--dt-sp-7:32px;--dt-sp-8:40px;--dt-fs-micro:11px;--dt-fs-meta:12px;--dt-fs-body:13px;--dt-fs-title:14px;--dt-fs-head:16px;--dt-r-row:6px;--dt-r-card:10px;--dt-r-pill:999px;}',
      '/* ---- dt-project 项目色（与 --dt-tag-、--dt-pomo-l 同范式：明暗两套，唯一定义处） ---- */',
      '.dtRoot{--dt-project-blue:#4AA6EF;--dt-project-pink:#E855BE;--dt-project-purple:#CE89FE;--dt-project-green:#7BC043;--dt-project-orange:#F5A623;--dt-project-teal:#3BC9A8;--dt-project-red:#E8613E;--dt-project-indigo:#8B7EF8;}',
      '.dtRoot[data-dt-theme="dark"]{--dt-project-blue:#6ea8fe;--dt-project-pink:#f07ec9;--dt-project-purple:#c9a6ff;--dt-project-green:#7cc46a;--dt-project-orange:#f0b45a;--dt-project-teal:#4fd8bb;--dt-project-red:#ff8a7a;--dt-project-indigo:#a6a0ff;}',
      '/* ---- dt-quad 四象限四色（Q1 红 / Q2 黄 / Q3 蓝；Q4 不设色，左色边走 transparent） ---- */',
      '.dtRoot{--dt-quad-red:#e5484d;--dt-quad-yellow:#f5a524;--dt-quad-blue:#3b82f6;--dt-quad-none:transparent;}',
      '.dtRoot[data-dt-theme="dark"]{--dt-quad-red:#ff7b72;--dt-quad-yellow:#f7c948;--dt-quad-blue:#6ea8fe;--dt-quad-none:transparent;}',
      /* ---- 模型来源三档：竖排三行（captain m07959） ----
     每档是一个整行 <label>：第一行 radio + 名称，第二行小字说明。
     说明用 flex-basis:100% 强制换行而不是块级兄弟节点，保证「点说明文字也能选中」。 */
  '.dtAgentSource{display:flex;flex-direction:column;gap:var(--dt-sp-2);width:100%}',
  '.dtAgentSourceOpt{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);width:100%;box-sizing:border-box;padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);cursor:pointer}',
  '.dtAgentSourceOpt[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
  '.dtAgentSourceRadio{margin:0;flex:0 0 auto}',
  '.dtAgentSourceText{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary)}',
  /* §8-98：模型来源区说明句（dsh / off 各一句），沿用既有 hint 字号与 --dt-label-2，不新造颜色 */
  '.dtAgentNote{font-size:var(--dt-fs-micro);line-height:17px;color:var(--dt-label-2);}',
  /* t150：错误态一行原始 message。等宽数字便于看 400/500 与 JSON 片段，长串强制换行不撑破卡片 */
  '.dtAgentDetail{font-size:var(--dt-fs-micro);line-height:17px;color:var(--dt-label-2);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;white-space:pre-wrap}',
  '.dtAgentSourceHint{flex:0 0 100%;font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '/* ---- dt-accent 强调色（§1.19.3）：只有这五个令牌，禁止外溢到 quad / score-band / project / habit / pomo-l ---- */',
      '.dtRoot{--dt-accent:var(--dsw-alias-brand-primary);--dt-accent-fg:var(--dt-accent);--dt-accent-on:#FFFFFF;--dt-accent-weak:color-mix(in oklab,var(--dt-accent) 12%,transparent);--dt-accent-ring:color-mix(in oklab,var(--dt-accent) 32%,transparent);}',
      '.dtRoot[data-dt-theme="dark"]{--dt-accent-on:#000000;--dt-accent-weak:color-mix(in oklab,var(--dt-accent) 18%,transparent);--dt-accent-ring:color-mix(in oklab,var(--dt-accent) 40%,transparent);}',
  '/* ---- dt-palette:end ---- */',
      '.dtRoot{position:relative;display:flex;height:100%;width:100%;min-height:0;overflow:hidden;background:var(--dt-bg-0);color:var(--dt-label-1);font-size:var(--dt-fs-body);isolation:isolate;container:dtroot / inline-size;}',
      '.dtRail{width:196px;flex:0 0 196px;display:flex;flex-direction:column;gap:2px;padding:var(--dt-sp-3) var(--dt-sp-2) var(--dt-sp-2);border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);overflow:hidden;min-height:0;}',
      '.dtRailScroll{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;}',
      '.dtRail[data-dt-scroll="none"] .dtRailScroll{overflow-y:hidden;}',
      '.dtRailTitle{padding:2px var(--dt-sp-2) var(--dt-sp-2);font-size:var(--dt-fs-meta);font-weight:600;color:var(--dt-label-2);}',
      '.dtRailGroupTitle{position:relative;display:flex;align-items:center;justify-content:space-between;padding:var(--dt-sp-3) var(--dt-sp-2) var(--dt-sp-1);font-size:var(--dt-fs-micro);letter-spacing:.02em;color:var(--dt-label-3);}',
      '.dtRailGroupCount{font-variant-numeric:tabular-nums;}',
      '.dtRailItem{display:flex;align-items:center;gap:var(--dt-sp-2);width:100%;padding:var(--dt-sp-2) var(--dt-sp-2) var(--dt-sp-2) var(--dt-sp-4);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dt-label-2);font:inherit;text-align:left;cursor:pointer;transition:background .12s linear,color .12s linear;}',
      '.dtRailItem:hover{background:var(--dt-bg-2);color:var(--dt-label-1);}',
      '.dtRailOn{background:var(--dt-bg-1);color:var(--dt-label-1);font-weight:600;box-shadow:inset 2px 0 0 var(--dt-accent);}',
      '.dtRailIcon{display:inline-flex;flex:0 0 auto;}',
      '.dtRailLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtRailCount{font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);}',
      '.dtDot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;}',
      '.dtRailSpacer{flex:1 1 auto;min-height:16px;}',
      '.dtRailTool{margin-top:1px;}',
      /* 中间区留最小可用宽（§2.3）：两栏同开时先让中间区让位，而不是压成 95px */
      /* A→B→C（t105/t116）：没有「中间区」。rail 点开的功能渲染在 B 栏，B 是主区；
         C 紧贴 B 右侧，B 让位但不低于 280。容器不足时只允许 B 内部横滚，.dtRoot 永不横滚。 */
      '.dtDrawerZone{display:flex;flex:1 1 auto;min-width:0;min-height:0;overflow-x:auto;overflow-y:hidden;background:var(--dsw-alias-bg-base);}',
      '.dtDrawerZone[data-count="1"]{flex:1 1 auto;}',
      '.dtDrawerZone[data-count="2"]{flex:1 1 auto;}',
      /* rail 图标条（<776 且两栏同开时降级：只留图标，宽度 48） */
      '.dtRoot[data-rail="icon"] .dtRail{box-sizing:border-box;width:48px;flex:0 0 48px;padding:var(--dt-sp-2) var(--dt-sp-1);}',
      '.dtRoot[data-rail="icon"] .dtRailLabel{display:none;}',
      '.dtRoot[data-rail="icon"] .dtRailCount{display:none;}',
      '.dtRoot[data-rail="icon"] .dtRailTitle{display:none;}',
      '.dtRoot[data-rail="icon"] .dtRailGroupTitle{justify-content:center;padding:var(--dt-sp-2) 0 var(--dt-sp-1);}',
      '.dtRoot[data-rail="icon"] .dtRailItem{height:32px;justify-content:center;padding:0;}',
      '.dtRoot[data-rail="icon"] .dtRailMore{display:none;}',
      '.dtMain{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
      /* B / C 两栏都是抽屉区里的 flex 项：z-index 必须保持 auto（§2.2），
         否则一栏的层叠上下文会整体盖住另一栏内含的菜单/输入框。 */
      '.dtDrawer{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;contain:layout paint;animation:dtDrawerIn 160ms ease-out;}',
      '.dtDrawer[data-slot="b"]{flex:1 1 55%;min-width:280px;z-index:0;container:dcenter / inline-size;}',
      '.dtDrawer[data-slot="c"]{flex:1 1 45%;min-width:300px;z-index:1;background:var(--dsw-alias-bg-layer-1);}',
      '.dtDrawer+.dtDrawer{border-left:1px solid var(--dsw-alias-border-l2);}',
      '@keyframes dtDrawerIn{from{transform:translateX(20px);opacity:0;}to{transform:translateX(0);opacity:1;}}',
      '.dtDrawer .dtMain{background:transparent;}',
      '.dtHead{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--dt-sp-3) var(--dt-sp-3);flex-wrap:wrap;padding:var(--dt-sp-4) var(--dt-sp-4) var(--dt-sp-2);}',
      '.dtHeadLeft{min-width:0;flex:0 0 auto;white-space:nowrap;}',
      '.dtHeadTitle{font-size:var(--dt-fs-head);font-weight:650;line-height:1.2;white-space:nowrap;}',
      '.dtHeadCount{margin-top:3px;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtHeadRight{display:flex;align-items:center;gap:var(--dt-sp-2);flex-wrap:wrap;justify-content:flex-end;flex:1 1 auto;}',
      '.dtSearch{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);}',
      '.dtSearchInput{width:132px;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dt-fs-meta);}',
      '.dtAddBar{display:flex;align-items:center;gap:var(--dt-sp-2);margin:2px var(--dt-sp-4) var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);}',
      '.dtAddInput{flex:1 1 auto;min-width:0;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;}',
      '.dtList{flex:1 1 auto;min-height:0;overflow:auto;padding:0 var(--dt-sp-2) var(--dt-sp-6);}',
      '.dtRow{display:flex;align-items:flex-start;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid transparent;border-radius:var(--dt-r-row);cursor:pointer;transition:background .12s linear,border-color .12s linear;}',
      '.dtRow:hover{background:var(--dt-bg-1);}',
      '.dtRowActive{background:var(--dt-bg-1);border-color:var(--dt-border-1);box-shadow:inset 2px 0 0 var(--dt-accent);}',
      '.dtCheck{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;margin-top:2px;flex:0 0 auto;padding:0;border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;background:transparent;color:var(--dsw-alias-bg-base);cursor:pointer;}',
      '.dtCheck:hover{border-color:var(--dsw-alias-brand-primary);}',
      '.dtCheckOn{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
      '.dtRowMain{flex:1 1 auto;min-width:0;}',
      '.dtRowTitle{font-size:var(--dt-fs-body);line-height:1.45;word-break:break-word;}',
      '.dtRowDone .dtRowTitle{color:var(--dsw-alias-label-secondary);text-decoration:line-through;}',
      '.dtRowNote{margin-top:2px;font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
      '.dtRowChips{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);margin-top:var(--dt-sp-1);}',
      '.dtChip{display:inline-flex;align-items:center;gap:var(--dt-sp-1);max-width:100%;white-space:nowrap;padding:1px var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);}',
      '.dtChipBell{color:var(--dsw-alias-state-warn-primary);border-color:currentColor;}',
      '.dtChipDone{color:var(--dsw-alias-state-success-primary);border-color:currentColor;}',
      '.dtChipTag{color:var(--dsw-alias-brand-primary);border-color:currentColor;}',
      '.dtPriority{display:inline-flex;margin-top:3px;}',
      '.dtRowBtn{padding:3px var(--dt-sp-2);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-micro);cursor:pointer;opacity:0;}',
      '.dtRow:hover .dtRowBtn{opacity:1;}',
      '.dtRowBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtEmpty{padding:var(--dt-sp-8) var(--dt-sp-4);text-align:center;color:var(--dt-label-2);line-height:1.7;}',
      '.dtEmptyTitle{font-size:var(--dt-fs-body);font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtEmptyText{margin-top:var(--dt-sp-2);font-size:var(--dt-fs-meta);}',
      '.dtDrawer .dtSearchInput{width:108px;}',
      '.dtDrawer .dtHead{padding:var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-2);}',
      '.dtScrim{position:absolute;inset:0;z-index:15;background:var(--dt-scrim);}',
      '.dtFace{display:inline-flex;align-items:center;color:var(--dsw-alias-state-error-primary);}',
      /* ---- 详情栏 C 的内容（§1.8）：不再是浮层，是 B 栏右边的一栏 ---- */
      '.dtDetail{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:auto;}',
      '.dtDetailFields{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3) var(--dt-sp-4);}',
      '.dtDetailFields .dtField{align-items:flex-start;}',
      '.dtDetailFields .dtFieldLabel{padding-top:var(--dt-sp-2);flex:0 0 52px;font-size:var(--dt-fs-micro);}',
      '.dtDetailFields .dtFieldInput,.dtDetailFields .dtInput{width:100%;box-sizing:border-box;padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-1);color:var(--dt-label-1);font:inherit;font-size:var(--dt-fs-meta);outline:none;min-height:28px;transition:border-color .12s linear,box-shadow .12s linear;}',
      // S7c-2：悬停反馈只提边框一档，不动底色、不加投影，避免与 :focus 的 2px 影叠出第三种视觉。
      // S7c-4：hover 只提边框一档，且走插件令牌 --dt-border-2（自带兜底色），
      // 不再裸引宿主 --dsw-alias-border-l2——宿主那个别名是半透明黑（alpha 约 10%），
      // 缺别名时会退化成 currentColor，与其它边框规则的兜底口径也不一致。
      '.dtDetailFields .dtFieldInput:hover,.dtDetailFields .dtInput:hover{border-color:var(--dt-border-2)}',
      '.dtDetailFields .dtFieldInput:focus,.dtDetailFields .dtInput:focus{border-color:var(--dt-accent);box-shadow:0 0 0 2px var(--dt-accent-weak);}',
      '.dtDetailFields .dtTitleInput{font-size:var(--dt-fs-title);font-weight:600;line-height:1.4;resize:vertical;}',
      '.dtDetailFields .dtNoteInput{min-height:74px;line-height:1.5;resize:vertical;}',
      '.dtDetailFields .dtFieldWide{flex-direction:column;align-items:stretch;gap:var(--dt-sp-1);}',
      '.dtDetailFields .dtFieldWide .dtFieldLabel{padding-top:0;flex:0 0 auto;}',
      '.dtDetailActions{display:flex;gap:var(--dt-sp-2);padding-top:var(--dt-sp-1);border-top:1px solid var(--dsw-alias-border-l1);margin-top:2px;}',
      '.dtField{display:flex;align-items:center;gap:var(--dt-sp-3);}',
      '.dtFieldLabel{flex:0 0 54px;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtFieldBody{flex:1 1 auto;min-width:0;}',
      '.dtRow2{display:flex;gap:var(--dt-sp-2);}',
      '.dtInput{width:100%;box-sizing:border-box;padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dt-fs-meta);outline:none;}',
      '.dtInput:focus{border-color:var(--dsw-alias-brand-primary);}',
      '.dtTitleInput{font-size:var(--dt-fs-title);font-weight:600;line-height:1.4;resize:vertical;}',
      '.dtNoteInput{min-height:74px;line-height:1.5;resize:vertical;}',
      '.dtToggle{display:flex;align-items:center;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary);cursor:pointer;}',
      '.dtToggleWide{padding:3px 0;}',
      '.dtQuickRow{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);padding-left:64px;}',
      '.dtSeg{display:flex;gap:var(--dt-sp-1);}',
      '.dtSegBtn{flex:1 1 auto;padding:var(--dt-sp-1) 0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtSegOn{border-color:currentColor;background:var(--dsw-alias-bg-layer-2);font-weight:600;}',
      '.dtMiniBtn{display:inline-flex;align-items:center;gap:var(--dt-sp-1);padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtMiniBtn:hover{color:var(--dsw-alias-label-primary);}',
      '.dtMiniOn{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600;}',
      /* 主按钮吃插件强调色，不再用宿主 brand/bg 别名：新版宿主的 brand-primary 是近黑色、bg-layer-1 是浅灰，
         二者叠加看起来就像「禁用态」，用户会把可用按钮当成点不动（S7b-1 的直接干扰项）。 */
      '.dtPrimaryBtn{display:inline-flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dt-accent);border-radius:var(--dt-r-card);background:var(--dt-accent);color:var(--dt-accent-on);font:inherit;font-weight:600;cursor:pointer;}',
      '.dtPrimaryBtn:hover{filter:brightness(1.06);}',
      '.dtPrimaryLg{padding:var(--dt-sp-2) var(--dt-sp-6);font-size:var(--dt-fs-body);}',
      '.dtGhostBtn{display:inline-flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtGhostBtn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtDangerBtn{display:inline-flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-state-error-primary);font:inherit;font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtDangerBtn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtIconBtn{display:inline-flex;padding:var(--dt-sp-1);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtIconBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtToastLayer{position:absolute;top:12px;right:12px;z-index:40;display:flex;flex-direction:column;gap:var(--dt-sp-2);width:298px;pointer-events:none;}',
      '.dtToast{pointer-events:auto;display:flex;align-items:flex-start;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dt-shadow-sm);}',
      '.dtToastPomo{border-color:var(--dsw-alias-brand-primary);}',
      '.dtToastBody{flex:1 1 auto;min-width:0;}',
      '.dtToastTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtToastText{margin-top:2px;font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);}',
      '.dtToastActions{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtPomo{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;gap:var(--dt-sp-4);padding:var(--dt-sp-4) var(--dt-sp-5);overflow:auto;}',
      '.dtPomoTop{width:100%;display:flex;align-items:baseline;justify-content:space-between;}',
      '.dtPomoTitle{font-size:var(--dt-fs-head);font-weight:650;}',
      '.dtPomoToday{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtPomoModes{display:flex;gap:var(--dt-sp-2);padding:var(--dt-sp-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtPomoMode{padding:var(--dt-sp-1) var(--dt-sp-4);border:0;border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtPomoModeOn{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.dtPomoRing{margin:var(--dt-sp-1) 0;}',
      '.dtPomoControls{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtPomoPresets{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:var(--dt-sp-2);padding-top:2px;}',
      '.dtPomoSettings{width:100%;max-width:540px;display:grid;grid-template-columns:1fr 1fr;gap:var(--dt-sp-2) var(--dt-sp-5);margin-top:var(--dt-sp-1);padding-top:var(--dt-sp-3);border-top:1px solid var(--dsw-alias-border-l1);}',
      '.dtPomoSettings .dtToggleWide{grid-column:1 / -1;}',
      '.dtSettings{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:var(--dt-sp-3);padding:var(--dt-sp-4) var(--dt-sp-5);overflow:auto;max-width:760px;}',
      '.dtSettingsTitle{font-size:var(--dt-fs-head);font-weight:650;}',
      '.dtCard{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-4);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtCardTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtHint{font-size:var(--dt-fs-micro);line-height:1.5;color:var(--dsw-alias-label-secondary);}',
      '.dtStats{display:flex;flex-wrap:wrap;gap:var(--dt-sp-4);}',
      '.dtStat{min-width:62px;}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '.dtStatValue{font-size:18px;font-weight:650;font-variant-numeric:tabular-nums;}',
      '.dtStatLabel{font-size:var(--dt-fs-micro);color:var(--dt-label-2);}',
      /* 设置页六组 IA 的控件（§12.1）：音效/主题用同一套「卡片式单选」外观 */
      '.dtSoundRow,.dtThemeRow{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtSoundOpt,.dtThemeOpt{position:relative;display:inline-flex;align-items:center;gap:var(--dt-sp-2);height:28px;padding:0 var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);color:var(--dt-label-2);background:transparent;cursor:pointer;}',
      '.dtSoundOpt:hover,.dtThemeOpt:hover{background:var(--dt-bg-2);color:var(--dt-label-1);}',
      '.dtSoundOptOn,.dtThemeOptOn{border-color:var(--dt-brand);background:var(--dt-bg-2);color:var(--dt-label-1);font-weight:600;}',
      '.dtSoundRadio,.dtThemeRadio{position:absolute;opacity:0;width:1px;height:1px;margin:0;}',
      '.dtSoundOptText,.dtThemeOptText{white-space:nowrap;}',
      '.dtRange{width:100%;max-width:220px;accent-color:var(--dt-brand);}',
      '.dtModuleList{display:flex;flex-direction:column;gap:2px;}',
      '.dtModuleRow{display:flex;align-items:center;gap:var(--dt-sp-2);padding:3px 0;}',
      '.dtModuleName{flex:1 1 auto;font-size:var(--dt-fs-meta);color:var(--dt-label-1);}',
      '.dtModuleOps{display:flex;gap:var(--dt-sp-1);}',
      '.dtWarnText{font-size:var(--dt-fs-micro);line-height:1.5;color:var(--dt-warn);}',
      '.dtFatal{margin:auto;max-width:520px;display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-6);}',
      '.dtFatalTitle{font-size:var(--dt-fs-title);font-weight:600;color:var(--dt-danger);}',
      '.dtFatalText{font-size:var(--dt-fs-meta);line-height:1.6;color:var(--dt-label-2);}',
      '.dtBtnRow{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtRailRow{position:relative;display:flex;align-items:center;}',
      '.dtRailMore{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:0;border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-body);line-height:1;cursor:pointer;opacity:.45;transition:opacity .12s;}',
      '.dtRailRow:hover .dtRailMore{opacity:1;}',
      /* 键盘用户必须能到达「清单设置」（S7c-1）：外环与 .dtRoot :focus-visible 同一口径（2px 强调色 + offset 2）。
         没有这条时，⋯ 常显但聚焦无环，键盘用户看不出焦点落在哪。 */
      '.dtRailMore:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;opacity:1;}',
      '.dtRailMore:hover{color:var(--dsw-alias-label-primary);}',
      '.dtRailEmoji{flex:0 0 auto;width:15px;font-size:var(--dt-fs-meta);line-height:15px;text-align:center;}',
      '.dtRailGroupCount{display:inline-flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtRailAdd{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtRailAdd:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);}',
      /* ---------------- 目录栏设置与拖拽排序（t144 / §1.20） ---------------- */
      '.dtRailTitleActions{display:inline-flex;align-items:center;gap:var(--dt-sp-1);}',
      /* 手柄固定 18px 占位（§1.20.8）：.dtRailItem 的 padding-left 恒为 18px，手柄绝对定位在
         .dtRailRow 内，所以「显示/隐藏手柄」两态下名称起始 x 与行高都不跳。 */
      '.dtRailDrag{position:absolute;left:2px;top:50%;transform:translateY(-50%);width:14px;height:18px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:grab;}',
      '.dtRailDrag:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtRailDrag:active{cursor:grabbing;}',
      '.dtRailFnRow{position:relative;display:flex;align-items:center;}',
      '.dtRailRow[data-dragging="1"],.dtRailFnRow[data-dragging="1"]{opacity:.6;}',
      '.dtRailRow[data-drop-target="1"]::after,.dtRailFnRow[data-drop-target="1"]::after{content:"";position:absolute;left:4px;right:4px;top:0;height:2px;border-radius:var(--dt-r-row);background:var(--dsw-alias-brand-primary);}',
      '.dtPsPanel{position:fixed;z-index:35;box-sizing:border-box;min-width:260px;max-width:320px;padding:var(--dt-sp-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dt-shadow-menu);overflow-y:auto;overscroll-behavior:contain;}',
      '.dtPsPanel[data-flip="up"]{transform-origin:top right;}',
      '.dtPsRow{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary);cursor:pointer;}',
      '.dtPsRow:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtPsLabel{flex:1 1 auto;}',
      '.dtPsCheck{display:inline-flex;color:var(--dsw-alias-brand-primary);}',
      /* t165：面板里的「位置调整」列表。宽度写死上下限，条目名过长省略，
         避免面板被长清单名撑到不可用（用户报障的另一个观感问题）。 */
      '.dtPsPanel{min-width:260px;max-width:320px;}',
      '.dtPsDivider{height:1px;margin:var(--dt-sp-1) var(--dt-sp-2);background:var(--dsw-alias-border-l1);}',
      '.dtPsGroup{display:flex;flex-direction:column;gap:2px;padding:2px 0;}',
      '.dtPsGroupTitle{padding:var(--dt-sp-2) var(--dt-sp-2) 2px;font-size:var(--dt-fs-micro);line-height:15px;color:var(--dsw-alias-label-secondary);}',
      '.dtPsItem{display:flex;align-items:center;gap:var(--dt-sp-1);padding:var(--dt-sp-1) var(--dt-sp-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary);}',
      '.dtPsItem:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtPsItem[data-on="0"] .dtPsItemName{color:var(--dsw-alias-label-secondary);}',
      '.dtPsItemName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtPsMove{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtPsMove:hover:not([disabled]){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}',
      '.dtPsMove[disabled]{opacity:var(--dt-disabled-op);cursor:default;}',
      '.dtPsToggle{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtPsToggleOn{color:var(--dt-accent);border-color:var(--dt-accent);}',
      '.dtPsEdit,.dtPsDel{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtPsEdit:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}',
      '.dtPsDel:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dt-danger);}',
      '.dtRailLive{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}',

      '.dtModal{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:var(--dt-sp-6);background:var(--dt-scrim);}',
      '.dtModalCard{width:100%;max-width:392px;max-height:100%;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dt-shadow-md);overflow:hidden;}',
      '.dtModalHead{padding:var(--dt-sp-4) var(--dt-sp-4) var(--dt-sp-3);font-size:var(--dt-fs-body);font-weight:650;}',
      '.dtModalBody{display:flex;flex-direction:column;gap:var(--dt-sp-3);padding:2px var(--dt-sp-4) var(--dt-sp-4);overflow:auto;}',
      '.dtModalFoot{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-4) var(--dt-sp-3);border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}',
      '.dtGrow{flex:1 1 auto;}',
      '.dtTypeList{display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtTypeBtn{display:flex;flex-direction:column;gap:2px;width:100%;padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);font:inherit;text-align:left;cursor:pointer;}',
      '.dtTypeBtn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtTypeOn{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary);}',
      '.dtTypeName{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtTypeOn .dtTypeName{color:var(--dsw-alias-brand-primary);}',
      '.dtTypeHint{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtSwatches{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtSwatch{width:24px;height:24px;padding:0;border:0;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);}',
      '.dtSwatchOn{box-shadow:0 0 0 2px var(--dsw-alias-bg-overlay),0 0 0 4px var(--dsw-alias-brand-primary);}',
      '.dtIconRow{display:flex;align-items:center;gap:var(--dt-sp-3);}',
      '.dtIconInput{width:64px;text-align:center;}',
      '.dtPreview{display:inline-flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-1) var(--dt-sp-3);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-2);font-size:var(--dt-fs-meta);}',
      '.dtPreviewName{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtErr{font-size:var(--dt-fs-micro);color:var(--dsw-alias-state-error-primary);}',

      /* ---- 抽屉区（两栏挤压式 flex，§2.3；任何宽度都是两栏，不做 tab 降级） ---- */
      '.dtDrawerZone[data-count="2"]{border-left:0;}',
      '.dtDrawerCollapse{height:26px;padding:var(--dt-sp-1) var(--dt-sp-2);margin-left:2px;font-size:var(--dt-fs-meta);font-weight:500;color:var(--dsw-alias-label-secondary);}',
      '.dtDrawerCollapse:hover{color:var(--dsw-alias-label-primary);}',
      '.dtDrawer .dtDrawerCollapse{min-width:24px;min-height:24px;}',

      /* ---- 习惯面板（§3） ---- */
      '.dtHabit{flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-1) var(--dt-sp-3) var(--dt-sp-6);}',
      '.dtHabitBlock{margin-bottom:var(--dt-sp-4);}',
      '.dtHabitBlockHead{display:flex;align-items:baseline;justify-content:space-between;padding:2px 2px var(--dt-sp-2);}',
      '.dtHabitBlockTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtHabitBlockCount{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtHabitGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--dt-sp-3);}',
      '.dtHabitCard{display:flex;flex-direction:column;gap:var(--dt-sp-2);min-height:96px;padding:var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);transition:border-color .12s,background .12s;}',
      '.dtHabitCard:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);}',
      '.dtHabitCardOn{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}',
      '.dtHabitCardFuture{opacity:.55;}',
      '.dtHabitCardTop{display:flex;align-items:flex-start;gap:var(--dt-sp-2);}',
      '.dtHabitTitle{flex:1 1 auto;min-width:0;font-size:var(--dt-fs-body);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
      '.dtHabitMeta{font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dtHabitStreak{display:flex;align-items:center;justify-content:space-between;gap:var(--dt-sp-2);margin-top:auto;padding-top:var(--dt-sp-2);border-top:1px solid var(--dsw-alias-border-l1);font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtHabitStreak b{font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtHabitStreakTag{font-size:var(--dt-fs-micro);color:var(--dsw-alias-state-success-primary);}',
      '.dtHabitStreakText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtHabitBlockEmpty{padding:var(--dt-sp-4);border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',

      /* ---- 四象限（§2.5） ---- */
      /* 四格必须永远可达（t46 F11）：`.dtQuad` 自己也能滚，作为网格放不下时的兜底；
         行模板一律写 `minmax(0,1fr)`——裸 `1fr` 的行带 min-content 下限，
         祖先高度若是 auto 就会被内容撑高、被 overflow:hidden 裁掉后两格且无处可滚。 */
      '.dtQuad{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:var(--dt-sp-3);overflow:auto;}',
      '.dtQuadGrid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(2,minmax(160px,1fr));grid-auto-rows:minmax(160px,auto);gap:var(--dt-sp-2);}',
      '.dtQuad[data-layout="stack"] .dtQuadGrid{grid-template-columns:1fr;grid-template-rows:none;grid-auto-rows:minmax(200px,auto);}',
      '.dtQuad[data-layout="stack"] .dtQuadCell{min-height:180px;}',
      '.dtQuadCell{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dt-quad,var(--dsw-alias-border-l1));border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-base);overflow:hidden;}',
      /* 四色同源（§0.6）：格子左边线取 --dt-quad，标题色只对 q1–q3 上色，q4 用主文本色 */
      '.dtQuadCell[data-quad-color="none"]{border-left-color:transparent;}',
      '.dtQuadHeadTitle{color:var(--dt-quad);}',
      '.dtQuadCell[data-quad-color="none"] .dtQuadHeadTitle{color:var(--dsw-alias-label-primary);}',
      '.dtQuadHead{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:var(--dt-sp-2);height:32px;padding:0 var(--dt-sp-3);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.dtQuadTitle{font-size:var(--dt-fs-meta);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dtQuadCount{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtQuadBody{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding:var(--dt-sp-2);}',
      '.dtQuadItem+.dtQuadItem{margin-top:2px;}',
      '.dtQuadEmpty{padding:var(--dt-sp-3) var(--dt-sp-2);font-size:var(--dt-fs-micro);line-height:1.45;color:var(--dsw-alias-label-secondary);text-align:center;}',
      '.dtTodayPin{display:flex;flex-direction:column;gap:2px;margin-bottom:var(--dt-sp-2);padding-bottom:var(--dt-sp-2);border-bottom:1px dashed var(--dsw-alias-border-l2);}',
      '.dtTodayPinTitle{display:flex;align-items:center;gap:var(--dt-sp-1);padding:2px var(--dt-sp-1) var(--dt-sp-1);font-size:var(--dt-fs-micro);font-weight:600;color:var(--dsw-alias-brand-primary);}',
      '.dtRowCompact{padding:var(--dt-sp-2) var(--dt-sp-2);}',
      '.dtRowCompact .dtRowTitle{font-size:var(--dt-fs-meta);}',
      '.dtRowCompact .dtRowChips{margin-top:3px;}',
      '.dtRowChild{padding-left:var(--dt-sp-6);}',
      /* 行尾两段（§1.16.1）：动作区恒占 66px（hover / focus / 菜单展开才显形，不塌陷），
         状态区恒占 148px（flag 18 + date 56 + tag 36 + score 20 + 4×gap 6 = 148）。
         日期槽 44→56（t134，用户报障：44px 放不下「2027年10月15日」这类最长值，
         会被 overflow:hidden 吃掉半个字）；其余槽位与 gap 不变。
         两段宽度都写死 → 同列所有分数圈的右边界必然相等，不再随内容组合漂移。 */
      '.dtRowTail{display:flex;align-items:center;flex:0 0 auto;gap:var(--dt-sp-2);}',
      /* §0.5：menuFlip 的锚点父容器必须是定位元素，象限菜单与今日要事菜单的
         getBoundingClientRect 才落在本行动作区上（缺 position:relative 时会相对
         更上层定位，翻转判定算错）。这是功能依赖，不是纯样式。 */
      '.dtRowActions{position:relative;display:flex;align-items:center;justify-content:flex-end;gap:2px;flex:0 0 66px;width:66px;opacity:0;pointer-events:none;transition:opacity .12s linear;}',
      '.dtRow:hover .dtRowActions,.dtRow:focus-within .dtRowActions,.dtRowActions[data-open="1"]{opacity:1;pointer-events:auto;}',
      '.dtRowActions .dtRowBtn,.dtRowActions .dtPinBtn,.dtRowActions .dtQuadMenuBtn{min-width:20px;padding:0 2px;}',
      '.dtRowState{display:flex;align-items:center;gap:var(--dt-sp-2);flex:0 0 148px;width:148px;}',
      '.dtStateFlag{display:inline-flex;align-items:center;justify-content:center;flex:0 0 18px;width:18px;height:18px;}',
      '.dtStateDate{display:inline-flex;align-items:center;flex:0 0 56px;width:56px;overflow:hidden;white-space:nowrap;}',
      '.dtStateTag{display:inline-flex;align-items:center;flex:0 0 36px;width:36px;overflow:hidden;}',
      '.dtStateDate:empty,.dtStateTag:empty{visibility:hidden;}',
      /* 日期槽内的 chip 去掉药丸内边距与图标（t134）：56px 里 12px 图标 + 4px gap + 12px 内边距
         只剩 28px 给文字，必然截断。槽内只留文字，完整标签（含年份与星期）在 title 上。 */
      '.dtStateDate .dtChip{padding:0;border:0;background:transparent;max-width:100%;gap:0;font-size:var(--dt-fs-micro);line-height:16px;}',
      '.dtStateDate .dtChipState>svg,.dtStateDate .dtChipState .dtFace{display:none;}',
      '.dtRowState .dtScoreRing{flex:0 0 20px;width:20px;height:20px;}',
      '.dtRowState .dtScoreRing svg{width:20px;height:20px;}',
      '.dtDrawer[data-dense="1"] .dtRowState{flex:0 0 68px;width:68px;}',
      '.dtDrawer[data-dense="1"] .dtStateTag,.dtDrawer[data-dense="1"] .dtRowState .dtScoreRing{display:none;}',
      /* t210 F3：彻底删除是危险动作，图标用 danger 色区分于「恢复」 */
      '.dtRowPurge{color:var(--dt-danger);}',
      '.dtTrashPurgeAll{color:var(--dt-danger);}',
      '.dtPinBtn,.dtQuadMenuBtn{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 var(--dt-sp-1);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtPinBtn:hover,.dtQuadMenuBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtPinBtn[data-on="1"]{color:var(--dsw-alias-brand-primary);}',
      '.dtPinOn{color:var(--dsw-alias-brand-primary);}',
      '.dtQuadMenuBtnOn{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      /* 改判菜单：每项文字色 = 对应象限色；选中态 = 左侧 3px 竖条 + 600 字重（不靠背景冒充） */
      '.dtMenuItemQuad[data-on="1"],.dtMenuItemQuadAuto[data-on="1"]{font-weight:600;box-shadow:inset 3px 0 0 currentColor;}',
      '.dtMenuItemQuadAuto[data-on="1"]{color:var(--dsw-alias-label-primary);}',
      /* 象限标签：颜色 = 所在格的颜色（Q4 透明，文字回落 label-secondary 才可读） */
      '.dtQuadTag{display:inline-block;margin-left:var(--dt-sp-2);font-size:var(--dt-fs-micro);font-weight:600;line-height:1.4;white-space:nowrap;}',
      '.dtQuadTag[data-quad-color="red"]{color:var(--dt-quad-red);}',
      '.dtQuadTag[data-quad-color="yellow"]{color:var(--dt-quad-yellow);}',
      '.dtQuadTag[data-quad-color="blue"]{color:var(--dt-quad-blue);}',
      '.dtQuadTag[data-quad-color="none"]{color:var(--dsw-alias-label-secondary);}',
      '.dtMenuItemLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtMenuItemOn{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      /* §0.5 下拉菜单定位：默认向下（top:calc(100% + 2px)），
         data-flip="up" 改向上；放不下时 data-clamp="1" + 内联 max-height 滚动。 */
      '.dtQuadMenu{right:0;width:132px;min-width:132px;max-height:240px;}',
      '.dtMenu{position:absolute;top:calc(100% + 2px);bottom:auto;right:0;z-index:35;min-width:132px;padding:var(--dt-sp-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dt-shadow-menu);display:none;}',
      '.dtMenu[data-open]{display:block;}',
      '.dtMenu[data-flip="up"]{top:auto;bottom:calc(100% + 2px);}',
      '.dtMenu[data-clamp="1"]{overflow:auto;}',
      '.dtMenuItem{display:flex;align-items:center;justify-content:space-between;width:100%;height:28px;padding:var(--dt-sp-1) var(--dt-sp-2);border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dt-fs-meta);text-align:left;cursor:pointer;}',
      '.dtMenuItem:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtMenuItem[data-on]{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dtMenuSep{height:1px;margin:var(--dt-sp-1) var(--dt-sp-2);background:var(--dsw-alias-border-l1);}',

      /* ---- 日历（§5） ---- */
      '.dtCal{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:var(--dt-sp-4) var(--dt-sp-4) var(--dt-sp-4);overflow:hidden;}',
      '.dtCalBar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:var(--dt-sp-3);padding-bottom:var(--dt-sp-3);}',
      '.dtCalNav{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtCalTitle{font-size:var(--dt-fs-title);font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums;}',
      '.dtCalBarRight{position:relative;display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtCalWeek{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;padding-bottom:var(--dt-sp-2);}',
      '.dtCalWeekday{text-align:center;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;}',
      '.dtCalWeekend{opacity:.8;}',
      '.dtCalWeekdayShort{display:none;}',
      '.dtCalGrid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(6,minmax(0,1fr));gap:1px;background:var(--dsw-alias-border-l1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);overflow:hidden;}',
      '.dtCalCell{position:relative;min-height:64px;padding:var(--dt-sp-2) var(--dt-sp-2) var(--dt-sp-2);display:flex;flex-direction:column;gap:2px;background:var(--dsw-alias-bg-base);cursor:pointer;}',
      '.dtCalCell:hover{background:var(--dsw-alias-bg-layer-1);}',
      '.dtCalDay{font-size:var(--dt-fs-meta);line-height:1.2;font-variant-numeric:tabular-nums;}',
      '.dtCalSub{min-height:14px;max-width:100%;line-height:14px;font-size:var(--dt-fs-micro);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);}',
      '.dtCalSubTerm{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dtCalSubLunar{color:var(--dsw-alias-label-secondary);}',
      '.dtCalSubHoliday{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dtMenuCheck .dtMenuItemLabel{flex:1 1 auto;}',
      '.dtMenuCheck[data-on] .dtMenuItemLabel{color:var(--dsw-alias-brand-primary);}',
      '.dtCalHint{margin:var(--dt-sp-1) 2px 2px;padding-top:var(--dt-sp-1);border-top:1px solid var(--dsw-alias-border-l1);font-size:var(--dt-fs-micro);line-height:1.4;color:var(--dsw-alias-label-secondary);}',
      '.dtCalHint[data-cal-hint="compact"]{color:var(--dsw-alias-state-warn-primary);}',
      '.dtCalMakeup{display:inline-block;margin-left:var(--dt-sp-1);padding:0 3px;height:12px;line-height:12px;border-radius:var(--dt-r-row);font-size:var(--dt-fs-micro);font-weight:500;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-warn-primary);}',
      '.dtCalGap{margin-left:var(--dt-sp-1);font-size:var(--dt-fs-meta);line-height:1;color:var(--dsw-alias-label-secondary);opacity:.55;cursor:help;}',
      '.dtCalDots{margin-top:auto;display:flex;align-items:center;gap:3px;height:8px;}',
      '.dtCalDot{width:4px;height:4px;flex:0 0 auto;border-radius:50%;}',
      '.dtCalMoreCount{font-size:var(--dt-fs-micro);line-height:1;color:var(--dsw-alias-label-secondary);}',
      '.dtCalAdd{position:absolute;top:4px;right:4px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;transition:opacity .12s;}',
      '.dtCalCell:hover .dtCalAdd{opacity:1;}',
      '.dtCalToday{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary);}',
      '.dtCalToday .dtCalDay{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dtCalSel{background:var(--dsw-alias-bg-layer-2);}',
      '.dtCalOut{opacity:.42;}',
      '.dtCalMore[aria-expanded="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtCal .dtMenu{position:absolute;top:36px;right:0;z-index:35;min-width:156px;}',

      /* ---- 番茄钟节奏（§4.2 / §4.3 / §4.5） ---- */
      '.dtIsDisabled select{opacity:.45;cursor:not-allowed;pointer-events:none;}',
      '.dtIsDisabled .dtFieldLabel{opacity:.55;}',
      '.dtRhythmField{grid-column:1 / -1;display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtRhythmGroup{display:flex;gap:var(--dt-sp-2);}',
      '.dtRhythmOpt{position:relative;flex:1 1 0;min-width:88px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtRhythmOpt:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);}',
      '.dtRhythmOpt[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.dtRhythmRadio{position:absolute;opacity:0;width:1px;height:1px;margin:0;}',
      '.dtRhythmOptText{white-space:nowrap;}',
      '.dtRhythmField .dtHint{margin-top:0;}',
      '.dtPomoModeSingle{padding:var(--dt-sp-1) var(--dt-sp-4);pointer-events:none;cursor:default;}',

      /* ---- 习惯详情（§2.8：三个数字 + 月历热力图） ---- */
      '.dtHabitDetail{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:auto;}',
      '.dtHabitStats{display:grid;grid-template-columns:repeat(3,1fr);padding:var(--dt-sp-3) 0 var(--dt-sp-3);}',
      '.dtHabitStat{display:flex;flex-direction:column;align-items:center;gap:2px;}',
      '.dtHabitStat+.dtHabitStat{border-left:1px solid var(--dsw-alias-border-l1);}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '.dtHabitStatNum{font-size:20px;font-weight:600;line-height:1.2;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;}',
      '.dtHabitStatLabel{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtHabitHeat{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:0 var(--dt-sp-3) var(--dt-sp-3);}',
      '.dtHeatHead{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtHeatNav{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtHeatNav:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtHeatTitle{flex:1 1 auto;font-size:var(--dt-fs-meta);font-weight:600;font-variant-numeric:tabular-nums;}',
      '.dtHeatCount{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtHeatWeek{display:grid;grid-template-columns:repeat(7,1fr);gap:var(--dt-sp-1);}',
      '.dtHeatWeekday{text-align:center;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtHeatGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:var(--dt-sp-1);max-width:288px;}',
      '.dtHeatCell{aspect-ratio:1 / 1;min-height:26px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dt-r-row);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;cursor:pointer;}',
      '.dtHeatCell[data-out="1"]{opacity:.35;}',
      '.dtHeatCell[data-future="1"]{opacity:.45;cursor:default;}',
      '.dtHeatCell[data-on="1"]{background:var(--dt-habit-color,var(--dsw-alias-brand-primary));color:var(--dsw-alias-bg-base);font-weight:600;}',
      '.dtHeatCell:not([data-future="1"]):not([data-out="1"]):hover{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}',
      /* t156 §2.8.9 热力图两档配色：未打卡=极浅主题色、已打卡=饱和适中；
         两档都由 --dt-accent 混出（不写死 hex，换强调色/主题后自动跟随） */
      '.dtRoot{--dt-heat-empty:color-mix(in oklab, var(--dt-accent) 26%, var(--dsw-alias-bg-layer-2));--dt-heat-on:var(--dt-accent);}',
      '.dtRoot[data-dt-theme="dark"]{--dt-heat-empty:color-mix(in oklab, var(--dt-accent) 30%, var(--dt-bg-2));}',
      '.dtHeatCell{background:var(--dt-heat-empty);}',
      '.dtHeatCell[data-on="1"]{background:var(--dt-heat-on);color:var(--dt-accent-on);}',
      '.dtHeatOn{background:var(--dt-heat-on);color:var(--dt-accent-on);}',
      /* t156 §1.21：立即行动面板（B 栏） */
      '.dtActNow{display:flex;flex-direction:column;gap:var(--dt-sp-3);padding:var(--dt-sp-4) var(--dt-sp-4);overflow:auto;}',
      '.dtActNowTitle{font-size:var(--dt-fs-body);line-height:19px;font-weight:600;color:var(--dt-label-1);}',
      '.dtActNowSteps{display:flex;flex-direction:column;gap:var(--dt-sp-2);margin:0;padding:0;list-style:none;}',
      '.dtActNowStep{display:flex;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);line-height:18px;color:var(--dt-label-1);}',
      '.dtActNowNo{color:var(--dt-accent);font-variant-numeric:tabular-nums;flex:0 0 auto;}',
      '.dtActNowText{flex:1 1 auto;min-width:0;}',
      '.dtActNowMin{flex:0 0 auto;margin-left:auto;padding-left:var(--dt-sp-2);font-size:var(--dt-fs-micro);color:var(--dt-label-2);font-variant-numeric:tabular-nums;}',
      '.dtActNowEmpty{font-size:var(--dt-fs-meta);line-height:18px;color:var(--dt-label-2);}',


      /* ---- 设置页：JSON 导入 ---- */
      '.dtFileLabel{position:relative;overflow:hidden;}',
      '.dtFileInput{display:none;}',
      '.dtHintOk{color:var(--dsw-alias-state-success-primary);}',

      /* ---- 容器断点（§2.3/§2.4，容器 = .dtRoot；任何档位保持 B+C 两栏） ---- */
      '@container dtroot (max-width:1079px){.dtDrawerZone[data-count="2"]{flex-basis:max(580px,calc(100cqw - 196px));}.dtHabitGrid{grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:var(--dt-sp-2);}.dtCalCell{min-height:60px;}}',
      '@container dtroot (max-width:547px){.dtDrawerZone[data-count="2"]{overflow-x:auto;}.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}}',
      '@container dtroot (max-width:719px){.dtDrawerZone[data-count="2"]{flex-basis:max(500px,calc(100cqw - 48px));}.dtDrawerZone[data-count="1"]{flex-basis:min(600px,92%);}.dtDrawer[data-slot="b"]{min-width:220px;}.dtDrawer[data-slot="c"]{min-width:280px;}.dtHabitGrid{grid-template-columns:1fr;gap:var(--dt-sp-2);}.dtCalCell{min-height:48px;}.dtCalSub{font-size:var(--dt-fs-micro);}.dtCalAdd{opacity:1;}.dtRail{box-sizing:border-box;width:48px;flex:0 0 48px;padding:var(--dt-sp-2) var(--dt-sp-1);}.dtRailLabel,.dtRailCount,.dtRailTitle{display:none;}.dtRailItem{height:32px;justify-content:center;padding:0;}.dtRailMore{display:none;}.dtDrawerZone[data-count="1"]{flex-basis:min(420px,calc(100cqw - 348px));}.dtCenter{min-width:280px;}.dtCalCell{padding:var(--dt-sp-1) var(--dt-sp-1) var(--dt-sp-1);min-height:46px;}.dtCalDay{font-size:var(--dt-fs-micro);line-height:1.2;}.dtCalAdd{position:static;order:9;align-self:flex-end;margin-top:auto;width:16px;height:16px;}}',
      '@container dtroot (max-width:559px){.dtHabitGrid{grid-template-columns:1fr;}.dtCalCell{min-height:44px;}.dtCalWeekdayFull{display:none;}.dtCalWeekdayShort{display:inline;}}',
      '@container dtroot (max-width:519px){.dtPomoSettings{grid-template-columns:1fr;}}',
      '@container dtroot (max-width:479px){.dtRhythmGroup{flex-direction:column;}.dtRhythmOpt{flex:1 1 auto;}}',
      '@container dtroot (max-width:419px){.dtPomoModes{flex-wrap:wrap;}.dtPomoMode{min-width:72px;}}',

      /* ---- 中间区容器断点（t46 F12）：番茄钟的设置网格按「中间区自己的宽度」换列。
         原来只按 .dtRoot 判断（519px），抽屉一开、中间区只剩 280px 时右列 select 被裁成「2」「1」。 ---- */
      '@container dcenter (max-width:519px){.dtPomoSettings{grid-template-columns:1fr;max-width:none;gap:var(--dt-sp-2);}}',
      '@container dcenter (max-width:479px){.dtRhythmGroup{flex-direction:column;}.dtRhythmOpt{flex:1 1 auto;}}',
      '@container dcenter (max-width:419px){.dtPomoModes{flex-wrap:wrap;}.dtPomoMode{min-width:72px;}}',
      /* -------------------------------- 螺旋工作法 -------------------------------- */
      '.dtSpiral{width:100%;max-width:420px;margin:0 auto;padding:var(--dt-sp-6) var(--dt-sp-5);display:flex;flex-direction:column;align-items:center;gap:var(--dt-sp-4);}',
      '.dtSpiralRing{position:relative;width:200px;height:200px;flex:0 0 auto;}',
      '.dtSpiralRing svg{display:block;width:100%;height:100%;transform:rotate(-90deg);}',
      '.dtSpiralTrack{fill:none;stroke:var(--dsw-alias-border-l1);stroke-width:10;}',
      '.dtSpiralArc{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:10;stroke-linecap:round;transition:stroke-dashoffset .5s linear;}',
      '.dtSpiralFace{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--dt-sp-2);pointer-events:none;}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '.dtSpiralTime{font-size:44px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);}',
      '.dtSpiralPhase{font-size:var(--dt-fs-body);color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralRound{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralBind{display:flex;align-items:center;gap:var(--dt-sp-2);height:32px;max-width:100%;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);font-size:var(--dt-fs-meta);}',
      '.dtSpiralBindKind{flex:0 0 auto;color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralBindName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtSpiralStats{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:center;}',
      '.dtSpiralActions{display:flex;justify-content:center;gap:var(--dt-sp-3);}',
      '.dtSpiralBtn{height:32px;min-width:88px;padding:0 var(--dt-sp-4);border-radius:var(--dt-r-card);border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-body);cursor:pointer;}',
      '.dtSpiralBtn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtSpiralBtn:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtSpiralStop{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);}',
      '.dtSpiralHint,.dtPomoHint{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);text-align:center;}',
      '.dtSpiralBoard{flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-1) var(--dt-sp-3) var(--dt-sp-6);}',
      '.dtSpiralSection{margin-bottom:var(--dt-sp-4);}',
      '.dtSpiralSectionTitle{margin:0 0 var(--dt-sp-2);font-size:var(--dt-fs-micro);font-weight:600;color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralRow{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:36px;margin-bottom:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtSpiralRowOn{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}',
      '.dtSpiralRowName{flex:1 1 auto;min-width:0;font-size:var(--dt-fs-meta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtSpiralRowMin{flex:0 0 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtSpiralDone,.dtSpiralSwap{position:relative;flex:0 0 auto;height:24px;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-row);border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtSpiralDone:hover,.dtSpiralSwap:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dtSpiralAuto{display:flex;justify-content:flex-end;}',
      '.dtSpiralPreview{margin:0;padding:0;list-style:none;}',
      '.dtSpiralPreviewItem{font-size:var(--dt-fs-meta);line-height:1.7;color:var(--dsw-alias-label-secondary);}',
      '.dtPlayList{margin-bottom:var(--dt-sp-2);}',
      '.dtPlayItem{display:flex;align-items:center;gap:var(--dt-sp-2);height:32px;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-card);}',
      '.dtPlayItem[data-on="1"]{background:var(--dsw-alias-bg-layer-2);}',
      '.dtPlayName{flex:1 1 auto;min-width:0;font-size:var(--dt-fs-meta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtPlayInput{flex:1 1 auto;min-width:0;height:26px;padding:0 var(--dt-sp-2);border-radius:var(--dt-r-row);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);}',
      '.dtPlayOps{display:flex;flex:0 0 auto;gap:2px;}',
      '.dtPlayOp{width:24px;height:24px;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtPlayOp:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dtPlayOp:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtPlayAdd{margin-top:var(--dt-sp-1);height:28px;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-card);border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtSpiralEmpty{padding:var(--dt-sp-4);border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtSpiralHistory{margin-top:var(--dt-sp-2);padding-top:var(--dt-sp-3);border-top:1px solid var(--dsw-alias-border-l1);}',
      '.dtSpiralHistoryList{margin:0;padding:0;list-style:none;}',
      '.dtSpiralHistoryRow{font-size:var(--dt-fs-micro);line-height:1.7;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      /* 五档缩放（§4.10.3）：viewBox 等比缩放，盒子只改宽高 */
      '@container dtroot (max-width:1079px){.dtSpiralRing{width:180px;height:180px;}}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '@container dtroot (max-width:899px){.dtSpiralRing{width:168px;height:168px;}.dtSpiralTime{font-size:38px;}}',
      '@container dtroot (max-width:547px){.dtDrawerZone[data-count="2"]{overflow-x:auto;}.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '@container dtroot (max-width:719px){.dtSpiralRing{width:150px;height:150px;}.dtSpiralTime{font-size:34px;}.dtSpiral{padding:var(--dt-sp-4) var(--dt-sp-3);}}',
      /* 展示型：大计时/统计数字与 UI 文本五档阶梯不同源，不在 micro/meta/body/title/head 内 */,
      '@container dtroot (max-width:559px){.dtSpiralRing{width:132px;height:132px;}.dtSpiralTime{font-size:30px;}.dtSpiralStats{line-height:1.7;}.dtSpiralBtn{min-width:72px;}}',
      /* 排序器（§4.2）：与列表同一底色，避免出现「第二条工具条」的割裂感 */
      '.dtSortBar{display:flex;gap:var(--dt-sp-2);align-items:center;padding:var(--dt-sp-2) var(--dt-sp-3);border-bottom:1px solid var(--dt-border-1);background:var(--dt-bg-0);}',
      '.dtSortSelect{height:26px;padding:0 var(--dt-sp-2);border-radius:var(--dt-r-row);border:1px solid var(--dt-border-1);background:var(--dt-bg-0);color:var(--dt-label-1);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtSortSelect:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtSortDir{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:var(--dt-r-row);border:1px solid var(--dt-border-1);background:var(--dt-bg-0);color:var(--dt-label-2);cursor:pointer;}',
      '.dtSortDir:hover{background:var(--dt-bg-2);color:var(--dt-label-1);}',
      '.dtSortCount{margin-left:auto;font-size:var(--dt-fs-micro);color:var(--dt-label-2);font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.dtGroupHead{padding:var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-1);font-size:var(--dt-fs-micro);font-weight:600;color:var(--dt-label-2);}',
      /* 权重环：18px，四档只改描边不透明度，色相恒为品牌色（不与四象限红黄蓝共色相） */
      '.dtScoreRing{position:relative;display:inline-flex;flex:0 0 auto;width:18px;height:18px;}',
      '.dtScoreRing svg{width:18px;height:18px;display:block;}',
      '.dtScoreTrack{fill:none;stroke:var(--dt-border-1);stroke-width:2.4;}',
      /* 分数圈弧色（§1.17.2）：由 data-score-band 五档决定（0..4，-1 无分），具体色值以
         CSS 变量 --dt-score-arc / --dt-score-arc-dark 注入（gradient 模式注入插值色，
         bands 模式注入本档 anchor）。**不再用不透明度分档**——不透明度在白底上分不出档。 */
      '.dtScoreArc{fill:none;stroke:var(--dt-score-arc,var(--dt-success));stroke-width:2.4;stroke-linecap:round;transition:stroke-dashoffset .2s linear;}',
      '.dtRoot[data-dt-theme="dark"] .dtScoreArc{stroke:var(--dt-score-arc-dark,var(--dt-score-arc,var(--dt-success)));}',
      '.dtScoreRingHeuristic .dtScoreTrack{stroke-dasharray:2 2;}',
      '.dtScoreRingEmpty .dtScoreTrack{stroke-dasharray:2 2;}',
      '.dtScoreLine{font-size:var(--dt-fs-meta);color:var(--dt-label-2);font-variant-numeric:tabular-nums;}',
      /* m05210：主按钮不再吃宿主品牌色（--dt-brand 会跟宿主变黑），统一走强调色三令牌 */
      '.dtBlueBtn{display:inline-flex;align-items:center;height:26px;padding:0 var(--dt-sp-3);border:1px solid var(--dt-accent);border-radius:var(--dt-r-card);background:var(--dt-accent);color:var(--dt-accent-on);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtBlueBtn .dtIcon{color:var(--dt-accent-on);}',
      '.dtBlueBtn:hover{filter:brightness(1.06);}',
      '.dtBlueBtn:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '@container dtroot (max-width:547px){.dtDrawerZone[data-count="2"]{overflow-x:auto;}.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}}',
      '@container dtroot (max-width:719px){.dtSortBar{flex-wrap:wrap;}.dtSortCount{flex:1 0 100%;text-align:right;margin-left:0;}}',
      /* ---- 标签面板（t52 / §3.3.3） ---- */
      '.dtTagBoard{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
      '.dtTagList{flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-2) var(--dt-sp-3) var(--dt-sp-5);display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtTagRow{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:34px;padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid transparent;border-radius:var(--dt-r-card);}',
      '.dtTagRow:hover{background:var(--dt-bg-1);border-color:var(--dt-border-1);}',
      '.dtTagSwatch{width:10px;height:10px;flex:0 0 auto;border-radius:50%;background:var(--dt-label-3);}',
      '.dtTagMain{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:var(--dt-sp-2);padding:2px 0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);text-align:left;cursor:pointer;}',
      '.dtTagMain:hover{color:var(--dsw-alias-brand-primary);}',
      '.dtTagName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtTagCount{font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);}',
      '.dtTagOps{display:flex;align-items:center;gap:2px;opacity:0;transition:opacity 120ms;}',
      '.dtTagRow:hover .dtTagOps{opacity:1;}',
      '.dtTagHint{padding:var(--dt-sp-2) var(--dt-sp-3) var(--dt-sp-4);font-size:var(--dt-fs-micro);line-height:1.5;color:var(--dsw-alias-label-secondary);}',
      '.dtTagPalette{display:flex;flex-wrap:wrap;gap:var(--dt-sp-1);padding:var(--dt-sp-1) var(--dt-sp-2) var(--dt-sp-2) var(--dt-sp-6);}',
      '.dtTagSwatchBtn{width:18px;height:18px;padding:0;border:1px solid var(--dt-border-1);border-radius:50%;cursor:pointer;}',
      '.dtTagSwatchBtn[data-on="1"]{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary) inset;}',
      '.dtTagNew{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3) 2px;}',
      '.dtTagDot{width:10px;height:10px;flex:0 0 auto;border-radius:50%;background:var(--dt-label-3);}',
      '.dtTagOp{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtTagOp:hover{background:var(--dt-bg-2);color:var(--dsw-alias-label-primary);}',
      '.dtTagOpDanger:hover{color:var(--dsw-alias-state-error-primary);}',
      '.dtTagOpOn{background:var(--dt-bg-2);color:var(--dsw-alias-label-primary);}',
      '.dtTagSwatchOn{box-shadow:0 0 0 2px var(--dsw-alias-label-primary) inset;}',
      '.dtTagInput{flex:1 1 auto;height:26px;min-width:0;padding:0 var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-0);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);}',
      '.dtTagAddRow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3) var(--dt-sp-1);}',
      '.dtTagPresetRow{display:flex;flex-wrap:wrap;gap:var(--dt-sp-1);width:100%;}',
      '.dtTagPreset{height:22px;padding:0 var(--dt-sp-2);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);cursor:pointer;}',
      '.dtTagPreset:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
      '.dtChipTagOrphan{color:var(--dsw-alias-label-secondary);border-style:dashed;}',
      /* t156 §1.21：A 栏顶部右侧「立即行动」——颜色只走 accent 令牌，禁字面 hex */
      '.dtRailTop{display:flex;align-items:center;justify-content:space-between;gap:var(--dt-sp-2);}',
      '.dtRailRecBtn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-width:52px;height:22px;margin:0;padding:0 var(--dt-sp-2);border:0;border-radius:var(--dt-r-row);background:var(--dt-accent);color:var(--dt-accent-on);font:inherit;font-size:var(--dt-fs-micro);line-height:1;font-weight:600;cursor:pointer;}',
      '.dtRailRecBtn:hover{filter:brightness(1.06);}',
      '@container dtroot (max-width:719px){.dtRailRecBtn{min-width:32px;width:32px;padding:0;font-size:0;}}',
      '.dtRailRecOn{outline:2px solid var(--dt-brand);outline-offset:-2px;}',
      '.dtBStack{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;}',
      '.dtOneThingStrip{display:flex;align-items:center;gap:var(--dt-sp-2);flex:0 0 auto;padding:var(--dt-sp-2) var(--dt-sp-3);border-bottom:1px solid var(--dt-border-1);background:var(--dt-bg-2);}',
      '.dtOneThingStripKind{flex:0 0 auto;font-size:var(--dt-fs-micro);font-weight:600;color:var(--dsw-alias-state-warn-primary);}',
      '.dtOneThingStripTitle{flex:1 1 auto;min-width:0;padding:0;border:0;background:transparent;text-align:left;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;}',
      '.dtOneThingStripTitle:hover{color:var(--dt-brand);}',
      '.dtOneThingStripScore{flex:0 0 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtMiniDanger{color:var(--dsw-alias-state-error-primary);}',
      /* 推荐作为中间区视图（F17）：.dtRecPanel 原本只当 B 栏面板用，
         挪进中间区后要自己撑满并留出可读边距，同时限制单行宽度。 */
      '.dtRecCenter{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-3) var(--dt-sp-4) var(--dt-sp-4);}',
      '.dtRecCenter>.dtRecPanel{max-width:760px;}',
      '.dtObsBoard,.dtOneThingBoard,.dtRecPanel{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;}',
      '.dtObsBody,.dtOneThingBody,.dtRecBody{display:flex;flex-direction:column;gap:var(--dt-sp-3);flex:1 1 auto;min-height:0;overflow:auto;padding:var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-4);}',
      '.dtObsForm{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-2);}',
      '.dtObsFormTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtObsChips{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtObsChip{height:24px;padding:0 var(--dt-sp-3);border:1px solid var(--dt-border-2);border-radius:var(--dt-r-card);background:transparent;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtObsChip:hover{border-color:var(--dt-brand);color:var(--dt-brand);}',
      '.dtObsChipOn{border-color:var(--dt-brand);background:var(--dt-brand);color:var(--dt-bg-0);}',
      '.dtObsFormRow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);}',
      '.dtObsInput{flex:1 1 140px;min-width:0;height:28px;padding:0 var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-0);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);}',
      '.dtObsSelect,.dtObsDate{height:28px;padding:0 var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-0);color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-meta);}',
      '.dtObsDays{display:flex;gap:var(--dt-sp-1);}',
      '.dtObsRows{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtObsRow{padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtObsViewRow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);}',
      '.dtObsRowLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}',
      '.dtObsRowMin,.dtObsRowDay{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtObsRowNote{flex:1 1 100%;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);}',
      '.dtObsEditRow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);}',
      '.dtObsEmpty{padding:var(--dt-sp-3);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);}',
      '.dtObsEmptyText{margin-top:var(--dt-sp-1);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);line-height:1.5;}',
      '.dtProhibitCard{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-2);}',
      '.dtProhibitHead{display:flex;align-items:baseline;justify-content:space-between;gap:var(--dt-sp-2);}',
      '.dtProhibitTitle{font-size:var(--dt-fs-body);font-weight:600;}',
      '.dtProhibitSub{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtProhibitEmpty{padding:var(--dt-sp-3);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);}',
      '.dtProhibitEmptyTitle{font-weight:600;}',
      '.dtProhibitEmptyText{margin-top:3px;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);line-height:1.5;}',
      '.dtProhibitList,.dtProhibitWatchList{display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtProhibitRow{display:grid;grid-template-columns:18px minmax(60px,auto) 1fr;grid-template-areas:"rank label bar" "rank min share";gap:2px var(--dt-sp-2);align-items:center;font-size:var(--dt-fs-meta);}',
      '.dtProhibitRank{grid-area:rank;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:var(--dt-r-card);background:var(--dt-brand);color:var(--dt-bg-0);font-size:var(--dt-fs-micro);font-weight:600;}',
      '.dtProhibitLabel{grid-area:label;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtProhibitBar{grid-area:bar;height:6px;border-radius:var(--dt-r-row);background:var(--dt-border-1);overflow:hidden;}',
      '.dtProhibitBarFill{display:block;height:100%;border-radius:var(--dt-r-row);background:var(--dsw-alias-state-error-primary);}',
      '.dtProhibitMin{grid-area:min;color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;}',
      '.dtProhibitShare{grid-area:share;text-align:right;color:var(--dsw-alias-state-error-primary);font-size:var(--dt-fs-micro);font-variant-numeric:tabular-nums;}',
      '.dtProhibitWatch{display:flex;flex-direction:column;gap:var(--dt-sp-1);padding-top:var(--dt-sp-2);border-top:1px dashed var(--dt-border-2);}',
      '.dtProhibitWatchTitle{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtProhibitWatchRow{display:flex;align-items:baseline;gap:var(--dt-sp-2);font-size:var(--dt-fs-micro);}',
      '.dtProhibitWatchLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);}',
      '.dtProhibitWatchMin{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtProhibitWatchGap{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtProhibitFoot{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingCard{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtOneThingTop{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtOneThingKind{font-size:var(--dt-fs-micro);font-weight:600;color:var(--dsw-alias-state-warn-primary);}',
      '.dtOneThingProject{flex:1 1 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingTitle{padding:0;border:0;background:transparent;text-align:left;color:var(--dsw-alias-label-primary);font-size:var(--dt-fs-title);font-weight:600;line-height:1.4;cursor:pointer;}',
      '.dtOneThingTitle:hover{color:var(--dt-brand);}',
      '.dtOneThingActions{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtOneThingEmpty,.dtRecEmpty{padding:var(--dt-sp-3);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);}',
      '.dtOneThingEmptyTitle{font-weight:600;}',
      '.dtOneThingEmptyText{margin-top:var(--dt-sp-1);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);line-height:1.5;}',
      '.dtOneThingCandidates{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtOneThingCandidatesTitle{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingPick{display:flex;flex-direction:column;gap:2px;text-align:left;padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:transparent;cursor:pointer;}',
      '.dtOneThingPick:hover{border-color:var(--dt-brand);}',
      '.dtOneThingPickOn{border-color:var(--dt-brand);background:var(--dt-bg-2);}',
      '.dtOneThingPickTitle{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-primary);}',
      '.dtOneThingPickMeta{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingHistory{display:flex;flex-direction:column;gap:var(--dt-sp-1);padding-top:var(--dt-sp-2);border-top:1px dashed var(--dt-border-2);}',
      '.dtOneThingHistoryHead{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingHistoryRow{display:flex;gap:var(--dt-sp-2);font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtOneThingHistoryDay{flex:0 0 auto;font-variant-numeric:tabular-nums;}',
      '.dtRecBlock{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtRecBlockTitle{font-size:var(--dt-fs-meta);font-weight:600;}',
      '.dtRecBlockBody{font-size:var(--dt-fs-meta);line-height:1.6;}',
      '.dtRecTitle{font-size:var(--dt-fs-title);font-weight:600;}',
      '.dtRecMeta{display:flex;flex-wrap:wrap;gap:var(--dt-sp-1) var(--dt-sp-2);margin-top:var(--dt-sp-1);font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtRecNote{margin-top:var(--dt-sp-2);color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);white-space:pre-wrap;}',
      '.dtRecWhy,.dtRecHow{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtRecReason{color:var(--dsw-alias-label-secondary);}',
      '.dtRecStep{color:var(--dsw-alias-label-primary);}',
      '.dtRecAct{display:flex;flex-direction:column;align-items:flex-start;gap:var(--dt-sp-2);}',
      '.dtRecActState{font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '@container dtroot (max-width:547px){.dtDrawerZone[data-count="2"]{overflow-x:auto;}.dtDrawer[data-slot="b"],.dtDrawer[data-slot="c"]{flex:1 1 50%;min-width:0;}}',
      '@container dtroot (max-width:719px){.dtProhibitRow{grid-template-columns:18px 1fr;grid-template-areas:"rank label" "rank min";}.dtProhibitBar,.dtProhibitShare{display:none;}}',

      /* ---- 58-pomo-log 番茄日志 / 月度热力图（§7.4：与习惯热力图刻意不同） ---- */
      '.dtPomoHeat{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);margin-top:var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtPomoHeat .dtHeatWeek{gap:3px;max-width:364px;}',
      '.dtPomoHeat .dtHeatWeekCell{text-align:center;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      '.dtPomoGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;max-width:364px;}',
      '.dtPomoCell{position:relative;aspect-ratio:1 / 1;min-height:28px;min-width:28px;border-radius:var(--dt-r-row);background:var(--dt-pomo-l0);border:1px solid var(--dsw-alias-border-l1);cursor:default;}',
      '.dtPomoCell[data-out="1"]{opacity:.35;}',
      '.dtPomoCell[data-future="1"]{opacity:.45;background-image:repeating-linear-gradient(135deg,transparent 0 3px,var(--dsw-alias-border-l2) 3px 4px);}',
      '.dtPomoCell[data-level="1"]{background:var(--dt-pomo-l1);border-color:transparent;}',
      '.dtPomoCell[data-level="2"]{background:var(--dt-pomo-l2);border-color:transparent;}',
      '.dtPomoCell[data-level="3"]{background:var(--dt-pomo-l3);border-color:transparent;}',
      '.dtPomoCell[data-level="4"]{background:var(--dt-pomo-l4);border-color:transparent;}',
      '.dtPomoNum{position:absolute;right:3px;bottom:1px;font-size:var(--dt-fs-micro);line-height:1;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);}',
      '.dtPomoCell[data-level="3"] .dtPomoNum,.dtPomoCell[data-level="4"] .dtPomoNum{color:var(--dsw-alias-bg-base);}',
      '.dtPomoBind{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:30px;padding:0 var(--dt-sp-3);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);font-size:var(--dt-fs-meta);}',
      '.dtPomoBindLabel{color:var(--dsw-alias-label-secondary);flex:0 0 auto;}',
      '.dtPomoBindName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dtPomoBindEmpty .dtPomoBindName{color:var(--dsw-alias-label-secondary);font-size:var(--dt-fs-micro);white-space:normal;}',
      '.dtRowPomo{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dt-r-row);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.dtRowPomo:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);}',
      '.dtRowPomo[data-on="1"]{color:var(--dsw-alias-brand-primary);}',
      '.dtRowPomo:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtDetailPomo{color:var(--dsw-alias-brand-primary);}',
      '.dtPomoTag{flex:0 0 auto;padding:0 var(--dt-sp-2);border-radius:var(--dt-r-pill);border:1px solid var(--dsw-alias-border-l1);font-size:var(--dt-fs-micro);line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',

      /* ---- 任务信息框（t55 / §9.1）：补充说明 + 步骤 + 附件 + 整理助手 ---- */
      '.dtTaskInfo{margin-top:var(--dt-sp-3);padding-top:var(--dt-sp-3);border-top:1px solid var(--dt-border-1);display:flex;flex-direction:column;gap:var(--dt-sp-4);}',
      '.dtInfoNote,.dtInfoSteps,.dtInfoDocs,.dtInfoAgent{display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtInfoHead{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtInfoTitle{font-size:var(--dt-fs-meta);font-weight:600;color:var(--dt-label-1);}',
      '.dtInfoHint{margin-left:auto;font-size:var(--dt-fs-micro);color:var(--dt-label-3);font-variant-numeric:tabular-nums;}',
      '.dtInfoText{width:100%;box-sizing:border-box;resize:vertical;padding:var(--dt-sp-2) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);color:var(--dt-label-1);font-size:var(--dt-fs-meta);line-height:1.55;font-family:inherit;}',
      '.dtInfoText:focus{outline:none;border-color:var(--dt-brand);}',
      '.dtInfoInput{width:100%;box-sizing:border-box;height:28px;padding:0 var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);color:var(--dt-label-1);font-size:var(--dt-fs-meta);font-family:inherit;}',
      '.dtInfoInput:focus{outline:none;border-color:var(--dt-brand);}',
      '.dtInfoEmpty{padding:var(--dt-sp-3);border:1px dashed var(--dt-border-2);border-radius:var(--dt-r-card);font-size:var(--dt-fs-meta);color:var(--dt-label-3);}',
      '.dtSteps{display:flex;flex-direction:column;gap:2px;}',
      '.dtStep{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:30px;padding:2px var(--dt-sp-1);border-radius:var(--dt-r-card);}',
      '.dtStep:hover{background:var(--dt-bg-1);}',
      '.dtStepCheck{flex:0 0 auto;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid var(--dt-border-2);border-radius:50%;background:transparent;color:var(--dt-brand);cursor:pointer;}',
      '.dtStepDone .dtStepCheck{border-color:var(--dt-brand);background:var(--dt-brand);color:var(--dt-bg-0);}',
      '.dtStepDot{width:6px;height:6px;border-radius:50%;background:var(--dt-border-2);}',
      '.dtStepText{flex:1 1 auto;min-width:0;font-size:var(--dt-fs-meta);color:var(--dt-label-1);word-break:break-word;}',
      '.dtStepDone .dtStepText{color:var(--dt-label-3);text-decoration:line-through;}',
      '.dtStepOp{flex:0 0 auto;width:20px;height:20px;padding:0;border:none;border-radius:var(--dt-r-row);background:transparent;color:var(--dt-label-3);font-size:var(--dt-fs-meta);cursor:pointer;}',
      '.dtStepOp:hover:not(:disabled){background:var(--dt-bg-2);color:var(--dt-label-1);}',
      '.dtStepOp:disabled{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      // S7 焦点环兜底：前面 .dtSearchInput/.dtAddInput/.dtDetailFields .dtFieldInput/.dtInput 都写了
      // outline:none，与 .dtRoot :focus-visible 同特异性且在后序，会把 2px 强调色环压掉。这里用
      // 「类 + :focus-visible」提到 0,2,0 / 0,3,0，键盘聚焦恒可见，颜色跟 --dt-accent 走。
      '.dtRoot :focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtInput:focus-visible,.dtSearchInput:focus-visible,.dtAddInput:focus-visible,.dtInfoInput:focus-visible,.dtInfoText:focus-visible,.dtAccentHex:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtDetailFields .dtFieldInput:focus-visible,.dtDetailFields .dtInput:focus-visible,.dtDetailFields textarea:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtRailItem:focus-visible,.dtBlueBtn:focus-visible,.dtPrimaryBtn:focus-visible,.dtGhostBtn:focus-visible,.dtMiniBtn:focus-visible,.dtPomoBtn:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtStepDel:hover:not(:disabled){color:var(--dt-danger);}',
      '.dtStepAdd{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtDocs{display:flex;flex-direction:column;gap:var(--dt-sp-3);}',
      '.dtDoc{display:flex;flex-direction:column;gap:var(--dt-sp-1);padding:var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-0);}',
      '.dtDocText{min-height:64px;}',
      '.dtAgentBar{display:flex;align-items:center;gap:var(--dt-sp-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);font-size:var(--dt-fs-meta);color:var(--dt-label-2);}',
      '.dtAgentText{flex:1 1 auto;min-width:0;}',
      '.dtAgentBar[data-state="error"]{border-color:var(--dt-danger);color:var(--dt-danger);}',
      '.dtAgentBar[data-state="local"]{border-style:dashed;}',
      '.dtAgentBar[data-state="applied"]{border-color:var(--dt-success);}',
      '.dtAgentDiff{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtAgentDiffRow{display:flex;align-items:baseline;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);color:var(--dt-label-1);}',
      '.dtAgentDiffCol{flex-direction:column;align-items:stretch;gap:var(--dt-sp-1);}',
      '.dtAgentDiffLabel{flex:0 0 auto;font-size:var(--dt-fs-micro);color:var(--dt-label-3);}',
      '.dtAgentDiffOld{color:var(--dt-label-3);text-decoration:line-through;}',
      '.dtAgentDiffArrow{color:var(--dt-label-3);}',
      '.dtAgentDiffNew{font-weight:600;}',
      '.dtAgentDiffSteps{display:flex;flex-direction:column;gap:2px;}',
      '.dtAgentDiffStep{font-size:var(--dt-fs-meta);color:var(--dt-label-1);}',
      '.dtAgentDiffEmpty{font-size:var(--dt-fs-meta);color:var(--dt-label-3);}',
      '.dtAgentDiffActions{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtAgentActionRow{display:flex;align-items:center;gap:var(--dt-sp-2);}',

      '.dtBEmpty{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--dt-sp-2);padding:var(--dt-sp-8) var(--dt-sp-6);text-align:center;outline:none;}',
      '.dtBEmpty:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-4px;}',
      '.dtBEmptyTitle{font-size:var(--dt-fs-title);font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtBEmptyText{font-size:var(--dt-fs-meta);line-height:1.6;max-width:360px;color:var(--dsw-alias-label-secondary);}',
      /* ---- t105：rail 五段 + 标签视图 + 必做之事三段（§1.2 / §1.12） ---- */
      '.dtRailGroup { display: flex; flex-direction: column; gap: 2px; }',
      '.dtRailTop{flex:0 0 auto;}',
      '.dtRail > [data-rail-group="settings"]{flex:0 0 auto;margin-top:auto;}',
      '.dtRail > .dtRailSep[data-rail-pin="1"]{flex:0 0 auto;margin-bottom:var(--dt-sp-2);}',
      '.dtRailGroupInner { display: flex; flex-direction: column; gap: 2px; }',
      '.dtRailSep { height: 1px; background: var(--dsw-alias-border-l1); margin: var(--dt-sp-2) var(--dt-sp-2); }',
      '.dtRailBadge { margin-left: auto; min-width: 16px; height: 16px; padding: 0 var(--dt-sp-1); border-radius: var(--dt-r-card); background: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-bg-base); font-size:var(--dt-fs-micro); line-height: 16px; text-align: center; }',
      '.dtTagsView { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }',
      '.dtTagsPickList { display: flex; flex-direction: column; gap: 2px; padding: var(--dt-sp-2) var(--dt-sp-3); overflow: auto; flex: 0 1 auto; max-height: 42%; }',
      '.dtTagsPick { width: 100%; display: flex; align-items: center; gap: var(--dt-sp-2); height: 30px; padding: 0 var(--dt-sp-2); border: 0; border-radius: var(--dt-r-card); background: transparent; color: var(--dsw-alias-label-primary); font-size:var(--dt-fs-body); text-align: left; cursor: pointer; }',
      '.dtTagsPick:hover { background: var(--dsw-alias-bg-layer-2); }',
      '.dtTagsPickOn { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }',
      '.dtTagsPick .dtTagName { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtTagsPick .dtTagCount { font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }',
      '.dtTagsDivider { height: 1px; background: var(--dsw-alias-border-l1); margin: var(--dt-sp-1) var(--dt-sp-3); }',
      '.dtTagsTasks { flex: 1 1 auto; min-height: 0; overflow: auto; }',
      '.dtTagsEmpty { padding: var(--dt-sp-4) var(--dt-sp-3); }',
      '.dtOneThing { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }',
      '.dtOneThingBody { display: flex; flex-direction: column; gap: var(--dt-sp-3); padding: var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-4); overflow: auto; flex: 1 1 auto; min-height: 0; }',
      '.dtOneSection { display: flex; flex-direction: column; gap: var(--dt-sp-2); }',
      '.dtOneSectionTitle { font-size:var(--dt-fs-micro); font-weight: 600; letter-spacing: .04em; color: var(--dsw-alias-label-secondary); }',
      '.dtOneSectionEmpty { font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-tertiary); padding: var(--dt-sp-2) 0; }',
      '.dtOneCore { display: flex; align-items: center; gap: var(--dt-sp-3); min-height: 96px; padding: var(--dt-sp-3); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dt-r-card); background: var(--dsw-alias-bg-layer-1); }',
      '.dtOneCore[data-done="1"] { opacity: .62; }',
      '.dtOneRing { position: relative; width: 56px; height: 56px; flex: 0 0 56px; }',
      '.dtOneRingTrack { fill: none; stroke: var(--dsw-alias-border-l2); stroke-width: 4; }',
      '.dtOneRingArc { fill: none; stroke: var(--dsw-alias-brand-primary); stroke-width: 4; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 28px 28px; }',
      '.dtOneRingNum { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size:var(--dt-fs-body); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }',
      '.dtOneBody { display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; min-width: 0; }',
      '.dtOneTitle { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font-size:var(--dt-fs-title); font-weight: 600; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtOneWhy { font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtOneHow { font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtOneOps { display: flex; align-items: center; gap: var(--dt-sp-2); flex: 0 0 auto; }',
      '.dtOneSwap { height: 26px; padding: 0 var(--dt-sp-3); border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dt-r-card); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size:var(--dt-fs-meta); cursor: pointer; }',
      '.dtOneEmpty { display: flex; flex-direction: column; gap: var(--dt-sp-1); min-height: 96px; justify-content: center; padding: var(--dt-sp-3); border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--dt-r-card); }',
      '.dtOneEmptyTitle { font-size:var(--dt-fs-body); font-weight: 600; color: var(--dsw-alias-label-primary); }',
      '.dtOneEmptyText { font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-secondary); }',
      '.dtProhibitTop { display: flex; flex-direction: column; gap: var(--dt-sp-1); }',
      '.dtProhibitRow { display: flex; align-items: center; gap: var(--dt-sp-2); height: 34px; padding: 0 var(--dt-sp-3); border-left: 3px solid var(--dsw-alias-state-error-primary); border-radius: var(--dt-r-row); background: var(--dsw-alias-bg-layer-1); }',
      '.dtProhibitBadge { flex: 0 0 auto; font-size:var(--dt-fs-micro); font-weight: 600; padding: 1px var(--dt-sp-1); border-radius: var(--dt-r-row); color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-bg-base); }',
      '.dtProhibitLabel { flex: 1 1 auto; min-width: 0; font-size:var(--dt-fs-body); color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtProhibitMin { flex: 0 0 auto; font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }',
      '.dtProhibitWatch { display: flex; flex-direction: column; gap: 2px; padding-left: var(--dt-sp-3); }',
      '.dtProhibitWatchRow { display: flex; align-items: center; gap: var(--dt-sp-2); height: 28px; font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-secondary); }',
      '.dtProhibitGap { font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-tertiary); }',
      '.dtObsForm { display: flex; align-items: center; gap: var(--dt-sp-2); height: 32px; }',
      '.dtObsInput { flex: 1 1 auto; min-width: 0; }',
      '.dtObsMinutes { width: 64px; flex: 0 0 64px; }',
      '.dtObsAdd { flex: 0 0 auto; height: 30px; }',
      '.dtObsList { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }',
      '.dtObsRow { display: flex; align-items: center; gap: var(--dt-sp-2); height: 28px; font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-primary); }',
      '.dtObsLabel { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dtObsMin { flex: 0 0 auto; font-size:var(--dt-fs-micro); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }',
      '.dtObsDel { flex: 0 0 auto; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: var(--dt-r-row); background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }',
      '.dtObsDel:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-state-error-primary); }',
      '.dtObsEmpty { font-size:var(--dt-fs-meta); color: var(--dsw-alias-label-tertiary); padding: var(--dt-sp-2) 0; }',
      '@container dtroot (max-width: 719px) { .dtOneCore { flex-wrap: wrap; } .dtOneOps { width: 100%; } }',
      /* ---- C 栏评分控件（§1.13.2）：整行 28px、gap 8px ---- */
      '.dtScoreEdit{display:flex;align-items:center;gap:var(--dt-sp-2);min-height:28px;flex:1 1 auto;min-width:0}',
      '.dtScoreEdit .dtScoreRing{width:20px;height:20px;flex:0 0 20px}',
      '.dtScoreText{font-size:var(--dt-fs-meta);color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}',
      '.dtScoreRange{flex:1 1 auto;min-width:120px;height:20px;accent-color:var(--dt-success)}',
      '.dtScoreInput{width:72px;flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums;font-size:var(--dt-fs-meta);height:22px;padding:0 var(--dt-sp-2);border-radius:var(--dt-r-row);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.dtScoreBtn{height:22px;padding:0 var(--dt-sp-2);font-size:var(--dt-fs-micro);border-radius:var(--dt-r-row);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;flex:0 0 auto}',
      '.dtScoreBtn:disabled{opacity:.5;cursor:default}',
      '.dtScoreSubmit:not(:disabled){background:var(--dt-brand);border-color:var(--dt-brand);color:var(--dt-bg-0)}',
      '.dtScoreEdit[data-invalid="1"] .dtScoreInput{border-color:var(--dsw-alias-state-error-primary)}',
      '.dtScoreEdit[data-busy="1"]{opacity:.7}',
      '@container dtroot (max-width:559px){.dtScoreText{display:none}.dtScoreRange{min-width:88px}}',
      /* ---- dt-accent 生效范围白名单（§1.19.4 穷举 5 项；白名单之外一律不受影响） ---- */
      '[data-dt="score-batch"]{border-color:var(--dt-accent);background:var(--dt-accent);color:var(--dt-accent-on);}',
      '[data-dt="score-batch"]:hover{background:var(--dt-accent-weak);border-color:var(--dt-accent);}',
      '[data-dt="score-batch"] .dtIcon{color:var(--dt-accent-on);}',
      '.dtCheck[data-dt="task-check"]{border-color:var(--dt-accent);}',
      '.dtCheck[data-dt="task-check"][data-on="1"]{border-color:var(--dt-accent);background:var(--dt-accent);color:var(--dt-accent-on);}',
      '.dtPomoCell[data-pomo-day][data-today="1"][data-on="1"]{border-color:var(--dt-accent);background:var(--dt-accent);color:var(--dt-accent-on);}',
      '.dtPomoCell[data-pomo-day][data-today="1"][data-on="1"] .dtPomoNum{color:var(--dt-accent-on);}',
      /* ---- accent 控件（设置页「风格设置」组，§1.19.2） ---- */
      '.dtAccentField{display:flex;flex-direction:column;gap:var(--dt-sp-2);}',
      '.dtAccentSwatches{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dt-sp-2);}',
      '.dtAccentOpt{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid var(--dt-border-1);border-radius:50%;background:var(--dt-bg-0);cursor:pointer;}',
      '.dtAccentOpt[data-on="1"]{border-color:var(--dt-label-1);box-shadow:0 0 0 2px var(--dt-accent-ring);}',
      '.dtAccentChip{width:22px;height:22px;border-radius:50%;background:var(--dt-accent-label,var(--dt-accent));}',
      '.dtAccentOpt[data-accent="custom"] .dtAccentChip{background:transparent;border:1px dashed var(--dt-label-3);}',
      '.dtAccentOpt[data-accent="custom"][data-on="1"] .dtAccentChip{background:var(--dt-accent);border-style:solid;border-color:var(--dt-accent);}',
      '.dtAccentHexRow{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtAccentHex{width:96px;padding:var(--dt-sp-1) var(--dt-sp-2);border:1px solid var(--dt-border-1);border-radius:var(--dt-r-row);background:var(--dt-bg-0);color:var(--dt-label-1);font:inherit;font-size:var(--dt-fs-meta);font-variant-numeric:tabular-nums;}',
      '.dtAccentHex[aria-invalid="true"]{border-color:var(--dt-quad-red);}',
      '.dtAccentRatio{font-size:var(--dt-fs-micro);color:var(--dt-label-2);}',
      '.dtAccentRatio[data-state="warn"]{color:var(--dt-warn);}',
      '.dtAccentRatio[data-state="bad"]{color:var(--dt-quad-red);}',
      '.dtSegmented{display:flex;gap:var(--dt-sp-1);width:100%;}',
      '.dtSegmented .dtSegBtn[data-on="1"]{border-color:currentColor;background:var(--dt-bg-2);font-weight:600;}',
      /* ---- 热力图进设置卡：间距由外层包裹承担，本体 margin 归零（否则会造出假间距） ---- */
      '.dtPomoSettings .dtPomoHeatWrap{grid-column:1/-1;margin:0;padding:0;}',
      '.dtPomoSettings .dtPomoHeat{margin-top:0;}',
          '.dtResistance{display:flex;flex-direction:column;min-height:0;flex:1 1 auto;overflow:hidden;}',
      '.dtResistanceBody{display:flex;flex-direction:column;gap:var(--dt-sp-3);padding:var(--dt-sp-3) var(--dt-sp-3) var(--dt-sp-4);min-height:0;overflow-y:auto;overscroll-behavior:contain;}',
      '.dtResSection{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-3);border:1px solid var(--dt-border-l1);border-radius:var(--dt-r-card);background:var(--dt-bg-1);}',
      '.dtResSectionTitle{font-size:var(--dt-fs-meta);font-weight:600;color:var(--dt-label-1);}',
      '.dtResChips{display:flex;flex-wrap:wrap;gap:var(--dt-sp-2);}',
      '.dtResHint{font-size:var(--dt-fs-micro);line-height:17px;color:var(--dt-label-2);}',
      '.dtResEmpty{font-size:var(--dt-fs-meta);line-height:18px;color:var(--dt-label-2);padding:var(--dt-sp-2) var(--dt-sp-3);border:1px dashed var(--dt-border-l2);border-radius:var(--dt-r-card);}',
].join('\n');

    function injectStyles() {
      try {
        const existed = window.document.getElementById(STYLE_ID);
        if (existed) {
          /* 模块热替换时旧样式会留在 head 里，必须用新 CSS 覆盖，否则新类名没有规则 */
          if (existed.textContent !== CSS) existed.textContent = CSS;
          return;
        }
        const style = window.document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        window.document.head.appendChild(style);
      } catch (err) {
        /* 样式失败时保持裸样式可用 */
      }
    }

    /* ---------------------- accent 令牌注入（§1.19.3） ---------------------- */
    const ACCENT_STYLE_ID = STYLE_ID + '-accent';

    /* rgb()/hex 都吃：宿主 token 在有的主题下是 hex、有的主题下是 rgb() */
    function accentHexFromCss(text) {
      const value = String(text || '').trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
      const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return '';
      return '#' + hexByte(parseInt(m[1], 10)) + hexByte(parseInt(m[2], 10)) + hexByte(parseInt(m[3], 10));
    }

    /* brand 档不复制宿主色值，只能运行时实测：读 --dsw-alias-brand-primary 现算两档对比度 */
    function measureBrandAccent() {
      try {
        const doc = window.document;
        const root = (doc.querySelector && doc.querySelector('.dtRoot')) || doc.documentElement;
        if (!root || !window.getComputedStyle) return null;
        const cs = window.getComputedStyle(root);
        const hex = accentHexFromCss(cs.getPropertyValue ? cs.getPropertyValue('--dsw-alias-brand-primary') : '');
        if (!hex) return null;
        return {
          light: hex,
          dark: hex,
          onLight: accentOnFor(hex),
          onDark: accentOnFor(hex),
          ratioLight: contrastRatioOf(hex, '#' + ACCENT_BG_LIGHT),
          ratioDark: contrastRatioOf(hex, '#' + ACCENT_BG_DARK)
        };
      } catch (err) {
        return null;
      }
    }

    function accentStyleText(appearance) {
      /* S7：存量脏值（accent 空串 / 未知档 / custom 未填色）不是用户选择。直接交给 accentToneOf
         会落进 brand 分支，把 --dt-accent 绑到宿主品牌色（真机量到的近黑墨色，rail 选中条与
         焦点环一起变黑）。这里先归一成默认档 rose。 */
      const rawAccent = appearance && typeof appearance === 'object' ? appearance.accent : '';
      const knownAccent = ACCENT_KEYS.indexOf(rawAccent) >= 0;
      const customFilled = rawAccent === 'custom' && !!normalizeAccentHex(appearance && appearance.accentHex);
      const effective = !knownAccent || (rawAccent === 'custom' && !customFilled) ? defaultAppearance() : appearance;
      const tone = accentToneOf(effective);
      const measured = measureBrandAccent();
      let light = tone.light;
      let dark = tone.dark;
      let onLight = tone.onLight;
      let onDark = tone.onDark;
      let fgLight = 'var(--dt-accent)';
      let fgDark = 'var(--dt-accent)';
      /* §1.19.5：brand 低于 4.5:1 时前景（文字/图标）降级 --dt-label-1，但**标签仍是品牌色**，
         所以色块单独吃 --dt-accent-label，不跟 fg 一起降级。其余 7 档两者恒等。 */
      const labelLight = 'var(--dt-accent)';
      const labelDark = 'var(--dt-accent)';
      if (tone.brand) {
        light = 'var(--dsw-alias-brand-primary)';
        dark = 'var(--dsw-alias-brand-primary)';
        if (measured) {
          onLight = measured.onLight;
          onDark = measured.onDark;
          /* brand 唯一例外（§1.19.5）：<4.5 时只作填充与描边，前景降级 --dt-label-1 */
          if (measured.ratioLight < 4.5) fgLight = 'var(--dt-label-1)';
          if (measured.ratioDark < 4.5) fgDark = 'var(--dt-label-1)';
        } else {
          onLight = '#' + ACCENT_ON_LIGHT;
          onDark = '#' + ACCENT_ON_DARK;
        }
      }
      return [
        '.dtRoot{--dt-accent:' + light + ';--dt-accent-on:' + onLight + ';--dt-accent-fg:' + fgLight +
          ';--dt-accent-label:' + labelLight + '}',
        '.dtRoot[data-dt-theme="dark"]{--dt-accent:' + dark + ';--dt-accent-on:' + onDark + ';--dt-accent-fg:' + fgDark +
          ';--dt-accent-label:' + labelDark + '}',
        '.dtDetailFields .dtTitleFirst{min-height:34px;padding:var(--dt-sp-2) var(--dt-sp-2);}',
      '.dtBreakdown{display:flex;flex-direction:column;gap:var(--dt-sp-2);padding:var(--dt-sp-3) var(--dt-sp-3);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dt-r-card);background:var(--dsw-alias-bg-layer-1);}',
      '.dtBreakdownHead{display:flex;align-items:center;gap:var(--dt-sp-2);}',
      '.dtBreakdownTitle{font-size:var(--dt-fs-meta);font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dtBreakdownMeta{flex:1 1 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtBreakdownRun{flex:0 0 auto;}',
      '.dtBreakdownCode{font-size:var(--dt-fs-micro);line-height:16px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;}',
      '.dtBreakdownSteps{display:flex;flex-direction:column;gap:var(--dt-sp-1);}',
      '.dtBreakdownStep{display:flex;align-items:baseline;gap:var(--dt-sp-2);font-size:var(--dt-fs-meta);line-height:18px;color:var(--dsw-alias-label-primary);}',
      '.dtBreakdownNo{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.dtBreakdownText{flex:1 1 auto;}',
      '.dtBreakdownMin{flex:0 0 auto;font-size:var(--dt-fs-micro);color:var(--dsw-alias-label-secondary);}',
      /* G6 主题化：选区、光标、滚动条一律跟令牌，不写死颜色 */
      '.dtRoot ::selection{background:var(--dt-accent-weak);color:var(--dt-label-1);}',
      '.dtRoot ::-moz-selection{background:var(--dt-accent-weak);color:var(--dt-label-1);}',
      '.dtRoot input,.dtRoot textarea,.dtRoot [contenteditable="true"]{caret-color:var(--dt-accent);}',
      '.dtRoot .dtList,.dtRoot .dtDrawerZone,.dtDrawer,.dtRailScroll,.dtModalBody,.dtCalGrid{scrollbar-width:thin;scrollbar-color:var(--dt-border-2) transparent;}',
      '.dtRoot .dtList::-webkit-scrollbar,.dtRoot .dtDrawerZone::-webkit-scrollbar,.dtDrawer::-webkit-scrollbar,.dtRailScroll::-webkit-scrollbar,.dtModalBody::-webkit-scrollbar{width:var(--dt-sp-2);height:var(--dt-sp-2);}',
      '.dtRoot .dtList::-webkit-scrollbar-thumb,.dtRoot .dtDrawerZone::-webkit-scrollbar-thumb,.dtDrawer::-webkit-scrollbar-thumb,.dtRailScroll::-webkit-scrollbar-thumb,.dtModalBody::-webkit-scrollbar-thumb{background:var(--dt-border-2);border-radius:var(--dt-r-pill);}',
      '.dtRoot .dtList::-webkit-scrollbar-track,.dtRoot .dtDrawerZone::-webkit-scrollbar-track,.dtDrawer::-webkit-scrollbar-track,.dtRailScroll::-webkit-scrollbar-track,.dtModalBody::-webkit-scrollbar-track{background:transparent;}',
      /* G5 四态补齐：rail 项 / 任务行 / 主次按钮 / 分段控件。禁用同时给 aria-disabled，见各渲染点 */
      '.dtRailItem:active{background:var(--dt-bg-2);transform:translateY(1px);}',
      '.dtRailItem[aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;pointer-events:none;}',
      '.dtRow:active{background:var(--dt-bg-2);}',
      '.dtRow[aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;}',
      '.dtPrimaryBtn:active{transform:translateY(1px);filter:brightness(.96);}',
      '.dtGhostBtn:hover{background:var(--dt-bg-2);}',
      '.dtGhostBtn:active{background:var(--dt-bg-2);transform:translateY(1px);}',
      '.dtGhostBtn[aria-disabled="true"],.dtMiniBtn[aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;pointer-events:none;}',
      '.dtMiniBtn:hover{background:var(--dt-bg-2);}',
      '.dtMiniBtn:active{transform:translateY(1px);}',
      '.dtSegBtn:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtIconBtn:focus-visible,.dtCheck:focus-visible{outline:2px solid var(--dt-accent);outline-offset:2px;}',
      '.dtSegBtn:hover{background:var(--dt-bg-2);}',
      '.dtSegBtn:active{transform:translateY(1px);}',
      '.dtSegBtn[data-on="1"]:active{transform:none;}',
      '.dtSegBtn[aria-disabled="true"],[role="radio"][aria-disabled="true"]{opacity:var(--dt-disabled-op);cursor:not-allowed;pointer-events:none;}',
    ].join('\n');
    }

    /* 只覆盖四个令牌，不碰任何业务样式；重复调用幂等（内容相同不重写） */
    function injectAccent(appearance) {
      try {
        const text = accentStyleText(appearance);
        const existed = window.document.getElementById(ACCENT_STYLE_ID);
        if (existed) {
          if (existed.textContent !== text) existed.textContent = text;
          return;
        }
        const style = window.document.createElement('style');
        style.id = ACCENT_STYLE_ID;
        style.textContent = text;
        window.document.head.appendChild(style);
      } catch (err) {
        /* 注入失败时退回 palette 里的 brand 默认值，界面不白屏 */
      }
    }

    /* ------------------------------------- 注册 ------------------------------------ */

    function disposeOn(ctx, fn) {
      try {
        if (typeof ctx.effect === 'function') {
          ctx.effect(function () {
            return fn;
          });
          return;
        }
      } catch (err) {
        /* 继续尝试 ctx.on */
      }
      try {
        if (typeof ctx.on === 'function') ctx.on('dispose', fn);
      } catch (err) {
        /* 无清理钩子时进程结束自然回收 */
      }
    }

    /* t127：apply 抛错时仍要注册两个插槽并渲染 fatal 卡片——白屏比报错更糟。
       ctx 里任何一步都可能已经失败，所以这里每一步单独兜。 */
    function registerFatalSlots(ctx, err) {
      try {
        const offRow = ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 30,
              label: function () {
                return '任务';
              }
            },
            function (ownerProps) {
              return h(SidebarIcon, ownerProps || {});
            }
          );
        });
        if (typeof offRow === 'function') disposeOn(ctx, offRow);
      } catch (e) {
        /* 侧栏注册失败不影响主区出卡片 */
      }
      try {
        const offMain = ctx.slots.inject('main', function () {
          return ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID
            },
            function () {
              return renderFatalPanel(err);
            }
          );
        });
        if (typeof offMain === 'function') disposeOn(ctx, offMain);
      } catch (e) {
        /* 两个插槽都注册不了，只能交给宿主 */
      }
    }

    function apply(ctx) {
      try {
        return applyInner(ctx);
      } catch (err) {
        try {
          console.error('[dsh-tasks] 面板初始化失败', err);
        } catch (e) {
          /* 控制台不可用 */
        }
        registerFatalSlots(ctx, err);
        return undefined;
      }
    }

    function applyInner(ctx) {
      injectStyles();
      const store = createStore();
      /* S7：这里必须传「原始 appearance」而不是 accentOf(...) 的结果——accentOf 会把空串/未知档
         收敛成 'brand'，而 brand 分支的 --dt-accent 是宿主品牌色（真机近黑墨色），rail 选中条与
         焦点环都会变黑。传原始值，由 accentStyleText 区分「脏值回落默认档」与「用户真选了 brand」。 */
      const appRaw = store.get().settings && store.get().settings.appearance;
      injectAccent(appRaw && typeof appRaw === 'object' ? appRaw : defaultAppearance());
      const reminders = createReminderEngine(store);
      const pomodoro = createPomodoroEngine(store);
      const writeback = createWritebackEngine(store);
      reminders.start();
      pomodoro.start();
      writeback.start();

      const offRow = ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 30,
            label: function () {
              return '任务';
            }
          },
          function (ownerProps) {
            return h(SidebarIcon, ownerProps || {});
          }
        );
      });

      const offMain = ctx.slots.inject('main', function () {
        return ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            inject: function () {
              return { store: store };
            }
          },
          function (ownerProps) {
            return h(TasksPanel, Object.assign({ store: store }, ownerProps || {}));
          }
        );
      });

      const flush = function () {
        store.saveNow();
      };
      window.addEventListener('beforeunload', flush);

      disposeOn(ctx, function () {
        try {
          reminders.stop();
        } catch (err) {
          /* 已停止 */
        }
        try {
          pomodoro.stop();
        } catch (err) {
          /* 已停止 */
        }
        try {
          flush();
        } catch (err) {
          /* 忽略 */
        }
        window.removeEventListener('beforeunload', flush);
        [offRow, offMain].forEach(function (off) {
          try {
            if (typeof off === 'function') off();
          } catch (err) {
            /* 已卸载 */
          }
        });
      });
    }

    return {
      inject: ['slots'],
      apply: apply,
      /* §1.14：client 对外只多这一个面，且固定两键 —— 供外部（回归/诊断）核对
         「整理通道」与「打分通道」用的 system prompt 是否与规格逐字一致。
         冻结后不可改；不得把 scoreTask / SCORE_RUBRIC_VERSION / PALETTE /
         SPIRAL_PHASES 之类内部符号挂上来（规格反向硬规则）。 */
      __prompts: Object.freeze({
        agent: AGENT_SYSTEM_PROMPT,
        score: AGENT_SCORE_SYSTEM_PROMPT
      })
    };
  }
});
