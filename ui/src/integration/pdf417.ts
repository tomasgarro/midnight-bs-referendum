/**
 * PDF417 decoding for the DNI scan step.
 *
 * Two backends, chosen at runtime. The browser's native `BarcodeDetector` is
 * preferred where it advertises `pdf417` — it is hardware-accelerated and adds
 * nothing to the bundle. Everywhere else a ZXing reader is imported lazily, so
 * browsers that never need it never download it.
 *
 * Both run entirely in the page. No frame is uploaded.
 */

export interface Pdf417Decoder {
  /** Returns the decoded payload, or null when this frame held no barcode. */
  decode(canvas: HTMLCanvasElement): Promise<string | null>;
  readonly backend: "native" | "zxing";
}

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function nativeDetector(): BarcodeDetectorConstructor | null {
  const candidate = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return typeof candidate === "function" ? candidate : null;
}

export async function nativePdf417Supported(): Promise<boolean> {
  const Detector = nativeDetector();
  if (!Detector?.getSupportedFormats) return false;
  try {
    return (await Detector.getSupportedFormats()).includes("pdf417");
  } catch {
    return false;
  }
}

/**
 * Picks a backend once, at the start of a scan session. Callers should treat a
 * rejected promise as "this device cannot scan" and offer the demo document
 * path instead of failing the user outright.
 */
export async function createPdf417Decoder(): Promise<Pdf417Decoder> {
  if (await nativePdf417Supported()) {
    const detector = new (nativeDetector()!)({ formats: ["pdf417"] });
    return {
      backend: "native",
      async decode(canvas) {
        try {
          const found = await detector.detect(canvas);
          return found.length > 0 ? found[0]!.rawValue : null;
        } catch {
          // A detector that throws on one frame is not fatal for the session.
          return null;
        }
      },
    };
  }

  const [{ BrowserPDF417Reader }, { DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserPDF417Reader(hints);

  return {
    backend: "zxing",
    async decode(canvas) {
      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch {
        // ZXing signals "no barcode in this frame" by throwing.
        return null;
      }
    },
  };
}
