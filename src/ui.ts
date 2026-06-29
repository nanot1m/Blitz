import {
  Activity,
  BringToFront,
  Bug,
  Circle,
  Ellipsis,
  createIcons,
  FolderOpen,
  Frame,
  Grid2X2,
  LayoutGrid,
  PenLine,
  Redo2,
  Radio,
  Save,
  SendToBack,
  Settings,
  Shapes,
  SlidersHorizontal,
  Square,
  Trash2,
  Triangle,
  Type as TypeIcon,
  Undo2,
} from "lucide";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Blitz interface element was not found: ${selector}`);
  }
  return element;
}

export function createBlitzUi() {
  createIcons({
    icons: {
      Activity,
      BringToFront,
      Bug,
      Circle,
      Ellipsis,
      FolderOpen,
      Frame,
      Grid2X2,
      LayoutGrid,
      PenLine,
      Radio,
      Redo2,
      Save,
      SendToBack,
      Settings,
      Shapes,
      SlidersHorizontal,
      Square,
      Trash2,
      Triangle,
      Type: TypeIcon,
      Undo2,
    },
  });

  const fallback = requireElement<HTMLDivElement>("#fallback");
  const fileMenu = requireElement<HTMLDetailsElement>("#file-menu");
  const fileMenuContent = requireElement<HTMLDivElement>(".file-menu-content");
  const shapeMenu = requireElement<HTMLDetailsElement>("#shape-menu");
  const shapeMenuContent = requireElement<HTMLDivElement>(".shape-menu-content");
  const viewMenu = requireElement<HTMLDetailsElement>("#view-menu");
  const viewMenuContent = requireElement<HTMLDivElement>(".view-menu-content");
  const collapsedShapeMenu = window.matchMedia("(max-width: 720px)");

  const syncShapeMenuMode = () => {
    fileMenu.open = !collapsedShapeMenu.matches;
    shapeMenu.open = !collapsedShapeMenu.matches;
    viewMenu.open = !collapsedShapeMenu.matches;
  };
  syncShapeMenuMode();
  collapsedShapeMenu.addEventListener("change", syncShapeMenuMode);

  const closeCollapsedMenu = (menu: HTMLDetailsElement, event: Event) => {
    if (
      collapsedShapeMenu.matches &&
      event.target instanceof Element &&
      event.target.closest("button")
    ) {
      menu.open = false;
    }
  };
  fileMenuContent.addEventListener("click", (event) => closeCollapsedMenu(fileMenu, event));
  shapeMenuContent.addEventListener("click", (event) => closeCollapsedMenu(shapeMenu, event));
  viewMenuContent.addEventListener("click", (event) => closeCollapsedMenu(viewMenu, event));

  document.addEventListener("pointerdown", (event) => {
    if (collapsedShapeMenu.matches && event.target instanceof Node) {
      if (fileMenu.open && !fileMenu.contains(event.target)) {
        fileMenu.open = false;
      }
      if (shapeMenu.open && !shapeMenu.contains(event.target)) {
        shapeMenu.open = false;
      }
      if (viewMenu.open && !viewMenu.contains(event.target)) {
        viewMenu.open = false;
      }
    }
  });

  return {
    canvas: requireElement<HTMLCanvasElement>("#blitz-canvas"),
    textEditor: requireElement<HTMLTextAreaElement>("#text-editor"),
    fallback,
    shapeMenu,
    openSceneMenu: requireElement<HTMLDetailsElement>("#open-scene-menu"),
    saveSceneMenu: requireElement<HTMLDetailsElement>("#save-scene-menu"),
    saveSceneIndicator: requireElement<HTMLElement>("#save-scene"),
    newSceneFileButton: requireElement<HTMLButtonElement>("#new-scene-file"),
    chooseSceneFileButton: requireElement<HTMLButtonElement>("#choose-scene-file"),
    saveSceneButton: requireElement<HTMLButtonElement>("#save-scene-current"),
    saveSceneAsButton: requireElement<HTMLButtonElement>("#save-scene-as"),
    saveCurrentViewpointInput: requireElement<HTMLInputElement>("#save-current-viewpoint"),
    recentScenes: requireElement<HTMLDivElement>("#recent-scenes"),
    recentScenesDivider: requireElement<HTMLDivElement>("#recent-scenes-divider"),
    emptyState: requireElement<HTMLElement>("#empty-state"),
    emptyOpenFileButton: requireElement<HTMLButtonElement>("#empty-open-file"),
    emptyRecentSection: requireElement<HTMLElement>("#empty-recent-section"),
    emptyRecentScenes: requireElement<HTMLDivElement>("#empty-recent-scenes"),
    emptyDemoTemplateButton: requireElement<HTMLButtonElement>("#empty-demo-template"),
    styleIsland: requireElement<HTMLElement>("#style-island"),
    debuggerIsland: requireElement<HTMLElement>("#debugger-island"),
    debuggerEntityId: requireElement<HTMLElement>("#debugger-entity-id"),
    debuggerComponents: requireElement<HTMLDivElement>("#debugger-components"),
    selectedContainerInput: requireElement<HTMLInputElement>("#selected-container"),
    selectedGeometryControls: requireElement<HTMLDivElement>("#selected-geometry-controls"),
    selectedFillInput: requireElement<HTMLButtonElement>("#selected-fill"),
    selectedFillOpacityInput: requireElement<HTMLInputElement>("#selected-fill-opacity"),
    selectedStrokeRow: requireElement<HTMLElement>("#selected-stroke-row"),
    selectedStrokeInput: requireElement<HTMLButtonElement>("#selected-stroke"),
    selectedStrokeOpacityInput: requireElement<HTMLInputElement>("#selected-stroke-opacity"),
    selectedStrokeWidthInput: requireElement<HTMLInputElement>("#selected-stroke-width"),
    selectedMixedDivider: requireElement<HTMLElement>("#selected-mixed-divider"),
    selectedFrameControls: requireElement<HTMLElement>("#selected-frame-controls"),
    selectedFrameTitleInput: requireElement<HTMLInputElement>("#selected-frame-title"),
    selectedTextControls: requireElement<HTMLElement>("#selected-text-controls"),
    selectedTextColorInput: requireElement<HTMLButtonElement>("#selected-text-color"),
    selectedTextOpacityInput: requireElement<HTMLInputElement>("#selected-text-opacity"),
    selectedTextFontSizeInput: requireElement<HTMLInputElement>("#selected-text-font-size"),
    selectedTextAutoWidthButton: requireElement<HTMLButtonElement>("#selected-text-auto-width"),
    addRectButton: requireElement<HTMLButtonElement>("#add-rect"),
    addFrameButton: requireElement<HTMLButtonElement>("#add-frame"),
    addCircleButton: requireElement<HTMLButtonElement>("#add-circle"),
    addTriangleButton: requireElement<HTMLButtonElement>("#add-triangle"),
    addTextButton: requireElement<HTMLButtonElement>("#add-text"),
    penToolButton: requireElement<HTMLButtonElement>("#pen-tool"),
    stressTestButton: requireElement<HTMLButtonElement>("#stress-test"),
    sendToBackButton: requireElement<HTMLButtonElement>("#send-to-back"),
    bringToFrontButton: requireElement<HTMLButtonElement>("#bring-to-front"),
    deleteButton: requireElement<HTMLButtonElement>("#delete-selected"),
    undoButton: requireElement<HTMLButtonElement>("#undo-action"),
    redoButton: requireElement<HTMLButtonElement>("#redo-action"),
    togglePropertiesButton: requireElement<HTMLButtonElement>("#toggle-properties"),
    zoomIndicator: requireElement<HTMLDivElement>("#zoom-indicator"),
    toggleStatsButton: requireElement<HTMLButtonElement>("#toggle-stats"),
    toggleGridButton: requireElement<HTMLButtonElement>("#toggle-grid"),
    toggleDebuggerButton: requireElement<HTMLButtonElement>("#toggle-debugger"),
    statsPanel: requireElement<HTMLDivElement>("#stats-panel"),
    statsBody: requireElement<HTMLDivElement>("#stats-body"),
    openMcpSettingsButton: requireElement<HTMLButtonElement>("#open-mcp-settings"),
    openCollaborationSettingsButton: requireElement<HTMLButtonElement>("#open-collaboration-settings"),
    collaborationSettingsDialog: requireElement<HTMLDialogElement>("#collaboration-settings-dialog"),
    collaborationSettingsForm: requireElement<HTMLFormElement>("#collaboration-settings-form"),
    closeCollaborationSettingsButton: requireElement<HTMLButtonElement>("#close-collaboration-settings"),
    collaborationUrlInput: requireElement<HTMLInputElement>("#collaboration-url"),
    collaborationShareLinkInput: requireElement<HTMLInputElement>("#collaboration-share-link"),
    disconnectCollaborationButton: requireElement<HTMLButtonElement>("#disconnect-collaboration"),
    collaborationStatus: requireElement<HTMLElement>("#collaboration-status"),
    collaborationPeerId: requireElement<HTMLElement>("#collaboration-peer-id"),
    mcpSettingsDialog: requireElement<HTMLDialogElement>("#mcp-settings-dialog"),
    mcpSettingsForm: requireElement<HTMLFormElement>("#mcp-settings-form"),
    closeMcpSettingsButton: requireElement<HTMLButtonElement>("#close-mcp-settings"),
    mcpBridgeUrlInput: requireElement<HTMLInputElement>("#mcp-bridge-url"),
    mcpBridgeTokenInput: requireElement<HTMLInputElement>("#mcp-bridge-token"),
    disconnectMcpBridgeButton: requireElement<HTMLButtonElement>("#disconnect-mcp-bridge"),
    mcpBridgeStatus: requireElement<HTMLElement>("#mcp-bridge-status"),
    showFallback(message: string) {
      fallback.textContent = message;
      fallback.hidden = false;
    },
  };
}
