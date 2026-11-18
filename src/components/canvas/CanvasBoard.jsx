// canvas for drawing class diagrams, database tables, activity diagrams,
// sequence diagrams, a work breakdown structure and notes.
// there are two of them: one on every group project (shared with the
// members) and one on the individual page (only for that student).
//
// a canvas is saved as json: { nodes: [...], edges: [...] }.
// it goes through update() in store/db.js like the kanban board, so other
// tabs get the change straight away. every change only touches the shape
// or line that was edited, so two members editing different shapes don't
// overwrite each other. later the backend can send the same small changes
// over the websocket (or use a crdt library like yjs).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel, ViewportPortal, ConnectionMode, applyNodeChanges, applyEdgeChanges, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './canvas.css';
import Icon from '../common/Icon';
import { toast } from '../common/ui';
import { addText, readText } from '../../lib/pngData';
import { useDB, update, logTeam, logPersonal, userById, displayName } from '../../store/db';
import { uid, firstName, fmtShort } from '../../lib/format';
import { colById, TAG_COLORS } from '../../lib/constants';
import { GROUPS, SHAPES, SHAPE_COLORS, LINES, LineEnds, CanvasTools, drawLine, toFlowNode, nodeTypes } from './shapes';

const EMPTY = { nodes: [], edges: [] };
const DRAG_TYPE = 'application/unisync-shape';
const PNG_KEY = 'unisync-canvas'; // name the canvas is saved under inside a downloaded picture

// light or dark, follows the theme button
function useTheme() {
  const read = () => document.documentElement.dataset.theme || 'light';
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const watcher = new MutationObserver(() => setTheme(read()));
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watcher.disconnect();
  }, []);
  return theme;
}

// canvas of a group project. every member sees and edits the same one
export default function CanvasBoard({ me, project }) {
  const users = useDB((d) => d.users);

  const change = (edit) => update((db) => {
    const p = db.projects.find((x) => x.id === project.id);
    if (!p) return;
    p.canvas = p.canvas || { nodes: [], edges: [] };
    edit(p.canvas, db);
  });

  // for the work breakdown: project -> category -> tasks
  const breakdown = () => ({
    title: project.name,
    branches: [...new Set(project.tasks.map((t) => t.tag))].map((tag) => ({
      title: tag,
      color: TAG_COLORS[tag] || '#64748b',
      items: project.tasks.filter((t) => t.tag === tag).map((t) => ({
        title: t.title,
        text: `${firstName(displayName(userById({ users }, t.assignee)))} · ${colById(t.col).name}`,
      })),
    })),
  });

  return (
    <ReactFlowProvider>
      <Canvas saved={project.canvas || EMPTY} change={change} log={(db, text) => logTeam(db, project.id, me, text)}
        breakdown={project.tasks.length ? breakdown : null} name={project.name} shared />
    </ReactFlowProvider>
  );
}

// my own canvas on the individual page. saved under my user id, nobody else sees it
export function PersonalCanvas({ me }) {
  const saved = useDB((d) => d.canvas?.[me]) || EMPTY;
  const modules = useDB((d) => d.modules[me]) || [];
  const tasks = useDB((d) => d.solo[me]) || [];

  const change = (edit) => update((db) => {
    db.canvas = db.canvas || {};
    db.canvas[me] = db.canvas[me] || { nodes: [], edges: [] };
    edit(db.canvas[me], db);
  });

  // for the work breakdown: my coursework -> module -> tasks
  const breakdown = () => ({
    title: 'My coursework',
    branches: modules
      .map((m) => ({
        title: `${m.code} · ${m.name}`,
        color: m.color,
        items: tasks.filter((t) => t.mod === m.id).map((t) => ({ title: t.title, text: `${fmtShort(t.due)} · ${colById(t.status).name}` })),
      }))
      .filter((branch) => branch.items.length),
  });

  return (
    <ReactFlowProvider>
      <Canvas saved={saved} change={change} log={(db, text) => logPersonal(db, me, text)}
        breakdown={tasks.length ? breakdown : null} name="my-canvas" />
    </ReactFlowProvider>
  );
}

// the shapes that were copied with cmd or ctrl + C. kept outside the
// component so a copy can be pasted on another canvas too
let clipboard = null;

// saved = the canvas json, change(edit) = edit the saved canvas,
// log(db, text) = add a line to the activity feed,
// breakdown() = the tree for the "Tasks to WBS" button (or null),
// shared = true when other people see this canvas too
function Canvas({ saved, change, log, breakdown, name, shared }) {
  const savedText = JSON.stringify(saved);
  const [nodes, setNodes] = useState(() => saved.nodes.map(toFlowNode));
  const [edges, setEdges] = useState(() => saved.edges.map(drawLine));
  const [picked, setPicked] = useState(null); // { kind: 'node' or 'edge', id }
  const [editingId, setEditingId] = useState(null); // text shape being typed in
  const [saving, setSaving] = useState(false); // true while the picture is being made
  const [group, setGroup] = useState('structure'); // which shapes the toolbar shows
  const [lineKind, setLineKind] = useState('association'); // kind used for new lines
  const dragging = useRef(false); // true while i drag or resize a shape
  const sizes = useRef({}); // shape id -> size while it is being resized
  const moves = useRef({}); // shape id -> last position react flow told us
  const box = useRef();
  const flow = useReactFlow();
  const theme = useTheme();

  // the saved canvas changed (by me or by a group member in another tab).
  // keep what react flow knows about each shape (size, selected) and take
  // the new position and text. skipped while i'm dragging so shapes don't jump
  useEffect(() => {
    if (dragging.current) return;
    setNodes((old) => saved.nodes.map((n) => {
      const before = old.find((o) => o.id === n.id);
      return before ? { ...before, ...toFlowNode(n) } : toFlowNode(n);
    }));
    setEdges((old) => saved.edges.map((e) => ({ ...drawLine(e), selected: old.find((o) => o.id === e.id)?.selected })));
  }, [savedText]);

  // ---------- shapes ----------

  function addShape(type, position) {
    let at = position;
    if (!at) {
      // middle of what is on screen, moved a little each time so they don't stack
      const r = box.current.getBoundingClientRect();
      const middle = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      const step = (saved.nodes.length % 6) * 36;
      at = { x: middle.x - 90 + step, y: middle.y - 60 + step };
    }
    const node = { id: uid('n'), type, position: { x: Math.round(at.x), y: Math.round(at.y) }, data: { ...SHAPES[type].data } };
    change((canvas, db) => {
      canvas.nodes.push(node);
      if (type !== 'text') log(db, `added a **${SHAPES[type].label}** to the canvas`);
    });
    if (type === 'text') setEditingId(node.id); // start typing straight away
  }

  // double click on an empty part of the canvas adds plain text there
  function doubleClick(e) {
    if (!e.target.classList.contains('react-flow__pane')) return;
    const at = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addShape('text', { x: at.x - 4, y: at.y - 12 });
  }

  // remove a shape without asking (used for text that was left empty)
  const dropShapeById = (id) => change((canvas) => {
    canvas.nodes = canvas.nodes.filter((n) => n.id !== id);
    canvas.edges = canvas.edges.filter((e) => e.source !== id && e.target !== id);
  });

  // a shape dragged from the toolbar and dropped on the canvas
  function dropShape(e) {
    const type = e.dataTransfer.getData(DRAG_TYPE);
    if (!SHAPES[type]) return;
    e.preventDefault();
    addShape(type, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }

  function savePositions(moved) {
    dragging.current = false;
    change((canvas) => {
      moved.forEach((n) => {
        const node = canvas.nodes.find((x) => x.id === n.id);
        if (node) node.position = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      });
    });
  }

  // react flow tells us about every small change here (select, move, resize).
  // a shape is resized by dragging its corners. while that happens we only
  // remember the new size, and save it once when the mouse is released
  function onNodes(changes) {
    setNodes((list) => applyNodeChanges(changes, list));

    changes.forEach((c) => {
      if (c.type !== 'dimensions' || !c.resizing || !c.dimensions) return;
      if (!sizes.current[c.id]) delete moves.current[c.id]; // resize just started
      dragging.current = true;
      sizes.current[c.id] = c.dimensions;
    });
    changes.forEach((c) => {
      if (c.type === 'position' && c.position) moves.current[c.id] = c.position;
    });

    const done = changes.filter((c) => c.type === 'dimensions' && c.resizing === false && sizes.current[c.id]);
    if (!done.length) return;
    dragging.current = false;
    change((canvas) => {
      done.forEach((c) => {
        const node = canvas.nodes.find((n) => n.id === c.id);
        const size = sizes.current[c.id];
        const at = moves.current[c.id]; // dragging the top or left side also moves the shape
        if (node) {
          node.width = Math.round(size.width);
          node.height = Math.round(size.height);
          if (at) node.position = { x: Math.round(at.x), y: Math.round(at.y) };
        }
        delete sizes.current[c.id];
      });
    });
  }

  // back to the size the shape had when it was added
  const resetSize = (id) => change((canvas) => {
    const node = canvas.nodes.find((n) => n.id === id);
    if (node) {
      delete node.width;
      delete node.height;
    }
  });

  function removeShapes(removed) {
    const ids = new Set(removed.map((n) => n.id));
    change((canvas, db) => {
      canvas.nodes = canvas.nodes.filter((n) => !ids.has(n.id));
      canvas.edges = canvas.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target));
      log(db, `removed ${ids.size === 1 ? 'a shape' : `${ids.size} shapes`} from the canvas`);
    });
  }

  // ---------- copy, paste and duplicate ----------

  // puts copies of the shapes on the canvas, a bit down and to the right.
  // lines are copied too when the shapes on both ends are copied
  function addCopies(shapes, lines, shift) {
    if (!shapes.length) return;
    const newId = {};
    const copies = shapes.map((n) => {
      newId[n.id] = uid('n');
      return { ...structuredClone(n), id: newId[n.id], position: { x: n.position.x + shift, y: n.position.y + shift } };
    });
    const newLines = lines
      .filter((e) => newId[e.source] && newId[e.target])
      .map((e) => ({ ...structuredClone(e), id: uid('l'), source: newId[e.source], target: newId[e.target] }));

    change((canvas, db) => {
      canvas.nodes.push(...copies);
      canvas.edges.push(...newLines);
      log(db, `copied ${copies.length === 1 ? 'a shape' : `${copies.length} shapes`} on the canvas`);
    });
    // select the copies, so they can be moved or copied again straight away
    setTimeout(() => setNodes((list) => list.map((n) => ({ ...n, selected: !!copies.find((c) => c.id === n.id) }))), 60);
  }

  // cmd or ctrl + C, V and D
  useEffect(() => {
    function onKey(e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (!['c', 'v', 'd'].includes(key)) return;
      // typing in a box: leave the normal copy and paste of text alone
      const el = e.target;
      if (editingId || el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (!box.current || !box.current.offsetParent) return; // the canvas is not on screen

      const chosen = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
      const shapes = saved.nodes.filter((n) => chosen.has(n.id));

      if (key === 'd') {
        e.preventDefault(); // the browser uses this key for a bookmark
        addCopies(shapes, saved.edges, 30);
      } else if (key === 'c' && shapes.length) {
        if (window.getSelection()?.toString()) return; // some text on the page is selected, copy that
        clipboard = { shapes: structuredClone(shapes), lines: structuredClone(saved.edges), times: 0 };
      } else if (key === 'v' && clipboard) {
        e.preventDefault();
        clipboard.times += 1; // every paste goes a bit further so they don't stack
        addCopies(clipboard.shapes, clipboard.lines, 30 * clipboard.times);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nodes, savedText, editingId]);

  const editShape = (id, key, value) => change((canvas) => {
    const node = canvas.nodes.find((n) => n.id === id);
    if (node) node.data[key] = value;
  });

  // ---------- lines ----------

  function connect(link) {
    if (link.source === link.target) return;
    change((canvas) => {
      canvas.edges.push({ id: uid('l'), source: link.source, target: link.target, sourceHandle: link.sourceHandle, targetHandle: link.targetHandle, data: { kind: lineKind } });
    });
  }

  function removeLines(removed) {
    const ids = new Set(removed.map((e) => e.id));
    change((canvas) => {
      canvas.edges = canvas.edges.filter((e) => !ids.has(e.id));
    });
  }

  // patch = { kind } or { text }
  const editLine = (id, patch) => change((canvas) => {
    const edge = canvas.edges.find((e) => e.id === id);
    if (edge) edge.data = { ...edge.data, ...patch };
  });

  // switching the diagram type also picks the line that diagram normally uses
  function pickGroup(key) {
    setGroup(key);
    setLineKind(GROUPS[key].line);
  }

  // the line kinds as dropdown options, grouped by diagram type
  const lineOptions = Object.entries(GROUPS).map(([key, g]) => (
    <optgroup key={key} label={g.label}>
      {Object.entries(LINES).filter(([, kind]) => kind.group === key).map(([id, kind]) => <option key={id} value={id}>{kind.label}</option>)}
    </optgroup>
  ));

  // ---------- toolbar actions ----------

  // makes a work breakdown structure from the tasks on the board:
  // title -> branches -> items. it is placed to the right of what is there
  function buildBreakdown() {
    const tree = breakdown();
    const left = saved.nodes.length ? Math.max(...saved.nodes.map((n) => n.position.x)) + 340 : 0;
    const newNodes = [];
    const newEdges = [];
    const put = (x, y, title, text, color) => {
      const node = { id: uid('n'), type: 'task', position: { x, y }, data: { title, text, color } };
      newNodes.push(node);
      return node;
    };
    const line = (source, target, sourceHandle, targetHandle) => newEdges.push({ id: uid('l'), source, target, sourceHandle, targetHandle, data: { kind: 'plain' } });

    const root = put(left + ((tree.branches.length - 1) * 250) / 2, 0, tree.title, '', '#4f46e5');
    tree.branches.forEach((branch, i) => {
      const head = put(left + i * 250, 150, branch.title, '', branch.color);
      line(root.id, head.id, 'b', 't');
      branch.items.forEach((item, row) => {
        const leaf = put(left + i * 250 + 26, 280 + row * 124, item.title, item.text, branch.color);
        line(head.id, leaf.id, 'l', 'l');
      });
    });

    change((canvas, db) => {
      canvas.nodes.push(...newNodes);
      canvas.edges.push(...newEdges);
      log(db, 'built a **work breakdown** on the canvas from the board tasks');
    });
    setTimeout(() => flow.fitView({ padding: 0.15, duration: 300 }), 120);
  }

  // downloads the canvas as a png picture. the shapes and lines are also
  // saved inside the picture (see lib/pngData.js), so the same file can be
  // opened again later with "Open file" and edited
  async function download() {
    setSaving(true);
    try {
      // nothing should look selected in the picture
      setEditingId(null);
      setNodes((list) => list.map((n) => ({ ...n, selected: false })));
      setEdges((list) => list.map((e) => ({ ...e, selected: false })));
      await new Promise((done) => setTimeout(done, 80));

      // the picture is as big as the diagram, not as big as the screen
      const { toPng } = await import('html-to-image');
      const area = flow.getNodesBounds(flow.getNodes());
      const edge = 40;
      const width = Math.ceil(area.width + edge * 2);
      const height = Math.ceil(area.height + edge * 2);
      const url = await toPng(box.current.querySelector('.react-flow__viewport'), {
        backgroundColor: getComputedStyle(box.current).getPropertyValue('--soft').trim() || '#ffffff',
        width,
        height,
        pixelRatio: Math.min(2, 6000 / Math.max(width, height)), // sharp, but not huge
        filter: (el) => !el.classList?.contains('react-flow__handle') && !el.classList?.contains('react-flow__resize-control'),
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${edge - area.x}px, ${edge - area.y}px) scale(1)` },
      });

      const picture = Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0));
      const file = new Blob([addText(picture, PNG_KEY, JSON.stringify(saved))], { type: 'image/png' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-canvas.png';
      link.click();
      URL.revokeObjectURL(link.href);
      toast({ icon: 'download', title: 'Canvas downloaded', text: 'Keep this PNG. You can open it here again later to keep editing.' });
    } catch (err) {
      console.error(err);
      toast({ icon: 'alert', title: 'Could not make the picture', text: err.message || 'Please try again.' });
    }
    setSaving(false);
  }

  // opens a picture that was downloaded from the canvas (or an old .json
  // download) and puts its shapes back so they can be edited
  async function openFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    let found = null;
    try {
      const text = /\.json$/i.test(file.name) ? await file.text() : readText(new Uint8Array(await file.arrayBuffer()), PNG_KEY);
      found = text && JSON.parse(text);
    } catch (err) {
      console.warn('could not read', file.name, err);
    }
    if (!found || !Array.isArray(found.nodes)) {
      toast({ icon: 'alert', title: 'This picture cannot be edited', ms: 9000, text: 'Only a PNG downloaded from the UniSync canvas can be opened again. Screenshots, and pictures sent through chat apps, lose the saved diagram.' });
      return;
    }

    // only keep what we understand, and give everything a new id so the
    // file can be added next to shapes that are already on the canvas
    const ids = {};
    const good = found.nodes.filter((n) => SHAPES[n.type] && Number.isFinite(n.position?.x) && Number.isFinite(n.position?.y));
    const minX = Math.min(...good.map((n) => n.position.x));
    const shift = saved.nodes.length && good.length ? Math.max(...saved.nodes.map((n) => n.position.x)) + 340 - minX : 0;
    const newNodes = good.map((n) => {
      ids[n.id] = uid('n');
      const node = { id: ids[n.id], type: n.type, position: { x: Math.round(n.position.x + shift), y: Math.round(n.position.y) }, data: { ...SHAPES[n.type].data, ...(n.data || {}) } };
      if (Number.isFinite(n.width) && Number.isFinite(n.height)) Object.assign(node, { width: n.width, height: n.height });
      return node;
    });
    const newEdges = (found.edges || [])
      .filter((l) => ids[l.source] && ids[l.target])
      .map((l) => ({ id: uid('l'), source: ids[l.source], target: ids[l.target], sourceHandle: l.sourceHandle || null, targetHandle: l.targetHandle || null, data: { kind: LINES[l.data?.kind] ? l.data.kind : 'plain', text: l.data?.text || '' } }));

    if (!newNodes.length) {
      toast({ icon: 'alert', title: 'Nothing to open', text: 'This file has an empty canvas saved in it.' });
      return;
    }
    change((canvas, db) => {
      canvas.nodes.push(...newNodes);
      canvas.edges.push(...newEdges);
      log(db, `opened **${file.name}** on the canvas`);
    });
    toast({ icon: 'upload', title: `${newNodes.length} shapes opened`, text: shift ? 'They were added to the right of what was already on the canvas.' : 'You can keep editing them.' });
    setTimeout(() => flow.fitView({ padding: 0.15, duration: 300 }), 120);
  }

  function clearAll() {
    if (!confirm(shared ? 'Remove everything from the canvas for the whole group?' : 'Remove everything from your canvas?')) return;
    change((canvas, db) => {
      canvas.nodes = [];
      canvas.edges = [];
      log(db, 'cleared the canvas');
    });
    setPicked(null);
  }

  // react flow needs this function to stay the same between renders
  const onSelect = useCallback(({ nodes: n, edges: e }) => {
    if (n[0]) setPicked({ kind: 'node', id: n[0].id });
    else if (e[0]) setPicked({ kind: 'edge', id: e[0].id });
    else setPicked(null);
  }, []);

  const pickedNode = picked?.kind === 'node' && saved.nodes.find((n) => n.id === picked.id);
  const pickedLine = picked?.kind === 'edge' && saved.edges.find((e) => e.id === picked.id);
  const toolButton = 'btn w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] font-bold text-left';

  return (
    <div ref={box} className="card overflow-hidden relative h-[calc(100vh-250px)] min-h-[520px]"
      onDragOver={(e) => e.preventDefault()} onDrop={dropShape} onDoubleClick={doubleClick}>
      <CanvasTools.Provider value={{ editingId, setEditingId, editShape, removeShape: dropShapeById }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={theme}
        connectionMode={ConnectionMode.Loose}
        connectionLineType="smoothstep"
        onNodesChange={onNodes}
        onEdgesChange={(changes) => setEdges((list) => applyEdgeChanges(changes, list))}
        onNodeDragStart={() => { dragging.current = true; }}
        onNodeDragStop={(e, node, moved) => savePositions(moved)}
        onSelectionDragStart={() => { dragging.current = true; }}
        onSelectionDragStop={(e, moved) => savePositions(moved)}
        onConnect={connect}
        onNodesDelete={removeShapes}
        onEdgesDelete={removeLines}
        onSelectionChange={onSelect}
        deleteKeyCode={['Backspace', 'Delete']}
        zoomOnDoubleClick={false}
        snapToGrid
        snapGrid={[10, 10]}
        minZoom={0.2}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      >
        <Background gap={20} size={1.2} />
        {/* inside the viewport so the dot line ends are in the downloaded picture too */}
        <ViewportPortal><LineEnds /></ViewportPortal>
        <Controls position="bottom-left" />
        <MiniMap pannable zoomable position="bottom-right" className="hidden md:block" nodeColor={(n) => n.data.color || SHAPES[n.type]?.color || '#94a3b8'} />

        {/* toolbar: click a shape to add it, or drag it onto the canvas */}
        <Panel position="top-left">
          <div className="card p-1.5 w-[52px] sm:w-[178px] max-h-[calc(100vh-290px)] min-h-[300px] overflow-y-auto">
            <div className="hidden sm:block px-2 pt-1 pb-1 text-[10.5px] font-bold muted">DIAGRAM</div>
            <select value={group} onChange={(e) => pickGroup(e.target.value)} title="Which shapes to show" aria-label="Diagram type"
              className="w-full px-1 sm:px-2 py-1.5 mb-1.5 rounded-lg border line text-[12px] font-semibold outline-none" style={{ background: 'var(--field)', color: 'var(--ink)' }}>
              {Object.entries(GROUPS).map(([key, g]) => <option key={key} value={key}>{g.label}</option>)}
            </select>
            {Object.entries(SHAPES).filter(([, shape]) => shape.group === group || shape.group === 'all').map(([type, shape]) => (
              <button key={type} draggable title={`Add ${shape.label.toLowerCase()}`}
                onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, type)}
                onClick={() => addShape(type)} className={`${toolButton} hover:bg-slate-50`}>
                <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0 text-white" style={{ background: shape.color }}><Icon name={shape.icon} size={15} /></span>
                <span className="hidden sm:inline">{shape.label}</span>
              </button>
            ))}

            <div className="border-t line my-1.5" />
            <div className="hidden sm:block px-2 pb-1 text-[10.5px] font-bold muted">NEW LINES ARE</div>
            <select value={lineKind} onChange={(e) => setLineKind(e.target.value)} title="Kind of line used when you connect two shapes"
              className="hidden sm:block w-full px-2 py-1.5 rounded-lg border line text-[12px] font-semibold outline-none" style={{ background: 'var(--field)', color: 'var(--ink)' }}>
              {lineOptions}
            </select>

            <div className="border-t line my-1.5" />
            <button onClick={buildBreakdown} disabled={!breakdown} title="Build a work breakdown from the board tasks" className={`${toolButton} hover:bg-slate-50 disabled:opacity-40`}>
              <Icon name="tree" size={16} className="mx-1.5 text-indigo-600" /><span className="hidden sm:inline">Tasks to WBS</span>
            </button>
            <button onClick={download} disabled={!saved.nodes.length || saving} title="Download the canvas as a PNG picture that can be opened here again" className={`${toolButton} hover:bg-slate-50 disabled:opacity-40`}>
              <Icon name="download" size={16} className="mx-1.5 text-indigo-600" /><span className="hidden sm:inline">{saving ? 'Saving…' : 'Download PNG'}</span>
            </button>
            <label title="Open a PNG that was downloaded from the canvas and keep editing it" className={`${toolButton} hover:bg-slate-50 cursor-pointer`}>
              <Icon name="upload" size={16} className="mx-1.5 text-indigo-600" /><span className="hidden sm:inline">Open file</span>
              <input type="file" accept=".png,.json,image/png,application/json" className="hidden" onChange={openFile} />
            </label>
            <button onClick={clearAll} disabled={!saved.nodes.length} title="Clear the canvas" className={`${toolButton} hover:bg-rose-50 disabled:opacity-40`}>
              <Icon name="trash" size={16} className="mx-1.5 text-rose-500" /><span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </Panel>

        {/* side panel for the selected shape or line */}
        {(pickedNode || pickedLine) && (
          <Panel position="top-right">
            <div className="card p-3.5 w-[min(250px,calc(100vw-110px))] max-h-[500px] overflow-y-auto">
              {pickedNode && (
                <>
                  <div className="text-[13px] font-extrabold mb-2.5">{SHAPES[pickedNode.type].label}</div>
                  <div className="space-y-2.5">
                    {!SHAPES[pickedNode.type].fields.length && <p className="text-[12px] muted">Nothing to edit on this shape. Drag from its dots to connect it.</p>}
                    {SHAPES[pickedNode.type].fields.map(([key, label, kind, options]) => (
                      <div key={key}>
                        <label className="lbl" style={{ fontSize: 10.5 }}>{label}</label>
                        {kind === 'choice' ? (
                          <select value={String(pickedNode.data[key] ?? options[0][0])} className="field field-sm mt-1"
                            onChange={(e) => editShape(pickedNode.id, key, typeof options[0][0] === 'number' ? Number(e.target.value) : e.target.value)}>
                            {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                          </select>
                        ) : kind === 'lines' ? (
                          <textarea rows={4} value={pickedNode.data[key] || ''} onChange={(e) => editShape(pickedNode.id, key, e.target.value)}
                            className="field field-sm mt-1 resize-y" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                        ) : (
                          <input value={pickedNode.data[key] || ''} onChange={(e) => editShape(pickedNode.id, key, e.target.value)} className="field field-sm mt-1" />
                        )}
                      </div>
                    ))}
                    {!SHAPES[pickedNode.type].noColor && <div>
                      <div className="lbl" style={{ fontSize: 10.5 }}>COLOUR</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {SHAPE_COLORS.map((color) => {
                          const on = (pickedNode.data.color || SHAPES[pickedNode.type].color) === color;
                          return (
                            <button key={color} onClick={() => editShape(pickedNode.id, 'color', color)} aria-label={`Colour ${color}`}
                              className="w-6 h-6 rounded-full" style={{ background: color, outline: on ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }} />
                          );
                        })}
                      </div>
                    </div>}
                  </div>
                  {SHAPES[pickedNode.type].w && (
                    <div className="mt-3 flex items-center gap-2 text-[11.5px] muted">
                      <span className="flex-1">Drag a corner of the shape to change its size.</span>
                      {pickedNode.width && <button onClick={() => resetSize(pickedNode.id)} className="btn font-bold text-indigo-600 whitespace-nowrap">Reset size</button>}
                    </div>
                  )}
                  <button onClick={() => flow.deleteElements({ nodes: [{ id: pickedNode.id }] })}
                    className="btn mt-3.5 w-full py-2 rounded-lg border line text-[12.5px] font-bold text-rose-600 hover:bg-rose-50">Delete shape</button>
                </>
              )}

              {pickedLine && (
                <>
                  <div className="text-[13px] font-extrabold mb-2.5">Line</div>
                  <label className="lbl" style={{ fontSize: 10.5 }}>KIND</label>
                  <select value={pickedLine.data?.kind || 'association'} onChange={(e) => editLine(pickedLine.id, { kind: e.target.value })} className="field field-sm mt-1">
                    {lineOptions}
                  </select>
                  <label className="lbl block mt-2.5" style={{ fontSize: 10.5 }}>TEXT ON THE LINE</label>
                  <input value={pickedLine.data?.text || ''} onChange={(e) => editLine(pickedLine.id, { text: e.target.value })}
                    placeholder={LINES[pickedLine.data?.kind]?.text || 'e.g. login() or [yes]'} className="field field-sm mt-1" />
                  <button onClick={() => flow.deleteElements({ edges: [{ id: pickedLine.id }] })}
                    className="btn mt-3.5 w-full py-2 rounded-lg border line text-[12.5px] font-bold text-rose-600 hover:bg-rose-50">Delete line</button>
                </>
              )}
            </div>
          </Panel>
        )}
      </ReactFlow>
      </CanvasTools.Provider>

      {!saved.nodes.length && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none px-20">
          <div className="text-center max-w-[340px]">
            <div className="font-extrabold text-[16px]">Empty canvas</div>
            <p className="text-[13px] muted mt-1.5">Pick a diagram type in the toolbar and add shapes. Double click anywhere to type plain text. Drag from the dot on one shape to another to connect them. {shared ? 'Everyone in the group sees the changes live.' : 'Only you can see this canvas.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
