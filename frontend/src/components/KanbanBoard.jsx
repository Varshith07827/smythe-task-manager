import { useState, useRef, useCallback, useMemo, memo, useEffect, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { tasksApi } from '../api/tasks';
import { alert } from './AlertSystem';
import { format } from 'date-fns';

const DEFAULT_COLUMNS = [
  { key: 'pending', label: 'Pending', color: 'var(--accent)' },
  { key: 'in_progress', label: 'In Progress', color: 'var(--orange)' },
  { key: 'completed', label: 'Completed', color: 'var(--green)' },
  { key: 'blocked', label: 'Blocked', color: 'var(--red)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--text-tertiary)' }
];

const PRIORITY_COLORS = {
  low: 'var(--green)',
  medium: 'var(--teal)',
  high: 'var(--orange)',
  critical: 'var(--red)'
};

const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

const KanbanCard = memo(forwardRef(function KanbanCard({ task, priorityColor, isDragging, isSelected, hasSelection, onDragStart, onDragEnd, onClick, onToggle, onCardDragOver, dropIndicator }, ref) {
  const assignees = task.assignedTo || [];
  return (
    <div className="kanban-card-wrapper" onDragOver={(e) => onCardDragOver(e, task._id)}>
      {dropIndicator === 'before' && <div className="kanban-drop-indicator" />}
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: isDragging ? 0.4 : 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className={`kanban-card ${isSelected ? 'kanban-card-selected' : ''} ${hasSelection ? 'kanban-card-has-selection' : ''}`}
        draggable
        onDragStart={(e) => onDragStart(e, task)}
        onDragEnd={onDragEnd}
        onClick={() => hasSelection ? onToggle(task._id) : onClick(task)}
      >
        <div className="kanban-card-priority" style={{ background: priorityColor }} />
        <div className="kanban-card-content">
          <div className="kanban-card-top">
            <div
              className={`kanban-card-checkbox ${isSelected ? 'checked' : ''}`}
              onClick={e => { e.stopPropagation(); onToggle(task._id); }}
            >
              {isSelected && (
                <svg width="10" height="8" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </div>
            <span className="kanban-card-title">{task.title}</span>
          </div>
          <div className="kanban-card-meta">
            {task.priority && (
              <span className="kanban-card-badge" style={{ '--badge-color': priorityColor }}>
                {task.priority}
              </span>
            )}
            {task.dueDate && (
              <span className="kanban-card-due">
                {format(new Date(task.dueDate), 'MMM d')}
              </span>
            )}
            {assignees.length > 0 && (
              <div className="kanban-card-avatars">
                {assignees.slice(0, 2).map(u => (
                  <div key={u._id} className="kanban-card-avatar" title={u.name}>
                    {initials(u.name)}
                  </div>
                ))}
                {assignees.length > 2 && (
                  <div className="kanban-card-avatar kanban-card-avatar-more">
                    +{assignees.length - 2}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
      {dropIndicator === 'after' && <div className="kanban-drop-indicator" />}
    </div>
  );
}));

export default function KanbanBoard({
  tasks,
  boardId,
  customStatuses,
  customPriorities,
  onTaskClick,
  onTasksChange,
  selectedTasks,
  onToggleTask,
  onDragChange,
  isManager
}) {
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { colKey, taskId, position: 'before'|'after' }
  const dragOverRef = useRef(null);
  const dragCounterRef = useRef({});
  const boardRef = useRef(null);
  const scrollAnimRef = useRef(null);

  const startAutoScroll = useCallback((clientX, clientY) => {
    if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const edgeSize = 60;
    let dx = 0, dy = 0;

    if (clientX < rect.left + edgeSize) dx = -8;
    else if (clientX > rect.right - edgeSize) dx = 8;

    if (clientY < rect.top + edgeSize) dy = -8;
    else if (clientY > rect.bottom - edgeSize) dy = 8;

    if (dx || dy) {
      const tick = () => {
        board.scrollLeft += dx;
        board.scrollTop += dy;
        scrollAnimRef.current = requestAnimationFrame(tick);
      };
      scrollAnimRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollAnimRef.current) { cancelAnimationFrame(scrollAnimRef.current); scrollAnimRef.current = null; }
  }, []);

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  const columns = useMemo(() => {
    const cols = [...DEFAULT_COLUMNS];
    if (customStatuses) {
      Object.entries(customStatuses).forEach(([key, val]) => {
        if (!cols.find(c => c.key === key)) {
          cols.push({ key, label: val.label || key, color: val.color || 'var(--accent)' });
        }
      });
    }
    return cols;
  }, [customStatuses]);

  const allPriorityColors = useMemo(() => {
    const colors = { ...PRIORITY_COLORS };
    if (customPriorities) {
      Object.entries(customPriorities).forEach(([key, val]) => {
        colors[key] = val.color || 'var(--teal)';
      });
    }
    return colors;
  }, [customPriorities]);

  const tasksByStatus = useMemo(() => {
    const grouped = {};
    columns.forEach(col => { grouped[col.key] = []; });
    tasks.forEach(task => {
      const status = task.status || 'pending';
      if (grouped[status]) {
        grouped[status].push(task);
      } else {
        grouped.pending.push(task);
      }
    });
    // Sort by order within each column
    Object.values(grouped).forEach(arr => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    return grouped;
  }, [tasks, columns]);

  const handleDragStart = useCallback((e, task) => {
    setDraggedTask(task);
    onDragChange?.(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task._id);
    e.currentTarget.classList.add('kanban-card-dragging');
  }, [onDragChange]);

  const handleDragEnd = useCallback((e) => {
    e.currentTarget.classList.remove('kanban-card-dragging');
    setDraggedTask(null);
    onDragChange?.(null);
    setDragOverColumn(null);
    setDropTarget(null);
    dragCounterRef.current = {};
    stopAutoScroll();
  }, [stopAutoScroll, onDragChange]);

  const handleDragEnter = useCallback((e, colKey) => {
    e.preventDefault();
    dragCounterRef.current[colKey] = (dragCounterRef.current[colKey] || 0) + 1;
    dragOverRef.current = colKey;
    setDragOverColumn(colKey);
  }, []);

  const handleDragLeave = useCallback((e, colKey) => {
    dragCounterRef.current[colKey] = (dragCounterRef.current[colKey] || 0) - 1;
    if (dragCounterRef.current[colKey] <= 0) {
      dragCounterRef.current[colKey] = 0;
      if (dragOverRef.current === colKey) {
        dragOverRef.current = null;
        setDragOverColumn(null);
        setDropTarget(null);
      }
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    startAutoScroll(e.clientX, e.clientY);
  }, [startAutoScroll]);

  // Track which card we're hovering over and whether above/below midpoint
  const handleCardDragOver = useCallback((e, hoveredTaskId) => {
    if (!draggedTask || draggedTask._id === hoveredTaskId) {
      setDropTarget(null);
      return;
    }
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    setDropTarget(prev => {
      if (prev?.taskId === hoveredTaskId && prev?.position === position) return prev;
      return { taskId: hoveredTaskId, position };
    });
  }, [draggedTask]);

  const handleDrop = useCallback(async (e, targetStatus) => {
    e.preventDefault();
    const currentDropTarget = dropTarget;
    setDragOverColumn(null);
    setDropTarget(null);
    dragCounterRef.current = {};
    stopAutoScroll();

    if (!draggedTask) return;

    const isSameColumn = draggedTask.status === targetStatus;
    const isBulk = selectedTasks?.has(draggedTask._id) && selectedTasks.size > 1;

    // Same column reorder
    if (isSameColumn && currentDropTarget) {
      const colTasks = [...(tasksByStatus[targetStatus] || [])];
      const dragIdx = colTasks.findIndex(t => t._id === draggedTask._id);
      if (dragIdx === -1) { setDraggedTask(null); return; }

      // Remove dragged task
      colTasks.splice(dragIdx, 1);
      // Find insert position
      let insertIdx = colTasks.findIndex(t => t._id === currentDropTarget.taskId);
      if (insertIdx === -1) { setDraggedTask(null); return; }
      if (currentDropTarget.position === 'after') insertIdx += 1;
      colTasks.splice(insertIdx, 0, draggedTask);

      // Update order optimistically
      const orderedIds = colTasks.map(t => t._id);
      onTasksChange(prev => {
        const orderMap = {};
        orderedIds.forEach((id, i) => { orderMap[id] = i; });
        return prev.map(t => orderMap[t._id] !== undefined ? { ...t, order: orderMap[t._id] } : t);
      });
      setDraggedTask(null);

      try {
        await tasksApi.reorder(boardId, { orderedIds });
      } catch {
        alert.error('Failed to reorder tasks');
      }
      return;
    }

    // Cross-column move (same as before)
    if (isSameColumn) { setDraggedTask(null); return; }

    const idsToMove = isBulk
      ? [...selectedTasks].filter(id => { const t = tasks.find(tk => tk._id === id); return t && t.status !== targetStatus; })
      : [draggedTask._id];

    if (idsToMove.length === 0) { setDraggedTask(null); return; }

    const idSet = new Set(idsToMove);
    const snapshots = tasks.filter(t => idSet.has(t._id)).map(t => ({ id: t._id, status: t.status }));

    // If we have a drop target, insert at that position in the target column
    if (currentDropTarget) {
      const targetColTasks = [...(tasksByStatus[targetStatus] || [])];
      let insertIdx = targetColTasks.findIndex(t => t._id === currentDropTarget.taskId);
      if (insertIdx !== -1 && currentDropTarget.position === 'after') insertIdx += 1;
      if (insertIdx === -1) insertIdx = targetColTasks.length;

      // Insert moving tasks at position
      const movingTasks = tasks.filter(t => idSet.has(t._id));
      targetColTasks.splice(insertIdx, 0, ...movingTasks);
      const orderedIds = targetColTasks.map(t => t._id);
      const orderMap = {};
      orderedIds.forEach((id, i) => { orderMap[id] = i; });

      onTasksChange(prev => prev.map(t => {
        if (idSet.has(t._id)) return { ...t, status: targetStatus, order: orderMap[t._id] ?? 0 };
        if (orderMap[t._id] !== undefined) return { ...t, order: orderMap[t._id] };
        return t;
      }));
      setDraggedTask(null);

      try {
        if (isBulk) {
          await tasksApi.bulkStatus(boardId, { taskIds: idsToMove, status: targetStatus, boardId });
        } else {
          await tasksApi.update(boardId, idsToMove[0], { status: targetStatus });
        }
        await tasksApi.reorder(boardId, { orderedIds });
      } catch {
        onTasksChange(prev => prev.map(t => {
          const snap = snapshots.find(s => s.id === t._id);
          return snap ? { ...t, status: snap.status } : t;
        }));
        alert.error('Failed to update task status');
      }
    } else {
      onTasksChange(prev => prev.map(t => idSet.has(t._id) ? { ...t, status: targetStatus } : t));
      setDraggedTask(null);

      try {
        if (isBulk) {
          await tasksApi.bulkStatus(boardId, { taskIds: idsToMove, status: targetStatus, boardId });
        } else {
          await tasksApi.update(boardId, idsToMove[0], { status: targetStatus });
        }
      } catch {
        onTasksChange(prev => prev.map(t => {
          const snap = snapshots.find(s => s.id === t._id);
          return snap ? { ...t, status: snap.status } : t;
        }));
        alert.error('Failed to update task status');
      }
    }
  }, [draggedTask, boardId, onTasksChange, stopAutoScroll, selectedTasks, tasks, tasksByStatus, dropTarget]);

  // Board-level dragover for auto-scroll near edges (especially left/right for horizontal)
  const handleBoardDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    startAutoScroll(e.clientX, e.clientY);
  }, [startAutoScroll]);

  return (
    <div className="kanban-board" ref={boardRef} onDragOver={handleBoardDragOver}>
      {columns.map(col => {
        const colTasks = tasksByStatus[col.key] || [];
        const isOver = dragOverColumn === col.key && draggedTask?.status !== col.key;

        return (
          <div
            key={col.key}
            className={`kanban-column ${isOver ? 'kanban-column-over' : ''}`}
            onDragEnter={(e) => handleDragEnter(e, col.key)}
            onDragLeave={(e) => handleDragLeave(e, col.key)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <div className="kanban-column-header">
              <span className="kanban-column-dot" style={{ background: col.color }} />
              <span className="kanban-column-title">{col.label}</span>
              <span className="kanban-column-count">{colTasks.length}</span>
            </div>

            <div className="kanban-column-body">
              <AnimatePresence mode="popLayout">
                {colTasks.map(task => {
                  const dt = dropTarget;
                  let indicator = null;
                  if (dt && dt.taskId === task._id && draggedTask?._id !== task._id) {
                    indicator = dt.position;
                  }
                  return (
                    <KanbanCard
                      key={task._id}
                      task={task}
                      priorityColor={allPriorityColors[task.priority] || 'var(--teal)'}
                      isDragging={draggedTask?._id === task._id}
                      isSelected={selectedTasks?.has(task._id)}
                      hasSelection={selectedTasks?.size > 0}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onClick={onTaskClick}
                      onToggle={onToggleTask}
                      onCardDragOver={handleCardDragOver}
                      dropIndicator={indicator}
                    />
                  );
                })}
              </AnimatePresence>

              {colTasks.length === 0 && (
                <div className="kanban-column-empty">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
