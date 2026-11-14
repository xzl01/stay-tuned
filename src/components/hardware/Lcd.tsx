/* SPDX-License-Identifier: GPL-3.0-only */

import { Icon } from '../Icon';

interface LcdProps {
  isLoading: boolean;
  isPlaying: boolean;
  time: string;
  index?: string;
  line: string;
  ariaLabel: string;
}

/** The small, unlit reflective two-line display on the receiver. */
export function Lcd({ isLoading, isPlaying, time, index, line, ariaLabel }: LcdProps) {
  return (
    <div className="lcd" role="group" aria-label={ariaLabel}>
      <div className="lcd-row lcd-row--top">
        <span className={`lcd-status ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
          {isLoading ? (
            <span className="lcd-thinking">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <Icon name="play" size={13} strokeWidth={1.1} />
          )}
        </span>
        <span className="lcd-time">{time}</span>
      </div>
      <div className="lcd-row lcd-row--bottom">
        {index ? <span className="lcd-index">{index}</span> : null}
        <span className="lcd-line">{line}</span>
      </div>
      <span className="lcd-dither" aria-hidden="true" />
      <span className="lcd-glare" aria-hidden="true" />
    </div>
  );
}
