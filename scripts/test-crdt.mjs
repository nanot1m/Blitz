import { readFile } from "node:fs/promises";

const bytes = await readFile("public/blitz.wasm");

async function makeInstance(actorHi, actorLo) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const w = instance.exports;
  w.blitz_init();
  w.blitz_set_actor_id(actorHi, actorLo);
  w.blitz_crdt_set_enabled(1);
  w.blitz_resize(1000, 1000);
  w.blitz_set_camera(500, 500, 1); // screen == world
  return w;
}

let failures = 0;
function check(label, ok) {
  if (!ok) {
    failures += 1;
    console.error(`  FAIL: ${label}`);
  } else {
    console.log(`  ok:   ${label}`);
  }
}
const near = (a, b) => Math.abs(a - b) < 0.01;

const itemBytes = (w) => w.blitz_scene_query_item_bytes();

// Snapshot live scene as a map keyed by the full object id.
function snapshot(w) {
  const item = itemBytes(w);
  const count = w.blitz_query_scene(-1e6, -1e6, 1e6, 1e6, 1_000_000);
  const base = w.blitz_scene_query_ptr();
  const view = new DataView(w.memory.buffer, base, count * item);
  const map = new Map();
  for (let i = 0; i < count; i += 1) {
    const o = i * item;
    const key = [
      view.getUint32(o + 0, true),
      view.getUint32(o + 4, true),
      view.getUint32(o + 8, true),
      view.getUint32(o + 12, true),
    ].join(":");
    map.set(key, {
      kind: view.getUint32(o + 16, true),
      x: view.getFloat32(o + 40, true),
      y: view.getFloat32(o + 44, true),
      w: view.getFloat32(o + 48, true),
      h: view.getFloat32(o + 52, true),
      fillR: view.getFloat32(o + 56, true),
      strokeWidth: view.getFloat32(o + 88, true),
      parentSeq: view.getUint32(o + 124, true),
    });
  }
  return map;
}

function captureOps(w) {
  const len = w.blitz_crdt_capture_changes();
  const ptr = w.blitz_scene_file_buffer_ptr();
  return new Uint8Array(w.memory.buffer, ptr, len).slice();
}

function captureBaseline(w) {
  const len = w.blitz_crdt_capture_baseline();
  const ptr = w.blitz_scene_file_buffer_ptr();
  return new Uint8Array(w.memory.buffer, ptr, len).slice();
}

function applyOps(w, ops) {
  if (ops.length === 0) {
    return 0;
  }
  w.blitz_scene_file_buffer_reserve(ops.length);
  const ptr = w.blitz_scene_file_buffer_ptr();
  new Uint8Array(w.memory.buffer, ptr, ops.length).set(ops);
  return w.blitz_crdt_apply_ops(ops.length);
}

// Compare two snapshots for identical object sets + geometry/style.
function converged(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, av] of a) {
    const bv = b.get(key);
    if (!bv) {
      return false;
    }
    if (av.kind !== bv.kind || !near(av.x, bv.x) || !near(av.y, bv.y) ||
        !near(av.w, bv.w) || !near(av.h, bv.h) || !near(av.fillR, bv.fillR) ||
        av.parentSeq !== bv.parentSeq) {
      return false;
    }
  }
  return true;
}

const onlyKey = (w) => snapshot(w).keys().next().value;

// --- 1. Create propagation A -> B ------------------------------------------
console.log("create propagation A -> B");
{
  const a = await makeInstance(1, 1);
  const b = await makeInstance(2, 2);
  a.blitz_create_rect(10, 20, 30, 40, 0.1, 0.2, 0.3, 1, 0, 0, 0, 1, 2);
  a.blitz_create_circle(200, 200, 25, 0.4, 0.5, 0.6, 1, 0, 0, 0, 1, 3);
  a.blitz_create_triangle(400, 0, 60, 80, 0.7, 0.8, 0.9, 1, 0, 0, 0, 1, 1);
  check("A queued 3 ops", a.blitz_crdt_pending_count() === 3);
  const applied = applyOps(b, captureOps(a));
  check("B applied 3 ops", applied === 3);
  check("A drained its queue", a.blitz_crdt_pending_count() === 0);
  check("B has 3 entities", b.blitz_entity_count() === 3);
  check("scenes converge", converged(snapshot(a), snapshot(b)));
}

// --- 2. Bidirectional create — no unrelated loss ---------------------------
console.log("bidirectional create, no unrelated loss");
{
  const a = await makeInstance(1, 1);
  const b = await makeInstance(2, 2);
  a.blitz_create_rect(0, 0, 40, 40, 1, 0, 0, 1, 0, 0, 0, 1, 2);
  b.blitz_create_rect(500, 500, 40, 40, 0, 1, 0, 1, 0, 0, 0, 1, 2);
  const opsA = captureOps(a);
  const opsB = captureOps(b);
  applyOps(b, opsA);
  applyOps(a, opsB);
  check("A kept its own + got B's", a.blitz_entity_count() === 2);
  check("B kept its own + got A's", b.blitz_entity_count() === 2);
  check("scenes converge", converged(snapshot(a), snapshot(b)));
}

// --- 3. Update propagation -------------------------------------------------
console.log("update propagation A -> B");
{
  const a = await makeInstance(1, 1);
  const b = await makeInstance(2, 2);
  a.blitz_create_rect(0, 0, 40, 40, 0.1, 0.1, 0.1, 1, 0, 0, 0, 1, 2);
  applyOps(b, captureOps(a));
  a.blitz_select_all();
  a.blitz_set_selected_fill(0.9, 0.2, 0.2);
  const key = onlyKey(a);
  check("A fill changed locally", near(snapshot(a).get(key).fillR, 0.9));
  applyOps(b, captureOps(a));
  check("B sees updated fill", near(snapshot(b).get(key).fillR, 0.9));
  check("scenes converge", converged(snapshot(a), snapshot(b)));
}

// --- 4. Delete propagation -------------------------------------------------
console.log("delete propagation A -> B");
{
  const a = await makeInstance(1, 1);
  const b = await makeInstance(2, 2);
  a.blitz_create_rect(0, 0, 40, 40, 1, 1, 1, 1, 0, 0, 0, 1, 2);
  a.blitz_create_rect(100, 0, 40, 40, 1, 1, 1, 1, 0, 0, 0, 1, 2);
  applyOps(b, captureOps(a));
  check("B has 2", b.blitz_entity_count() === 2);
  // delete the first
  a.blitz_clear_selection();
  a.blitz_pointer_down(20, 20, 0);
  a.blitz_pointer_up();
  a.blitz_delete_selected();
  check("A has 1 after delete", a.blitz_entity_count() === 1);
  const applied = applyOps(b, captureOps(a));
  check("B applied the delete", applied === 1);
  check("B has 1 after delete", b.blitz_entity_count() === 1);
  check("scenes converge", converged(snapshot(a), snapshot(b)));
}

// --- 5. Concurrent conflicting update — LWW by actor, converges ------------
console.log("concurrent update conflict (LWW: higher actor wins)");
{
  const a = await makeInstance(1, 1); // lower actor
  const b = await makeInstance(2, 2); // higher actor -> wins ties
  a.blitz_create_rect(0, 0, 40, 40, 1, 1, 1, 1, 0, 0, 0, 1, 2);
  applyOps(b, captureOps(a));
  const key = onlyKey(a);
  // Both move the same object at the same Lamport time (clock=1 -> 2 each).
  a.blitz_clear_selection();
  a.blitz_pointer_down(20, 20, 0);
  a.blitz_pointer_move(120, 20); // A: x -> 100
  a.blitz_pointer_up();
  b.blitz_clear_selection();
  b.blitz_pointer_down(20, 20, 0);
  b.blitz_pointer_move(220, 20); // B: x -> 200
  b.blitz_pointer_up();
  check("A moved to 100", near(snapshot(a).get(key).x, 100));
  check("B moved to 200", near(snapshot(b).get(key).x, 200));
  const opsA = captureOps(a);
  const opsB = captureOps(b);
  applyOps(a, opsB); // B (higher actor) wins on A
  applyOps(b, opsA); // A loses on B (ignored)
  check("A adopts B's value (200)", near(snapshot(a).get(key).x, 200));
  check("B keeps its value (200)", near(snapshot(b).get(key).x, 200));
  check("scenes converge", converged(snapshot(a), snapshot(b)));
}

// --- 6. Concurrent delete vs update — newer wins, converges ----------------
console.log("concurrent delete vs update (higher actor's update resurrects)");
{
  const a = await makeInstance(1, 1); // deletes
  const b = await makeInstance(2, 2); // updates, higher actor -> wins
  a.blitz_create_rect(0, 0, 40, 40, 1, 1, 1, 1, 0, 0, 0, 1, 2);
  applyOps(b, captureOps(a));
  const key = onlyKey(a);
  // A deletes; B moves — both at Lamport 2, B's actor wins.
  a.blitz_clear_selection();
  a.blitz_pointer_down(20, 20, 0);
  a.blitz_pointer_up();
  a.blitz_delete_selected();
  b.blitz_clear_selection();
  b.blitz_pointer_down(20, 20, 0);
  b.blitz_pointer_move(170, 20); // B: x -> 150
  b.blitz_pointer_up();
  check("A deleted (0 entities)", a.blitz_entity_count() === 0);
  const opsDel = captureOps(a);
  const opsUpd = captureOps(b);
  applyOps(a, opsUpd); // resurrects on A (update is newer)
  applyOps(b, opsDel); // ignored on B (older)
  check("A resurrected the object", a.blitz_entity_count() === 1);
  check("A shows B's position (150)", near(snapshot(a).get(key).x, 150));
  check("B still has the object at 150", near(snapshot(b).get(key).x, 150));
  check("scenes converge", converged(snapshot(a), snapshot(b)));
}

// --- 7. Idempotency — re-applying a batch is a no-op -----------------------
console.log("idempotent apply (re-delivery is a no-op)");
{
  const a = await makeInstance(1, 1);
  const b = await makeInstance(2, 2);
  a.blitz_create_rect(0, 0, 40, 40, 1, 1, 1, 1, 0, 0, 0, 1, 2);
  const ops = captureOps(a);
  check("first apply applies 1", applyOps(b, ops) === 1);
  const before = snapshot(b);
  check("second apply applies 0", applyOps(b, ops) === 0);
  check("scene unchanged after re-delivery", converged(before, snapshot(b)));
}

// --- 8. Order independence — independent ops commute -----------------------
console.log("order independence (independent ops commute)");
{
  const a = await makeInstance(1, 1);
  a.blitz_create_rect(0, 0, 40, 40, 1, 0, 0, 1, 0, 0, 0, 1, 2);
  const op1 = captureOps(a);
  a.blitz_create_rect(100, 0, 40, 40, 0, 0, 1, 1, 0, 0, 0, 1, 2);
  const op2 = captureOps(a);
  const c = await makeInstance(3, 3);
  const d = await makeInstance(4, 4);
  applyOps(c, op1);
  applyOps(c, op2);
  applyOps(d, op2);
  applyOps(d, op1);
  check("both orders yield 2 entities", c.blitz_entity_count() === 2 &&
    d.blitz_entity_count() === 2);
  check("both orders converge to identical state", converged(snapshot(c), snapshot(d)));
}

// --- 9. Conflicting updates converge regardless of delivery order ----------
console.log("conflicting updates converge in either delivery order");
{
  const src = await makeInstance(1, 1);
  src.blitz_create_rect(0, 0, 40, 40, 1, 1, 1, 1, 0, 0, 0, 1, 2);
  const seed = captureOps(src);
  // Two peers seeded identically, each makes a conflicting move.
  const lo = await makeInstance(5, 5);
  const hi = await makeInstance(9, 9);
  applyOps(lo, seed);
  applyOps(hi, seed);
  const key = onlyKey(lo);
  lo.blitz_clear_selection();
  lo.blitz_pointer_down(20, 20, 0);
  lo.blitz_pointer_move(120, 20);
  lo.blitz_pointer_up();
  hi.blitz_clear_selection();
  hi.blitz_pointer_down(20, 20, 0);
  hi.blitz_pointer_move(320, 20);
  hi.blitz_pointer_up();
  const opLo = captureOps(lo);
  const opHi = captureOps(hi);
  // Fresh receivers apply in opposite orders.
  const r1 = await makeInstance(7, 7);
  const r2 = await makeInstance(8, 8);
  applyOps(r1, seed);
  applyOps(r2, seed);
  applyOps(r1, opLo);
  applyOps(r1, opHi); // hi last
  applyOps(r2, opHi);
  applyOps(r2, opLo); // lo last, but hi (actor 9) must still win
  check("r1 settles on higher actor's move (300)", near(snapshot(r1).get(key).x, 300));
  check("r2 settles on higher actor's move (300)", near(snapshot(r2).get(key).x, 300));
  check("both receivers converge", converged(snapshot(r1), snapshot(r2)));
}

// --- 10. Container + child parenting propagates ----------------------------
console.log("container + child parenting propagates");
{
  const a = await makeInstance(1, 1);
  const b = await makeInstance(2, 2);
  a.blitz_create_frame(0, 0, 300, 300, 0.9, 0.9, 0.9, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 18, 0);
  a.blitz_create_rect(500, 500, 40, 40, 1, 0, 0, 1, 0, 0, 0, 1, 2);
  a.blitz_clear_selection();
  a.blitz_pointer_down(520, 520, 0); // child center
  a.blitz_pointer_move(150, 150);    // into frame
  a.blitz_pointer_up();
  const aSnap = snapshot(a);
  const childKey = [...aSnap.entries()].find(([, v]) => v.kind === 0)?.[0];
  const frameKey = [...aSnap.entries()].find(([, v]) => v.kind === 4)?.[0];
  const frameSeq = Number(frameKey.split(":")[3]);
  check("A child attached to frame", aSnap.get(childKey).parentSeq === frameSeq);
  applyOps(b, captureOps(a));
  const bSnap = snapshot(b);
  check("B has frame + child", b.blitz_entity_count() === 2);
  check("B child attached to same frame", bSnap.get(childKey)?.parentSeq === frameSeq);
  check("scenes converge", converged(aSnap, bSnap));
}

// --- 11. Baseline-on-join transfers the full scene -------------------------
console.log("baseline transfers full scene to a joining peer");
{
  const host = await makeInstance(1, 1);
  host.blitz_create_rect(0, 0, 40, 40, 1, 0, 0, 1, 0, 0, 0, 1, 2);
  host.blitz_create_circle(200, 200, 25, 0, 1, 0, 1, 0, 0, 0, 1, 3);
  host.blitz_create_triangle(400, 0, 60, 80, 0, 0, 1, 1, 0, 0, 0, 1, 1);
  // Drain the incremental queue — a joiner gets state via baseline, not ops.
  captureOps(host);
  const joiner = await makeInstance(2, 2);
  const applied = applyOps(joiner, captureBaseline(host));
  check("joiner applied full baseline", applied === 3);
  check("joiner has 3 entities", joiner.blitz_entity_count() === 3);
  check("baseline converges", converged(snapshot(host), snapshot(joiner)));
}

// --- 12. Baseline of a loaded (unversioned) scene still transfers -----------
console.log("baseline of a freshly-loaded scene transfers");
{
  const host = await makeInstance(1, 1);
  // Serialize a scene, then load it into a fresh instance whose entities are
  // unversioned (lamport 0) — the lazy baseline stamp must still let them sync.
  host.blitz_create_rect(10, 10, 40, 40, 1, 1, 0, 1, 0, 0, 0, 1, 2);
  const sceneLen = host.blitz_scene_serialize();
  const sceneBytes = new Uint8Array(
    host.memory.buffer, host.blitz_scene_file_buffer_ptr(), sceneLen).slice();
  const loaded = await makeInstance(3, 3);
  loaded.blitz_scene_file_buffer_reserve(sceneBytes.length);
  new Uint8Array(loaded.memory.buffer, loaded.blitz_scene_file_buffer_ptr(),
    sceneBytes.length).set(sceneBytes);
  check("scene loaded", loaded.blitz_scene_deserialize(sceneBytes.length) === 0 &&
    loaded.blitz_entity_count() === 1);
  const joiner = await makeInstance(4, 4);
  const applied = applyOps(joiner, captureBaseline(loaded));
  check("joiner received the loaded entity", applied === 1);
  check("loaded scene converges", converged(snapshot(loaded), snapshot(joiner)));
}

// --- 13. Undo / redo propagate as ops --------------------------------------
console.log("undo / redo propagate to peers");
{
  const a = await makeInstance(1, 1);
  const b = await makeInstance(2, 2);
  a.blitz_create_rect(0, 0, 40, 40, 1, 0, 0, 1, 0, 0, 0, 1, 2);
  applyOps(b, captureOps(a));
  check("B has the rect", b.blitz_entity_count() === 1);
  // A undoes the create -> the delete must reach B.
  a.blitz_history_undo();
  check("A undid the create", a.blitz_entity_count() === 0);
  applyOps(b, captureOps(a));
  check("B saw the undo (entity removed)", b.blitz_entity_count() === 0);
  // A redoes -> the re-create must reach B.
  a.blitz_history_redo();
  check("A redid the create", a.blitz_entity_count() === 1);
  applyOps(b, captureOps(a));
  check("B saw the redo (entity restored)", b.blitz_entity_count() === 1);
  check("scenes converge after undo/redo", converged(snapshot(a), snapshot(b)));
}

// --- 14. Disabled tracking: no queue growth, versions still advance --------
console.log("tracking disabled: no broadcast queue, versions still advance");
{
  const w = await makeInstance(1, 1);
  w.blitz_crdt_set_enabled(0);
  w.blitz_create_rect(0, 0, 40, 40, 1, 0, 0, 1, 0, 0, 0, 1, 2);
  w.blitz_create_rect(60, 0, 40, 40, 1, 0, 0, 1, 0, 0, 0, 1, 2);
  check("no pending ops while disabled", w.blitz_crdt_pending_count() === 0);
  check("clock still advanced", w.blitz_crdt_clock() >= 2);
  // Re-enabling + baseline still captures everything (versions are non-zero).
  w.blitz_crdt_set_enabled(1);
  const joiner = await makeInstance(2, 2);
  check("baseline after re-enable transfers all", applyOps(joiner, captureBaseline(w)) === 2);
  check("converges after re-enable", converged(snapshot(w), snapshot(joiner)));
}

console.log("");
if (failures > 0) {
  console.error(`CRDT convergence: ${failures} failure(s)`);
  process.exit(1);
}
console.log("CRDT convergence: all checks passed");
