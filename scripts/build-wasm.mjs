import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWindowsClang = "C:\\Program Files\\LLVM\\bin\\clang.exe";
const homebrewLlvmBin = "/opt/homebrew/opt/llvm/bin";
const homebrewLldBin = "/opt/homebrew/opt/lld/bin";
const input = resolve(root, "src/wasm/blitz.c");
const output = resolve(root, "public/blitz.wasm");

mkdirSync(resolve(root, "public"), { recursive: true });

const wasmExports = [
  "blitz_init",
  "blitz_set_actor_id",
  "blitz_last_created_object_id_ptr",
  "blitz_resize",
  "blitz_set_camera",
  "blitz_pan",
  "blitz_zoom_at",
  "blitz_pointer_down",
  "blitz_hit_test",
  "blitz_resize_mode_at",
  "blitz_pointer_move",
  "blitz_pointer_up",
  "blitz_add_rect",
  "blitz_add_circle",
  "blitz_add_oval",
  "blitz_add_triangle",
  "blitz_add_text",
  "blitz_clear_scene",
  "blitz_load_demo_template",
  "blitz_clear_selection",
  "blitz_select_object",
  "blitz_create_rect",
  "blitz_create_circle",
  "blitz_create_oval",
  "blitz_create_triangle",
  "blitz_text_input_ptr",
  "blitz_text_input_capacity",
  "blitz_measure_text_width",
  "blitz_layout_text",
  "blitz_text_layout_ptr",
  "blitz_text_layout_line_bytes",
  "blitz_text_layout_width",
  "blitz_text_layout_height",
  "blitz_text_layout_overflow",
  "blitz_font_ascender",
  "blitz_font_descender",
  "blitz_font_line_height",
  "blitz_font_cap_height",
  "blitz_font_x_height",
  "blitz_font_glyph_count",
  "blitz_font_glyph_codepoint",
  "blitz_create_text",
  "blitz_update_object",
  "blitz_query_scene",
  "blitz_scene_query_ptr",
  "blitz_scene_query_item_bytes",
  "blitz_scene_query_count",
  "blitz_scene_query_total",
  "blitz_scene_file_buffer_ptr",
  "blitz_scene_file_buffer_capacity",
  "blitz_scene_revision",
  "blitz_capture_start_viewpoint",
  "blitz_scene_serialize",
  "blitz_scene_deserialize",
  "blitz_stress_test",
  "blitz_delete_selected",
  "blitz_has_selection",
  "blitz_selected_debug_ptr",
  "blitz_selected_debug_mask",
  "blitz_selected_style_kind",
  "blitz_selected_style_ptr",
  "blitz_selected_style_f32_count",
  "blitz_set_selected_fill",
  "blitz_set_selected_fill_opacity",
  "blitz_set_selected_stroke",
  "blitz_set_selected_stroke_opacity",
  "blitz_set_selected_stroke_width",
  "blitz_set_selected_text_color",
  "blitz_set_selected_text_opacity",
  "blitz_set_selected_text_font_size",
  "blitz_set_hidden_text_entity",
  "blitz_reset_selected_text_width",
  "blitz_select_all",
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
  "blitz_oval_draw_ptr",
  "blitz_oval_draw_f32_count",
  "blitz_oval_draw_count",
  "blitz_text_draw_ptr",
  "blitz_text_draw_f32_count",
  "blitz_text_draw_count",
  "blitz_visible_text_shape_count",
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

const commandOnPath = (command) => {
  const pathEntries = (process.env.PATH ?? "").split(delimiter);
  const extensions = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const pathEntry of pathEntries) {
    for (const extension of extensions) {
      const candidate = resolve(pathEntry, `${command}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return "";
};

const firstAvailable = (candidates) =>
  candidates.find((candidate) => candidate && commandAvailable(candidate)) ?? "";

const firstExisting = (candidates) =>
  candidates.find((candidate) => candidate && existsSync(candidate)) ?? "";

const clangArgs = [
  "--target=wasm32",
  "-O3",
  "-ffunction-sections",
  "-fdata-sections",
  "-nostdlib",
  "-Wl,--no-entry",
  "-Wl,--export-memory",
  "-Wl,--gc-sections",
  "-Wl,--strip-all",
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

const wasmLd = firstExisting([
  process.env.WASM_LD,
  commandOnPath("wasm-ld"),
  resolve(homebrewLldBin, "wasm-ld"),
  resolve(homebrewLlvmBin, "wasm-ld"),
]);
const clang = firstAvailable([
  process.env.CLANG,
  resolve(homebrewLlvmBin, "clang"),
  process.platform === "win32" && existsSync(defaultWindowsClang) ? defaultWindowsClang : "",
  "clang",
]);
const emcc = firstAvailable([process.env.EMCC, commandOnPath("emcc"), "emcc"]);

const explicitCompiler = process.env.CLANG || process.env.EMCC;
const compiler = explicitCompiler
  ? explicitCompiler
  : clang && wasmLd
    ? clang
    : emcc || clang;
const usingEmcc = compiler.includes("emcc");
const args = usingEmcc ? emccArgs : clangArgs;
const wasmLdBin = wasmLd ? dirname(wasmLd) : "";
const env = wasmLdBin && !usingEmcc
  ? { ...process.env, PATH: `${wasmLdBin}${delimiter}${process.env.PATH ?? ""}` }
  : process.env;

console.log(
  `Building WASM with ${usingEmcc ? compiler : `${compiler} + ${wasmLd || "system wasm-ld"}`}`,
);

const result = spawnSync(compiler, args, {
  cwd: root,
  env,
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
