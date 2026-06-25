type StyledShape = {
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
};

export type CanvasShape =
  | (StyledShape & {
      type: "rect" | "triangle";
      x: number;
      y: number;
      width: number;
      height: number;
    })
  | (StyledShape & {
      type: "circle";
      x: number;
      y: number;
      radius: number;
    })
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      fontSize: number;
      color: string;
    };

type CanvasState = {
  entities: number;
  selected: number;
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  viewport: {
    width: number;
    height: number;
  };
};

export type SceneQuery = {
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  limit: number;
};

export type EmptySpaceQuery = {
  width: number;
  height: number;
  padding: number;
  scope: "viewport";
  ignoreLargeBackgrounds: boolean;
};

type BridgeRequest = {
  id: string;
  method:
    | "canvas.add_shapes"
    | "canvas.delete_selected"
    | "canvas.get_state"
    | "canvas.get_scene"
    | "canvas.find_empty_space";
  params?: unknown;
};

type BridgeResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type BridgeHandlers = {
  addShapes(shapes: CanvasShape[]): CanvasState & { added: number; ids: string[] };
  deleteSelected(): CanvasState & { deleted: number };
  getState(): CanvasState;
  getScene(query: SceneQuery): unknown;
  findEmptySpace(query: EmptySpaceQuery): unknown;
};

type BridgeElements = {
  dialog: HTMLDialogElement;
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  form: HTMLFormElement;
  urlInput: HTMLInputElement;
  tokenInput: HTMLInputElement;
  disconnectButton: HTMLButtonElement;
  status: HTMLElement;
};

const URL_STORAGE_KEY = "blitz.mcpBridgeUrl";
const TOKEN_STORAGE_KEY = "blitz.mcpBridgeToken";
const DEFAULT_URL = "wss://127.0.0.1:8787";

function encodeTokenProtocol(token: string): string {
  const bytes = new TextEncoder().encode(token);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `blitz-token.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

function validateLocalBridgeUrl(value: string): string {
  const url = new URL(value);
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (url.protocol !== "wss:" || !loopbackHosts.has(url.hostname)) {
    throw new Error("Use a secure loopback URL such as wss://127.0.0.1:8787.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The bridge URL must not contain credentials, query parameters, or a fragment.");
  }
  return url.toString();
}

function readBootstrapSettings(): { url?: string; token?: string } {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const url = fragment.get("bridgeUrl") ?? undefined;
  const token = fragment.get("bridgeToken") ?? undefined;
  if (url || token) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  return { url, token };
}

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function requireColor(value: unknown, label: string): string {
  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) {
    throw new Error(`${label} must use #RRGGBB or #RRGGBBAA.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, label: string, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be greater than 0 and at most ${maximum}.`);
  }
  return value;
}

function parseShape(value: unknown, index: number): CanvasShape {
  const shape = requireObject(value, `shapes[${index}]`);
  const prefix = `shapes[${index}]`;
  const x = requireNumber(shape.x, `${prefix}.x`, -10_000_000, 10_000_000);
  const y = requireNumber(shape.y, `${prefix}.y`, -10_000_000, 10_000_000);

  if (shape.type === "text") {
    if (typeof shape.text !== "string" || shape.text.length < 1 || shape.text.length > 1000) {
      throw new Error(`${prefix}.text must contain 1 to 1000 characters.`);
    }
    return {
      type: "text",
      x,
      y,
      text: shape.text,
      fontSize: requireNumber(shape.fontSize, `${prefix}.fontSize`, 4, 512),
      color: requireColor(shape.color, `${prefix}.color`),
    };
  }

  if (shape.type !== "rect" && shape.type !== "circle" && shape.type !== "triangle") {
    throw new Error(`${prefix}.type is unsupported.`);
  }
  const style = {
    backgroundColor: requireColor(shape.backgroundColor, `${prefix}.backgroundColor`),
    strokeColor: requireColor(shape.strokeColor, `${prefix}.strokeColor`),
    strokeWidth: requireNumber(shape.strokeWidth, `${prefix}.strokeWidth`, 0, 100),
  };
  if (shape.type === "circle") {
    return {
      type: "circle",
      x,
      y,
      radius: requirePositiveNumber(shape.radius, `${prefix}.radius`, 1_000_000),
      ...style,
    };
  }
  return {
    type: shape.type,
    x,
    y,
    width: requirePositiveNumber(shape.width, `${prefix}.width`, 1_000_000),
    height: requirePositiveNumber(shape.height, `${prefix}.height`, 1_000_000),
    ...style,
  };
}

function parseShapeParams(params: unknown): CanvasShape[] {
  if (!params || typeof params !== "object" || !("shapes" in params)) {
    throw new Error("Missing shapes.");
  }
  const shapes = (params as { shapes?: unknown }).shapes;
  if (!Array.isArray(shapes) || shapes.length < 1 || shapes.length > 100) {
    throw new Error("Shapes must be an array containing 1 to 100 entries.");
  }
  return shapes.map(parseShape);
}

function parseSceneQuery(params: unknown): SceneQuery {
  const value = requireObject(params ?? {}, "params");
  let bounds: SceneQuery["bounds"];
  if (value.bounds !== undefined) {
    const candidate = requireObject(value.bounds, "bounds");
    bounds = {
      x: requireNumber(candidate.x, "bounds.x", -10_000_000, 10_000_000),
      y: requireNumber(candidate.y, "bounds.y", -10_000_000, 10_000_000),
      width: requirePositiveNumber(candidate.width, "bounds.width", 20_000_000),
      height: requirePositiveNumber(candidate.height, "bounds.height", 20_000_000),
    };
  }
  return {
    bounds,
    limit:
      value.limit === undefined ? 1000 : requireNumber(value.limit, "limit", 1, 5000),
  };
}

function parseEmptySpaceQuery(params: unknown): EmptySpaceQuery {
  const value = requireObject(params, "params");
  if (value.scope !== undefined && value.scope !== "viewport") {
    throw new Error("scope currently supports only viewport.");
  }
  if (
    value.ignoreLargeBackgrounds !== undefined &&
    typeof value.ignoreLargeBackgrounds !== "boolean"
  ) {
    throw new Error("ignoreLargeBackgrounds must be a boolean.");
  }
  return {
    width: requirePositiveNumber(value.width, "width", 1_000_000),
    height: requirePositiveNumber(value.height, "height", 1_000_000),
    padding:
      value.padding === undefined
        ? 24
        : requireNumber(value.padding, "padding", 0, 10_000),
    scope: "viewport",
    ignoreLargeBackgrounds:
      value.ignoreLargeBackgrounds === undefined
        ? true
        : value.ignoreLargeBackgrounds,
  };
}

export function setupMcpBridge(elements: BridgeElements, handlers: BridgeHandlers): void {
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;
  let reconnectDelay = 1_000;
  let shouldReconnect = false;

  const bootstrap = readBootstrapSettings();
  const initialUrl = bootstrap.url ?? localStorage.getItem(URL_STORAGE_KEY) ?? DEFAULT_URL;
  const initialToken = bootstrap.token ?? sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  elements.urlInput.value = initialUrl;
  elements.tokenInput.value = initialToken;

  const setStatus = (state: "disconnected" | "connecting" | "connected", message: string) => {
    elements.status.dataset.state = state;
    elements.status.textContent = message;
    elements.openButton.dataset.state = state;
    elements.openButton.title = `MCP bridge: ${message}`;
  };

  const stopReconnectTimer = () => {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const disconnect = () => {
    shouldReconnect = false;
    stopReconnectTimer();
    socket?.close(1000, "Disconnected in Blitz settings.");
    socket = undefined;
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    elements.tokenInput.value = "";
    setStatus("disconnected", "Disconnected");
  };

  const respond = (response: BridgeResponse) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(response));
    }
  };

  const handleRequest = (event: MessageEvent<string>) => {
    let requestId = "invalid";
    try {
      const request = JSON.parse(event.data) as BridgeRequest;
      if (!request || typeof request.id !== "string" || typeof request.method !== "string") {
        throw new Error("Invalid bridge request.");
      }
      requestId = request.id;

      let result: unknown;
      switch (request.method) {
        case "canvas.add_shapes":
          result = handlers.addShapes(parseShapeParams(request.params));
          break;
        case "canvas.delete_selected":
          result = handlers.deleteSelected();
          break;
        case "canvas.get_state":
          result = handlers.getState();
          break;
        case "canvas.get_scene":
          result = handlers.getScene(parseSceneQuery(request.params));
          break;
        case "canvas.find_empty_space":
          result = handlers.findEmptySpace(parseEmptySpaceQuery(request.params));
          break;
        default:
          throw new Error("Unsupported bridge method.");
      }
      respond({ id: request.id, ok: true, result });
    } catch (error) {
      respond({
        id: requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const connect = (urlValue: string, token: string) => {
    stopReconnectTimer();
    socket?.close(1000, "Replacing bridge connection.");

    let url: string;
    try {
      url = validateLocalBridgeUrl(urlValue);
      if (token.length < 24) {
        throw new Error("The bridge token must contain at least 24 characters.");
      }
    } catch (error) {
      setStatus("disconnected", error instanceof Error ? error.message : String(error));
      return;
    }

    localStorage.setItem(URL_STORAGE_KEY, url);
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    elements.urlInput.value = url;
    shouldReconnect = true;
    setStatus("connecting", "Connecting…");

    const nextSocket = new WebSocket(url, ["blitz-canvas", encodeTokenProtocol(token)]);
    socket = nextSocket;

    nextSocket.addEventListener("open", () => {
      if (socket !== nextSocket) {
        return;
      }
      reconnectDelay = 1_000;
      setStatus("connected", "Connected");
    });
    nextSocket.addEventListener("message", handleRequest);
    nextSocket.addEventListener("close", () => {
      if (socket !== nextSocket) {
        return;
      }
      socket = undefined;
      setStatus("disconnected", shouldReconnect ? "Reconnecting…" : "Disconnected");
      if (shouldReconnect) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = undefined;
          connect(url, token);
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
      }
    });
    nextSocket.addEventListener("error", () => {
      if (socket === nextSocket) {
        setStatus("disconnected", "Connection failed");
      }
    });
  };

  elements.openButton.addEventListener("click", () => elements.dialog.showModal());
  elements.closeButton.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) {
      elements.dialog.close();
    }
  });
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    connect(elements.urlInput.value, elements.tokenInput.value);
    elements.dialog.close();
  });
  elements.disconnectButton.addEventListener("click", disconnect);

  setStatus("disconnected", "Disconnected");
  if (initialToken) {
    connect(initialUrl, initialToken);
  }
}
