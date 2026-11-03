// Entirely synthetic: six access chains, an extra branch and two cycle links.
const buildings = Array.from({ length: 32 }, (_, i) => ({ id: `readable-${String(i).padStart(2, '0')}`, name: i === 0 ? 'TEST · Merkez' : `TEST · Bina ${String(i).padStart(2, '0')}`, organizationId: 'test-org', floors: [] }));
const pairs = [];
for (let branch = 0; branch < 6; branch++) for (let hop = 0; hop < 5; hop++) pairs.push([hop ? branch * 5 + hop : 0, branch * 5 + hop + 1]);
pairs.push([0, 31], [5, 10], [20, 25]);
const links = pairs.map(([a, b], i) => ({ id: `readable-link-${i}`, sourceBuildingId: buildings[a].id, destBuildingId: buildings[b].id, sourceBuilding: buildings[a], destBuilding: buildings[b], connectionType: 'FIBER_SINGLE_MODE', status: 'UNKNOWN', bandwidth: null, recordingMethod: 'MANUAL' }));
module.exports = { buildings, links };
