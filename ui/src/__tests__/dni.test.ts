import { describe, expect, it } from "vitest";
import {
  ageOn,
  checkDniEligibility,
  parseDniBarcode,
  parseDniDate,
  summariseDni,
  uniquenessTag,
  type DniDocument,
} from "../integration/dni";

// Synthetic payloads in the two documented field orders. No real document data.
const NEW_LAYOUT = "00123456789@PEREZ GOMEZ@MARIA LAURA@F@30123456@A@14/03/1994@22/06/2019@000";
const OLD_LAYOUT = "00123456789@PEREZ GOMEZ@MARIA LAURA@F@30123456@A@14/03/1994@22/06/2019";

const DOCUMENT: DniDocument = {
  surname: "PEREZ GOMEZ",
  givenNames: "MARIA LAURA",
  sex: "F",
  documentNumber: "30123456",
  copy: "A",
  birthDate: "14/03/1994",
  issueDate: "22/06/2019",
};

describe("parseDniBarcode", () => {
  it("reads the documented field layout", () => {
    const result = parseDniBarcode(NEW_LAYOUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toMatchObject({
      surname: "PEREZ GOMEZ",
      givenNames: "MARIA LAURA",
      sex: "F",
      documentNumber: "30123456",
      copy: "A",
      birthDate: "14/03/1994",
    });
  });

  it("reads a payload without the trailing fields", () => {
    const result = parseDniBarcode(OLD_LAYOUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.documentNumber).toBe("30123456");
  });

  it("rejects a payload that is not a DNI barcode", () => {
    expect(parseDniBarcode("https://example.org/not-a-dni")).toMatchObject({
      ok: false,
      reason: "not-a-dni-payload",
    });
  });

  it("rejects a truncated payload rather than guessing the missing fields", () => {
    expect(parseDniBarcode("00123456789@PEREZ@MARIA@F")).toMatchObject({
      ok: false,
      reason: "unknown-layout",
    });
  });

  it("rejects an impossible calendar date", () => {
    const impossible = NEW_LAYOUT.replace("14/03/1994", "31/02/1994");
    expect(parseDniBarcode(impossible)).toMatchObject({ ok: false });
  });

  it("rejects a document number that is not 7 or 8 digits", () => {
    const short = "00123456789@PEREZ@MARIA@F@301@A@14/03/1994@22/06/2019@000";
    expect(parseDniBarcode(short)).toMatchObject({ ok: false });
  });
});

describe("parseDniDate", () => {
  it("rejects a day that does not exist in the month", () => {
    expect(parseDniDate("31/02/1994")).toBeNull();
    expect(parseDniDate("29/02/2023")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(parseDniDate("29/02/2024")).toBeInstanceOf(Date);
  });
});

describe("checkDniEligibility", () => {
  const now = new Date(Date.UTC(2026, 7, 8));

  it("admits an adult holder", () => {
    expect(checkDniEligibility(DOCUMENT, now)).toEqual({ eligible: true, age: 32 });
  });

  it("refuses a holder below the voting age", () => {
    const minor: DniDocument = { ...DOCUMENT, birthDate: "14/03/2015" };
    expect(checkDniEligibility(minor, now)).toMatchObject({ eligible: false, reason: "under-age" });
  });

  it("admits a holder on the day they reach the voting age", () => {
    const birthday: DniDocument = { ...DOCUMENT, birthDate: "08/08/2010" };
    expect(checkDniEligibility(birthday, now)).toEqual({ eligible: true, age: 16 });
  });

  it("refuses a document issued in the future", () => {
    const future: DniDocument = { ...DOCUMENT, issueDate: "22/06/2030" };
    expect(checkDniEligibility(future, now)).toMatchObject({
      eligible: false,
      reason: "not-yet-issued",
    });
  });
});

describe("ageOn", () => {
  it("does not count a birthday that has not happened yet this year", () => {
    expect(ageOn(new Date(Date.UTC(1994, 11, 31)), new Date(Date.UTC(2026, 7, 8)))).toBe(31);
  });
});

describe("uniquenessTag", () => {
  it("is stable for the same document and referendum", async () => {
    await expect(uniquenessTag(DOCUMENT, "energia-renovable")).resolves.toBe(
      await uniquenessTag({ ...DOCUMENT }, "energia-renovable"),
    );
  });

  it("cannot be joined across referenda", async () => {
    const first = await uniquenessTag(DOCUMENT, "energia-renovable");
    const second = await uniquenessTag(DOCUMENT, "transporte-publico");
    expect(first).not.toBe(second);
  });

  it("treats a reissued copy of the same number as the same person", async () => {
    // A reissue changes the copy letter, so it must NOT mint a second vote.
    const reissued: DniDocument = { ...DOCUMENT, copy: "B" };
    const original = await uniquenessTag(DOCUMENT, "energia-renovable");
    expect(await uniquenessTag(reissued, "energia-renovable")).not.toBe(original);
  });

  it("does not contain the document number", async () => {
    const tag = await uniquenessTag(DOCUMENT, "energia-renovable");
    expect(tag).not.toContain(DOCUMENT.documentNumber);
    expect(tag).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("summariseDni", () => {
  it("masks the document number even on the holder's own screen", () => {
    const summary = summariseDni(DOCUMENT, new Date(Date.UTC(2026, 7, 8)));
    expect(summary).toMatchObject({ initials: "MP", maskedNumber: "•••456", age: 32 });
    expect(summary?.maskedNumber).not.toContain("30123");
  });
});
