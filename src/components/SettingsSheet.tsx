/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Sheet, Switch } from './ui/Primitives';
import { useAppStore } from '../state/AppStore';
import { formatCacheSize, getCacheStats } from '../lib/cache';
import { canConfigureServer, getServerBase, isNativePlatform } from '../lib/serverConfig';
import { DESKTOP_APP, STATIC_DEMO } from '../lib/env';
import type { Mode, Theme } from '../types';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onOpenCache: () => void;
  onOpenData: () => void;
  onOpenServer: () => void;
}

function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="settings-segment" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-active' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  title,
  hint,
  control,
  onClick,
  chevron = false,
}: {
  title: string;
  hint?: ReactNode;
  control?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const body = (
    <>
      <span className="settings-row-copy">
        <span className="settings-row-title">{title}</span>
        {hint ? <span className="settings-row-hint">{hint}</span> : null}
      </span>
      {control}
      {chevron ? <Icon name="chevronRight" size={15} className="settings-row-chevron" /> : null}
    </>
  );
  if (!onClick) return <div className="settings-row">{body}</div>;
  return (
    <button type="button" className="settings-row settings-row--action" onClick={onClick}>
      {body}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h3>{title}</h3>
      <div className="settings-group-body">{children}</div>
    </section>
  );
}

export function SettingsSheet({
  open,
  onClose,
  onOpenCache,
  onOpenData,
  onOpenServer,
}: SettingsSheetProps) {
  const {
    prefs,
    setTheme,
    setMode,
    setHaptics,
    hapticsAvailable,
    setFollowTranscript,
    cacheIndex,
    setAutoCacheNewEpisodes,
    setAutoCachePlaying,
  } = useAppStore();
  const [desktop, setDesktop] = useState<{ platform: string; arch: string } | null>(null);

  useEffect(() => {
    if (!open || !DESKTOP_APP) return;
    void window.StayTunedDesktop?.info()
      .then((info) => setDesktop({ platform: info.platform, arch: info.arch }))
      .catch(() => setDesktop(null));
  }, [open]);

  const stats = useMemo(() => getCacheStats(cacheIndex), [cacheIndex]);
  const engineLabel = (() => {
    const base = getServerBase();
    if (base) return base.replace(/^https?:\/\//, '');
    if (DESKTOP_APP) return '内置服务 · 127.0.0.1';
    if (isNativePlatform()) return '本地解析引擎';
    return '同源服务';
  })();
  const platformLabel = DESKTOP_APP
    ? desktop
      ? '桌面版 · ' + desktop.platform + '/' + desktop.arch
      : '桌面版'
    : isNativePlatform()
      ? 'Android'
      : STATIC_DEMO
        ? '静态演示'
        : '浏览器';

  const cacheSummary = stats.count
    ? stats.count + ' 期 · ' + formatCacheSize(stats.bytes) +
      (stats.downloading ? ' · 下载中 ' + stats.downloading : '')
    : '还没有缓存音频。';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="SETTINGS"
      title="设置"
      className="settings-sheet"
      footer={
        <div className="library-footer">
          <span>留频 · Stay Tuned</span>
          <span className="mono">v{__APP_VERSION__}</span>
        </div>
      }
    >
      <Group title="外观">
        <Row
          title="质感"
          hint="拟物保留实体材质，扁平使用纯色与线条。"
          control={
            <Segment<Mode>
              label="界面质感"
              value={prefs.mode}
              onChange={setMode}
              options={[
                { value: 'skeuo', label: '拟物' },
                { value: 'flat', label: '扁平' },
              ]}
            />
          }
        />
        <Row
          title="主题"
          hint="亮色为暖白，暗色为暖炭灰。"
          control={
            <Segment<Theme>
              label="配色主题"
              value={prefs.theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: '亮色' },
                { value: 'dark', label: '暗色' },
              ]}
            />
          }
        />
        {hapticsAvailable ? (
          <Row
            title="触感反馈"
            hint="推杆刻度、按键与提示使用线性马达；跟随系统触感开关。"
            control={
              <Switch checked={prefs.haptics} onChange={setHaptics} label="触感反馈" hideLabel />
            }
          />
        ) : null}
      </Group>

      <Group title="播放">
        <Row
          title="跟随播放"
          hint="文字稿随声音自动滚动到当前句。"
          control={
            <Switch
              checked={prefs.followTranscript}
              onChange={setFollowTranscript}
              label="跟随播放"
              hideLabel
            />
          }
        />
      </Group>

      <Group title="离线缓存">
        {STATIC_DEMO ? (
          <p className="settings-note">静态演示版不提供音频缓存；在本机运行或安装客户端后可用。</p>
        ) : (
          <>
            <Row
              title="已用空间"
              hint={cacheSummary}
              control={<span className="settings-row-value">管理</span>}
              chevron
              onClick={onOpenCache}
            />
            <Row
              title="发现新播客自动下载"
              hint="订阅或刷新后，缓存每档节目最新 3 期。"
              control={
                <Switch
                  checked={prefs.autoCacheNewEpisodes}
                  onChange={setAutoCacheNewEpisodes}
                  label="发现新播客自动下载"
                  hideLabel
                />
              }
            />
            <Row
              title="在听的播客自动缓存"
              hint="开始收听某期节目时自动存到本机。"
              control={
                <Switch
                  checked={prefs.autoCachePlaying}
                  onChange={setAutoCachePlaying}
                  label="在听的播客自动缓存"
                  hideLabel
                />
              }
            />
          </>
        )}
      </Group>

      <Group title="数据">
        <Row
          title="订阅备份"
          hint="导出或导入订阅、收藏与播放进度。"
          control={<span className="settings-row-value">JSON</span>}
          chevron
          onClick={onOpenData}
        />
        <Row
          title="解析引擎"
          hint={canConfigureServer() ? '切换远端代理或使用本机服务。' : '桌面版固定使用内置服务。'}
          control={<span className="settings-row-value is-mono">{engineLabel}</span>}
          chevron
          onClick={onOpenServer}
        />
      </Group>

      <Group title="关于">
        <Row title="版本" control={<span className="settings-row-value is-mono">v{__APP_VERSION__}</span>} />
        <Row title="运行环境" control={<span className="settings-row-value">{platformLabel}</span>} />
        <Row
          title="开源许可"
          hint="GPL-3.0-only"
          control={<Icon name="external" size={14} className="settings-row-chevron" />}
          onClick={() => window.open('https://github.com/xzl01/stay-tuned', '_blank', 'noopener')}
        />
      </Group>
    </Sheet>
  );
}
