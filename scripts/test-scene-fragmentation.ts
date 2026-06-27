import { readFile } from "node:fs/promises";

// Heap fragmentation guard. Interleaving entity creation with render extraction
// boxes the ECS block in under the demand-grown draw buffers, so its grows
// relocate and leave gaps between live regions — the pattern the live app hits
// every frame. The address-ordered coalescing allocator must keep committed
// linear memory bounded relative to the live working set.
//
// Runs in its own module: memory.grow never shrinks, so byteLength is a session
// high-water and only a fresh instance reflects this workload alone. The 4x
// bound is coarse (it also covers geometric-growth headroom, where a scene with
// N entities lives in 2N-capacity blocks); it catches a coalescing regression,
// not a precise target.

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as Record<string, CallableFunction> & {
  memory: WebAssembly.Memory;
};

wasm.blitz_init();
wasm.blitz_set_actor_id(1, 1);
wasm.blitz_resize(1920, 1080);

const TOTAL = 300000;
const BATCH = 10000;
let made = 0;
while (made < TOTAL) {
  for (let i = 0; i < BATCH && made < TOTAL; i += 1, made += 1) {
    wasm.blitz_create_rect((made % 2000) * 6, Math.floor(made / 2000) * 6, 5, 5, 1, 0, 0, 1, 0, 0, 0, 1, 1);
  }
  // Triggers extract_static_shapes, which grows the draw buffers on top of the
  // ECS block; the next batch's creates then relocate the boxed-in ECS block.
  wasm.blitz_shape_command_ptr();
}

if (wasm.blitz_entity_count() !== TOTAL) {
  throw new Error(`Expected ${TOTAL} entities, got ${wasm.blitz_entity_count()}.`);
}

const reserved = wasm.memory.buffer.byteLength;
const live = wasm.blitz_wasm_live_bytes();
const ratio = reserved / live;
if (ratio > 4) {
  throw new Error(
    `Heap fragmentation regressed after interleaved growth: reserved ${(reserved / 1048576).toFixed(0)}MB vs live ${(live / 1048576).toFixed(0)}MB (${ratio.toFixed(2)}x > 4x).`,
  );
}

console.log(
  `Scene fragmentation test passed (${TOTAL} interleaved: reserved ${(reserved / 1048576).toFixed(0)}MB, live ${(live / 1048576).toFixed(0)}MB, ${ratio.toFixed(2)}x).`,
);
