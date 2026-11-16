/* SPDX-License-Identifier: GPL-3.0-only */

import { useMemo } from 'react';
import { Icon } from './Icon';
import { Sheet, Switch } from './ui/Primitives';
import { useAppStore } from '../state/AppStore';
import { formatCacheSize, getCacheStats } from '../lib/cache';
import { STATIC_DEMO } from '../lib/env';

interface CacheSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CacheSheet({ open, onClose }: CacheSheetProps) {
  const {
    prefs, cacheIndex, uncacheEpisode, clearEpisodeCache,
    setAutoCacheNewEpisodes, setAutoCachePlaying,
  } = useAppStore();
  // clearEpisodeCache / uncacheEpisode already emit their own toast.

  const records = useMemo(
    () => Object.values(cacheIndex).sort((a, b) => b.createdAt - a.createdAt),
    [cacheIndex],
  );
  const stats = useMemo(() => getCacheStats(cacheIndex), [cacheIndex]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="OFFLINE"
      title="音频缓存"
      className="cache-sheet"
      footer={
        <div className="library-footer">
          <span>
            {stats.count} 期 · {formatCacheSize(stats.bytes)}
            {stats.downloading ? ` · 下载中 ${stats.downloading}` : ''}
          </span>
          <span className="mono">LOCAL</span>
        </div>
      }
    >
      {STATIC_DEMO ? (
        <p className="cache-hint">GitHub Pages 静态演示版不提供音频缓存；请在本机运行完整版或安装客户端。</p>
      ) : null}

      <section className="cache-settings">
        <h3>自动缓存</h3>
        <div className="cache-switch-row">
          <div className="cache-switch-copy">
            <strong>发现新播客自动下载</strong>
            <span>订阅或刷新后，后台缓存每档节目最新的 3 期。</span>
          </div>
          <Switch
            checked={prefs.autoCacheNewEpisodes}
            onChange={setAutoCacheNewEpisodes}
            label="发现新播客自动下载"
            hideLabel
          />
        </div>
        <div className="cache-switch-row">
          <div className="cache-switch-copy">
            <strong>在听的播客自动缓存</strong>
            <span>开始收听某期节目时，自动把音频存到本机。</span>
          </div>
          <Switch
            checked={prefs.autoCachePlaying}
            onChange={setAutoCachePlaying}
            label="在听的播客自动缓存"
            hideLabel
          />
        </div>
        <p className="cache-hint">
          直播电台与 HLS 串流不缓存；下载按队列串行进行，不打断正在播放的声音。缓存占用本机存储，可在下方删除。
        </p>
      </section>

      <section className="cache-list-section">
        <div className="cache-list-head">
          <h3>已缓存</h3>
          {stats.count ? (
            <button type="button" className="text-button" onClick={() => void clearEpisodeCache()}>
              <Icon name="trash" size={13} /> 清空全部
            </button>
          ) : null}
        </div>
        {!records.length ? (
          <p className="cache-empty">还没有缓存音频。可以在单集右侧点下载图标手动缓存，或打开上面的自动缓存开关。</p>
        ) : (
          <ul className="cache-list">
            {records.map((record) => {
              const label = record.status === 'downloading'
                ? `下载中 ${Math.round(record.progress * 100)}%`
                : record.status === 'error'
                  ? (record.error || '下载失败')
                  : formatCacheSize(record.size);
              return (
                <li className="cache-item" key={record.key}>
                  <span className="cache-item-mark" aria-hidden="true">
                    <Icon name={record.status === 'ready' ? 'downloadDone' : 'download'} size={16} />
                  </span>
                  <span className="cache-item-copy">
                    <strong>{record.title}</strong>
                    <span>{record.showTitle} · {label}</span>
                  </span>
                  <button
                    type="button"
                    className="cache-item-remove"
                    aria-label={`删除《${record.title}》缓存`}
                    title="删除缓存"
                    disabled={record.status === 'downloading'}
                    onClick={() => void uncacheEpisode(record.key)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="cache-hint">
        缓存只保存在当前设备，不进入订阅备份文件；删除订阅不会自动删除已缓存音频。
      </p>
    </Sheet>
  );
}
