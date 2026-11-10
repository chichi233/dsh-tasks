
    /* ================================ 57-agent · 任务整理助手（P5） ================================
       规格 docs/stage4-foundation.md §9.2 / §9.3 / §10（客户端侧纯逻辑，视图在 59-taskinfo.js）：

       · 一次请求两件事：system 提示词要求模型只回一个 JSON 对象 `{title, steps}`，
         绝不发两次请求、也绝不发第二次补全；
       · 解析链四级（§9.3）：直接 parse → 剥 ```json 围栏 → 正则截第一个 `{…}` → AGENT_BAD_JSON；
       · 半成功是合法结果：只有 steps 没有 title（或反之）不算失败，交给视图层「待确认」处理，
         视图只写模型真的给出来的那一半；
       · 八类错误码（§10.4）在这里集中分类，视图只负责把 code 显示成文案；
       · 密钥四条（§10.5）：只从 settings.agent.apiKey 读、绝不进 console、绝不进 URL；
         请求前校验 Base URL 必须是 https:// 或 http://localhost，避免把 Key 明文发到 http。
       · 本文件不碰 store、不碰 DOM：纯函数 + 一次可注入的 fetch 调用，便于测试桩替换。 */

    const AGENT_RETRY_DELAYS = [1000, 3000];

    /* §10.1 provider 只影响「填预设」，不改变请求体形状。
       t118：改成四家显式列表，值固定 codex|gemini|deepseek|opencodego（不许自创）。
       apiBase 一律填到「能拼 /chat/completions 的那一层」：
         - codex      OpenAI 平台 API（注意订阅账号 ≠ API key）
         - gemini     Gemini 的 OpenAI 兼容层（不是原生 generateContent）
         - deepseek   DeepSeek 官方
         - opencodego OpenCode Go 的 OpenAI 兼容端点（模型列表走 GET /v1/models）
       model 只是「建议值」：写进设置页 placeholder，用户不填时才用它发请求。
      t123 口径：占位只能写「按官方文档核过、当前确实存在」的模型名；核不到就统一写「模型名」，
      四家占位串不许重复（此前 deepseek 与 opencodego 撞成同一串、另两家写了不存在的版本号）。 */
    const AGENT_PROVIDER_PRESETS = {
      codex: { label: 'Codex（OpenAI）', apiBase: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      gemini: { label: 'Gemini', apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
      deepseek: { label: 'DeepSeek', apiBase: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      opencodego: { label: 'OpenCode Go', apiBase: 'https://opencode.ai/zen/go/v1', model: '模型名' }
    };

    /* 老配置里可能存过 openai / custom，读的时候按别名归一到四家之一（不写回、不改用户数据） */
    const AGENT_PROVIDER_ALIASES = { openai: 'codex', custom: 'deepseek', 'opencode-go': 'opencodego', 'opencode go': 'opencodego' };

    const AGENT_PROVIDER_ORDER = ['codex', 'gemini', 'deepseek', 'opencodego'];

    function agentProviderKey(value) {
      const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (!key) return '';
      if (AGENT_PROVIDER_PRESETS[key]) return key;
      return AGENT_PROVIDER_ALIASES[key] || '';
    }

    /* 设置页 placeholder 用：该供应商的建议 model（未选/未知供应商回落到默认） */
    function agentModelSuggestion(provider) {
      const preset = agentPresetOf(provider);
      return preset ? preset.model : AGENT_DEFAULT_CONFIG.model;
    }

    function agentPresetOf(provider) {
      const key = agentProviderKey(provider);
      return key ? AGENT_PROVIDER_PRESETS[key] : null;
    }

    const AGENT_DEFAULT_CONFIG = {
      provider: 'deepseek',
      apiBase: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-v4.1-flash',
      timeoutMs: 30000,
      maxRetries: 1
    };

    /* §9.3 逐字：模型只回 JSON，steps 3–7 条、动词开头、不编造 */
    const AGENT_SYSTEM_PROMPT = [
      '你是任务整理助手。只输出一个 JSON 对象，不要任何解释、不要代码围栏。',
      'JSON 必须形如：{"title": "润色后的任务名（≤24字，动词开头）", "steps": ["步骤1", "步骤2", "步骤3"]}',
      '要求：title 保持原意、去掉口语与冗余；steps 3–7 条，每条 ≤40 字，按执行顺序排列，动词开头。',
      '信息不足时也要给出合理步骤，不要返回空数组，不要编造与任务无关的内容。'
    ].join('\n');

    /* §10.6 打分通道的独立 system prompt（t110：两套 prompt 各自完整、互不引用）。
       禁止把打分要求追加到 AGENT_SYSTEM_PROMPT 尾部，也禁止在这里写「沿用上文的输出格式」。 */
    const AGENT_SCORE_SYSTEM_PROMPT = [
      '你是任务评分助手。根据任务信息给出 0–100 的整数分数，并给一句话理由。',
      '',
      '评分口径：分数越高表示越值得优先做（影响大、紧急、与长期目标相关）；分数越低表示越可以往后放。',
      '',
      '输出要求：',
      '1. 只输出一个 JSON 对象：{"score": <0–100 的整数>, "reason": "<一句话，不超过 60 字>"}。',
      '2. score 必须是整数，不得带小数、不得带百分号、不得写成字符串。',
      '3. reason 只写这个分数的主要依据，不写建议、不写鼓励语、不重复任务标题。',
      '4. 不要输出 title、steps 或任何其他字段。',
      '',
      '共用硬规则（同本节开头三条）：不臆造、非任务返回 {"error":"not_a_task"}、只输出一个 JSON 对象。'
    ].join('\n');

    /* few-shot 块（§9.4）：只拼到 AGENT_SCORE_SYSTEM_PROMPT 之后，绝不进整理通道。
       抽样规则写死：N=8 / 过滤 coldStart===false 且 |delta|>=2 / 同 taskId 取最新 /
       同 normTitle+sign+quad 取最新 / at 降序 / 有效条数<3 不注入。 */
    const SCORE_FEWSHOT_N = 8;
    const SCORE_FEWSHOT_MIN = 3;
    const SCORE_FEWSHOT_LINE_MAX = 180;
    const SCORE_FEWSHOT_BLOCK_MAX = 1600;
    const SCORE_FEWSHOT_HEAD = '以下是该用户过去对手动改分的示例（修改前 → 修改后）。请让打分贴近这些偏好：';

    function scoreNormTitle(title) {
      return String(title || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function scoreFewshotLines(db) {
      const rows = (isPlainObject(db) && Array.isArray(db.scoreFeedback) ? db.scoreFeedback : []).filter(function (row) {
        if (!isPlainObject(row)) return false;
        if (row.coldStart !== false) return false;
        if (typeof row.delta !== 'number' || !isFinite(row.delta)) return false;
        return Math.abs(row.delta) >= 2;
      });
      /* 去重一：同一任务只取 at 最新的一条 */
      const byTask = Object.create(null);
      rows.forEach(function (row) {
        const prev = byTask[row.taskId];
        if (!prev || (row.at | 0) > (prev.at | 0)) byTask[row.taskId] = row;
      });
      /* 去重二：键 = normTitle + sign(delta) + quad；同标题一正一负不算重复 */
      const byKey = Object.create(null);
      Object.keys(byTask).forEach(function (taskId) {
        const row = byTask[taskId];
        const features = isPlainObject(row.features) ? row.features : {};
        const sign = row.delta >= 0 ? '+' : '-';
        const key = scoreNormTitle(features.title) + sign + String(features.quad || '');
        const prev = byKey[key];
        if (!prev || (row.at | 0) > (prev.at | 0)) byKey[key] = row;
      });
      const picked = Object.keys(byKey)
        .map(function (key) { return byKey[key]; })
        .sort(function (a, b) { return (b.at | 0) - (a.at | 0); })
        .slice(0, SCORE_FEWSHOT_N);
      return picked.map(function (row) {
        const features = isPlainObject(row.features) ? row.features : {};
        const before = isPlainObject(row.before) ? row.before : {};
        const line = JSON.stringify({
          b: typeof before.score === 'number' ? round1(before.score) : null,
          a: Math.round(Number(row.after) || 0),
          t: String(features.title || '').slice(0, 40),
          g: (Array.isArray(features.tags) ? features.tags : []).slice(0, 3),
          p: typeof features.priority === 'number' ? features.priority : 0,
          q: String(features.quad || '')
        });
        return line.length > SCORE_FEWSHOT_LINE_MAX ? line.slice(0, SCORE_FEWSHOT_LINE_MAX) : line;
      });
    }

    /* 返回 '' 表示「不注入」——此时打分 system 必须与 AGENT_SCORE_SYSTEM_PROMPT 严格等值 */
    function scoreFewshotBlock(db, settings) {
      const cfg = isPlainObject(settings) && isPlainObject(settings.scoreFeedback) ? settings.scoreFeedback : {};
      if (cfg.useAsExamples === false) return '';
      const lines = scoreFewshotLines(db);
      if (lines.length < SCORE_FEWSHOT_MIN) return '';
      /* 整块超限时从最旧一行丢（块头不动）——lines 已按 at 降序，所以从尾部丢 */
      const kept = lines.slice();
      const size = function () {
        return SCORE_FEWSHOT_HEAD.length + 1 + kept.reduce(function (acc, line) { return acc + line.length + 1; }, 0);
      };
      while (kept.length > SCORE_FEWSHOT_MIN && size() > SCORE_FEWSHOT_BLOCK_MAX) kept.pop();
      return SCORE_FEWSHOT_HEAD + '\n' + kept.join('\n');
    }

    function agentScoreSystem(block) {
      return block ? AGENT_SCORE_SYSTEM_PROMPT + '\n\n' + block : AGENT_SCORE_SYSTEM_PROMPT;
    }

    /* 打分结果归一（§10.6）：score 非整数按 round 收敛，越界钳制；reason 原样（不截断）。 */
    function agentNormalizeScore(raw) {
      const source = isPlainObject(raw) ? raw : {};
      const score = Number(source.score);
      if (!isFinite(score)) return { ok: false, code: 'AGENT_BAD_JSON' };
      return {
        ok: true,
        score: Math.round(Math.max(0, Math.min(100, score))),
        reason: typeof source.reason === 'string' ? source.reason : ''
      };
    }

    /* §10.4 八类错误码 + 配置缺失（不是错误码，是降级分支） */
    const AGENT_CODE_MESSAGE = {
      AGENT_AUTH: 'API Key 无效或已过期，请到设置 → 服务商与模型中更新',
      AGENT_RATE: '请求过于频繁，稍后再试',
      AGENT_FORMAT: '服务端不支持 JSON 模式，已改用普通请求重试',
      AGENT_ENDPOINT: '接口地址不对，请检查 Base URL（应形如 https://…/v1）',
      AGENT_SERVER: '服务端错误，已重试',
      AGENT_TIMEOUT: '请求超时（30 秒），已重试',
      AGENT_NETWORK: '无法连接（可能是网络或跨域限制）。浏览器直连需要服务端允许 CORS',
      AGENT_BAD_JSON: '返回格式无法解析，请换个模型再试',
      AGENT_BASE: '接口地址必须是 https:// 或 http://localhost，否则密钥会明文外传',
      AGENT_CONFIG: '请先在设置 → 服务商与模型中填写接口地址、API Key 与模型'
    };

    const AGENT_RETRYABLE = { AGENT_RATE: 1, AGENT_SERVER: 1, AGENT_TIMEOUT: 1 };


    /* --------------------------- 模型来源三档（t123 §1.18） ---------------------------
       dsh    走 Host 半边（同源 /plugins/local/dsh-tasks），用 DSH 自己的 llm 与默认模型，
              **不需要也不读取 API Key**；
       custom 走用户填的第三方 OpenAI 兼容端点（t118 的老路，含 CORS 限制）；
       off    一律不发请求，直接让调用方走本地规则降级（蓝按钮/打分仍可点）。

       迁移口径：老数据没有 source 字段 —— 填过 apiKey 或改过 apiBase 的算 custom（他们的
       配置是刻意填的，不能因为升级就静默改道），其余一律 dsh（新装默认零配置可用）。 */
    const AGENT_SOURCES = ['dsh', 'custom', 'off'];
    const DSH_AGENT_BASE = '/plugins/local/dsh-tasks';

    function agentSourceOf(settings) {
      const raw = isPlainObject(settings) && isPlainObject(settings.agent) ? settings.agent : {};
      const declared = typeof raw.source === 'string' ? raw.source.trim().toLowerCase() : '';
      if (AGENT_SOURCES.indexOf(declared) >= 0) return declared;
      const hasKey = typeof raw.apiKey === 'string' && raw.apiKey.trim() !== '';
      const base = typeof raw.apiBase === 'string' ? raw.apiBase.trim() : '';
      const customBase = base !== '' && base !== AGENT_DEFAULT_CONFIG.apiBase;
      return hasKey || customBase ? 'custom' : 'dsh';
    }

    /* 拼接同源路由：DSH_AGENT_BASE 是硬编码常量，URL 必须逐字以它开头（静态审计也按这个查） */
    function agentDshUrl(path) {
      return DSH_AGENT_BASE + path;
    }

    /* 一次同源调用：只带 Content-Type，**绝不带 Authorization**（Host 用自己的身份）。
       返回 Promise<{ ok, status, json }>；网络层失败抛错由调用方翻成 AGENT_NETWORK。 */
    function agentDshCall(path, method, body, timeoutMs) {
      const doFetch = agentFetchImpl();
      if (!doFetch) return Promise.reject(new Error('NO_FETCH'));
      const payload = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body !== undefined) payload.body = JSON.stringify(body);
      let timer = null;
      let controller = null;
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        payload.signal = controller.signal;
        const wait = isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : AGENT_DEFAULT_CONFIG.timeoutMs;
        timer = window.setTimeout(function () {
          try {
            controller.abort();
          } catch (err) {
            /* 已结束 */
          }
        }, wait);
      }
      const clear = function () {
        if (timer) window.clearTimeout(timer);
        timer = null;
      };
      return Promise.resolve()
        .then(function () {
          return doFetch(agentDshUrl(path), payload);
        })
        .then(function (response) {
          const status = Number(response && response.status) || 0;
          const textOf = response && typeof response.text === 'function' ? response.text() : Promise.resolve('');
          return Promise.resolve(textOf).then(function (text) {
            clear();
            let json = null;
            try {
              json = JSON.parse(String(text || ''));
            } catch (err) {
              json = null;
            }
            return { ok: status >= 200 && status < 300, status: status, json: json };
          });
        })
        .catch(function (error) {
          clear();
          const name = error && error.name ? error.name : '';
          if (name === 'AbortError') throw Object.assign(new Error('TIMEOUT'), { code: 'AGENT_TIMEOUT' });
          throw Object.assign(new Error(name || 'NETWORK'), { code: 'AGENT_NETWORK' });
        });
    }

    /* Host 侧的失败体是 { ok:false, code, message }，码表与本地十码同一套 —— 直接透传 */
    function agentDshFailure(result) {
      const json = result && result.json ? result.json : {};
      const code = typeof json.code === 'string' && json.code ? json.code : agentCodeOfStatus(result ? result.status : 0, '');
      /* t150：Host（index.js 3b0957c9）把真因放在 detail 里——
         stage / code / name / upstreamStatus / upstreamType / upstreamMessage / finishKind。
         以前这里只取 message，于是 dsh 档「测试连接」失败时页面上一个字都看不到真因。 */
      const rawDetail = json && typeof json.detail === 'object' && json.detail ? json.detail : null;
      const detail = rawDetail
        ? {
            provider: 'dsh',
            providerLabel: 'DSH 本地模型',
            url: agentDshUrl(String(json.path || '') || ''),
            status: Number(rawDetail.upstreamStatus) || Number(result ? result.status : 0) || 0,
            bodySnippet: typeof rawDetail.upstreamMessage === 'string' ? rawDetail.upstreamMessage : '',
            upstreamMessage: typeof rawDetail.upstreamMessage === 'string' ? rawDetail.upstreamMessage : '',
            upstreamStatus: Number(rawDetail.upstreamStatus) || 0,
            upstreamType: typeof rawDetail.upstreamType === 'string' ? rawDetail.upstreamType : '',
            stage: typeof rawDetail.stage === 'string' ? rawDetail.stage : '',
            hostCode: typeof rawDetail.code === 'string' ? rawDetail.code : '',
            name: typeof rawDetail.name === 'string' ? rawDetail.name : '',
            finishKind: typeof rawDetail.finishKind === 'string' ? rawDetail.finishKind : '',
            corsLikely: false,
            lines: []
          }
        : null;
      return agentErrorResult(code, {
        status: result ? result.status : 0,
        message: typeof json.message === 'string' && json.message ? json.message : undefined,
        detail: detail || undefined
      });
    }

    /* 打分通道的 few-shot 块由页面算（§9.4 抽样规则在页面侧），Host 只做拼接 */
    var ACT_NOW_STRENGTH_KEYS = ['weak', 'mid', 'strong'];

    /* t214：拆解步数区间的唯一真源。与 Host `index.js` 的 ACT_NOW_STRENGTH.count 同口径
       （弱 3–5 / 中 6–10 / 强 11–18）；提示词文案、归一化上限、下限补足都从这里派生，
       不许再写第二份区间表——两处各写一份就会像 t213-F1 那样悄悄漂移。 */
    var AGENT_BREAKDOWN_RANGES = { weak: [3, 5], mid: [6, 10], strong: [11, 18] };
    function agentBreakdownRangeOf(strength) {
      return AGENT_BREAKDOWN_RANGES[strength] || AGENT_BREAKDOWN_RANGES.mid;
    }

    /* t166：用户在设置页选的服务商 / 模型。空串表示「用 DSH 默认」，
       此时不往请求体里塞字段，Host 会回落到自己的 selection。 */
    function agentDshPick(cfg) {
      const out = {};
      if (cfg && typeof cfg.dshProvider === 'string' && cfg.dshProvider) out.provider = cfg.dshProvider;
      if (cfg && typeof cfg.dshModel === 'string' && cfg.dshModel) out.model = cfg.dshModel;
      return out;
    }

    function agentDshBody(cfg, task, projectName, options, kind) {
      const body = {
        kind: kind,
        task: {
          title: task && task.title ? String(task.title) : '',
          note: String((task && task.detailNote) || '').slice(0, 2000),
          project: projectName || ''
        }
      };
      if (kind === 'score') {
        const block = typeof options.fewshot === 'string' ? options.fewshot : '';
        if (block) body.fewshot = block;
      }
      if (kind === 'polish') {
        /* 拆分强度只对整理通道有意义（弱 3–5 / 中 6–10 / 强 11–18 步，Host 侧按此生成步数与耗时） */
        const strength = typeof options.strength === 'string' ? options.strength : '';
        body.strength = ACT_NOW_STRENGTH_KEYS.indexOf(strength) >= 0 ? strength : 'mid';
      }
      return Object.assign(body, agentDshPick(cfg));
    }

    /* dsh 档的生成：一次请求，不重试（Host 内部已限时；重试只会放大等待） */
    /* 任务拆解专用归一（t169）：整理助手那条链路（agentNormalizeResult）把步骤截到 7 条、
       且丢掉了 minutes；拆解要按强度给 3–5 / 6–10 / 11–18 步并保留「约 N 分钟」，
       所以单独一份归一，不改动既有 agentNormalizeResult 的行为。 */
    function agentBreakdownLimitOf(strength) {
      return agentBreakdownRangeOf(strength)[1];
    }

    function agentBreakdownMinOf(strength) {
      return agentBreakdownRangeOf(strength)[0];
    }

    /* t214：custom 档（自己的 baseUrl/apiKey）此前一律吃 AGENT_SYSTEM_PROMPT 的「3–7 条」，
       于是强档永远拿不到 11 步以上。这里按强度生成拆解专用 system prompt，
       AGENT_SYSTEM_PROMPT 一字不动（§15-81 逐字钉死，整理通道仍用它）。 */
    function agentBreakdownSystemPrompt(strength) {
      var range = agentBreakdownRangeOf(strength);
      return [
        '你是任务拆解助手。只输出一个 JSON 对象，不要任何解释、不要代码围栏。',
        'JSON 必须形如：{"title": "拆解后的任务名（≤24字）", "steps": ["步骤1", "步骤2"]}；',
        '步骤也可以写成 {"text": "步骤内容", "minutes": 15} 这种对象，两种混用都接受。',
        '要求：steps 共 ' + range[0] + '–' + range[1] + ' 条，按执行顺序排列，每条 ≤40 字，动词开头，必须是能立刻动手的动作。',
        '已知单步预计耗时就把 minutes 写成 5–60 的整数；不确定就只给字符串，不要编造耗时。',
        '信息不足时按任务本身给出可执行步骤，不要返回空数组，不要写「思考一下」「了解一下」这类空动作。'
      ].join('\n');
    }

    /* ⚠ 不要与 agentNormalizeResult 合并：后者把步骤硬截到 7 条、且丢掉 minutes，
       而拆解在 strong 档要出 11–18 步并保留「约 N 分钟」——合并会让 strong 档直接废掉。 */
    function agentBreakdownNormalize(raw, strength) {
      /* 截断上限按强度取（weak 5 / mid 10 / strong 18），来源是 AGENT_BREAKDOWN_RANGES；
         不足下限时由 UI 的 breakdownStepsFromHost 用本地规则步骤补足，这里不做补长。 */
      const limit = agentBreakdownLimitOf(strength);
      const source = isPlainObject(raw) ? raw : {};
      const list = Array.isArray(source.steps) ? source.steps : [];
      const seen = {};
      const steps = [];
      list.forEach(function (item) {
        if (steps.length >= limit) return;
        const text = typeof item === 'string' ? item.trim() : isPlainObject(item) && typeof item.text === 'string' ? item.text.trim() : '';
        if (!text || text.length > 200) return;
        if (seen[text]) return;
        seen[text] = 1;
        const minutes = typeof item === 'object' && item ? Number(item.minutes) : 0;
        const step = { text: text.slice(0, 60) };
        if (isFinite(minutes) && minutes > 0) step.minutes = Math.min(600, Math.round(minutes));
        steps.push(step);
      });
      return { title: typeof source.title === 'string' ? source.title.trim().slice(0, 60) : '', steps: steps };
    }

    /* dsh 档拆解：同源 /polish，body 里带 provider / model / strength（agentDshBody 已统一处理） */
    function agentDshBreakdown(cfg, task, projectName, options) {
      const opts = options || {};
      const body = agentDshBody(cfg, task, projectName, opts, 'polish');
      return agentDshCall('/polish', 'POST', body, cfg.timeoutMs).then(function (result) {
        if (!result.ok) return agentDshFailure(result);
        const json = result.json || {};
        if (json.ok !== true || typeof json.text !== 'string') return agentDshFailure(result);
        const parsed = agentParseJson(json.text);
        if (!parsed.ok) return agentErrorResult('AGENT_BAD_JSON', { status: result.status });
        return {
          ok: true,
          data: agentBreakdownNormalize(parsed.data, opts.strength),
          attempts: 1,
          retries: 0,
          droppedFormat: false,
          provider: json.provider || '',
          model: json.model || '',
          via: 'dsh'
        };
      });
    }

    /* custom 档拆解（t169，t214 修强度）：走它自己的 baseUrl / apiKey / provider / model。
       强度只用于本地 system prompt（agentBreakdownSystemPrompt）与步数上限，
       **不进请求体**——厂商不认识 strength，带上会被 400 拒（t213-F1）。 */
    function agentCustomBreakdown(cfg, task, projectName, options) {
      const opts = options || {};
      const strength = ACT_NOW_STRENGTH_KEYS.indexOf(opts.strength) >= 0 ? opts.strength : 'mid';
      if (!cfg || !cfg.apiKey) return Promise.resolve(agentErrorResult('AGENT_CONFIG'));
      return agentAttempt(cfg, task, projectName, false, '', 'breakdown', { strength: strength });
    }

    function agentDshRun(cfg, task, projectName, options) {
      const kind = options.mode === 'score' ? 'score' : 'polish';
      return agentDshCall(kind === 'score' ? '/score' : '/polish', 'POST', agentDshBody(cfg, task, projectName, options, kind), cfg.timeoutMs).then(
        function (result) {
          if (!result.ok) return agentDshFailure(result);
          const json = result.json || {};
          if (json.ok !== true || typeof json.text !== 'string') return agentDshFailure(result);
          const parsed = agentParseJson(json.text);
          if (!parsed.ok) return agentErrorResult('AGENT_BAD_JSON', { status: result.status });
          /* 成功体形状与 agentAttempt 保持一致：{ ok:true, data:<归一化结果> } */
          if (kind === 'score') {
            const scored = agentNormalizeScore(parsed.data);
            if (!scored.ok) return agentErrorResult('AGENT_BAD_JSON', { status: result.status });
            return {
              ok: true,
              data: scored,
              attempts: 1,
              retries: 0,
              droppedFormat: false,
              provider: json.provider || '',
              model: json.model || '',
              via: 'dsh'
            };
          }
          return {
            ok: true,
            data: agentNormalizeResult(parsed.data),
            attempts: 1,
            retries: 0,
            droppedFormat: false,
            provider: json.provider || '',
            model: json.model || '',
            via: 'dsh'
          };
        },
        function (error) {
          return agentErrorResult(error && error.code ? error.code : 'AGENT_NETWORK', { status: 0 });
        }
      );
    }

    /* dsh 档的连通性测试：打 /ping，Host 用它自己的模型发一次最小请求 */
    function pingAgentDsh(cfg) {
      const startedAt = Date.now();
      return agentDshCall('/ping', 'POST', agentDshPick(cfg), cfg.timeoutMs).then(
        function (result) {
          const latency = Date.now() - startedAt;
          if (!result.ok) return Object.assign(agentDshFailure(result), { latency: latency });
          const json = result.json || {};
          if (json.ok !== true) return Object.assign(agentErrorResult('AGENT_SERVER', { status: result.status }), { latency: latency });
          return {
            ok: true,
            code: '',
            message: '连接正常',
            status: result.status,
            latency: typeof json.latency === 'number' ? json.latency : latency,
            model: json.model || cfg.model,
            provider: json.provider || '',
            url: agentDshUrl('/ping'),
            via: 'dsh'
          };
        },
        function (error) {
          return Object.assign(agentErrorResult(error && error.code ? error.code : 'AGENT_NETWORK', { status: 0 }), {
            latency: Date.now() - startedAt,
            url: agentDshUrl('/ping')
          });
        }
      );
    }

    /* 设置页 dsh 档要显示「当前 DSH 模型」：GET /models */
    function agentFetchDshModels() {
      return agentDshCall('/models', 'GET', undefined, AGENT_DEFAULT_CONFIG.timeoutMs).then(
        function (result) {
          if (!result.ok) return agentDshFailure(result);
          const json = result.json || {};
          if (json.ok !== true || !isPlainObject(json.selection)) return agentErrorResult('AGENT_SERVER', { status: result.status });
          const models = Object.create(null);
          if (isPlainObject(json.models)) {
            Object.keys(json.models).forEach(function (provider) {
              const list = json.models[provider];
              if (!Array.isArray(list)) return;
              models[provider] = list
                .filter(function (item) { return isPlainObject(item) && typeof item.id === 'string' && item.id; })
                .map(function (item) {
                  return { id: item.id, name: typeof item.name === 'string' && item.name ? item.name : item.id };
                });
            });
          }
          return {
            ok: true,
            selection: { provider: String(json.selection.provider || ''), model: String(json.selection.model || '') },
            providers: Array.isArray(json.providers) ? json.providers.filter(function (id) { return typeof id === 'string'; }) : [],
            models: models
          };
        },
        function (error) {
          return agentErrorResult(error && error.code ? error.code : 'AGENT_NETWORK', { status: 0 });
        }
      );
    }

    /* §10.1 与既有设置页字段（timeout / retries 以秒、次数计）双向兼容 */
    function agentConfigOf(settings) {
      const raw = isPlainObject(settings) && isPlainObject(settings.agent) ? settings.agent : {};
      const cfg = Object.assign({}, AGENT_DEFAULT_CONFIG, {
        provider: typeof raw.provider === 'string' && raw.provider ? raw.provider : AGENT_DEFAULT_CONFIG.provider,
        apiBase: typeof raw.apiBase === 'string' ? raw.apiBase.trim() : AGENT_DEFAULT_CONFIG.apiBase,
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
        model: typeof raw.model === 'string' ? raw.model.trim() : AGENT_DEFAULT_CONFIG.model,
        /* t166：dsh 档的两级选择（空串 = 用 DSH 当前默认） */
        dshProvider: typeof raw.dshProvider === 'string' ? raw.dshProvider.trim() : '',
        dshModel: typeof raw.dshModel === 'string' ? raw.dshModel.trim() : ''
      });
      /* t118：model 留空时用该供应商的建议值发请求（预设只是建议，用户填了就以用户为准） */
      if (!cfg.model) {
        const preset = agentPresetOf(cfg.provider);
        cfg.model = preset ? preset.model : AGENT_DEFAULT_CONFIG.model;
      }
      /* 规格写 timeoutMs / maxRetries；设置页历史字段是 timeout(秒) / retries(次) */
      const timeoutMs = Number(raw.timeoutMs);
      if (isFinite(timeoutMs) && timeoutMs > 0) {
        cfg.timeoutMs = timeoutMs;
      } else {
        const seconds = Number(raw.timeout);
        cfg.timeoutMs = isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : AGENT_DEFAULT_CONFIG.timeoutMs;
      }
      const maxRetries = Number(raw.maxRetries);
      if (isFinite(maxRetries) && maxRetries >= 0) {
        cfg.maxRetries = Math.floor(maxRetries);
      } else {
        const retries = Number(raw.retries);
        cfg.maxRetries = isFinite(retries) && retries >= 0 ? Math.floor(retries) : AGENT_DEFAULT_CONFIG.maxRetries;
      }
      /* t123：来源是路由开关，调用方一律通过 cfg.source 判档（调用点不在本卡范围，故在此注入） */
      cfg.source = agentSourceOf(settings);
      return cfg;
    }

    /* 配置是否齐全：缺哪一项就返回哪一项的中文名，视图用它做提示 */
    function agentMissing(cfg) {
      const missing = [];
      /* dsh 档零配置：Host 用 DSH 自己的模型，不需要地址与密钥 */
      if (cfg && cfg.source === 'dsh') return cfg.model ? missing : missing.concat(['模型']);
      if (cfg && cfg.source === 'off') return missing;
      if (!cfg.apiBase) missing.push('接口地址');
      if (!cfg.apiKey) missing.push('API Key');
      if (!cfg.model) missing.push('模型');
      return missing;
    }

    /* §10.2 防明文外传：只允许 https，或本机 localhost 调试 */
    function agentBaseAllowed(apiBase) {
      const base = String(apiBase || '').trim();
      if (/^https:\/\/[^\s]+$/i.test(base)) return true;
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(base)) return true;
      return false;
    }

    function agentEndpointOf(apiBase) {
      const base = String(apiBase || '').replace(/\/+$/, '');
      return base + '/chat/completions';
    }

    /* §9.3 解析链：①②③ 依次尝试，全失败才 AGENT_BAD_JSON */
    function agentParseJson(content) {
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) return { ok: false, code: 'AGENT_BAD_JSON' };

      const attempt = function (candidate) {
        try {
          const parsed = JSON.parse(candidate);
          return isPlainObject(parsed) ? parsed : null;
        } catch (err) {
          return null;
        }
      };

      let data = attempt(text);
      if (!data) {
        const fenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        data = attempt(fenced);
      }
      if (!data) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) data = attempt(text.slice(start, end + 1));
      }
      if (!data) return { ok: false, code: 'AGENT_BAD_JSON' };
      return { ok: true, data: data };
    }

    /* §9.3 归一化：title 非空且 ≤60 字（超长截断）；steps 过滤空串、去重、至多 7 条。
       数量为 0 不是失败——那是「半成功」，由视图显示「未生成新标题 / 未拆解出步骤」。 */
    function agentNormalizeResult(raw) {
      const source = isPlainObject(raw) ? raw : {};
      const title = typeof source.title === 'string' ? source.title.trim().slice(0, 60) : '';
      const list = Array.isArray(source.steps) ? source.steps : [];
      const seen = {};
      const steps = [];
      list.forEach(function (item) {
        const text = typeof item === 'string' ? item.trim() : '';
        if (!text || text.length > 200) return;
        if (seen[text]) return;
        seen[text] = 1;
        if (steps.length < 7) steps.push(text.slice(0, 40));
      });
      return { title: title, steps: steps };
    }

    function agentUserContent(task, projectName) {
      return JSON.stringify({
        title: task && task.title ? task.title : '',
        note: String((task && task.detailNote) || '').slice(0, 2000),
        project: projectName || ''
      });
    }

    function agentBodyOf(cfg, task, projectName, dropFormat, system, options) {
      const opts = isPlainObject(options) ? options : {};
      const maxTokens = isFinite(opts.maxTokens) && opts.maxTokens > 0 ? Math.round(opts.maxTokens) : 800;
      const body = {
        model: cfg.model,
        messages: [
          { role: 'system', content: typeof system === 'string' && system ? system : AGENT_SYSTEM_PROMPT },
          { role: 'user', content: agentUserContent(task, projectName) }
        ],
        temperature: 0.2,
        max_tokens: maxTokens
      };
      if (!dropFormat) body.response_format = { type: 'json_object' };
      /* t214：options 只承载**本地**参数（目前只有 maxTokens），一律不合并进请求体。
         早先这里 `Object.assign(body, extra)` 把 {strength} 直接发给厂商——strength 不是
         OpenAI 兼容字段，强档请求会被 400 拒；强度只该影响本地 system prompt 与步数上限。
         dsh 档的 strength 走 Host 的 /polish（agentDshBody 单独拼），与本函数无关。 */
      return body;
    }

    /* fetch 在调用时取，测试桩替换 window.fetch 后立刻生效 */
    function agentFetchImpl() {
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') return window.fetch;
      if (typeof fetch === 'function') return fetch;
      return null;
    }

    /* t118：把任何要展示/落 DOM 的文本里的密钥抹掉。
       两道替换：出现过的 apiKey 原文、以及 Authorization 头里 Bearer 后面的任意串。 */
    function agentRedact(text, apiKey) {
      let out = typeof text === 'string' ? text : '';
      if (!out) return '';
      const key = typeof apiKey === 'string' ? apiKey.trim() : '';
      if (key) out = out.split(key).join('***');
      out = out.split('Bearer ').join('Bearer ***');
      return out;
    }

    /* 诊断详情：失败时把「请求到哪、返回什么、是不是被跨域拦了」说清楚。
       只做展示用，不进 localStorage、不进日志。 */
    function agentDiagnose(cfg, url, status, bodyText, errName) {
      const key = cfg && cfg.apiKey ? cfg.apiKey : '';
      const provider = agentProviderKey(cfg && cfg.provider) || (cfg && cfg.provider) || '';
      const preset = agentPresetOf(provider);
      const label = preset ? preset.label : (provider || '自定义');
      const code = Number(status) || 0;
      const snippet = agentRedact(String(bodyText || '').slice(0, 200), key);
      const corsLikely = code === 0 && (errName === 'TypeError' || errName === 'FailedToFetch' || errName === 'NetworkError');
      const lines = [
        '供应商：' + label,
        '请求地址：' + url,
        'HTTP 状态：' + (code ? String(code) : '0（没连上：DNS / 证书 / 被拦截，或跨域预检失败）')
      ];
      if (snippet) lines.push('响应体前 200 字符：' + snippet);
      if (corsLikely) {
        lines.push('判定：很可能是跨域（CORS）——dsh-app:// 页面直接请求第三方 API，服务端未返回 Access-Control-Allow-Origin');
        lines.push('建议 1：把「模型来源」改为 DSH 本地模型（由宿主代理转发，不经浏览器直连）');
        lines.push('建议 2：在能改服务端的环境里为该域名加上 Access-Control-Allow-Origin 与 Access-Control-Allow-Headers: Authorization');
      }
      return {
        provider: provider,
        providerLabel: label,
        url: url,
        status: code,
        bodySnippet: snippet,
        corsLikely: corsLikely,
        errName: errName || '',
        lines: lines
      };
    }

    function agentCodeOfStatus(status, bodyText) {
      if (status === 401 || status === 403) return 'AGENT_AUTH';
      if (status === 429) return 'AGENT_RATE';
      if (status === 404) return 'AGENT_ENDPOINT';
      if (status >= 500) return 'AGENT_SERVER';
      if (status === 400 && String(bodyText || '').indexOf('response_format') >= 0) return 'AGENT_FORMAT';
      if (status === 400) return 'AGENT_FORMAT';
      return 'AGENT_SERVER';
    }

    /* t150：错误态那一行「原始 message」。优先级 —— Host 的 detail.upstreamMessage >
       诊断里的响应体片段 detail.bodySnippet > 人话 message。
       **detail 不是唯一来源**：老进程（index.js 未重启）根本不返回 detail，
       这时仍要能用 code + message 拼出一行，不能因此空着。 */
    const AGENT_DETAIL_MAX = 120;
    function agentDetailTextOf(code, message, detail) {
      const textOf = function (value) {
        return typeof value === 'string' && value ? value : '';
      };
      const box = detail && typeof detail === 'object' ? detail : null;
      const raw = (box && textOf(box.upstreamMessage)) || (box && textOf(box.bodySnippet)) || textOf(message) || '请求失败';
      const clipped = raw.length > AGENT_DETAIL_MAX ? raw.slice(0, AGENT_DETAIL_MAX) + '…' : raw;
      return (code ? code + ' · ' : '') + clipped;
    }

    function agentErrorResult(code, extra) {
      const result = Object.assign(
        {
          ok: false,
          code: code,
          message: AGENT_CODE_MESSAGE[code] || '请求失败'
        },
        extra || {}
      );
      /* 一行原始信息随错误一起往下走，渲染侧直接用，不必再拼一次 */
      result.detailText = agentDetailTextOf(result.code, result.message, result.detail);
      return result;
    }

    /* 单次请求：不重试、不分类重试策略，只把这一发的结果标准化 */
    function agentAttempt(cfg, task, projectName, dropFormat, system, mode, options) {
      const opts = isPlainObject(options) ? options : {};
      const strength = ACT_NOW_STRENGTH_KEYS.indexOf(opts.strength) >= 0 ? opts.strength : 'mid';
      /* 拆解通道的 system 由强度决定（agentBreakdownSystemPrompt），其余通道仍用调用方给的或 AGENT_SYSTEM_PROMPT */
      const systemText =
        typeof system === 'string' && system
          ? system
          : mode === 'breakdown'
            ? agentBreakdownSystemPrompt(strength)
            : AGENT_SYSTEM_PROMPT;
      const doFetch = agentFetchImpl();
      if (!doFetch) return Promise.resolve(agentErrorResult('AGENT_NETWORK'));
      if (!agentBaseAllowed(cfg.apiBase)) return Promise.resolve(agentErrorResult('AGENT_BASE'));

      const payload = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          /* §10.5-③ 密钥只进这一行，不进日志、不进 URL */
          Authorization: 'Bearer ' + cfg.apiKey
        },
        /* 强档要 11–18 步，800 token 会被截断在半路，所以拆解通道单独给 1400 */
        body: JSON.stringify(agentBodyOf(cfg, task, projectName, dropFormat, systemText, mode === 'breakdown' ? { maxTokens: 1400 } : null))
      };

      let timer = null;
      let controller = null;
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        payload.signal = controller.signal;
        timer = window.setTimeout(function () {
          try {
            controller.abort();
          } catch (err) {
            /* 已结束 */
          }
        }, cfg.timeoutMs);
      }

      const clear = function () {
        if (timer) window.clearTimeout(timer);
        timer = null;
      };

      return Promise.resolve()
        .then(function () {
          return doFetch(agentEndpointOf(cfg.apiBase), payload);
        })
        .then(function (response) {
          const status = Number(response && response.status) || 0;
          const ok = response && (response.ok === true || (status >= 200 && status < 300));
          if (!ok) {
            const textOf = typeof response.text === 'function' ? response.text() : Promise.resolve('');
            return Promise.resolve(textOf).then(function (text) {
              clear();
              return agentErrorResult(agentCodeOfStatus(status, text), { status: status });
            });
          }
          return Promise.resolve(typeof response.json === 'function' ? response.json() : null).then(function (json) {
            clear();
            const content =
              json && json.choices && json.choices[0] && json.choices[0].message
                ? json.choices[0].message.content
                : '';
            const parsed = agentParseJson(content);
            if (!parsed.ok) return agentErrorResult('AGENT_BAD_JSON');
            /* 打分通道输出 {score, reason}，整理通道输出 {title, steps}：
               同一条解析链、两种归一化，避免两套容错各写一份。 */
            if (mode === 'score') {
              const scored = agentNormalizeScore(parsed.data);
              if (!scored.ok) return agentErrorResult('AGENT_BAD_JSON');
              return { ok: true, data: scored };
            }
            /* t169：拆解通道用独立的归一（保 minutes、按强度限步），见 agentBreakdownNormalize 上方注释 */
            if (mode === 'breakdown') {
              return { ok: true, data: agentBreakdownNormalize(parsed.data, strength) };
            }
            return { ok: true, data: agentNormalizeResult(parsed.data) };
          });
        })
        .catch(function (err) {
          clear();
          const name = err && err.name ? String(err.name) : '';
          if (name === 'AbortError') return agentErrorResult('AGENT_TIMEOUT');
          if (name === 'TypeError' || err instanceof TypeError) return agentErrorResult('AGENT_NETWORK');
          return agentErrorResult('AGENT_NETWORK');
        });
    }

    /* 连通性测试（t104）：最小代价的一发请求，只判「通/不通」，不解析业务 JSON。
       与 agentAttempt 的区别：不带 response_format（测试不该因模型不支持 JSON 模式而失败）、
       max_tokens 只给 1、不重试（用户点一次就只要一个结论），并回传 latency 供 UI 显示。
       密钥只进 Authorization 一行，不进 URL、不进日志、不进返回值。 */
    function pingAgent(cfg) {
      /* t123：dsh 档测同源 /ping；off 档没有可测的端点 */
      if (cfg && cfg.source === 'dsh') return pingAgentDsh(cfg);
      if (cfg && cfg.source === 'off') return Promise.resolve(agentErrorResult('AGENT_CONFIG', { latency: 0 }));
      const doFetch = agentFetchImpl();
      if (!doFetch) return Promise.resolve(agentErrorResult('AGENT_NETWORK', { latency: 0 }));
      if (!agentBaseAllowed(cfg.apiBase)) return Promise.resolve(agentErrorResult('AGENT_BASE', { latency: 0 }));
      if (!cfg.apiKey) return Promise.resolve(agentErrorResult('AGENT_CONFIG', { latency: 0 }));

      const startedAt = Date.now();
      const requestUrl = agentEndpointOf(cfg.apiBase);
      const payload = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + cfg.apiKey
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        })
      };

      let timer = null;
      let controller = null;
      if (typeof AbortController === 'function') {
        controller = new AbortController();
        payload.signal = controller.signal;
        timer = window.setTimeout(function () {
          try {
            controller.abort();
          } catch (err) {
            /* 已结束 */
          }
        }, cfg.timeoutMs);
      }
      const clear = function () {
        if (timer) window.clearTimeout(timer);
        timer = null;
      };
      const withLatency = function (result) {
        return Object.assign({ latency: Date.now() - startedAt }, result);
      };

      return Promise.resolve()
        .then(function () {
          return doFetch(requestUrl, payload);
        })
        .then(function (response) {
          const status = Number(response && response.status) || 0;
          const ok = response && (response.ok === true || (status >= 200 && status < 300));
          if (!ok) {
            const textOf = typeof response.text === 'function' ? response.text() : Promise.resolve('');
            return Promise.resolve(textOf).then(function (text) {
              clear();
              return withLatency(agentErrorResult(agentCodeOfStatus(status, text), {
                status: status,
                url: requestUrl,
                detail: agentDiagnose(cfg, requestUrl, status, text, '')
              }));
            });
          }
          /* 200 就算「通」——连通性测试只判可达性，不解析业务 JSON（t104 口径）。
             t111 补一条诊断：能读到响应体但不是 JSON 时仍报 ok，但附注提示该端点
             可能不是 OpenAI 兼容接口。响应体只用于判定，不落库、不进 localStorage。 */
          const bodyOf = typeof response.text === 'function' ? response.text() : Promise.resolve('');
          return Promise.resolve(bodyOf).then(function (text) {
            clear();
            let note = '';
            const raw = typeof text === 'string' ? text.trim() : '';
            if (raw) {
              try {
                JSON.parse(raw);
              } catch (err) {
                note = '响应非 JSON，可能不是 OpenAI 兼容端点';
              }
            }
            return withLatency({
              ok: true,
              code: '',
              message: '连接正常',
              status: status,
              model: cfg.model,
              url: requestUrl,
              note: note
            });
          });
        })
        .catch(function (err) {
          clear();
          const name = err && err.name ? String(err.name) : '';
          if (name === 'AbortError') return withLatency(agentErrorResult('AGENT_TIMEOUT', { url: requestUrl }));
          /* t118：TypeError 在浏览器里等价于「fetch 被网络层/CORS 拦掉」，必须给可诊断的详情 */
          return withLatency(agentErrorResult('AGENT_NETWORK', {
            url: requestUrl,
            detail: agentDiagnose(cfg, requestUrl, 0, '', name || 'TypeError')
          }));
        });
    }

    /* 重试与降级：429 / 5xx / 超时按 maxRetries 退避重试；
       400 且提示 response_format 时去掉该字段重发一次（不占重试预算、成功即静默）。 */
    function agentRun(cfg, task, projectName, opts) {
      const options = isPlainObject(opts) ? opts : {};
      /* t123：off 档不发请求（调用方拿 AGENT_CONFIG 走本地规则降级）；dsh 档走同源 Host */
      if (cfg && cfg.source === 'off') return Promise.resolve(agentErrorResult('AGENT_CONFIG', { attempts: 0, retries: 0 }));
      if (cfg && cfg.source === 'dsh') return agentDshRun(cfg, task, projectName, options);
      let attempts = 0;
      let retries = 0;
      let dropFormat = false;
      let lastCode = '';

      const next = function () {
        attempts = attempts + 1;
        return agentAttempt(cfg, task, projectName, dropFormat, options.system, options.mode).then(function (res) {
          if (res.ok) {
            return Object.assign({}, res, { attempts: attempts, retries: retries, droppedFormat: dropFormat });
          }
          lastCode = res.code;
          if (res.code === 'AGENT_FORMAT' && !dropFormat) {
            dropFormat = true;
            return next();
          }
          if (AGENT_RETRYABLE[res.code] && retries < cfg.maxRetries) {
            retries = retries + 1;
            const delay = AGENT_RETRY_DELAYS[Math.min(retries - 1, AGENT_RETRY_DELAYS.length - 1)];
            const retryMessage =
              res.code === 'AGENT_RATE'
                ? '请求过于频繁，正在重试（' + retries + '/' + cfg.maxRetries + '）'
                : res.message;
            return new Promise(function (resolve) {
              window.setTimeout(resolve, delay);
            }).then(function () {
              void retryMessage;
              return next();
            });
          }
          const exhausted = AGENT_RETRYABLE[res.code] && retries >= cfg.maxRetries;
          const code = res.code;
          return Object.assign({}, res, {
            message: exhausted && code === 'AGENT_RATE' ? '请求过于频繁，稍后再试' : res.message,
            attempts: attempts,
            retries: retries,
            exhausted: !!exhausted
          });
        });
      };

      return next().then(function (res) {
        if (res.ok) return res;
        void lastCode;
        return res;
      });
    }

    /* ---------------------------------- 本地规则兜底 ---------------------------------
       §9.2：未配置密钥是「可用降级路径」，不是灰掉。本地规则不联网、不猜内容：
       · 润色 = 去首尾空白、合并连续空格、去掉口语尾巴与重复标点、限长；
       · 拆解 = 先拿 detailNote 里的换行/分号/序号列表；没有就按「准备—执行—收尾」三段
         从标题本身派生，步骤里带上标题原词，保证「每条都对得上任务」。 */
    const AGENT_LOCAL_TAILS = ['了吧', '了', '吧', '啊', '呢', '哦', '呀'];

    function agentLocalPolish(title) {
      let text = String(title || '').replace(/\s+/g, ' ').trim();
      text = text.replace(/[。；;]+$/g, '');
      text = text.replace(/^(我要|我想|我准备|记得|需要|得)/, '');
      AGENT_LOCAL_TAILS.forEach(function (tail) {
        if (text.length > tail.length + 2 && text.slice(-tail.length) === tail) {
          text = text.slice(0, -tail.length);
        }
      });
      text = text.trim();
      return text.slice(0, 60);
    }

    function agentLocalSplit(task) {
      const source = String((task && task.detailNote) || '');
      const lines = source
        .split(/\r?\n|[；;]/)
        .map(function (line) {
          return line.replace(/^\s*(?:[-*·]|\d+[.、)])\s*/, '').trim();
        })
        .filter(function (line) {
          return line.length >= 2;
        });
      const title = agentLocalPolish(task && task.title) || '任务';
      if (lines.length) return lines.slice(0, 7).map(function (line) { return line.slice(0, 40); });
      return [
        '明确「' + title.slice(0, 20) + '」的完成标准（做到什么算完成）',
        '准备所需资料与工具，列出缺什么',
        '先做最小一步：' + title.slice(0, 20),
        '检查结果并勾掉任务'
      ].slice(0, 4);
    }
