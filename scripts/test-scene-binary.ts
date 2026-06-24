import { readFile } from "node:fs/promises";

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as Record<string, CallableFunction> & {
  memory: WebAssembly.Memory;
};

wasm.blitz_init();
if (wasm.blitz_entity_count() !== 0) {
  throw new Error("A newly initialized scene should be empty.");
}

wasm.blitz_load_demo_template();
if (wasm.blitz_entity_count() === 0) {
  throw new Error("The demo template did not create any objects.");
}

wasm.blitz_clear_scene();
wasm.blitz_resize(1000, 1000);
wasm.blitz_set_camera(0, 0, 1);
wasm.blitz_create_rect(-100, -50, 200, 100, 0.2, 0.4, 0.8, 1, 0.1, 0.2, 0.3, 1, 2);
if (wasm.blitz_pointer_down(400, 450, 0) !== 3) {
  throw new Error("The rectangle northwest resize handle was not detected.");
}
wasm.blitz_pointer_move(380, 430);
wasm.blitz_pointer_up();
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
const resizedItem = new DataView(
  wasm.memory.buffer,
  wasm.blitz_scene_query_ptr(),
  wasm.blitz_scene_query_item_bytes(),
);
if (
  Math.abs(resizedItem.getFloat32(32, true) + 120) > 0.001 ||
  Math.abs(resizedItem.getFloat32(36, true) + 70) > 0.001 ||
  Math.abs(resizedItem.getFloat32(40, true) - 220) > 0.001 ||
  Math.abs(resizedItem.getFloat32(44, true) - 120) > 0.001
) {
  throw new Error("Rectangle resize did not update ECS position and size.");
}
if (wasm.blitz_resize_mode_at(600, 490) !== 8) {
  throw new Error("The rectangle east edge did not expose an east-west resize cursor.");
}
if (wasm.blitz_pointer_down(600, 490, 0) !== 8) {
  throw new Error("The rectangle east edge resize handle was not detected.");
}
wasm.blitz_pointer_move(630, 490);
wasm.blitz_pointer_up();
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
if (Math.abs(resizedItem.getFloat32(40, true) - 250) > 0.001) {
  throw new Error("Rectangle edge resize did not update its width.");
}

wasm.blitz_clear_scene();
const emptyRevision = wasm.blitz_scene_revision();
wasm.blitz_set_camera(321, -123, 1.75);
if (wasm.blitz_scene_revision() !== emptyRevision) {
  throw new Error("Changing the viewport should not mark the scene as modified.");
}
wasm.blitz_create_rect(10, 20, 200, 100, 0.2, 0.4, 0.8, 0.5, 0.1, 0.2, 0.3, 1, 4);
wasm.blitz_create_circle(400, 220, 64, 0.2, 0.8, 0.5, 1, 0.1, 0.3, 0.2, 1, 2);
wasm.blitz_create_triangle(-80, 50, 120, 90, 1, 0.8, 0.4, 1, 0.8, 0.2, 0.1, 1, 3);

const text = new TextEncoder().encode("Binary scene ✓");
new Uint8Array(wasm.memory.buffer, wasm.blitz_text_input_ptr(), text.byteLength).set(text);
wasm.blitz_create_text(30, 300, 42, 1, 1, 1, 1, text.byteLength);
if (wasm.blitz_scene_revision() === emptyRevision) {
  throw new Error("Scene mutations did not advance the revision.");
}

const originalEntities = wasm.blitz_entity_count();
const revisionBeforeSelectAll = wasm.blitz_scene_revision();
wasm.blitz_select_all();
if (wasm.blitz_selected_count() !== originalEntities) {
  throw new Error("Select all did not select every scene object.");
}
if (wasm.blitz_scene_revision() !== revisionBeforeSelectAll) {
  throw new Error("Select all should not mark the scene as modified.");
}
const revisionBeforeSelectionChange = wasm.blitz_scene_revision();
wasm.blitz_clear_selection();
if (wasm.blitz_scene_revision() !== revisionBeforeSelectionChange) {
  throw new Error("Changing selection should not mark the scene as modified.");
}
const defaultViewByteCount = wasm.blitz_scene_serialize();
if (defaultViewByteCount <= 32) {
  throw new Error(`Serialization failed with byte count ${defaultViewByteCount}.`);
}
const defaultViewHeader = new DataView(
  wasm.memory.buffer,
  wasm.blitz_scene_file_buffer_ptr(),
  32,
);
if (
  Math.abs(defaultViewHeader.getFloat32(16, true)) > 0.001 ||
  Math.abs(defaultViewHeader.getFloat32(20, true)) > 0.001 ||
  Math.abs(defaultViewHeader.getFloat32(24, true) - 1) > 0.001
) {
  throw new Error("A regular save unexpectedly captured the current viewport.");
}

wasm.blitz_capture_start_viewpoint();
const byteCount = wasm.blitz_scene_serialize();
if (byteCount <= 32) {
  throw new Error(`Serialization failed with byte count ${byteCount}.`);
}
const fileBytes = new Uint8Array(
  wasm.memory.buffer,
  wasm.blitz_scene_file_buffer_ptr(),
  byteCount,
).slice();
// Older files may contain selection flags in this reserved record field.
new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength).setUint32(32 + 8, 1, true);

wasm.blitz_clear_scene();
if (wasm.blitz_entity_count() !== 0) {
  throw new Error("Scene clear failed.");
}
new Uint8Array(wasm.memory.buffer, wasm.blitz_scene_file_buffer_ptr(), byteCount).set(fileBytes);
const loadError = wasm.blitz_scene_deserialize(byteCount);
if (loadError !== 0) {
  throw new Error(`Deserialization failed with error ${loadError}.`);
}
if (wasm.blitz_entity_count() !== originalEntities) {
  throw new Error("Entity count changed during the binary round trip.");
}
if (wasm.blitz_selected_count() !== 0) {
  throw new Error("Selection state should not be restored from a scene file.");
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
  throw new Error(`Camera state was not restored: ${JSON.stringify(Array.from(uniforms.slice(0, 5)))}`);
}

wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 10);
if (wasm.blitz_scene_query_total() !== 4) {
  throw new Error(`Expected four restored objects, received ${wasm.blitz_scene_query_total()}.`);
}

const liveBeforeInvalidFile = wasm.blitz_entity_count();
const fileBuffer = new Uint8Array(wasm.memory.buffer, wasm.blitz_scene_file_buffer_ptr(), byteCount);
fileBuffer[0] ^= 0xff;
if (wasm.blitz_scene_deserialize(byteCount) !== 2) {
  throw new Error("Invalid file magic was not rejected.");
}
if (wasm.blitz_entity_count() !== liveBeforeInvalidFile) {
  throw new Error("Invalid input modified the live scene.");
}

console.log(`Binary scene round-trip passed (${byteCount} bytes).`);
