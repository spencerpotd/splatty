![Spark LOD Stream](splash.png)

# Spark LOD Stream

A minimal example project demonstrating Gaussian splat streaming with [SparkJS](https://github.com/sparkjsdev/spark). It now follows Spark 2.0 preview LoD guidance with quality-first tuning for Chrome on Apple Silicon M2.

## Live Demo

[https://sparklodstream.netlify.app/](https://sparklodstream.netlify.app/)

## Features

- **Spark 2.0 LoD**: Uses `SparkRenderer` + tuned LoD settings (`lodSplatScale`, `lodRenderScale`, cone/behind foveation)
- **RAD-first loading**: Prebuilt `.rad` assets with `paged: true` for coarse-to-fine streaming
- **Adaptive guardrails**: Frame-time based dynamic adjustment of `lodSplatScale` for stability
- **VR Support**: WebXR with hand tracking via `SparkXr`
- **Mobile Controls**: Virtual joystick for touch devices
- **Desktop Controls**: WASD/arrow keys + mouse look via `SparkControls`

## Setup

```bash
npm install
npm run dev
```

## Build and Deploy

```bash
npm run build
npx netlify-cli deploy --prod --dir=dist
```

## Usage

### Build RAD LoD assets (recommended)

Use Spark's offline LoD builder for better quality:

```bash
npm run build-lod -- my-scene.spz --quality
```

This outputs `my-scene-lod.rad`, which can be streamed with `paged: true`.

### Runtime URL modes

The viewer supports simple query-based load selection:

- `?mode=rad&rad=https://.../my-scene-lod.rad` (default mode)
- `?mode=source&splat=https://.../my-scene.spz` (fallback; builds LoD in worker)

If `rad` is omitted in `mode=rad`, the app derives one by replacing source extension with `-lod.rad`.

## Project Structure

```
index.html          - Entry point
main.js             - Scene setup, controls, animation loop
mobile-controls.js  - Virtual joystick for touch devices
lib/                - Local Spark build
  spark.module.js
  spark.module.js.map
  spark_internal_rs_bg.wasm
```

## Updating Spark

To update the local Spark preview build (default path `../spark`):

```bash
./update-spark.sh
```

You can override the source path:

```bash
SPARK_ROOT=/path/to/spark ./update-spark.sh
```

By default, Vite aliases `@sparkjsdev/spark` to `./lib/spark.module.js`.  
Set `USE_LOCAL_SPARK=0` to disable aliasing and use package resolution instead.

## Benchmark Checklist (M2 + Chrome)

Run the same camera path before/after changes and capture:

- Cold start to first visible coarse frame (`mode=rad`)
- Time-to-full-detail convergence while stationary
- Median FPS and P95 frame time over 30-60s navigation
- Stability during rapid rotation (black bars/pop-in/regressions)
- Memory behavior over long movement sessions (paging churn/stalls)

## License

MIT
