import { useCallback, useEffect, useState } from 'react';

interface TaskRecord {
  id: string;
  type: string;
  label: string;
  params: Record<string, any>;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  command?: string;
  exitCode?: number | null;
  reportPath?: string;
  sessionDate: string;
}

interface TaskStats {
  totalTasks: number;
  completed: number;
  failed: number;
  cancelled: number;
  todayTasks: number;
  todayCompleted: number;
  avgDuration: number;
  tasksByType: Record<string, number>;
  tasksByDay: Array<{ date: string; count: number }>;
}

interface TaskHistoryProps {
  onOpenReport?: (reportPath: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  done: '#4ade80',
  already_installed: '#60a5fa',
  failed: '#f87171',
  cancelled: '#fbbf24',
  running: '#818cf8',
  pending: '#8b92a5',
};

const TYPE_LABELS: Record<string, string> = {
  winget_install: 'Install',
  mkdir: 'Create Folder',
  write_file: 'Write File',
  winget_list: 'List Packages',
  run_python: 'Run Python',
  list_exe_files: 'List EXE',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function TaskHistory({ onOpenReport }: TaskHistoryProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ type: string; status: string; search: string }>({
    type: '',
    status: '',
    search: '',
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const api = (window as any).electronAPI;
      if (api?.getTaskHistory && api?.getTaskStats) {
        const [historyRes, statsRes] = await Promise.all([
          api.getTaskHistory({
            type: filter.type || undefined,
            status: filter.status || undefined,
            search: filter.search || undefined,
            limit: 100,
          }),
          api.getTaskStats(),
        ]);
        if (historyRes.success) setTasks(historyRes.tasks);
        if (statsRes.success) setStats(statsRes.stats);
      }
    } catch (e) {
      console.error('Failed to load task history:', e);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const clearHistory = async () => {
    const api = (window as any).electronAPI;
    if (api?.clearTaskHistory) {
      await api.clearTaskHistory();
      setShowClearConfirm(false);
      loadData();
    }
  };

  return (
    <div className="task-history-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.5rem 0' }}>Task History</h2>
          <p style={{ margin: 0, color: '#8b92a5', fontSize: '0.85rem' }}>
            {stats ? `${stats.totalTasks} total tasks · ${stats.completed} completed · ${stats.avgDuration}s avg` : 'Loading...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="add-task-btn" onClick={loadData} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
            Refresh
          </button>
          {!showClearConfirm ? (
            <button
              className="add-task-btn"
              onClick={() => setShowClearConfirm(true)}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#1f2129', color: '#f87171' }}
            >
              Clear All
            </button>
          ) : (
            <button
              className="add-task-btn"
              onClick={clearHistory}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#dc2626', color: '#fff' }}
            >
              Confirm Clear
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: '#15171e', padding: '1rem', borderRadius: '8px', border: '1px solid #1f2129', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.todayTasks}</div>
            <div style={{ color: '#8b92a5', fontSize: '0.8rem' }}>Today</div>
          </div>
          <div style={{ background: '#15171e', padding: '1rem', borderRadius: '8px', border: '1px solid #1f2129', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#4ade80' }}>{stats.completed}</div>
            <div style={{ color: '#8b92a5', fontSize: '0.8rem' }}>Completed</div>
          </div>
          <div style={{ background: '#15171e', padding: '1rem', borderRadius: '8px', border: '1px solid #1f2129', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#f87171' }}>{stats.failed}</div>
            <div style={{ color: '#8b92a5', fontSize: '0.8rem' }}>Failed</div>
          </div>
          <div style={{ background: '#15171e', padding: '1rem', borderRadius: '8px', border: '1px solid #1f2129', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fbbf24' }}>{stats.cancelled}</div>
            <div style={{ color: '#8b92a5', fontSize: '0.8rem' }}>Cancelled</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search tasks..."
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          style={{
            flex: 1, minWidth: '200px', padding: '0.6rem 1rem', borderRadius: '8px',
            background: '#15171e', color: '#fff', border: '1px solid #2a2d39', fontSize: '0.85rem',
          }}
        />
        <select
          value={filter.type}
          onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}
          className="model-select"
          style={{ padding: '0.6rem', fontSize: '0.85rem' }}
        >
          <option value="">All Types</option>
          <option value="winget_install">Install</option>
          <option value="mkdir">Create Folder</option>
          <option value="write_file">Write File</option>
          <option value="winget_list">List Packages</option>
          <option value="run_python">Run Python</option>
          <option value="list_exe_files">List EXE</option>
        </select>
        <select
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          className="model-select"
          style={{ padding: '0.6rem', fontSize: '0.85rem' }}
        >
          <option value="">All Statuses</option>
          <option value="done">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="already_installed">Pre-installed</option>
        </select>
      </div>

      {/* Task List */}
      {loading ? (
        <p style={{ color: '#8b92a5', textAlign: 'center', padding: '2rem' }}>Loading task history...</p>
      ) : tasks.length === 0 ? (
        <p style={{ color: '#8b92a5', textAlign: 'center', padding: '2rem' }}>
          {filter.type || filter.status || filter.search
            ? 'No tasks match your filters.'
            : 'No task history yet. Run some tasks and they\'ll appear here!'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tasks.map(t => (
            <div
              key={`${t.id}-${t.startedAt}`}
              style={{
                background: '#15171e', padding: '1rem', borderRadius: '8px',
                border: '1px solid #1f2129', display: 'flex', alignItems: 'center', gap: '1rem',
              }}
            >
              {/* Status indicator */}
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: STATUS_COLORS[t.status] || '#8b92a5',
                flexShrink: 0,
              }} />

              {/* Task info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.label}
                </div>
                <div style={{ display: 'flex', gap: '1rem', color: '#8b92a5', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  <span>{TYPE_LABELS[t.type] || t.type}</span>
                  <span>{formatDate(t.startedAt)}</span>
                  <span>{formatDuration(t.durationSeconds)}</span>
                  {t.exitCode !== null && t.exitCode !== undefined && (
                    <span>Exit: {t.exitCode}</span>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <span style={{
                padding: '0.25rem 0.6rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 500,
                background: `${STATUS_COLORS[t.status] || '#8b92a5'}22`,
                color: STATUS_COLORS[t.status] || '#8b92a5',
                flexShrink: 0,
              }}>
                {t.status === 'done' ? 'Completed' : t.status === 'already_installed' ? 'Pre-installed' :
                  t.status.charAt(0).toUpperCase() + t.status.slice(1)}
              </span>

              {/* Report button */}
              {t.reportPath && onOpenReport && (
                <button
                  className="add-task-btn"
                  onClick={() => onOpenReport(t.reportPath!)}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', flexShrink: 0 }}
                >
                  Report
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

