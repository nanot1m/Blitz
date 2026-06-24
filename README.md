# Blitz

Blitz is a WebGPU canvas experiment backed by a C ECS compiled to WebAssembly.

The WASM module owns entities, components, selection, camera state, z-order, scene queries, and render extraction. TypeScript reads packed render data from WASM memory and uploads it to WebGPU. WGSL compute and render shaders cull and draw rectangles, triangles, circles, text, and interaction overlays.

## Requirements

- Node.js 20 or newer
- A browser with WebGPU support
- LLVM/Clang with `wasm-ld`, or Emscripten
- `mkcert` only when using the local MCP bridge

## Development

```sh
npm install
npm run dev
```

`npm run dev` rebuilds the font assets and WASM module before starting Vite.

Other commands:

```sh
npm run build       # Build WASM, type-check, and create the production bundle
npm run typecheck   # Type-check the browser and MCP code
npm run test:mcp    # Test the WASM adapter and secure MCP bridge
npm run preview     # Serve the production bundle locally
```

## Canvas controls

### Mouse and trackpad

- Primary click: select an object
- Primary drag on an object: move the current selection
- Primary drag on empty space: marquee-select
- Middle- or right-button drag: pan
- Wheel or two-axis trackpad scroll: pan
- Pinch gesture reported by the trackpad: zoom around the cursor
- `Delete` or `Backspace`: delete the current selection

The toolbar can add rectangles, circles, triangles, and text; change selection z-order; delete selected objects; show rendering statistics; and configure the MCP bridge.

### Phones and tablets

- Tap an object: select it
- Tap empty space: clear selection
- Drag an object: move it
- Drag empty space: pan
- Long-press empty space, then drag: marquee-select
- Two-finger pinch: pan and zoom

Moving more than eight CSS pixels changes a touch from a tap into a drag. An empty-space long press activates after 450 milliseconds.

## Local MCP bridge

Blitz includes a project-scoped MCP server that allows Codex or another MCP client to inspect and modify the canvas currently open in a browser.

```text
MCP client
    │ stdio
    ▼
mcp/server.ts
    │ authenticated WSS on 127.0.0.1
    ▼
browser bridge
    │ typed WASM calls
    ▼
Blitz ECS
```

The local connection requires:

- A locally trusted TLS certificate
- An exact browser-origin allowlist
- A shared token containing at least 24 characters

### Certificate and token setup

Install [`mkcert`](https://github.com/FiloSottile/mkcert), then run:

```sh
mkcert -install
mkdir -p .cert
mkcert \
  -key-file .cert/localhost-key.pem \
  -cert-file .cert/localhost.pem \
  localhost 127.0.0.1 ::1

openssl rand -hex 32 > .cert/bridge-token
chmod 600 .cert/bridge-token
```

The `.cert` directory is ignored by Git.

### Start the connection

1. Start or restart Codex from this repository. The project configuration at `.codex/config.toml` starts `blitz_canvas`.
2. Run the frontend:

   ```sh
   npm run dev
   ```

3. Open the settings button in the Blitz toolbar.
4. Enter:

   - URL: `wss://127.0.0.1:8787`
   - Token: the output of `cat .cert/bridge-token`

The bridge URL is stored in local storage. The token is stored only in the browser tab's session storage and is removed when the tab closes or **Disconnect** is selected.

Do not also run `npm run mcp:server` when Codex is already managing the server. Only one process can bind to port `8787`. Likewise, two Codex clients using this project simultaneously will compete for that port.

Vite normally uses port `5173`. If it selects another port because `5173` is occupied, add that exact origin to `BLITZ_BRIDGE_ORIGINS` and restart the MCP client.

### Allowed browser origins

The default allowlist is:

```text
http://127.0.0.1:5173
http://localhost:5173
https://nanot1m.github.io
```

Override it before starting Codex when necessary:

```sh
export BLITZ_BRIDGE_ORIGINS="http://127.0.0.1:5173,https://nanot1m.github.io"
```

For GitHub Pages, use the site origin without the repository path. WebSocket `Origin` values contain the scheme, host, and port—not the page path.

GitHub Pages can host the static Blitz frontend, WASM, shaders, and font atlas. It cannot run the MCP server. The local MCP process must still run on the user's computer, and the Pages origin must be allowed by that process.

### MCP tools

- `canvas_add_shapes`: add styled rectangles, triangles, circles, and text at explicit world-space coordinates
- `canvas_get_state`: return entity counts, selection count, camera center, zoom, and viewport size
- `canvas_get_scene`: return objects intersecting the viewport or supplied bounds, including geometry, styles, text, z-order, and selection state
- `canvas_find_empty_space`: find a non-overlapping rectangle within the visible viewport
- `canvas_delete_selected`: delete the current selection

The bridge exposes only these operations. It cannot execute arbitrary JavaScript or arbitrary WASM functions.

### Shape input

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
      "type": "circle",
      "x": 520,
      "y": 220,
      "radius": 64,
      "backgroundColor": "#33CC99",
      "strokeColor": "#075E54",
      "strokeWidth": 2
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

Coordinate rules:

- Rectangle and triangle `x`/`y`: top-left of the bounds
- Circle `x`/`y`: center
- Text `x`/`y`: top-left of the line box
- Colors: `#RRGGBB` or `#RRGGBBAA`

Agents should call `canvas_get_scene` before editing an existing composition and use `canvas_find_empty_space` when new content must avoid overlaps.

## Architecture

### WASM ECS

- Maximum entity slots: 2,000,000
- Components: position, size, selectable, rectangle view, triangle view, circle view, and text view
- Draw order: one entity-order stream shared by all shape types
- Selection: hit testing, dragging, marquee selection, deletion, and z-order changes run in C
- Scene inspection: a bounded packed query buffer exposes up to 65,536 ECS objects per browser query
- Text input: UTF-8 strings copied into a WASM-owned text pool

### Rendering

- Static shape IR: rectangle, triangle, and circle buffers plus a unified shape-command stream
- Dynamic IR: visible text glyphs and selection/marquee overlays
- GPU culling: a compute pass culls the static command stream against the camera
- Static capacity: four chunks of 250,000 shapes
- Upload policy: static buffers are refreshed only when their version changes
- Text: generated from the compiled font atlas and rendered through the same ordered pipeline

### TypeScript modules

- `src/main.ts`: WASM/WebGPU initialization, rendering loop, input coordination, and application wiring
- `src/ui.ts`: typed DOM lookup, icon initialization, and fallback presentation
- `src/mcp/bridge.ts`: authenticated browser WebSocket protocol and request validation
- `src/mcp/canvas-adapter.ts`: MCP-to-WASM operations, scene decoding, and empty-space search
- `mcp/server.ts`: stdio MCP server and secure local WSS endpoint

## WASM build

`scripts/build-wasm.mjs` first tries LLVM/Clang when `wasm-ld` is available and otherwise falls back to Emscripten. The output is written to:

```text
public/blitz.wasm
```

The core Clang flags are:

```sh
clang \
  --target=wasm32 \
  -O3 \
  -nostdlib \
  -Wl,--no-entry \
  -Wl,--export-memory \
  -o public/blitz.wasm \
  src/wasm/blitz.c
```

The build script also supplies an explicit linker export for every browser-facing WASM function.
