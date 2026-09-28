# node-red-dashboard-2-robot-arm

Node-RED robotics package with a **realistic UR5e** (URDF + STL meshes), Three.js viewer, teach pendant, optional **ROS2 rosbridge**, and **FlowFuse Dashboard 2** widgets.

> **npm package name:** `node-red-dashboard-2-robot-arm`  
> **GitHub repo:** [t-teja/node-red-contrib-robot-arm](https://github.com/t-teja/node-red-contrib-robot-arm)  
> Install from git still works (see below).

## Nodes

| Palette node | Role |
|--------------|------|
| **`robot`** | URDF model, joint state, HTTP 3D view, optional rosbridge subscribe/publish |
| **`controller`** | Standalone teach-pendant HTTP UI → wire output into `robot` |
| **`ui-robot-arm`** | Dashboard 2 widget: 3D view bound to a `robot` node |
| **`ui-robot-controller`** | Dashboard 2 widget: pendant bound to the same `robot` node |

```
 Function / Inject / rosbridge          Dashboard 2 page
            │                           ┌─ ui-robot-arm ────────┐
            ▼                           │  iframe /view/:id     │
     ┌──────────────┐                   ├─ ui-robot-controller ─┤
     │    robot     │◀── HTTP pendant ──│  iframe /pendant/:id  │
     │ normalize +  │                   └───────────────────────┘
     │ RosbridgeClient
     └──────────────┘
```

Standalone HTTP pages remain available without Dashboard:

- `/robot-arm/view/<robot-node-id>`
- `/robot-arm/controller/<controller-node-id>` (wired controller node)
- `/robot-arm/pendant/<robot-node-id>` (robot-bound pendant used by D2)

## Install

```bash
cd ~/.node-red
npm install t-teja/node-red-contrib-robot-arm
```

That git URL installs this repo; the published **package name** is `node-red-dashboard-2-robot-arm` so Dashboard 2 can discover the widgets (`node-red-dashboard-2-` prefix).

For Dashboard widgets, also install:

```bash
npm install @flowfuse/node-red-dashboard
```

(`@flowfuse/node-red-dashboard` is an **optional** peer — the `robot` / `controller` nodes and HTTP pages work without it.)

Restart Node-RED after install.

## Quick start (HTTP)

1. Import `examples/01-inject-demo.json` (or 02–04).
2. **Deploy**.
3. Open the URL on the `robot` status: `/robot-arm/view/<id>`.
4. For a wired pendant, import example 02 and open `/robot-arm/controller/<ctrl-id>`.

## Quick start (Dashboard 2)

1. Install `@flowfuse/node-red-dashboard`.
2. Import `examples/05-dashboard2.json`.
3. Deploy, open the Dashboard **Robot Arm** page.
4. `ui-robot-arm` + `ui-robot-controller` both select the same `robot` node — one arm drives the view, pendant, and flow I/O.

## Models

| Preset | Description |
|--------|-------------|
| **`ur5e`** (default) | Connected UR5e STL meshes + official kinematics |
| **`ur5e-gripper`** | Same UR5e meshes + simple primitive gripper on `tool0` |

Meshes are served under `/robot-arm/models/ur5e/meshes/*.stl` (nested paths supported).

### Mesh attribution

UR5e visual meshes and kinematics are derived from
[UniversalRobots/Universal_Robots_ROS2_Description](https://github.com/UniversalRobots/Universal_Robots_ROS2_Description)
(**BSD-3-Clause**). See `models/ur5e/LICENSE` and `models/ur5e/README.md`.
The optional gripper on `ur5e-gripper` uses approximate box primitives (not Robotiq CAD).

## ROS2 / rosbridge

On the robot PC (or sim):

```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

On the **`robot`** node:

- Enable rosbridge
- URL: `ws://<robot-pc-host>:9090`
- Subscribe: `/joint_states` (`sensor_msgs/JointState`)
- Optional publish topic (auto-advertised) for outbound commands

**Honest limits:** this package needs a real rosbridge WebSocket (or compatible mock) at the configured URL. It is not a full ROS 2 client, does not speak DDS, and will not invent joint traffic without a publisher. Unit tests include a mock rosbridge WebSocket server.

**Priority:** last-writer wins with a `source` tag. Pendant/`manualArmed` briefly preferred over rosbridge (~2 s).

## Message shape

Canonical payload (input and output):

```json
{
  "robot": "robot",
  "joints": {
    "shoulder_pan_joint": 0,
    "shoulder_lift_joint": -1.57,
    "elbow_joint": 1.57,
    "wrist_1_joint": -1.57,
    "wrist_2_joint": -1.57,
    "wrist_3_joint": 0
  },
  "unit": "rad",
  "source": "pendant",
  "ts": 1710000000000
}
```

Also accepted: ROS `JointState`-like `{ name, position }`, flat joint maps, or positional arrays.

## Examples

| File | Purpose |
|------|---------|
| `01-inject-demo.json` | Inject Home / Reach / Wave → robot |
| `02-controller-to-robot.json` | Wired teach pendant → robot |
| `03-rosbridge-live.json` | Live `/joint_states` |
| `04-controller-and-ros2.json` | Pendant + rosbridge priority |
| `05-dashboard2.json` | ui-base / page / groups + both D2 widgets |

## Develop / test

```bash
npm install
npm test
npm run build   # rebuilds resources/robot-arm-widgets.umd.js (committed for users)
```

## Safety

**NOT SIL-rated.** Simulation and soft UI only. Freeze / e-stop on the pendant is a **UI soft stop**, not a safety-rated emergency stop. Do not use this package as a functional-safety controller for real hardware.

## License

MIT © 2026 Teja — with UR5e mesh/LICENSE under BSD-3-Clause (Universal Robots), see `models/ur5e/LICENSE`.
