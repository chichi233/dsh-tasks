# dsh-tasks

DSH（DeepSeek Harness）左侧栏的**任务 / 习惯 / 番茄钟**面板插件。纯客户端实现：数据存在浏览器 `localStorage`，不联网、不上传、不需要账号。

灵感来自滴答清单的交互，但是独立实现，与滴答清单官方无任何关系。

> 本仓库**不含任何用户数据**。`client.js` 由空种子构建：首次打开只有一个空「收集箱」，任务、清单、习惯、评分全部为空白，从零开始用。

## 功能

- **清单与任务**：项目清单、今天 / 最近 7 天 / 全部未完成 / 已完成 / 已删除视图；新建、勾选完成、软删除与恢复、彻底删除；优先级、标签、子任务、备注、重复规则。
- **日期与提醒**：全天或精确到分钟；提前 0/5/10/15/30/60 分钟提醒；到点页面横幅 + 浏览器通知（需授权）+ 提示音。
- **习惯打卡**：按天/周频率、连续天数、最长记录、日历热力。
- **番茄钟**：预设 5/10/15/20/25 分钟，可改工作时长、短/长休息、长休息间隔、自动接续、提示音。
- **评分与四象限**：任务按四维启发式打分（0–100），落到「重要 / 紧急」四象限；分数可手工覆盖，也可用本地 LLM 通道批量打分。
- **智能能力（可选）**：通过 Host 半边 `index.js` 暴露的四条同源路由调用 DSH 自带模型，做润色与打分；默认关闭，不配置就不发任何请求。

## 安装

插件由「Client 半边 `client.js` + Host 半边 `index.js` + `cordis.patch.yml` 注册」三部分组成。

1. 把本仓库放到本机任意目录，例如 `~/dsh-tasks`。
2. 在 DSH 的 profile 目录（如 `~/.dsh/profiles/desktop/package.json`）里加一条链接依赖：

   ```json
   { "dependencies": { "@local/dsh-tasks": "link:~/dsh-tasks" } }
   ```

   并在该 profile 的 `cordis.patch.yml` 加入本仓库 `cordis.patch.yml` 的 `insert` 段（`id: dsh-tasks`）。
3. 重启 DSH。侧边栏出现「任务」图标即安装成功。

## 数据

- 存储键：`dsh.tasks.v1`，内容为 `{ version, db: { tasks, projects, tags, scores, pomodoroLog, habitLog, obstacles, modules, scoreFeedback }, settings, pomo, ... }`。
- 首次打开时按内置种子初始化（本仓库为空种子）。升级到新版本不会清空既有数据。
- 设置页可导出 JSON 备份、导入恢复、清空任务。清除浏览器站点数据会丢数据，重要清单请先导出。
- 数据不跨浏览器、不跨设备，也不与任何第三方服务同步。

## 开发

```bash
npm run build        # 用 ./seed/ 下的数据（若有）重编 client.js；没有就是空白包
npm run build:demo   # 用 test/fixtures/demo 演示数据编出 client.demo.js
npm test             # 演示构建 + 渲染回归（~396 条断言）
```

源码在 `src/parts/*.js`，按文件名顺序拼成 `client.js`；`00-prelude.js` 里的 `/*__SEED__*/ null` 与 `/*__HABITS__*/ null` 由 `build.mjs` 替换成种子数据。

想用自己的数据构建，把三个文件放到 `seed/`：

| 文件 | 内容 |
| --- | --- |
| `seed/tasks.json` | `{ projects: [...], tasks: [...] }` |
| `seed/habits.json` | `{ habits: [...], checkIns: [{habitId, date}] }` |
| `seed/scores.json` | `{ items: [{ id, score }] }` |

三个文件都是可选的；`seed/` 已在 `.gitignore` 里，不会被提交。

## 目录

```
index.js            Host 半边：/models /ping /polish /score 四条同源路由
client.js           构建产物（空白种子），插件实际加载的包
build.mjs           源码 + 种子 → client.js
src/parts/          客户端源码，按序拼接
locale/             文案
test/render-test.mjs 渲染回归（最小 React 桩，无浏览器）
docs/               设计与架构说明
```

## 已知边界

- 提醒和番茄钟只在页面打开时生效，没有后台服务或系统级闹钟。
- 已完成 / 已删除视图最多渲染 300 条，避免上千节点卡顿。
- 智能润色与打分依赖 Host 半边，只在 DSH 内可用；默认关闭。
- 回归测试有 1 条断言（`S139S4`，静态检查「只有 57-agent.js 碰网络」）与当前实现口径不一致，长期为红，其余 395 条通过。
- 回归里的 11 条断言依赖「至少有一个带任务行的清单」，所以跑的是 `npm test` 的演示构建；直接拿空白 `client.js` 跑会红这 11 条，属预期。

## 许可

MIT，见 [LICENSE](LICENSE)。
