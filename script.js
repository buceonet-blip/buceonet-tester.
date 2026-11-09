
(() => {
  "use strict";

  // ==========================================
  // BUCEONET VIDEOJUEGOS - TESTER
  // ==========================================

  const buttonNames = [
    "A", "B", "X", "Y",
    "LB", "RB", "LT", "RT",
    "View / Share", "Menu / Options",
    "Stick izquierdo L3", "Stick derecho R3",
    "Cruceta arriba", "Cruceta abajo",
    "Cruceta izquierda", "Cruceta derecha",
    "Botón PS / Xbox / Home"
  ];

  const testedButtons = new Set();
  const buttonMaxValues = {};

  let gamepad = null;
  let activeGamepadId = "";
  let animationFrame = null;
  let lastSnapshot = null;

  let leftCircularity = null;
  let rightCircularity = null;

  // Guardamos los datos del gráfico para que
  // el loop de los joysticks no lo borre.
  let leftCircularityValues = null;
  let rightCircularityValues = null;

  let driftTest = {
    active: false,
    startTime: 0,
    samples: [],
    timer: null
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const leftCanvas = $("#leftCanvas");
  const rightCanvas = $("#rightCanvas");

  const leftCircularityButton = $("#leftCircularityButton");
  const rightCircularityButton = $("#rightCircularityButton");

  // ==========================================
  // PERFIL DEL CONTROL
  // ==========================================

  function getProfile(pad) {
    const id = (pad?.id || "").toLowerCase();

    if (
      id.includes("dualsense") ||
      id.includes("dualshock") ||
      id.includes("playstation") ||
      id.includes("054c") ||
      id.includes("sony")
    ) {
      return { name: "PlayStation", family: "playstation" };
    }

    if (
      id.includes("xbox") ||
      id.includes("xinput") ||
      id.includes("045e") ||
      id.includes("microsoft")
    ) {
      return { name: "Xbox", family: "xbox" };
    }

    if (
      id.includes("nintendo") ||
      id.includes("057e") ||
      id.includes("joy-con") ||
      id.includes("joycon") ||
      id.includes("pro controller")
    ) {
      return { name: "Nintendo", family: "nintendo" };
    }

    return { name: "Genérico", family: "generic" };
  }

  function getButtonNames(profile) {
    if (profile.family === "playstation") {
      return [
        "Cruz", "Círculo", "Cuadrado", "Triángulo",
        "L1", "R1", "L2", "R2",
        "Create / Share", "Options", "L3", "R3",
        "Cruceta arriba", "Cruceta abajo",
        "Cruceta izquierda", "Cruceta derecha",
        "Botón PS"
      ];
    }

    if (profile.family === "xbox") {
      return [
        "A", "B", "X", "Y", "LB", "RB", "LT", "RT",
        "View", "Menu", "Stick izquierdo L3",
        "Stick derecho R3", "Cruceta arriba",
        "Cruceta abajo", "Cruceta izquierda",
        "Cruceta derecha", "Botón Xbox / Home"
      ];
    }

    if (profile.family === "nintendo") {
      return [
        "B", "A", "Y", "X", "L", "R", "ZL", "ZR",
        "Minus", "Plus", "Stick izquierdo L3",
        "Stick derecho R3", "Cruceta arriba",
        "Cruceta abajo", "Cruceta izquierda",
        "Cruceta derecha", "Botón Home"
      ];
    }

    return buttonNames;
  }

  // ==========================================
  // REINICIAR PRUEBAS
  // ==========================================

  function resetTestedButtons() {
    testedButtons.clear();

    Object.keys(buttonMaxValues).forEach((key) => {
      delete buttonMaxValues[key];
    });

    $$(".test-button").forEach((button) => {
      button.classList.remove("tested", "pressed", "active");
    });

    updateCounter();
  }

  // ==========================================
  // CONTADOR
  // ==========================================

  function getVisibleButtons() {
    return $$(".test-button[data-button]").filter((element) => {
      return !element.closest("[hidden]");
    });
  }

  function updateCounter() {
    const visibleButtons = getVisibleButtons();
    const total = visibleButtons.length;

    const tested = visibleButtons.filter((element) => {
      return testedButtons.has(Number(element.dataset.button));
    }).length;

    const counter = $("#buttonCounter");
    const progress = $("#progressFill");
    const alternativeCounter = $("#buttonsCounter");

    if (counter) counter.textContent = `${tested} / ${total}`;

    if (progress) {
      progress.style.width =
        `${total ? (tested / total) * 100 : 0}%`;
    }

    if (alternativeCounter) {
      alternativeCounter.textContent = `${tested} / ${total}`;
    }
  }

  // ==========================================
  // PERFIL Y BOTONES VISIBLES
  // ==========================================

  function updateButtonLayout(pad) {
    const profile = getProfile(pad);

    const profileLabel = $("#controllerProfile");

    if (profileLabel) {
      profileLabel.textContent = profile.name;
    }

    const touchpadRow = $("#touchpadRow");

    if (touchpadRow) {
      touchpadRow.hidden = profile.family !== "playstation";
    }

    const names = getButtonNames(profile);

    $$(".test-button[data-button]").forEach((element) => {
      const index = Number(element.dataset.button);

      const label = element.querySelector(
        ".button-label, .button-name, span"
      );

      if (label && names[index]) {
        label.textContent = names[index];
      }
    });

    updateCounter();
  }

  // ==========================================
  // CONEXIÓN
  // ==========================================

  function setConnected(pad) {
    gamepad = pad;
    activeGamepadId = pad.id;

    resetTestedButtons();

    leftCircularity = null;
    rightCircularity = null;
    leftCircularityValues = null;
    rightCircularityValues = null;

    const status = $("#connectionStatus");
    if (status) status.textContent = "Control conectado";

    const name = $("#controllerName");
    if (name) name.textContent = pad.id;

    updateButtonLayout(pad);

    const connected = $("#connectedStatus");
    if (connected) connected.textContent = "CONECTADO";
  }

  function disconnect() {
    gamepad = null;
    activeGamepadId = "";

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    const status = $("#connectionStatus");
    if (status) status.textContent = "Esperando control...";

    const name = $("#controllerName");
    if (name) name.textContent = "Sin conectar";

    const connected = $("#connectedStatus");
    if (connected) connected.textContent = "DESCONECTADO";
  }

  function getAvailablePad() {
    if (!navigator.getGamepads) return null;

    const pads = navigator.getGamepads();

    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }

    return null;
  }

  window.addEventListener("gamepadconnected", (event) => {
    setConnected(event.gamepad);

    if (!animationFrame) loop();
  });

  window.addEventListener("gamepaddisconnected", () => {
    disconnect();
  });

  // ==========================================
  // REGISTRO DE BOTONES
  // ==========================================

  function registerButton(index, button) {
    const rawValue = Number(button.value) || 0;

    const currentValue = button.pressed
      ? Math.max(rawValue, 1)
      : rawValue;

    buttonMaxValues[index] = Math.max(
      buttonMaxValues[index] || 0,
      currentValue
    );

    if (button.pressed || rawValue > 0.1) {
      testedButtons.add(index);
    }

    const element = $(
      `.test-button[data-button="${index}"]`
    );

    if (element) {
      if (testedButtons.has(index)) {
        element.classList.add("tested");
      }

      if (button.pressed || rawValue > 0.1) {
        element.classList.add("pressed", "active");
      } else {
        element.classList.remove("pressed", "active");
      }
    }

    return {
      index,
      value: Number(rawValue.toFixed(3)),
      maxValue: Number(
        (buttonMaxValues[index] || 0).toFixed(3)
      ),
      percent: Math.round(
        (buttonMaxValues[index] || 0) * 100
      ),
      pressedNow: Boolean(button.pressed),
      tested: testedButtons.has(index)
    };
  }

  // ==========================================
  // LOOP PRINCIPAL
  // ==========================================

  function loop() {
    const pad = getAvailablePad();

    if (!pad) {
      disconnect();
      return;
    }

    if (
      !gamepad ||
      pad.index !== gamepad.index ||
      pad.id !== activeGamepadId
    ) {
      setConnected(pad);
    }

    gamepad = pad;

    const profile = getProfile(pad);
    const names = getButtonNames(profile);

    const buttons = pad.buttons.map((button, index) => ({
      ...registerButton(index, button),
      name: names[index] || `Botón ${index}`
    }));

    const axes = Array.from(pad.axes || []).map((axis) => {
      return Number((Number(axis) || 0).toFixed(3));
    });

    lastSnapshot = {
      id: pad.id,
      profile: profile.name,
      family: profile.family,
      buttons,
      axes,
      timestamp: Date.now()
    };

    updateCounter();
    updateJoystickDisplays(axes);

    animationFrame = requestAnimationFrame(loop);
  }

  // ==========================================
  // JOYSTICKS EN VIVO
  // ==========================================

  function updateJoystickDisplays(axes) {
    const values = [
      axes[0] || 0,
      axes[1] || 0,
      axes[2] || 0,
      axes[3] || 0
    ];

    const ids = ["#leftX", "#leftY", "#rightX", "#rightY"];

    ids.forEach((selector, index) => {
      const element = $(selector);

      if (element) {
        element.textContent = values[index].toFixed(3);
      }
    });

    drawJoystick(leftCanvas, values[0], values[1], "left");
    drawJoystick(rightCanvas, values[2], values[3], "right");
  }

  function drawJoystick(canvas, x, y, side) {
    if (!canvas) return;

    // Si ya se hizo la prueba, mantenemos visible
    // el gráfico de circularidad y no lo borramos.
    const savedValues = side === "left"
      ? leftCircularityValues
      : rightCircularityValues;

    if (savedValues) {
      drawCircularity(side, savedValues);
      return;
    }

    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.38;

    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#34515c";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.strokeStyle = "#29414b";
    ctx.stroke();

    const px = cx + x * radius;
    const py = cy + y * radius;

    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#00ff9d";
    ctx.fill();
  }

  // ==========================================
  // CIRCULARIDAD
  // ==========================================

  function runCircularity(side) {
    const startIndex = side === "left" ? 0 : 2;

    const samples = [];
    const totalSamples = 100;

    let count = 0;

    const button = side === "left"
      ? leftCircularityButton
      : rightCircularityButton;

    // Al iniciar una nueva prueba, volvemos a mostrar
    // el movimiento del stick en vivo.
    if (side === "left") {
      leftCircularity = null;
      leftCircularityValues = null;
    } else {
      rightCircularity = null;
      rightCircularityValues = null;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Probando...";
    }

    const capture = () => {
      const pad = getAvailablePad();

      if (!pad) {
        if (button) {
          button.disabled = false;
          button.textContent = "Reintentar prueba";
        }
        return;
      }

      const x = Number(pad.axes[startIndex] || 0);
      const y = Number(pad.axes[startIndex + 1] || 0);

      const distance = Math.sqrt(x * x + y * y);

      if (distance > 0.15) {
        samples.push({
          angle: Math.atan2(y, x),
          distance
        });
      }

      count++;

      if (count < totalSamples) {
        setTimeout(capture, 20);
      } else {
        finishCircularity(side, samples, button);
      }
    };

    capture();
  }

  function finishCircularity(side, samples, button) {
    const sectorCount = 36;
    const values = new Array(sectorCount).fill(0);

    // Guardamos la mayor distancia observada
    // en cada uno de los 36 sectores.
    samples.forEach((sample) => {
      let angle = sample.angle;

      if (angle < 0) angle += Math.PI * 2;

      const sector = Math.floor(
        (angle / (Math.PI * 2)) * sectorCount
      );

      const index = Math.min(sectorCount - 1, sector);

      values[index] = Math.max(
        values[index],
        sample.distance
      );
    });

    const occupiedValues = values.filter((value) => value > 0);

    const occupied = occupiedValues.length;

    const coverage = Math.round(
      (occupied / sectorCount) * 100
    );

    const maximum = Math.max(...values, 0);
    const minimum = occupied
      ? Math.min(...occupiedValues)
      : 0;

    const circularity = maximum > 0
      ? Math.round((minimum / maximum) * 100)
      : 0;

    const result = {
      circularity,
      coverage,
      samples: samples.length
    };

    if (side === "left") {
      leftCircularity = result;
      leftCircularityValues = values.slice();
    } else {
      rightCircularity = result;
      rightCircularityValues = values.slice();
    }

    drawCircularity(side, values);

    const resultElement = $(
      side === "left"
        ? "#leftCircularityResult"
        : "#rightCircularityResult"
    );

    if (resultElement) {
      resultElement.textContent =
        `${circularity}% circularidad | ${coverage}% cobertura`;
    }

    if (button) {
      button.disabled = false;
      button.textContent = "Repetir prueba";
    }
  }

  // Interpolación suave entre los sectores para
  // evitar un polígono dentado de 36 lados.
  function getSmoothRadius(values, angle) {
    const count = values.length;

    const position = (angle / (Math.PI * 2)) * count;

    const index1 = Math.floor(position) % count;
    const index2 = (index1 + 1) % count;

    const fraction = position - Math.floor(position);

    const a = values[index1] || 0;
    const b = values[index2] || 0;

    return a + (b - a) * fraction;
  }

  function drawCircularity(side, values) {
    const canvas = side === "left"
      ? leftCanvas
      : rightCanvas;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.38;

    ctx.clearRect(0, 0, width, height);

    // Círculo exterior de referencia.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#34515c";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Guías centrales.
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.strokeStyle = "#29414b";
    ctx.lineWidth = 1;
    ctx.stroke();

    const maximum = Math.max(...values, 0);

    if (maximum <= 0) return;

    // Dibujamos 360 puntos interpolados para
    // que el contorno quede continuo y suave.
    const points = [];
    const pointCount = 360;

    for (let i = 0; i < pointCount; i++) {
      const angle = (i / pointCount) * Math.PI * 2;

      const measured = getSmoothRadius(values, angle);

      // Normalizamos el máximo al radio exterior.
      const normalized = measured / maximum;

      const r = radius * normalized;

      points.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r
      });
    }

    // Superficie rellena.
    ctx.beginPath();

    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });

    ctx.closePath();

    ctx.fillStyle = "rgba(0, 255, 157, 0.28)";
    ctx.fill();

    // Contorno del resultado.
    ctx.strokeStyle = "#00ff9d";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Centro.
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#00ff9d";
    ctx.fill();
  }

  if (leftCircularityButton) {
    leftCircularityButton.addEventListener("click", () => {
      runCircularity("left");
    });
  }

  if (rightCircularityButton) {
    rightCircularityButton.addEventListener("click", () => {
      runCircularity("right");
    });
  }

  // ==========================================
  // PRUEBA DE DRIFT
  // ==========================================

  const driftButton = $("#driftButton");

  if (driftButton) {
    driftButton.addEventListener("click", () => {
      if (driftTest.active) return;

      driftTest.active = true;
      driftTest.startTime = Date.now();
      driftTest.samples = [];

      driftButton.disabled = true;
      driftButton.textContent = "Midiendo...";

      const output = $("#driftResult");

      if (output) {
        output.textContent =
          "Dejá el control quieto durante 5 segundos...";
      }

      const collect = () => {
        const pad = getAvailablePad();

        if (!pad) {
          driftTest.active = false;
          driftButton.disabled = false;
          driftButton.textContent = "Repetir prueba de drift";
          return;
        }

        const axes = Array.from(pad.axes || []);

        driftTest.samples.push(axes);

        if (Date.now() - driftTest.startTime < 5000) {
          driftTest.timer = setTimeout(collect, 50);
        } else {
          finishDriftTest();
        }
      };

      collect();
    });
  }

  function finishDriftTest() {
    driftTest.active = false;

    const axisCount = Math.max(
      0,
      ...driftTest.samples.map((sample) => sample.length)
    );

    const maximums = [];

    for (let i = 0; i < axisCount; i++) {
      let maximum = 0;

      driftTest.samples.forEach((sample) => {
        maximum = Math.max(
          maximum,
          Math.abs(Number(sample[i] || 0))
        );
      });

      maximums.push(maximum);
    }

    const result = maximums
      .map((value) => value.toFixed(3))
      .join(", ");

    const output = $("#driftResult");

    if (output) {
      output.textContent =
        `Valores máximos registrados: ${result}`;
    }

    if (driftButton) {
      driftButton.disabled = false;
      driftButton.textContent = "Repetir prueba de drift";
    }
  }

  // ==========================================
  // INFORME TXT
  // ==========================================

  function generateReport() {
    const pad = getAvailablePad();

    if (!pad || !lastSnapshot) {
      alert("Primero conectá un control.");
      return;
    }

    const profile = getProfile(pad);
    const names = getButtonNames(profile);

    let report = "";

    report += "BUCEONET VIDEOJUEGOS - INFORME DE TESTER\n";
    report += "Fecha: " + new Date().toLocaleString("es-UY") + "\n";
    report += "Control: " + pad.id + "\n";
    report += "Tipo detectado: " + profile.name + "\n\n";

    const visibleButtons = getVisibleButtons();
    const total = visibleButtons.length;

    const tested = visibleButtons.filter((element) => {
      return testedButtons.has(Number(element.dataset.button));
    }).length;

    report += `Botones probados: ${tested} / ${total}\n\n`;
    report += "BOTONES:\n";

    pad.buttons.forEach((button, index) => {
      const maxValue = buttonMaxValues[index] || 0;
      const percent = Math.round(maxValue * 100);
      const wasTested = testedButtons.has(index);

      const name = names[index] || `Botón ${index}`;

      const status = wasTested ? "PROBADO" : "NO PROBADO";

      const valueText = wasTested
        ? `PULSADO (${percent}%)`
        : "SIN PULSAR (0%)";

      report += `${name}: ${status} | ${valueText}\n`;
    });

    report += "\nEJES:\n";

    report += lastSnapshot.axes
      .map((axis) => axis.toFixed(3))
      .join(", ");

    report += "\n\nTEST CIRCULARIDAD:\n";

    if (leftCircularity) {
      report +=
        `Stick izquierdo: ${leftCircularity.circularity}% circularidad, ` +
        `${leftCircularity.coverage}% cobertura, ` +
        `${leftCircularity.samples} muestras\n`;
    } else {
      report += "Stick izquierdo: No probado\n";
    }

    if (rightCircularity) {
      report +=
        `Stick derecho: ${rightCircularity.circularity}% circularidad, ` +
        `${rightCircularity.coverage}% cobertura, ` +
        `${rightCircularity.samples} muestras\n`;
    } else {
      report += "Stick derecho: No probado\n";
    }

    report += "\n";
    report += "BUCEONET VIDEOJUEGOS\n";
    report += "Gracias por confiar en nuestro servicio.\n";

    const blob = new Blob(
      [report],
      { type: "text/plain;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "informe-buceonet-tester.txt";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  const reportButton = $("#downloadReportButton") ||
    $("#reportButton");

  if (reportButton) {
    reportButton.addEventListener("click", generateReport);
  }

  // ==========================================
  // WHATSAPP BUCEONET
  // ==========================================

  const whatsappButton = $("#whatsappButton");

  if (whatsappButton) {
    whatsappButton.addEventListener("click", () => {
      const message = encodeURIComponent(
        "Hola Buceonet Videojuegos. Quiero consultar por el diagnóstico de mi control."
      );

      window.open(
        `https://wa.me/59899525777?text=${message}`,
        "_blank"
      );
    });
  }

  // ==========================================
  // INICIO
  // ==========================================

  updateCounter();

  const initialPad = getAvailablePad();

  if (initialPad) {
    setConnected(initialPad);
    loop();
  }

})();
