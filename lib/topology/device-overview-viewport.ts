import type { Edge, Node } from 'reactflow';
import { OVERVIEW_DEVICE_HEIGHT, OVERVIEW_DEVICE_WIDTH, OVERVIEW_GROUP_SIZE } from './device-overview';

type Positions = Record<string, { x: number; y: number }>;
const COLUMN = 216, ROW = 160;
const largeGroup = (node: Node) => node.type === 'networkGroup' && !node.data.compactOverview;

export function deviceOverviewBounds(nodes: Node[], positions: Positions) {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...nodes.map(node => positions[node.id].x));
  const y = Math.min(...nodes.map(node => positions[node.id].y));
  return { x, y,
    width: Math.max(...nodes.map(node => positions[node.id].x + (largeGroup(node) ? OVERVIEW_GROUP_SIZE : OVERVIEW_DEVICE_WIDTH))) - x,
    height: Math.max(...nodes.map(node => positions[node.id].y + (node.data.overviewHeight || (largeGroup(node) ? OVERVIEW_GROUP_SIZE : OVERVIEW_DEVICE_HEIGHT)))) - y,
  };
}

/** Keep the hub central and pack its peers into the available screen shape. */
export function balancedDevicePositions(nodes: Node[], edges: Edge[], width: number, height: number, columnCount?: number): Positions {
  if (!nodes.length) return {};
  const devices = nodes.filter(node => node.type !== 'networkGroup');
  const groups = nodes.filter(node => node.type === 'networkGroup').sort((a, b) => a.id.localeCompare(b.id));
  const peers = new Map(devices.map(node => [node.id, new Set<string>()]));
  for (const edge of edges) if (edge.source !== edge.target && peers.has(edge.source) && peers.has(edge.target)) {
    peers.get(edge.source)!.add(edge.target); peers.get(edge.target)!.add(edge.source);
  }
  const compare = (a: string, b: string) => peers.get(b)!.size - peers.get(a)!.size || a.localeCompare(b);
  const ordered: string[] = [], seen = new Set<string>();
  for (const root of [...peers.keys()].sort(compare)) {
    if (seen.has(root)) continue;
    const queue = [root]; seen.add(root);
    for (let i = 0; i < queue.length; i++) {
      ordered.push(queue[i]);
      for (const id of [...peers.get(queue[i])!].sort(compare)) if (!seen.has(id)) { seen.add(id); queue.push(id); }
    }
  }
  let best: Positions = {}, bestScale = -1;
  const minimumColumns = groups.some(largeGroup) ? 2 : 1;
  const slotsNeeded = devices.length + groups.reduce((sum, group) => sum + (largeGroup(group) ? 4 : 1), 0);
  for (let columns = minimumColumns; columns <= Math.min(32, Math.max(minimumColumns, slotsNeeded)); columns++) {
    if (columnCount && columns !== columnCount) continue;
    const occupied = new Set<string>(), positions: Positions = {};
    let groupRows = 0;
    groups.forEach(node => {
      const span = largeGroup(node) ? 2 : 1;
      let column = columns - span, row = 0;
      const blocked = () => Array.from({ length: span }, (_, dx) => Array.from({ length: span }, (_, dy) => occupied.has(`${column + dx}:${row + dy}`))).flat().some(Boolean);
      while (blocked()) { if (--column < 0) { column = columns - span; row++; } }
      positions[node.id] = { x: column * COLUMN, y: row * ROW };
      for (let dx = 0; dx < span; dx++) for (let dy = 0; dy < span; dy++) occupied.add(`${column + dx}:${row + dy}`);
      groupRows = Math.max(groupRows, row + span);
    });
    const rows = Math.max(groupRows, Math.ceil(slotsNeeded / columns));
    const cells: { column: number; row: number }[] = [];
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      if (!occupied.has(`${column}:${row}`)) cells.push({ column, row });
    }
    const distance = (cell: typeof cells[number]) => ((cell.column - (columns - 1) / 2) * COLUMN) ** 2 + ((cell.row - (rows - 1) / 2) * ROW) ** 2;
    cells.sort((a, b) => distance(a) - distance(b) || a.row - b.row || a.column - b.column);
    ordered.forEach((id, index) => { positions[id] = { x: cells[index].column * COLUMN, y: cells[index].row * ROW }; });
    const bounds = deviceOverviewBounds(nodes, positions);
    const scale = Math.min(Math.max(40, width - 64) / Math.max(1, bounds.width), Math.max(40, height - 96) / Math.max(1, bounds.height));
    if (scale > bestScale) { bestScale = scale; best = positions; }
  }
  const bounds = deviceOverviewBounds(nodes, best);
  return Object.fromEntries(Object.entries(best).map(([id, point]) => [id, { x: point.x - bounds.x, y: point.y - bounds.y }]));
}

export function balancedDeviceViewport(nodes: Node[], positions: Positions, width: number, height: number) {
  if (!nodes.length) return { x: 0, y: 0, zoom: 1 };
  const bounds = deviceOverviewBounds(nodes, positions);
  const fullNames = nodes.some(node => node.data.overviewLabelLines);
  const padding = fullNames ? 72 : 96;
  const scale = Math.min(1.1, Math.max(40, width - 64) / Math.max(1, bounds.width), Math.max(40, height - padding) / Math.max(1, bounds.height));
  const zoom = Math.max(.05, scale);
  return {
    x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (fullNames ? 16 : 24) + (height - padding - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

/** Wrap without discarding text, including inventory names without word separators. */
function nameLines(name: string, width: number, measure: (text: string) => number) {
  const lines: string[] = [];
  let line = '';
  for (const word of name.trim().split(/\s+/)) {
    if (line && measure(`${line} ${word}`) <= width) { line += ` ${word}`; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const character of word) {
      if (line && measure(line + character) > width) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Size each row from its complete labels at the fitted 13px screen font. */
export function fullNameDeviceLayout(nodes: Node[], edges: Edge[], width: number, height: number, measure: (text: string) => number) {
  if (!nodes.length) return { nodes, positions: {} as Positions };
  const minimumColumns = nodes.some(largeGroup) ? 2 : 1;
  const slots = nodes.reduce((sum, node) => sum + (largeGroup(node) ? 4 : 1), 0);
  let best = { nodes, positions: {} as Positions }, bestScore = -1;
  for (let columns = minimumColumns; columns <= Math.min(32, Math.max(minimumColumns, slots)); columns++) {
    const cells = balancedDevicePositions(nodes, edges, width, height, columns);
    const bounds = deviceOverviewBounds(nodes, cells);
    const scale = Math.min(1.1, Math.max(40, width - 64) / bounds.width);
    const labelSize = Math.max(16, 13 / scale);
    const rowHeights: number[] = [];
    const sized = nodes.map(node => {
      const row = Math.round(cells[node.id].y / ROW);
      if (largeGroup(node)) {
        rowHeights[row] = Math.max(rowHeights[row] || 0, (OVERVIEW_GROUP_SIZE - 16) / 2);
        rowHeights[row + 1] = Math.max(rowHeights[row + 1] || 0, (OVERVIEW_GROUP_SIZE - 16) / 2);
        return node;
      }
      const compact = node.data.compactOverview;
      const lines = nameLines(String(node.type === 'networkGroup' ? node.data.group.name : node.data.name || ''), (OVERVIEW_DEVICE_WIDTH - 8) * 13 / labelSize, measure);
      const lineHeight = labelSize * (compact ? 1.1 : 1.2);
      const secondary = node.type === 'networkGroup' ? 8 + Math.max(14, 10 / scale) * 1.1 : compact ? 4 : 9 + 38;
      const overviewHeight = Math.ceil((compact ? 32 : 48) + lines.length * lineHeight + secondary + 4);
      rowHeights[row] = Math.max(rowHeights[row] || 0, overviewHeight);
      return { ...node, data: { ...node.data, overviewHeight, overviewLabelLines: lines, overviewLabelSize: labelSize } };
    });
    const rows: number[] = [];
    for (let row = 0; row < rowHeights.length; row++) rows[row] = row ? rows[row - 1] + (rowHeights[row - 1] || 0) + 16 : 0;
    const positions = Object.fromEntries(nodes.map(node => [node.id, { x: cells[node.id].x, y: rows[Math.round(cells[node.id].y / ROW)] }]));
    const fitted = balancedDeviceViewport(sized, positions, width, height);
    // Prefer layouts that preserve the readable font, then the largest icons.
    const ratio = Math.min(1, fitted.zoom / scale);
    const score = ratio >= .999 ? 10 + scale : ratio;
    if (score > bestScore) { bestScore = score; best = { nodes: sized, positions }; }
  }
  return best;
}

