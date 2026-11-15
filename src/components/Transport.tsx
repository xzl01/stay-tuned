/* SPDX-License-Identifier: GPL-3.0-only */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAppStore } from '../state/AppStore';
import { formatTime, percent } from '../lib/format';
import { showDisplayTitle } from '../lib/shows';
import { Icon } from './Icon';
import { MenuPopover, type MenuOption } from './ui/Primitives';
import { LiveSpectrum } from './LiveSpectrum';
import { usePlayEasterEgg } from '../hooks/usePlayEasterEgg';
import { pulse } from '../lib/haptics';

function useScrubber(max: number) {
  const { playback, seek } = useAppStore();
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);

  const setDraftValue = useCallback((value: number) => {
    draftRef.current = value;
    setDraft(value);
  }, []);

  const commit = useCallback(() => {
    if (draftRef.current != null) {
      seek(draftRef.current);
      draftRef.current = null;
      setDraft(null);
      pulse('snap');
    }
  }, [seek]);

  useEffect(() => {
    if (draft == null) return;
    const onUp = () => {
      if (draftRef.current != null) {
        seek(draftRef.current);
        draftRef.current = null;
        setDraft(null);
      }
    };
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('touchend', onUp, { once: true });
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [draft, seek]);

  return {
    value: draft ?? playback.currentTime,
    draft,
    max,
    setDraftValue,
    commit,
  };
}

function ProgressRail({ variant }: { variant: 'desktop' | 'mobile' }) {
  const { playback, current } = useAppStore();
  const live = current?.kind === 'radio';
  const duration = playback.duration || (current?.kind === 'episode' ? current.episode.duration : 0);
  const scrub = useScrubber(duration);
  const [hover, setHover] = useState<{ pct: number; time: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const value = live ? 0 : scrub.value;
  const progressPct = live ? 100 : percent(value, duration);
  const bufferedPct = live ? 100 : Math.max(progressPct, playback.buffered);
  const displayTime = live ? 'LIVE' : formatTime(value);
  const durationLabel = live ? 'LIVE' : formatTime(duration);

  if (live) {
    return (
      <div className={`progress-rail progress-rail--${variant} is-live`}>
        <span className="progress-time progress-time--current">LIVE</span>
        <div className="live-rail">
          <span className="live-rail-pill">
            <i className={playback.isPlaying ? 'is-live' : ''} />
            实时信号
          </span>
          <LiveSpectrum bars={26} active={playback.isPlaying} className="live-rail-line" mode="rail" />
          <span className="live-rail-note">直播节目不可拖动</span>
        </div>
        <span className="progress-time progress-time--duration">ON AIR</span>
      </div>
    );
  }

  return (
    <div className={`progress-rail progress-rail--${variant}`}>
      <span className="progress-time progress-time--current">{displayTime}</span>
      <div
        className="range-shell"
        ref={railRef}
        onPointerMove={(event) => {
          if (duration <= 0) return;
          const rect = railRef.current?.getBoundingClientRect();
          if (!rect) return;
          const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          setHover({ pct, time: pct * duration });
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div
          className="range-track"
          style={{
            '--progress': `${progressPct}%`,
            '--buffered': `${bufferedPct}%`,
          } as CSSProperties}
          aria-hidden="true"
        >
          <span className="range-buffered" />
          <span className="range-played" />
          <span className="range-thumb" />
        </div>
        {hover ? (
          <span className="range-preview" style={{ left: `${hover.pct * 100}%` }}>
            {formatTime(hover.time)}
          </span>
        ) : null}
        <input
          type="range"
          className="range-input"
          min={0}
          max={Math.max(1, duration)}
          step={1}
          value={Math.min(value, duration || 1)}
          disabled={duration <= 0}
          aria-label="播放进度"
          aria-valuetext={`${formatTime(value)} / ${formatTime(duration)}`}
          onChange={(event) => scrub.setDraftValue(Number(event.target.value))}
          onPointerDown={(event) => pulse('dragStart', { pointerType: event.pointerType })}
          onPointerUp={scrub.commit}
          onTouchEnd={scrub.commit}
          onKeyUp={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
              scrub.setDraftValue(Number(event.currentTarget.value));
              scrub.commit();
            }
          }}
        />
      </div>
      <span className="progress-time progress-time--duration">{durationLabel}</span>
    </div>
  );
}

function sleepTriggerLabel(
  remaining: number | null,
  sleepMode: 'timed' | 'end' | null,
): string {
  if (sleepMode === 'end') return '本集';
  if (remaining != null) return formatTime(remaining);
  return '定时';
}

function DesktopTransport() {
  const {
    current,
    playback,
    prefs,
    sleep,
    sleepRemaining,
    togglePlay,
    skip,
    setRate,
    toggleMute,
    setSleepMinutes,
    setSleepAtEpisodeEnd,
  } = useAppStore();
  const playGesture = usePlayEasterEgg(togglePlay);
  const isRadio = current?.kind === 'radio';
  const speedOptions: MenuOption[] = [0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => ({
    id: String(rate),
    label: `${rate.toFixed(rate % 1 === 0 ? 1 : 2)}×`,
    active: prefs.rate === rate,
    onSelect: () => setRate(rate),
  }));

  const sleepOptions: MenuOption[] = [
    { id: 'off', label: '关闭定时', active: !sleep, onSelect: () => setSleepMinutes(null) },
    { id: '15', label: '15 分钟', active: false, onSelect: () => setSleepMinutes(15) },
    { id: '30', label: '30 分钟', active: false, onSelect: () => setSleepMinutes(30) },
    { id: '60', label: '60 分钟', active: false, onSelect: () => setSleepMinutes(60) },
    ...(isRadio
      ? []
      : [
          {
            id: 'end',
            label: '本集结束后暂停',
            active: sleep?.mode === 'end',
            onSelect: setSleepAtEpisodeEnd,
          } satisfies MenuOption,
        ]),
  ];

  const playLabel = playback.isLoading
    ? '载入中'
    : playback.isPlaying
      ? isRadio
        ? '暂停直播'
        : '暂停播放'
      : isRadio
        ? '继续收听'
        : '继续播放';

  return (
    <div className="transport transport--desktop">
      <div className="transport-now">
        <span className={`now-dot ${playback.isPlaying ? 'is-live' : ''}`} aria-hidden="true" />
        <span className="transport-now-copy">
          <span className="transport-now-title">
            {!current ? '尚未调谐' : playback.isPlaying ? (isRadio ? '正在收听直播' : '正在播放') : '已暂停'}
          </span>
          <span className="transport-now-sub">
            {!current
              ? '从我的订阅里挑一段声音'
              : current.kind === 'episode'
                ? `${showDisplayTitle(current.show)} · 第 ${current.episode.episodeNumber ?? '—'} 期`
                : `${current.station.name} · ${current.station.group || 'LIVE'}`}
          </span>
        </span>
      </div>

      <div className="transport-center">
        <button
          type="button"
          className="skip-button"
          aria-label={isRadio ? '直播节目无法后退' : '后退 15 秒'}
          title={isRadio ? '直播节目无法后退' : !current ? '尚未选择节目' : '后退 15 秒'}
          onClick={() => {
            pulse('press');
            skip(-15);
          }}
          disabled={!current || isRadio}
        >
          <Icon name="rewind15" size={38} strokeWidth={1.45} />
        </button>
        <button
          type="button"
          className={`play-pill ${playback.isPlaying ? 'is-playing' : ''}`}
          {...playGesture}
          aria-label={playLabel}
          data-testid="desktop-play"
        >
          {playback.isLoading ? (
            <span className="pill-spinner" aria-hidden="true" />
          ) : (
            <Icon name={playback.isPlaying ? 'pause' : 'play'} size={19} />
          )}
          <span>{playLabel}</span>
        </button>
        <button
          type="button"
          className="skip-button"
          aria-label={isRadio ? '直播节目无法前进' : '前进 30 秒'}
          title={isRadio ? '直播节目无法前进' : !current ? '尚未选择节目' : '前进 30 秒'}
          onClick={() => {
            pulse('press');
            skip(30);
          }}
          disabled={!current || isRadio}
        >
          <Icon name="forward30" size={38} strokeWidth={1.45} />
        </button>
      </div>

      <div className="transport-tools">
        {!isRadio ? (
          <MenuPopover
            trigger={
              <>
                <span className="rate-value">{prefs.rate.toFixed(1)}×</span>
                <Icon name="chevronDown" size={12} />
              </>
            }
            options={speedOptions}
            ariaLabel="播放速度"
          />
        ) : (
          <span className="on-air-chip">
            <i className={playback.isPlaying ? 'is-live' : ''} /> ON AIR
          </span>
        )}
        <span className="transport-divider" aria-hidden="true" />
        <MenuPopover
          trigger={
            <>
              <Icon name="timer" size={17} />
              <span>{sleepTriggerLabel(sleepRemaining, sleep?.mode ?? null)}</span>
            </>
          }
          options={sleepOptions}
          ariaLabel="睡眠定时"
          active={Boolean(sleep)}
        />
        <span className="transport-divider" aria-hidden="true" />
        <button
          type="button"
          className="volume-button"
          aria-label={prefs.volume > 0 ? '静音' : '取消静音'}
          title={prefs.volume > 0 ? '静音' : '取消静音'}
          onClick={() => {
            pulse(prefs.volume > 0 ? 'toggleOff' : 'toggleOn');
            toggleMute();
          }}
        >
          <Icon name={prefs.volume > 0 ? 'volume' : 'volumeOff'} size={19} />
        </button>
      </div>
    </div>
  );
}

function MobileTransport({ onOpenQueue }: { onOpenQueue: () => void }) {
  const {
    current,
    playback,
    prefs,
    sleep,
    sleepRemaining,
    togglePlay,
    skip,
    setRate,
    setSleepMinutes,
    setSleepAtEpisodeEnd,
    toggleFavorite,
    isFavorite,
    currentKey,
  } = useAppStore();
  const playGesture = usePlayEasterEgg(togglePlay);
  const isRadio = current?.kind === 'radio';
  const favorite = currentKey ? isFavorite(currentKey) : false;
  const speedOptions: MenuOption[] = [0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => ({
    id: String(rate),
    label: `${rate.toFixed(rate % 1 === 0 ? 1 : 2)}×`,
    active: prefs.rate === rate,
    onSelect: () => setRate(rate),
  }));
  const sleepOptions: MenuOption[] = [
    { id: 'off', label: '关闭定时', active: !sleep, onSelect: () => setSleepMinutes(null) },
    { id: '15', label: '15 分钟', active: false, onSelect: () => setSleepMinutes(15) },
    { id: '30', label: '30 分钟', active: false, onSelect: () => setSleepMinutes(30) },
    { id: '60', label: '60 分钟', active: false, onSelect: () => setSleepMinutes(60) },
    ...(isRadio
      ? []
      : [
          {
            id: 'end',
            label: '本集结束后暂停',
            active: sleep?.mode === 'end',
            onSelect: setSleepAtEpisodeEnd,
          } satisfies MenuOption,
        ]),
  ];

  return (
    <div className="transport transport--mobile">
      <ProgressRail variant="mobile" />
      <div className="mobile-buttons">
        <button
          type="button"
          className="mobile-skip"
          onClick={() => {
            pulse('press');
            skip(-15);
          }}
          disabled={!current || isRadio}
          aria-label={isRadio ? '直播节目无法后退' : '后退 15 秒'}
          title={isRadio ? '直播节目无法后退' : !current ? '尚未选择节目' : '后退 15 秒'}
        >
          <Icon name="rewind15" size={48} strokeWidth={1.45} />
        </button>
        <button
          type="button"
          className={`mobile-play ${playback.isPlaying ? 'is-playing' : ''}`}
          {...playGesture}
          aria-label={playback.isPlaying ? '暂停' : '播放'}
          data-testid="mobile-play"
        >
          {playback.isLoading ? (
            <span className="pill-spinner" aria-hidden="true" />
          ) : (
            <Icon name={playback.isPlaying ? 'pause' : 'play'} size={30} />
          )}
        </button>
        <button
          type="button"
          className="mobile-skip"
          onClick={() => {
            pulse('press');
            skip(30);
          }}
          disabled={!current || isRadio}
          aria-label={isRadio ? '直播节目无法前进' : '前进 30 秒'}
          title={isRadio ? '直播节目无法前进' : !current ? '尚未选择节目' : '前进 30 秒'}
        >
          <Icon name="forward30" size={48} strokeWidth={1.45} />
        </button>
      </div>
      <div className="mobile-utilities">
        {!isRadio ? (
          <MenuPopover
            trigger={<span className="mobile-tool-text">{prefs.rate.toFixed(1)}×</span>}
            options={speedOptions}
            ariaLabel="播放速度"
            align="start"
          />
        ) : (
          <span className="mobile-tool-text on-air-label">LIVE</span>
        )}
        <span className="mobile-tool-divider" aria-hidden="true" />
        <MenuPopover
          trigger={
            <>
              <Icon name="timer" size={18} />
              <span className="mobile-tool-text">{sleepTriggerLabel(sleepRemaining, sleep?.mode ?? null)}</span>
            </>
          }
          options={sleepOptions}
          ariaLabel="睡眠定时"
          active={Boolean(sleep)}
          align="start"
        />
        <span className="mobile-tool-divider" aria-hidden="true" />
        <button
          type="button"
          className={`mobile-tool ${favorite ? 'is-active' : ''}`}
          onClick={() => {
            if (!currentKey) return;
            pulse(favorite ? 'toggleOff' : 'toggleOn');
            toggleFavorite(currentKey);
          }}
          aria-pressed={favorite}
        >
          <Icon name="heart" size={18} filled={favorite} />
          <span className="mobile-tool-text">收藏</span>
        </button>
        <span className="mobile-tool-divider" aria-hidden="true" />
        <button
          type="button"
          className="mobile-tool"
          onClick={() => {
            pulse('press');
            onOpenQueue();
          }}
        >
          <Icon name="queue" size={19} />
          <span className="mobile-tool-text">队列</span>
        </button>
      </div>
    </div>
  );
}

export function Transport({ variant, onOpenQueue }: { variant: 'desktop' | 'mobile'; onOpenQueue?: () => void }) {
  if (variant === 'mobile') {
    return <MobileTransport onOpenQueue={onOpenQueue ?? (() => undefined)} />;
  }
  return (
    <>
      <ProgressRail variant="desktop" />
      <DesktopTransport />
    </>
  );
}
