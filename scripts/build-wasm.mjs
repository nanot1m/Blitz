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
const input = resolve(root, "src/wasm/blitz.c");
const output = resolve(root, "public/blitz.wasm");

mkdirSync(resolve(root, "public"), { recursive: true });

const args = [
  "--target=wasm32",
  "-O3",
  "-nostdlib",
  "-Wl,--no-entry",
  "-Wl,--export-memory",
  "-Wl,--export=blitz_init",
  "-Wl,--export=blitz_resize",
  "-Wl,--export=blitz_set_camera",
  "-Wl,--export=blitz_pan",
  "-Wl,--export=blitz_zoom_at",
  "-Wl,--export=blitz_uniform_ptr",
  "-Wl,--export=blitz_uniform_f32_count",
  "-Wl,--export=blitz_rect_draw_ptr",
  "-Wl,--export=blitz_rect_draw_f32_count",
  "-Wl,--export=blitz_rect_draw_count",
  "-Wl,--export=blitz_rect_draw_version",
  "-Wl,--export=blitz_entity_count",
  "-Wl,--export=blitz_render_chunk_rects",
  "-Wl,--export=blitz_time",
  "-o",
  output,
  input,
];

const result = spawnSync(clang, args, {
  cwd: root,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to start ${clang}: ${result.error.message}`);
  console.error("Install LLVM/Clang or set CLANG to the full path of clang.exe.");
  process.exit(1);
}

if (result.status !== 0) {
  if (result.status === 1 && process.platform === "win32") {
    console.error("Install LLVM/Clang or set CLANG to the full path of clang.exe.");
  }
  process.exit(result.status ?? 1);
}

console.log(`Wrote ${output}`);
