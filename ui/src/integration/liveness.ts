/**
 * Presence check for the eligibility step.
 *
 * WHAT THIS IS. A randomised prompt sequence scored from frame-to-frame motion
 * energy, computed in the browser. It is designed to defeat the cheapest
 * attack on a document scan — holding a printed photo, or another phone
 * showing a still image, up to the camera — by requiring movement to appear
 * when the app asks for it and not before.
 *
 * WHAT THIS IS NOT. It is not biometric verification, not a face match against
 * the document photo, and not proof against a prepared video replay. Nothing
 * here identifies a person; it only distinguishes "something is moving on cue"
 * from "nothing is". Call it a presence check in the UI and never a KYC match.
 *
 * No frame is uploaded, retained, or written to storage. Frames are reduced to
 * a single scalar per sample and discarded.
 */

export type LivenessPrompt = "turn-left" | "turn-right" | "lean-closer" | "nod";

export interface LivenessStep {
  prompt: LivenessPrompt;
  /** Milliseconds the holder is given to produce motion for this step. */
  windowMs: number;
}

export interface LivenessSample {
  /** Milliseconds since the step began. */
  at: number;
  /** Normalised 0..1 frame-difference energy. */
  energy: number;
}

export const PROMPT_COPY: Record<LivenessPrompt, string> = {
  "turn-left": "Girá la cabeza hacia la izquierda",
  "turn-right": "Girá la cabeza hacia la derecha",
  "lean-closer": "Acercate un poco a la cámara",
  nod: "Asentí con la cabeza",
};

const ALL_PROMPTS: LivenessPrompt[] = ["turn-left", "turn-right", "lean-closer", "nod"];

/** Motion above this counts as the holder responding to the prompt. */
export const MOTION_THRESHOLD = 0.06;
/**
 * Motion this high across a whole step is not a person following a prompt; it
 * is a moving camera or a scene being swapped, so it fails rather than passes.
 */
export const CHAOS_THRESHOLD = 0.55;
export const DEFAULT_STEP_WINDOW_MS = 4_000;

/**
 * A fresh random order each attempt. A replay recorded from an earlier session
 * only matches if the same prompts come up in the same order.
 */
export function createLivenessScript(
  steps = 2,
  random: () => number = Math.random,
): LivenessStep[] {
  const pool = [...ALL_PROMPTS];
  const chosen: LivenessStep[] = [];
  for (let index = 0; index < Math.min(steps, pool.length); index += 1) {
    const pick = Math.floor(random() * pool.length) % pool.length;
    const [prompt] = pool.splice(pick, 1);
    chosen.push({ prompt: prompt!, windowMs: DEFAULT_STEP_WINDOW_MS });
  }
  return chosen;
}

/**
 * Mean absolute luminance difference between two greyscale-reduced frames,
 * normalised to 0..1. Sampling every fourth pixel keeps this cheap enough to
 * run on every animation frame on a mid-range phone.
 */
export function motionEnergy(previous: Uint8ClampedArray, next: Uint8ClampedArray): number {
  if (previous.length !== next.length || previous.length === 0) return 0;
  let total = 0;
  let counted = 0;
  for (let index = 0; index < previous.length; index += 16) {
    total += Math.abs(previous[index]! - next[index]!);
    counted += 1;
  }
  return counted === 0 ? 0 : total / counted / 255;
}

export type StepVerdict = "passed" | "no-motion" | "too-much-motion";

/**
 * A step passes when motion crosses the threshold at least once inside the
 * window without the whole window being chaotic.
 */
export function evaluateStep(samples: LivenessSample[], step: LivenessStep): StepVerdict {
  const inWindow = samples.filter((sample) => sample.at >= 0 && sample.at <= step.windowMs);
  if (inWindow.length === 0) return "no-motion";

  const peak = Math.max(...inWindow.map((sample) => sample.energy));
  const mean = inWindow.reduce((sum, sample) => sum + sample.energy, 0) / inWindow.length;

  if (mean >= CHAOS_THRESHOLD) return "too-much-motion";
  if (peak < MOTION_THRESHOLD) return "no-motion";
  return "passed";
}

export interface LivenessOutcome {
  passed: boolean;
  verdicts: StepVerdict[];
  failedAt: number | null;
}

export function evaluateLiveness(
  script: LivenessStep[],
  samplesByStep: LivenessSample[][],
): LivenessOutcome {
  const verdicts = script.map((step, index) => evaluateStep(samplesByStep[index] ?? [], step));
  const failedAt = verdicts.findIndex((verdict) => verdict !== "passed");
  return {
    passed: script.length > 0 && failedAt === -1,
    verdicts,
    failedAt: failedAt === -1 ? null : failedAt,
  };
}

export function livenessFailureCopy(verdict: StepVerdict): string {
  switch (verdict) {
    case "no-motion":
      return "No detectamos movimiento. Asegurate de que se te vea bien y repetí el gesto.";
    case "too-much-motion":
      return "Demasiado movimiento para leer el gesto. Sostené el teléfono más firme.";
    default:
      return "";
  }
}
