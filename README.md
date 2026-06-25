# Blitz

Blitz is a WebGPU canvas experiment backed by a C ECS compiled to WebAssembly.

The WASM module owns entities, components, selection, camera state, z-order, scene queries, and render extraction. TypeScript reads packed render data from WASM memory and uploads it to WebGPU. WGSL compute and render shaders cull and draw rectangles, triangles, circles, text, and interaction overlays.

Blitz starts with an empty canvas. The initial panel can open a local scene, reopen a recent scene, focus the shape tools, or create the built-in demo slide template. The panel disappears as soon as the scene contains an object and returns when the scene becomes empty.

The demo slide is composed from the same base rectangle and text ECS constructors used by user-created and agent-created content; the template only supplies positions and styles.

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
npm run setup:mcp   # Run the interactive local MCP setup
npm run test:mcp    # Test the WASM adapter and secure MCP bridge
npm run test:storage # Test binary scene serialization and restoration
npm run preview     # Serve the production bundle locally
```

## Canvas controls

### Mouse and trackpad

- Primary click: select an object
- Primary drag on an object: move the current selection
- Drag a corner or edge handle on a single selected rectangle, circle, or triangle: resize it
- Primary drag on empty space: marquee-select
- Middle- or right-button drag: pan
- Wheel or two-axis trackpad scroll: pan
- Pinch gesture reported by the trackpad: zoom around the cursor
- `Delete` or `Backspace`: delete the current selection

The toolbar can add rectangles, circles, triangles, and text; change selection z-order; delete selected objects; show rendering statistics; and configure the MCP bridge.
On touch-first screens up to 620 CSS pixels wide, the shape actions collapse into a dropdown and the toolbar remains at least 10 pixels from the viewport edges. Narrow desktop windows keep the full toolbar.

Selecting items opens a contextual style island containing every style supported by the selection. Color controls include an opacity slider from `0` to `1`. Geometric controls apply to selected rectangles, circles, and triangles; text color applies only to selected text. Unsupported entities are skipped. Style edits update ECS view components directly and mark the scene as modified.

Keyboard shortcuts:

- `Ctrl/Cmd+A`: select all objects
- `Ctrl/Cmd+O`: open the file picker
- `Ctrl/Cmd+S`: save the current file
- `Ctrl/Cmd+Z`: undo
- `Ctrl/Cmd+Y` or `Ctrl/Cmd+Shift+Z`: redo

Undo/redo is owned by a TypeScript history controller. WASM serializes the current binary scene state into a 128 MB arena, while JavaScript owns transactions, branching, saved-state IDs, and a bounded stack of up to 64 states or 256 MB. Applying history preserves the current viewport and restores structural scene data through the validated WASM deserializer.

## Local scene files

Click the Open action to show **Open File**, a divider, and the recent-file list. Click the Save action to show **Save**, **Save As**, and a **Save current viewpoint** option.

The binary format is serialized and deserialized entirely inside WASM. It preserves:

- Shape type, position, size, styles, text, and draw order
- Stable 128-bit object IDs
- An optional starting viewpoint

Current files use format version 4. Versions 1–3 remain readable; legacy IDs are migrated into the 128-bit namespace and older text records receive single-line layout defaults.

Chromium browsers use the File System Access API, allowing subsequent saves to overwrite the selected file. Browsers without that API use file upload and download fallbacks.

When supported, the most recent ten file handles are stored in IndexedDB. Reopening an entry checks file permission again, and individual entries can be removed from the list. Browsers that cannot persist file handles simply keep the regular Open action.

Panning and zooming are view-only operations: they do not mark the scene as modified and regular saves preserve the file's existing starting viewpoint. Enable **Save current viewpoint** to make the current camera center and zoom the viewpoint restored the next time the file opens.

Selection is session-only UI state. Selecting, deselecting, or marquee-selecting objects is not written to scene files and does not mark the scene as modified.

WASM exposes a monotonic scene revision covering persisted changes such as geometry, text, and z-order. A gray dot appears on the Save icon while the current revision differs from the last successful save or load. Closing or reloading a page with unsaved changes triggers the browser's standard unsaved-changes confirmation. Browsers do not permit reliable asynchronous saving during page unload, so the application warns rather than attempting a silent final save.

The current version uses a 128 MB WASM file buffer, enough for one million fixed-size shape records plus normal text payloads. Files include a magic number, format version, total byte count, camera header, and variable-length shape records. Invalid files are fully validated before the live scene is replaced.

### Phones and tablets

- Tap an object: select it
- Tap empty space: clear selection
- Drag an object: move it
- Drag empty space: pan
- Long-press empty space, then drag: marquee-select
- Two-finger pinch: pan and zoom

Moving more than eight CSS pixels changes a touch from a tap into a drag. An empty-space long press activates after 450 milliseconds.
Native page scrolling, pull-to-refresh, text selection, touch callouts, and overscroll are disabled across the canvas interface. Text selection remains enabled inside settings form fields.

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

The local connection uses:

- A locally trusted TLS certificate
- An exact browser-origin allowlist
- A shared token containing at least 24 characters

### Guided setup

Run:

```sh
npm run setup:mcp
```

The interactive setup clears the terminal and opens a live dashboard. The browser URL, token, MCP server state, MCP client state, and canvas connection state remain at the top while status refreshes. It creates the localhost certificate and bridge token when missing. If [`mkcert`](https://github.com/FiloSottile/mkcert) is missing and a supported package manager is available, the CLI offers to install it.

The dashboard can launch a standalone bridge for connection diagnostics. Normal MCP tool use remains client-managed because the MCP transport is `stdio`: Codex or another MCP client must start `npm run mcp:server` and own that process's standard input/output.

Useful options:

```sh
npm run setup:mcp -- --print # Print the current connection instructions
npm run setup:mcp -- --force # Rotate the certificate and bridge token
npm run setup:mcp -- --yes   # Complete setup without interactive prompts
```

The generated files are stored in the Git-ignored `.cert` directory with owner-only permissions for the private key and token.

### Start the connection

1. Run `npm run setup:mcp` if setup has not already completed.
2. Start or restart your MCP client:

   - Codex uses `.codex/config.toml`.
   - Claude Code uses the project-scoped `.mcp.json`. On first use, approve `blitz_canvas` in Claude or through `/mcp`.

   Both configurations start `blitz_canvas` automatically.
3. Run the frontend:

   ```sh
   npm run dev
   ```

4. Open the settings button in the Blitz toolbar.
5. Enter the URL and token printed by the setup command.

The default URL is `wss://127.0.0.1:8787`.

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

The planned hosted, multi-user authentication design is documented in [`docs/ed25519-auth-plan.md`](docs/ed25519-auth-plan.md). It is not part of the current local bridge.

### MCP tools

- `canvas_add_shapes`: add styled rectangles, triangles, circles, and text at explicit world-space coordinates
- `canvas_update_objects`: partially update geometry, styles, and wrapped text by stable object ID
- `canvas_get_state`: return entity counts, selection count, camera center, zoom, and viewport size
- `canvas_get_scene`: return objects intersecting the viewport or supplied bounds, including geometry, styles, text, z-order, and selection state
- `canvas_get_text_capabilities`: return the exact supported Unicode code-point ranges and unsupported-glyph replacement behavior
- `canvas_measure_text`: validate, wrap, and batch-measure text with exact content/object bounds, line advance, cap/x-height, ascender/descender, and first/last baseline offsets
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
Agents should call `canvas_get_text_capabilities` when choosing a character set and `canvas_measure_text` before adding or laying out text. Text should not be added when a measurement returns `supported: false`; unsupported code points render as `U+FFFD` replacement glyphs.
Agents should use `canvas_update_objects` with IDs returned by `canvas_get_scene` when correcting an existing composition instead of adding replacement objects on top.

Text shapes support optional `maxWidth`, `lineHeight`, `maxLines`, and `align` (`left`, `center`, or `right`). `maxWidth` enables word wrapping; explicit newline characters always start a new line. Measurement and rendering share the same WASM layout implementation.
MCP text creation rejects unsupported glyphs and layouts that overflow `maxLines`, forcing the caller to measure and correct the content instead of silently producing clipped text.

For card and slide layouts, text can instead provide a `box` with `x`, `y`, `width`, `height`, `padding`, and `verticalAlign`. Blitz derives the usable wrapping width and exact text origin; `canvas_measure_text` returns that origin as `placement`. This is preferred over manually positioning text from font metrics.

Use `verticalAlign: "cap-middle"` with `align: "center"` for single digits, initials, or other short labels inside circular badges. It centers the visible cap-height region instead of the font's larger line box.

## Architecture

### WASM ECS

- Maximum entity slots: 1,000,000
- Components: position, size, selectable, rectangle view, triangle view, circle view, and text view
- Draw order: one entity-order stream shared by all shape types
- Selection: hit testing, dragging, marquee selection, deletion, and z-order changes run in C
- Resize capability: an ECS `RESIZABLE` component enables shared corner controls for geometric shapes; text omits the component
- Scene inspection: a bounded packed query buffer exposes up to 65,536 ECS objects per browser query
- File persistence: versioned `.blitz` binary serialization is owned by WASM
- Identity: 128-bit actor/sequence object IDs are generated and owned by WASM
- History: a bounded TypeScript snapshot stack uses WASM binary serialization and validation
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
- `src/input/user-events.ts`: canvas pointer, touch, wheel, and keyboard interaction handling
- `src/mcp/bridge.ts`: authenticated browser WebSocket protocol and request validation
- `src/mcp/canvas-adapter.ts`: MCP-to-WASM operations, scene decoding, and empty-space search
- The bug button in the toolbar manually enables a selected-entity debugger showing ECS component masks and current component values.
- `src/storage/scene-file.ts`: browser file picker/download integration for WASM binary scenes
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
