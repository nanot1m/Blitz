import { readFile } from "node:fs/promises";
import { createCanvasMcpAdapter, type BlitzMcpExports } from "../src/mcp/canvas-adapter";

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as unknown as BlitzMcpExports & {
  blitz_init(): void;
  blitz_resize(width: number, height: number): void;
};
wasm.blitz_init();
wasm.blitz_resize(1200, 675);

const adapter = createCanvasMcpAdapter(wasm, {
  stopDragging() {},
  updateSelectionState() {},
});

const added = adapter.addShapes([
  {
    type: "rect",
    x: 2000,
    y: 2100,
    width: 240,
    height: 120,
    backgroundColor: "#3366CC80",
    strokeColor: "#112233",
    strokeWidth: 4,
  },
  {
    type: "text",
    x: 2050,
    y: 2250,
    text: "Scene query text",
    fontSize: 42,
    color: "#FFFFFF",
  },
]);
if (added.added !== 2 || added.ids.length !== 2) {
  throw new Error(`Unexpected add result: ${JSON.stringify(added)}`);
}
if (
  added.ids[0] === added.ids[1] ||
  !added.ids.every((id) => /^[0-9a-f]{16}:[0-9a-f]{16}$/.test(id))
) {
  throw new Error(`Object IDs were not returned as unique 128-bit strings: ${added.ids.join(", ")}`);
}

const scene = adapter.getScene({
  bounds: { x: 1900, y: 2000, width: 500, height: 400 },
  limit: 10,
});
if (
  scene.returned !== 2 ||
  scene.total !== 2 ||
  scene.truncated ||
  scene.objects[0]?.backgroundColor !== "#3366CC80" ||
  scene.objects[1]?.text !== "Scene query text"
) {
  throw new Error(`Unexpected scene query: ${JSON.stringify(scene)}`);
}

const empty = adapter.findEmptySpace({
  width: 120,
  height: 80,
  padding: 16,
  scope: "viewport",
  ignoreLargeBackgrounds: true,
});
if (!empty.found) {
  throw new Error(`Expected empty viewport space: ${JSON.stringify(empty)}`);
}

console.log("Canvas MCP adapter test passed.");
