  import * as THREE from "three";
  import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
  import { NewSparkRenderer, SplatMesh } from "@sparkjsdev/spark";
  import { createOitPipeline, OIT_SPLAT_FRAGMENT } from "./oit-pipeline.js";
  import {
    createPhysicsWorld,
    addSceneCollision,
    setPlayerPosition,
    stepPhysics,
    syncCameraFromBody,
    EYE_HEIGHT,
    PLAYER_RADIUS,
  } from "./physics-scene.js";

  const query = new URLSearchParams(window.location.search);
  const SOURCE_SPLAT_URL = query.get("splat") ?? "https://public-spz.t3.storage.dev/cozy-spaceship_2.spz";
  const PAGED_LOD_URL = query.get("paged") ?? SOURCE_SPLAT_URL.replace(/\.(spz|ply|splat|ksplat)$/i, "-lod-0.spz");
  const LOAD_MODE = query.get("mode") ?? "source";
  const USE_OIT = query.get("oit") === "1";
  /** LOD: only enable when ?lod=1; default is non-LoD rendering */
  const USE_LOD = query.get("lod") === "1";

  const QUALITY_PROFILE = {
    maxStdDev: Math.sqrt(4),
    minAlpha: 0.2 * (1 / 255),
    clipXY: 1.8,
    blurAmount: 0.35,
    // LoD-only (ignored when USE_LOD is false)
    lodSplatScale: 2.0,
    lodRenderScale: 1.5,
    coneFov0: 40,
    coneFov: 120,
    coneFoveate: 0.95,
    behindFoveate: 0.9,
    outsideFoveate: 1,
    lodScaleMin: 2.0,
    lodScaleMax: 3.5,
  };

  // Scene setup
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

  // Spark renderer: non-LoD by default; ?lod=1 enables LoD (minimal toggle)
  const sparkOptions = {
    renderer: renderer,
    fragmentShader: USE_OIT ? OIT_SPLAT_FRAGMENT : undefined,
    sortRadial: true,
    clipXY: QUALITY_PROFILE.clipXY,
    blurAmount: QUALITY_PROFILE.blurAmount,
    maxStdDev: QUALITY_PROFILE.maxStdDev,
    minAlpha: QUALITY_PROFILE.minAlpha,
    enableLod: USE_LOD,
    enableDriveLod: USE_LOD,
  };
  if (USE_LOD) {
    Object.assign(sparkOptions, {
      outsideFoveate: QUALITY_PROFILE.outsideFoveate,
      lodSplatScale: QUALITY_PROFILE.lodSplatScale,
      lodRenderScale: QUALITY_PROFILE.lodRenderScale,
      coneFov0: QUALITY_PROFILE.coneFov0,
      coneFov: QUALITY_PROFILE.coneFov,
      coneFoveate: QUALITY_PROFILE.coneFoveate,
      behindFoveate: QUALITY_PROFILE.behindFoveate,
      maxPagedSplats: 8_388_608,
      numLodFetchers: 3,
    });
  }
  const spark = new NewSparkRenderer(sparkOptions);
  scene.add(spark);

  // Physics + collision (non-LoD only): gravity, floor, scene bounds
  let physics = null;
  if (!USE_LOD) {
    physics = createPhysicsWorld();
  }

  // OIT pipeline (when ?oit=1): MRT accum+reveal, composite pass
  let oitPipeline = null;
  if (USE_OIT) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    oitPipeline = createOitPipeline(renderer, size.x, size.y);
    // Per-buffer blend: accum (One,One), reveal (Zero, OneMinusSrcAlpha)
    spark.onBeforeRender = function (_, __, ___, ____, material) {
      const gl = renderer.getContext();
      if (gl.blendFunci) {
        gl.blendFunci(0, gl.ONE, gl.ONE);
        gl.blendFunci(1, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      }
    };
  }

  function makeStatusHud() {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "fixed",
      top: "12px",
      left: "12px",
      zIndex: "20",
      padding: "8px 10px",
      borderRadius: "8px",
      background: "rgba(0, 0, 0, 0.65)",
      color: "#d8e7ff",
      font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
      maxWidth: "64vw",
      whiteSpace: "pre-wrap",
      pointerEvents: "none",
    });
    document.body.appendChild(el);
    return (msg) => {
      el.textContent = msg;
    };
  }

  const setStatus = makeStatusHud();
  setStatus("Loading splat...");

  // Blending/depth debug toggles (B=additive one+one, Z=depthWrite)
  const debug = { additiveBlend: false, depthWrite: false };
  function updateDebugHud() {
    if (!splat) return;
    const parts = [USE_LOD ? "LoD" : "non-LoD"];
    if (physics) parts.push("physics");
    if (USE_OIT) parts.push("OIT");
    if (debug.additiveBlend) parts.push("blend: additive (1+1)");
    if (debug.depthWrite) parts.push("depthWrite: ON");
    setStatus(`Loaded · ${parts.join(" · ")}\nClick to lock · WASD · B/Z=debug`);
  }

  // Load the Splat
  let splat = null;

  function disposeSplatMesh(mesh) {
    if (!mesh) return;
    scene.remove(mesh);
    if (typeof mesh.dispose === "function") mesh.dispose();
  }

  async function tryLoadMesh(options) {
    const mesh = new SplatMesh(options);
    scene.add(mesh);
    if (mesh.initialized && typeof mesh.initialized.then === "function") {
      await mesh.initialized;
    } else {
      // Allow at least one frame for async loader startup.
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    return mesh;
  }

  function frameToMesh(mesh) {
    if (!mesh) return;
    let box;
    if (typeof mesh.getBoundingBox === "function") {
      try {
        box = mesh.getBoundingBox(true);
      } catch (_) {
        return;
      }
    } else {
      box = new THREE.Box3().setFromObject(mesh);
    }
    if (!box || box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    if (!Number.isFinite(size) || size <= 0) return;
    const distance = Math.max(2.5, size * 0.7);
    camera.position.copy(center).add(new THREE.Vector3(0, distance * 0.25, distance));
  }

  async function loadSplatWithFallback() {
    const loadUrl = SOURCE_SPLAT_URL;

    try {
      if (!USE_LOD) {
        setStatus(`Loading (non-LoD):\n${loadUrl}`);
        splat = await tryLoadMesh({
          url: loadUrl,
          paged: false,
          lod: false,
          enableLod: false,
        });
      } else {
        const usePaged = LOAD_MODE === "paged";
        const url = usePaged ? PAGED_LOD_URL : loadUrl;
        if (usePaged) {
          if (!url.includes("-lod-0.")) {
            setStatus(`Paged requires -lod-0.spz URL.\nFalling back: ${SOURCE_SPLAT_URL}`);
            splat = await tryLoadMesh({ url: SOURCE_SPLAT_URL, paged: false, lod: true, enableLod: true });
          } else {
            setStatus(`Loading paged LoD:\n${url}`);
            splat = await tryLoadMesh({ url, paged: true });
          }
        } else {
          setStatus(`Loading + worker LoD:\n${url}`);
          splat = await tryLoadMesh({ url, paged: false, lod: true, nonLod: true });
        }
      }
      frameToMesh(splat);
      if (physics && splat) {
        try {
          const box = splat.getBoundingBox
            ? splat.getBoundingBox(true)
            : new THREE.Box3().setFromObject(splat);
          const floorY = !box.isEmpty() ? addSceneCollision(physics.world, box) : null;
          if (floorY !== null) {
            setPlayerPosition(
              physics.playerBody,
              camera.position.x,
              floorY + PLAYER_RADIUS,
              camera.position.z
            );
          } else {
            setPlayerPosition(
              physics.playerBody,
              camera.position.x,
              camera.position.y - EYE_HEIGHT,
              camera.position.z
            );
          }
        } catch (e) {
          console.warn("Physics scene collision setup failed:", e);
        }
      }
      updateDebugHud();
    } catch (err) {
      console.error("Splat load failed:", err);
      disposeSplatMesh(splat);
      splat = null;
      setStatus(`Load failed.\n${err?.message ?? err}\nURL: ${loadUrl}`);
    }
  }

  // --- FP controls: one camera, PointerLock on canvas, same movement math for physics and non-physics ---

  const controls = new PointerLockControls(camera, renderer.domElement);
  renderer.domElement.addEventListener("click", () => {
    if (!document.pointerLockElement) controls.lock(true);
  });

  const keys = { w: false, a: false, s: false, d: false, shift: false };
  const moveSpeed = 8.0;
  const sprintMultiplier = 2.5;

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w") keys.w = true;
    else if (k === "s") keys.s = true;
    else if (k === "a") keys.a = true;
    else if (k === "d") keys.d = true;
    else if (e.key === "Shift") keys.shift = true;
    else if (k === "b") {
      debug.additiveBlend = !debug.additiveBlend;
      const m = spark.material;
      if (debug.additiveBlend) {
        m.blending = THREE.CustomBlending;
        m.blendSrc = THREE.OneFactor;
        m.blendDst = THREE.OneFactor;
      } else {
        m.blending = THREE.NormalBlending;
      }
      m.needsUpdate = true;
      updateDebugHud();
    }     else if (k === "z") {
      debug.depthWrite = !debug.depthWrite;
      spark.material.depthWrite = debug.depthWrite;
      spark.material.needsUpdate = true;
      updateDebugHud();
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w") keys.w = false;
    else if (k === "s") keys.s = false;
    else if (k === "a") keys.a = false;
    else if (k === "d") keys.d = false;
    else if (e.key === "Shift") keys.shift = false;
  });

  // Initial camera (overwritten by frameToMesh after load)
  camera.position.set(-7.33, 8, 5.7);
  camera.lookAt(-7.33, 6.05, -0.31);

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (oitPipeline) oitPipeline.setSize(w, h);
  });

  let lastTime = performance.now();
  let lastAdaptiveTuneMs = lastTime;
  let smoothedFrameMs = 16.0;
  const adaptiveState = {
    downshiftThresholdMs: 22,
    upshiftThresholdMs: 14.0,
    adjustEveryMs: 800,
    downshiftStep: 0.05,
    upshiftStep: 0.05,
  };

  function maybeTuneLodScale(nowMs, frameMs) {
    if (!USE_LOD || !splat) return;
    smoothedFrameMs = (smoothedFrameMs * 0.92) + (frameMs * 0.08);
    if (nowMs - lastAdaptiveTuneMs < adaptiveState.adjustEveryMs) return;
    lastAdaptiveTuneMs = nowMs;

    const currentScale = spark.lodSplatScale ?? QUALITY_PROFILE.lodSplatScale;
    let nextScale = currentScale;

    if (smoothedFrameMs > adaptiveState.downshiftThresholdMs) {
      nextScale = Math.max(QUALITY_PROFILE.lodScaleMin, currentScale - adaptiveState.downshiftStep);
    } else if (smoothedFrameMs < adaptiveState.upshiftThresholdMs) {
      nextScale = Math.min(QUALITY_PROFILE.lodScaleMax, currentScale + adaptiveState.upshiftStep);
    }

    if (nextScale !== currentScale) {
      spark.lodSplatScale = nextScale;
    }
  }

  loadSplatWithFallback();

  renderer.setAnimationLoop(() => {
    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    const frameMs = time - lastTime;
    lastTime = time;
    maybeTuneLodScale(time, frameMs);

    // Single movement math: forward/right from camera look, same for physics and non-physics
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const locked = document.pointerLockElement === renderer.domElement;
    if (locked) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
    }

    if (physics) {
      stepPhysics(physics.world, delta);
      if (locked && (keys.w || keys.s || keys.a || keys.d)) {
        const speed = moveSpeed * (keys.shift ? sprintMultiplier : 1);
        const v = physics.playerBody.velocity;
        v.x = 0;
        v.z = 0;
        if (keys.w) { v.x += forward.x * speed; v.z += forward.z * speed; }
        if (keys.s) { v.x -= forward.x * speed; v.z -= forward.z * speed; }
        if (keys.d) { v.x += right.x * speed; v.z += right.z * speed; }
        if (keys.a) { v.x -= right.x * speed; v.z -= right.z * speed; }
      }
      syncCameraFromBody(physics.playerBody, camera);
    } else if (locked && (keys.w || keys.s || keys.a || keys.d)) {
      const speed = moveSpeed * (keys.shift ? sprintMultiplier : 1) * delta;
      if (keys.w) camera.position.addScaledVector(forward, speed);
      if (keys.s) camera.position.addScaledVector(forward, -speed);
      if (keys.d) camera.position.addScaledVector(right, speed);
      if (keys.a) camera.position.addScaledVector(right, -speed);
    }

    if (USE_OIT && oitPipeline) {
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(oitPipeline.oitRT);
      oitPipeline.clearOitTarget(renderer.getContext());
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.autoClear = prevAutoClear;
      renderer.render(oitPipeline.compositeScene, oitPipeline.compositeCamera);
    } else {
      renderer.render(scene, camera);
    }
  });
