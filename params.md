# Tunable Parameters

## LOD toggle (minimal)

| param | values | default | purpose |
|-------|--------|---------|---------|
| **lod** | **0**, 1 | **0** | **0 = non-LoD (single .spz, full splats). 1 = LoD (worker + optional paged).** |

- **non-LoD** (default): load one `.spz` URL, render all splats; no worker, no chunking. Use `?splat=...` for URL.
- **LoD**: set `?lod=1`. Then `mode=source` (worker LoD) or `mode=paged` with `?paged=...-lod-0.spz`.

## SparkRenderer (NewSparkRenderer)

| param | range | current | purpose |
|-------|-------|---------|---------|
| maxStdDev | sqrt(4)..sqrt(9) | sqrt(4) | Gaussian extent; higher = more overlap, fewer gaps |
| minAlpha | 0..1/255 | 0.2/255 | Discard splats below; lower = fill gaps |
| sortRadial | bool | true | dist from eye; reduces black bars when turning |
| clipXY | 1.0..2.0 | 1.8 | Frustum clip margin; higher = less culling |
| blurAmount | 0..0.5 | 0.35 | 2D splat anti-aliasing |

### LoD-only (when lod=1)

| param | range | current | purpose |
|-------|-------|---------|---------|
| lodSplatScale | 0.5..4 | 2.0 | LoD splat count multiplier |
| lodRenderScale | 0.5..5 | 1.5 | Min screen px per splat; lower = keep tiny splats |
| coneFov0 | 0..90 | 40 | Foveation cone inner angle (deg) |
| coneFov | 0..180 | 120 | Foveation cone outer angle (deg) |
| coneFoveate | 0..1 | 0.95 | Detail falloff at coneFov |
| behindFoveate | 0..1 | 0.9 | Detail behind viewer; higher = fewer gaps |
| outsideFoveate | 0..1 | 1 | Periphery detail; 1 = full |
| maxPagedSplats | 65536+ | 8388608 | Paged buffer size (8GB target) |
| numLodFetchers | 1..4 | 3 | Parallel chunk fetchers |

## Adaptive LoD (when lod=1)

| param | range | current | purpose |
|-------|-------|---------|---------|
| lodScaleMin | 0.5..2 | 2.0 | Floor when frame rate drops |
| lodScaleMax | 1.5..4 | 3.5 | Ceiling when headroom |
| downshiftThresholdMs | 15..30 | 22 | Frame time to reduce detail; higher = keep quality longer |
| upshiftThresholdMs | 10..18 | 14.0 | Frame time to increase detail |
| adjustEveryMs | 500..2000 | 800 | Throttle between adjustments |
| downshiftStep | 0.02..0.1 | 0.05 | Step down on scale |
| upshiftStep | 0.02..0.08 | 0.05 | Step up on scale |

## Physics & collision (non-LoD only)

When `lod=0`, the scene uses **cannon-es**: gravity and a floor only (no walls), so you can walk freely into interiors.

- **Floor**: plane at scene AABB min Y (and a default at y=0 before load).
- **Movement**: WASD sets horizontal velocity; camera position is synced from the physics body each frame.

| param | current | purpose |
|-------|---------|---------|
| gravity | -9.82 | World gravity (y) |
| player radius | 0.4 | Collision sphere |
| bounds margin | 0.5 | Floor offset below AABB min Y |

## Controls

| param | range | current | purpose |
|-------|-------|---------|---------|
| moveSpeed | 1..20 | 8.0 | Units/sec WASD (in look direction) |
| sprintMultiplier | 1.5..4 | 2.5 | Shift multiplier |
| pointer lock | click canvas | - | Trackpad/mouse = look; ESC = unlock |

## URL params

| param | values | purpose |
|-------|--------|---------|
| **lod** | **0**, 1 | 0 = non-LoD (default), 1 = LoD |
| mode | source, paged | Load mode (when lod=1) |
| splat | URL | Source .spz URL |
| paged | URL | Paged -lod-0.spz URL (when lod=1) |
| oit | 1 | Enable weighted blended OIT (experimental) |

## WebGLRenderer

| param | current | purpose |
|-------|---------|---------|
| antialias | false | Disabled for splat perf |
| powerPreference | high-performance | GPU hint |
| devicePixelRatio | min(dpr, 2) | Cap for perf |

## Camera

| param | current | purpose |
|-------|---------|---------|
| fov | 60 | Vertical FOV (deg) |
| near | 0.5 | Near plane |
| far | 300 | Far plane |

## Debug toggles (B / Z keys)

| key | toggle | purpose |
|-----|--------|---------|
| B | Additive blend (1+1) | If black patches vanish → OIT/sorting issue |
| Z | depthWrite | If walls stop showing through → depth-ordering issue |
