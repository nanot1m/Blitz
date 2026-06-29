type WasmHistory = {
  blitz_history_begin(): void;
  blitz_history_commit(): void;
  blitz_history_cancel(): void;
  blitz_history_reset(): void;
  blitz_history_undo(): number;
  blitz_history_redo(): number;
  blitz_history_can_undo(): number;
  blitz_history_can_redo(): number;
  blitz_history_state_id(): number;
};

type WasmHistoryOptions = {
  onApplied(): void;
  onChanged?(): void;
  onError?(message: string): void;
};

// Thin binding over the WASM delta-history engine. Transactions are captured in
// the engine; this layer only brackets grouped edits and relays the post-apply
// callbacks. stateId mirrors the engine's per-step epoch, so dirty tracking is
// stable across undo/redo without a separate TS-side snapshot.
export function createWasmHistory(
  wasm: WasmHistory,
  options: WasmHistoryOptions,
) {
  let applying = false;
  let active = false;

  const begin = () => {
    if (!applying) {
      active = true;
      wasm.blitz_history_begin();
    }
  };

  const cancel = () => {
    if (!applying) {
      active = false;
      wasm.blitz_history_cancel();
    }
  };

  const commit = () => {
    if (applying) {
      return;
    }
    wasm.blitz_history_commit();
    active = false;
    options.onChanged?.();
  };

  const applied = () => {
    applying = true;
    try {
      options.onApplied();
    } finally {
      applying = false;
    }
    options.onChanged?.();
  };

  const undo = () => {
    if (wasm.blitz_history_undo() !== 1) {
      return false;
    }
    applied();
    return true;
  };

  const redo = () => {
    if (wasm.blitz_history_redo() !== 1) {
      return false;
    }
    applied();
    return true;
  };

  const reset = () => {
    wasm.blitz_history_reset();
    options.onChanged?.();
  };

  const transact = (action: () => void) => {
    begin();
    try {
      action();
    } finally {
      commit();
    }
  };

  return {
    begin,
    cancel,
    canRedo: () => wasm.blitz_history_can_redo() === 1,
    canUndo: () => wasm.blitz_history_can_undo() === 1,
    commit,
    isActive: () => active,
    redo,
    reset,
    stateId: () => wasm.blitz_history_state_id(),
    transact,
    undo,
  };
}
