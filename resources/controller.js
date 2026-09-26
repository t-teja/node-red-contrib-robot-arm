(function () {
  const cfg = window.__PENDANT__ || {};
  const nodeId = cfg.nodeId;
  const slidersEl = document.getElementById('sliders');
  const statusEl = document.getElementById('status');
  const btnHome = document.getElementById('btn-home');
  const btnFreeze = document.getElementById('btn-freeze');
  const btnArm = document.getElementById('btn-arm');

  let meta = null;
  let frozen = false;
  let manualArmed = true;
  let joints = {};
  let timer = null;

  async function loadMeta() {
    const r = await fetch(`/robot-arm/api/controller/${encodeURIComponent(nodeId)}/meta`);
    if (!r.ok) throw new Error('meta ' + r.status);
    meta = await r.json();
    joints = Object.assign({}, meta.current || {});
    frozen = !!meta.frozen;
    manualArmed = meta.manualArmed !== false;
    render();
    updateButtons();
  }

  function render() {
    slidersEl.innerHTML = '';
    (meta.joints || []).forEach((j) => {
      if (j.name === 'finger_joint_right') return;
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = j.label || j.name;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = j.min;
      input.max = j.max;
      input.step = meta.stepSize || 0.01;
      input.value = joints[j.name] != null ? joints[j.name] : (j.home || 0);
      const val = document.createElement('div');
      val.className = 'val';
      const fmt = (n) => (j.unit === 'm' ? Number(n).toFixed(3) : Number(n).toFixed(3));
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
    statusEl.textContent = frozen ? 'SOFT E-STOP (freeze) — commands still tagged freeze' : 'Ready';
    statusEl.className = 'status' + (frozen ? ' frozen' : '');
  }

  async function send(extra) {
    const body = Object.assign({
      joints,
      freeze: frozen,
      manualArmed,
      force: !!(extra && extra.force)
    }, extra || {});
    try {
      await fetch(`/robot-arm/api/controller/${encodeURIComponent(nodeId)}/command`, {
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
    (meta.joints || []).forEach((j) => {
      joints[j.name] = typeof j.home === 'number' ? j.home : 0;
    });
    render();
    send({ home: true, force: true });
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

  loadMeta().catch((e) => {
    statusEl.textContent = 'Failed to load: ' + e.message;
  });
})();
