
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
    0: "× / A",
    1: "○ / B",
    2: "□ / X",
    3: "△ / Y",
    4: "L1 / LB",
    5: "R1 / RB",
    6: "L2 / LT",
    7: "R2 / RT",
    8: "Share / Create",
    9: "Options / Menu",
    10: "L3",
    11: "R3",
    12: "Cruceta arriba",
    13: "Cruceta abajo",
    14: "Cruceta izquierda",
    15: "Cruceta derecha",
    16: "PS / Home"
  };

  function updateCounter() {
    const count = testedButtons.size;

    $("buttonCount").textContent =
      `${count} / ${TOTAL_BUTTONS}`;

    $("summaryButtons").textContent = String(count);
  }

  function resetTestedButtons() {
    testedButtons.clear();

    document.querySelectorAll(".test-button").forEach(el => {
      el.classList.remove("active", "tested");
    });

    updateCounter();
  }

  function setConnected(gamepad) {
    activeIndex = gamepad.index;
    activeGamepad = gamepad;

    status.textContent = "Control conectado";
    statusPill.classList.add("connected");

    $("connectHelp").textContent =
      gamepad.id || "Control detectado por el navegador";

    $("summaryController").textContent =
      shorten(gamepad.id || "Gamepad");

    $("summaryAxes").textContent =
      String(gamepad.axes.length);

    $("testState").textContent = "CONECTADO";

    driftButton.disabled = false;
    reportButton.disabled = false;

    startButton.textContent = "Control detectado";
    startButton.disabled = true;

    if (animationId === null) {
      loop();
    }
  }

  function shorten(value) {
    return value.length > 38
      ? value.slice(0, 35) + "…"
      : value;
  }

  function disconnect() {
    activeIndex = null;
    activeGamepad = null;

    if (animationId !== null) {
      cancelAnimationFrame(animationId);
    }

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
  }

  function currentPad() {
    const pads = navigator.getGamepads
      ? navigator.getGamepads()
      : [];

    if (activeIndex !== null && pads[activeIndex]) {
      return pads[activeIndex];
    }

    for (const pad of pads) {
      if (pad) return pad;
    }

    return null;
  }

  function loop() {
    const pad = currentPad();

    if (!pad) {
      disconnect();
      return;
    }

    activeGamepad = pad;

    pad.buttons.forEach((button, index) => {
      const el = document.querySelector(
        `[data-button="${index}"]`
      );

      const pressed =
        button.pressed || button.value > 0.5;

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

    $("leftCoords").textContent =
      `X ${x0.toFixed(2)} · Y ${y0.toFixed(2)}`;

    $("rightCoords").textContent =
      `X ${x1.toFixed(2)} · Y ${y1.toFixed(2)}`;

    updateStick("leftDot", x0, y0);
    updateStick("rightDot", x1, y1);

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

      axes: Array.from(pad.axes).map(
        v => Number(v.toFixed(3))
      )
    };

    if (driftTimer) {
      driftSamples.push({ x0, y0, x1, y1 });
    }

    animationId = requestAnimationFrame(loop);
  }

  function updateStick(id, x, y) {
    const limit = 1;

    const px =
      50 + Math.max(-limit, Math.min(limit, x)) * 43;

    const py =
      50 + Math.max(-limit, Math.min(limit, y)) * 43;

    $(id).style.left = px + "%";
    $(id).style.top = py + "%";
  }

  startButton.addEventListener("click", () => {
    if (!("getGamepads" in navigator)) {
      $("connectHelp").textContent =
        "Este navegador no ofrece Gamepad API. Probá con Chrome o Edge actualizado en una conexión HTTPS.";
      return;
    }

    $("connectHelp").textContent =
      "Ahora conectá el control y presioná cualquier botón. Si ya estaba conectado, presioná un botón nuevamente.";

    const pad = currentPad();

    if (pad) {
      setConnected(pad);
    }
  });

  window.addEventListener("gamepadconnected", event => {
    setConnected(event.gamepad);
  });

  window.addEventListener("gamepaddisconnected", event => {
    if (event.gamepad.index === activeIndex) {
      disconnect();
    }
  });

  driftButton.addEventListener("click", () => {
    if (driftTimer) return;

    driftSamples = [];
    driftButton.disabled = true;

    $("driftResult").textContent =
      "Midiendo durante 5 segundos… No toques los sticks.";

    const started = performance.now();
    driftTimer = true;

    const finish = () => {
      driftTimer = null;
      driftButton.disabled = false;

      if (!driftSamples.length) {
        $("driftResult").textContent =
          "No se recibieron datos suficientes. Repetí la prueba.";
        return;
      }

      const max = key =>
        Math.max(
          ...driftSamples.map(s => Math.abs(s[key]))
        );

      const values = {
        x0: max("x0"),
        y0: max("y0"),
        x1: max("x1"),
        y1: max("y1")
      };

      const peak = Math.max(
        ...Object.values(values)
      );

      const label =
        peak < 0.08
          ? "Centrado estable en esta medición"
          : peak < 0.18
            ? "Movimiento leve detectado: conviene repetir"
            : "Desviación importante detectada: requiere revisión";

      $("driftResult").textContent =
        `${label}. Desviación máxima: ${peak.toFixed(3)}.`;

      $("testState").textContent =
        peak < 0.08
          ? "CENTRADO ESTABLE"
          : "REVISAR STICKS";

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

      if (performance.now() - started >= 5000) {
        finish();
      } else {
        setTimeout(check, 100);
      }
    };

    setTimeout(check, 100);
  });

  reportButton.addEventListener("click", () => {
    if (!lastSnapshot) return;

    const date = new Date().toLocaleString("es-UY");

    const lines = [
      "BUCEONET VIDEOJUEGOS - INFORME DE TESTER",
      `Fecha: ${date}`,
      `Control: ${lastSnapshot.id}`,
      `Botones probados: ${testedButtons.size} / ${TOTAL_BUTTONS}`,
      "",
      "BOTONES:"
    ];

    lastSnapshot.buttons.forEach(b => {
      lines.push(
        `${b.name}: ${b.tested ? "PROBADO" : "NO PROBADO"} | ` +
        `${b.pressed ? "PRESIONADO" : "sin pulsar"} ` +
        `(valor ${b.value})`
      );
    });

    lines.push(
      "",
      "EJES:",
      ...lastSnapshot.axes.map(
        (v, i) => `Eje ${i}: ${v}`
      )
    );

    if (lastSnapshot.drift) {
      lines.push(
        "",
        "PRUEBA DE CENTRADO:",
        lastSnapshot.drift.result,
        `Desviación máxima: ${lastSnapshot.drift.peak}`
      );
    }

    lines.push(
      "",
      "Nota: resultado orientativo basado en señales recibidas por el navegador. No reemplaza una revisión técnica."
    );

    const blob = new Blob(
      [lines.join("\n")],
      { type: "text/plain;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "informe-buceonet-tester.txt";
    a.click();

    URL.revokeObjectURL(url);
  });

  $("whatsappButton").addEventListener("click", () => {
    const phone = "59899525777";

    const message = encodeURIComponent(
      "Hola Buceonet, probé mi control con el Tester y quisiera consultar por una revisión."
    );

    window.open(
      `https://wa.me/${phone}?text=${message}`,
      "_blank"
    );
  });

  if (!window.isSecureContext && location.hostname !== "localhost") {
    $("connectHelp").textContent =
      "Para detectar controles, publicá esta página en HTTPS (por ejemplo, Cloudflare Pages) y usá un navegador compatible.";
  }
})();
