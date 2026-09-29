# Architecture

## Palette nodes

1. **`robot-arm`** — arm model, normalize, rosbridge, HTTP view + pendant API  
2. **`robot-arm-controller`** — standalone teach pendant (HTTP) for non-Dashboard flows  
3. **`ui-ur5e-arm`** — Dashboard 2 3D view (iframe of `/robot-arm/view/:id`)  
4. **`ui-ur5e-controller`** — Dashboard 2 pendant (iframe of `/robot-arm/pendant/:id`)

npm package name is `@tteja/node-red-dashboard-2-robot-arm`. The scope satisfies the Flow Library naming rule for packages published after 2021, and the name still contains `node-red-dashboard-2-` so an existing Dashboard 2 install discovers the widgets. The GitHub repo stays `t-teja/node-red-contrib-robot-arm`.

## Data flow

```
 Function / Inject / rosbridge
            │
            ▼
     ┌──────────────┐     SSE/HTTP      ┌─────────────┐
     │  robot-arm   │──────────────────▶│  viewer.js  │
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

Built UMD: `resources/robot-arm-widgets.umd.js` (committed). Widgets bind to a `robot-arm` node id via config dropdown.

## Safety

NOT SIL. Soft UI freeze only.
