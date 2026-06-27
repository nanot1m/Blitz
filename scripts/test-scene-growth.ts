import { readFile } from "node:fs/promises";

// Exercises the paths the demand-allocation refactor will change: creating many
// entities (array growth past any initial capacity), free-slot reuse after a
// bulk delete, and serialize -> deserialize at scale. Passes against today's
// fixed arrays and must keep passing once the World struct grows on demand.

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as Record<string, CallableFunction> & {
  memory: WebAssembly.Memory;
};

const COUNT = 60_000;

const createGrid = (count: number) => {
  for (let i = 0; i < count; i += 1) {
    const x = (i % 1000) * 12;
    const y = Math.floor(i / 1000) * 12;
    wasm.blitz_create_rect(x, y, 10, 10, 1, 0, 0, 1, 0, 0, 0, 1, 1);
  }
};

const totalInScene = (): number => {
  wasm.blitz_query_scene(-1e9, -1e9, 1e9, 1e9, 65536);
  return wasm.blitz_scene_query_total();
};

wasm.blitz_init();
wasm.blitz_set_actor_id(1, 1);
wasm.blitz_resize(1920, 1080);

createGrid(COUNT);
if (wasm.blitz_entity_count() !== COUNT) {
  throw new Error(`Expected ${COUNT} entities after bulk create, got ${wasm.blitz_entity_count()}.`);
}
if (totalInScene() !== COUNT) {
  throw new Error(`Scene query total ${totalInScene()} did not match ${COUNT} created entities.`);
}

const byteCount = wasm.blitz_scene_serialize();
if (byteCount <= 0) {
  throw new Error("Serializing a large scene returned no bytes.");
}
if (wasm.blitz_scene_deserialize(byteCount) !== 0) {
  throw new Error("Deserializing a large scene failed validation.");
}
if (wasm.blitz_entity_count() !== COUNT) {
  throw new Error(`Entity count changed across a large binary round trip: ${wasm.blitz_entity_count()}.`);
}

wasm.blitz_select_all();
wasm.blitz_delete_selected();
if (wasm.blitz_entity_count() !== 0) {
  throw new Error(`Bulk delete left ${wasm.blitz_entity_count()} entities behind.`);
}

// Recreating after a full delete must reuse freed slots and stay consistent.
createGrid(COUNT);
if (wasm.blitz_entity_count() !== COUNT || totalInScene() !== COUNT) {
  throw new Error("Recreating entities after a bulk delete did not restore a consistent scene.");
}

// Heavier growth than the manual grid, straight from the shipped stress builder.
wasm.blitz_init();
wasm.blitz_stress_test();
const stressCount = wasm.blitz_entity_count();
if (stressCount <= COUNT) {
  throw new Error(`Stress scene was not large enough to test growth: ${stressCount} entities.`);
}
const stressBytes = wasm.blitz_scene_serialize();
if (wasm.blitz_scene_deserialize(stressBytes) !== 0 || wasm.blitz_entity_count() !== stressCount) {
  throw new Error(`Stress scene (${stressCount} entities) did not survive a binary round trip.`);
}

wasm.blitz_clear_scene();
if (wasm.blitz_entity_count() !== 0) {
  throw new Error("Clearing the scene left entities behind.");
}

console.log(`Scene growth test passed (${COUNT} grid + ${stressCount} stress entities).`);
