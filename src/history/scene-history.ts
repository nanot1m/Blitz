type SceneHistoryWasm = {
  memory: WebAssembly.Memory;
  blitz_scene_file_buffer_ptr(): number;
  blitz_scene_file_buffer_capacity(): number;
  blitz_scene_file_buffer_reserve(bytes: number): number;
  blitz_scene_serialize(): number;
  blitz_scene_deserialize(byteCount: number): number;
  blitz_uniform_ptr(): number;
  blitz_uniform_f32_count(): number;
  blitz_set_camera(x: number, y: number, zoom: number): void;
};

type HistoryState = {
  id: number;
  bytes: Uint8Array;
};

type SceneHistoryOptions = {
  maxEntries?: number;
  maxBytes?: number;
  onApplied(): void;
  onChanged?(): void;
  onError(message: string): void;
};

const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function createSceneHistory(
  wasm: SceneHistoryWasm,
  options: SceneHistoryOptions,
) {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let states: HistoryState[] = [];
  let cursor = -1;
  let nextStateId = 1;
  let totalBytes = 0;
  let transactionBefore: Uint8Array | undefined;
  let applying = false;

  const capture = (): Uint8Array => {
    const byteCount = wasm.blitz_scene_serialize();
    if (byteCount === 0) {
      throw new Error(
        `History capture exceeds the ${Math.floor(
          wasm.blitz_scene_file_buffer_capacity() / (1024 * 1024),
        )} MB WASM scene buffer.`,
      );
    }
    return new Uint8Array(
      wasm.memory.buffer,
      wasm.blitz_scene_file_buffer_ptr(),
      byteCount,
    ).slice();
  };

  const trim = () => {
    while (
      states.length > 1 &&
      (states.length > maxEntries || totalBytes > maxBytes)
    ) {
      totalBytes -= states[0].bytes.byteLength;
      states.shift();
      cursor -= 1;
    }
  };

  const push = (bytes: Uint8Array) => {
    while (states.length - 1 > cursor) {
      totalBytes -= states.pop()!.bytes.byteLength;
    }
    states.push({ id: nextStateId++, bytes });
    totalBytes += bytes.byteLength;
    cursor = states.length - 1;
    trim();
    options.onChanged?.();
  };

  const reset = () => {
    transactionBefore = undefined;
    states = [];
    cursor = -1;
    totalBytes = 0;
    try {
      push(capture());
    } catch (error) {
      options.onError(error instanceof Error ? error.message : String(error));
    }
  };

  const begin = () => {
    if (applying || transactionBefore) {
      return;
    }
    try {
      transactionBefore = capture();
    } catch (error) {
      options.onError(error instanceof Error ? error.message : String(error));
    }
  };

  const cancel = () => {
    transactionBefore = undefined;
  };

  const commit = () => {
    if (applying || !transactionBefore) {
      return;
    }
    const before = transactionBefore;
    transactionBefore = undefined;
    try {
      const after = capture();
      if (!bytesEqual(before, after)) {
        push(after);
      }
    } catch (error) {
      options.onError(error instanceof Error ? error.message : String(error));
    }
  };

  const apply = (state: HistoryState): boolean => {
    const uniforms = new Float32Array(
      wasm.memory.buffer,
      wasm.blitz_uniform_ptr(),
      wasm.blitz_uniform_f32_count(),
    );
    const camera = [uniforms[2], uniforms[3], uniforms[4]] as const;
    if (state.bytes.byteLength > wasm.blitz_scene_file_buffer_capacity()) {
      options.onError("History state exceeds the WASM scene buffer.");
      return false;
    }
    applying = true;
    try {
      const ptr = wasm.blitz_scene_file_buffer_reserve(state.bytes.byteLength);
      if (ptr === 0) {
        options.onError("History state could not be restored (buffer allocation failed).");
        return false;
      }
      new Uint8Array(wasm.memory.buffer, ptr, state.bytes.byteLength).set(state.bytes);
      const error = wasm.blitz_scene_deserialize(state.bytes.byteLength);
      if (error !== 0) {
        options.onError(`History state could not be restored (error ${error}).`);
        return false;
      }
      wasm.blitz_set_camera(camera[0], camera[1], camera[2]);
      options.onApplied();
      return true;
    } finally {
      applying = false;
    }
  };

  const undo = () => {
    cancel();
    if (cursor <= 0) {
      return false;
    }
    if (!apply(states[cursor - 1])) {
      return false;
    }
    cursor -= 1;
    options.onChanged?.();
    return true;
  };

  const redo = () => {
    cancel();
    if (cursor < 0 || cursor >= states.length - 1) {
      return false;
    }
    if (!apply(states[cursor + 1])) {
      return false;
    }
    cursor += 1;
    options.onChanged?.();
    return true;
  };

  const transact = (action: () => void) => {
    begin();
    try {
      action();
    } finally {
      commit();
    }
  };

  reset();
  return {
    begin,
    cancel,
    canRedo: () => cursor >= 0 && cursor < states.length - 1,
    canUndo: () => cursor > 0,
    commit,
    redo,
    reset,
    stateId: () => states[cursor]?.id ?? 0,
    transact,
    undo,
  };
}
