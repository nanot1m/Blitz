import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as Record<string, CallableFunction> & {
  memory: WebAssembly.Memory;
};

const readObjectId = (offset: number): number[] => {
  const view = new DataView(wasm.memory.buffer);
  return [0, 4, 8, 12].map((wordOffset) => view.getUint32(offset + wordOffset, true));
};

const readLastCreatedObjectId = () => readObjectId(wasm.blitz_last_created_object_id_ptr());

const time = (label: string, fn: () => void) => {
  const start = performance.now();
  fn();
  const duration = performance.now() - start;
  return { label, duration };
};

const assertUnder = (label: string, duration: number, maxMs: number) => {
  if (duration > maxMs) {
    throw new Error(`${label} took ${duration.toFixed(1)} ms; expected <= ${maxMs} ms.`);
  }
};

const runDrag = (startX: number, startY: number, endX: number, endY: number) => {
  const pointerDown = time("pointer_down", () => {
    const mode = wasm.blitz_pointer_down(startX, startY, 0);
    if (mode !== 1) {
      throw new Error(`Expected entity drag pointer mode, received ${mode}.`);
    }
  });
  const pointerMove = time("pointer_move", () => {
    wasm.blitz_pointer_move(endX, endY);
  });
  const pointerUp = time("pointer_up", () => {
    wasm.blitz_pointer_up();
  });
  return { pointerDown, pointerMove, pointerUp };
};

const printResult = (name: string, result: ReturnType<typeof runDrag>) => {
  console.log(
    `${name}: down=${result.pointerDown.duration.toFixed(1)} ms, ` +
      `move=${result.pointerMove.duration.toFixed(1)} ms, ` +
      `up=${result.pointerUp.duration.toFixed(1)} ms`,
  );
};

wasm.blitz_init();
wasm.blitz_set_actor_id(0x42454e43, 0x484d4152);
wasm.blitz_resize(1000, 1000);
wasm.blitz_set_camera(0, 0, 1);

const containerCount = 5_000;
wasm.blitz_clear_scene();
for (let index = 0; index < containerCount; index += 1) {
  const x = (index % 100) * 28;
  const y = Math.floor(index / 100) * 28;
  wasm.blitz_create_rect(x, y, 20, 20, 0.8, 0.8, 1, 1, 0, 0, 0, 1, 1);
  const containerId = readLastCreatedObjectId();
  if (wasm.blitz_set_container(...containerId, 1) !== 1) {
    throw new Error("Failed to create benchmark container.");
  }
  wasm.blitz_create_rect(x + 4, y + 4, 8, 8, 1, 0.8, 0.8, 1, 0, 0, 0, 1, 1);
  const childId = readLastCreatedObjectId();
  if (wasm.blitz_set_relative_transform(...childId, ...containerId, 4, 4) !== 1) {
    throw new Error("Failed to attach benchmark child.");
  }
}
wasm.blitz_select_all();
const bulkResult = runDrag(510, 510, 540, 540);
printResult(`${containerCount} container trees`, bulkResult);
assertUnder("Bulk container pointer_up", bulkResult.pointerUp.duration, 250);

wasm.blitz_clear_scene();
const stressSetup = time("stress_setup", () => {
  wasm.blitz_stress_test();
});
const stressEntities = wasm.blitz_entity_count();
wasm.blitz_select_all();
// Last stress slide center. Using the last slide avoids reverse hit-test scanning
// the whole draw order before drag starts; this benchmark focuses on drag commit.
wasm.blitz_set_camera(123_380, 37_125, 1);
const stressResult = runDrag(500, 500, 536, 536);
printResult(`stress scene (${stressEntities} entities, setup=${stressSetup.duration.toFixed(1)} ms)`, stressResult);
assertUnder("Stress container pointer_up", stressResult.pointerUp.duration, 1_500);

console.log("Container drag benchmarks passed.");
