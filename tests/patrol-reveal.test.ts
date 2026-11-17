import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoLookahead,
  deploymentDefault,
  lookaheadMinutes,
  revealWindows,
  siteLookahead,
} from "../src/lib/patrol/reveal";
import { policySchema } from "../src/lib/patrol/validation";

const now = new Date("2026-11-16T20:00:00Z");
const at = (min: number) => ({ id: String(min), dueAt: new Date(+now + min * 60000) });
const policy = (
  mode: "DEFAULT" | "OFF" | "AUTO" | "CUSTOM",
  minutes: number | null = null,
  max = 40,
) => ({ lookaheadMode: mode, lookaheadMinutes: minutes, maxIntervalMinutes: max });

test("off sends the whole plan; a look-ahead keeps open and past windows and withholds later ones", () => {
  const plan = [at(-30), at(-1), at(10), at(25), at(300)];
  assert.equal(revealWindows(plan, now, 0).length, 5);
  assert.deepEqual(
    revealWindows(plan, now, 15).map((a) => a.id),
    ["-30", "-1", "10"],
  );
});

test("automatic keeps the next check plus 30 minutes, between 45 and 120", () => {
  assert.equal(autoLookahead(40), 70); // standard 15-40
  assert.equal(autoLookahead(20), 50); // frequent 10-20
  assert.equal(autoLookahead(60), 90); // relaxed 30-60
  assert.equal(autoLookahead(2), 45); // short test
  assert.equal(autoLookahead(200), 120);
});

test("each site mode resolves on its own, and DEFAULT follows the deployment setting", () => {
  assert.equal(siteLookahead(policy("OFF"), "auto"), 0);
  assert.equal(siteLookahead(policy("AUTO"), undefined), 70);
  assert.equal(siteLookahead(policy("CUSTOM", 30), "auto"), 30);
  assert.equal(
    siteLookahead(policy("DEFAULT"), undefined),
    0,
    "unset deployment default stays off",
  );
  assert.equal(siteLookahead(policy("DEFAULT"), "auto"), 70);
  assert.equal(siteLookahead(policy("DEFAULT", null, 60), "AUTO"), 90);
  assert.equal(siteLookahead(policy("DEFAULT"), "45"), 45);
  assert.equal(siteLookahead(null, "auto"), 0, "no policy, no patrol plan to trim");
});

test("deployment default parsing and clamping", () => {
  assert.deepEqual(deploymentDefault(undefined), { mode: "OFF", minutes: 0 });
  assert.deepEqual(deploymentDefault("0"), { mode: "OFF", minutes: 0 });
  assert.deepEqual(deploymentDefault("abc"), { mode: "OFF", minutes: 0 });
  assert.deepEqual(deploymentDefault(" Auto "), { mode: "AUTO", minutes: 0 });
  assert.deepEqual(deploymentDefault("9999"), { mode: "CUSTOM", minutes: 240 });
  assert.equal(lookaheadMinutes("1"), 5);
  assert.equal(lookaheadMinutes(null), 0);
});

test("the policy form: custom needs minutes, other modes drop them, old clients default to DEFAULT", () => {
  const base = {
    enabled: true,
    minIntervalMinutes: 15,
    maxIntervalMinutes: 40,
    responseMinutes: 10,
  };
  assert.equal(policySchema.parse(base).lookaheadMode, "DEFAULT");
  assert.equal(
    policySchema.parse({ ...base, lookaheadMode: "AUTO", lookaheadMinutes: 90 }).lookaheadMinutes,
    null,
  );
  assert.equal(
    policySchema.parse({ ...base, lookaheadMode: "CUSTOM", lookaheadMinutes: 90 }).lookaheadMinutes,
    90,
  );
  assert.equal(policySchema.safeParse({ ...base, lookaheadMode: "CUSTOM" }).success, false);
  assert.equal(
    policySchema.safeParse({ ...base, lookaheadMode: "CUSTOM", lookaheadMinutes: 2 }).success,
    false,
  );
});
