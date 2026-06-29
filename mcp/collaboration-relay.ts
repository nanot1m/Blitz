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
const maxConnections = Number.parseInt(process.env.BLITZ_COLLAB_MAX_CONNECTIONS ?? "200", 10);
const maxConnectionsPerIp = Number.parseInt(
  process.env.BLITZ_COLLAB_MAX_CONNECTIONS_PER_IP ?? "20",
  10,
);
const maxRooms = Number.parseInt(process.env.BLITZ_COLLAB_MAX_ROOMS ?? "100", 10);
const maxPeersPerRoom = Number.parseInt(process.env.BLITZ_COLLAB_MAX_PEERS_PER_ROOM ?? "20", 10);
const maxMessagesPerMinute = Number.parseInt(
  process.env.BLITZ_COLLAB_MAX_MESSAGES_PER_MINUTE ?? "120",
  10,
);
const maxRoomMessagesPerMinute = Number.parseInt(
  process.env.BLITZ_COLLAB_MAX_ROOM_MESSAGES_PER_MINUTE ?? "600",
  10,
);
const staticDirectory = process.env.BLITZ_STATIC_DIR
  ? resolve(process.env.BLITZ_STATIC_DIR)
  : undefined;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("BLITZ_COLLAB_PORT must be a valid TCP port.");
}

const rooms = new Map<string, Set<WebSocket>>();
const ipConnections = new Map<string, number>();
const roomBuckets = new Map<string, RateBucket>();
let activeConnections = 0;

type RateBucket = {
  count: number;
  resetAt: number;
};

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
  return /^room-[0-9a-f]{32}$/i.test(room) ? room.toLowerCase() : undefined;
}

function peerIp(request: Parameters<WebSocketServer["emit"]>[2]): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? request.socket.remoteAddress ?? "unknown";
  }
  return request.socket.remoteAddress ?? "unknown";
}

function increment(map: Map<string, number>, key: string): number {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}

function decrement(map: Map<string, number>, key: string): void {
  const next = (map.get(key) ?? 0) - 1;
  if (next > 0) {
    map.set(key, next);
  } else {
    map.delete(key);
  }
}

function allowBucket(bucket: RateBucket | undefined, limit: number, now: number): RateBucket | undefined {
  if (limit < 1) {
    return undefined;
  }
  if (!bucket || now >= bucket.resetAt) {
    return { count: 1, resetAt: now + 60_000 };
  }
  if (bucket.count >= limit) {
    return undefined;
  }
  bucket.count += 1;
  return bucket;
}

function isBase64Url(value: unknown, minimumLength: number, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function envelopeText(data: WebSocket.RawData, room: string): string | undefined {
  if (Array.isArray(data)) {
    return undefined;
  }
  const raw =
    typeof data === "string"
      ? data
      : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : Buffer.from(data).toString("utf8");
  if (raw.length > maxMessageBytes) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const envelope = value as Record<string, unknown>;
  return (
    envelope.type === "blitz.collab.encrypted" &&
    envelope.version === 1 &&
    envelope.room === room &&
    isBase64Url(envelope.nonce, 16, 16) &&
    isBase64Url(envelope.ciphertext, 24, Math.ceil((maxMessageBytes * 4) / 3))
  )
    ? raw
    : undefined;
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
  const ip = peerIp(request);
  if (activeConnections >= maxConnections) {
    webSocket.close(1013, "Server connection limit reached.");
    return;
  }
  if (increment(ipConnections, ip) > maxConnectionsPerIp) {
    decrement(ipConnections, ip);
    webSocket.close(1013, "IP connection limit reached.");
    return;
  }
  activeConnections += 1;

  let peers = rooms.get(room);
  if (!peers) {
    if (rooms.size >= maxRooms) {
      activeConnections -= 1;
      decrement(ipConnections, ip);
      webSocket.close(1013, "Room limit reached.");
      return;
    }
    peers = new Set();
    rooms.set(room, peers);
  } else if (peers.size >= maxPeersPerRoom) {
    activeConnections -= 1;
    decrement(ipConnections, ip);
    webSocket.close(1013, "Room peer limit reached.");
    return;
  }
  peers.add(webSocket);
  console.error(`Collaboration peer joined ${room}; peers=${peers.size}`);

  webSocket.on("message", (data) => {
    const now = Date.now();
    const peerBucket = allowBucket(
      (webSocket as WebSocket & { blitzBucket?: RateBucket }).blitzBucket,
      maxMessagesPerMinute,
      now,
    );
    if (!peerBucket) {
      webSocket.close(1008, "Message rate limit exceeded.");
      return;
    }
    (webSocket as WebSocket & { blitzBucket?: RateBucket }).blitzBucket = peerBucket;
    const roomBucket = allowBucket(roomBuckets.get(room), maxRoomMessagesPerMinute, now);
    if (!roomBucket) {
      webSocket.close(1013, "Room message rate limit exceeded.");
      return;
    }
    roomBuckets.set(room, roomBucket);
    const raw = envelopeText(data, room);
    if (!raw) {
      webSocket.close(1008, "Invalid encrypted envelope.");
      return;
    }
    const activePeers = rooms.get(room);
    if (!activePeers) {
      return;
    }
    for (const peer of activePeers) {
      if (peer !== webSocket && peer.readyState === WebSocket.OPEN) {
        peer.send(raw);
      }
    }
  });

  webSocket.on("close", () => {
    leaveRoom(webSocket, room);
    activeConnections -= 1;
    decrement(ipConnections, ip);
    if (!rooms.has(room)) {
      roomBuckets.delete(room);
    }
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
