    /* ================================ 56-sound · 提示音 ================================
       §6 音效：两个内置预设（remind / stuck）+ 一个用户导入的自定义音频，全部走 WebAudio 合成
       或本地解码，**不加载任何外部音频文件**（无网络请求、无 <audio> 元素、无 blob URL）。

       · getCtx() 惰性单例，只能在用户手势里创建；失败返回 null 并把 AUDIO_UNAVAILABLE 记下来，
         由界面渲染 aria-live 文案「当前环境无法播放音效」。
       · playPreset 200ms 去抖：连点试听不会叠成噪音。
       · enabled=false 时**连 AudioContext 都不创建**（不是创建了不播）。
       · 音量入参是 0..1 的系数，乘到每个预设的峰值上（remind 0.18 / stuck 0.22）。 */

    const SOUND_PRESETS = [
      { id: 'remind', label: '提醒音（两短声）' },
      { id: 'stuck', label: '卡住提示（三连低音）' },
      { id: 'custom', label: '自定义音频' }
    ];
    const SOUND_PEAK = { remind: 0.18, stuck: 0.22 };
    const SOUND_DEBOUNCE_MS = 200;
    const SOUND_MAX_BYTES = 512 * 1024;
    const SOUND_ACCEPT = '.mp3,.wav,.ogg,.m4a,audio/*';
    const SOUND_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];

    let soundCtx = null;
    let soundCtxFailed = false;
    let soundLastAt = 0;

    function soundEnabled(settings) {
      const sound = migrateSettingsToV2(settings).sound;
      return !!(sound && sound.enabled);
    }

    function getCtx() {
      if (soundCtx) return soundCtx;
      if (soundCtxFailed) return null;
      const view = typeof window !== 'undefined' ? window : null;
      const Ctor = view && (view.AudioContext || view.webkitAudioContext);
      if (!Ctor) {
        soundCtxFailed = true;
        return null;
      }
      try {
        soundCtx = new Ctor();
      } catch (err) {
        soundCtxFailed = true;
        soundCtx = null;
      }
      return soundCtx;
    }

    function soundUnavailable() {
      return soundCtxFailed || !getCtx();
    }

    function scheduleTone(ctx, at, freq, durationMs, peak) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      const end = at + durationMs / 1000;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(end + 0.02);
    }

    function scheduleTriangle(ctx, at, freq, durationMs, peak) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, at);
      const end = at + durationMs / 1000;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(end + 0.02);
    }

    /* 自定义音频：dataURL → ArrayBuffer → decodeAudioData。解析失败按 AUDIO_UNAVAILABLE 处理。 */
    function dataUrlToArrayBuffer(dataUrl) {
      if (typeof dataUrl !== 'string' || dataUrl.indexOf(',') < 0) return null;
      const body = dataUrl.slice(dataUrl.indexOf(',') + 1);
      try {
        if (typeof atob !== 'function') return null;
        const binary = atob(body);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      } catch (err) {
        return null;
      }
    }

    function playCustom(ctx, dataUrl, volume) {
      const buffer = dataUrlToArrayBuffer(dataUrl);
      if (!buffer || typeof ctx.decodeAudioData !== 'function') return null;
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, volume || 0));
      gain.connect(ctx.destination);
      return new Promise(function (resolve) {
        let settled = false;
        const finish = function (ok) {
          if (settled) return;
          settled = true;
          resolve(ok);
        };
        try {
          const result = ctx.decodeAudioData(buffer, function (decoded) {
            try {
              const source = ctx.createBufferSource();
              source.buffer = decoded;
              source.connect(gain);
              source.start(0);
              finish(true);
            } catch (err) {
              finish(false);
            }
          }, function () {
            finish(false);
          });
          if (result && typeof result.then === 'function') {
            result.then(function (decoded) {
              try {
                const source = ctx.createBufferSource();
                source.buffer = decoded;
                source.connect(gain);
                source.start(0);
                finish(true);
              } catch (err) {
                finish(false);
              }
            }, function () {
              finish(false);
            });
          }
        } catch (err) {
          finish(false);
        }
      });
    }

    /* playPreset(settings, opts) → Promise<{ ok, code? }>
       opts.preset 覆盖设置里的预设（试听某个未保存的选项时用）。 */
    function playPreset(settings, opts) {
      const options = isPlainObject(opts) ? opts : {};
      const sound = migrateSettingsToV2(settings).sound;
      if (!sound.enabled) return Promise.resolve({ ok: false, code: 'DISABLED' });
      const now = Date.now();
      if (now - soundLastAt < SOUND_DEBOUNCE_MS) return Promise.resolve({ ok: false, code: 'DEBOUNCED' });
      soundLastAt = now;
      const preset = options.preset || sound.preset || 'remind';
      const volume = typeof options.volume === 'number' ? options.volume : sound.volume;
      const ctx = getCtx();
      if (!ctx) return Promise.resolve({ ok: false, code: 'AUDIO_UNAVAILABLE' });
      try {
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
        const at = ctx.currentTime + 0.01;
        if (preset === 'stuck') {
          const peak = SOUND_PEAK.stuck * Math.max(0, Math.min(1, volume));
          scheduleTriangle(ctx, at, 220, 140, peak);
          scheduleTriangle(ctx, at + 0.2, 224, 140, peak);
          scheduleTriangle(ctx, at + 0.4, 220, 140, peak);
          return Promise.resolve({ ok: true });
        }
        if (preset === 'custom') {
          if (!sound.customData) return Promise.resolve({ ok: false, code: 'AUDIO_UNAVAILABLE' });
          return playCustom(ctx, sound.customData, volume).then(function (ok) {
            return ok ? { ok: true } : { ok: false, code: 'AUDIO_UNAVAILABLE' };
          });
        }
        const peak = SOUND_PEAK.remind * Math.max(0, Math.min(1, volume));
        scheduleTone(ctx, at, 880, 120, peak);
        scheduleTone(ctx, at + 0.2, 880, 120, peak);
        return Promise.resolve({ ok: true });
      } catch (err) {
        soundCtxFailed = true;
        return Promise.resolve({ ok: false, code: 'AUDIO_UNAVAILABLE' });
      }
    }

    /* ---------------------------------- 导入自定义音频 ---------------------------------- */
    /* 三道闸：类型白名单 → 512KB 硬上限 → 读成 dataURL。任何一道不过都返回 { ok:false, message }，
       调用方负责 toast；成功则返回可直接写进 settings.sound.customData 的字符串。 */
    function ensureSoundFile(file) {
      if (!file) return { ok: false, message: '没有选择文件' };
      const name = typeof file.name === 'string' ? file.name : '';
      const lower = name.toLowerCase();
      const extOk = /\.(mp3|wav|ogg|m4a)$/.test(lower);
      const mimeOk = typeof file.type === 'string' && SOUND_MIME.indexOf(file.type.toLowerCase()) >= 0;
      if (!extOk && !mimeOk) return { ok: false, message: '只支持 mp3 / wav / ogg / m4a' };
      const size = typeof file.size === 'number' ? file.size : 0;
      if (size > SOUND_MAX_BYTES) return { ok: false, message: '音频文件请小于 512KB' };
      return { ok: true, name: name };
    }

    function readSoundFile(file, onDone) {
      const gate = ensureSoundFile(file);
      if (!gate.ok) {
        onDone({ ok: false, message: gate.message });
        return;
      }
      const view = typeof window !== 'undefined' ? window : null;
      const Reader = view && view.FileReader;
      if (!Reader) {
        onDone({ ok: false, message: '读取失败，请重试' });
        return;
      }
      let reader = null;
      try {
        reader = new Reader();
      } catch (err) {
        onDone({ ok: false, message: '读取失败，请重试' });
        return;
      }
      reader.onload = function () {
        const data = typeof reader.result === 'string' ? reader.result : '';
        if (!data) {
          onDone({ ok: false, message: '读取失败，请重试' });
          return;
        }
        onDone({ ok: true, name: gate.name, data: data });
      };
      reader.onerror = function () {
        onDone({ ok: false, message: '读取失败，请重试' });
      };
      try {
        reader.readAsDataURL(file);
      } catch (err) {
        onDone({ ok: false, message: '读取失败，请重试' });
      }
    }
