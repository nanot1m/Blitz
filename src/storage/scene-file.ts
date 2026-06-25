import {
  ensureSceneFilePermission,
  listRecentSceneFiles,
  rememberSceneFile,
  removeRecentSceneFile,
  type PersistedSceneFileHandle,
  type RecentSceneFile,
} from "./recent-files";

type SceneFileWasm = {
  memory: WebAssembly.Memory;
  blitz_scene_file_buffer_ptr(): number;
  blitz_scene_file_buffer_capacity(): number;
  blitz_history_state_id(): number;
  blitz_capture_start_viewpoint(): void;
  blitz_scene_serialize(): number;
  blitz_scene_deserialize(byteCount: number): number;
};

type SceneFileHandle = PersistedSceneFileHandle;

type RecentSceneTarget = {
  list: HTMLDivElement;
  visibilityElements: HTMLElement[];
  menuItems?: boolean;
};

type SceneFileWindow = Window & {
  showOpenFilePicker?: (options: unknown) => Promise<SceneFileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<SceneFileHandle>;
};

type SceneFileElements = {
  openMenu: HTMLDetailsElement;
  saveMenu: HTMLDetailsElement;
  saveIndicator: HTMLElement;
  chooseFileButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  saveAsButton: HTMLButtonElement;
  saveCurrentViewpointInput: HTMLInputElement;
  recentTargets: RecentSceneTarget[];
};

type SceneFileOptions = {
  onLoaded(): void;
  onError(message: string): void;
};

export type SceneFileController = {
  markClean(): void;
  openFile(): void;
  saveFile(): void;
  showRecentFiles(): void;
  syncDirtyState(): void;
};

const filePickerOptions = {
  types: [
    {
      description: "Blitz scene",
      accept: { "application/octet-stream": [".blitz"] },
    },
  ],
};

const deserializeErrors = [
  "",
  "The file size is invalid.",
  "The file is not a Blitz scene.",
  "The scene version is not supported.",
  "The scene file is incomplete.",
  "The scene contains too many objects.",
  "The saved camera is invalid.",
  "The scene record table is incomplete.",
  "A scene record is invalid.",
  "A shape has invalid dimensions.",
  "The scene text data is too large.",
  "A non-text shape contains text data.",
  "The scene has trailing or missing bytes.",
  "Blitz could not allocate the loaded scene.",
];

function serializeScene(wasm: SceneFileWasm, saveCurrentViewpoint: boolean): Uint8Array {
  if (saveCurrentViewpoint) {
    wasm.blitz_capture_start_viewpoint();
  }
  const byteCount = wasm.blitz_scene_serialize();
  if (byteCount === 0) {
    throw new Error(
      `The scene exceeds the ${Math.floor(
        wasm.blitz_scene_file_buffer_capacity() / (1024 * 1024),
      )} MB binary file buffer.`,
    );
  }
  return new Uint8Array(
    wasm.memory.buffer,
    wasm.blitz_scene_file_buffer_ptr(),
    byteCount,
  ).slice();
}

function deserializeScene(wasm: SceneFileWasm, bytes: Uint8Array): void {
  const capacity = wasm.blitz_scene_file_buffer_capacity();
  if (bytes.byteLength > capacity) {
    throw new Error(`The scene file exceeds the ${Math.floor(capacity / (1024 * 1024))} MB limit.`);
  }
  new Uint8Array(wasm.memory.buffer, wasm.blitz_scene_file_buffer_ptr(), bytes.byteLength).set(bytes);
  const error = wasm.blitz_scene_deserialize(bytes.byteLength);
  if (error !== 0) {
    throw new Error(deserializeErrors[error] ?? `The scene could not be loaded (error ${error}).`);
  }
}

function downloadScene(bytes: Uint8Array): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "scene.blitz";
  link.click();
  URL.revokeObjectURL(url);
}

function chooseSceneFallback(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".blitz,application/octet-stream";
    input.addEventListener("change", () => resolve(input.files?.[0]), { once: true });
    input.click();
  });
}

export function setupSceneFileStorage(
  wasm: SceneFileWasm,
  elements: SceneFileElements,
  options: SceneFileOptions,
): SceneFileController {
  const browserWindow = window as SceneFileWindow;
  let currentHandle: SceneFileHandle | undefined;
  let cleanHistoryState = wasm.blitz_history_state_id();
  let dirty = false;
  let loadHandle: (handle: SceneFileHandle) => Promise<void>;

  const closeMenus = () => {
    elements.openMenu.open = false;
    elements.saveMenu.open = false;
  };

  const markClean = () => {
    cleanHistoryState = wasm.blitz_history_state_id();
    dirty = false;
    elements.saveIndicator.dataset.dirty = "false";
  };

  const syncDirtyState = () => {
    const nextDirty = wasm.blitz_history_state_id() !== cleanHistoryState;
    if (nextDirty === dirty) {
      return;
    }
    dirty = nextDirty;
    elements.saveIndicator.dataset.dirty = String(dirty);
  };

  const canReplaceScene = () => {
    syncDirtyState();
    return !dirty || window.confirm("Discard unsaved changes and open another scene?");
  };

  const setRecentTargetVisible = (target: RecentSceneTarget, visible: boolean) => {
    target.list.hidden = !visible;
    for (const element of target.visibilityElements) {
      element.hidden = !visible;
    }
  };

  const renderRecentTarget = (target: RecentSceneTarget, recentFiles: RecentSceneFile[]) => {
    target.list.replaceChildren();
    setRecentTargetVisible(target, recentFiles.length > 0);
    for (const record of recentFiles) {
      const item = document.createElement("div");
      item.className = "recent-scene-item";
      if (target.menuItems) {
        item.setAttribute("role", "none");
      }

      const open = document.createElement("button");
      open.type = "button";
      open.className = "recent-scene-open";
      open.title = `Open ${record.name}`;
      if (target.menuItems) {
        open.setAttribute("role", "menuitem");
      }

      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      icon.classList.add("recent-scene-icon");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z");
      const fold = document.createElementNS("http://www.w3.org/2000/svg", "path");
      fold.setAttribute("d", "M14 2v6h6");
      icon.append(path, fold);

      const name = document.createElement("span");
      name.className = "recent-scene-name";
      name.textContent = record.name;
      open.append(icon, name);
      open.addEventListener("click", async () => {
        if (!canReplaceScene()) {
          return;
        }
        try {
          await loadHandle(record.handle);
          closeMenus();
        } catch (error) {
          options.onError(error instanceof Error ? error.message : String(error));
        }
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "recent-scene-remove";
      remove.textContent = "×";
      remove.title = `Remove ${record.name} from recent files`;
      remove.setAttribute("aria-label", `Remove ${record.name} from recent files`);
      remove.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          await removeRecentSceneFile(record.id);
          await refreshRecent();
        } catch (error) {
          options.onError(error instanceof Error ? error.message : String(error));
        }
      });

      item.append(open, remove);
      target.list.append(item);
    }
  };

  const refreshRecent = async (records?: RecentSceneFile[]) => {
    const recentFiles = records ?? (await listRecentSceneFiles());
    for (const target of elements.recentTargets) {
      renderRecentTarget(target, recentFiles);
    }
  };

  loadHandle = async (handle) => {
    if (!(await ensureSceneFilePermission(handle, "read"))) {
      throw new Error(`Permission to open ${handle.name} was not granted.`);
    }
    const file = await handle.getFile();
    deserializeScene(wasm, new Uint8Array(await file.arrayBuffer()));
    currentHandle = handle;
    markClean();
    options.onLoaded();
    try {
      await refreshRecent(await rememberSceneFile(handle));
    } catch {
      // The file is already open; recent handle persistence is best effort.
    }
  };

  const saveToHandle = async (handle: SceneFileHandle) => {
    if (!(await ensureSceneFilePermission(handle, "readwrite"))) {
      throw new Error(`Permission to save ${handle.name} was not granted.`);
    }
    const writable = await handle.createWritable();
    await writable.write(serializeScene(wasm, elements.saveCurrentViewpointInput.checked));
    await writable.close();
    currentHandle = handle;
    markClean();
    try {
      await refreshRecent(await rememberSceneFile(handle));
    } catch {
      // The file is already saved; recent handle persistence is best effort.
    }
  };

  const saveAs = async () => {
    if (!browserWindow.showSaveFilePicker) {
      downloadScene(serializeScene(wasm, elements.saveCurrentViewpointInput.checked));
      markClean();
      return;
    }
    const handle = await browserWindow.showSaveFilePicker({
      ...filePickerOptions,
      suggestedName: currentHandle?.name ?? "scene.blitz",
    });
    await saveToHandle(handle);
  };

  const run = async (operation: () => Promise<void>) => {
    try {
      await operation();
      closeMenus();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      options.onError(error instanceof Error ? error.message : String(error));
    }
  };

  elements.openMenu.addEventListener("toggle", () => {
    if (elements.openMenu.open) {
      elements.saveMenu.open = false;
    }
  });
  elements.saveMenu.addEventListener("toggle", () => {
    if (elements.saveMenu.open) {
      elements.openMenu.open = false;
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Node)) {
      return;
    }
    if (elements.openMenu.open && !elements.openMenu.contains(event.target)) {
      elements.openMenu.open = false;
    }
    if (elements.saveMenu.open && !elements.saveMenu.contains(event.target)) {
      elements.saveMenu.open = false;
    }
  });

  void refreshRecent().catch(() => {
    for (const target of elements.recentTargets) {
      target.list.replaceChildren();
      setRecentTargetVisible(target, false);
    }
  });

  const openFile = () => {
    if (!canReplaceScene()) {
      return;
    }
    void run(async () => {
      if (browserWindow.showOpenFilePicker) {
        const [handle] = await browserWindow.showOpenFilePicker(filePickerOptions);
        await loadHandle(handle);
        return;
      }
      currentHandle = undefined;
      const file = await chooseSceneFallback();
      if (!file) {
        return;
      }
      deserializeScene(wasm, new Uint8Array(await file.arrayBuffer()));
      markClean();
      options.onLoaded();
    });
  };

  const saveFile = () => {
    void run(async () => {
      if (currentHandle) {
        await saveToHandle(currentHandle);
      } else {
        await saveAs();
      }
    });
  };

  const showRecentFiles = () => {
    const fileMenu = elements.openMenu.closest<HTMLDetailsElement>("#file-menu");
    if (fileMenu) {
      fileMenu.open = true;
    }
    elements.saveMenu.open = false;
    elements.openMenu.open = true;
    void refreshRecent()
      .then(() => {
        const firstRecent =
          elements.openMenu.querySelector<HTMLButtonElement>(".recent-scene-open");
        (firstRecent ?? elements.chooseFileButton).focus();
      })
      .catch(() => {
        elements.chooseFileButton.focus();
      });
  };

  elements.chooseFileButton.addEventListener("click", openFile);
  elements.saveButton.addEventListener("click", saveFile);
  elements.saveAsButton.addEventListener("click", () => void run(saveAs));

  window.addEventListener("beforeunload", (event) => {
    syncDirtyState();
    if (!dirty) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  return { markClean, openFile, saveFile, showRecentFiles, syncDirtyState };
}
