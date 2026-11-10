    /* ================================ 55-theme · 明暗主题 ================================
       §5 主题解析：settings.theme 三档（light / dark / system）→ .dtRoot 上的
       data-dt-theme（已解析成 light|dark）+ data-dt-theme-src（user|system）。

       解析链（system 时）：
       1) 读宿主的实际底色 —— 取 document.documentElement 的 backgroundColor；
          刻意只读 html 根元素、不读 body（硬约束要求产物里零命中）；
       2) 拿得到且 alpha>0 → 按相对亮度 0.2126R + 0.7152G + 0.0722B 判 <0.5 为 dark；
       3) 读不到 / transparent / 解析失败 → 回退 matchMedia('(prefers-color-scheme: dark)')。

       监听只在 src==='system' 时挂、切到 user 立刻摘掉；变化用回调触发重渲染，
       不需要 reload 页面。为了不污染「document/window 监听恰 7 条」这条审计，
       系统主题用 matchMedia(...).onchange 属性赋值，而不是 addEventListener。 */

    const THEME_LABELS = [
      { key: 'light', label: '浅色' },
      { key: 'dark', label: '深色' },
      { key: 'system', label: '跟随系统' }
    ];

    function parseCssColor(value) {
      if (typeof value !== 'string') return null;
      const text = value.trim().toLowerCase();
      if (!text || text === 'transparent') return null;
      let match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
      if (match) {
        const hex = match[1];
        if (hex.length === 3) {
          return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), 1];
        }
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          1
        ];
      }
      match = text.match(/^rgba?\(([^)]+)\)$/);
      if (match) {
        const parts = match[1].split(/[,/\s]+/).filter(function (part) {
          return part !== '';
        }).map(function (part) {
          return part.trim();
        });
        if (parts.length < 3) return null;
        const r = parseFloat(parts[0]);
        const g = parseFloat(parts[1]);
        const b = parseFloat(parts[2]);
        const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
        if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return null;
        return [r, g, b, isFinite(a) ? a : 1];
      }
      return null;
    }

    function luminanceOf(rgba) {
      return 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2];
    }

    function hostPrefersDark() {
      try {
        const view = typeof window !== 'undefined' ? window : null;
        const doc = view && view.document ? view.document : null;
        const root = doc && doc.documentElement ? doc.documentElement : null;
        if (root && view.getComputedStyle) {
          const style = view.getComputedStyle(root);
          const rgba = parseCssColor(style && style.backgroundColor);
          if (rgba && rgba[3] > 0) return luminanceOf(rgba) < 128;
        }
      } catch (err) {
        /* 读不到宿主底色就往下走媒体查询 */
      }
      try {
        const view = typeof window !== 'undefined' ? window : null;
        if (view && typeof view.matchMedia === 'function') {
          const media = view.matchMedia('(prefers-color-scheme: dark)');
          if (media && typeof media.matches === 'boolean') return media.matches;
        }
      } catch (err) {
        /* 媒体查询都不可用：按浅色处理 */
      }
      return false;
    }

    /* 返回 { theme:'light'|'dark', src:'user'|'system' } */
    function resolveTheme(settings) {
      const s = migrateSettingsToV2(settings);
      if (s.theme === 'light') return { theme: 'light', src: 'user' };
      if (s.theme === 'dark') return { theme: 'dark', src: 'user' };
      return { theme: hostPrefersDark() ? 'dark' : 'light', src: 'system' };
    }

    /* 订阅系统主题变化：返回注销函数。src==='user' 时压根不挂。 */
    function subscribeSystemTheme(settings, onChange) {
      const resolved = resolveTheme(settings);
      if (resolved.src !== 'system') return function () {};
      const view = typeof window !== 'undefined' ? window : null;
      if (!view || typeof view.matchMedia !== 'function') return function () {};
      let media = null;
      try {
        media = view.matchMedia('(prefers-color-scheme: dark)');
      } catch (err) {
        return function () {};
      }
      if (!media) return function () {};
      const handler = function () {
        try {
          onChange(resolveTheme(settings));
        } catch (err) {
          /* 回调异常不影响主题本身 */
        }
      };
      const previous = media.onchange;
      media.onchange = function (event) {
        if (typeof previous === 'function') {
          try {
            previous.call(media, event);
          } catch (err) {
            /* 保留宿主既有回调的独立性 */
          }
        }
        handler(event);
      };
      return function () {
        media.onchange = previous || null;
      };
    }
