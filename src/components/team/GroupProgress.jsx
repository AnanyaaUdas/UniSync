// progress page of a group project: one chart for how much of the work
// is finished, one chart for who did how much, and a table with the
// numbers for every member
import React from 'react';
import Donut from '../common/Donut';
import ProgressTable from '../common/ProgressTable';
import { Avatar, Empty } from '../common/ui';
import { useDB, userById, displayName } from '../../store/db';
import { statusSlices, memberStats, percent } from '../../lib/progress';

export default function GroupProgress({ project }) {
  const d = useDB();
  const tasks = project.tasks;
  if (!tasks.length) return <Empty>No tasks on this board yet. Add tasks to see the progress charts.</Empty>;

  const doneCount = tasks.filter((t) => t.col === 'done').length;
  const stats = memberStats(project);
  const nameOf = (id) => displayName(userById(d, id));

  // a finished task counts for the member it is assigned to
  const shares = stats.map((m) => ({ key: m.id, label: nameOf(m.id), value: m.done, color: userById(d, m.id).color }));
  const shareTotal = shares.reduce((sum, s) => sum + s.value, 0);

  const rows = stats.map((m) => ({
    key: m.id,
    color: userById(d, m.id).color,
    name: (
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar id={m.id} size={28} ring={false} showOnline />
        <span className="font-semibold truncate">{nameOf(m.id)}</span>
      </div>
    ),
    total: m.assigned,
    done: m.done,
    overdue: m.overdue,
  }));

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <section className="card p-5">
          <h2 className="font-bold text-[15px]">Work completed</h2>
          <p className="text-[12.5px] muted mt-0.5 mb-4">All {tasks.length} tasks on the board by column.</p>
          <Donut data={statusSlices(tasks, (t) => t.col)} centerValue={`${percent(doneCount, tasks.length)}%`} centerLabel="completed" />
        </section>

        <section className="card p-5">
          <h2 className="font-bold text-[15px]">Who did how much</h2>
          <p className="text-[12.5px] muted mt-0.5 mb-4">Share of the completed tasks. A task counts for the member it is assigned to.</p>
          <Donut data={shares} centerValue={shareTotal} centerLabel="tasks completed" emptyText="No completed tasks yet" />
        </section>
      </div>

      <section className="card p-5">
        <h2 className="font-bold text-[15px] mb-3">By member</h2>
        <ProgressTable heading="MEMBER" countHeading="ASSIGNED" rows={rows} />
      </section>
    </div>
  );
}
