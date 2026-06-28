type CanvasInteractionWasm = {
  blitz_hit_test(screenX: number, screenY: number): number;
  blitz_pan(dxPixels: number, dyPixels: number): void;
  blitz_pointer_down(screenX: number, screenY: number, additive: number): number;
  blitz_begin_marquee(screenX: number, screenY: number): void;
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
  fillInput: HTMLButtonElement;
  fillOpacityInput: HTMLInputElement;
  strokeInput: HTMLButtonElement;
  strokeOpacityInput: HTMLInputElement;
  strokeWidthInput: HTMLInputElement;
  textAutoWidthButton: HTMLButtonElement;
  textColorInput: HTMLButtonElement;
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
  const doubleTapDelay = 300;
  const doubleTapDistance = 24;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

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
    if (mode === "marquee") {
      // Long-press starts a fresh selection box regardless of what is under the
      // finger; this clears the current selection and never drags an object.
      wasm.blitz_begin_marquee(start.x, start.y);
      touchMode = "marquee";
      draggingEntity = false;
      resizingEntity = false;
      resizePointerMode = 0;
      selectingArea = true;
      canvas.classList.toggle("is-dragging-entity", false);
      canvas.classList.toggle("is-selecting", true);
      options.onSelectionChanged();
      return;
    }
    options.beginEdit();
    editTransactionActive = true;
    const pointerMode = wasm.blitz_pointer_down(start.x, start.y, 0);
    touchMode = pointerMode >= 3 ? "resize" : "entity";
    draggingEntity = pointerMode === 1;
    resizingEntity = pointerMode >= 3;
    resizePointerMode = resizingEntity ? pointerMode : 0;
    selectingArea = false;
    canvas.classList.toggle("is-dragging-entity", draggingEntity);
    setResizeCursor(pointerMode);
    canvas.classList.toggle("is-selecting", false);
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
      // A long press anywhere (over empty space or an object) starts a marquee
      // selection, clearing the current selection first.
      longPressTimer = window.setTimeout(() => {
        longPressTimer = undefined;
        if (
          (touchMode === "pending-empty" || touchMode === "pending-object") &&
          primaryTouchId !== null &&
          activeTouches.get(primaryTouchId)
        ) {
          beginTouchPointerInteraction("marquee");
        }
      }, longPressDelay);
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
      // Long click on an object starts a fresh marquee selection (mirrors the
      // touch long-press); a drag past the threshold cancels it (see pointermove).
      if (!additive && pointerMode === 1) {
        longPressTimer = window.setTimeout(() => {
          longPressTimer = undefined;
          if (editTransactionActive) {
            options.cancelEdit();
            editTransactionActive = false;
          }
          wasm.blitz_begin_marquee(point.x, point.y);
          draggingEntity = false;
          resizingEntity = false;
          resizePointerMode = 0;
          mouseEntityDragPending = false;
          selectingArea = true;
          canvas.classList.toggle("is-dragging-entity", false);
          canvas.classList.toggle("is-selecting", true);
          options.onSelectionChanged();
        }, longPressDelay);
      }
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
        clearLongPressTimer();
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
          // A second tap on the same spot edits the selected text (mirrors the
          // desktop double-click). beginTextEdit no-ops if no text is selected.
          const now = performance.now();
          const nearLastTap =
            Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) <=
            doubleTapDistance;
          if (now - lastTapAt <= doubleTapDelay && nearLastTap) {
            options.beginTextEdit();
            lastTapAt = 0;
          } else {
            lastTapAt = now;
            lastTapX = event.clientX;
            lastTapY = event.clientY;
          }
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

function setColorButtonValue(button: HTMLButtonElement, value: string): void {
  button.value = value;
  button.style.setProperty("--style-color", value);
}

function setupColorPickerButton(
  button: HTMLButtonElement,
  opacityInput: HTMLInputElement,
  onColor: (red: number, green: number, blue: number) => void,
  onOpacity: (opacity: number) => void,
  actions: StyleActions,
): void {
  const palette = [
    "#111827",
    "#4b5563",
    "#ffffff",
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#22c55e",
    "#14b8a6",
    "#3b82f6",
    "#6366f1",
    "#a855f7",
    "#ec4899",
  ];
  let popover: HTMLDivElement | null = null;
  const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
  const commitColor = makeTransactionable((value: string) => {
    if (!isHexColor(value)) {
      return;
    }
    setColorButtonValue(button, value);
    onColor(...colorChannels(value));
  }, actions);
  const commitOpacity = makeTransactionable((value: number) => {
    opacityInput.value = String(value);
    onOpacity(value);
  }, actions);
  const close = () => {
    popover?.remove();
    popover = null;
    button.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    close();
    popover = document.createElement("div");
    popover.className = "color-picker-popover";
    popover.addEventListener("pointerdown", (event) => event.stopPropagation());
    const swatches = document.createElement("div");
    swatches.className = "color-picker-swatches";
    const currentValue = button.value || "#000000";
    const valueRow = document.createElement("div");
    valueRow.className = "color-picker-value";
    const nativePicker = document.createElement("span");
    nativePicker.className = "color-picker-native-control";
    const nativeInput = document.createElement("input");
    nativeInput.type = "color";
    nativeInput.value = currentValue;
    nativeInput.setAttribute("aria-label", "Custom color");
    nativePicker.append(nativeInput);
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.inputMode = "text";
    hexInput.spellcheck = false;
    hexInput.value = currentValue;
    hexInput.setAttribute("aria-label", "Hex color");
    for (const value of palette) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-picker-swatch";
      swatch.style.setProperty("--style-color", value);
      swatch.setAttribute("aria-label", value);
      swatch.setAttribute("aria-pressed", String(value.toLowerCase() === currentValue.toLowerCase()));
      swatch.addEventListener("click", () => {
        commitColor(value);
        nativeInput.value = value;
        hexInput.value = value;
        for (const item of swatches.querySelectorAll(".color-picker-swatch")) {
          item.setAttribute("aria-pressed", String(item === swatch));
        }
      });
      swatches.append(swatch);
    }
    hexInput.addEventListener("input", () => {
      const value = hexInput.value.trim();
      if (!isHexColor(value)) {
        return;
      }
      nativeInput.value = value;
      commitColor(value);
    });
    nativeInput.addEventListener("input", () => {
      commitColor(nativeInput.value);
      hexInput.value = nativeInput.value;
      for (const item of swatches.querySelectorAll(".color-picker-swatch")) {
        item.setAttribute("aria-pressed", "false");
      }
    });
    valueRow.append(nativePicker, hexInput);
    const alpha = document.createElement("input");
    alpha.type = "range";
    alpha.min = "0";
    alpha.max = "1";
    alpha.step = "0.01";
    alpha.value = opacityInput.value || "1";
    alpha.className = "color-picker-alpha";
    alpha.setAttribute("aria-label", "Alpha");
    alpha.addEventListener("input", () => commitOpacity(Number(alpha.value)));
    popover.append(swatches, valueRow, alpha);
    document.body.append(popover);
    const rect = button.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - popoverRect.width - 8,
      Math.max(8, rect.left),
    );
    const top =
      rect.top > popoverRect.height + 12
        ? rect.top - popoverRect.height - 8
        : rect.bottom + 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(8, Math.min(window.innerHeight - popoverRect.height - 8, top))}px`;
    button.setAttribute("aria-expanded", "true");
    setTimeout(() => {
      document.addEventListener("pointerdown", close, { once: true });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          close();
        }
      }, { once: true });
    }, 0);
  };
  button.addEventListener("click", () => {
    if (popover) {
      close();
    } else {
      open();
    }
  });
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
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
  setupColorPickerButton(elements.fillInput, elements.fillOpacityInput, (...color) => {
    actions.setFill(...color);
  }, (opacity) => actions.setFillOpacity(opacity), actions);
  elements.fillOpacityInput.addEventListener("input", makeTransactionable(() => {
    actions.setFillOpacity(Number(elements.fillOpacityInput.value));
  }, actions));
  setupColorPickerButton(elements.strokeInput, elements.strokeOpacityInput, (...color) => {
    actions.setStroke(...color);
  }, (opacity) => actions.setStrokeOpacity(opacity), actions);
  elements.strokeOpacityInput.addEventListener("input", makeTransactionable(() => {
    actions.setStrokeOpacity(Number(elements.strokeOpacityInput.value));
  }, actions));
  elements.strokeWidthInput.addEventListener("input", makeTransactionable(() => {
    const width = Number(elements.strokeWidthInput.value);
    if (Number.isFinite(width)) {
      actions.setStrokeWidth(width);
    }
  }, actions));
  setupColorPickerButton(elements.textColorInput, elements.textOpacityInput, (...color) => {
    actions.setTextColor(...color);
  }, (opacity) => actions.setTextOpacity(opacity), actions);
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
