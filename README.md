# node-red-contrib-robot-arm

Node-RED palette package for a **robot arm** with URDF + Three.js visualization and an optional ROS2 rosbridge feed, plus a **teach-pendant controller**.

## Exactly two nodes

```
┌─────────────┐         ┌─────────────┐
│ controller  │────────▶│    robot    │──▶ joints / status
│  (pendant)  │         │  (URDF+3D)  │
└─────────────┘         └──────┬──────┘
                               │ optional
                               ▼
                        ROS2 rosbridge
                     (/joint_states, …)
```

| Palette node   | Role |
|----------------|------|
| **`robot`**    | Arm model (URDF), 3D view, input joints from flows / Function, built-in rosbridge subscribe |
| **`controller`** | Dashboard teach pendant: joint sliders, Home, soft Freeze, Arm/Disarm → canonical joint cmds |

There are **no** separate `robot-in`, `robot-out`, `robot-model`, `robot-ros2`, `robot-mux`, or `robot-ik` palette nodes in v1. Normalize + rosbridge live **inside** `robot`. Cartesian IK is reserved for a later controller mode; P0 is joint space.

## Install

```bash
cd ~/.node-red
npm install t-teja/node-red-contrib-robot-arm
```

Then restart Node-RED. Nodes appear under the **robotics** category.

## Quick start

1. Import an example (Menu → Import → select a file, or clipboard):
   - `node_modules/node-red-contrib-robot-arm/examples/01-inject-demo.json`
   - `…/examples/02-controller-to-robot.json`
   - `…/examples/03-rosbridge-live.json`
   - `…/examples/04-controller-and-ros2.json`
2. **Deploy**.
3. Click the **`robot`** node — status shows the 3D view path, e.g. `/robot-arm/view/<node-id>`.
4. Open that path on your Node-RED host (e.g. `http://localhost:1880/robot-arm/view/<id>`).
5. For the pendant, open the URL on the **`controller`** status: `/robot-arm/controller/<id>`.
6. Wire **controller → robot** (example 02).

Examples are also listed under `package.json` → `node-red.examples` when your Node-RED version surfaces them in the import UI.

## ROS2 / rosbridge

On the robot PC (or sim):

```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

On the **`robot`** node:

- Enable rosbridge
- URL: `ws://<robot-pc-host>:9090`
- Subscribe topic: `/joint_states` (`sensor_msgs/JointState`)
- Optional publish topic for outbound commands

**Priority (P0):** last-writer wins with a `source` tag. When the pendant sends with `source: "pendant"` and `manualArmed`, those updates are preferred over rosbridge for a short window (~2 s).

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
    "wrist_3_joint": 0,
    "finger_joint": 0
  },
  "unit": "rad",
  "source": "pendant",
  "ts": 1710000000000
}
```

Also accepted: ROS `JointState`-like `{ name, position }`, flat joint maps, or positional arrays.

## Safety

**NOT SIL-rated.** Simulation and soft UI only. Freeze / e-stop on the pendant is a **UI soft stop**, not a safety-rated emergency stop. Do not use this package as a functional-safety controller for real hardware.

## Model attribution

The bundled `models/ur5e-gripper` URDF uses **primitive geometries** (cylinder / box / sphere) sized like a UR-style 6-DOF arm + simple gripper so it renders **without external mesh files**.

Dimensions are approximate and **not** CAD-accurate Universal Robots or Robotiq assets. Real UR / Robotiq meshes can replace the `<visual>` blocks later; joint names follow common UR conventions where possible (`shoulder_pan_joint`, …, `wrist_3_joint`, `finger_joint`).

## License

MIT © 2026 Teja
