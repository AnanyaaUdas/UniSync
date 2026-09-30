// donut (pie) chart drawn with svg, so we don't need a chart package.
// data = [{ key, label, value, color }]. hovering a slice or a legend row
// shows that slice's number in the middle
import React, { useState } from 'react';
import { percent } from '../../lib/progress';

// path for one slice of the ring, from angle a0 to a1
function slicePath(c, inner, outer, a0, a1) {
  const point = (r, a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${point(outer, a0)}A${outer} ${outer} 0 ${big} 1 ${point(outer, a1)}L${point(inner, a1)}A${inner} ${inner} 0 ${big} 0 ${point(inner, a0)}Z`;
}

export default function Donut({ data, size = 168, thickness = 24, centerValue, centerLabel, emptyText = 'Nothing to show yet', legend = true }) {
  const [hover, setHover] = useState(null);
  const slices = data.filter((s) => s.value > 0);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const c = size / 2;
  const outer = c - 2;
  const inner = outer - thickness;

  // work out the start and end angle of every slice, starting at the top
  let angle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const span = (s.value / total) * Math.PI * 2;
    const start = angle;
    angle += span;
    // a full circle can't be drawn as one arc, so stop just before the end
    return { ...s, start, end: Math.min(angle, start + Math.PI * 2 - 0.0001) };
  });

  const active = slices.find((s) => s.key === hover);
  const middleValue = active ? active.value : centerValue;
  const middleLabel = active ? `${active.label} · ${percent(active.value, total)}%` : centerLabel;
  const summary = slices.map((s) => `${s.label} ${s.value}`).join(', ');

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={total ? summary : emptyText}>
          {!total && <circle cx={c} cy={c} r={(outer + inner) / 2} fill="none" stroke="var(--track)" strokeWidth={thickness} />}
          {arcs.map((s) => (
            <path key={s.key} d={slicePath(c, inner, outer, s.start, s.end)} fill={s.color}
              stroke="var(--panel)" strokeWidth={slices.length > 1 ? 2 : 0} strokeLinejoin="round"
              opacity={hover && hover !== s.key ? 0.35 : 1} style={{ transition: 'opacity .15s' }}
              onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
              <title>{`${s.label}: ${s.value} (${percent(s.value, total)}%)`}</title>
            </path>
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center pointer-events-none" style={{ padding: thickness + 8 }}>
          {total ? (
            <div>
              <div className="font-extrabold leading-none" style={{ fontSize: size * 0.19 }}>{middleValue}</div>
              <div className="text-[11px] font-semibold muted mt-1 leading-tight">{middleLabel}</div>
            </div>
          ) : (
            <div className="text-[11.5px] muted leading-tight">{emptyText}</div>
          )}
        </div>
      </div>

      {legend && (
        <ul className="min-w-[150px] flex-1 space-y-1">
          {data.map((s) => (
            <li key={s.key} onMouseEnter={() => s.value > 0 && setHover(s.key)} onMouseLeave={() => setHover(null)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px]"
              style={{ background: hover === s.key ? 'var(--soft2)' : 'transparent' }}>
              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: s.color }} />
              <span className="font-semibold truncate flex-1">{s.label}</span>
              <span className="font-bold tabular-nums">{s.value}</span>
              <span className="muted tabular-nums w-10 text-right">{percent(s.value, total)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
