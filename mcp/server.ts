import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

type BridgeRequest = {
  id: string;
  method:
    | "canvas.add_shapes"
    | "canvas.update_objects"
    | "canvas.delete_selected"
    | "canvas.get_state"
    | "canvas.get_scene"
    | "canvas.find_empty_space"
    | "canvas.get_text_capabilities"
    | "canvas.measure_text";
  params?: unknown;
};

type BridgeResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

const host = "127.0.0.1";
const port = Number.parseInt(process.env.BLITZ_BRIDGE_PORT ?? "8787", 10);
const certificateFile = process.env.BLITZ_BRIDGE_CERT_FILE ?? ".cert/localhost.pem";
const keyFile = process.env.BLITZ_BRIDGE_KEY_FILE ?? ".cert/localhost-key.pem";
const tokenFile = process.env.BLITZ_BRIDGE_TOKEN_FILE ?? ".cert/bridge-token";
const allowedOrigins = new Set(
  (
    process.env.BLITZ_BRIDGE_ORIGINS ??
    "http://127.0.0.1:5173,http://localhost:5173,https://nanot1m.github.io"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const token =
  process.env.BLITZ_BRIDGE_TOKEN?.trim() || (await readFile(tokenFile, "utf8")).trim();
if (!token || token.length < 24) {
  throw new Error(
    `The bridge token must contain at least 24 characters. Set BLITZ_BRIDGE_TOKEN or write it to ${tokenFile}.`,
  );
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("BLITZ_BRIDGE_PORT must be a valid TCP port.");
}

function encodeTokenProtocol(value: string): string {
  return `blitz-token.${Buffer.from(value).toString("base64url")}`;
}

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

const expectedTokenProtocol = encodeTokenProtocol(token);
const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }
>();
let activeCanvas: WebSocket | undefined;
let requestSequence = 0;
let mcpClientConnected = false;

function rejectPending(reason: string): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timeout);
    entry.reject(new Error(reason));
  }
  pending.clear();
}

async function callCanvas(
  method: BridgeRequest["method"],
  params?: unknown,
): Promise<unknown> {
  if (!activeCanvas || activeCanvas.readyState !== WebSocket.OPEN) {
    throw new Error("No Blitz canvas is connected. Open Blitz and configure its MCP bridge settings.");
  }

  requestSequence += 1;
  const id = `${Date.now()}-${requestSequence}`;
  const request: BridgeRequest = { id, method, params };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Canvas request ${id} timed out.`));
    }, 10_000);

    pending.set(id, { resolve, reject, timeout });
    activeCanvas?.send(JSON.stringify(request), (error) => {
      if (!error) {
        return;
      }
      clearTimeout(timeout);
      pending.delete(id);
      reject(error);
    });
  });
}

const [certificate, key] = await Promise.all([readFile(certificateFile), readFile(keyFile)]);
const httpsServer = createServer({ cert: certificate, key }, (request, response) => {
  if (request.method === "GET" && request.url === "/__blitz/status") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(
      JSON.stringify({
        server: "running",
        mcpClientConnected,
        canvasConnected: activeCanvas?.readyState === WebSocket.OPEN,
      }),
    );
    return;
  }
  response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end("Blitz MCP bridge\n");
});
const webSocketServer = new WebSocketServer({
  noServer: true,
  handleProtocols(protocols) {
    return protocols.has("blitz-canvas") ? "blitz-canvas" : false;
  },
});

httpsServer.on("upgrade", (request, socket, head) => {
  const origin = request.headers.origin;
  const offeredProtocols = (request.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((value) => value.trim());
  const offeredTokenProtocol = offeredProtocols.find((value) => value.startsWith("blitz-token."));
  const authorized =
    typeof origin === "string" &&
    allowedOrigins.has(origin) &&
    offeredProtocols.includes("blitz-canvas") &&
    typeof offeredTokenProtocol === "string" &&
    secureEqual(offeredTokenProtocol, expectedTokenProtocol);

  if (!authorized) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request);
  });
});

webSocketServer.on("connection", (webSocket) => {
  if (activeCanvas && activeCanvas.readyState === WebSocket.OPEN) {
    activeCanvas.close(1012, "A newer Blitz canvas connected.");
  }
  activeCanvas = webSocket;
  console.error("Blitz canvas connected to the secure local bridge.");

  webSocket.on("message", (data) => {
    let response: BridgeResponse;
    try {
      response = JSON.parse(data.toString()) as BridgeResponse;
    } catch {
      webSocket.close(1003, "Expected JSON messages.");
      return;
    }
    if (!response || typeof response.id !== "string" || typeof response.ok !== "boolean") {
      webSocket.close(1008, "Invalid bridge response.");
      return;
    }

    const entry = pending.get(response.id);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timeout);
    pending.delete(response.id);
    if (response.ok) {
      entry.resolve(response.result);
    } else {
      entry.reject(new Error(response.error ?? "Canvas command failed."));
    }
  });

  webSocket.on("close", () => {
    if (activeCanvas === webSocket) {
      activeCanvas = undefined;
      rejectPending("The Blitz canvas disconnected.");
      console.error("Blitz canvas disconnected from the secure local bridge.");
    }
  });
});

await new Promise<void>((resolve, reject) => {
  httpsServer.once("error", reject);
  httpsServer.listen(port, host, () => {
    httpsServer.off("error", reject);
    resolve();
  });
});
console.error(`Blitz secure bridge listening on wss://${host}:${port}`);
console.error(`Allowed browser origins: ${Array.from(allowedOrigins).join(", ")}`);

const server = new McpServer(
  { name: "blitz-canvas", version: "0.1.0" },
  {
    instructions:
      "Inspect with canvas_get_scene before drawing into or revising an existing composition. Use canvas_update_objects with stable IDs to correct existing content instead of layering replacements. For text inside cards, columns, or other shapes, provide a text box and use the placement returned by canvas_measure_text; do not manually estimate origins from font metrics. Use verticalAlign=cap-middle plus align=center for digits or initials inside circular badges. Call canvas_get_text_capabilities when choosing characters, and do not use text when measurement reports supported=false, overflow=true, or fitsBox=false. Use canvas_find_empty_space when placement should avoid overlap. Coordinates are world-space pixels. Rect and triangle x/y are top-left; circle x/y is its center; unconstrained text x/y is the content top-left.",
  },
);
server.server.oninitialized = () => {
  mcpClientConnected = true;
  console.error("MCP client initialized.");
};

const coordinate = z.number().finite().min(-10_000_000).max(10_000_000);
const dimension = z.number().finite().positive().max(1_000_000);
const sceneDimension = z.number().finite().positive().max(20_000_000);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/, "Use #RRGGBB or #RRGGBBAA.");
const strokeWidth = z.number().finite().min(0).max(100).default(0);
const textLayoutBox = z.object({
  x: coordinate,
  y: coordinate,
  width: dimension,
  height: dimension,
  padding: z.number().finite().min(0).max(100_000).default(0),
  verticalAlign: z
    .enum(["top", "middle", "bottom", "cap-middle"])
    .default("top")
    .describe("Use cap-middle for optically centering digits or initials inside badges."),
});

const rectShape = z.object({
  type: z.literal("rect"),
  x: coordinate.describe("World-space left edge."),
  y: coordinate.describe("World-space top edge."),
  width: dimension,
  height: dimension,
  backgroundColor: color.default("#DCE8FF"),
  strokeColor: color.default("#336DDA"),
  strokeWidth,
});

const circleShape = z.object({
  type: z.literal("circle"),
  x: coordinate.describe("World-space center X coordinate."),
  y: coordinate.describe("World-space center Y coordinate."),
  radius: dimension,
  backgroundColor: color.default("#DBF7ED"),
  strokeColor: color.default("#149475"),
  strokeWidth,
});

const triangleShape = z.object({
  type: z.literal("triangle"),
  x: coordinate.describe("World-space left edge of the triangle bounds."),
  y: coordinate.describe("World-space top edge of the triangle bounds."),
  width: dimension,
  height: dimension,
  backgroundColor: color.default("#FFEBD9"),
  strokeColor: color.default("#E84F45"),
  strokeWidth,
});

const textShape = z.object({
  type: z.literal("text"),
  x: coordinate.default(0).describe("Content left edge. Ignored when box is supplied."),
  y: coordinate.default(0).describe("Content top edge. Ignored when box is supplied."),
  text: z.string().min(1).max(1000),
  fontSize: z.number().finite().min(4).max(512).default(30),
  color: color.default("#141A21"),
  maxWidth: dimension.optional().describe("Wrap text to this width in world-space pixels."),
  lineHeight: z.number().finite().min(0.5).max(4).default(1.36181641),
  maxLines: z.number().int().min(0).max(256).default(0).describe("0 means unlimited."),
  align: z.enum(["left", "center", "right"]).default("left"),
  box: textLayoutBox
    .optional()
    .describe(
      "Containing rectangle for deterministic wrapping and vertical placement. Blitz derives the text origin and usable width.",
    ),
});

const canvasShape = z.discriminatedUnion("type", [
  rectShape,
  circleShape,
  triangleShape,
  textShape,
]);

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{16}:[0-9a-fA-F]{16}$/, "Use a Blitz 128-bit object ID.");
const commonUpdate = {
  id: objectId,
  x: coordinate.optional(),
  y: coordinate.optional(),
};
const geometricUpdateStyle = {
  backgroundColor: color.optional(),
  strokeColor: color.optional(),
  strokeWidth: z.number().finite().min(0).max(100).optional(),
};
const canvasObjectUpdate = z.discriminatedUnion("type", [
  z.object({
    ...commonUpdate,
    ...geometricUpdateStyle,
    type: z.literal("rect"),
    width: dimension.optional(),
    height: dimension.optional(),
  }),
  z.object({
    ...commonUpdate,
    ...geometricUpdateStyle,
    type: z.literal("triangle"),
    width: dimension.optional(),
    height: dimension.optional(),
  }),
  z.object({
    ...commonUpdate,
    ...geometricUpdateStyle,
    type: z.literal("circle"),
    radius: dimension.optional(),
  }),
  z.object({
    ...commonUpdate,
    type: z.literal("text"),
    text: z.string().min(1).max(1000).optional(),
    fontSize: z.number().finite().min(4).max(512).optional(),
    color: color.optional(),
    maxWidth: dimension.nullable().optional(),
    lineHeight: z.number().finite().min(0.5).max(4).optional(),
    maxLines: z.number().int().min(0).max(256).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
  }),
]);

server.registerTool(
  "canvas_add_shapes",
  {
    title: "Add shapes to Blitz",
    description:
      "Add styled rectangles, circles, triangles, and multiline text. Prefer text boxes for deterministic wrapping and vertical alignment inside cards or shapes.",
    inputSchema: z.object({
      shapes: z.array(canvasShape).min(1).max(100),
    }),
  },
  async ({ shapes }) => {
    try {
      const result = await callCanvas("canvas.add_shapes", { shapes });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "canvas_update_objects",
  {
    title: "Update Blitz objects",
    description:
      "Partially update existing objects by stable ID. Omitted fields are preserved. Text is revalidated and relaid out; use maxWidth null to remove wrapping.",
    inputSchema: z.object({
      updates: z.array(canvasObjectUpdate).min(1).max(100),
    }),
  },
  async ({ updates }) => {
    try {
      const result = await callCanvas("canvas.update_objects", { updates });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "canvas_get_state",
  {
    title: "Get Blitz canvas state",
    description:
      "Return entity counts plus camera center, zoom, and viewport dimensions for choosing visible world-space coordinates.",
  },
  async () => {
    try {
      const result = await callCanvas("canvas.get_state");
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "canvas_get_scene",
  {
    title: "Inspect Blitz canvas objects",
    description:
      "Return objects intersecting the viewport or an explicit world-space rectangle, including bounds, type, order, selection, text, and styles.",
    inputSchema: z.object({
      bounds: z
        .object({
          x: coordinate,
          y: coordinate,
          width: sceneDimension,
          height: sceneDimension,
        })
        .optional()
        .describe("Defaults to the currently visible viewport."),
      limit: z.number().int().min(1).max(5000).default(1000),
    }),
  },
  async (query) => {
    try {
      const result = await callCanvas("canvas.get_scene", query);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "canvas_get_text_capabilities",
  {
    title: "Get Blitz text capabilities",
    description:
      "Return the exact Unicode code-point ranges supported by the compiled Blitz font and explain replacement behavior for unsupported glyphs.",
  },
  async () => {
    try {
      const result = await callCanvas("canvas.get_text_capabilities");
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "canvas_measure_text",
  {
    title: "Measure Blitz text",
    description:
      "Validate, wrap, and measure text using the exact compiled Blitz font. Returns content/object bounds, cap height, x-height, ascender, descender, line advance, and exact first/last baseline offsets for alignment.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            text: z.string().max(1000),
            fontSize: z.number().finite().min(4).max(512),
            maxWidth: dimension.optional(),
            lineHeight: z.number().finite().min(0.5).max(4).default(1.36181641),
            maxLines: z.number().int().min(0).max(256).default(0),
            align: z.enum(["left", "center", "right"]).default("left"),
            box: textLayoutBox.optional(),
          }),
        )
        .min(1)
        .max(100),
    }),
  },
  async ({ items }) => {
    try {
      const result = await callCanvas("canvas.measure_text", { items });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "canvas_find_empty_space",
  {
    title: "Find empty Blitz canvas space",
    description:
      "Find a non-overlapping rectangle in the current viewport for placing new content.",
    inputSchema: z.object({
      width: dimension,
      height: dimension,
      padding: z.number().finite().min(0).max(10_000).default(24),
      scope: z.literal("viewport").default("viewport"),
      ignoreLargeBackgrounds: z
        .boolean()
        .default(true)
        .describe("Ignore objects covering at least 80% of the viewport, such as slide backgrounds."),
    }),
  },
  async (query) => {
    try {
      const result = await callCanvas("canvas.find_empty_space", query);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "canvas_delete_selected",
  {
    title: "Delete selected Blitz shapes",
    description: "Delete the currently selected shapes from the connected Blitz canvas.",
    annotations: { destructiveHint: true },
  },
  async () => {
    try {
      const result = await callCanvas("canvas.delete_selected");
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

async function shutdown(): Promise<void> {
  rejectPending("The Blitz MCP server is shutting down.");
  activeCanvas?.close(1001, "Server shutting down.");
  webSocketServer.close();
  await new Promise<void>((resolve) => httpsServer.close(() => resolve()));
  await server.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
