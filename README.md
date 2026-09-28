# node-red-dashboard-2-robot-arm

A Node-RED robot-arm node for a **UR5e**: a 3D view of the real URDF meshes, a teach pendant, and optional ROS 2 joint feedback. On a Dashboard 2 page the arm and the pendant sit side by side. You can also drive the arm from Inject or Function nodes without a dashboard.

Palette name: `node-red-dashboard-2-robot-arm`. The `dashboard-2` part is required so an existing Dashboard 2 install will show the arm and pendant on the page. Guide: https://github.com/t-teja/node-red-contrib-robot-arm#readme

## Add it in Node-RED

1. Open the editor menu → **Manage palette** → **Install**.
2. Search for `node-red-dashboard-2-robot-arm` and install it.
3. For the on-page 3D view and pendant, also install **@flowfuse/node-red-dashboard** (Dashboard 2) if it is not already there.
4. Restart Node-RED if the new nodes do not appear. They show up under **robotics**, and the two dashboard widgets under **dashboard**.

The `robot` and `controller` nodes work without Dashboard 2. The `ui-robot-arm` and `ui-robot-controller` widgets need it.

## The four nodes

| Node | What you use it for |
|------|---------------------|
| **robot** | The arm. Holds the UR5e model, accepts joint commands, and publishes the current joint state. |
| **controller** | A teach pendant on its own page. Wire its output into **robot**. |
| **ui-robot-arm** | Dashboard 2 widget. Shows the 3D arm for a **robot** node you pick. |
| **ui-robot-controller** | Dashboard 2 widget. Pendant for that same **robot** node. No extra wire is required. |

```
 Inject / Function / rosbridge          Dashboard 2 page
            │                           ┌─ ui-robot-arm ────────┐
            ▼                           │       3D view         │
     ┌──────────────┐                   ├─ ui-robot-controller ─┤
     │    robot     │◀── pendant ───────│    joint sliders      │
     └──────────────┘                   └───────────────────────┘
```

On **robot**, choose the model:

| Preset | What you get |
|--------|----------------|
| **ur5e** | UR5e arm, official-style meshes. This is the default. |
| **ur5e-gripper** | The same arm plus a simple two-finger gripper on the tool. |

## Use it on a dashboard

This is the layout in example **05 Dashboard 2**.

1. Import that example (see [Examples](#examples) below).
2. Deploy.
3. Open the Dashboard page **Robot Arm**. With a normal Dashboard 2 install that is `http://<your-node-red-host>:1880/dashboard/robot`.
4. The left panel is the 3D arm. The right panel is the pendant.

The base stays in the middle of the 3D panel, and the zoom fits the panel. You can orbit around the base. The pendant sliders, **Home**, and **Freeze** move that same arm.

If you already have a dashboard, you do not have to import the whole example. Add a **robot** node, then add **ui-robot-arm** and **ui-robot-controller** to a page and, in each widget, select that robot node.

**Freeze** is a soft stop in the UI. It is not a hardware emergency stop. See [Safety](#safety).

## Use it from a flow

Drop a **robot** node on a tab and deploy. Anything you send to its input becomes the next joint command, and the output is the joint state after that command.

The node status shows a 3D view path, `/robot-arm/view/<robot-node-id>`. Open that on the Node-RED host to see the arm without Dashboard 2.

A separate **controller** node is the same pendant on its own page. Wire **controller → robot**, deploy, and open the controller URL shown on that node (`/robot-arm/controller/<id>`). Example **02** is this wiring.

## Examples

After the package is installed, the examples are in the editor:

**Menu → Import → Examples → node-red-dashboard-2-robot-arm**

Import one, then deploy.

| Example | What to do with it |
|---------|-------------------|
| **01 Inject demo** | Three Inject nodes: Home, Reach, and Wave. Click one and the arm moves. A debug node shows the joint state coming out of **robot**. |
| **02 Controller to robot** | Pendant wired into the arm. Open the controller URL on the **controller** node and move the sliders. |
| **03 Rosbridge live** | **robot** with rosbridge turned on, subscribed to `/joint_states`. Use this when a ROS 2 robot or simulator is publishing joint states. |
| **04 Controller and ROS 2** | Pendant and rosbridge together. While the pendant is armed, its commands win for about 2 seconds over incoming `/joint_states`. Disarm the pendant to let ROS drive the view. |
| **05 Dashboard 2** | A Dashboard page named **Robot Arm** with the 3D view and the pendant bound to one **robot** node. Start here if you want the arm on a dashboard. |

## Messages

Send any of these on the **robot** input. The output is always the canonical object below.

Canonical command and state:

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

Also accepted: a ROS `JointState` style `{ "name": [...], "position": [...] }`, a flat map of joint name to number, or an array of numbers in the joint order above.

### Why slider limits are 6.28 and 3.14

The pendant uses **radians**. A full circle is 2 × π ≈ **6.2832 rad = 360°**. Half a circle is π ≈ **3.1416 rad = 180°**.

| Joints | Slider range | Meaning |
|--------|----------------|---------|
| Base, Shoulder, Wrist 1, Wrist 2, Wrist 3 | −6.2832 … 6.2832 | One full turn either side of zero (±360°) |
| Elbow | −3.1416 … 3.1416 | Half a turn either side of zero (±180°) |

These are the UR5e joint limits from the model, not an arbitrary slider size. **Home** on the pendant returns each joint to its home angle (straight-up style pose: shoulder −1.57 rad, elbow 1.57 rad, and so on). The number beside each slider is the current angle in radians.

## ROS 2

Optional. On the robot PC or simulator:

```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

On the **robot** node, enable rosbridge and set:

- URL: `ws://<robot-pc>:9090`
- Subscribe topic: `/joint_states` (`sensor_msgs/JointState`)
- Publish topic: optional. When set, commands leaving this node are published there.

This node talks to rosbridge over WebSocket. It does not speak DDS itself. Nothing moves unless something publishes `/joint_states` or you send a command from the pendant or a flow.

When the pendant is armed, its updates are preferred over rosbridge for about 2 seconds. After that, the latest message wins.

## Safety

**Not SIL-rated.** This is a viewer and a soft teach pendant. **Freeze** only stops commands inside this UI. Do not use it as the emergency stop or safety controller for a real arm.

## License

MIT © 2026 Teja.

The UR5e meshes are BSD-3-Clause, Copyright Universal Robots A/S, from [UniversalRobots/Universal_Robots_ROS2_Description](https://github.com/UniversalRobots/Universal_Robots_ROS2_Description). See `models/ur5e/LICENSE`. The gripper in the `ur5e-gripper` preset is a simple box model, not a Robotiq CAD model.
