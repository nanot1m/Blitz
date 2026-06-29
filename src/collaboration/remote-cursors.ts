// Live cursors for remote collaborators. Each peer's pointer arrives in world
// coordinates; we tween the displayed position in world space (so it glides and
// stays anchored to the scene while the local user pans/zooms) and project it
// onto the local viewport every frame. Pure DOM overlay — no WASM/render change.

type ViewProjection = {
  viewportWidth: number;
  viewportHeight: number;
  cameraX: number;
  cameraY: number;
  zoom: number;
  canvas: HTMLCanvasElement;
};

type PeerCursor = {
  targetX: number;
  targetY: number;
  displayX: number;
  displayY: number;
  placed: boolean;
  lastSeen: number;
  element: HTMLDivElement;
};

const STALE_AFTER_MS = 5_000;
// Fraction of the remaining gap closed per frame; smooths network jitter into a
// glide without feeling laggy.
const TWEEN_FACTOR = 0.3;

function hueForPeer(peerId: string): number {
  let hash = 0;
  for (let index = 0; index < peerId.length; index += 1) {
    hash = (hash * 31 + peerId.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

function peerLabel(peerId: string): string {
  return peerId.length > 6 ? peerId.slice(-6) : peerId;
}

export function createRemoteCursors(layer: HTMLElement) {
  const peers = new Map<string, PeerCursor>();

  const createElement = (peerId: string): HTMLDivElement => {
    const color = `hsl(${hueForPeer(peerId)} 75% 52%)`;
    const element = document.createElement("div");
    element.style.cssText =
      "position:fixed;left:0;top:0;pointer-events:none;z-index:99998;" +
      "will-change:transform;display:none;";
    element.innerHTML =
      '<svg width="17" height="21" viewBox="0 0 16 20" xmlns="http://www.w3.org/2000/svg" style="display:block">' +
      `<path d="M1 1 L1 16 L5 12.5 L7.6 18.4 L9.8 17.5 L7.2 11.8 L13 11.8 Z" fill="${color}" stroke="white" stroke-width="1.4" stroke-linejoin="round"/></svg>` +
      `<span style="position:absolute;left:14px;top:13px;background:${color};color:#fff;` +
      "font:600 11px/1.4 system-ui,-apple-system,sans-serif;padding:1px 6px;border-radius:7px;" +
      `white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.35)">${peerLabel(peerId)}</span>`;
    layer.appendChild(element);
    return element;
  };

  const update = (peerId: string, worldX: number, worldY: number) => {
    let peer = peers.get(peerId);
    if (!peer) {
      peer = {
        targetX: worldX,
        targetY: worldY,
        displayX: worldX,
        displayY: worldY,
        placed: false,
        lastSeen: 0,
        element: createElement(peerId),
      };
      peers.set(peerId, peer);
    }
    peer.targetX = worldX;
    peer.targetY = worldY;
    peer.lastSeen = performance.now();
  };

  const render = (view: ViewProjection) => {
    if (peers.size === 0) {
      return;
    }
    const now = performance.now();
    const rect = view.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    for (const [peerId, peer] of peers) {
      if (now - peer.lastSeen > STALE_AFTER_MS) {
        peer.element.remove();
        peers.delete(peerId);
        continue;
      }
      if (!peer.placed) {
        peer.displayX = peer.targetX;
        peer.displayY = peer.targetY;
        peer.placed = true;
      } else {
        peer.displayX += (peer.targetX - peer.displayX) * TWEEN_FACTOR;
        peer.displayY += (peer.targetY - peer.displayY) * TWEEN_FACTOR;
      }
      const canvasPixelX = (peer.displayX - view.cameraX) * view.zoom + view.viewportWidth * 0.5;
      const canvasPixelY = (peer.displayY - view.cameraY) * view.zoom + view.viewportHeight * 0.5;
      const clientX = canvasPixelX / dpr + rect.left;
      const clientY = canvasPixelY / dpr + rect.top;
      peer.element.style.display = "block";
      peer.element.style.transform = `translate(${clientX}px, ${clientY}px)`;
    }
  };

  const clear = () => {
    for (const peer of peers.values()) {
      peer.element.remove();
    }
    peers.clear();
  };

  return { update, render, clear };
}
