import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const wasmWatchFiles = [
  "scripts/build-wasm.mjs",
  "scripts/compile-font.mjs",
  "src/assets/OpenSans-Regular.ttf",
  "src/wasm/blitz.c",
];

function wasmDevBuildPlugin() {
  return {
    name: "blitz-wasm-dev-build",
    apply: "serve" as const,
    configureServer(server) {
      const watchedFiles = new Set(wasmWatchFiles.map((file) => resolve(server.config.root, file)));
      let buildActive = false;
      let buildPending = false;
      let debounceTimer: NodeJS.Timeout | undefined;

      server.watcher.add([...watchedFiles]);

      const runBuild = (changedFile: string) => {
        if (buildActive) {
          buildPending = true;
          return;
        }
        buildActive = true;
        server.config.logger.info(`[wasm] rebuilding after ${changedFile}`);
        const npm = process.platform === "win32" ? "npm.cmd" : "npm";
        const child = spawn(npm, ["run", "build:wasm"], {
          cwd: server.config.root,
          stdio: "inherit",
        });
        child.on("close", (code) => {
          buildActive = false;
          if (code === 0) {
            server.config.logger.info("[wasm] rebuild complete");
            server.ws.send({ type: "full-reload" });
          } else {
            server.config.logger.error(`[wasm] rebuild failed with exit code ${code ?? 1}`);
          }
          if (buildPending) {
            buildPending = false;
            runBuild("queued change");
          }
        });
      };

      const scheduleBuild = (file: string) => {
        if (!watchedFiles.has(resolve(file))) {
          return;
        }
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => runBuild(file), 80);
      };

      server.watcher.on("change", scheduleBuild);
      server.watcher.on("add", scheduleBuild);
    },
  };
}

export default defineConfig({
  base: repositoryName ? `/${repositoryName}/` : "/",
  plugins: [wasmDevBuildPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
