import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { boardsApi } from '../api/boards';
import { tasksApi } from '../api/tasks';
import { alert } from '../components/AlertSystem';

const STATUS_COLORS = {
  pending: '#8CE4FF',
  in_progress: '#FEEE91',
  completed: '#FFA239',
  blocked: '#FF5656',
  cancelled: '#71717a'
};

const PRIORITY_COLORS = {
  low: '#8CE4FF',
  medium: '#FEEE91',
  high: '#FFA239',
  critical: '#FF5656'
};

function BarChart({ data, colors, label }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 16 }}>No data</div>;

  return (
    <div>
      {/* Stacked bar */}
      <div className="stacked-bar">
        {data.filter(d => d.count > 0).map(d => (
          <div
            key={d.key}
            className="stacked-bar-segment"
            style={{ width: `${(d.count / total) * 100}%`, background: colors[d.key] }}
            title={`${d.label}: ${d.count} (${Math.round((d.count / total) * 100)}%)`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="chart-legend">
        {data.map(d => (
          <div key={d.key} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: colors[d.key] }} />
            <span className="chart-legend-label">{d.label}</span>
            <span className="chart-legend-count">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChart({ data, colors, centerLabel }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 16 }}>No data</div>;

  const size = 140;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {data.filter(d => d.count > 0).map(d => {
          const pct = d.count / total;
          const dash = circumference * pct;
          const gap = circumference - dash;
          const el = (
            <circle
              key={d.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colors[d.key]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'all 0.5s ease' }}
            />
          );
          offset += dash;
          return el;
        })}
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fill="var(--text-primary)" fontSize="22" fontWeight="700">{total}</text>
        <text x="50%" y="50%" textAnchor="middle" dy="1.6em" fill="var(--text-tertiary)" fontSize="10" fontWeight="500">{centerLabel}</text>
      </svg>
      <div className="chart-legend" style={{ flexDirection: 'column' }}>
        {data.map(d => (
          <div key={d.key} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: colors[d.key] }} />
            <span className="chart-legend-label">{d.label}</span>
            <span className="chart-legend-count">{d.count}</span>
            <span className="chart-legend-pct">{Math.round((d.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VBarChart({ data, color }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="vbar-chart">
      {data.map(d => (
        <div key={d.key} className="vbar-item">
          <div className="vbar-bar-wrap">
            <div className="vbar-bar" style={{ height: `${(d.count / max) * 100}%`, background: color || 'var(--accent)' }} />
          </div>
          <span className="vbar-label">{d.label}</span>
          <span className="vbar-count">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function BoardStats() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      boardsApi.getOne(boardId),
      tasksApi.getAll(boardId, {})
    ]).then(([bRes, tRes]) => {
      setBoard(bRes.data);
      setTasks(tRes.data.tasks);
    }).catch(() => alert.error('Failed to load data'))
      .finally(() => setLoading(false));
  }, [boardId]);

  if (loading) return (
    <div className="page-loader">
      <div className="spinner" />
      <span className="page-loader-text">Loading stats...</span>
    </div>
  );
  if (!board) return <div className="empty-state"><h3>Project not found</h3></div>;

  // Compute stats
  const statusData = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].map(s => ({
    key: s, label: s.replace('_', ' '), count: tasks.filter(t => t.status === s).length
  }));

  const priorityData = ['low', 'medium', 'high', 'critical'].map(p => ({
    key: p, label: p, count: tasks.filter(t => t.priority === p).length
  }));

  const assigned = tasks.filter(t => t.assignedTo?.length > 0).length;
  const unassigned = tasks.length - assigned;
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed' && t.status !== 'cancelled').length;
  const completionRate = tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0;

  // Assignee breakdown
  const assigneeMap = {};
  tasks.forEach(t => {
    (t.assignedTo || []).forEach(u => {
      assigneeMap[u.name] = (assigneeMap[u.name] || 0) + 1;
    });
  });
  const assigneeData = Object.entries(assigneeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ key: name, label: name.split(' ')[0], count }));

  // Column value distribution (for dropdown columns)
  const dropdownCols = (board.columns || []).filter(c => c.type === 'dropdown' || c.type === 'tag');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/boards/${boardId}`)} style={{ marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M15 8a.5.5 0 00-.5-.5H2.707l3.147-3.146a.5.5 0 10-.708-.708l-4 4a.5.5 0 000 .708l4 4a.5.5 0 00.708-.708L2.707 8.5H14.5A.5.5 0 0015 8z"/></svg>
            Back to Project
          </button>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{board.title} — Dashboard</h2>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{tasks.length}</div>
          <div className="stat-label">Total Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--orange)' }}>{completionRate}%</div>
          <div className="stat-label">Completion Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: overdue > 0 ? 'var(--red)' : 'var(--text-tertiary)' }}>{overdue}</div>
          <div className="stat-label">Overdue</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--orange)' }}>{unassigned}</div>
          <div className="stat-label">Unassigned</div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3 className="card-title">Status Distribution</h3>
          <DonutChart data={statusData} colors={STATUS_COLORS} centerLabel="TASKS" />
        </div>
        <div className="card">
          <h3 className="card-title">Priority Breakdown</h3>
          <DonutChart data={priorityData} colors={PRIORITY_COLORS} centerLabel="TASKS" />
        </div>
      </div>

      {/* Status bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-title">Status Overview</h3>
        <BarChart data={statusData} colors={STATUS_COLORS} label="Status" />
      </div>

      {/* Assignee + custom columns */}
      <div style={{ display: 'grid', gridTemplateColumns: assigneeData.length > 0 ? '1fr 1fr' : '1fr', gap: 16 }}>
        {assigneeData.length > 0 && (
          <div className="card">
            <h3 className="card-title">Tasks by Assignee</h3>
            <VBarChart data={assigneeData} color="var(--teal)" />
          </div>
        )}
        {dropdownCols.length > 0 && (
          <div className="card">
            <h3 className="card-title">Column Distributions</h3>
            {dropdownCols.slice(0, 3).map(col => {
              const valMap = {};
              tasks.forEach(t => {
                const v = t.columnValues?.[col._id];
                if (v) valMap[v] = (valMap[v] || 0) + 1;
              });
              const colData = Object.entries(valMap).map(([k, v]) => ({ key: k, label: k, count: v }));
              if (colData.length === 0) return null;
              return (
                <div key={col._id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col.name}</div>
                  {colData.map(d => (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ flex: 1, background: 'var(--bg-tertiary)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: `${(d.count / tasks.length) * 100}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 80 }}>{d.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', minWidth: 24, textAlign: 'right' }}>{d.count}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
