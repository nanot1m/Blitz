import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";

const host = process.env.BLITZ_COLLAB_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.BLITZ_COLLAB_PORT ?? "8790", 10);
const maxMessageBytes = Number.parseInt(
  process.env.BLITZ_COLLAB_MAX_MESSAGE_BYTES ?? String(20 * 1024 * 1024),
  10,
);
const staticDirectory = process.env.BLITZ_STATIC_DIR
  ? resolve(process.env.BLITZ_STATIC_DIR)
  : undefined;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("BLITZ_COLLAB_PORT must be a valid TCP port.");
}

const rooms = new Map<string, Set<WebSocket>>();

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".wasm", "application/wasm"],
]);

function roomFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  const parsed = new URL(url, "ws://localhost");
  const room = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  return /^[a-zA-Z0-9._-]{1,80}$/.test(room) ? room : undefined;
}

function leaveRoom(webSocket: WebSocket, room: string): void {
  const peers = rooms.get(room);
  if (!peers) {
    return;
  }
  peers.delete(webSocket);
  if (peers.size === 0) {
    rooms.delete(room);
  }
}

function staticPathFor(url: string | undefined): string | undefined {
  if (!staticDirectory || !url) {
    return undefined;
  }
  const parsed = new URL(url, "http://localhost");
  const pathname = decodeURIComponent(parsed.pathname);
  const candidate = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = resolve(join(staticDirectory, candidate));
  if (absolute !== staticDirectory && !absolute.startsWith(`${staticDirectory}${sep}`)) {
    return undefined;
  }
  return absolute;
}

const httpServer = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/__blitz/collaboration/status") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(
      JSON.stringify({
        server: "running",
        rooms: Array.from(rooms, ([room, peers]) => ({ room, peers: peers.size })),
      }),
    );
    return;
  }
  if (request.method === "GET" || request.method === "HEAD") {
    const filePath = staticPathFor(request.url);
    const root = staticDirectory;
    if (filePath && root) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          response.writeHead(200, {
            "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
            "Content-Length": fileStat.size,
            "X-Content-Type-Options": "nosniff",
          });
          if (request.method === "HEAD") {
            response.end();
          } else {
            createReadStream(filePath).pipe(response);
          }
          return;
        }
      } catch {
        const indexPath = join(root, "index.html");
        try {
          const indexStat = await stat(indexPath);
          response.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Length": indexStat.size,
            "X-Content-Type-Options": "nosniff",
          });
          if (request.method === "HEAD") {
            response.end();
          } else {
            createReadStream(indexPath).pipe(response);
          }
          return;
        } catch {
          // Fall through to 404 below.
        }
      }
    }
  }
  response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end("Blitz collaboration relay\n");
});

const webSocketServer = new WebSocketServer({
  server: httpServer,
  maxPayload: maxMessageBytes,
});

webSocketServer.on("connection", (webSocket, request) => {
  const room = roomFromUrl(request.url);
  if (!room) {
    webSocket.close(1008, "Invalid collaboration room.");
    return;
  }

  let peers = rooms.get(room);
  if (!peers) {
    peers = new Set();
    rooms.set(room, peers);
  }
  peers.add(webSocket);
  console.error(`Collaboration peer joined ${room}; peers=${peers.size}`);

  webSocket.on("message", (data) => {
    const activePeers = rooms.get(room);
    if (!activePeers) {
      return;
    }
    for (const peer of activePeers) {
      if (peer !== webSocket && peer.readyState === WebSocket.OPEN) {
        peer.send(data);
      }
    }
  });

  webSocket.on("close", () => {
    leaveRoom(webSocket, room);
    console.error(`Collaboration peer left ${room}; peers=${rooms.get(room)?.size ?? 0}`);
  });
});

await new Promise<void>((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(port, host, () => {
    httpServer.off("error", reject);
    resolve();
  });
});

console.error(`Blitz collaboration relay listening on ws://${host}:${port}`);
console.error("No relay authentication is required; browser peers verify signed commands.");
if (staticDirectory) {
  console.error(`Serving Blitz static files from ${staticDirectory}`);
}
