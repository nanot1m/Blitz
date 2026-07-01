import { readFile } from "node:fs/promises";

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports;

wasm.blitz_init();
wasm.blitz_set_actor_id(1, 1);
wasm.blitz_resize(1000, 1000);
wasm.blitz_set_camera(500, 500, 1); // screen == world

const ITEM = wasm.blitz_scene_query_item_bytes();
let failures = 0;
function check(label, ok) {
  if (!ok) {
    failures += 1;
    console.error(`  FAIL: ${label}`);
  } else {
    console.log(`  ok:   ${label}`);
  }
}

function snapshot() {
  const count = wasm.blitz_query_scene(-1e6, -1e6, 1e6, 1e6, 1_000_000);
  const base = wasm.blitz_scene_query_ptr();
  const view = new DataView(wasm.memory.buffer, base, count * ITEM);
  const map = new Map();
  for (let i = 0; i < count; i += 1) {
    const o = i * ITEM;
    map.set(view.getUint32(o + 12, true), {
      kind: view.getUint32(o + 16, true),
      x: view.getFloat32(o + 40, true),
      y: view.getFloat32(o + 44, true),
      w: view.getFloat32(o + 48, true),
      h: view.getFloat32(o + 52, true),
      fillR: view.getFloat32(o + 56, true),
      fillG: view.getFloat32(o + 60, true),
      fillB: view.getFloat32(o + 64, true),
      strokeWidth: view.getFloat32(o + 88, true),
      parentSeq: view.getUint32(o + 124, true),
    });
  }
  return map;
}
const near = (a, b) => Math.abs(a - b) < 0.01;

// --- 1. Create / undo / redo round-trip for each shape kind ----------------
console.log("create -> undo -> redo, per shape kind");
wasm.blitz_create_rect(10, 20, 30, 40, 0.1, 0.2, 0.3, 1, 0, 0, 0, 1, 2);
wasm.blitz_create_circle(200, 200, 25, 0.4, 0.5, 0.6, 1, 0, 0, 0, 1, 3);
wasm.blitz_create_triangle(400, 0, 60, 80, 0.7, 0.8, 0.9, 1, 0, 0, 0, 1, 1);
check("3 creates -> 3 transactions undoable", wasm.blitz_history_can_undo() === 1);
check("entity_count is 3", wasm.blitz_entity_count() === 3);
const afterCreates = snapshot();
const rectSeq = snapshot().keys().next().value; // first key is the rect

wasm.blitz_history_undo();
wasm.blitz_history_undo();
wasm.blitz_history_undo();
check("undo all 3 -> empty", wasm.blitz_entity_count() === 0);
check("cannot undo past empty", wasm.blitz_history_can_undo() === 0);
check("can redo", wasm.blitz_history_can_redo() === 1);

wasm.blitz_history_redo();
wasm.blitz_history_redo();
wasm.blitz_history_redo();
check("redo all 3 -> 3 entities", wasm.blitz_entity_count() === 3);
const replayed = snapshot();
let fidelity = afterCreates.size === replayed.size;
for (const [seq, before] of afterCreates) {
  const after = replayed.get(seq);
  fidelity = fidelity && after && before.kind === after.kind &&
    near(before.x, after.x) && near(before.w, after.w) &&
    near(before.fillR, after.fillR) && near(before.strokeWidth, after.strokeWidth);
}
check("redo restores identical object_ids, kinds, geometry, style", fidelity);

// --- 2. Modify (style) -> undo restores prior value ------------------------
console.log("style modify -> undo / redo");
wasm.blitz_select_all();
wasm.blitz_set_selected_fill(0.95, 0.05, 0.5);
check("fill changed", near(snapshot().get(rectSeq).fillR, 0.95));
wasm.blitz_history_undo();
check("undo restores original fill", near(snapshot().get(rectSeq).fillR, 0.1));
wasm.blitz_history_redo();
check("redo re-applies fill", near(snapshot().get(rectSeq).fillR, 0.95));
wasm.blitz_history_undo(); // leave fills at original for later asserts

// --- 3. Move (drag) -> undo restores position ------------------------------
console.log("drag move -> undo restores position");
wasm.blitz_clear_selection();
wasm.blitz_pointer_down(25, 40, 0); // rect center (10..40, 20..60) -> ~ (25,40)
wasm.blitz_pointer_move(125, 240);
wasm.blitz_pointer_up();
const moved = snapshot().get(rectSeq);
check("rect moved by drag", near(moved.x, 110) && near(moved.y, 220));
wasm.blitz_history_undo();
const back = snapshot().get(rectSeq);
check("undo restores rect position", near(back.x, 10) && near(back.y, 20));

// --- 4. Delete -> undo restores (incl. object_id + geometry) ---------------
console.log("delete -> undo restores");
wasm.blitz_select_all();
wasm.blitz_delete_selected();
check("delete clears scene", wasm.blitz_entity_count() === 0);
wasm.blitz_history_undo();
check("undo restores deleted count", wasm.blitz_entity_count() === 3);
const restored = snapshot();
check("undo restores rect identity + geometry",
  restored.has(rectSeq) && near(restored.get(rectSeq).x, 10) &&
  near(restored.get(rectSeq).fillR, 0.1));

// --- 5. Path (variable payload) round-trip ---------------------------------
console.log("path create -> delete -> undo");
const pathInput = new Float32Array(wasm.memory.buffer, wasm.blitz_path_input_ptr(), 16);
const pts = [[600, 600], [650, 620], [700, 600], [750, 640]];
pts.forEach(([px, py], i) => { pathInput[i * 2] = px; pathInput[i * 2 + 1] = py; });
const pathEntity = wasm.blitz_create_path(pts.length, 0.2, 0.9, 0.3, 1, 4);
check("path created", pathEntity !== 0xffffffff && wasm.blitz_entity_count() === 4);
const pathSeq = [...snapshot().entries()].find(([, v]) => v.kind === 5)?.[0];
check("path queryable (kind 5)", pathSeq !== undefined);
const pathBefore = snapshot().get(pathSeq);
wasm.blitz_select_all();
wasm.blitz_delete_selected();
check("all deleted", wasm.blitz_entity_count() === 0);
wasm.blitz_history_undo();
const pathAfter = snapshot().get(pathSeq);
check("path restored with same bounds + width",
  pathAfter && near(pathAfter.w, pathBefore.w) && near(pathAfter.h, pathBefore.h) &&
  near(pathAfter.strokeWidth, 4));

// --- 6. Parent reparent (drag into frame) -> undo detaches / redo attaches --
console.log("reparent via drag -> undo detaches, redo re-attaches");
wasm.blitz_clear_scene();
wasm.blitz_history_reset?.();
wasm.blitz_create_frame(
  0, 0, 300, 300, 0.9, 0.9, 0.9, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 18, 0);
wasm.blitz_create_rect(500, 500, 40, 40, 1, 0, 0, 1, 0, 0, 0, 1, 2);
const childSeq = [...snapshot().entries()].find(([, v]) => near(v.x, 500))?.[0];
const frameSeq = [...snapshot().entries()].find(([, v]) => v.kind === 4)?.[0];
check("child starts with no parent", snapshot().get(childSeq).parentSeq === 0);
wasm.blitz_clear_selection();
wasm.blitz_pointer_down(520, 520, 0); // child center
wasm.blitz_pointer_move(150, 150);    // inside frame
wasm.blitz_pointer_up();
check("drag attached child to frame", snapshot().get(childSeq).parentSeq === frameSeq);
wasm.blitz_history_undo();
check("undo detaches child", snapshot().get(childSeq).parentSeq === 0);
wasm.blitz_history_redo();
check("redo re-attaches child to frame", snapshot().get(childSeq).parentSeq === frameSeq);

// --- 7. Eviction: more than the step budget, no crash ----------------------
console.log("step-budget eviction");
wasm.blitz_clear_scene();
wasm.blitz_history_reset?.();
for (let i = 0; i < 200; i += 1) {
  wasm.blitz_create_rect(i * 5, 0, 4, 4, 1, 1, 1, 1, 0, 0, 0, 1, 1);
}
check("200 creates survive (only 64 steps retained)", wasm.blitz_entity_count() === 200);
let undone = 0;
while (wasm.blitz_history_can_undo()) {
  wasm.blitz_history_undo();
  undone += 1;
  if (undone > 70) break;
}
check("undo stack capped at 64 steps", undone === 64);
check("eviction left earliest creates intact", wasm.blitz_entity_count() === 200 - 64);

// --- 8. Bulk transform timing ----------------------------------------------
console.log("bulk transform timing");
wasm.blitz_clear_scene();
wasm.blitz_history_reset?.();
const BULK = 10_000;
for (let i = 0; i < BULK; i += 1) {
  wasm.blitz_create_rect(i * 2, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0);
}
wasm.blitz_history_reset?.();
wasm.blitz_select_all();
const t0 = performance.now();
wasm.blitz_set_selected_fill(0.2, 0.3, 0.4);
wasm.blitz_history_undo();
wasm.blitz_history_redo();
const dt = performance.now() - t0;
check(`bulk ${BULK}-entity transform round-trip under 500ms (${dt.toFixed(1)}ms)`, dt < 500);
check("bulk redo left fill applied", near(snapshot().values().next().value.fillR, 0.2));

// --- 9. Explicit begin/commit groups multiple mutations into one step ------
console.log("begin/commit grouping + state_id dirty tracking");
wasm.blitz_clear_scene();
check("clear_scene resets history (state_id 0)", wasm.blitz_history_state_id() === 0);
wasm.blitz_history_begin();
wasm.blitz_create_rect(0, 0, 10, 10, 1, 0, 0, 1, 0, 0, 0, 1, 1);
wasm.blitz_create_rect(20, 0, 10, 10, 0, 1, 0, 1, 0, 0, 0, 1, 1);
wasm.blitz_create_rect(40, 0, 10, 10, 0, 0, 1, 1, 0, 0, 0, 1, 1);
wasm.blitz_history_commit();
check("3 mutations in one begin/commit = 1 undo step", wasm.blitz_entity_count() === 3);
const grouped = wasm.blitz_history_state_id();
wasm.blitz_history_undo();
check("single undo reverts the whole group", wasm.blitz_entity_count() === 0);
check("can't undo further (was one step)", wasm.blitz_history_can_undo() === 0);
wasm.blitz_history_redo();
check("redo restores the whole group", wasm.blitz_entity_count() === 3);

// state_id: stable on undo-to-saved, fresh on a new branch.
const saved = wasm.blitz_history_state_id();
check("redo returns to the same state_id (clean after undo/redo)", saved === grouped);
wasm.blitz_history_undo();
const earlier = wasm.blitz_history_state_id();
check("undo exposes the earlier state_id (dirty vs saved)", earlier !== saved);
wasm.blitz_create_rect(60, 0, 10, 10, 1, 1, 0, 1, 0, 0, 0, 1, 1); // new branch
check("a new branch yields a fresh state_id", wasm.blitz_history_state_id() !== saved);
check("new branch truncated the redo stack", wasm.blitz_history_can_redo() === 0);

// --- 10. Bulk delete -> undo -> redo stays linear (no O(n^2) apply) --------
console.log("bulk delete/undo/redo at scale");
wasm.blitz_clear_scene();
const BULK_DELETE = 200_000;
for (let i = 0; i < BULK_DELETE; i += 1) {
  wasm.blitz_create_rect((i % 2000) * 6, Math.floor(i / 2000) * 6, 4, 4, 1, 0, 0, 1, 0, 0, 0, 1, 1);
}
wasm.blitz_history_reset();
wasm.blitz_select_all();
const bulkStart = performance.now();
wasm.blitz_delete_selected();
const afterDelete = wasm.blitz_entity_count();
wasm.blitz_history_undo();
const afterUndo = wasm.blitz_entity_count();
wasm.blitz_history_redo();
wasm.blitz_history_undo();
const bulkMs = performance.now() - bulkStart;
check(`${BULK_DELETE} delete cleared the scene`, afterDelete === 0);
check(`${BULK_DELETE} undo restored every entity`, afterUndo === BULK_DELETE);
check(`bulk delete/undo/redo/undo under 2s (${bulkMs.toFixed(0)}ms)`, bulkMs < 2000);

// --- 11. Z-order (bring-to-front / send-to-back) is undoable ----------------
console.log("z-order changes preserved in history");
wasm.blitz_clear_scene();
const orderOf = (x) => {
  const n = wasm.blitz_query_scene(-1e6, -1e6, 1e6, 1e6, 1000);
  const v = new DataView(wasm.memory.buffer, wasm.blitz_scene_query_ptr(), n * ITEM);
  for (let i = 0; i < n; i += 1) {
    if (Math.abs(v.getFloat32(i * ITEM + 40, true) - x) < 0.01) {
      return v.getUint32(i * ITEM + 20, true);
    }
  }
  return -1;
};
const idOf = (x) => {
  const n = wasm.blitz_query_scene(-1e6, -1e6, 1e6, 1e6, 1000);
  const v = new DataView(wasm.memory.buffer, wasm.blitz_scene_query_ptr(), n * ITEM);
  for (let i = 0; i < n; i += 1) {
    const o = i * ITEM;
    if (Math.abs(v.getFloat32(o + 40, true) - x) < 0.01) {
      return [v.getUint32(o, true), v.getUint32(o + 4, true), v.getUint32(o + 8, true), v.getUint32(o + 12, true)];
    }
  }
  return null;
};
wasm.blitz_create_rect(10, 0, 5, 5, 1, 0, 0, 1, 0, 0, 0, 1, 1);
wasm.blitz_create_rect(20, 0, 5, 5, 0, 1, 0, 1, 0, 0, 0, 1, 1);
wasm.blitz_create_rect(30, 0, 5, 5, 0, 0, 1, 1, 0, 0, 0, 1, 1);
wasm.blitz_history_reset();
const beforeOrder = orderOf(10);
const a = idOf(10);
wasm.blitz_clear_selection();
wasm.blitz_select_object(a[0], a[1], a[2], a[3], 0);
wasm.blitz_bring_to_front();
check("bring-to-front moved the shape to the top", orderOf(10) === 2);
check("bring-to-front created an undo step", wasm.blitz_history_can_undo() === 1);
wasm.blitz_history_undo();
check("undo restores the original z-order", orderOf(10) === beforeOrder);
wasm.blitz_history_redo();
check("redo re-applies the z-order", orderOf(10) === 2);
// A no-op reorder (already frontmost) must not create a step.
wasm.blitz_clear_selection();
wasm.blitz_select_object(a[0], a[1], a[2], a[3], 0);
const stateBeforeNoop = wasm.blitz_history_state_id();
wasm.blitz_bring_to_front();
check("no-op bring-to-front (already frontmost) adds no step",
  wasm.blitz_history_state_id() === stateBeforeNoop && orderOf(10) === 2);

// --- 12. Moving items inside a container: undo stays linear, not O(n^2) -----
// Parent restoration must not scan the world per entity when the parent (the
// container) isn't itself in the transaction.
console.log("move-in-container undo is linear");
wasm.blitz_init();
wasm.blitz_set_actor_id(1, 1);
wasm.blitz_resize(1920, 1080);
wasm.blitz_set_camera(960, 540, 1); // screen == world
const FILLER = 40000;
const LEAVES = 40000;
for (let i = 0; i < FILLER; i += 1) {
  wasm.blitz_create_rect(-100000 + (i % 100), 0, 2, 2, 1, 0, 0, 1, 0, 0, 0, 1, 1);
}
wasm.blitz_create_frame(0, 0, 1900, 1000, 0.9, 0.9, 0.9, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 18, 0);
for (let i = 0; i < LEAVES; i += 1) {
  wasm.blitz_create_rect(50 + (i % 180) * 10, 50 + Math.floor(i / 180), 6, 6, 0, 0, 1, 1, 0, 0, 0, 1, 1);
}
wasm.blitz_history_reset();
// Marquee selects the leaves (fully inside) but not the container.
wasm.blitz_begin_marquee(40, 40);
wasm.blitz_pointer_move(1870, 900);
wasm.blitz_pointer_up();
const leavesSelected = wasm.blitz_selected_count();
wasm.blitz_pointer_down(55, 55, 0);
wasm.blitz_pointer_move(155, 155);
wasm.blitz_pointer_up();
const moveStart = performance.now();
wasm.blitz_history_undo();
const moveMs = performance.now() - moveStart;
check(`marquee selected leaves only (${leavesSelected})`, leavesSelected === LEAVES);
check(`undo of ${LEAVES} items in a container under 500ms (${moveMs.toFixed(0)}ms)`, moveMs < 500);
check("redo of the in-container move stays fast", (() => {
  const t = performance.now();
  wasm.blitz_history_redo();
  return performance.now() - t < 500;
})());

// --- 13. Deleting a container: undo re-attaches children + restores z-order --
console.log("container delete -> undo restores children + z-order");
wasm.blitz_init();
wasm.blitz_set_actor_id(1, 1);
wasm.blitz_resize(1920, 1080);
wasm.blitz_set_camera(960, 540, 1);
const rows = () => {
  const n = wasm.blitz_query_scene(-1e9, -1e9, 1e9, 1e9, 100);
  const v = new DataView(wasm.memory.buffer, wasm.blitz_scene_query_ptr(), n * ITEM);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const o = i * ITEM;
    out.push({
      kind: v.getUint32(o + 16, true),
      order: v.getUint32(o + 20, true),
      x: v.getFloat32(o + 40, true),
      parentSeq: v.getUint32(o + 124, true),
    });
  }
  return out;
};
wasm.blitz_create_frame(0, 0, 500, 500, 0.9, 0.9, 0.9, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 18, 0);
let q = wasm.blitz_query_scene(-1e9, -1e9, 1e9, 1e9, 5);
let qv = new DataView(wasm.memory.buffer, wasm.blitz_scene_query_ptr(), q * ITEM);
const frameId = [qv.getUint32(0, true), qv.getUint32(4, true), qv.getUint32(8, true), qv.getUint32(12, true)];
const containerSeq = frameId[3];
for (let i = 0; i < 3; i += 1) wasm.blitz_create_rect(50 + i * 30, 50, 8, 8, 1, 0, 0, 1, 0, 0, 0, 1, 1);
wasm.blitz_create_rect(600, 600, 20, 20, 0, 1, 0, 1, 0, 0, 0, 1, 1); // top-level, above the frame
const before = rows();
const childCountBefore = before.filter((r) => r.parentSeq === containerSeq).length;
const frameOrderBefore = before.find((r) => r.kind === 4).order;
wasm.blitz_history_reset();
wasm.blitz_clear_selection();
wasm.blitz_select_object(frameId[0], frameId[1], frameId[2], frameId[3], 0);
wasm.blitz_delete_selected();
check("deleting the container removed it", rows().every((r) => r.kind !== 4));
wasm.blitz_history_undo();
const after = rows();
const frame = after.find((r) => r.kind === 4);
check("undo brings the container back", frame !== undefined);
check("undo re-attaches the children", after.filter((r) => r.parentSeq === containerSeq).length === childCountBefore && childCountBefore === 3);
check("undo restores the container's z-order", frame && frame.order === frameOrderBefore);

// --- 14. Loading a serialized container scene resolves parents linearly -----
console.log("scene deserialize with many children is linear");
wasm.blitz_init();
wasm.blitz_set_actor_id(1, 1);
wasm.blitz_resize(1920, 1080);
wasm.blitz_set_camera(960, 540, 1);
const LOAD_CHILDREN = 30000;
wasm.blitz_create_frame(0, 0, 1600, 900, 0.95, 0.95, 0.95, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 18, 0);
for (let i = 0; i < LOAD_CHILDREN; i += 1) {
  wasm.blitz_create_rect(
    20 + (i % 300) * 5,
    20 + Math.floor(i / 300) * 5,
    3,
    3,
    0,
    0,
    1,
    1,
    0,
    0,
    0,
    1,
    1,
  );
}
const sceneBytes = wasm.blitz_scene_serialize();
const sceneCopy = new Uint8Array(
  wasm.memory.buffer,
  wasm.blitz_scene_file_buffer_ptr(),
  sceneBytes,
).slice();
wasm.blitz_clear_scene();
const scenePtr = wasm.blitz_scene_file_buffer_reserve(sceneCopy.byteLength);
new Uint8Array(wasm.memory.buffer, scenePtr, sceneCopy.byteLength).set(sceneCopy);
const loadStart = performance.now();
const loadError = wasm.blitz_scene_deserialize(sceneCopy.byteLength);
const loadMs = performance.now() - loadStart;
check("large relative scene deserialize succeeds", loadError === 0);
check("large relative scene restores every entity", wasm.blitz_entity_count() === LOAD_CHILDREN + 1);
check(`large relative scene deserialize under 1500ms (${loadMs.toFixed(0)}ms)`, loadMs < 1500);

console.log(failures === 0 ? "\nWASM history test passed." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
