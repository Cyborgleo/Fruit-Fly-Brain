const canvas = document.getElementById("sceneCanvas");
const gl = canvas.getContext("webgl", { antialias: true, alpha: true, powerPreference: "high-performance" });
const state = {
  time: 0,
  duration: 60,
  playing: false,
  speed: 1,
  brainVisible: false,
  cameraMode: "follow",
  azimuth: 1.08,
  elevation: 0.34,
  distance: 5.1,
  target: [0, 0.8, 0],
  keys: new Set(),
  pointer: null,
  lastFrame: 0,
  explorer: { x: 0, y: 170, z: 35, yaw: 0, pitch: -0.015 },
  behavior: "wandering",
};

const ui = {
  play: document.getElementById("playButton"),
  playGlyph: document.querySelector(".play-glyph"),
  range: document.getElementById("timelineRange"),
  speed: document.getElementById("speedSelect"),
  current: document.getElementById("currentTime"),
  simTime: document.getElementById("simTimeMetric"),
  bodyState: document.getElementById("bodyStateMetric"),
  brainToggle: document.getElementById("brainToggle"),
  brainButton: document.getElementById("brainViewButton"),
  cameraButtons: [...document.querySelectorAll("[data-camera]")],
  chart: document.getElementById("activityChart"),
};

function formatTime(value) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toFixed(1).padStart(4, "0");
  return minutes + ":" + seconds;
}

function updateControls() {
  ui.range.value = String(state.time);
  ui.current.textContent = formatTime(state.time);
  ui.simTime.innerHTML = state.time.toFixed(1) + " <small>s</small>";
  ui.bodyState.textContent = state.playing ? state.behavior : "Paused";
  ui.play.classList.toggle("is-playing", state.playing);
  ui.play.setAttribute("aria-label", state.playing ? "Pause preview" : "Play preview");
  ui.playGlyph.textContent = state.playing ? "Ⅱ" : "▶";
  ui.brainToggle.setAttribute("aria-pressed", String(state.brainVisible));
  ui.brainButton.classList.toggle("active", state.brainVisible);
}

function togglePlayback() {
  if (state.time >= state.duration) state.time = 0;
  state.playing = !state.playing;
  updateControls();
}

ui.play.addEventListener("click", togglePlayback);
document.getElementById("restartButton").addEventListener("click", () => {
  state.time = 0;
  state.playing = false;
  updateControls();
});
ui.range.addEventListener("input", () => {
  state.time = Number(ui.range.value);
  state.playing = false;
  updateControls();
});
ui.speed.addEventListener("change", () => { state.speed = Number(ui.speed.value); });

function setBrainVisible(visible) {
  state.brainVisible = visible;
  updateControls();
}
ui.brainToggle.addEventListener("click", () => setBrainVisible(!state.brainVisible));
ui.brainButton.addEventListener("click", () => setBrainVisible(!state.brainVisible));
document.getElementById("bodyViewButton").addEventListener("click", () => setBrainVisible(false));

ui.cameraButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.cameraMode = button.dataset.camera;
    ui.cameraButtons.forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector(".canvas-wrap").classList.toggle("is-exploring", state.cameraMode === "explore");
    if (state.cameraMode === "follow") state.target = [0, 0.8, 0];
    if (state.cameraMode === "explore" && canvas.requestPointerLock) canvas.requestPointerLock();
    if (state.cameraMode !== "explore" && document.pointerLockElement === canvas) document.exitPointerLock();
  });
});

function resetCamera() {
  state.azimuth = 1.08;
  state.elevation = 0.34;
  state.distance = 5.1;
  state.target = [0, 0.8, 0];
  state.explorer = { x: 0, y: 170, z: 35, yaw: 0, pitch: -0.015 };
}
document.getElementById("resetCameraButton").addEventListener("click", resetCamera);
document.getElementById("fullscreenButton").addEventListener("click", () => {
  const panel = document.querySelector(".viewport-panel");
  if (document.fullscreenElement) document.exitFullscreen();
  else if (panel.requestFullscreen) panel.requestFullscreen();
});
document.getElementById("dismissBanner").addEventListener("click", () => {
  document.querySelector(".preview-banner").classList.add("dismissed");
});
document.getElementById("timelineExpand").addEventListener("click", () => {
  document.querySelector(".viewport-panel").classList.toggle("timeline-expanded");
});

function showDialog(title, content) {
  let dialog = document.getElementById("infoDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "infoDialog";
    dialog.innerHTML = '<form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form><div class="dialog-content"></div>';
    document.body.append(dialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
  dialog.querySelector(".dialog-content").innerHTML = "<h2>" + title + "</h2><p>" + content + "</p>";
  dialog.showModal();
}
document.getElementById("aboutButton").addEventListener("click", () => {
  showDialog("About this field study", "This build now has a large daylight meadow-and-orchard scene, an explorable first-person camera, and a detailed procedural male fruit-fly model. Your local folder contains the MaleCNS v1.0 files, but this viewer has not ingested them yet. The fly's wandering, short flights, and feeding pauses are illustrative behavior; the brain overlay and activity trace remain decorative. This is a 3D scene changing over time, not a claim of a complete biological emulation.");
});
document.getElementById("helpButton").addEventListener("click", () => {
  showDialog("Field controls", "Choose Follow to see the fly close up, Orbit to look around it, or Explore for a first-person view of the meadow. In Explore, click the view to capture the mouse, use WASD to move, Shift to move faster, and Q or E to change height; press Escape to release the mouse. In Follow or Orbit, drag to rotate and scroll to zoom. Use the timeline to pause, replay, or scrub the illustrative behavior.");
});

document.addEventListener("keydown", (event) => {
  const tag = event.target && event.target.tagName;
  if (["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(tag)) return;
  const key = event.key.toLowerCase();
  if (key === "r") resetCamera();
  else if (["w", "a", "s", "d", "shift", "q", "e"].includes(key)) {
    if (state.cameraMode === "explore") event.preventDefault();
    state.keys.add(key);
  }
});
document.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => state.keys.clear());
document.addEventListener("pointerlockchange", () => {
  document.querySelector(".canvas-wrap").classList.toggle("mouse-locked", document.pointerLockElement === canvas);
});

if (!gl) {
  const message = document.createElement("div");
  message.className = "webgl-error";
  message.innerHTML = "<strong>3D graphics are unavailable</strong><span>Enable WebGL in this browser to view the prototype.</span>";
  document.querySelector(".canvas-wrap").append(message);
} else {
  startRenderer();
}
updateControls();
drawActivityChart();

function startRenderer() {
  const vertexShader = [
    "attribute vec3 aPosition;",
    "attribute vec3 aNormal;",
    "attribute vec4 aColor;",
    "uniform mat4 uViewProjection;",
    "uniform mat4 uModel;",
    "uniform vec4 uColor;",
    "uniform float uUseVertexColor;",
    "uniform float uLighting;",
    "uniform float uPointSize;",
    "varying vec4 vColor;",
    "void main() {",
    "  vec4 c = mix(uColor, aColor, uUseVertexColor);",
    "  vec3 n = normalize(mat3(uModel) * aNormal);",
    "  float light = 0.42 + 0.58 * max(dot(n, normalize(vec3(-0.45, 0.82, 0.46))), 0.0);",
    "  vColor = vec4(c.rgb * mix(1.0, light, uLighting), c.a);",
    "  gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0);",
    "  gl_PointSize = uPointSize;",
    "}",
  ].join("\n");
  const fragmentShader = [
    "precision mediump float;",
    "varying vec4 vColor;",
    "void main() {",
    "  gl_FragColor = vColor;",
    "}",
  ].join("\n");
  const program = createProgram(gl, vertexShader, fragmentShader);
  if (!program) return;

  const locations = {
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    colorAttribute: gl.getAttribLocation(program, "aColor"),
    viewProjection: gl.getUniformLocation(program, "uViewProjection"),
    model: gl.getUniformLocation(program, "uModel"),
    color: gl.getUniformLocation(program, "uColor"),
    useVertexColor: gl.getUniformLocation(program, "uUseVertexColor"),
    lighting: gl.getUniformLocation(program, "uLighting"),
    pointSize: gl.getUniformLocation(program, "uPointSize"),
  };
  const sphere = createSphere(gl, 22, 16);
  const cylinder = createCylinder(gl, 12);
  const terrain = createTerrain(gl, 88, 5200);
  const grassField = createGrassField(gl, 410, 23);
  const fieldProps = createFieldProps(85321);
  const lineBuffer = gl.createBuffer();
  const pointBuffer = gl.createBuffer();
  const identity = identityMatrix();
  const brainCloud = createBrainCloud(360);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (state.cameraMode === "explore" && document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      canvas.requestPointerLock();
      return;
    }
    state.pointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (document.pointerLockElement === canvas && state.cameraMode === "explore") {
      state.explorer.yaw -= event.movementX * 0.002;
      state.explorer.pitch = Math.max(-1.25, Math.min(1.25, state.explorer.pitch - event.movementY * 0.002));
      return;
    }
    if (!state.pointer) return;
    const dx = event.clientX - state.pointer.x;
    const dy = event.clientY - state.pointer.y;
    state.pointer = { x: event.clientX, y: event.clientY };
    state.azimuth -= dx * 0.006;
    state.elevation = Math.max(-0.05, Math.min(1.24, state.elevation + dy * 0.005));
    state.cameraMode = "free";
    ui.cameraButtons.forEach((button) => button.classList.toggle("active", button.dataset.camera === "free"));
  });
  canvas.addEventListener("pointerup", () => { state.pointer = null; });
  canvas.addEventListener("pointercancel", () => { state.pointer = null; });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.distance = Math.max(2.3, Math.min(11, state.distance * Math.exp(event.deltaY * 0.001)));
  }, { passive: false });

  function frame(now) {
    const delta = state.lastFrame ? Math.min(0.08, (now - state.lastFrame) / 1000) : 0;
    state.lastFrame = now;
    if (state.playing) {
      state.time += delta * state.speed;
      if (state.time >= state.duration) {
        state.time = state.duration;
        state.playing = false;
      }
      updateControls();
    }
    state.behavior = flyPoseAt(state.time).behavior;
    updateFreeCamera(delta);
    resizeCanvas();
    renderScene();
    window.requestAnimationFrame(frame);
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.8);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function updateFreeCamera(delta) {
    if (!delta || !state.keys.size) return;
    if (state.cameraMode === "explore") {
      const player = state.explorer;
      const speed = delta * (state.keys.has("shift") ? 380 : 150);
      const forward = [Math.sin(player.yaw), 0, -Math.cos(player.yaw)];
      const right = [Math.cos(player.yaw), 0, Math.sin(player.yaw)];
      if (state.keys.has("w")) { player.x += forward[0] * speed; player.z += forward[2] * speed; }
      if (state.keys.has("s")) { player.x -= forward[0] * speed; player.z -= forward[2] * speed; }
      if (state.keys.has("a")) { player.x -= right[0] * speed; player.z -= right[2] * speed; }
      if (state.keys.has("d")) { player.x += right[0] * speed; player.z += right[2] * speed; }
      if (state.keys.has("q")) player.y -= speed * 0.65;
      if (state.keys.has("e")) player.y += speed * 0.65;
      player.x = Math.max(-4900, Math.min(4900, player.x));
      player.z = Math.max(-4900, Math.min(4900, player.z));
      player.y = Math.max(0.4, Math.min(1400, player.y));
      return;
    }
    if (state.cameraMode !== "free") return;
    const forward = [Math.sin(state.azimuth), 0, Math.cos(state.azimuth)];
    const right = [forward[2], 0, -forward[0]];
    const step = delta * 2.1;
    if (state.keys.has("w")) addInto(state.target, forward, -step);
    if (state.keys.has("s")) addInto(state.target, forward, step);
    if (state.keys.has("a")) addInto(state.target, right, -step);
    if (state.keys.has("d")) addInto(state.target, right, step);
  }

  function renderScene() {
    const ratio = canvas.width / Math.max(1, canvas.height);
    const t = state.time;
    const fly = flyPoseAt(t);
    let eye;
    let target;
    if (state.cameraMode === "explore") {
      const player = state.explorer;
      eye = [player.x, player.y, player.z];
      const forward = [Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch)];
      target = [eye[0] + forward[0] * 100, eye[1] + forward[1] * 100, eye[2] + forward[2] * 100];
    } else {
      target = state.cameraMode === "follow" ? [fly.position[0], fly.position[1] + 0.82, fly.position[2]] : state.target;
      const horizontal = state.distance * Math.cos(state.elevation);
      eye = [target[0] + horizontal * Math.sin(state.azimuth), target[1] + state.distance * Math.sin(state.elevation), target[2] + horizontal * Math.cos(state.azimuth)];
    }
    const far = state.cameraMode === "follow" ? 5200 : 12000;
    const vp = multiply(perspective(state.cameraMode === "explore" ? 70 * Math.PI / 180 : 42 * Math.PI / 180, ratio, 0.08, far), lookAt(eye, target, [0, 1, 0]));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(locations.viewProjection, false, vp);
    gl.uniformMatrix4fv(locations.model, false, identity);
    gl.uniform1f(locations.pointSize, 1);

    drawMesh(terrain, identity, [1, 1, 1, 1], 0.88);
    drawMesh(grassField, identity, [1, 1, 1, 1], 0.72);
    drawNature();
    drawFly(fly);
    if (state.brainVisible) drawBrain(fly);

    function drawMesh(mesh, model, color, lighting = 1) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
      gl.enableVertexAttribArray(locations.normal);
      gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
      if (mesh.colorBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
        gl.enableVertexAttribArray(locations.colorAttribute);
        gl.vertexAttribPointer(locations.colorAttribute, 4, gl.FLOAT, false, 0, 0);
      } else {
        gl.disableVertexAttribArray(locations.colorAttribute);
        gl.vertexAttrib4f(locations.colorAttribute, 1, 1, 1, 1);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      gl.uniformMatrix4fv(locations.model, false, model);
      gl.uniform4fv(locations.color, color);
      gl.uniform1f(locations.useVertexColor, mesh.colorBuffer ? 1 : 0);
      gl.uniform1f(locations.lighting, lighting);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }

    function drawLineList(vertices, buffer) {
      if (!vertices.length) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 28, 0);
      gl.disableVertexAttribArray(locations.normal);
      gl.vertexAttrib3f(locations.normal, 0, 1, 0);
      gl.enableVertexAttribArray(locations.colorAttribute);
      gl.vertexAttribPointer(locations.colorAttribute, 4, gl.FLOAT, false, 28, 12);
      gl.uniformMatrix4fv(locations.model, false, identity);
      gl.uniform1f(locations.useVertexColor, 1);
      gl.uniform1f(locations.lighting, 0);
      gl.drawArrays(gl.LINES, 0, vertices.length / 7);
      gl.disableVertexAttribArray(locations.colorAttribute);
    }

    function drawNature() {
      fieldProps.hills.forEach((hill) => {
        drawMesh(sphere, transform(hill.position, hill.size, hill.yaw), [0.32, 0.49, 0.37, 1], 0.84);
      });

      fieldProps.trees.forEach((tree) => {
        const trunkColor = tree.bark;
      drawMesh(cylinder, transform([tree.x, tree.ground + tree.height * 0.46, tree.z], [tree.trunk, tree.height, tree.trunk], tree.yaw), [trunkColor[0], trunkColor[1], trunkColor[2], 1], 0.9);
        tree.crowns.forEach((crown) => {
          drawMesh(sphere, transform([tree.x + crown[0], tree.ground + tree.height + crown[1], tree.z + crown[2]], crown.slice(3), tree.yaw), [tree.leaf[0], tree.leaf[1], tree.leaf[2], 1], 0.84);
        });
      });

      fieldProps.bushes.forEach((bush) => {
        bush.lobes.forEach((lobe) => drawMesh(sphere, transform([bush.x + lobe[0], lobe[1], bush.z + lobe[2]], lobe.slice(3), 0), [bush.color[0], bush.color[1], bush.color[2], 1], 0.82));
      });

      fieldProps.rocks.forEach((rock) => {
        drawMesh(sphere, transform([rock.x, rock.y, rock.z], rock.size, rock.yaw), [rock.color[0], rock.color[1], rock.color[2], 1], 0.95);
      });

      fieldProps.flowers.forEach((flower) => {
        const bob = Math.sin(state.time * 1.5 + flower.phase) * 0.04;
        const stemEnd = [flower.x, flower.height + bob, flower.z];
        rod([flower.x, 0, flower.z], stemEnd, flower.stem, [0.13, 0.31, 0.12, 1]);
        [-1, 1].forEach((side) => {
          drawMesh(sphere, transform([flower.x + side * flower.radius * 0.36, flower.height * 0.44, flower.z + side * 0.12], [flower.radius * 0.56, flower.radius * 0.1, flower.radius * 0.24], side * 0.35), [0.21, 0.45, 0.16, 1], 0.78);
        });
        for (let i = 0; i < 6; i++) {
          const angle = i / 6 * Math.PI * 2;
          const petalSize = flower.radius * (i % 2 ? 0.58 : 0.67);
          drawMesh(sphere, transform([flower.x + Math.cos(angle) * flower.radius * 0.73, flower.height + bob, flower.z + Math.sin(angle) * flower.radius * 0.73], [petalSize, petalSize * 0.25, petalSize * 0.45], angle), [flower.petal[0], flower.petal[1], flower.petal[2], 1], 0.92);
        }
        drawMesh(sphere, transform([flower.x, flower.height + bob + 0.015, flower.z], [flower.radius * 0.36, flower.radius * 0.27, flower.radius * 0.36], 0), [0.93, 0.72, 0.25, 1], 0.95);
      });

      // A fallen berry and a damp leaf litter patch make a visible food landmark.
      drawMesh(sphere, transform([7.4, 0.42, 6.2], [2.8, 2.5, 2.7], 0.4), [0.38, 0.075, 0.10, 1], 0.9);
      drawMesh(sphere, transform([7.2, 0.16, 6.1], [4.2, 0.18, 3.4], -0.2), [0.20, 0.17, 0.09, 1], 0.74);
      drawMesh(sphere, transform([-11.5, 0.12, -6.5], [7.5, 0.08, 4.0], 0.8), [0.29, 0.21, 0.12, 1], 0.72);

      // Soft white clouds and a sun disk sit against the CSS sky gradient.
      fieldProps.clouds.forEach((cloud) => drawMesh(sphere, transform(cloud.position, cloud.size, 0), [0.91, 0.97, 0.99, 0.72], 0.35));
      drawMesh(sphere, transform([2300, 2300, -4200], [145, 145, 145], 0), [1, 0.82, 0.48, 1], 0.25);
    }

    function drawFly(flyPose) {
      const p = flyPose.position;
      const yaw = flyPose.yaw;
      const part = (mesh, local, size, color, angle = 0, alpha = 1) => {
        const world = localToWorld(local, p, yaw);
        drawMesh(mesh, transform(world, size, yaw + angle), [color[0], color[1], color[2], alpha], 0.95);
      };

      part(sphere, [-0.58, 1.03, 0], [0.62, 0.31, 0.29], [0.39, 0.25, 0.19]);
      part(sphere, [-0.88, 1.04, 0], [0.30, 0.275, 0.275], [0.50, 0.32, 0.22]);
      part(sphere, [-0.30, 1.05, 0], [0.36, 0.32, 0.31], [0.43, 0.28, 0.20]);
      part(sphere, [-0.02, 1.06, 0], [0.30, 0.33, 0.31], [0.31, 0.22, 0.19]);
      part(sphere, [0.40, 1.08, 0], [0.30, 0.29, 0.28], [0.32, 0.25, 0.22]);

      part(sphere, [0.43, 1.20, -0.205], [0.17, 0.19, 0.12], [0.65, 0.18, 0.22]);
      part(sphere, [0.43, 1.20, 0.205], [0.17, 0.19, 0.12], [0.65, 0.18, 0.22]);
      for (const side of [-1, 1]) {
        for (let row = 0; row < 3; row++) {
          for (let column = 0; column < 3; column++) {
            const x = 0.37 + column * 0.055;
            const y = 1.145 + row * 0.047;
            const nx = (x - 0.43) / 0.17;
            const ny = (y - 1.20) / 0.19;
            const depth = 0.205 + 0.12 * Math.sqrt(Math.max(0.12, 1 - nx * nx - ny * ny));
            part(sphere, [x, y, side * depth], [0.014, 0.014, 0.014], [0.24, 0.055, 0.08]);
          }
        }
      }
      part(sphere, [0.62, 1.04, -0.065], [0.105, 0.09, 0.09], [0.45, 0.30, 0.25]);
      part(sphere, [0.62, 1.04, 0.065], [0.105, 0.09, 0.09], [0.45, 0.30, 0.25]);
      [-1, 1].forEach((side) => {
        part(sphere, [-0.36, 1.16, side * 0.34], [0.055, 0.045, 0.045], [0.60, 0.48, 0.31]);
        part(sphere, [-0.42, 1.16, side * 0.40], [0.075, 0.025, 0.025], [0.49, 0.35, 0.23]);
      });

      const abdomenStripes = [-0.98, -0.76, -0.54, -0.32];
      abdomenStripes.forEach((x, i) => {
        const color = i % 2 === 0 ? [0.20, 0.16, 0.14] : [0.28, 0.20, 0.16];
        part(sphere, [x, 1.05, 0], [0.045, 0.254 - Math.abs(x + 0.6) * 0.02, 0.266 - Math.abs(x + 0.6) * 0.02], color);
      });

      const motion = Math.max(state.playing ? 0.72 : 0.18, flyPose.flight * 1.25);
      const legs = [];
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const side = sideIndex === 0 ? -1 : 1;
        for (let legIndex = 0; legIndex < 3; legIndex++) {
          const frontness = 1 - legIndex;
          const phase = state.time * 8.5 + legIndex * Math.PI + sideIndex * Math.PI;
          const stride = Math.sin(phase) * 0.15 * motion;
          const hip = [-0.03 - legIndex * 0.17, 0.93, side * 0.22];
          const coxa = [hip[0] + (frontness - 0.25) * 0.08, 0.79, side * 0.37];
          const knee = [hip[0] + (frontness - 0.15) * 0.20 + stride * 0.5, 0.40 + Math.max(0, Math.sin(phase)) * 0.04 * motion, side * 0.52];
          const toe = [hip[0] + (frontness - 0.2) * 0.42 + stride, 0.035 + Math.max(0, Math.sin(phase)) * 0.06 * motion, side * 0.69];
          legs.push([hip, coxa, knee, toe]);
        }
      }

      gl.uniformMatrix4fv(locations.viewProjection, false, vp);
      legs.forEach(([hip, coxa, knee, toe]) => {
        rod(localToWorld(hip, p, yaw), localToWorld(coxa, p, yaw), 0.033, [0.28, 0.20, 0.18, 1]);
        rod(localToWorld(coxa, p, yaw), localToWorld(knee, p, yaw), 0.052, [0.41, 0.27, 0.20, 1]);
        rod(localToWorld(knee, p, yaw), localToWorld(toe, p, yaw), 0.026, [0.31, 0.22, 0.19, 1]);
        const tip = localToWorld([toe[0] + 0.1, toe[1], toe[2] + sideSign(toe[2]) * 0.025], p, yaw);
        rod(localToWorld(toe, p, yaw), tip, 0.018, [0.48, 0.32, 0.24, 1]);
      });

      const wingBeat = Math.sin(state.time * 80) * flyPose.flight;
      const wingAlpha = 0.34 + flyPose.flight * 0.24;
      part(sphere, [-0.06, 1.39 + Math.abs(wingBeat) * 0.08, -0.23], [0.48, 0.025 + Math.abs(wingBeat) * 0.018, 0.18], [0.60, 0.75, 0.76], -0.12 - wingBeat * 0.32, wingAlpha);
      part(sphere, [-0.04, 1.40 + Math.abs(wingBeat) * 0.08, 0.23], [0.48, 0.025 + Math.abs(wingBeat) * 0.018, 0.18], [0.60, 0.75, 0.76], 0.12 + wingBeat * 0.32, wingAlpha);

      const wingVeins = [];
      [-1, 1].forEach((side) => {
        const origin = [-0.04, 1.43, side * 0.22];
        for (let i = 0; i < 4; i++) {
          const end = [-0.48 + i * 0.11, 1.43, side * (0.31 + i * 0.025)];
          pushLine(wingVeins, localToWorld(origin, p, yaw), localToWorld(end, p, yaw), [0.24, 0.36, 0.39, 0.55]);
        }
      });
      drawLineList(wingVeins, lineBuffer);

      const antennaLines = [];
      [-1, 1].forEach((side) => {
        const a = localToWorld([0.52, 1.29, side * 0.08], p, yaw);
        const b = localToWorld([0.64, 1.48, side * 0.11], p, yaw);
        const c = localToWorld([0.78, 1.52, side * 0.17], p, yaw);
        pushLine(antennaLines, a, b, [0.43, 0.31, 0.23, 1]);
        pushLine(antennaLines, b, c, [0.57, 0.39, 0.27, 1]);
        part(sphere, [0.78, 1.52, side * 0.17], [0.025, 0.025, 0.025], [0.66, 0.45, 0.28]);
      });
      drawLineList(antennaLines, lineBuffer);

      const highlights = [];
      [-1, 1].forEach((side) => {
        pushLine(highlights, localToWorld([0.43, 1.28, side * 0.29], p, yaw), localToWorld([0.47, 1.34, side * 0.29], p, yaw), [1, 0.53, 0.52, 0.7]);
      });
      drawLineList(highlights, lineBuffer);
    }

    function sideSign(value) { return value < 0 ? -1 : 1; }

    function rod(a, b, radius, color) {
      const direction = normalize(subtract(b, a));
      const length = Math.max(0.001, length3(subtract(b, a)));
      let right = normalize(cross([0, 1, 0], direction));
      if (length3(right) < 0.001) right = [1, 0, 0];
      const forward = normalize(cross(direction, right));
      const center = scale(add(a, b), 0.5);
      const model = new Float32Array([
        right[0] * radius, right[1] * radius, right[2] * radius, 0,
        direction[0] * length, direction[1] * length, direction[2] * length, 0,
        forward[0] * radius, forward[1] * radius, forward[2] * radius, 0,
        center[0], center[1], center[2], 1,
      ]);
      drawMesh(cylinder, model, color, 0.9);
    }

    function drawBrain(flyPose) {
      const output = [];
      const phase = state.time * 2.7;
      for (let i = 0; i < brainCloud.length; i++) {
        const cell = brainCloud[i];
        const point = localToWorld(cell.position, flyPose.position, flyPose.yaw);
        const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(phase + cell.phase));
        output.push(point[0], point[1], point[2], 0.34 + pulse * 0.35, 0.62 + pulse * 0.25, 1, 0.78);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(output), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 28, 0);
      gl.disableVertexAttribArray(locations.normal);
      gl.vertexAttrib3f(locations.normal, 0, 1, 0);
      gl.enableVertexAttribArray(locations.colorAttribute);
      gl.vertexAttribPointer(locations.colorAttribute, 4, gl.FLOAT, false, 28, 12);
      gl.uniformMatrix4fv(locations.model, false, identity);
      gl.uniform1f(locations.useVertexColor, 1);
      gl.uniform1f(locations.lighting, 0);
      gl.uniform1f(locations.pointSize, Math.max(2, Math.min(5, canvas.width / 270)));
      gl.drawArrays(gl.POINTS, 0, brainCloud.length);
      gl.disableVertexAttribArray(locations.colorAttribute);
      gl.enable(gl.DEPTH_TEST);
    }
  }
  window.requestAnimationFrame(frame);
}

function drawActivityChart() {
  const chart = ui.chart;
  if (!chart) return;
  const rect = chart.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  chart.width = Math.max(1, Math.floor(rect.width * ratio));
  chart.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = chart.getContext("2d");
  const width = chart.width;
  const height = chart.height;
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.lineWidth = ratio * 1.35;
  ctx.strokeStyle = "#8ba7ff";
  ctx.shadowColor = "#718cff88";
  ctx.shadowBlur = 7 * ratio;
  for (let x = 0; x <= width; x++) {
    const t = (x / width) * 15 + state.time * 0.42;
    const value = 0.50 + Math.sin(t * 1.1) * 0.13 + Math.sin(t * 2.6 + 0.4) * 0.08 + Math.sin(t * 4.4) * 0.035;
    const y = value * height;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

window.addEventListener("resize", drawActivityChart);
setInterval(drawActivityChart, 80);

function createProgram(context, vertexSource, fragmentSource) {
  const vertex = compileShader(context, context.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(context, context.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = context.createProgram();
  context.attachShader(program, vertex);
  context.attachShader(program, fragment);
  context.linkProgram(program);
  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    console.error(context.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function compileShader(context, kind, source) {
  const shader = context.createShader(kind);
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    console.error(context.getShaderInfoLog(shader));
    context.deleteShader(shader);
    return null;
  }
  return shader;
}

function createMesh(context, positions, normals, indices, colors = null) {
  const positionBuffer = context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
  context.bufferData(context.ARRAY_BUFFER, new Float32Array(positions), context.STATIC_DRAW);
  const normalBuffer = context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER, normalBuffer);
  context.bufferData(context.ARRAY_BUFFER, new Float32Array(normals), context.STATIC_DRAW);
  const indexBuffer = context.createBuffer();
  context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, indexBuffer);
  context.bufferData(context.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), context.STATIC_DRAW);
  let colorBuffer = null;
  if (colors) {
    colorBuffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, colorBuffer);
    context.bufferData(context.ARRAY_BUFFER, new Float32Array(colors), context.STATIC_DRAW);
  }
  return { positionBuffer, normalBuffer, indexBuffer, colorBuffer, count: indices.length };
}

function terrainHeight(x, z) {
  return Math.sin(x * 0.00125) * Math.cos(z * 0.00105) * 20 + Math.sin((x + z) * 0.00062) * 13 + Math.sin(x * 0.095) * Math.cos(z * 0.083) * 0.055;
}

function flyPoseAt(time) {
  const x = Math.sin(time * 0.13) * 7.2 + Math.sin(time * 0.37) * 1.8;
  const z = Math.cos(time * 0.105) * 8.4 + Math.sin(time * 0.29) * 1.6;
  const dx = Math.cos(time * 0.13) * 0.936 + Math.cos(time * 0.37) * 0.666;
  const dz = -Math.sin(time * 0.105) * 0.882 + Math.cos(time * 0.29) * 0.464;
  const flight = Math.pow(Math.max(0, Math.sin(time * 0.19 - 0.55)), 7);
  const feeding = Math.max(0, 1 - Math.abs(Math.sin(time * 0.07 + 0.8)) * 6);
  return {
    position: [x, terrainHeight(x, z) + 0.06 + flight * 0.58, z],
    yaw: Math.atan2(-dz, dx),
    flight,
    behavior: flight > 0.12 ? "short flight" : feeding > 0.2 ? "feeding pause" : "walking / exploring",
  };
}

function createTerrain(context, divisions, halfSize) {
  const positions = [], normals = [], colors = [], indices = [];
  const step = halfSize * 2 / divisions;
  for (let row = 0; row <= divisions; row++) {
    const z = -halfSize + row * step;
    for (let column = 0; column <= divisions; column++) {
      const x = -halfSize + column * step;
      positions.push(x, terrainHeight(x, z), z);
      const nx = terrainHeight(x + 1, z) - terrainHeight(x - 1, z);
      const nz = terrainHeight(x, z + 1) - terrainHeight(x, z - 1);
      normals.push(...normalize([-nx * 0.5, 1, -nz * 0.5]));
      const patch = 0.5 + Math.sin(x * 0.013 + Math.sin(z * 0.009)) * Math.cos(z * 0.017) * 0.16 + Math.sin(x * 0.074 + z * 0.058) * 0.045;
      colors.push(0.18 + patch * 0.09, 0.27 + patch * 0.12, 0.13 + patch * 0.055, 1);
    }
  }
  for (let row = 0; row < divisions; row++) {
    for (let column = 0; column < divisions; column++) {
      const a = row * (divisions + 1) + column;
      const b = a + divisions + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return createMesh(context, positions, normals, indices, colors);
}

function createGrassField(context, count, radius) {
  const positions = [], normals = [], colors = [], indices = [];
  const random = seededRandom(29413);
  const shades = [[0.18, 0.34, 0.14, 1], [0.26, 0.39, 0.16, 1], [0.13, 0.29, 0.13, 1], [0.37, 0.40, 0.18, 1]];
  function blade(x, z, angle, height, width, color) {
    const base = positions.length / 3;
    const sx = Math.cos(angle) * width, sz = Math.sin(angle) * width;
    const lean = height * (random() - 0.5) * 0.38;
    const ground = terrainHeight(x, z);
    const verts = [[x - sx, ground, z - sz], [x + sx, ground, z + sz], [x + Math.cos(angle + 1.2) * lean, ground + height, z + Math.sin(angle + 1.2) * lean]];
    const n = normalize(cross(subtract(verts[1], verts[0]), subtract(verts[2], verts[0])));
    verts.forEach((v) => { positions.push(...v); normals.push(...n); colors.push(...color); });
    indices.push(base, base + 1, base + 2);
  }
  for (let tuft = 0; tuft < count; tuft++) {
    const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * radius;
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
    const blades = 4 + Math.floor(random() * 3);
    for (let i = 0; i < blades; i++) blade(x + (random() - 0.5) * 0.28, z + (random() - 0.5) * 0.28, random() * Math.PI * 2, 0.45 + random() * 1.75, 0.035 + random() * 0.035, shades[Math.floor(random() * shades.length)]);
  }
  return createMesh(context, positions, normals, indices, colors);
}

function createFieldProps(seed) {
  const random = seededRandom(seed);
  const trees = [], bushes = [], rocks = [], flowers = [], hills = [], clouds = [];
  const greens = [[0.14, 0.29, 0.14], [0.19, 0.34, 0.16], [0.25, 0.37, 0.17], [0.21, 0.31, 0.12]];
  for (let i = 0; i < 27; i++) {
    const a = random() * Math.PI * 2, d = 520 + Math.sqrt(random()) * 3600;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, height = 360 + random() * 720, r = 160 + random() * 210;
    trees.push({ x, z, height, ground: terrainHeight(x, z), yaw: random() * Math.PI * 2, trunk: 13 + random() * 24,
      bark: [0.25 + random() * 0.08, 0.14 + random() * 0.06, 0.075 + random() * 0.04], leaf: greens[Math.floor(random() * greens.length)],
      crowns: [[0, -height * 0.02, 0, r * 1.2, r * 0.62, r], [r * 0.48, height * 0.02, r * 0.14, r * 0.84, r * 0.56, r * 0.76], [-r * 0.45, height * 0.01, -r * 0.16, r * 0.88, r * 0.58, r * 0.78]] });
  }
  const bushShades = [[0.17, 0.31, 0.13], [0.22, 0.36, 0.15], [0.30, 0.38, 0.17]];
  for (let i = 0; i < 28; i++) {
    const a = random() * Math.PI * 2, d = 28 + Math.sqrt(random()) * 240;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, s = 16 + random() * 32, ground = terrainHeight(x, z);
    bushes.push({ x, z, color: bushShades[Math.floor(random() * bushShades.length)], lobes: [[0, ground + s * 0.55, 0, s * 1.1, s * 0.8, s], [s * 0.55, ground + s * 0.72, s * 0.2, s * 0.76, s * 0.8, s * 0.72]] });
  }
  for (let i = 0; i < 24; i++) {
    const a = random() * Math.PI * 2, d = 5 + Math.sqrt(random()) * 44;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.45 + random() * 1.7;
    rocks.push({ x, z, y: terrainHeight(x, z) + s * 0.35, size: [s * 1.45, s * 0.72, s], yaw: random() * Math.PI, color: [0.35 + random() * 0.15, 0.34 + random() * 0.12, 0.29 + random() * 0.12] });
  }
  const petals = [[0.88, 0.74, 0.24], [0.82, 0.36, 0.32], [0.74, 0.68, 0.81], [0.88, 0.53, 0.67], [0.94, 0.86, 0.64]];
  for (let i = 0; i < 12; i++) {
    const a = random() * Math.PI * 2, d = 2.5 + Math.sqrt(random()) * 17;
    flowers.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, height: 4.5 + random() * 9, radius: 0.35 + random() * 0.45, stem: 0.035 + random() * 0.025, phase: random() * Math.PI * 2, petal: petals[Math.floor(random() * petals.length)] });
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, d = 4550 + random() * 500, x = Math.cos(a) * d, z = Math.sin(a) * d;
    hills.push({ position: [x, terrainHeight(x, z) - 120, z], size: [820 + random() * 500, 170 + random() * 220, 780 + random() * 450], yaw: random() * Math.PI });
  }
  for (let i = 0; i < 7; i++) {
    const a = random() * Math.PI * 2, d = 1900 + random() * 2400;
    clouds.push({ position: [Math.cos(a) * d, 1700 + random() * 900, Math.sin(a) * d], size: [240 + random() * 270, 35 + random() * 75, 110 + random() * 200] });
  }
  return { trees, bushes, rocks, flowers, hills, clouds };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function createSphere(context, columns, rows) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    const theta = v * Math.PI;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const phi = u * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(x, y, z);
      normals.push(x, y, z);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return createMesh(context, positions, normals, indices);
}

function createCylinder(context, sides) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let y = 0; y <= 1; y++) {
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x, y - 0.5, z);
      normals.push(x, 0, z);
    }
  }
  for (let i = 0; i < sides; i++) {
    const a = i;
    const b = i + sides + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return createMesh(context, positions, normals, indices);
}

function createPlane(context) {
  return createMesh(context,
    [-15, 0, -15, -15, 0, 15, 15, 0, 15, 15, 0, -15],
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 1, 2, 0, 2, 3]);
}

function createGridLines() {
  const lines = [];
  for (let i = -12; i <= 12; i++) {
    const major = i % 4 === 0;
    const alpha = major ? 0.33 : 0.16;
    const color = [0.28, 0.43, 0.52, alpha];
    const x = i * 0.5;
    const z = i * 0.5;
    pushLine(lines, [x, 0.004, -6], [x, 0.004, 6], color);
    pushLine(lines, [-6, 0.004, z], [6, 0.004, z], color);
  }
  return lines;
}

function createBrainCloud(count) {
  let seed = 492173;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cells = [];
  for (let i = 0; i < count; i++) {
    const cluster = i % 4;
    const centers = [
      [0.39, 1.10, 0],
      [0.16, 1.18, -0.02],
      [-0.02, 1.20, 0.02],
      [0.22, 0.97, 0],
    ];
    const center = centers[cluster];
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random());
    const x = center[0] + Math.cos(angle) * radius * 0.17;
    const y = center[1] + (random() - 0.5) * 0.22;
    const z = center[2] + Math.sin(angle) * radius * 0.18;
    cells.push({ position: [x, y, z], phase: random() * Math.PI * 2 });
  }
  return cells;
}

function pushLine(target, a, b, color) {
  target.push(a[0], a[1], a[2], color[0], color[1], color[2], color[3]);
  target.push(b[0], b[1], b[2], color[0], color[1], color[2], color[3]);
}

function localToWorld(point, origin, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [origin[0] + point[0] * c + point[2] * s, origin[1] + point[1], origin[2] - point[0] * s + point[2] * c];
}

function transform(position, size, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([
    c * size[0], 0, -s * size[0], 0,
    0, size[1], 0, 0,
    s * size[2], 0, c * size[2], 0,
    position[0], position[1], position[2], 1,
  ]);
}

function identityMatrix() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, 2 * near * far * range, 0,
  ]);
}

function lookAt(eye, target, up) {
  const z = normalize(subtract(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function normalize(v) {
  const len = length3(v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
function length3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(v, amount) { return [v[0] * amount, v[1] * amount, v[2] * amount]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function addInto(target, direction, amount) {
  target[0] += direction[0] * amount;
  target[1] += direction[1] * amount;
  target[2] += direction[2] * amount;
}
