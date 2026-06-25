export type ActorId = {
  hi: number;
  lo: number;
};

const STORAGE_KEY = "blitz.object-id-actor.v1";
const ACTOR_HEX_PATTERN = /^[0-9a-f]{16}$/i;

export function getOrCreateActorId(): ActorId {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && ACTOR_HEX_PATTERN.test(stored)) {
    return {
      hi: Number.parseInt(stored.slice(0, 8), 16) >>> 0,
      lo: Number.parseInt(stored.slice(8), 16) >>> 0,
    };
  }

  const words = new Uint32Array(2);
  do {
    crypto.getRandomValues(words);
  } while (words[0] === 0 && words[1] === 0);

  const actor = { hi: words[0] >>> 0, lo: words[1] >>> 0 };
  localStorage.setItem(
    STORAGE_KEY,
    `${actor.hi.toString(16).padStart(8, "0")}${actor.lo.toString(16).padStart(8, "0")}`,
  );
  return actor;
}
