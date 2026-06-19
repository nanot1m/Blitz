# Blitz

Blitz is a tiny Clang-to-WASM canvas experiment with WebGPU rendering. The C module owns the ECS world, camera, spatial index, and visible render extraction. TypeScript reads the extracted render IR directly from exported WASM memory, uploads changed visible chunks to WebGPU, and a WGSL shader renders analytic stroked rectangles.

## Requirements

- Node.js 20+
- A browser with WebGPU enabled
- Clang with WebAssembly target support for `npm run build`

## Run

```sh
npm install
npm run build:wasm
npm run dev
```

Open the local Vite URL and drag to pan. Use the mouse wheel or trackpad scroll to zoom around the cursor.
Press `P` for pushback mode or `T` for triangle mode. Use `[` and `]` to adjust the active cursor radius.

## ECS Shape

- Entity: a plain integer index
- Components: `position`, `size`, and `rect-view`
- Capacity: 1,000,000 stored rect entities
- Spatial index: fixed uniform grid for camera culling
- Render IR: visible packed `RectDraw` records exported through WASM linear memory
- Uploads: 65,536-rect WebGPU chunks, refreshed only when the render-list version changes

## Build Details

The WASM build command compiles `src/wasm/blitz.c` with:

```sh
clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry -Wl,--export=memory
```

The produced module is written to `public/blitz.wasm`.
