import { readFile } from "node:fs/promises";

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as Record<string, CallableFunction> & {
  memory: WebAssembly.Memory;
};

wasm.blitz_init();
wasm.blitz_set_actor_id(0x12345678, 0x9abcdef0);

const readObjectId = (offset: number): number[] => {
  const view = new DataView(wasm.memory.buffer);
  return [0, 4, 8, 12].map((wordOffset) => view.getUint32(offset + wordOffset, true));
};

const objectIdEquals = (left: number[], right: number[]) =>
  left.every((word, index) => word === right[index]);
if (wasm.blitz_entity_count() !== 0) {
  throw new Error("A newly initialized scene should be empty.");
}

wasm.blitz_resize(1000, 1000);
wasm.blitz_history_reset();
const emptyHistoryState = wasm.blitz_history_state_id();
wasm.blitz_create_rect(0, 0, 100, 80, 1, 0, 0, 1, 0, 0, 0, 1, 1);
const createdHistoryState = wasm.blitz_history_state_id();
if (createdHistoryState === emptyHistoryState) {
  throw new Error("Creating an object did not advance the history state.");
}
if (!wasm.blitz_history_undo() || wasm.blitz_entity_count() !== 0) {
  throw new Error("Core history did not undo object creation.");
}
if (wasm.blitz_history_state_id() !== emptyHistoryState) {
  throw new Error("Undo did not restore the previous history state.");
}
if (!wasm.blitz_history_redo() || wasm.blitz_entity_count() !== 1) {
  throw new Error("Core history did not redo object creation.");
}
if (wasm.blitz_history_state_id() !== createdHistoryState) {
  throw new Error("Redo did not restore the created history state.");
}
wasm.blitz_pointer_down(550, 540, 0);
wasm.blitz_pointer_up();
wasm.blitz_set_selected_fill(0.25, 0.5, 0.75);
if (!wasm.blitz_history_undo()) {
  throw new Error("Core history did not undo a style update.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
const undoneItem = new DataView(
  wasm.memory.buffer,
  wasm.blitz_scene_query_ptr(),
  wasm.blitz_scene_query_item_bytes(),
);
if (Math.abs(undoneItem.getFloat32(56, true) - 1) > 0.001) {
  throw new Error("Undo did not restore the previous fill color.");
}
if (!wasm.blitz_history_redo()) {
  throw new Error("Core history did not redo a style update.");
}
wasm.blitz_pointer_down(550, 540, 0);
wasm.blitz_pointer_up();
wasm.blitz_delete_selected();
if (!wasm.blitz_history_undo() || wasm.blitz_entity_count() !== 1) {
  throw new Error("Core history did not restore a deleted object.");
}
wasm.blitz_create_circle(240, 200, 30, 0, 1, 0, 1, 0, 0, 0, 1, 1);
const orderedId = readObjectId(wasm.blitz_last_created_object_id_ptr());
wasm.blitz_send_to_back();
if (!wasm.blitz_history_undo()) {
  throw new Error("Core history did not undo a draw-order update.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 10);
{
  const count = wasm.blitz_scene_query_count();
  const itemBytes = wasm.blitz_scene_query_item_bytes();
  const base = wasm.blitz_scene_query_ptr();
  const view = new DataView(wasm.memory.buffer);
  let restoredOrder = -1;
  for (let index = 0; index < count; index += 1) {
    const offset = base + index * itemBytes;
    if (objectIdEquals(readObjectId(offset), orderedId)) {
      restoredOrder = view.getUint32(offset + 20, true);
    }
  }
  if (restoredOrder !== 1) {
    throw new Error(`Undo restored the wrong draw order: ${restoredOrder}.`);
  }
}

wasm.blitz_clear_scene();
wasm.blitz_load_demo_template();
if (wasm.blitz_entity_count() === 0) {
  throw new Error("The demo template did not create any objects.");
}

wasm.blitz_clear_scene();
wasm.blitz_resize(1000, 1000);
wasm.blitz_set_camera(0, 0, 1);
wasm.blitz_create_rect(-100, -50, 200, 100, 0.2, 0.4, 0.8, 1, 0.1, 0.2, 0.3, 1, 2);
if (wasm.blitz_selected_style_kind() !== 1) {
  throw new Error("A selected rectangle did not expose geometric styles.");
}
wasm.blitz_set_selected_fill(0.9, 0.1, 0.2);
wasm.blitz_set_selected_fill_opacity(0.4);
wasm.blitz_set_selected_stroke(0.2, 0.8, 0.3);
wasm.blitz_set_selected_stroke_opacity(0.65);
wasm.blitz_set_selected_stroke_width(6);
const selectedStyle = new Float32Array(
  wasm.memory.buffer,
  wasm.blitz_selected_style_ptr(),
  wasm.blitz_selected_style_f32_count(),
);
if (
  Math.abs(selectedStyle[0] - 0.9) > 0.001 ||
  Math.abs(selectedStyle[3] - 0.4) > 0.001 ||
  Math.abs(selectedStyle[5] - 0.8) > 0.001 ||
  Math.abs(selectedStyle[7] - 0.65) > 0.001 ||
  Math.abs(selectedStyle[8] - 6) > 0.001
) {
  throw new Error("Selected shape style updates were not written to ECS components.");
}
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
  Math.abs(resizedItem.getFloat32(40, true) + 120) > 0.001 ||
  Math.abs(resizedItem.getFloat32(44, true) + 70) > 0.001 ||
  Math.abs(resizedItem.getFloat32(48, true) - 220) > 0.001 ||
  Math.abs(resizedItem.getFloat32(52, true) - 120) > 0.001
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
if (Math.abs(resizedItem.getFloat32(48, true) - 250) > 0.001) {
  throw new Error("Rectangle edge resize did not update its width.");
}
if (!wasm.blitz_history_undo()) {
  throw new Error("Core history did not undo edge resizing.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
if (Math.abs(resizedItem.getFloat32(48, true) - 220) > 0.001) {
  throw new Error("Undo did not restore the previous rectangle width.");
}
if (!wasm.blitz_history_redo()) {
  throw new Error("Core history did not redo edge resizing.");
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
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 10);
const firstStableId = readObjectId(wasm.blitz_scene_query_ptr());
const revisionBeforeSelectAll = wasm.blitz_scene_revision();
wasm.blitz_select_all();
if (wasm.blitz_selected_count() !== originalEntities) {
  throw new Error("Select all did not select every scene object.");
}
if (wasm.blitz_scene_revision() !== revisionBeforeSelectAll) {
  throw new Error("Select all should not mark the scene as modified.");
}
if (wasm.blitz_selected_style_kind() !== 3) {
  throw new Error("Mixed selection did not expose geometry and text style capabilities.");
}
wasm.blitz_set_selected_fill(0.15, 0.25, 0.35);
wasm.blitz_set_selected_text_color(0.7, 0.6, 0.5);
wasm.blitz_set_selected_text_opacity(0.45);
const mixedStyle = new Float32Array(
  wasm.memory.buffer,
  wasm.blitz_selected_style_ptr(),
  wasm.blitz_selected_style_f32_count(),
);
if (
  Math.abs(mixedStyle[0] - 0.15) > 0.001 ||
  Math.abs(mixedStyle[9] - 0.7) > 0.001 ||
  Math.abs(mixedStyle[12] - 0.45) > 0.001
) {
  throw new Error("Mixed selection styles were not applied to supported entities.");
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
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 10);
const restoredStableId = readObjectId(wasm.blitz_scene_query_ptr());
if (!objectIdEquals(restoredStableId, firstStableId)) {
  throw new Error("Stable object IDs changed during the binary round trip.");
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

const v2Bytes = new Uint8Array(32 + 80);
v2Bytes.set(fileBytes.subarray(0, 32), 0);
v2Bytes.set(fileBytes.subarray(32, 32 + 80), 32);
const v2View = new DataView(v2Bytes.buffer);
v2View.setUint32(4, 2, true);
v2View.setUint32(8, v2Bytes.byteLength, true);
v2View.setUint32(12, 1, true);
v2View.setUint32(36, 80, true);
new Uint8Array(wasm.memory.buffer, wasm.blitz_scene_file_buffer_ptr(), v2Bytes.byteLength).set(
  v2Bytes,
);
if (wasm.blitz_scene_deserialize(v2Bytes.byteLength) !== 0) {
  throw new Error("Version 2 scene migration failed.");
}
wasm.blitz_query_scene(-1000, -1000, 1000, 1000, 1);
const migratedId = readObjectId(wasm.blitz_scene_query_ptr());
if (
  migratedId[0] !== 0 ||
  migratedId[1] !== 0 ||
  migratedId[2] !== 0 ||
  migratedId[3] !== firstStableId[3]
) {
  throw new Error(`Version 2 object ID was not migrated correctly: ${migratedId.join(",")}.`);
}

console.log(`Binary scene round-trip passed (${byteCount} bytes).`);
