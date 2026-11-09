
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const status = $("connectionStatus");
  const statusPill = document.querySelector(".status-pill");
  const startButton = $("startButton");
  const driftButton = $("driftButton");
  const reportButton = $("reportButton");

  const TOTAL_BUTTONS = 17;
  const testedButtons = new Set();

  let activeIndex = null;
  let activeGamepad = null;
  let animationId = null;
  let lastSnapshot = null;
  let driftTimer = null;
  let driftSamples = [];

  const buttonNames = {
    0: "× / A", 1: "○ / B", 2: "□ / X", 3: "△ / Y",
    4: "L1 / LB", 5: "R1 / RB", 6: "L2 / LT", 7: "R2 / RT",
    8: "Share / Create", 9: "Options / Menu", 10: "L3", 11: "R3",
    12: "Cruceta arriba", 13: "Cruceta abajo",
    14: "Cruceta izquierda", 15: "Cruceta derecha",
    16: "PS / Home"
  };

  const circularity = {
    left: { active: false, points: [], result: null },
    right: { active: false, points: [], result: null }
  };

  const stickConfig = {
    left: {
      xAxis: 0, yAxis: 1,
      canvas: "leftCanvas",
      button: "leftCircularityButton",
      result: "leftCircularityResult"
    },
    right: {
      xAxis: 2, yAxis: 3,
      canvas: "rightCanvas",
      button: "rightCircularityButton",
      result: "rightCircularityResult"
    }
  };

  function updateCounter() {
    const count = testedButtons.size;
    $("buttonCount").textContent = `${count} / ${TOTAL_BUTTONS}`;
    $("summaryButtons").textContent = String(count);
  }

  function resetTestedButtons() {
    testedButtons.clear();
    document.querySelectorAll(".test-button").forEach(el => {
      el.classList.remove("active", "tested");
    });
    updateCounter();
  }

  function shorten(value) {
    return value.length > 38 ? value.slice(0, 35) + "…" : value;
  }

  function getAvailablePad() {
    if (!navigator.getGamepads) return null;

    const pads = navigator.getGamepads();

    if (activeIndex !== null && pads[activeIndex]) {
      return pads[activeIndex];
    }

    for (const pad of pads) {
      if (pad) return pad;
    }

    return null;
  }

  function setConnected(gamepad) {
    if (!gamepad) return;

    activeIndex = gamepad.index;
    activeGamepad = gamepad;

    status.textContent = "Control conectado";
    statusPill.classList.add("connected");

    $("connectHelp").textContent = gamepad.id || "Control detectado";
    $("summaryController").textContent = shorten(gamepad.id || "Gamepad");
    $("summaryAxes").textContent = String(gamepad.axes.length);
    $("testState").textContent = "CONECTADO";

    driftButton.disabled = false;
    reportButton.disabled = false;

    $("leftCircularityButton").disabled = false;
    $("rightCircularityButton").disabled = false;

    startButton.textContent = "Control detectado";
    startButton.disabled = true;

    if (animationId === null) loop();
  }

  function disconnect() {
    activeIndex = null;
    activeGamepad = null;

    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;

    status.textContent = "Sin control conectado";
    statusPill.classList.remove("connected");

    $("summaryController").textContent = "No detectado";
    $("summaryAxes").textContent = "—";
    $("testState").textContent = "PENDIENTE";

    startButton.disabled = false;
    startButton.textContent = "Comenzar prueba";

    driftButton.disabled = true;
    reportButton.disabled = true;

    $("leftCircularityButton").disabled = true;
    $("rightCircularityButton").disabled = true;

    resetTestedButtons();

    updateStick("leftDot", 0, 0);
    updateStick("rightDot", 0, 0);

    $("leftCoords").textContent = "X 0.00 · Y 0.00";
    $("rightCoords").textContent = "X 0.00 · Y 0.00";

    $("l2Meter").style.width = "0%";
    $("r2Meter").style.width = "0%";
    $("l2Value").textContent = "0%";
    $("r2Value").textContent = "0%";

    $("driftResult").textContent = "Esperando medición.";

    lastSnapshot = null;
    driftTimer = null;
    driftSamples = [];

    resetCircularity("left");
    resetCircularity("right");
  }

  function currentPad() {
    return getAvailablePad();
  }

  function loop() {
    const pad = currentPad();

    if (!pad) {
      disconnect();
      return;
    }

    activeGamepad = pad;

    pad.buttons.forEach((button, index) => {
      const el = document.querySelector(`[data-button="${index}"]`);
      const pressed = button.pressed || button.value > 0.5;

      if (el) {
        if (pressed && index < TOTAL_BUTTONS) {
          testedButtons.add(index);
          el.classList.add("tested");
        }
        el.classList.toggle("active", pressed);
      }

      if (index === 6 || index === 7) {
        const pct = Math.round(button.value * 100);
        const side = index === 6 ? "l2" : "r2";
        $(side + "Meter").style.width = pct + "%";
        $(side + "Value").textContent = pct + "%";
      }
    });

    updateCounter();

    const x0 = pad.axes[0] ?? 0;
    const y0 = pad.axes[1] ?? 0;
    const x1 = pad.axes[2] ?? 0;
    const y1 = pad.axes[3] ?? 0;

    $("leftCoords").textContent = `X ${x0.toFixed(2)} · Y ${y0.toFixed(2)}`;
    $("rightCoords").textContent = `X ${x1.toFixed(2)} · Y ${y1.toFixed(2)}`;

    updateStick("leftDot", x0, y0);
    updateStick("rightDot", x1, y1);

    if (circularity.left.active) {
      circularity.left.points.push({ x: x0, y: y0 });
      drawCircularity("left");
    }

    if (circularity.right.active) {
      circularity.right.points.push({ x: x1, y: y1 });
      drawCircularity("right");
    }

    lastSnapshot = {
      id: pad.id,
      buttons: pad.buttons.map((b, i) => ({
        index: i,
        name: buttonNames[i] || `Botón ${i}`,
        value: Number(b.value.toFixed(3)),
        pressed: b.pressed,
        tested: testedButtons.has(i)
      })),
      testedCount: testedButtons.size,
      axes: Array.from(pad.axes).map(v => Number(v.toFixed(3))),
      circularity: {
        left: circularity.left.result,
        right: circularity.right.result
      }
    };

    if (driftTimer) driftSamples.push({ x0, y0, x1, y1 });

    animationId = requestAnimationFrame(loop);
  }

  function updateStick(id, x, y) {
    const px = 50 + Math.max(-1, Math.min(1, x)) * 43;
    const py = 50 + Math.max(-1, Math.min(1, y)) * 43;
    $(id).style.left = px + "%";
    $(id).style.top = py + "%";
  }

  // TEST DE CIRCULARIDAD

  function startCircularity(side) {
    const test = circularity[side];
    const pad = getAvailablePad();

    if (!pad) {
      $(stickConfig[side].result).textContent =
        "No se detecta el control. Presioná un botón del mando y volvé a intentar.";
      return;
    }

    setConnected(pad);

    test.active = true;
    test.points = [];
    test.result = null;

    $(stickConfig[side].button).textContent = "Finalizar test";
    $(stickConfig[side].result).textContent =
      "Prueba en curso. Girá el stick por todo el borde.";

    drawCircularity(side);
  }

  function finishCircularity(side) {
    const test = circularity[side];
    if (!test.active) return;

    test.active = false;
    test.result = calculateCircularity(test.points);

    $(stickConfig[side].button).textContent = "Repetir test";

    if (!test.result.valid) {
      $(stickConfig[side].result).textContent = test.result.message;
    } else {
      $(stickConfig[side].result).textContent =
        `Circularidad: ${test.result.score}% · Cobertura: ${test.result.coverage}%`;
    }

    drawCircularity(side);
  }

  function resetCircularity(side) {
    const test = circularity[side];
    test.active = false;
    test.points = [];
    test.result = null;

    $(stickConfig[side].button).textContent = "Iniciar test";
    $(stickConfig[side].result).textContent = "Circularidad pendiente.";

    drawCircularity(side);
  }

  function calculateCircularity(points) {
    const sectors = new Array(36).fill(null);
    let maxRadius = 0;
    let validPoints = 0;

    points.forEach(point => {
      const radius = Math.sqrt(point.x * point.x + point.y * point.y);
      if (radius < 0.50) return;

      validPoints++;

      let degrees = Math.atan2(-point.y, point.x) * 180 / Math.PI;
      if (degrees < 0) degrees += 360;

      const sector = Math.floor(degrees / 10);

      if (sectors[sector] === null || radius > sectors[sector]) {
        sectors[sector] = radius;
      }

      if (radius > maxRadius) maxRadius = radius;
    });

    const covered = sectors.filter(value => value !== null);
    const coverage = Math.round(covered.length / 36 * 100);

    if (validPoints < 100 || coverage < 70) {
      return {
        valid: false,
        coverage,
        message: `Cobertura insuficiente (${coverage}%). Girá el stick más ampliamente por todo el borde.`
      };
    }

    const minRadius = Math.min(...covered);
    const maxCoveredRadius = Math.max(...covered);

    if (maxCoveredRadius <= 0) {
      return { valid: false, coverage, message: "No se pudo calcular la circularidad." };
    }

    return {
      valid: true,
      score: Math.round(minRadius / maxCoveredRadius * 100),
      coverage,
      samples: validPoints
    };
  }

  function drawCircularity(side) {
    const canvas = $(stickConfig[side].canvas);
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    const test = circularity[side];
    if (test.points.length < 2) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.43;

    ctx.beginPath();

    test.points.forEach((point, index) => {
      const px = centerX + point.x * radius;
      const py = centerY + point.y * radius;

      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });

    ctx.strokeStyle = test.active ? "#18d7e8" : "#64f59a";
    ctx.lineWidth = Math.max(2, dpr * 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 7 * dpr;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  $("leftCircularityButton").addEventListener("click", () => {
    if (circularity.left.active) finishCircularity("left");
    else startCircularity("left");
  });

  $("rightCircularityButton").addEventListener("click", () => {
    if (circularity.right.active) finishCircularity("right");
    else startCircularity("right");
  });

  // CONEXIÓN

  startButton.addEventListener("click", () => {
    if (!("getGamepads" in navigator)) {
      $("connectHelp").textContent =
        "Este navegador no ofrece Gamepad API. Probá Chrome o Edge actualizado.";
      return;
    }

    $("connectHelp").textContent =
      "Conectá el control y presioná cualquier botón.";

    const pad = currentPad();
    if (pad) setConnected(pad);
  });

  window.addEventListener("gamepadconnected", event => setConnected(event.gamepad));

  window.addEventListener("gamepaddisconnected", event => {
    if (event.gamepad.index === activeIndex) disconnect();
  });

  // DRIFT

  driftButton.addEventListener("click", () => {
    if (driftTimer) return;

    driftSamples = [];
    driftButton.disabled = true;
    $("driftResult").textContent = "Midiendo durante 5 segundos… No toques los sticks.";

    const started = performance.now();
    driftTimer = true;

    const finish = () => {
      driftTimer = null;
      driftButton.disabled = false;

      if (!driftSamples.length) {
        $("driftResult").textContent = "No se recibieron datos suficientes.";
        return;
      }

      const max = key => Math.max(...driftSamples.map(s => Math.abs(s[key])));
      const values = { x0: max("x0"), y0: max("y0"), x1: max("x1"), y1: max("y1") };
      const peak = Math.max(...Object.values(values));

      const label = peak < 0.08
        ? "Centrado estable en esta medición"
        : peak < 0.18
          ? "Movimiento leve detectado: conviene repetir"
          : "Desviación importante detectada: requiere revisión";

      $("driftResult").textContent =
        `${label}. Desviación máxima: ${peak.toFixed(3)}.`;

      $("testState").textContent = peak < 0.08 ? "CENTRADO ESTABLE" : "REVISAR STICKS";

      if (lastSnapshot) {
        lastSnapshot.drift = {
          peak: Number(peak.toFixed(3)),
          axes: values,
          result: label
        };
      }
    };

    const check = () => {
      if (!driftTimer) return;
      if (performance.now() - started >= 5000) finish();
      else setTimeout(check, 100);
    };

    setTimeout(check, 100);
  });

  // INFORME TXT

  reportButton.addEventListener("click", () => {
    if (!lastSnapshot) return;

    const lines = [
      "BUCEONET VIDEOJUEGOS - INFORME DE TESTER",
      `Fecha: ${new Date().toLocaleString("es-UY")}`,
      `Control: ${lastSnapshot.id}`,
      `Botones probados: ${testedButtons.size} / ${TOTAL_BUTTONS}`,
      "",
      "BOTONES:"
    ];

    lastSnapshot.buttons.forEach(b => {
      lines.push(`${b.name}: ${b.tested ? "PROBADO" : "NO PROBADO"} | ${b.pressed ? "PRESIONADO" : "sin pulsar"} (valor ${b.value})`);
    });

    lines.push("", "EJES:", ...lastSnapshot.axes.map((v, i) => `Eje ${i}: ${v}`));
    lines.push("", "TEST DE CIRCULARIDAD:");

    ["left", "right"].forEach(side => {
      const result = circularity[side].result;
      const name = side === "left" ? "Stick izquierdo" : "Stick derecho";

      if (!result) lines.push(`${name}: NO REALIZADO`);
      else if (!result.valid) lines.push(`${name}: ${result.message}`);
      else lines.push(`${name}: ${result.score}% de circularidad`, `Cobertura: ${result.coverage}%`, `Muestras: ${result.samples}`);
    });

    if (lastSnapshot.drift) {
      lines.push("", "PRUEBA DE CENTRADO:", lastSnapshot.drift.result,
        `Desviación máxima: ${lastSnapshot.drift.peak}`);
    }

    lines.push("", "Nota: resultado orientativo basado en señales recibidas por el navegador. No reemplaza una revisión técnica.");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "informe-buceonet-tester.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // WHATSAPP

  $("whatsappButton").addEventListener("click", () => {
    const message = encodeURIComponent(
      "Hola Buceonet, probé mi control con el Tester y quisiera consultar por una revisión."
    );
    window.open(`https://wa.me/59899525777?text=${message}`, "_blank");
  });

  if (!window.isSecureContext && location.hostname !== "localhost") {
    $("connectHelp").textContent =
      "Para detectar controles, publicá esta página en HTTPS y usá un navegador compatible.";
  }
})();
