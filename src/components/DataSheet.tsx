/* SPDX-License-Identifier: GPL-3.0-only */

import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { Sheet, Spinner } from './ui/Primitives';
import { useAppStore } from '../state/AppStore';
import { isHarmonyShell, isNativePlatform } from '../lib/serverConfig';
import type { ImportMode } from '../lib/backup';

interface DataSheetProps {
  open: boolean;
  onClose: () => void;
}

export function DataSheet({ open, onClose }: DataSheetProps) {
  const { shows, stations, exportBackup, importBackup, notify } = useAppStore();
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [lastPath, setLastPath] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const native = isNativePlatform();
  const harmony = isHarmonyShell();

  const runExport = async () => {
    setBusy('export');
    setError('');
    try {
      const path = await exportBackup();
      setLastPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败。');
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (file: File) => {
    setBusy('import');
    setError('');
    try {
      const result = await importBackup(file, mode);
      notify(`已导入 ${result.shows + result.stations} 条订阅。`, 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败。');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="SYNC"
      title="订阅备份"
      className="data-sheet"
      footer={
        <div className="library-footer">
          <span>文件只包含订阅与设置，不含音频</span>
          <span className="mono">JSON</span>
        </div>
      }
    >
      <section className="backup-block">
        <h3>导出</h3>
        <p className="backup-hint">
          把 {shows.length} 档播客、{stations.length} 个电台、收藏与播放进度写成一个 JSON 文件，
          可以放进网盘或聊天工具，在另一台设备导入。
        </p>
        <button type="button" className="solid-button backup-action" disabled={busy !== null} onClick={() => void runExport()}>
          {busy === 'export' ? <Spinner label="导出中" /> : <Icon name="external" size={15} />}
          {busy === 'export' ? '导出中…' : native ? '导出并分享文件' : harmony ? '保存备份文件' : '下载备份文件'}
        </button>
        {lastPath ? (
          <p className="backup-note" title={lastPath}>
            已保存：{lastPath.split('/').pop() || lastPath}
          </p>
        ) : null}
      </section>

      <section className="backup-block">
        <h3>导入</h3>
        <div className="backup-modes" role="group" aria-label="导入方式">
          <button
            type="button"
            className={mode === 'merge' ? 'is-active' : ''}
            aria-pressed={mode === 'merge'}
            onClick={() => setMode('merge')}
          >
            合并
          </button>
          <button
            type="button"
            className={mode === 'replace' ? 'is-active' : ''}
            aria-pressed={mode === 'replace'}
            onClick={() => setMode('replace')}
          >
            替换
          </button>
        </div>
        <p className="backup-hint">
          {mode === 'merge'
            ? '保留本机现有订阅，只把新订阅、收藏和更长的播放进度合并进来。'
            : '用文件内容整体替换本机订阅列表；播放偏好和当前播放会重置。'}
        </p>
        <button
          type="button"
          className="text-button backup-pick"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
        >
          {busy === 'import' ? <Spinner label="导入中" /> : <Icon name="plus" size={14} />}
          {busy === 'import' ? '导入中…' : '选择备份文件'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void runImport(file);
          }}
        />
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
