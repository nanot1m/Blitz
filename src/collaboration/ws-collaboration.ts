import {
  getOrCreateCollaborationIdentity,
  type CollaborationIdentity,
} from "./identity";
import type { ActorId } from "../storage/actor-id";

type CollaborationElements = {
  dialog: HTMLDialogElement;
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  form: HTMLFormElement;
  urlInput: HTMLInputElement;
  shareLinkInput: HTMLInputElement;
  disconnectButton: HTMLButtonElement;
  status: HTMLElement;
  peerId: HTMLElement;
  debugLog: HTMLPreElement;
};

type CollaborationHandlers = {
  actorId: ActorId;
  captureScene(): Uint8Array;
  applyScene(bytes: Uint8Array): void;
  localRevision(): number;
  onRemoteApplied(): void;
  onError(message: string): void;
};

type CommandBody =
  | {
      kind: "hello";
      revision: number;
    }
  | {
      kind: "scene-snapshot";
      revision: number;
      scene: string;
    };

type CommandPayload = {
  type: "blitz.crdt.command";
  version: 1;
  room: string;
  commandId: string;
  peerId: string;
  publicKey: JsonWebKey;
  createdAt: number;
  actor: ActorId;
  body: CommandBody;
};

type SignedCommand = CommandPayload & {
  signature: string;
};

type EncryptedEnvelope = {
  type: "blitz.collab.encrypted";
  version: 1;
  room: string;
  nonce: string;
  ciphertext: string;
};

export type CollaborationController = {
  publishLocalChange(): void;
};

const URL_STORAGE_KEY = "blitz.collaboration.url";
const DEFAULT_URL = "wss://62-238-2-245.sslip.io";
const MAX_SCENE_BYTES = 16 * 1024 * 1024;
const ROOM_PATTERN = /^room-[0-9a-f]{32}$/i;

function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  return base64ToBytes(`${value.replaceAll("-", "+").replaceAll("_", "/")}${padding}`);
}

function plainBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function commandPayload(command: SignedCommand): CommandPayload {
  const { signature: _signature, ...payload } = command;
  return payload;
}

function validateUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("Use a ws:// or wss:// collaboration URL.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The collaboration URL must not contain credentials, query parameters, or a fragment.");
  }
  return url.toString();
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomRoom(): string {
  return `room-${randomId()}`;
}

async function importRoomKey(encoded: string): Promise<CryptoKey> {
  const bytes = base64UrlToBytes(encoded);
  if (bytes.byteLength !== 32) {
    throw new Error("The collaboration link contains an invalid encryption key.");
  }
  return crypto.subtle.importKey("raw", plainBuffer(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function generateRoomKey(): Promise<{ key: CryptoKey; encoded: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return {
    key: await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]),
    encoded: base64Url(bytes),
  };
}

function readHashSettings(): { room?: string; key?: string } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return {
    room: params.get("collabRoom") ?? undefined,
    key: params.get("collabKey") ?? undefined,
  };
}

function writeShareHash(room: string, encodedKey: string): string {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.set("collabRoom", room);
  params.set("collabKey", encodedKey);
  const nextUrl = `${window.location.pathname}${window.location.search}#${params.toString()}`;
  history.replaceState(null, "", nextUrl);
  return window.location.href;
}

function actorHex(actor: ActorId): string {
  return `${actor.hi.toString(16).padStart(8, "0")}${actor.lo.toString(16).padStart(8, "0")}`;
}

function formatDebugValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function messageText(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Blob) {
    return data.text();
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  throw new Error("Unsupported collaboration message format.");
}

export function setupWsCollaboration(
  elements: CollaborationElements,
  handlers: CollaborationHandlers,
): CollaborationController {
  let socket: WebSocket | undefined;
  let identity: CollaborationIdentity | undefined;
  let roomKey: CryptoKey | undefined;
  let roomKeyRoom = "";
  let encodedRoomKey = "";
  let connectedRoom = "";
  let shouldReconnect = false;
  let reconnectTimer: number | undefined;
  let reconnectDelay = 1_000;
  let lastPublishedRevision = handlers.localRevision();
  let latestSnapshotAt = 0;
  let publishTimer: number | undefined;
  const seenCommands = new Set<string>();
  const debugLines: string[] = [];

  const log = (event: string, detail?: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const suffix = formatDebugValue(detail);
    debugLines.push(`[${timestamp}] ${event}${suffix ? ` ${suffix}` : ""}`);
    while (debugLines.length > 160) {
      debugLines.shift();
    }
    elements.debugLog.textContent = debugLines.join("\n");
    elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
  };

  const hashSettings = readHashSettings();
  const hashRoom =
    hashSettings.room && ROOM_PATTERN.test(hashSettings.room)
      ? hashSettings.room.toLowerCase()
      : undefined;
  const joiningFromLink = Boolean(hashRoom && hashSettings.key);
  elements.urlInput.value = localStorage.getItem(URL_STORAGE_KEY) ?? DEFAULT_URL;

  const setStatus = (state: "disconnected" | "connecting" | "connected", message: string) => {
    elements.status.dataset.state = state;
    elements.status.textContent = message;
    elements.openButton.dataset.state = state;
    elements.openButton.title = `Collaboration: ${message}`;
    log("status", { state, message });
  };

  const stopReconnectTimer = () => {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const signCommand = async (body: CommandBody): Promise<SignedCommand> => {
    if (!identity) {
      identity = await getOrCreateCollaborationIdentity();
      elements.peerId.textContent = identity.peerId;
      log("identity", { peerId: identity.peerId });
    }
    const payload: CommandPayload = {
      type: "blitz.crdt.command",
      version: 1,
      room: connectedRoom,
      commandId: `${actorHex(handlers.actorId)}-${Date.now()}-${randomId()}`,
      peerId: identity.peerId,
      publicKey: identity.publicKey,
      createdAt: Date.now(),
      actor: handlers.actorId,
      body,
    };
    return {
      ...payload,
      signature: await identity.sign(payload),
    };
  };

  const encryptCommand = async (command: SignedCommand): Promise<EncryptedEnvelope> => {
    if (!roomKey) {
      throw new Error("Collaboration encryption key is not initialized.");
    }
    const nonce = new Uint8Array(12);
    crypto.getRandomValues(nonce);
    const plaintext = new TextEncoder().encode(JSON.stringify(command));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      roomKey,
      plaintext,
    );
    return {
      type: "blitz.collab.encrypted",
      version: 1,
      room: connectedRoom,
      nonce: base64Url(nonce),
      ciphertext: base64Url(new Uint8Array(ciphertext)),
    };
  };

  const decryptCommand = async (envelope: EncryptedEnvelope): Promise<SignedCommand | undefined> => {
    if (!roomKey || envelope.room !== connectedRoom) {
      return undefined;
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: plainBuffer(base64UrlToBytes(envelope.nonce)) },
      roomKey,
      plainBuffer(base64UrlToBytes(envelope.ciphertext)),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as SignedCommand;
  };

  const sendCommand = async (body: CommandBody) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      log("send-skip", { reason: "socket-not-open", kind: body.kind });
      return;
    }
    const command = await signCommand(body);
    seenCommands.add(command.commandId);
    socket.send(JSON.stringify(await encryptCommand(command)));
    log("send", {
      kind: body.kind,
      revision: body.revision,
      commandId: command.commandId.slice(-12),
    });
  };

  const publishSnapshot = async () => {
    const revision = handlers.localRevision();
    const scene = handlers.captureScene();
    if (scene.byteLength > MAX_SCENE_BYTES) {
      handlers.onError("The scene is too large to publish to collaboration.");
      log("snapshot-skip", { reason: "too-large", bytes: scene.byteLength });
      return;
    }
    lastPublishedRevision = revision;
    latestSnapshotAt = Math.max(latestSnapshotAt, Date.now());
    await sendCommand({
      kind: "scene-snapshot",
      revision,
      scene: bytesToBase64(scene),
    });
    log("snapshot-published", { revision, bytes: scene.byteLength });
  };

  const handleCommand = async (event: MessageEvent) => {
    try {
      const raw = await messageText(event.data);
      log("receive-frame", { bytes: raw.length });
      const envelope = JSON.parse(raw) as EncryptedEnvelope;
      if (
        !envelope ||
        envelope.type !== "blitz.collab.encrypted" ||
        envelope.version !== 1 ||
        typeof envelope.nonce !== "string" ||
        typeof envelope.ciphertext !== "string"
      ) {
        log("receive-drop", { reason: "invalid-envelope" });
        return;
      }
      const command = await decryptCommand(envelope);
      if (
        !command ||
        command.type !== "blitz.crdt.command" ||
        command.version !== 1 ||
        command.room !== connectedRoom ||
        typeof command.commandId !== "string" ||
        typeof command.peerId !== "string" ||
        typeof command.signature !== "string" ||
        seenCommands.has(command.commandId)
      ) {
        log("receive-drop", {
          reason: command && seenCommands.has(command.commandId) ? "seen-command" : "invalid-command",
        });
        return;
      }
      seenCommands.add(command.commandId);
      identity ??= await getOrCreateCollaborationIdentity();
      const ok = await identity.verify(command.publicKey, commandPayload(command), command.signature);
      if (!ok) {
        log("receive-drop", { reason: "bad-signature", commandId: command.commandId.slice(-12) });
        return;
      }
      log("receive", {
        kind: command.body.kind,
        revision: command.body.revision,
        peerId: command.peerId,
        commandId: command.commandId.slice(-12),
      });

      if (command.body.kind === "hello") {
        if (handlers.localRevision() > command.body.revision) {
          log("hello-response", {
            localRevision: handlers.localRevision(),
            remoteRevision: command.body.revision,
          });
          await publishSnapshot();
        }
        return;
      }

      if (command.body.kind === "scene-snapshot") {
        if (command.createdAt < latestSnapshotAt) {
          log("snapshot-drop", {
            reason: "stale-created-at",
            createdAt: command.createdAt,
            latestSnapshotAt,
          });
          return;
        }
        const bytes = base64ToBytes(command.body.scene);
        if (bytes.byteLength > MAX_SCENE_BYTES) {
          log("snapshot-drop", { reason: "too-large", bytes: bytes.byteLength });
          return;
        }
        if (publishTimer !== undefined) {
          window.clearTimeout(publishTimer);
          publishTimer = undefined;
        }
        latestSnapshotAt = command.createdAt;
        handlers.applyScene(bytes);
        // applyScene bumps the local revision; record THAT (local space) as
        // already-synced, otherwise the apply looks like a local edit and we
        // echo the snapshot straight back, ping-ponging forever with the peer.
        lastPublishedRevision = handlers.localRevision();
        handlers.onRemoteApplied();
        log("snapshot-applied", { revision: command.body.revision, bytes: bytes.byteLength });
      }
    } catch (error) {
      log("receive-error", error instanceof Error ? error.message : String(error));
    }
  };

  const disconnect = () => {
    shouldReconnect = false;
    stopReconnectTimer();
    socket?.close(1000, "Disconnected in Blitz settings.");
    socket = undefined;
    log("disconnect");
    setStatus("disconnected", "Disconnected");
  };

  const connect = async (urlValue: string, reconnectRoom?: string) => {
    stopReconnectTimer();
    socket?.close(1000, "Replacing collaboration connection.");

    let url: string;
    let room: string;
    try {
      url = validateUrl(urlValue);
      room = reconnectRoom ?? hashRoom ?? randomRoom();
      if (hashSettings.key && hashRoom === room) {
        encodedRoomKey = hashSettings.key;
        roomKey = await importRoomKey(encodedRoomKey);
        roomKeyRoom = room;
      } else if (!roomKey || roomKeyRoom !== room) {
        const generated = await generateRoomKey();
        roomKey = generated.key;
        encodedRoomKey = generated.encoded;
        roomKeyRoom = room;
      }
      identity = await getOrCreateCollaborationIdentity();
      elements.peerId.textContent = identity.peerId;
      log("connect-ready", {
        url,
        room,
        peerId: identity.peerId,
        mode: hashRoom === room ? "join-link" : "host",
      });
    } catch (error) {
      setStatus("disconnected", error instanceof Error ? error.message : String(error));
      log("connect-error", error instanceof Error ? error.message : String(error));
      return;
    }

    localStorage.setItem(URL_STORAGE_KEY, url);
    connectedRoom = room;
    elements.shareLinkInput.value = writeShareHash(room, encodedRoomKey);
    shouldReconnect = true;
    setStatus("connecting", "Connecting...");

    const nextSocket = new WebSocket(`${url.replace(/\/$/, "")}/${encodeURIComponent(room)}`);
    socket = nextSocket;
    log("socket-create", { room });
    nextSocket.addEventListener("open", async () => {
      if (socket !== nextSocket) {
        return;
      }
      reconnectDelay = 1_000;
      setStatus("connected", `Connected to ${room}`);
      log("socket-open", { room, localRevision: handlers.localRevision() });
      await sendCommand({ kind: "hello", revision: handlers.localRevision() });
      if (!joiningFromLink) {
        await publishSnapshot();
      } else {
        log("initial-publish-skip", { reason: "join-link" });
      }
    });
    nextSocket.addEventListener("message", handleCommand);
    nextSocket.addEventListener("close", (event: CloseEvent) => {
      if (socket !== nextSocket) {
        return;
      }
      socket = undefined;
      log("socket-close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        shouldReconnect,
      });
      setStatus("disconnected", shouldReconnect ? "Reconnecting..." : "Disconnected");
      if (shouldReconnect) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = undefined;
          void connect(url, room);
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
      }
    });
    nextSocket.addEventListener("error", () => {
      if (socket === nextSocket) {
        log("socket-error");
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
    void connect(elements.urlInput.value);
    elements.dialog.close();
  });
  elements.disconnectButton.addEventListener("click", disconnect);
  elements.shareLinkInput.addEventListener("focus", () => elements.shareLinkInput.select());

  void getOrCreateCollaborationIdentity().then((nextIdentity) => {
    identity = nextIdentity;
    elements.peerId.textContent = nextIdentity.peerId;
    log("identity", { peerId: nextIdentity.peerId });
  });
  if (hashSettings.key && hashSettings.room) {
    encodedRoomKey = hashSettings.key;
    elements.shareLinkInput.value = window.location.href;
    void importRoomKey(encodedRoomKey)
      .then((key) => {
        roomKey = key;
        roomKeyRoom = hashRoom ?? "";
        log("link-key-imported", { room: hashRoom });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log("link-key-error", message);
        setStatus("disconnected", message);
      });
  }
  setStatus("disconnected", "Disconnected");
  if (hashSettings.key && hashRoom) {
    log("auto-connect", { room: hashRoom });
    void connect(elements.urlInput.value, hashRoom);
  }

  return {
    publishLocalChange() {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (handlers.localRevision() === lastPublishedRevision) {
        return;
      }
      if (publishTimer !== undefined) {
        return;
      }
      log("publish-scheduled", {
        localRevision: handlers.localRevision(),
        lastPublishedRevision,
      });
      publishTimer = window.setTimeout(() => {
        publishTimer = undefined;
        void publishSnapshot();
      }, 120);
    },
  };
}
