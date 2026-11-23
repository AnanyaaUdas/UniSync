// progress page of the individual board: one chart for how much of my
// work is finished and a table with the numbers for every module
import React from 'react';
import Donut from '../common/Donut';
import ProgressTable from '../common/ProgressTable';
import { Empty } from '../common/ui';
import { statusSlices, isOverdue, percent } from '../../lib/progress';

export default function PersonalProgress({ modules, tasks }) {
  if (!tasks.length) return <Empty>No tasks on your board yet. Add tasks to see your progress.</Empty>;

  const doneCount = tasks.filter((t) => t.status === 'done').length;

  // numbers for every module that has tasks
  const rows = modules
    .map((m) => {
      const mine = tasks.filter((t) => t.mod === m.id);
      return {
        key: m.id,
        color: m.color,
        name: (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
            <span className="font-semibold truncate">{m.code} · {m.name}</span>
          </div>
        ),
        total: mine.length,
        done: mine.filter((t) => t.status === 'done').length,
        overdue: mine.filter((t) => isOverdue(t, t.status)).length,
      };
    })
    .filter((m) => m.total > 0);

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="font-bold text-[15px]">Work completed</h2>
        <p className="text-[12.5px] muted mt-0.5 mb-4">All {tasks.length} tasks on your board by column.</p>
        <Donut data={statusSlices(tasks, (t) => t.status)} centerValue={`${percent(doneCount, tasks.length)}%`} centerLabel="completed" />
      </section>

      <section className="card p-5">
        <h2 className="font-bold text-[15px] mb-3">By module</h2>
        <ProgressTable heading="MODULE" rows={rows} />
      </section>
    </div>
  );
}
