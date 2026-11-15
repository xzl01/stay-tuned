/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { Sheet, Spinner } from './ui/Primitives';
import { useAppStore } from '../state/AppStore';
import { getServerBase, isNativePlatform, normalizeServerBase, setServerBase } from '../lib/serverConfig';

interface ServerSheetProps {
  open: boolean;
  onClose: () => void;
}

type Probe = { state: 'idle' | 'checking' | 'ok' | 'error'; message?: string };

export function ServerSheet({ open, onClose }: ServerSheetProps) {
  const { notify } = useAppStore();
  const [draft, setDraft] = useState(getServerBase());
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });
  const native = isNativePlatform();

  useEffect(() => {
    if (open) {
      setDraft(getServerBase());
      setProbe({ state: 'idle' });
    }
  }, [open]);

  const check = async (base: string) => {
    setProbe({ state: 'checking' });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const url = base ? `${base}/api/health` : new URL('/api/health', window.location.origin).toString();
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { version?: string; uptime?: number };
      setProbe({
        state: 'ok',
        message: `已连接 · v${data.version ?? '?'} · 运行 ${Math.round(data.uptime ?? 0)} 秒`,
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="CONNECTION"
      title="连接服务端"
      className="server-sheet"
      footer={
        <div className="library-footer">
          <span>服务地址只保存在本机</span>
          <span className="mono">/api</span>
        </div>
      }
    >
      <form className="server-form" onSubmit={submit}>
        <label className="field-label" htmlFor="server-base">
          服务地址
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
          在运行 Node 服务的电脑上执行 <code>npm start</code>，然后填入它的地址。手机与电脑需要在同一局域网；
          远程使用请填公网 HTTPS 地址。
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
            清空（使用同源）
          </button>
          {native ? <span className="server-badge">Android 应用</span> : null}
        </div>
      </form>

      <section className="server-help">
        <h3>完整功能需要服务端</h3>
        <ul>
          <li>RSS 订阅、播客与电台搜索</li>
          <li>M3U / HLS 播放列表解析</li>
          <li>跨域音频与封面代理</li>
          <li>Podcasting 2.0 章节与文字稿读取</li>
        </ul>
        <p>内置示例节目与本地音频无需服务端即可播放。</p>
      </section>
    </Sheet>
  );
}
