// the shapes that can be put on the group canvas and the kinds of lines
// that connect them. every shape is saved as plain json:
//   { id, type, position: { x, y }, data: { ... }, width, height }
// width and height are only saved after a member resized the shape
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Handle, Position, MarkerType, NodeResizer } from '@xyflow/react';

// lets a shape on the canvas save its own text (used by the plain text
// shape, which is typed straight on the canvas). CanvasBoard fills this in
export const CanvasTools = createContext({ editingId: null, setEditingId() {}, editShape() {}, removeShape() {} });

// the toolbar shows one group of shapes at a time
export const GROUPS = {
  structure: { label: 'Class and database', line: 'association' },
  activity: { label: 'Activity diagram', line: 'flow' },
  sequence: { label: 'Sequence diagram', line: 'message' },
  general: { label: 'Planning and notes', line: 'plain' },
};

// what a new shape starts with, and which fields the side panel shows.
// field kinds: (none) = one line of text, 'lines' = text area,
// 'choice' = dropdown with [value, label] options.
// w and h are the starting size. shapes that have w can be resized by
// dragging a corner (no h = as tall as the text needs)
export const SHAPES = {
  class: {
    group: 'structure',
    label: 'Class',
    icon: 'classBox',
    color: '#4f46e5',
    w: 200,
    data: { title: 'ClassName', attrs: '- id: int\n- name: string', methods: '+ save(): void' },
    fields: [['title', 'CLASS NAME'], ['attrs', 'ATTRIBUTES (ONE PER LINE)', 'lines'], ['methods', 'METHODS (ONE PER LINE)', 'lines']],
  },
  table: {
    group: 'structure',
    label: 'Table',
    icon: 'table',
    color: '#0891b2',
    w: 200,
    data: { title: 'table_name', cols: 'id INT PK\nname VARCHAR(100)' },
    fields: [['title', 'TABLE NAME'], ['cols', 'COLUMNS (ONE PER LINE)', 'lines']],
  },

  // activity diagram
  start: { group: 'activity', label: 'Start', icon: 'dot', color: '#0f172a', data: {}, fields: [], noColor: true },
  action: {
    group: 'activity',
    label: 'Action',
    icon: 'box',
    color: '#4f46e5',
    w: 170,
    h: 46,
    data: { title: 'Do something' },
    fields: [['title', 'ACTION']],
  },
  decision: {
    group: 'activity',
    label: 'Decision',
    icon: 'diamond',
    color: '#ca8a04',
    w: 150,
    h: 96,
    data: { title: 'Valid?' },
    fields: [['title', 'QUESTION (KEEP IT SHORT)']],
  },
  bar: {
    group: 'activity',
    label: 'Fork / join',
    icon: 'minus',
    color: '#0f172a',
    data: { dir: 'h', len: 170 },
    fields: [['dir', 'DIRECTION', 'choice', [['h', 'Horizontal'], ['v', 'Vertical']]], ['len', 'LENGTH', 'choice', [[110, 'Short'], [170, 'Medium'], [280, 'Long'], [420, 'Very long']]]],
    noColor: true,
  },
  end: { group: 'activity', label: 'End', icon: 'target', color: '#0f172a', data: {}, fields: [], noColor: true },

  // sequence diagram
  actor: {
    group: 'sequence',
    label: 'Actor',
    icon: 'user',
    color: '#db2777',
    data: { title: 'Student', len: 400 },
    fields: [['title', 'NAME'], ['len', 'LIFELINE LENGTH', 'choice', [[250, 'Short'], [400, 'Medium'], [640, 'Long'], [900, 'Very long']]]],
  },
  lifeline: {
    group: 'sequence',
    label: 'Lifeline',
    icon: 'lifeline',
    color: '#0891b2',
    data: { title: ':Object', len: 400 },
    fields: [['title', 'NAME'], ['len', 'LIFELINE LENGTH', 'choice', [[250, 'Short'], [400, 'Medium'], [640, 'Long'], [900, 'Very long']]]],
  },

  task: {
    group: 'general',
    label: 'Work item',
    icon: 'box',
    color: '#059669',
    w: 200,
    data: { title: 'Work package', text: '' },
    fields: [['title', 'TITLE'], ['text', 'DETAILS', 'lines']],
  },
  note: {
    group: 'general',
    label: 'Note',
    icon: 'sticky',
    color: '#ca8a04',
    w: 200,
    data: { text: 'Write a note' },
    fields: [['text', 'NOTE', 'lines']],
  },

  // plain text with no box. double clicking the canvas adds one
  text: {
    group: 'all',
    label: 'Text',
    icon: 'text',
    color: '#0f172a',
    data: { text: '', size: 15 },
    fields: [['text', 'TEXT', 'lines'], ['size', 'TEXT SIZE', 'choice', [[12, 'Small'], [15, 'Normal'], [20, 'Large'], [28, 'Title']]]],
  },

  // plain box, shown in every diagram type. as an outline it goes behind
  // the other shapes, so it can be used as a frame (loop, alt, swimlane)
  rect: {
    group: 'all',
    label: 'Rectangle',
    icon: 'square',
    color: '#64748b',
    w: 180,
    h: 90,
    data: { text: '', fill: 'solid' },
    fields: [['text', 'TEXT', 'lines'], ['fill', 'STYLE', 'choice', [['solid', 'Filled box'], ['none', 'Outline only (frame)']]]],
  },
};

// turns a saved shape into what react flow wants: adds the starting size
// when it was never resized, and puts outline rectangles behind the rest
export function toFlowNode(node) {
  const shape = SHAPES[node.type] || {};
  return {
    ...node,
    width: node.width ?? shape.w,
    height: node.height ?? shape.h,
    zIndex: node.type === 'rect' && node.data.fill === 'none' ? -1 : undefined,
  };
}

export const SHAPE_COLORS = ['#4f46e5', '#0891b2', '#059669', '#ca8a04', '#db2777', '#ea580c', '#64748b'];

// kinds of connecting lines.
//   arrow / start = what is drawn at the end / start of the line
//   text          = label drawn on the line when the member did not type one
//   straight      = straight line (used for sequence diagram messages)
// 'cv-dot' and 'cv-arrow-dot' are our own line ends, drawn in <LineEnds />
export const LINES = {
  association: { group: 'structure', label: 'Association', arrow: MarkerType.Arrow },
  inheritance: { group: 'structure', label: 'Inheritance', arrow: MarkerType.ArrowClosed, text: 'extends' },
  composition: { group: 'structure', label: 'Composition', arrow: MarkerType.ArrowClosed, text: 'has' },
  dependency: { group: 'structure', label: 'Dependency', arrow: MarkerType.Arrow, dashed: true, text: 'uses' },
  oneToOne: { group: 'structure', label: 'One to one', text: '1 : 1' },
  oneToMany: { group: 'structure', label: 'One to many', text: '1 : N' },
  manyToMany: { group: 'structure', label: 'Many to many', text: 'N : M' },

  flow: { group: 'activity', label: 'Flow arrow', arrow: MarkerType.ArrowClosed },
  dotEnd: { group: 'activity', label: 'Line with dot at the end', arrow: 'cv-dot' },
  arrowDot: { group: 'activity', label: 'Arrow with dot at the end', arrow: 'cv-arrow-dot' },

  message: { group: 'sequence', label: 'Message', arrow: MarkerType.ArrowClosed, straight: true },
  asyncMessage: { group: 'sequence', label: 'Async message', arrow: MarkerType.Arrow, straight: true },
  reply: { group: 'sequence', label: 'Reply', arrow: MarkerType.Arrow, dashed: true, straight: true },
  lost: { group: 'sequence', label: 'Lost message (arrow to dot)', arrow: 'cv-arrow-dot', straight: true },
  found: { group: 'sequence', label: 'Found message (dot to arrow)', start: 'cv-dot', arrow: MarkerType.ArrowClosed, straight: true },

  plain: { group: 'general', label: 'Plain line' },
};

const lineEnd = (end) => {
  if (!end) return undefined;
  return end.startsWith('cv-') ? end : { type: end, width: 18, height: 18 };
};

// adds the arrow, dashes and label to a saved line so react flow can draw it
export function drawLine(edge) {
  const kind = LINES[edge.data?.kind] || LINES.association;
  return {
    ...edge,
    type: kind.straight ? 'straight' : 'smoothstep',
    label: edge.data?.text || kind.text,
    markerStart: lineEnd(kind.start),
    markerEnd: lineEnd(kind.arrow),
    style: { strokeWidth: 1.6, strokeDasharray: kind.dashed ? '6 4' : undefined },
  };
}

// our own line ends: a filled dot, and an arrow that points at a dot.
// put once on the page, the lines use them by id
export const LineEnds = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <defs>
      <marker id="cv-dot" viewBox="0 0 12 12" markerWidth="12" markerHeight="12" refX="6" refY="6" markerUnits="userSpaceOnUse" orient="auto">
        <circle cx="6" cy="6" r="5" style={{ fill: 'var(--ink)' }} />
      </marker>
      <marker id="cv-arrow-dot" viewBox="0 0 26 12" markerWidth="26" markerHeight="12" refX="25" refY="6" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M2 1 L13 6 L2 11" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--ink)' }} />
        <circle cx="19.5" cy="6" r="5" style={{ fill: 'var(--ink)' }} />
      </marker>
    </defs>
  </svg>
);

const lines = (text = '') => text.split('\n').map((x) => x.trim()).filter(Boolean);

// a connection point on each side, so lines can start and end anywhere
const Dots = () => (
  <>
    <Handle type="source" id="t" position={Position.Top} />
    <Handle type="source" id="r" position={Position.Right} />
    <Handle type="source" id="b" position={Position.Bottom} />
    <Handle type="source" id="l" position={Position.Left} />
  </>
);

// corner handles to resize the shape, shown when it is selected
const Resize = ({ on, minWidth = 80, minHeight = 36 }) => (
  <NodeResizer isVisible={on} minWidth={minWidth} minHeight={minHeight} lineClassName="cv-resize-line" handleClassName="cv-resize-dot" />
);

const Rows = ({ text, empty }) => (
  <div className="cv-rows">
    {lines(text).map((row, i) => <div key={i}>{row}</div>)}
    {!lines(text).length && <div className="muted">{empty}</div>}
  </div>
);

// ---------- class and database ----------

function ClassShape({ data, selected }) {
  const color = data.color || SHAPES.class.color;
  return (
    <div className={`cv-shape ${selected ? 'on' : ''}`} style={{ '--cv': color }}>
      <div className="cv-head" style={{ background: color }}>{data.title || 'ClassName'}</div>
      <Rows text={data.attrs} empty="no attributes" />
      <div className="cv-split" />
      <Rows text={data.methods} empty="no methods" />
      <Resize on={selected} minWidth={120} minHeight={70} />
      <Dots />
    </div>
  );
}

function TableShape({ data, selected }) {
  const color = data.color || SHAPES.table.color;
  return (
    <div className={`cv-shape ${selected ? 'on' : ''}`} style={{ '--cv': color }}>
      <div className="cv-head" style={{ background: color }}>{data.title || 'table_name'}</div>
      <Rows text={data.cols} empty="no columns" />
      <Resize on={selected} minWidth={120} minHeight={60} />
      <Dots />
    </div>
  );
}

// ---------- activity diagram ----------

// black dot where the activity starts
const StartShape = ({ selected }) => (
  <div className={`cv-free cv-start ${selected ? 'on' : ''}`}><Dots /></div>
);

// dot inside a ring where the activity ends
const EndShape = ({ selected }) => (
  <div className={`cv-free cv-end ${selected ? 'on' : ''}`}><span /><Dots /></div>
);

function ActionShape({ data, selected }) {
  const color = data.color || SHAPES.action.color;
  return (
    <div className={`cv-free cv-action ${selected ? 'on' : ''}`} style={{ '--cv': color, borderColor: color }}>
      {data.title || 'Action'}
      <Resize on={selected} />
      <Dots />
    </div>
  );
}

function DecisionShape({ data, selected }) {
  const color = data.color || SHAPES.decision.color;
  return (
    <div className={`cv-free cv-decision ${selected ? 'on' : ''}`} style={{ '--cv': color }}>
      <svg viewBox="0 0 150 96" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="75,2 148,48 75,94 2,48" fill="var(--panel)" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span>{data.title || '?'}</span>
      <Resize on={selected} minWidth={90} minHeight={60} />
      <Dots />
    </div>
  );
}

// thick bar where the flow splits into parallel flows or joins again
function BarShape({ data, selected }) {
  const length = Number(data.len) || 170;
  const size = data.dir === 'v' ? { width: 8, height: length } : { width: length, height: 8 };
  return <div className={`cv-free cv-bar ${selected ? 'on' : ''}`} style={size}><Dots /></div>;
}

// ---------- sequence diagram ----------

// a box (or a stick figure for an actor) with a dashed line going down.
// the line has a connection point every 30px so messages can be drawn
// straight across to another lifeline at the same height. actors and
// lifelines are the same size, so putting them in one row lines them up
function LifelineShape({ data, selected, type }) {
  const color = data.color || SHAPES[type].color;
  const length = Number(data.len) || 400;
  const top = 84; // where the dashed line starts
  const points = [];
  for (let y = top + 26; y <= top + length - 10; y += 30) points.push(y);

  return (
    <div className={`cv-free cv-life ${selected ? 'on' : ''}`} style={{ '--cv': color, height: top + length }}>
      {type === 'actor' && (
        <svg viewBox="0 0 40 48" width="40" height="48" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="20" cy="9" r="7" />
          <path d="M20 16v16M6 23h28M20 32 9 46M20 32l11 14" />
        </svg>
      )}
      <div className="cv-life-head" style={type === 'actor' ? { border: 'none', background: 'none', padding: '2px 6px' } : { borderColor: color, marginTop: 40 }}>
        {data.title || (type === 'actor' ? 'Actor' : ':Object')}
      </div>
      <div className="cv-life-line" style={{ top, borderColor: color }} />
      {points.map((y) => (
        <Handle key={y} type="source" id={`y${y}`} position={Position.Right} style={{ top: y, left: '50%', right: 'auto', transform: 'translate(-50%, -50%)' }} />
      ))}
    </div>
  );
}

// ---------- planning and notes ----------

function TaskShape({ data, selected }) {
  const color = data.color || SHAPES.task.color;
  return (
    <div className={`cv-shape cv-task ${selected ? 'on' : ''}`} style={{ '--cv': color, borderLeft: `5px solid ${color}` }}>
      <div className="cv-title">{data.title || 'Work package'}</div>
      {lines(data.text).length > 0 && <div className="cv-text">{data.text}</div>}
      <Resize on={selected} />
      <Dots />
    </div>
  );
}

function NoteShape({ data, selected }) {
  const color = data.color || SHAPES.note.color;
  return (
    <div className={`cv-shape cv-note ${selected ? 'on' : ''}`} style={{ '--cv': color, background: `color-mix(in srgb, ${color} 16%, var(--panel))` }}>
      <div className="cv-text">{data.text || 'Write a note'}</div>
      <Resize on={selected} />
      <Dots />
    </div>
  );
}

// plain text typed straight on the canvas. double click it to edit,
// enter or clicking away saves, shift + enter makes a new line.
// text that is left empty is removed
function TextShape({ id, data, selected }) {
  const tools = useContext(CanvasTools);
  const editing = tools.editingId === id;
  const [draft, setDraft] = useState(data.text || '');

  const input = useRef();

  useEffect(() => {
    if (!editing) setDraft(data.text || '');
  }, [data.text, editing]);

  // put the cursor in the box. a new shape is hidden for a moment while
  // react flow measures it, so we wait a little before focusing
  useEffect(() => {
    if (!editing) return undefined;
    const timer = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [editing]);

  function finish() {
    tools.setEditingId(null);
    if (!draft.trim()) tools.removeShape(id);
    else if (draft !== data.text) tools.editShape(id, 'text', draft.trim());
  }

  function onKey(e) {
    e.stopPropagation(); // so typing does not delete or move shapes
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) e.currentTarget.blur();
  }

  const style = { color: data.color || 'var(--ink)', fontSize: Number(data.size) || 15 };
  return (
    <div className={`cv-free cv-plain ${selected ? 'on' : ''}`} style={style} onDoubleClick={() => tools.setEditingId(id)}>
      {editing ? (
        <textarea ref={input} rows={1} value={draft} placeholder="Type here" className="nodrag nopan nowheel"
          onChange={(e) => setDraft(e.target.value)} onBlur={finish} onKeyDown={onKey}
          onFocus={(e) => e.currentTarget.setSelectionRange(draft.length, draft.length)} />
      ) : (
        <div className="cv-text">{data.text || 'Text'}</div>
      )}
      <Dots />
    </div>
  );
}

// plain rectangle. filled it is a normal box, as an outline it is a frame
// with its text in the top left corner
function RectShape({ data, selected }) {
  const color = data.color || SHAPES.rect.color;
  const frame = data.fill === 'none';
  return (
    <div className={`cv-free cv-rect ${frame ? 'cv-frame' : ''} ${selected ? 'on' : ''}`} style={{ '--cv': color, borderColor: color }}>
      {data.text && <span style={frame ? { borderColor: color } : undefined}>{data.text}</span>}
      <Resize on={selected} minWidth={24} minHeight={24} />
      <Dots />
    </div>
  );
}

export const nodeTypes = {
  class: ClassShape,
  table: TableShape,
  start: StartShape,
  action: ActionShape,
  decision: DecisionShape,
  bar: BarShape,
  end: EndShape,
  actor: LifelineShape,
  lifeline: LifelineShape,
  task: TaskShape,
  note: NoteShape,
  rect: RectShape,
  text: TextShape,
};
