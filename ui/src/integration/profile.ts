import type { PassportSession } from "midnight-referendum-api";

const LOCAL_PROFILE_ID_KEY = "referendum_civico_local_profile_id";

function shortHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (const character of value) {
    first ^= character.charCodeAt(0);
    first = Math.imul(first, 0x01000193);
    second ^= character.charCodeAt(0) + 17;
    second = Math.imul(second, 0x811c9dc5);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

function localProfileId(): string {
  try {
    const existing = localStorage.getItem(LOCAL_PROFILE_ID_KEY);
    if (existing) return existing;
    const created = `local-${shortHash(crypto.randomUUID())}`;
    localStorage.setItem(LOCAL_PROFILE_ID_KEY, created);
    return created;
  } catch {
    return `local-${shortHash("referendum-civico-session")}`;
  }
}

/**
 * Creates a display identifier only. It is not used for eligibility,
 * commitments, nullifiers, or any Compact private input.
 */
export function deriveProfileId(session: PassportSession | null): string {
  const address = session?.passportContract?.address;
  if (!address) return localProfileId();
  return `passport-${shortHash(`referendum-civico:profile:v1:${address}`)}`;
}
