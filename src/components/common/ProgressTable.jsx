// the table under the progress charts: one row for each module (individual
// board) or member (group board) with how many tasks they have, how many
// are completed and how many are overdue, plus a small progress bar.
// rows = [{ key, name, total, done, overdue, color }], name can be any react element
import React from 'react';
import { percent } from '../../lib/progress';

export default function ProgressTable({ heading, countHeading = 'TASKS', rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[520px]">
        <thead>
          <tr className="text-left text-[11px] font-bold muted">
            <th className="py-2 pr-3 font-bold">{heading}</th>
            <th className="py-2 px-2 font-bold text-right">{countHeading}</th>
            <th className="py-2 px-2 font-bold text-right">COMPLETED</th>
            <th className="py-2 px-2 font-bold text-right">OVERDUE</th>
            <th className="py-2 pl-3 font-bold w-[30%]">PROGRESS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t line">
              <td className="py-2.5 pr-3">{r.name}</td>
              <td className="py-2.5 px-2 text-right tabular-nums">{r.total}</td>
              <td className="py-2.5 px-2 text-right tabular-nums font-bold">{r.done} <span className="muted font-medium">({percent(r.done, r.total)}%)</span></td>
              <td className="py-2.5 px-2 text-right tabular-nums" style={r.overdue ? { color: '#dc2626', fontWeight: 700 } : undefined}>{r.overdue}</td>
              <td className="py-2.5 pl-3">
                {r.total ? (
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }} title={`${r.done} of ${r.total} completed`}>
                    <div className="h-full rounded-full" style={{ width: `${percent(r.done, r.total)}%`, background: r.color }} />
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
  );
}
