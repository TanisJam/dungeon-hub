# Exploration — 3D Map Editor / VTT Arc

> **Status**: pre-SDD scoping. Architecture LOCKED, engine choice OPEN. No code yet, no rush.
> **Engram**: `vtt-map-editor/architecture` (#2086, locked) supersedes `vtt-map-editor/render-tech` (#2076, Konva plan — dropped).
> **Last updated**: 2026-06-09

A Dungeondraft-style map creator that grows into a full VTT inside dungeon-hub. Long-horizon arc. Foundations-first.

---

## North star vs MVP

- **North star (deferred)**: full immersive 3D — free-orbit camera, walk the world. Explicitly NOT the starting point.
- **MVP**: a 2D-feeling tactical VTT + map editor, mobile-friendly, where the scene is 3D *underneath* so we get elevation and POV snapshots from day one.

The classic solo-dev failure mode is letting the coolest-possible-vision murder the shippable product. We avoid it by making the data/engine 3D-capable now but shipping the tactical 2D-looking experience first.

---

## Core architectural decision (LOCKED)

**The 3D scene is the SOURCE OF TRUTH.** The "2D VTT" is not a separate 2D stack — it is an orthographic top-down camera on the 3D scene.

### One engine, multiple cameras

| Camera | Purpose | Cost |
|---|---|---|
| **Orthographic top-down** | Tactical VTT view. Looks/feels 2D, mobile-friendly, but 3D underneath. | Cheap (ortho, modest poly counts). |
| **Perspective @ token eye-height** | **POV snapshot** — on-demand SINGLE-FRAME render: a photo of what the character sees *right now*. | Cheap — it's a still, not a walking sim. No movement netcode, no continuous mobile 3D. Can render on-demand / server-side and cache as an image. |
| **Free-orbit** | The deferred north star (full immersive 3D). | Nearly free *later*, because the scene is already 3D. |

### Why this collapses the earlier multi-renderer plan

The previous plan (Konva editor + Pixi play + future 3D, glued together) maintained parallel 2D + 3D representations of the same scene — worse engineering. A single 3D scene with multiple cameras replaces all of it.

- **Elevation/height is NATIVE** — real 3D space. No "fake 2.5D" cues. Multi-level dungeons, vision/cover by height fall out naturally.
- The **POV snapshot** is only possible because the scene is real 3D geometry — you can't photograph a top-down sprite from the side.

---

## Scene hierarchy (the "infinite canvas" feature)

It is NOT one infinite canvas. It is a hierarchy of scenes, Google-Maps style:

```
Continent map  →  region / city / POI pin  →  [enter]  →  Battlemap scene (3D)
```

- **Continent / world map** → **Leaflet** (+ `Simple` CRS + pre-generated image tiles). Separate from the 3D engine — it's a hand-drawn tiled image with pan/zoom + POI markers. This is a *solved problem* in the fantasy-map community; do not reinvent it with a game engine.
- **Entering a POI = entering a battlemap scene** with its own local coordinate origin. This single decision solves three things at once:
  1. **Float precision** — continent + dungeon in one coordinate space blows out float dynamic range (GIS / Minecraft "far lands" problem). Nested scenes with local origins eliminate it.
  2. **Performance** — only load the active scene.
  3. **"Vision only in dungeon mode"** — vision/fog is a property of the battlemap scene, free.

---

## Scene data model (Phase 0 — domain, pure, no render)

The data model is the contract and must be born **3D-capable** from day 0. Retrofitting elevation later = repaint everything.

Must encode (render-agnostic):
- Coordinate system + grid (units per square), per-scene local origin.
- **Z / elevation axis** + discrete **levels/floors**. Vision + geometry computed per level.
- Wall geometry as segments, **with height**. Block-vision / block-movement flags.
- Doors / windows as special segments (toggle; window blocks movement not vision).
- Lights (point + radius + color), per level.
- Asset placements — refs that point to **3D meshes** (with known heights), not sprites.
- Serialization + round-trip (first-class test concern per CLAUDE.md §5).

The walls/doors/lights/windows are **a geometry graph with play semantics**, not art.

---

## Assets — image-to-3D pipeline (load-bearing from DAY 1)

Going 3D-source-of-truth means 3D assets are part of MVP, not deferred.

- Image-to-3D is production-grade in 2026 for individual props/characters:
  - **Rodin Gen-2** — clean quad topology, T/A pose, "drop into pipeline without cleanup".
  - **Tripo** — ~8s, game-ready topology, auto-rig.
  - **Meshy** — most versatile (text + image to 3D).
  - **Hunyuan3D** — open weights, PBR, self-hostable.
- ⚠️ Assets are the *easy 10%*. They do NOT build a level (collision, walls, vision, navigable space) — that's the engine + editor + data-model work.
- Existing **Dungeondraft 2D top-down sprites** are demoted to floor textures / billboards at best. Assets are free-use; Mauricio can also make his own simple ones.

---

## Accepted costs (confirmed, eyes open)

1. **3D assets load-bearing from day 1** — image-to-3D pipeline is MVP, not deferred. Dungeondraft sprites demoted.
2. **Editor becomes a 3D level editor** (place objects with heights) — harder than 2D drag-drop.
3. **Mobile risk rises** — mitigated by: ortho cam is cheap + WebGPU is now mobile-viable (Safari iOS 26, Metal-backed, ~70% global support, WebGPU-primary + WebGL-fallback pattern) + POV is on-demand stills. **Mobile-FRIENDLY, not mobile-first** — the documented exception to CLAUDE.md §2.

---

## OPEN decision — 3D engine

| Option | Pros | Cons |
|---|---|---|
| **react-three-fiber (Three.js)** ← leaning | Declarative, fits Next.js / React 19, trivial camera swaps, R3F + drei ecosystem, WebGPU backend. | Less batteries-included (physics/collision are add-ons). |
| **Babylon.js** | Batteries-included: physics, collision, asset loading, scene tooling. Owlbear used it for physics. | Less idiomatic in a React app. |

Leaning **R3F** because of the React stack. Not yet decided — settle in `sdd-explore`.

---

## Proposed phasing

- **Phase 0** — Scene data model (domain, pure, 3D-capable, round-trip tested).
- **Phase 1** — Editor MVP (3D level editor; ortho top-down view; place assets, walls w/ height, doors/windows/lights; save).
- **Phase 2** — POV snapshot (perspective cam at eye-height, on-demand frame render).
- **Phase 3** — Play layer / VTT (vision ray-casting vs walls per level, fog-of-war, token movement w/ collision, door toggle).
- **Phase 4+** — World map (Leaflet tiled continent + POI → enter scene).
- **North star (deferred)** — free-orbit immersive 3D.

---

## Next step

Candidate **`sdd-explore`** to close: engine choice (R3F vs Babylon), 3D scene data model, image-to-3D asset pipeline, Leaflet world layer, multi-camera approach. With real repo reading + research. No code. Not yet committed.

---

## Reference links (from research, 2026)

- [Owlbear Rodeo — Warp Core / GPU effects](https://blog.owlbear.rodeo/owlbear-rodeo-2-3-release-week-day-4/) · [legacy stack (Konva + Babylon)](https://deepwiki.com/owlbear-rodeo/owlbear-rodeo-legacy)
- [PixiJS v8 (WebGPU backend)](https://pixijs.com/blog/pixi-v8-launches) · [Fabric vs Konva vs Pixi 2026](https://www.pkgpulse.com/guides/fabricjs-vs-konva-vs-pixijs-canvas-2d-graphics-2026)
- [WebGPU in all major browsers](https://web.dev/blog/webgpu-supported-major-browsers) · [WebGPU in iOS 26](https://appdevelopermagazine.com/webgpu-in-ios-26/)
- [AI 3D model generators 2026 (Rodin/Tripo/Meshy/Hunyuan3D)](https://www.indiehackers.com/post/best-ai-3d-model-generator-in-2026-i-tested-9-of-the-best-and-here-is-what-i-found-70ecab1a0a) · [Meshy — AI 3D game assets](https://www.meshy.ai/blog/best-ai-tools-for-3d-game-assets)
- [Tabula Sono — in-browser 3D VTT](https://tabulasono.com/) · [Talespire reality check](https://alternativeto.net/software/talespire/)
