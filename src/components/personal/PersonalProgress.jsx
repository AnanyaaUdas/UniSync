// progress page of the individual board: one chart for how much of my
// work is finished, one chart for which modules the finished work is in,
// and a table with the numbers for every module
import React from 'react';
import Donut from '../common/Donut';
import { Empty } from '../common/ui';
import { COLS } from '../../lib/constants';
import { STATUS_COLOR, statusSlices, finishedOnTime, isOverdue, percent } from '../../lib/progress';

export default function PersonalProgress({ modules, tasks }) {
  if (!tasks.length) return <Empty>No tasks on your board yet. Add tasks to see the progress charts.</Empty>;

  const doneCount = tasks.filter((t) => t.status === 'done').length;

  // numbers for every module that has tasks
  const rows = modules
    .map((m) => {
      const mine = tasks.filter((t) => t.mod === m.id);
      const count = (col) => mine.filter((t) => t.status === col).length;
      const timed = mine.map(finishedOnTime).filter((x) => x !== null);
      return {
        ...m,
        total: mine.length,
        todo: count('todo'),
        progress: count('progress'),
        review: count('review'),
        done: count('done'),
        overdue: mine.filter((t) => isOverdue(t, t.status)).length,
        onTime: timed.length ? `${timed.filter(Boolean).length}/${timed.length}` : 'n/a',
      };
    })
    .filter((m) => m.total > 0);

  const byModule = rows.map((m) => ({ key: m.id, label: `${m.code} · ${m.name}`, value: m.done, color: m.color }));

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <section className="card p-5">
          <h2 className="font-bold text-[15px]">Work completed</h2>
          <p className="text-[12.5px] muted mt-0.5 mb-4">All {tasks.length} tasks on your board by column.</p>
          <Donut data={statusSlices(tasks, (t) => t.status)} centerValue={`${percent(doneCount, tasks.length)}%`} centerLabel="completed" />
        </section>

        <section className="card p-5">
          <h2 className="font-bold text-[15px]">Completed by module</h2>
          <p className="text-[12.5px] muted mt-0.5 mb-4">Which modules your completed tasks belong to.</p>
          <Donut data={byModule} centerValue={doneCount} centerLabel="tasks completed" emptyText="No completed tasks yet" />
        </section>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          <h2 className="font-bold text-[15px] flex-1">Module breakdown</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {COLS.map((col) => (
              <span key={col.id} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold muted">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: STATUS_COLOR[col.id] }} />{col.name}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] font-bold muted">
                <th className="py-2 pr-3 font-bold">MODULE</th>
                <th className="py-2 px-2 font-bold text-right">TASKS</th>
                <th className="py-2 px-2 font-bold text-right">COMPLETED</th>
                <th className="py-2 px-2 font-bold text-right">OVERDUE</th>
                <th className="py-2 px-2 font-bold text-right">ON TIME</th>
                <th className="py-2 pl-3 font-bold w-[34%]">TASKS BY COLUMN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t line">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                      <span className="font-semibold truncate">{m.code} · {m.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{m.total}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-bold">{m.done} <span className="muted font-medium">({percent(m.done, m.total)}%)</span></td>
                  <td className="py-2.5 px-2 text-right tabular-nums" style={m.overdue ? { color: '#dc2626', fontWeight: 700 } : undefined}>{m.overdue}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{m.onTime}</td>
                  <td className="py-2.5 pl-3">
                    <div className="flex h-2.5 gap-[2px]" title={COLS.map((col) => `${col.name} ${m[col.id]}`).join(', ')}>
                      {COLS.filter((col) => m[col.id] > 0).map((col) => (
                        <div key={col.id} className="h-full rounded-[3px]" style={{ flexGrow: m[col.id], flexBasis: 0, background: STATUS_COLOR[col.id] }} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] muted mt-3">On time counts tasks that were moved to Completed on or before their deadline. Tasks finished before the app saved the date show n/a.</p>
      </section>
    </div>
  );
}
