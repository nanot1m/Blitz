import { tr } from "zod/v4/locales/index.js";

type CanvasInteractionWasm = {
  blitz_hit_test(screenX: number, screenY: number): number;
  blitz_pan(dxPixels: number, dyPixels: number): void;
  blitz_pointer_down(screenX: number, screenY: number, additive: number): number;
  blitz_pointer_move(screenX: number, screenY: number): void;
  blitz_pointer_up(): void;
  blitz_resize_mode_at(screenX: number, screenY: number): number;
  blitz_zoom_at(screenX: number, screenY: number, zoomDelta: number): void;
};

type CanvasInteractionOptions = {
  beginEdit(): void;
  beginTextEdit(): void;
  cancelEdit(): void;
  commitEdit(): void;
  onSelectionChanged(): void;
};

export type CanvasInteractionController = {
  stopDragging(): void;
};

type KeyboardShortcutOptions = {
  beginTextEdit(): void;
  copySelection(): void | Promise<void>;
  deleteSelection(): void;
  duplicateSelection(): void;
  openFile(): void;
  pasteClipboard(): void | Promise<void>;
  redo(): void;
  saveFile(): void;
  selectAll(): void;
  stopDragging(): void;
  undo(): void;
};

type UiActionElements = {
  addCircleButton: HTMLButtonElement;
  addFrameButton: HTMLButtonElement;
  addRectButton: HTMLButtonElement;
  addTextButton: HTMLButtonElement;
  addTriangleButton: HTMLButtonElement;
  bringToFrontButton: HTMLButtonElement;
  deleteButton: HTMLButtonElement;
  emptyDemoTemplateButton: HTMLButtonElement;
  emptyOpenFileButton: HTMLButtonElement;
  sendToBackButton: HTMLButtonElement;
  shapeMenu: HTMLDetailsElement;
  stressTestButton: HTMLButtonElement;
  toggleGridButton: HTMLButtonElement;
  toggleStatsButton: HTMLButtonElement;
};

type UiActions = {
  addCircle(): void;
  addFrame(): void;
  addRect(): void;
  addText(): void;
  addTriangle(): void;
  bringToFront(): void;
  deleteSelection(): void;
  loadDemoTemplate(): void;
  openFile(): void;
  sendToBack(): void;
  stressTest(): void;
  toggleGrid(): void;
  toggleStats(): void;
};

type StyleControlElements = {
  containerInput: HTMLInputElement;
  frameTitleInput: HTMLInputElement;
  fillInput: HTMLInputElement;
  fillOpacityInput: HTMLInputElement;
  strokeInput: HTMLInputElement;
  strokeOpacityInput: HTMLInputElement;
  strokeWidthInput: HTMLInputElement;
  textAutoWidthButton: HTMLButtonElement;
  textColorInput: HTMLInputElement;
  textFontSizeInput: HTMLInputElement;
  textOpacityInput: HTMLInputElement;
};

type StyleActions = {
  beginTransaction(): void;
  commitTransaction(): void;
  setFill(red: number, green: number, blue: number): void;
  setFillOpacity(opacity: number): void;
  setStroke(red: number, green: number, blue: number): void;
  setStrokeOpacity(opacity: number): void;
  setStrokeWidth(width: number): void;
  setContainer(enabled: boolean): void;
  setFrameTitle(title: string): void;
  setTextColor(red: number, green: number, blue: number): void;
  setTextFontSize(fontSize: number): void;
  setTextOpacity(opacity: number): void;
  resetTextWidth(): void;
};

type TouchMode =
  | "idle"
  | "pending-object"
  | "pending-empty"
  | "entity"
  | "resize"
  | "pan"
  | "marquee"
  | "pinch";

function allowsNativeSelection(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function setupBrowserZoomGuards(canvas: HTMLCanvasElement): void {
  document.addEventListener(
    "wheel",
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.target !== canvas) {
        event.preventDefault();
      }
    },
    { capture: true, passive: false },
  );
  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    },
    { capture: true, passive: false },
  );
  for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(
      eventName,
      (event) => {
        if (event.target !== canvas) {
          event.preventDefault();
        }
      },
      { capture: true, passive: false },
    );
  }
}

export function setupCanvasInteractions(
  canvas: HTMLCanvasElement,
  wasm: CanvasInteractionWasm,
  options: CanvasInteractionOptions,
): CanvasInteractionController {
  setupBrowserZoomGuards(canvas);
  let draggingCamera = false;
  let draggingEntity = false;
  let resizingEntity = false;
  let resizePointerMode = 0;
  let selectingArea = false;
  let mouseEntityDragPending = false;
  let editTransactionActive = false;
  let mouseDragStartX = 0;
  let mouseDragStartY = 0;
  let lastX = 0;
  let lastY = 0;
  const activeTouches = new Map<number, { x: number; y: number }>();
  let lastPinchDistance = 0;
  let touchMode: TouchMode = "idle";
  let primaryTouchId: number | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimer: number | undefined;
  const touchMoveThreshold = 8;
  const mouseDragThreshold = 4;
  const longPressDelay = 450;

  const eventToCanvasPixels = (event: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  };

  const clientPointToCanvasPixels = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (clientX - rect.left) * dpr,
      y: (clientY - rect.top) * dpr,
    };
  };

  const touchGesture = () => {
    const points = Array.from(activeTouches.values());
    const center = points.reduce(
      (result, point) => ({
        x: result.x + point.x / points.length,
        y: result.y + point.y / points.length,
      }),
      { x: 0, y: 0 },
    );
    const distance =
      points.length >= 2
        ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
        : 0;
    return { center, distance };
  };

  const clearLongPressTimer = () => {
    if (longPressTimer !== undefined) {
      window.clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  };

  const setResizeCursor = (pointerMode: number) => {
    canvas.classList.toggle("is-resizing-nwse", pointerMode === 3 || pointerMode === 5);
    canvas.classList.toggle("is-resizing-nesw", pointerMode === 4 || pointerMode === 6);
    canvas.classList.toggle("is-resizing-ns", pointerMode === 7 || pointerMode === 9);
    canvas.classList.toggle("is-resizing-ew", pointerMode === 8 || pointerMode === 10);
  };

  const clearInteractionClasses = () => {
    canvas.classList.remove(
      "is-dragging-entity",
      "is-resizing-nwse",
      "is-resizing-nesw",
      "is-resizing-ns",
      "is-resizing-ew",
      "is-panning",
      "is-selecting",
    );
  };

  const beginTouchPointerInteraction = (mode: "entity" | "marquee") => {
    const start = clientPointToCanvasPixels(touchStartX, touchStartY);
    options.beginEdit();
    editTransactionActive = true;
    const pointerMode = wasm.blitz_pointer_down(start.x, start.y, 0);
    touchMode = pointerMode >= 3 ? "resize" : mode;
    draggingEntity = pointerMode === 1;
    resizingEntity = pointerMode >= 3;
    resizePointerMode = resizingEntity ? pointerMode : 0;
    selectingArea = mode === "marquee";
    if (selectingArea) {
      options.cancelEdit();
      editTransactionActive = false;
    }
    canvas.classList.toggle("is-dragging-entity", draggingEntity);
    setResizeCursor(pointerMode);
    canvas.classList.toggle("is-selecting", selectingArea);
    options.onSelectionChanged();
  };

  const beginPinch = () => {
    clearLongPressTimer();
    if (touchMode === "entity" || touchMode === "resize" || touchMode === "marquee") {
      wasm.blitz_pointer_up();
      if (editTransactionActive) {
        options.commitEdit();
        editTransactionActive = false;
      }
      options.onSelectionChanged();
    }
    draggingEntity = false;
    resizingEntity = false;
    resizePointerMode = 0;
    selectingArea = false;
    draggingCamera = true;
    touchMode = "pinch";
    clearInteractionClasses();
    canvas.classList.add("is-panning");
    const gesture = touchGesture();
    lastX = gesture.center.x;
    lastY = gesture.center.y;
    lastPinchDistance = gesture.distance;
  };

  const stopDragging = () => {
    clearLongPressTimer();
    draggingCamera = false;
    draggingEntity = false;
    resizingEntity = false;
    resizePointerMode = 0;
    selectingArea = false;
    mouseEntityDragPending = false;
    clearInteractionClasses();
    wasm.blitz_pointer_up();
    if (editTransactionActive) {
      options.commitEdit();
      editTransactionActive = false;
    }
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (activeTouches.size >= 2) {
        beginPinch();
        return;
      }

      stopDragging();
      primaryTouchId = event.pointerId;
      touchStartX = event.clientX;
      touchStartY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
      const point = eventToCanvasPixels(event);
      touchMode =
        wasm.blitz_hit_test(point.x, point.y) === -1 ? "pending-empty" : "pending-object";
      if (touchMode === "pending-empty") {
        longPressTimer = window.setTimeout(() => {
          longPressTimer = undefined;
          if (touchMode === "pending-empty" && primaryTouchId !== null) {
            const current = activeTouches.get(primaryTouchId);
            if (current) {
              beginTouchPointerInteraction("marquee");
            }
          }
        }, longPressDelay);
      }
      return;
    }

    const isPrimaryButton = event.button === 0;
    const isMiddleButton = event.button === 1;
    const isRightButton = event.button === 2;
    if (!isPrimaryButton && !isMiddleButton && !isRightButton) {
      return;
    }

    event.preventDefault();
    if (isMiddleButton || isRightButton) {
      stopDragging();
      draggingCamera = true;
      canvas.classList.add("is-panning");
    } else {
      const point = eventToCanvasPixels(event);
      const additive = event.shiftKey || event.ctrlKey || event.metaKey ? 1 : 0;
      options.beginEdit();
      editTransactionActive = true;
      const pointerMode = wasm.blitz_pointer_down(point.x, point.y, additive);
      draggingEntity = pointerMode === 1;
      resizingEntity = pointerMode >= 3;
      resizePointerMode = resizingEntity ? pointerMode : 0;
      selectingArea = pointerMode === 2;
      if (selectingArea) {
        options.cancelEdit();
        editTransactionActive = false;
      }
      mouseEntityDragPending =
        event.pointerType === "mouse" && (draggingEntity || resizingEntity);
      mouseDragStartX = event.clientX;
      mouseDragStartY = event.clientY;
      canvas.classList.toggle("is-dragging-entity", draggingEntity && !mouseEntityDragPending);
      if (!mouseEntityDragPending) {
        setResizeCursor(pointerMode);
      }
      canvas.classList.toggle("is-selecting", selectingArea);
      options.onSelectionChanged();
    }

    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      if (!activeTouches.has(event.pointerId)) {
        return;
      }
      event.preventDefault();
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activeTouches.size >= 2 && touchMode !== "pinch") {
        beginPinch();
        return;
      }
      const gesture = touchGesture();
      const dpr = window.devicePixelRatio || 1;
      if (touchMode === "pinch") {
        wasm.blitz_pan((gesture.center.x - lastX) * dpr, (gesture.center.y - lastY) * dpr);
        if (lastPinchDistance > 0 && gesture.distance > 0) {
          const zoomCenter = clientPointToCanvasPixels(gesture.center.x, gesture.center.y);
          const zoomDelta = Math.min(2, Math.max(0.5, gesture.distance / lastPinchDistance));
          wasm.blitz_zoom_at(zoomCenter.x, zoomCenter.y, zoomDelta);
        }
        lastX = gesture.center.x;
        lastY = gesture.center.y;
        lastPinchDistance = gesture.distance;
        return;
      }

      const moved = Math.hypot(event.clientX - touchStartX, event.clientY - touchStartY);
      if (touchMode === "pending-object" && moved >= touchMoveThreshold) {
        clearLongPressTimer();
        beginTouchPointerInteraction("entity");
      } else if (touchMode === "pending-empty" && moved >= touchMoveThreshold) {
        clearLongPressTimer();
        touchMode = "pan";
        draggingCamera = true;
        canvas.classList.add("is-panning");
      }

      if (touchMode === "entity" || touchMode === "resize" || touchMode === "marquee") {
        const point = eventToCanvasPixels(event);
        wasm.blitz_pointer_move(point.x, point.y);
      } else if (touchMode === "pan") {
        wasm.blitz_pan((event.clientX - lastX) * dpr, (event.clientY - lastY) * dpr);
      }
      lastX = event.clientX;
      lastY = event.clientY;
      return;
    }

    if (!draggingCamera && !draggingEntity && !resizingEntity && !selectingArea) {
      const point = eventToCanvasPixels(event);
      setResizeCursor(wasm.blitz_resize_mode_at(point.x, point.y));
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    if (draggingEntity || resizingEntity || selectingArea) {
      if ((draggingEntity || resizingEntity) && mouseEntityDragPending) {
        const moved = Math.hypot(
          event.clientX - mouseDragStartX,
          event.clientY - mouseDragStartY,
        );
        if (moved < mouseDragThreshold) {
          return;
        }
        mouseEntityDragPending = false;
        if (draggingEntity) {
          canvas.classList.add("is-dragging-entity");
        }
        if (resizingEntity) {
          setResizeCursor(resizePointerMode);
        }
      }
      const point = eventToCanvasPixels(event);
      wasm.blitz_pointer_move(point.x, point.y);
    } else {
      wasm.blitz_pan((event.clientX - lastX) * dpr, (event.clientY - lastY) * dpr);
    }
    lastX = event.clientX;
    lastY = event.clientY;
  });

  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      clearLongPressTimer();
      const wasPrimary = event.pointerId === primaryTouchId;
      activeTouches.delete(event.pointerId);
      if (touchMode === "pinch" && activeTouches.size > 0) {
        const gesture = touchGesture();
        lastX = gesture.center.x;
        lastY = gesture.center.y;
        lastPinchDistance = gesture.distance;
        touchMode = "pan";
        primaryTouchId = activeTouches.keys().next().value ?? null;
      } else if (activeTouches.size > 0) {
        const gesture = touchGesture();
        lastX = gesture.center.x;
        lastY = gesture.center.y;
      } else {
        if (wasPrimary && (touchMode === "pending-object" || touchMode === "pending-empty")) {
          const point = eventToCanvasPixels(event);
          options.beginEdit();
          editTransactionActive = true;
          wasm.blitz_pointer_down(point.x, point.y, 0);
          wasm.blitz_pointer_up();
          options.commitEdit();
          editTransactionActive = false;
        } else if (
          touchMode === "entity" ||
          touchMode === "resize" ||
          touchMode === "marquee"
        ) {
          wasm.blitz_pointer_up();
          if (editTransactionActive) {
            options.commitEdit();
            editTransactionActive = false;
          }
        }
        lastPinchDistance = 0;
        touchMode = "idle";
        primaryTouchId = null;
        draggingCamera = false;
        draggingEntity = false;
        resizingEntity = false;
        resizePointerMode = 0;
        selectingArea = false;
        clearInteractionClasses();
        options.onSelectionChanged();
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }

    stopDragging();
    options.onSelectionChanged();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") {
      clearLongPressTimer();
      activeTouches.delete(event.pointerId);
      if (touchMode === "entity" || touchMode === "resize" || touchMode === "marquee") {
        wasm.blitz_pointer_up();
      }
      if (activeTouches.size > 0) {
        const gesture = touchGesture();
        lastX = gesture.center.x;
        lastY = gesture.center.y;
        lastPinchDistance = gesture.distance;
        touchMode = "pan";
        primaryTouchId = activeTouches.keys().next().value ?? null;
      } else {
        lastPinchDistance = 0;
        touchMode = "idle";
        primaryTouchId = null;
        draggingCamera = false;
        draggingEntity = false;
        resizingEntity = false;
        resizePointerMode = 0;
        selectingArea = false;
        clearInteractionClasses();
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      return;
    }

    stopDragging();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("auxclick", (event) => {
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
    }
  });
  canvas.addEventListener("dblclick", (event) => {
    event.preventDefault();
    stopDragging();
    options.beginTextEdit();
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const dpr = window.devicePixelRatio || 1;
      if (event.ctrlKey || event.metaKey) {
        const point = eventToCanvasPixels(event);
        wasm.blitz_zoom_at(point.x, point.y, Math.exp(-event.deltaY * 0.007));
      } else {
        wasm.blitz_pan(-event.deltaX * dpr, -event.deltaY * dpr);
      }
    },
    { passive: false },
  );

  document.addEventListener("selectstart", (event) => {
    if (!allowsNativeSelection(event.target)) {
      event.preventDefault();
    }
  });
  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, select")) {
        return;
      }
      event.preventDefault();
    },
    { passive: false },
  );

  return { stopDragging };
}

export function setupKeyboardShortcuts(options: KeyboardShortcutOptions): void {
  window.addEventListener("keydown", (event) => {
    if (allowsNativeSelection(event.target) || document.querySelector("dialog[open]")) {
      return;
    }

    const commandKey = event.ctrlKey || event.metaKey;
    if (commandKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        options.stopDragging();
        if (event.shiftKey) {
          options.redo();
        } else {
          options.undo();
        }
        return;
      }
      if (key === "y") {
        event.preventDefault();
        options.stopDragging();
        options.redo();
        return;
      }
      if (key === "a") {
        event.preventDefault();
        options.stopDragging();
        options.selectAll();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        options.stopDragging();
        void options.copySelection();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        options.stopDragging();
        void options.pasteClipboard();
        return;
      }
      if (key === "d") {
        event.preventDefault();
        options.stopDragging();
        options.duplicateSelection();
        return;
      }
      if (key === "o") {
        event.preventDefault();
        options.openFile();
        return;
      }
      if (key === "s") {
        event.preventDefault();
        options.saveFile();
        return;
      }
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      options.deleteSelection();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      options.beginTextEdit();
    }
  });
}

export function setupUiActions(elements: UiActionElements, actions: UiActions): void {
  elements.addRectButton.addEventListener("click", actions.addRect);
  elements.addFrameButton.addEventListener("click", actions.addFrame);
  elements.addCircleButton.addEventListener("click", actions.addCircle);
  elements.addTriangleButton.addEventListener("click", actions.addTriangle);
  elements.addTextButton.addEventListener("click", actions.addText);
  elements.stressTestButton.addEventListener("click", actions.stressTest);
  elements.deleteButton.addEventListener("click", actions.deleteSelection);
  elements.sendToBackButton.addEventListener("click", actions.sendToBack);
  elements.bringToFrontButton.addEventListener("click", actions.bringToFront);
  elements.toggleGridButton.addEventListener("click", actions.toggleGrid);
  elements.toggleStatsButton.addEventListener("click", actions.toggleStats);
  elements.emptyOpenFileButton.addEventListener("click", actions.openFile);
  elements.emptyDemoTemplateButton.addEventListener("click", actions.loadDemoTemplate);
}

function colorChannels(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  ];
}

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: number | undefined;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func.apply(this, args), wait);
  } as T;
}

function makeTransactionable<T extends (...args: any[]) => void>(func: T, actions: StyleActions): T {
  let transactionActive = false;
  const debouncedCommitTransaction = debounce((actions: StyleActions) => {
    if (!transactionActive) {
      return;
    }
    actions.commitTransaction();
    transactionActive = false;
  }, 300);
  return function (this: any, ...args: any[]) {
    if (!transactionActive) {
      actions.beginTransaction();
      transactionActive = true;
    }
    func.apply(this, args);
    debouncedCommitTransaction(actions);
  } as T;
}

export function setupStyleControls(
  elements: StyleControlElements,
  actions: StyleActions,
): void {
  elements.containerInput.addEventListener("change", () => {
    actions.setContainer(elements.containerInput.checked);
  });
  elements.frameTitleInput.addEventListener("change", () => {
    actions.setFrameTitle(elements.frameTitleInput.value);
  });
  elements.fillInput.addEventListener("input", makeTransactionable(() => {
    actions.setFill(...colorChannels(elements.fillInput.value));
  }, actions));
  elements.fillOpacityInput.addEventListener("input", makeTransactionable(() => {
    actions.setFillOpacity(Number(elements.fillOpacityInput.value));
  }, actions));
  elements.strokeInput.addEventListener("input", makeTransactionable(() => {
    actions.setStroke(...colorChannels(elements.strokeInput.value));
  }, actions));
  elements.strokeOpacityInput.addEventListener("input", makeTransactionable(() => {
    actions.setStrokeOpacity(Number(elements.strokeOpacityInput.value));
  }, actions));
  elements.strokeWidthInput.addEventListener("input", makeTransactionable(() => {
    const width = Number(elements.strokeWidthInput.value);
    if (Number.isFinite(width)) {
      actions.setStrokeWidth(width);
    }
  }, actions));
  elements.textColorInput.addEventListener("input", makeTransactionable(() => {
    actions.setTextColor(...colorChannels(elements.textColorInput.value));
  }, actions));
  elements.textOpacityInput.addEventListener("input", makeTransactionable(() => {
    actions.setTextOpacity(Number(elements.textOpacityInput.value));
  }, actions));
  elements.textFontSizeInput.addEventListener("input", makeTransactionable(() => {
    const fontSize = Number(elements.textFontSizeInput.value);
    if (Number.isFinite(fontSize)) {
      actions.setTextFontSize(fontSize);
    }
  }, actions));
  elements.textAutoWidthButton.addEventListener("click", () => {
    actions.resetTextWidth();
  });
}
