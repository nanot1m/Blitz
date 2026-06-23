import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWindowsClang = "C:\\Program Files\\LLVM\\bin\\clang.exe";
const clang =
  process.env.CLANG ?? (process.platform === "win32" && existsSync(defaultWindowsClang)
    ? defaultWindowsClang
    : "clang");
const emcc = process.env.EMCC ?? "emcc";
const input = resolve(root, "src/wasm/blitz.c");
const output = resolve(root, "public/blitz.wasm");

mkdirSync(resolve(root, "public"), { recursive: true });

const wasmExports = [
  "blitz_init",
  "blitz_resize",
  "blitz_set_camera",
  "blitz_pan",
  "blitz_zoom_at",
  "blitz_pointer_down",
  "blitz_pointer_move",
  "blitz_pointer_up",
  "blitz_add_rect",
  "blitz_add_circle",
  "blitz_add_triangle",
  "blitz_add_text",
  "blitz_stress_test",
  "blitz_delete_selected",
  "blitz_has_selection",
  "blitz_bring_to_front",
  "blitz_send_to_back",
  "blitz_uniform_ptr",
  "blitz_uniform_f32_count",
  "blitz_shape_command_ptr",
  "blitz_shape_command_u32_count",
  "blitz_shape_command_count",
  "blitz_shape_command_version",
  "blitz_rect_draw_ptr",
  "blitz_rect_draw_f32_count",
  "blitz_rect_draw_count",
  "blitz_triangle_draw_ptr",
  "blitz_triangle_draw_f32_count",
  "blitz_triangle_draw_count",
  "blitz_circle_draw_ptr",
  "blitz_circle_draw_f32_count",
  "blitz_circle_draw_count",
  "blitz_text_draw_ptr",
  "blitz_text_draw_f32_count",
  "blitz_text_draw_count",
  "blitz_dyn_command_ptr",
  "blitz_dyn_command_count",
  "blitz_dyn_version",
  "blitz_dyn_rect_ptr",
  "blitz_dyn_rect_count",
  "blitz_render_max_dyn_commands",
  "blitz_render_max_dyn_rects",
  "blitz_entity_count",
  "blitz_selected_count",
  "blitz_wasm_live_bytes",
  "blitz_render_chunk_rects",
  "blitz_render_max_shapes",
  "blitz_render_max_text_draws",
];

const commandAvailable = (command) => {
  const result = spawnSync(command, ["--version"], {
    cwd: root,
    stdio: "ignore",
  });
  return result.status === 0;
};

const clangArgs = [
  "--target=wasm32",
  "-O3",
  "-nostdlib",
  "-Wl,--no-entry",
  "-Wl,--export-memory",
  ...wasmExports.map((name) => `-Wl,--export=${name}`),
  "-o",
  output,
  input,
];

const emccArgs = [
  input,
  "-O3",
  "-s",
  "STANDALONE_WASM=1",
  "--no-entry",
  "-s",
  "ERROR_ON_UNDEFINED_SYMBOLS=0",
  "-o",
  output,
];

const compiler = process.env.CLANG || commandAvailable("wasm-ld") ? clang : emcc;
const args = compiler === emcc ? emccArgs : clangArgs;

const result = spawnSync(compiler, args, {
  cwd: root,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to start ${compiler}: ${result.error.message}`);
  console.error("Install LLVM/Clang with wasm-ld, install Emscripten, or set CLANG/EMCC.");
  process.exit(1);
}

if (result.status !== 0) {
  if (result.status === 1 && process.platform === "win32") {
    console.error("Install LLVM/Clang with wasm-ld, install Emscripten, or set CLANG/EMCC.");
  }
  process.exit(result.status ?? 1);
}

console.log(`Wrote ${output}`);
