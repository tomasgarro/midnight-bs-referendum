import { describe, expect, it } from "vitest";
import {
  CHAOS_THRESHOLD,
  createLivenessScript,
  evaluateLiveness,
  evaluateStep,
  motionEnergy,
  MOTION_THRESHOLD,
  PROMPT_COPY,
  type LivenessSample,
  type LivenessStep,
} from "../integration/liveness";

const STEP: LivenessStep = { prompt: "nod", windowMs: 4_000 };

function samples(...pairs: [number, number][]): LivenessSample[] {
  return pairs.map(([at, energy]) => ({ at, energy }));
}

describe("motionEnergy", () => {
  it("is zero for identical frames", () => {
    const frame = new Uint8ClampedArray(1024).fill(120);
    expect(motionEnergy(frame, frame)).toBe(0);
  });

  it("rises with the size of the change", () => {
    const still = new Uint8ClampedArray(1024).fill(0);
    const slight = new Uint8ClampedArray(1024).fill(10);
    const large = new Uint8ClampedArray(1024).fill(200);
    expect(motionEnergy(still, slight)).toBeLessThan(motionEnergy(still, large));
    expect(motionEnergy(still, large)).toBeLessThanOrEqual(1);
  });

  it("refuses to compare mismatched frames rather than reporting noise", () => {
    expect(motionEnergy(new Uint8ClampedArray(16), new Uint8ClampedArray(32))).toBe(0);
    expect(motionEnergy(new Uint8ClampedArray(0), new Uint8ClampedArray(0))).toBe(0);
  });
});

describe("evaluateStep", () => {
  it("passes when motion appears inside the window", () => {
    expect(evaluateStep(samples([100, 0.01], [900, MOTION_THRESHOLD + 0.1]), STEP)).toBe("passed");
  });

  it("fails a still frame held up to the camera", () => {
    // A printed photo produces sensor noise, not motion.
    expect(evaluateStep(samples([100, 0.002], [1200, 0.004], [3000, 0.001]), STEP)).toBe("no-motion");
  });

  it("fails when there are no samples at all", () => {
    expect(evaluateStep([], STEP)).toBe("no-motion");
  });

  it("fails a shaken camera rather than accepting it as a gesture", () => {
    expect(
      evaluateStep(samples([100, CHAOS_THRESHOLD + 0.2], [900, CHAOS_THRESHOLD + 0.3]), STEP),
    ).toBe("too-much-motion");
  });

  it("ignores motion that arrives after the window closed", () => {
    expect(evaluateStep(samples([100, 0.001], [9000, 0.9]), STEP)).toBe("no-motion");
  });
});

describe("evaluateLiveness", () => {
  const script: LivenessStep[] = [STEP, { prompt: "turn-left", windowMs: 4_000 }];

  it("passes only when every step passed", () => {
    const outcome = evaluateLiveness(script, [samples([500, 0.4]), samples([500, 0.3])]);
    expect(outcome).toMatchObject({ passed: true, failedAt: null });
  });

  it("reports which step failed", () => {
    const outcome = evaluateLiveness(script, [samples([500, 0.4]), samples([500, 0.001])]);
    expect(outcome.passed).toBe(false);
    expect(outcome.failedAt).toBe(1);
    expect(outcome.verdicts[1]).toBe("no-motion");
  });

  it("does not pass an empty script", () => {
    expect(evaluateLiveness([], []).passed).toBe(false);
  });

  it("fails when a step produced no samples", () => {
    expect(evaluateLiveness(script, [samples([500, 0.4])]).passed).toBe(false);
  });
});

describe("createLivenessScript", () => {
  it("never repeats a prompt within one attempt", () => {
    const script = createLivenessScript(4, () => 0.999);
    expect(new Set(script.map((step) => step.prompt)).size).toBe(script.length);
  });

  it("varies the order between attempts so a recording cannot be replayed", () => {
    const first = createLivenessScript(2, sequence([0, 0]));
    const second = createLivenessScript(2, sequence([0.75, 0.5]));
    expect(first.map((step) => step.prompt)).not.toEqual(second.map((step) => step.prompt));
  });

  it("cannot ask for more prompts than exist", () => {
    expect(createLivenessScript(99).length).toBeLessThanOrEqual(Object.keys(PROMPT_COPY).length);
  });

  it("gives every prompt user-facing copy", () => {
    for (const step of createLivenessScript(4)) {
      expect(PROMPT_COPY[step.prompt]).toBeTruthy();
    }
  });
});

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}
