/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { Sheet, Spinner } from './ui/Primitives';
import { useAppStore } from '../state/AppStore';
import { canConfigureServer, getServerBase, isHarmonyShell, isNativePlatform, isPackagedApp, normalizeServerBase, setServerBase } from '../lib/serverConfig';
import { DESKTOP_APP } from '../lib/env';

interface ServerSheetProps {
  open: boolean;
  onClose: () => void;
}

type Probe = { state: 'idle' | 'checking' | 'ok' | 'error'; message?: string };

export function ServerSheet({ open, onClose }: ServerSheetProps) {
  const { notify } = useAppStore();
  const [draft, setDraft] = useState(getServerBase());
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });
  const [desktopInfo, setDesktopInfo] = useState<{ version: string; platform: string; arch: string } | null>(null);
  const native = isNativePlatform();
  const harmony = isHarmonyShell();
  const configurable = canConfigureServer();

  useEffect(() => {
    if (open) {
      setDraft(getServerBase());
      setProbe({ state: 'idle' });
      if (DESKTOP_APP) {
        void window.StayTunedDesktop?.info().then((info) => {
          setDesktopInfo({ version: info.version, platform: info.platform, arch: info.arch });
        }).catch(() => setDesktopInfo(null));
      }
    }
  }, [open]);

  const check = async (base: string) => {
    setProbe({ state: 'checking' });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const url = base ? base + '/api/health' : new URL('/api/health', window.location.origin).toString();
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = (await response.json()) as { version?: string; uptime?: number };
      setProbe({
        state: 'ok',
        message: '已连接 · v' + (data.version ?? '?') + ' · 运行 ' + Math.round(data.uptime ?? 0) + ' 秒',
      });
      return true;
    } catch {
      setProbe({ state: 'error', message: '连不上这个地址，请检查服务是否启动、手机与服务器是否在同一网络。' });
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!configurable) return;
    const normalized = normalizeServerBase(draft);
    if (draft.trim() && !normalized) {
      setProbe({ state: 'error', message: '地址格式不正确，例如 http://192.168.1.10:8787' });
      return;
    }
    const ok = await check(normalized);
    setServerBase(normalized);
    if (ok) {
      notify('服务地址已保存。', 'success');
      onClose();
    } else {
      notify('地址已保存，但暂时连不上。', 'error');
    }
  };

  const localEngine = isPackagedApp() && !getServerBase();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="ENGINE"
      title={DESKTOP_APP ? '桌面解析引擎' : localEngine ? '解析引擎' : '数据来源'}
      className="server-sheet"
      footer={
        <div className="library-footer">
          <span>{DESKTOP_APP ? '内置服务仅监听 127.0.0.1' : '服务地址只保存在本机'}</span>
          <span className="mono">/api</span>
        </div>
      }
    >
      {DESKTOP_APP ? (
        <div className="engine-card">
          <span className="engine-card-title">
            <Icon name="check" size={14} /> 内置 Node 服务（已启动）
          </span>
          <p>
            RSS、搜索、M3U / HLS、章节与文字稿都由应用内嵌的服务解析，数据只保存在这台电脑。
            {desktopInfo ? ' 当前版本 v' + desktopInfo.version + ' · ' + desktopInfo.platform + '/' + desktopInfo.arch + '。' : ''}
          </p>
          <p>为了保持固定同源地址与本地数据连续，桌面版不提供远程服务地址切换。</p>
        </div>
      ) : null}

      {localEngine ? (
        <div className="engine-card">
          <span className="engine-card-title">
            <Icon name="check" size={14} /> 本地解析引擎（已内置）
          </span>
          <p>RSS、搜索、M3U / HLS、章节与文字稿都在手机本地解析，不需要电脑上的服务端。</p>
        </div>
      ) : null}

      {configurable ? (
        <form className="server-form" onSubmit={submit}>
          <label className="field-label" htmlFor="server-base">
            {localEngine ? '可选：改用远程代理地址' : '服务地址'}
          </label>
          <div className="field-row">
            <input
              id="server-base"
              type="text"
              inputMode="url"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="http://192.168.1.10:8787"
              autoFocus
            />
            <button type="submit" className="solid-button" disabled={probe.state === 'checking'}>
              {probe.state === 'checking' ? <Spinner label="连接中" /> : <Icon name="refresh" size={15} />}
              {probe.state === 'checking' ? '连接中' : '连接'}
            </button>
          </div>
          <p className="field-hint">
            留空时使用{localEngine ? '本机内置引擎' : '同源服务'}。填写运行 <code>npm start</code> 的机器地址可以把解析交给远端，
            例如 <code>http://192.168.1.10:8787</code>。
          </p>
          {probe.state === 'ok' ? <p className="server-probe is-ok">{probe.message}</p> : null}
          {probe.state === 'error' ? <p className="form-error" role="alert">{probe.message}</p> : null}
          <div className="server-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDraft('');
                setProbe({ state: 'idle' });
              }}
            >
              清空（使用默认引擎）
            </button>
            {native ? <span className="server-badge">Android 应用</span> : null}
            {harmony ? <span className="server-badge">鸿蒙应用</span> : null}
          </div>
        </form>
      ) : null}

      <section className="server-help">
        <h3>{localEngine || DESKTOP_APP ? '内置引擎覆盖' : '服务端提供'}</h3>
        <ul>
          <li>RSS / Atom 订阅与刷新</li>
          <li>播客目录搜索（Apple Podcasts）</li>
          <li>电台目录搜索（Radio Browser）</li>
          <li>M3U 播放列表与 HLS 串流</li>
          <li>Podcasting 2.0 章节与文字稿</li>
        </ul>
        <p>
          {DESKTOP_APP
            ? '桌面应用通过本机回环地址代理封面与音频，可保留真实频谱。'
            : localEngine
              ? '音频、封面直接由手机加载，不再经过代理。'
              : '浏览器受跨域限制，需要服务端代理才能读取多数订阅源。'}
        </p>
      </section>
    </Sheet>
  );
}
