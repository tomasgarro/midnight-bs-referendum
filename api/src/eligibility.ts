import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
} from "@midnight-ntwrk/compact-runtime";
import type {
  EligibilityAttestation,
  PassportSession,
} from "./types.js";

const commitmentHash = new CompactTypeVector(2, new CompactTypeBytes(32));

/** Matches the Compact eligibility leaf used by the referendum contract. */
export function eligibilityCommitmentForSecret(secret: Uint8Array): Uint8Array {
  return persistentHash(commitmentHash, [
    pad32("referendum:commitment:"),
    secret,
  ]);
}

function pad32(value: string): Uint8Array {
  const result = new Uint8Array(32);
  result.set(new TextEncoder().encode(value));
  return result;
}

export interface EligibilityResult {
  attestation: EligibilityAttestation;
  /** Kept in memory and passed only to the contract witness provider. */
  voterSecret: Uint8Array;
}

export interface EligibilityProvider {
  attest(session: PassportSession | null, eventId: string): Promise<EligibilityResult>;
}

/**
 * Deterministic in the protocol sense, but fresh per browser session: this
 * fixture never reads identity documents and never stores raw identity data.
 */
export function createFixtureEligibilityProvider(
  restoredVoterSecret?: Uint8Array,
): EligibilityProvider {
  let voterSecret: Uint8Array | undefined = restoredVoterSecret;
  return {
    async attest(_session, eventId) {
      voterSecret ??= crypto.getRandomValues(new Uint8Array(32));
      const now = new Date();
      return {
        voterSecret,
        attestation: {
          provider: "fixture",
          eventId,
          subjectCommitment: eligibilityCommitmentForSecret(voterSecret),
          issuedAt: now.toISOString(),
          claims: { ageOver18: true, residency: "fixture" },
        },
      };
    },
  };
}

/** Explicit extension point; it stays disabled until an attestation verifier exists. */
export function createExternalEligibilityProvider(
  provider: Exclude<EligibilityAttestation["provider"], "fixture">,
): EligibilityProvider {
  return {
    async attest() {
      throw new Error(
        `${provider} eligibility is not enabled: add a tested Midnight attestation verifier before using it`,
      );
    },
  };
}
