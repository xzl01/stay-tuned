/* SPDX-License-Identifier: GPL-3.0-only */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../state/AppStore';
import { formatTime, pad2 } from '../../lib/format';
import { Icon } from '../Icon';
import { createReceiverScene, type ReceiverScene, type ReceiverSceneState, type ReceiverView } from './scene';
import './receiver3d.css';

export default function Receiver3DView({ onClose, onOpenQueue }: { onClose: () => void; onOpenQueue: () => void }) {
  const { current, playback, prefs, currentChapterIndex, togglePlay, previous, next, seek, setVolume } = useAppStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReceiverScene | null>(null);
  const [view, setView] = useState<ReceiverView | null>('three-quarter');
  const [orbit, setOrbit] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const chapters = useMemo(() => current?.kind === 'episode' ? current.episode.chapters ?? [] : [], [current]);
  const chapter = chapters[currentChapterIndex];
  const canTune = chapters.length > 1;
  const line = current?.kind === 'radio'
    ? current.station.name
    : current?.kind === 'episode'
      ? chapter ? `${pad2(currentChapterIndex + 1)} ${chapter.title}` : '完整节目'
      : '等待调谐';
  const snapshot: ReceiverSceneState = {
    sourceKey: current?.key ?? 'empty', theme: prefs.theme,
    chapter: Math.max(0, currentChapterIndex), chapters, canTune,
    volume: prefs.volume, playing: playback.isPlaying, loading: playback.isLoading,
    time: current?.kind === 'radio' ? 'LIVE' : formatTime(playback.currentTime), line,
  };
  const latest = useRef({ snapshot, togglePlay, previous, next, seek, setVolume, onOpenQueue });
  latest.current = { snapshot, togglePlay, previous, next, seek, setVolume, onOpenQueue };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setFailed(false); setReady(false); setView('three-quarter'); setOrbit(false);
    try {
      sceneRef.current = createReceiverScene(host, latest.current.snapshot, {
        onTogglePlay: () => latest.current.togglePlay(),
        onPrevious: () => latest.current.previous(),
        onNext: () => latest.current.next(),
        onVolume: value => latest.current.setVolume(value),
        onChapter: index => {
          const target = latest.current.snapshot.chapters[index];
          if (target) latest.current.seek(target.start + .05);
        },
        onOpenQueue: () => latest.current.onOpenQueue(),
        onViewChange: setView,
        onOrbitChange: setOrbit,
        onError: () => {
          setFailed(true); setReady(false);
          sceneRef.current?.dispose(); sceneRef.current = null;
        },
      });
      setReady(true);
      host.focus({ preventScroll: true });
    } catch {
      setFailed(true);
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    sceneRef.current?.update(snapshot);
  }, [current, currentChapterIndex, chapters, prefs.theme, prefs.volume, playback.currentTime, playback.isPlaying, playback.isLoading]);

  return (
    <div className="receiver-3d-inline" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    }}>
      <div
        ref={hostRef}
        className="receiver-3d-canvas"
        data-ready={ready ? 'true' : 'false'}
        role="img"
        tabIndex={ready ? 0 : -1}
        aria-label={`三维收音机。${playback.isPlaying ? '正在播放' : '已暂停'}，${line}。拖动旋转，滚轮或双指缩放；方向键旋转，空格播放或暂停。`}
      />
      {failed ? <div className="receiver-3d-failure" role="alert"><p>暂时无法显示三维收音机。</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重新尝试</button></div> : null}
      <div className="receiver-3d-tools">
        <span className="receiver-3d-mark" title="拖动旋转，滚轮或双指缩放">3D</span>
        <button type="button" aria-label={view === 'back' ? '观察正面' : '观察背面'} disabled={!ready} onClick={() => sceneRef.current?.setView(view === 'back' ? 'front' : 'back')}>{view === 'back' ? '正面' : '背面'}</button>
        <button type="button" aria-label="自动环绕" title="自动环绕" aria-pressed={orbit} disabled={!ready} onClick={() => sceneRef.current?.setOrbit(!orbit)}>环绕</button>
        <button type="button" aria-label="重置三维视角" title="重置视角与缩放" disabled={!ready} onClick={() => sceneRef.current?.setView('three-quarter')}><Icon name="refresh" size={13} /></button>
        <details className="receiver-3d-accessible">
          <summary>操作</summary>
          <div>
            <label>章节<input aria-label="三维收音机章节" type="range" min={0} max={Math.max(1, chapters.length - 1)} step={1} value={Math.max(0, currentChapterIndex)} disabled={!canTune} aria-valuetext={canTune ? line : '当前节目没有章节标记'} onChange={event => { const target = chapters[Number(event.target.value)]; if (target) seek(target.start + .05); }} /></label>
            <label>音量<input aria-label="三维收音机音量" type="range" min={0} max={100} step={1} value={Math.round(prefs.volume * 100)} aria-valuetext={`音量 ${Math.round(prefs.volume * 100)}%`} onChange={event => setVolume(Number(event.target.value) / 100)} /></label>
          </div>
        </details>
      </div>
    </div>
  );
}
