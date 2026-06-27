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

// Beyond the former 1,000,000-entity cap: demand allocation lets entity count
// exceed a million, bounded now only by the render dispatch and wasm32 memory.
wasm.blitz_init();
wasm.blitz_set_actor_id(1, 1);
wasm.blitz_resize(1920, 1080);
const BEYOND_CAP = 1_100_000;
createGrid(BEYOND_CAP);
if (wasm.blitz_entity_count() !== BEYOND_CAP) {
  throw new Error(`Former 1M cap not lifted: expected ${BEYOND_CAP} entities, got ${wasm.blitz_entity_count()}.`);
}
const beyondBytes = wasm.blitz_scene_serialize();
if (wasm.blitz_scene_deserialize(beyondBytes) !== 0 || wasm.blitz_entity_count() !== BEYOND_CAP) {
  throw new Error(`Scene with ${BEYOND_CAP} entities did not survive a binary round trip.`);
}

// Dynamic stream growth: many in-view selected rects force the selection-overlay
// buffers (dyn_commands, dyn_rects) to grow well past their initial capacity.
wasm.blitz_clear_scene();
wasm.blitz_resize(1920, 1080);
wasm.blitz_set_camera(0, 0, 1);
const OVERLAYS = 4000;
for (let i = 0; i < OVERLAYS; i += 1) {
  wasm.blitz_create_rect(-380 + (i % 80) * 9, -280 + Math.floor(i / 80) * 9, 8, 8, 1, 0, 0, 1, 0, 0, 0, 1, 1);
}
wasm.blitz_select_all();
wasm.blitz_shape_command_ptr(); // triggers world_update_for_frame -> extract_dynamic
if (wasm.blitz_dyn_command_count() <= 256 || wasm.blitz_dyn_rect_count() <= 256) {
  throw new Error(
    `Dynamic overlay buffers did not grow past initial capacity (commands=${wasm.blitz_dyn_command_count()}, rects=${wasm.blitz_dyn_rect_count()}).`,
  );
}
// Scene query buffer growth: querying all the in-view objects returns far more
// than the initial capacity.
wasm.blitz_query_scene(-1e9, -1e9, 1e9, 1e9, 65536);
if (wasm.blitz_scene_query_count() <= 256) {
  throw new Error(`Scene query buffer did not grow past initial capacity (count=${wasm.blitz_scene_query_count()}).`);
}

// Text pool growth + pointer rebase: create enough text to relocate the pool
// past its initial capacity, then confirm every string survives a round trip.
// A mis-rebased pointer would change the serialized text lengths.
wasm.blitz_clear_scene();
const textEncoder = new TextEncoder();
const longText = "Blitz keeps the heap proportional to the scene contents. ".repeat(3);
const TEXT_ENTITIES = 600;
for (let i = 0; i < TEXT_ENTITIES; i += 1) {
  const bytes = textEncoder.encode(`${i} ${longText}`);
  new Uint8Array(wasm.memory.buffer, wasm.blitz_text_input_ptr(), bytes.byteLength).set(bytes);
  wasm.blitz_create_text(i * 4, i * 4, 16, 1, 1, 1, 1, bytes.byteLength, 0, 1.2, 1, 0);
}
if (wasm.blitz_entity_count() !== TEXT_ENTITIES) {
  throw new Error(`Expected ${TEXT_ENTITIES} text entities, got ${wasm.blitz_entity_count()}.`);
}
const textBytes1 = wasm.blitz_scene_serialize();
if (wasm.blitz_scene_deserialize(textBytes1) !== 0) {
  throw new Error("Text-heavy scene failed to deserialize.");
}
const textBytes2 = wasm.blitz_scene_serialize();
if (textBytes1 !== textBytes2 || wasm.blitz_entity_count() !== TEXT_ENTITIES) {
  throw new Error(
    `Text pool growth corrupted strings (bytes ${textBytes1} vs ${textBytes2}, count ${wasm.blitz_entity_count()}).`,
  );
}

wasm.blitz_clear_scene();
if (wasm.blitz_entity_count() !== 0) {
  throw new Error("Clearing the scene left entities behind.");
}

console.log(
  `Scene growth test passed (${COUNT} grid + ${stressCount} stress + ${BEYOND_CAP} beyond-1M + ${OVERLAYS} overlay + ${TEXT_ENTITIES} text entities).`,
);
