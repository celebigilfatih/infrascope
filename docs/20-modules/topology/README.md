# Topology Module

| File | Topic |
|---|---|
| `network-topology-guide.md` | Network topology guide |
| `network-groups.md` | Logical network groups, API, persistence and reviewed bootstrap |

## Browser regressions

`tests/incident-e2e/topology-overview.spec.ts` runs with the standard
`npm run test:incidents:regression` suite and its existing CI workflow. It uses
synthetic topology responses and isolated authentication fixtures; it does not
modify the installation's topology or database.

- Desktop and mobile: the visible **Tam ekran** button expands the map; the return
  button and Escape restore the normal layout without losing connections.
- Actual SVG paths, exact connection IDs and visible strokes protect physical,
  reverse/parallel and logical links against missing handle/rendering regressions.
- Cross-links start visible, can be hidden and restored, keep that choice through
  fullscreen transitions, and return to the visible default after reload.

The standard runner also checks this spec and the overview renderer/model with
strict ESLint. The focused report for the initial verification is stored under
`output/topology-overview-regression-20261020/`.

## Planned

- `README.md` — Topology module overview (React Flow, connections, switch views, semantic zoom)
