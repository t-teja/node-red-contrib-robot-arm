# Architecture

## Palette nodes

1. **`robot`** — arm model, normalize, rosbridge, HTTP view + pendant API  
2. **`controller`** — standalone teach pendant (HTTP) for non-Dashboard flows  
3. **`ui-robot-arm`** — Dashboard 2 3D view (iframe of `/robot-arm/view/:id`)  
4. **`ui-robot-controller`** — Dashboard 2 pendant (iframe of `/robot-arm/pendant/:id`)

npm package name is `node-red-dashboard-2-robot-arm` so an existing Dashboard 2 install discovers the widgets. The GitHub repo stays `t-teja/node-red-contrib-robot-arm`.

## Data flow

```
 Function / Inject / rosbridge
            │
            ▼
     ┌──────────────┐     SSE/HTTP      ┌─────────────┐
     │    robot     │──────────────────▶│  viewer.js  │
     │ RobotRuntime │                   │  URDF+STL   │
     │ RosbridgeClient                  └─────────────┘
     └──────▲───────┘
            │ POST /api/:id/joints
     ┌──────┴───────┐                   ┌─────────────┐
     │   pendant    │                   │ D2 widgets  │
     │  (or ctrl)   │                   │  (iframes)  │
     └──────────────┘                   └─────────────┘
```

## Models

- `models/ur5e/` — UR5e URDF + `meshes/*.stl` (BSD-3-Clause)  
- `models/ur5e-gripper/` — same meshes + primitive gripper on `tool0`

HTTP serves nested paths: `/robot-arm/models/:preset/*` (e.g. `meshes/base.stl`).

## Libraries

| File | Role |
|------|------|
| `lib/normalize.js` | Payload → canonical joints |
| `lib/rosbridge.js` | WS client: subscribe / advertise / publish |
| `lib/robot-runtime.js` | State + applyCommand + publish hook (unit-tested) |

## Dashboard 2

Built UMD: `resources/robot-arm-widgets.umd.js` (committed). Widgets bind to a `robot` node id via config dropdown.

## Safety

NOT SIL. Soft UI freeze only.
