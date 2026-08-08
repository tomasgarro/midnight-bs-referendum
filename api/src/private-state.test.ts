import { describe, expect, it } from "vitest";
import {
  deserializePrivateStateFromStorage,
  serializePrivateStateForStorage,
} from "./private-state.js";

describe("browser private-state serialization", () => {
  it("round-trips byte arrays and Merkle path bigint values", () => {
    const original = {
      voterSecret: new Uint8Array([1, 2, 255]),
      voterPath: {
        leaf: new Uint8Array([9, 8]),
        path: [{ sibling: { field: 42n }, goes_left: true }],
      },
    };

    const restored = deserializePrivateStateFromStorage<typeof original>(
      serializePrivateStateForStorage(original),
    );

    expect(restored.voterSecret).toEqual(original.voterSecret);
    expect(restored.voterPath.leaf).toEqual(original.voterPath.leaf);
    expect(restored.voterPath.path[0]?.sibling.field).toBe(42n);
    expect(restored.voterPath.path[0]?.goes_left).toBe(true);
  });
});
