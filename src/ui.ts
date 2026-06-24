import {
  Activity,
  BringToFront,
  Circle,
  createIcons,
  LayoutGrid,
  SendToBack,
  Settings,
  Square,
  Trash2,
  Triangle,
  Type as TypeIcon,
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
      Circle,
      LayoutGrid,
      SendToBack,
      Settings,
      Square,
      Trash2,
      Triangle,
      Type: TypeIcon,
    },
  });

  const fallback = requireElement<HTMLDivElement>("#fallback");

  return {
    canvas: requireElement<HTMLCanvasElement>("#blitz-canvas"),
    fallback,
    addRectButton: requireElement<HTMLButtonElement>("#add-rect"),
    addCircleButton: requireElement<HTMLButtonElement>("#add-circle"),
    addTriangleButton: requireElement<HTMLButtonElement>("#add-triangle"),
    addTextButton: requireElement<HTMLButtonElement>("#add-text"),
    stressTestButton: requireElement<HTMLButtonElement>("#stress-test"),
    sendToBackButton: requireElement<HTMLButtonElement>("#send-to-back"),
    bringToFrontButton: requireElement<HTMLButtonElement>("#bring-to-front"),
    deleteButton: requireElement<HTMLButtonElement>("#delete-selected"),
    zoomIndicator: requireElement<HTMLDivElement>("#zoom-indicator"),
    toggleStatsButton: requireElement<HTMLButtonElement>("#toggle-stats"),
    statsPanel: requireElement<HTMLDivElement>("#stats-panel"),
    statsBody: requireElement<HTMLPreElement>("#stats-body"),
    openMcpSettingsButton: requireElement<HTMLButtonElement>("#open-mcp-settings"),
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
