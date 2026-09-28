(function () {
  const cfg = window.__PENDANT__ || {};
  const robotId = cfg.nodeId;
  const slidersEl = document.getElementById('sliders');
  const statusEl = document.getElementById('status');
  const btnHome = document.getElementById('btn-home');
  const btnFreeze = document.getElementById('btn-freeze');
  const btnArm = document.getElementById('btn-arm');

  let metaJoints = [];
  let frozen = false;
  let manualArmed = true;
  let joints = {};
  let unit = cfg.unit || 'rad';
  let timer = null;
  let stepSize = 0.01;

  async function loadState() {
    const r = await fetch(`/robot-arm/api/${encodeURIComponent(robotId)}/state`);
    if (!r.ok) throw new Error('state ' + r.status);
    const data = await r.json();
    metaJoints = (data.jointsMeta || []).filter((j) => j.name !== 'finger_joint_right');
    unit = data.unit || unit;
    joints = Object.assign({}, data.joints || {});
    for (const j of metaJoints) {
      if (joints[j.name] == null) joints[j.name] = typeof j.home === 'number' ? j.home : 0;
    }
    render();
    updateButtons();
  }

  function render() {
    slidersEl.innerHTML = '';
    metaJoints.forEach((j) => {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = j.label || j.name;
      const input = document.createElement('input');
      input.type = 'range';
      let min = j.min != null ? j.min : -3.14;
      let max = j.max != null ? j.max : 3.14;
      let home = typeof j.home === 'number' ? j.home : 0;
      if (unit === 'deg' && j.unit !== 'm') {
        const f = 180 / Math.PI;
        min *= f; max *= f; home *= f;
      }
      input.min = min;
      input.max = max;
      input.step = j.unit === 'm' ? 0.001 : stepSize;
      const cur = joints[j.name] != null ? joints[j.name] : home;
      input.value = cur;
      const val = document.createElement('div');
      val.className = 'val';
      const fmt = (n) => Number(n).toFixed(j.unit === 'm' ? 3 : 3);
      val.textContent = fmt(input.value);
      input.addEventListener('input', () => {
        joints[j.name] = Number(input.value);
        val.textContent = fmt(input.value);
        scheduleSend();
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(val);
      slidersEl.appendChild(row);
    });
  }

  function updateButtons() {
    btnFreeze.textContent = frozen ? 'UNFREEZE' : 'Freeze';
    btnArm.textContent = manualArmed ? 'Armed' : 'Disarmed';
    btnArm.className = manualArmed ? 'armed' : 'disarmed';
    statusEl.textContent = frozen ? 'SOFT E-STOP (freeze) — UI only, not SIL' : 'Ready';
    statusEl.className = 'status' + (frozen ? ' frozen' : '');
  }

  async function send(extra) {
    const body = Object.assign({
      joints,
      unit,
      source: 'pendant',
      freeze: frozen,
      manualArmed
    }, extra || {});
    try {
      await fetch(`/robot-arm/api/${encodeURIComponent(robotId)}/joints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      statusEl.textContent = 'Send failed: ' + e.message;
    }
  }

  function scheduleSend() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      send();
    }, 50);
  }

  btnHome.addEventListener('click', () => {
    metaJoints.forEach((j) => {
      let home = typeof j.home === 'number' ? j.home : 0;
      if (unit === 'deg' && j.unit !== 'm') home = home * 180 / Math.PI;
      joints[j.name] = home;
    });
    render();
    send({ force: true });
  });

  btnFreeze.addEventListener('click', () => {
    frozen = !frozen;
    updateButtons();
    send({ freeze: frozen, force: true });
  });

  btnArm.addEventListener('click', () => {
    manualArmed = !manualArmed;
    updateButtons();
    send({ manualArmed, force: true });
  });

  loadState().catch((e) => {
    statusEl.textContent = 'Failed to load: ' + e.message;
  });
})();
