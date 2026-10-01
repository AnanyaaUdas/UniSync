// progress page of a group project: one chart for how much of the work
// is finished, one chart for who did how much, and a table with the
// numbers for every member
import React, { useState } from 'react';
import Donut from '../common/Donut';
import { Avatar, Empty } from '../common/ui';
import { useDB, userById, displayName } from '../../store/db';
import { COLS } from '../../lib/constants';
import { STATUS_COLOR, statusSlices, memberStats, percent } from '../../lib/progress';

const MAX_SLICES = 6; // more members than this are grouped as "Others"

export default function GroupProgress({ project }) {
  const d = useDB();
  const [mode, setMode] = useState('done'); // 'done' = finished tasks, 'assigned' = workload
  const tasks = project.tasks;
  const doneCount = tasks.filter((t) => t.col === 'done').length;
  const stats = memberStats(project);
  const nameOf = (id) => displayName(userById(d, id));

  // biggest share first, small ones folded into "Others"
  const ranked = [...stats].sort((a, b) => b[mode] - a[mode]);
  const shares = ranked.slice(0, MAX_SLICES).map((m) => ({ key: m.id, label: nameOf(m.id), value: m[mode], color: userById(d, m.id).color }));
  const rest = ranked.slice(MAX_SLICES).reduce((sum, m) => sum + m[mode], 0);
  if (rest) shares.push({ key: 'others', label: 'Others', value: rest, color: '#94a3b8' });
  const shareTotal = shares.reduce((sum, s) => sum + s.value, 0);

  if (!tasks.length) return <Empty>No tasks on this board yet. Add tasks to see the progress charts.</Empty>;

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <section className="card p-5">
          <h2 className="font-bold text-[15px]">Work completed</h2>
          <p className="text-[12.5px] muted mt-0.5 mb-4">All {tasks.length} tasks on the board by column.</p>
          <Donut data={statusSlices(tasks, (t) => t.col)} centerValue={`${percent(doneCount, tasks.length)}%`} centerLabel="completed" />
        </section>

        <section className="card p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[180px]">
              <h2 className="font-bold text-[15px]">Who did how much</h2>
              <p className="text-[12.5px] muted mt-0.5 mb-4">
                {mode === 'done' ? 'Share of the completed tasks.' : 'Share of all tasks given to each member.'} A task counts for the member it is assigned to.
              </p>
            </div>
            <div className="flex p-1 rounded-xl" style={{ background: 'var(--soft2)' }}>
              {[['done', 'Completed'], ['assigned', 'Assigned']].map(([key, label]) => (
                <button key={key} onClick={() => setMode(key)}
                  className={`btn px-3 py-1.5 rounded-lg text-[12px] font-bold ${mode === key ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Donut data={shares} centerValue={shareTotal} centerLabel={mode === 'done' ? 'tasks completed' : 'tasks assigned'}
            emptyText="No completed tasks yet" />
        </section>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          <h2 className="font-bold text-[15px] flex-1">Member breakdown</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {COLS.map((col) => (
              <span key={col.id} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold muted">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: STATUS_COLOR[col.id] }} />{col.name}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] font-bold muted">
                <th className="py-2 pr-3 font-bold">MEMBER</th>
                <th className="py-2 px-2 font-bold text-right">ASSIGNED</th>
                <th className="py-2 px-2 font-bold text-right">COMPLETED</th>
                <th className="py-2 px-2 font-bold text-right">OVERDUE</th>
                <th className="py-2 px-2 font-bold text-right">SUB-TASKS</th>
                <th className="py-2 px-2 font-bold text-right">COMMENTS</th>
                <th className="py-2 px-2 font-bold text-right">ACTIONS</th>
                <th className="py-2 pl-3 font-bold w-[30%]">THEIR TASKS BY COLUMN</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((m) => (
                <tr key={m.id} className="border-t line">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar id={m.id} size={28} ring={false} showOnline />
                      <span className="font-semibold truncate">{nameOf(m.id)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{m.assigned}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-bold">{m.done} <span className="muted font-medium">({percent(m.done, m.assigned)}%)</span></td>
                  <td className="py-2.5 px-2 text-right tabular-nums" style={m.overdue ? { color: '#dc2626', fontWeight: 700 } : undefined}>{m.overdue}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{m.subsDone}/{m.subsTotal}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{m.comments}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{m.actions}</td>
                  <td className="py-2.5 pl-3">
                    {m.assigned ? (
                      <div className="flex h-2.5 gap-[2px]" title={COLS.map((col) => `${col.name} ${m[col.id]}`).join(', ')}>
                        {COLS.filter((col) => m[col.id] > 0).map((col) => (
                          <div key={col.id} className="h-full rounded-[3px]" style={{ flexGrow: m[col.id], flexBasis: 0, background: STATUS_COLOR[col.id] }} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] muted">No tasks yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] muted mt-3">Actions are the lines each member has in the live activity feed (moving, creating and commenting on tasks).</p>
      </section>
    </div>
  );
}
