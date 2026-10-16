// Real topology code with synthetic ORM rows; no application startup, DB or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function load(relative) {
  const fixtureModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const requireFixture = name => {
    assert.equal(name, '@prisma/client', 'Unexpected dependency must not reach live I/O');
    return {
      PrismaClient: class { constructor() { throw new Error('A synthetic ORM must be injected'); } },
      Prisma: { sql: (strings, ...values) => ({ strings, values }) },
    };
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(requireFixture, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

const { getZoomConfig, filterNodesByZoom, filterEdgesByZoom } = load('lib/semanticZoom.ts');
const nodes = [
  { id: 'building', data: { alwaysVisible: true }, payload: { retained: true } },
  { id: 'floor', data: { hierarchyLevel: 'floor' } },
  { id: 'room', data: { hierarchyLevel: 'room' } },
  { id: 'rack', data: { hierarchyLevel: 'rack' } },
  { id: 'device', type: 'device', data: {} },
  { id: 'other', type: 'service', data: {} },
];
const edges = [
  { id: 'visible', source: 'building', target: 'other', metadata: { retained: true } },
  { id: 'hidden-target', source: 'building', target: 'device' },
  { id: 'hidden-source', source: 'device', target: 'building' },
];
for (const [zoom, ids] of [
  [0.5, ['building', 'other']],
  [0.8, ['building', 'floor', 'other']],
  [1.2, ['building', 'floor', 'room', 'other']],
  [1.5, ['building', 'floor', 'room', 'rack', 'other']],
  [1.6, ['building', 'floor', 'room', 'rack', 'device', 'other']],
]) {
  const visible = filterNodesByZoom(nodes, getZoomConfig(zoom));
  assert.deepEqual(visible.map(node => node.id), ids);
  assert.strictEqual(visible[0], nodes[0], 'Visibility must retain the original node and payload');
}
const visibleEdges = filterEdgesByZoom(edges, filterNodesByZoom(nodes, getZoomConfig(0.5)));
assert.deepEqual(visibleEdges.map(edge => edge.id), ['visible']);
assert.strictEqual(visibleEdges[0], edges[0], 'Filtering must retain edge metadata');
assert.deepEqual(filterEdgesByZoom(edges, []), []);

const { TopologyRelationshipEngine } = load('lib/topology/relationship-engine.ts');
const rows = [{
  id: 'link', sourceDeviceId: 'a', targetDeviceId: 'b', relationshipType: 'CONNECTS_TO', confidence: 0.95,
  sd_id: 'a', sd_name: 'Fixture A', sd_type: 'SWITCH', sd_status: 'ACTIVE', sd_metadata: { position: { x: 0, y: 42 } },
  td_id: 'b', td_name: 'Fixture B', td_type: 'SWITCH', td_status: 'INACTIVE', td_metadata: null,
}];
const queries = [], writes = [];
const engine = new TopologyRelationshipEngine({
  $queryRaw: async query => { queries.push(query); return [...rows, { ...rows[0], id: 'parallel' }, { ...rows[0], td_id: null }]; },
  device: {
    findMany: async () => [
      { id: 'a', metadata: { cdpNeighbors: [{ deviceId: 'b', localInterface: 'Gi1', remoteInterface: 'Gi2' }], lldpNeighbors: [{ deviceId: 'missing', localInterface: 'Gi3', remoteInterface: 'Gi4' }] } },
      { id: 'empty', metadata: null },
    ],
    findFirst: async ({ where }) => where.OR[0].id === 'b' ? { id: 'b' } : null,
  },
  relationship: { findFirst: async () => writes[0] || null, create: async ({ data }) => { writes.push(data); return data; } },
});
const graph = await engine.getTopologyGraph('fixture-org');
assert.deepEqual(queries[0].values, ['fixture-org', 'fixture-org'], 'Organization values must stay parameterized');
assert.equal(graph.nodes.length, 2, 'Repeated relationships must not duplicate nodes; incomplete joins are skipped');
assert.equal(graph.edges.length, 2);
assert.deepEqual(graph.nodes[0], { id: 'a', label: 'Fixture A', type: 'SWITCH', status: 'ACTIVE', x: 0, y: 42 });
assert.ok(Number.isFinite(graph.nodes[1].x) && Number.isFinite(graph.nodes[1].y));
assert.equal(graph.edges[0].label, 'connected to');
assert.equal(graph.edges[0].animated, true);
assert.deepEqual((await engine.getTopologyGraph()).nodes, graph.nodes, 'Fallback coordinates must remain stable');
assert.deepEqual(queries[1].values, []);
const first = await engine.correlateInterfaceConnections();
assert.equal(first.relationshipsCreated, 1);
assert.deepEqual(first.errors, []);
assert.deepEqual(writes[0], {
  sourceDeviceId: 'a', targetDeviceId: 'b', relationshipType: 'CONNECTS_TO', source: 'cdp', confidence: 0.9,
  properties: { localInterface: 'Gi1', remoteInterface: 'Gi2', protocol: 'CDP' },
});
assert.equal((await engine.correlateInterfaceConnections()).relationshipsCreated, 0, 'Repeated discovery must not insert another link');
assert.equal(writes.length, 1);
console.log('Topology contracts passed: zoom boundaries, payload identity, both edge endpoints, parameterized scope, stable positions, joined graph deduplication and idempotent discovery. Synthetic ORM only.');
