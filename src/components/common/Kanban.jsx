// kanban board with 4 columns. tasks can be dragged between columns.
// colOf tells which column a task is in, renderCard draws the task card
import React, { useState } from 'react';
import { COLS } from '../../lib/constants';
import { Empty } from './ui';

export default function Kanban({ items, colOf, onMove, renderCard, onAdd }) {
  const [over, setOver] = useState(null); // column being dragged over
  const [dragging, setDragging] = useState(null); // task being dragged

  function drop(e, colId) {
    e.preventDefault();
    setOver(null);
    setDragging(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id) onMove(id, colId);
  }

  return (
    <>
      <p className="sm:hidden text-[12px] muted mb-2">Swipe sideways to see all 4 columns.</p>
      <div className="kanban grid sm:grid-cols-2 xl:grid-cols-4 gap-4 min-w-0">
        {COLS.map((col) => {
          const tasks = items.filter((t) => colOf(t) === col.id);
          return (
            <section key={col.id} data-col={col.id}
              className={`col card p-3 transition-colors ${over === col.id ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
              onDrop={(e) => drop(e, col.id)}>
              <div className="flex items-center gap-2 px-1 pb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                <span className="font-bold text-[13px]">{col.name}</span>
                <span className="ml-auto badge" style={{ background: 'var(--soft2)', color: '#64748b' }}>{tasks.length}</span>
              </div>

              {col.id === 'todo' && onAdd && (
                <button onClick={onAdd} className="btn w-full mb-2.5 py-2.5 rounded-xl grad text-white text-[13px] font-bold">+ Add Task</button>
              )}

              <div className="space-y-2.5 min-h-[110px]">
                {!tasks.length && <Empty>Drop tasks here</Empty>}
                {tasks.map((t) => (
                  <div key={t.id} draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(t.id)); setDragging(t.id); }}
                    onDragEnd={() => setDragging(null)}
                    className={dragging === t.id ? 'opacity-45' : ''}>
                    {renderCard(t)}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
