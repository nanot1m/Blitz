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
Press `P` for pushback mode, `R` for rect mode, `T` for triangle mode, or `C` for circle mode. Click in a shape mode to replace nearby shapes with that shape. Use `[` and `]` to adjust the active cursor radius.

## Local MCP Bridge

Blitz includes a project-scoped MCP server that lets an AI agent add shapes to the canvas open in your browser. The MCP server communicates with the page over a TLS WebSocket bound only to `127.0.0.1`.

The connection requires all three controls:

- A locally trusted TLS certificate
- An exact browser-origin allowlist
- A shared token of at least 24 characters

### One-time certificate setup

Install [`mkcert`](https://github.com/FiloSottile/mkcert), then create a certificate:

```sh
mkcert -install
mkdir -p .cert
mkcert \
  -key-file .cert/localhost-key.pem \
  -cert-file .cert/localhost.pem \
  localhost 127.0.0.1 ::1
```

The `.cert` directory is ignored by Git.

### Start Codex with bridge credentials

Generate a token and export the exact origins allowed to connect:

```sh
openssl rand -hex 32 > .cert/bridge-token
chmod 600 .cert/bridge-token
export BLITZ_BRIDGE_ORIGINS="http://127.0.0.1:5173,https://nanot1m.github.io"
```

The token file is ignored by Git. `BLITZ_BRIDGE_ORIGINS` is optional because the server includes the local Vite origins and `https://nanot1m.github.io` by default. Start or restart Codex in this repository; the project configuration in `.codex/config.toml` starts the MCP server automatically.

Run Blitz:

```sh
npm run dev
```

Open the settings button in the Blitz toolbar and enter:

- URL: `wss://127.0.0.1:8787`
- Token: the output of `cat .cert/bridge-token`

The URL is stored in local storage. The token is stored only in session storage and is removed when the tab closes or you select **Disconnect**.

For GitHub Pages, retain the exact origin `https://nanot1m.github.io`. URL paths are not part of a browser WebSocket `Origin`, so the repository path is not included.

### MCP tools

- `canvas_add_shapes`: add styled rectangles, circles, triangles, or text at explicit world-space coordinates
- `canvas_get_state`: return entity and selection counts
- `canvas_get_scene`: inspect visible or explicitly bounded ECS objects, including geometry, styles, text, order, and selection
- `canvas_find_empty_space`: find a viewport rectangle that does not overlap existing object bounds
- `canvas_delete_selected`: delete the current canvas selection

The bridge intentionally exposes only these operations; it does not permit arbitrary JavaScript or WASM calls.

Example:

```json
{
  "shapes": [
    {
      "type": "rect",
      "x": 100,
      "y": 80,
      "width": 320,
      "height": 180,
      "backgroundColor": "#3366CC80",
      "strokeColor": "#112233",
      "strokeWidth": 4
    },
    {
      "type": "text",
      "x": 140,
      "y": 130,
      "text": "Hello Blitz",
      "fontSize": 42,
      "color": "#FFFFFF"
    }
  ]
}
```

Rectangle and triangle coordinates refer to the top-left of their bounds. Circle coordinates refer to its center. Text coordinates refer to the top-left of its line box. Colors accept `#RRGGBB` and `#RRGGBBAA`.

The browser-side MCP implementation is isolated under `src/mcp/`:

- `bridge.ts` owns the authenticated WebSocket protocol and request validation.
- `canvas-adapter.ts` translates protocol operations into WASM calls and scene queries.
- `main.ts` only wires the adapter to the initialized Blitz WASM instance and settings UI.

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
