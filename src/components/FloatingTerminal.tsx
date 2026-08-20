import { useEffect, useRef } from 'react';

export interface TerminalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TerminalStatus = 'pending' | 'running' | 'done' | 'failed' | 'already_installed' | 'cancelled' | 'cancelling';

interface FloatingTerminalProps {
  taskId: string;
  title: string;
  logs: string[];
  status: TerminalStatus;
  reportPath?: string;
  bounds: TerminalBounds;
  onBoundsChange: (bounds: TerminalBounds) => void;
  zIndex: number;
  focused: boolean;
  minimized: boolean;
  onToggleMinimize: () => void;
  onFocus: () => void;
  onClose: () => void;
  onViewReport: () => void;
  onOpenReportFolder: () => void;
}

const MIN_WIDTH = 360;
const MIN_HEIGHT = 200;

const STATUS_BADGE: Record<TerminalStatus, string> = {
  pending: 'Pending',
  running: 'Running...',
  done: 'Completed',
  failed: 'Failed',
  already_installed: 'Already Installed',
  cancelled: 'Cancelled',
  cancelling: 'Cancelling...',
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// ---------------------------------------------------------------------------
// FloatingTerminal
//
// A desktop-style floating terminal window rendered entirely inside the React
// app (no separate BrowserWindow). The window is positioned with CSS
// absolute positioning (left/top/width/height). Dragging is handled with
// Pointer Events on the title bar only; the log body stays scrollable and
// never triggers a drag. A bottom-right handle resizes the window.
//
// Close and Minimize are real controls: Close asks the parent to mark the
// window closed (logs keep streaming in the parent's state), Minimize
// collapses the window to its title bar only and clicking again restores the
// previous size. Both buttons are intentionally excluded from header drag
// pointer capture so their normal click behavior is never swallowed.
// ---------------------------------------------------------------------------
export default function FloatingTerminal({
  title,
  logs,
  status,
  reportPath,
  bounds,
  onBoundsChange,
  zIndex,
  focused,
  minimized,
  onToggleMinimize,
  onFocus,
  onClose,
  onViewReport,
  onOpenReportFolder,
}: FloatingTerminalProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ pointerId: number; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Keep live log streaming autoscrolled to the bottom (preserves prior
  // behavior). Only autoscroll while expanded — a minimized window has no body.
  useEffect(() => {
    const el = bodyRef.current;
    if (el && !minimized) el.scrollTop = el.scrollHeight;
  }, [logs, minimized]);

  // ---- Drag (title bar only) ----------------------------------------------
  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Never start a drag from the window controls (minimize/close). Those
    // buttons must keep their normal click behavior, so the header must not
    // capture the pointer when the press originated on a button.
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) return;
    onFocus();
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore capture failures
    }
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Keep the window fully visible inside the application viewport.
    const maxX = Math.max(0, window.innerWidth - bounds.width);
    const maxY = Math.max(0, window.innerHeight - bounds.height);
    onBoundsChange({
      ...bounds,
      x: clamp(e.clientX - d.offsetX, 0, maxX),
      y: clamp(e.clientY - d.offsetY, 0, maxY),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore release failures
    }
  };

  // ---- Resize (bottom-right handle) ---------------------------------------
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFocus();
    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startW: bounds.width,
      startH: bounds.height,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore capture failures
    }
  };

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r || e.pointerId !== r.pointerId) return;
    const nextW = Math.min(Math.max(MIN_WIDTH, r.startW + (e.clientX - r.startX)), window.innerWidth);
    const nextH = Math.min(Math.max(MIN_HEIGHT, r.startH + (e.clientY - r.startY)), window.innerHeight - 48);
    onBoundsChange({ ...bounds, width: nextW, height: nextH });
  };

  const endResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current || e.pointerId !== resizeRef.current.pointerId) return;
    resizeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore release failures
    }
  };

  const copyLogs = async () => {
    // Join raw chunks exactly as streamed (chunks already carry their own
    // line breaks), so the clipboard matches the live terminal output.
    const text = logs.join('');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const isFinished = status === 'done' || status === 'failed' || status === 'already_installed' || status === 'cancelled';

  return (
    <div
      ref={frameRef}
      className={`floating-terminal${focused ? ' focused' : ''}${minimized ? ' minimized' : ''}`}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        // Height is only applied while expanded; minimized collapses to the
        // title bar but keeps bounds.height intact for later restore.
        height: minimized ? 'auto' : bounds.height,
        zIndex,
      }}
      onPointerDown={onFocus}
    >
      <div
        className="floating-terminal-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="floating-terminal-title" title={title}>
          {title}
        </span>
        <div className="floating-terminal-controls">
          <span className={`term-status ${status}`}>{STATUS_BADGE[status]}</span>
          <button
            type="button"
            className="term-btn"
            title={minimized ? 'Restore' : 'Minimize'}
            onClick={onToggleMinimize}
          >
            {minimized ? '□' : '—'}
          </button>
          <button type="button" className="term-btn" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="floating-terminal-body" ref={bodyRef}>
            {logs.length === 0 ? (
              <div className="log-empty">Waiting for output…</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="log-line">
                  {l}
                </div>
              ))
            )}
          </div>

          <div className="floating-terminal-actions">
            <button type="button" className="ft-action-btn" onClick={copyLogs}>
              Copy Logs
            </button>
            {reportPath && (
              <>
                <button type="button" className="ft-action-btn" onClick={onViewReport}>
                  View Report
                </button>
                <button type="button" className="ft-action-btn" onClick={onOpenReportFolder}>
                  Open Report Folder
                </button>
              </>
            )}
            {isFinished && (
              <span className="ft-finished">Task {status === 'failed' ? 'failed' : status === 'cancelled' ? 'cancelled' : 'completed'}</span>
            )}
          </div>

          <div
            className="floating-terminal-resize"
            title="Resize"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        </>
      )}
    </div>
  );
}