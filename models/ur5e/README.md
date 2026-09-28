# UR5e (vendored)

Browser-ready URDF + **visual** binary STL meshes for the Electronics Playground 6-DoF arm lab.

| Item | Value |
|------|--------|
| Model | Universal Robots UR5e |
| Source | [UniversalRobots/Universal_Robots_ROS2_Description](https://github.com/UniversalRobots/Universal_Robots_ROS2_Description) (rolling) |
| License | **BSD-3-Clause** (see `LICENSE`) |
| Meshes | Official **visual** DAE -> binary STL (thousands of tris/link; not collision proxies) |
| Joints | `shoulder_pan_joint` ... `wrist_3_joint` (same names as ros2_control) |

Regenerate locally: `npm run meshes` (needs `pip install trimesh pycollada numpy scipy fast_simplification`).

Kinematics match `config/ur5e/default_kinematics.yaml`. Visual offsets match `config/ur5e/visual_parameters.yaml`.
