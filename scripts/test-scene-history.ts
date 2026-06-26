import { readFile } from "node:fs/promises";
import { createSceneHistory } from "../src/history/scene-history";

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as Record<string, CallableFunction> & {
  memory: WebAssembly.Memory;
};

wasm.blitz_init();
wasm.blitz_set_actor_id(1, 1);
wasm.blitz_resize(1000, 1000);

const errors: string[] = [];
const history = createSceneHistory(wasm as never, {
  onApplied() {},
  onError(message) {
    errors.push(message);
  },
});
const emptyStateId = history.stateId();

history.transact(() => {
  wasm.blitz_create_rect(0, 0, 100, 80, 1, 0, 0, 1, 0, 0, 0, 1, 1);
});
const createdStateId = history.stateId();
if (createdStateId === emptyStateId || wasm.blitz_entity_count() !== 1) {
  throw new Error("JavaScript history did not record object creation.");
}
if (!history.undo() || wasm.blitz_entity_count() !== 0 || history.stateId() !== emptyStateId) {
  throw new Error("JavaScript history did not undo object creation.");
}
if (!history.redo() || wasm.blitz_entity_count() !== 1 || history.stateId() !== createdStateId) {
  throw new Error("JavaScript history did not redo object creation.");
}

wasm.blitz_pointer_down(550, 540, 0);
wasm.blitz_pointer_up();
history.transact(() => wasm.blitz_set_selected_fill(0.25, 0.5, 0.75));
if (!history.undo()) {
  throw new Error("JavaScript history did not undo a style update.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
const item = new DataView(
  wasm.memory.buffer,
  wasm.blitz_scene_query_ptr(),
  wasm.blitz_scene_query_item_bytes(),
);
if (Math.abs(item.getFloat32(56, true) - 1) > 0.001) {
  throw new Error("Style undo restored the wrong fill color.");
}
if (!history.redo()) {
  throw new Error("JavaScript history did not redo a style update.");
}

wasm.blitz_pointer_down(550, 540, 0);
wasm.blitz_pointer_up();
history.begin();
wasm.blitz_set_selected_stroke(0.8, 0.6, 0.4);
history.commit();
if (!history.undo()) {
  throw new Error("JavaScript history did not undo a style control transaction.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
if (Math.abs(item.getFloat32(72, true)) > 0.001) {
  throw new Error("Style control transaction undo restored the wrong stroke color.");
}
if (!history.redo()) {
  throw new Error("JavaScript history did not redo a style control transaction.");
}

wasm.blitz_pointer_down(550, 540, 0);
wasm.blitz_pointer_up();
history.transact(wasm.blitz_delete_selected);
if (wasm.blitz_entity_count() !== 0 || !history.undo() || wasm.blitz_entity_count() !== 1) {
  throw new Error("JavaScript history did not restore a deleted object.");
}

wasm.blitz_set_camera(321, -123, 1.75);
history.transact(() => {
  wasm.blitz_create_circle(240, 200, 30, 0, 1, 0, 1, 0, 0, 0, 1, 1);
});
if (!history.undo()) {
  throw new Error("JavaScript history did not undo the second creation.");
}
const uniforms = new Float32Array(
  wasm.memory.buffer,
  wasm.blitz_uniform_ptr(),
  wasm.blitz_uniform_f32_count(),
);
if (
  Math.abs(uniforms[2] - 321) > 0.001 ||
  Math.abs(uniforms[3] + 123) > 0.001 ||
  Math.abs(uniforms[4] - 1.75) > 0.001
) {
  throw new Error("Undo unexpectedly changed the viewport.");
}

history.transact(() => {
  wasm.blitz_create_triangle(300, 0, 80, 80, 1, 1, 0, 1, 0, 0, 0, 1, 1);
});
if (history.redo()) {
  throw new Error("A new edit did not truncate the redo branch.");
}
if (errors.length > 0) {
  throw new Error(`History reported errors: ${errors.join("; ")}`);
}

wasm.blitz_clear_scene();
const largeEditEntityCount = 10_000;
for (let index = 0; index < largeEditEntityCount; index += 1) {
  wasm.blitz_create_rect(index * 2, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0);
}
wasm.blitz_select_all();
history.reset();
const performanceStart = performance.now();
history.transact(() => wasm.blitz_set_selected_fill(0.2, 0.3, 0.4));
if (!history.undo() || !history.redo()) {
  throw new Error("Large JavaScript history transaction could not be replayed.");
}
const performanceDuration = performance.now() - performanceStart;
if (performanceDuration > 500) {
  throw new Error(
    `Large JavaScript history transaction took ${performanceDuration.toFixed(1)} ms.`,
  );
}

wasm.blitz_select_all();
const deleteStart = performance.now();
history.transact(wasm.blitz_delete_selected);
const deleteDuration = performance.now() - deleteStart;
if (wasm.blitz_entity_count() !== 0 || deleteDuration > 500) {
  throw new Error(
    `Deleting ${largeEditEntityCount} entities took ${deleteDuration.toFixed(1)} ms or left live entities.`,
  );
}
if (!history.undo() || wasm.blitz_entity_count() !== largeEditEntityCount) {
  throw new Error("JavaScript history did not restore the bulk deletion.");
}

wasm.blitz_clear_scene();
history.reset();
const stressStart = performance.now();
history.transact(wasm.blitz_stress_test);
const stressEntities = wasm.blitz_entity_count();
const stressBytes = wasm.blitz_scene_serialize();
if (
  stressEntities < 700_000 ||
  stressBytes <= 16 * 1024 * 1024 ||
  !history.undo() ||
  wasm.blitz_entity_count() !== 0 ||
  !history.redo() ||
  wasm.blitz_entity_count() !== stressEntities
) {
  throw new Error("JavaScript history could not capture and restore the stress-test scene.");
}
const stressDuration = performance.now() - stressStart;
if (stressDuration > 2_000) {
  throw new Error(`Stress-test history round trip took ${stressDuration.toFixed(1)} ms.`);
}
wasm.blitz_select_all();
const stressDeleteStart = performance.now();
history.transact(wasm.blitz_delete_selected);
if (
  wasm.blitz_entity_count() !== 0 ||
  !history.undo() ||
  wasm.blitz_entity_count() !== stressEntities
) {
  throw new Error("JavaScript history could not restore a full stress-scene deletion.");
}
const stressDeleteDuration = performance.now() - stressDeleteStart;
if (stressDeleteDuration > 2_000) {
  throw new Error(
    `Stress-scene deletion round trip took ${stressDeleteDuration.toFixed(1)} ms.`,
  );
}

console.log("JavaScript scene history test passed.");
