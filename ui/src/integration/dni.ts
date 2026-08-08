/**
 * Argentine DNI (tarjeta) eligibility parsing.
 *
 * The card's reverse carries a PDF417 barcode with `@`-separated fields. The
 * layout below is the community-documented one, not an official RENAPER
 * specification, so every field is validated rather than trusted by position:
 * a payload that does not parse cleanly is rejected instead of guessed at.
 *
 * IMPORTANT PRIVACY BOUNDARY. Everything in this module runs in the browser.
 * The parsed document never leaves the device. The only value derived for the
 * network is `uniquenessTag`, a salted digest that lets the issuer refuse a
 * second registration of the same document without learning which document it
 * is. It is deliberately not the voter secret and not the eligibility leaf.
 *
 * WHAT THIS DOES NOT PROVE. Reading a barcode proves possession of a
 * document's data. It does not prove the document is genuine — that needs the
 * chip and RENAPER — and on its own it does not prove the holder is the person
 * described. The liveness challenge narrows the second gap; neither closes it.
 */

export type DniSex = "M" | "F" | "X";

export interface DniDocument {
  /** Surname exactly as printed. Never leaves the browser. */
  surname: string;
  /** Given names exactly as printed. Never leaves the browser. */
  givenNames: string;
  sex: DniSex;
  /** 7–8 digit document number. Never leaves the browser. */
  documentNumber: string;
  /** Copy letter (A, B, …): a reissued card keeps the number but changes this. */
  copy: string;
  birthDate: string;
  issueDate: string;
}

export type DniParseFailure =
  | "not-a-dni-payload"
  | "unknown-layout"
  | "invalid-document-number"
  | "invalid-sex"
  | "invalid-date"
  | "invalid-copy";

export type DniParseResult =
  | { ok: true; document: DniDocument }
  | { ok: false; reason: DniParseFailure };

const DOCUMENT_NUMBER = /^\d{7,8}$/;
const COPY = /^[A-Z]$/;
const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isDocumentNumber(value: string): boolean {
  return DOCUMENT_NUMBER.test(value);
}

function isCopy(value: string): boolean {
  return COPY.test(value);
}

function normaliseSex(value: string): DniSex | null {
  const upper = value.trim().toUpperCase();
  return upper === "M" || upper === "F" || upper === "X" ? upper : null;
}

/** Rejects impossible calendar dates, not only malformed ones. */
export function parseDniDate(value: string): Date | null {
  const match = DATE.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

/**
 * The documented field order is
 *
 *     trámite @ apellido @ nombre @ sexo @ número @ ejemplar @ nacimiento @ emisión [ @ … ]
 *
 * so the fields are read at fixed offsets anchored on the first date rather
 * than sniffed by shape — the sex marker and the copy letter are both a bare
 * A–Z and cannot be told apart by inspection alone.
 *
 * A payload in any other arrangement is rejected as `unknown-layout`. For an
 * identity document, refusing to read is the right failure: a mis-parse would
 * silently attribute someone else's number to this voter.
 */
export function parseDniBarcode(payload: string): DniParseResult {
  const raw = payload.trim();
  if (!raw.includes("@")) return { ok: false, reason: "not-a-dni-payload" };

  const fields = raw.split("@").map((field) => field.trim());
  if (fields.length < 8) return { ok: false, reason: "unknown-layout" };

  const birthIndex = fields.findIndex((field) => DATE.test(field));
  // The five identity fields sit before the birth date, the issue date after.
  if (birthIndex < 5 || !DATE.test(fields[birthIndex + 1] ?? "")) {
    return { ok: false, reason: "unknown-layout" };
  }

  const surname = fields[birthIndex - 5]!;
  const givenNames = fields[birthIndex - 4]!;
  const sexField = fields[birthIndex - 3]!;
  const documentNumber = fields[birthIndex - 2]!;
  const copy = fields[birthIndex - 1]!;
  const birthDate = fields[birthIndex]!;
  const issueDate = fields[birthIndex + 1]!;

  if (!isDocumentNumber(documentNumber)) return { ok: false, reason: "invalid-document-number" };
  const sex = normaliseSex(sexField);
  if (!sex) return { ok: false, reason: "invalid-sex" };
  if (!isCopy(copy)) return { ok: false, reason: "invalid-copy" };
  if (!surname || !givenNames) return { ok: false, reason: "unknown-layout" };
  if (!parseDniDate(birthDate) || !parseDniDate(issueDate)) {
    return { ok: false, reason: "invalid-date" };
  }

  return {
    ok: true,
    document: { surname, givenNames, sex, documentNumber, copy, birthDate, issueDate },
  };
}

/** Whole years elapsed, evaluated on the device and never transmitted. */
export function ageOn(birthDate: Date, reference: Date): number {
  let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** Optional voting starts at 16 in Argentina; the referendum follows that floor. */
export const MINIMUM_VOTING_AGE = 16;

export type EligibilityRejection =
  | { eligible: false; reason: "under-age"; age: number }
  | { eligible: false; reason: "not-yet-issued" };

export type EligibilityDecision = { eligible: true; age: number } | EligibilityRejection;

export function checkDniEligibility(
  document: DniDocument,
  now: Date = new Date(),
): EligibilityDecision {
  const birthDate = parseDniDate(document.birthDate);
  const issueDate = parseDniDate(document.issueDate);
  if (!birthDate || !issueDate) return { eligible: false, reason: "not-yet-issued" };
  if (issueDate.getTime() > now.getTime()) return { eligible: false, reason: "not-yet-issued" };

  const age = ageOn(birthDate, now);
  if (age < MINIMUM_VOTING_AGE) return { eligible: false, reason: "under-age", age };
  return { eligible: true, age };
}

/**
 * The only document-derived value that is allowed to leave the device.
 *
 * Salting with a per-referendum value means the same document produces an
 * unrelated tag in a different referendum, so tags cannot be joined across
 * events into a participation history. The digest is over the number and the
 * copy letter together: a reissued card must not buy a second vote.
 *
 * This is a uniqueness index for the issuer, never an authenticator — it is
 * derived from data printed on the card, so anyone holding the card can
 * recompute it. It is not the voter secret.
 */
export async function uniquenessTag(
  document: DniDocument,
  eventSalt: string,
): Promise<string> {
  const material = new TextEncoder().encode(
    `referendum:uniqueness:${eventSalt}:${document.documentNumber}:${document.copy}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", material);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * What the UI is allowed to show back to the user after a scan. The document
 * number is masked even on the user's own screen, so a demo on a projector or
 * a shoulder-surfer never reads it off the confirmation panel.
 */
export interface DniSummary {
  initials: string;
  maskedNumber: string;
  age: number;
}

export function summariseDni(document: DniDocument, now: Date = new Date()): DniSummary | null {
  const birthDate = parseDniDate(document.birthDate);
  if (!birthDate) return null;
  const initials = [document.givenNames, document.surname]
    .map((part) => part.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join("");
  return {
    initials,
    maskedNumber: `•••${document.documentNumber.slice(-3)}`,
    age: ageOn(birthDate, now),
  };
}
