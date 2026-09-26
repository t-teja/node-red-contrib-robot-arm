# Architecture — two-node design

## Product shape (locked)

Exactly **two** palette nodes:

1. **`robot`** — the arm
2. **`controller`** — the teach pendant

Everything else is a library, HTTP resource, or config field — not a separate palette node.

## Data flow

```
 Function / Inject / rosbridge
            │
            ▼
     ┌──────────────┐     HTTP SSE      ┌─────────────┐
     │    robot     │──────────────────▶│  viewer.js  │
     │ normalize()  │                   │  Three.js   │
     │ RosbridgeClient                  │  URDF       │
     └──────▲───────┘                   └─────────────┘
            │ msg.payload
     ┌──────┴───────┐     HTTP POST     ┌─────────────┐
     │  controller  │◀──────────────────│ pendant UI  │
     │  rate-limit  │                   │  sliders    │
     └──────────────┘                   └─────────────┘
```

## `robot` responsibilities

| Concern | Where |
|---------|--------|
| Joint normalize | `lib/normalize.js` (folded into robot) |
| Rosbridge WS | `lib/rosbridge.js` (folded into robot) |
| URDF preset | `models/ur5e-gripper/` |
| 3D view | `resources/viewer.*` via `RED.httpNode` `/robot-arm/view/:id` |
| Flow I/O | 1 input (commands), 1 output (state) |

Config on the node: model preset, unit, optional rosbridge URL + topics.

## `controller` responsibilities

| Concern | Where |
|---------|--------|
| Joint slider UI | `resources/controller.*` via `/robot-arm/controller/:id` |
| Home / Freeze / Arm | emitted as payload flags |
| Canonical cmds | `{ joints, unit, source: "pendant", manualArmed, freeze }` |

## Priority policy (P0)

- Every update carries `source`: `pendant` | `rosbridge` | `inject` | `input` | …
- Simple **last-writer** merge into `robot` state
- If `manualArmed` and recent pendant traffic (< 2 s), **ignore** rosbridge writes

## Explicitly not palette nodes (v1)

- `robot-in` / `robot-out` — folded into `robot` input/output
- `robot-model` — preset + URDF path on `robot`
- `robot-ros2` — rosbridge options on `robot`
- `robot-mux` — merge policy inside `robot`
- `robot-ik` — future lib for controller Cartesian mode

## Dashboard 2

P0 ships a **self-contained HTTP viewer/pendant** so starters work without `@flowfuse/node-red-dashboard`. Status text on each node shows the URL. A native Dashboard 2 ui-widget can wrap the same pages later.
