import assert from "node:assert/strict";
import test from "node:test";

import { classifyAdvisorMessage, isAdvisorHeartbeatStale } from "./battle-lab-server.mjs";

test("advisor status recognizes live SSH and SCP recovery messages", () => {
  for (const message of [
    "scp: Connection closed",
    "ssh: connect to host localhost port 2222: Connection refused",
    "bridge reconnecting: device unavailable",
    "write failed: Broken pipe",
  ]) {
    assert.equal(classifyAdvisorMessage(message), "recovering", message);
  }
});

test("advisor health becomes recovering when heartbeats stop", () => {
  const now = Date.parse("2026-07-16T00:00:30.000Z");
  assert.equal(isAdvisorHeartbeatStale("2026-07-16T00:00:15.000Z", now), false);
  assert.equal(isAdvisorHeartbeatStale("2026-07-16T00:00:09.999Z", now), true);
  assert.equal(isAdvisorHeartbeatStale(null, now), false);
});

test("advisor status returns to running after a healthy bridge message", () => {
  assert.equal(
    classifyAdvisorMessage("2026-07-15T22:30:00.036Z iPhone USB/SSH connection ready"),
    "running",
  );
  assert.equal(
    classifyAdvisorMessage("2026-07-15T22:30:02.200Z engine status=ready hash=abc123 elapsedMs=420"),
    "running",
  );
});
