import { test } from "node:test";
import assert from "node:assert/strict";
import { lookaheadMinutes, revealWindows } from "../src/lib/patrol/reveal";

const now = new Date("2026-11-16T20:00:00Z");
const at = (min: number) => ({ id: String(min), dueAt: new Date(+now + min * 60000) });

test("by default the whole plan is sent (unchanged behaviour)", () => {
  const plan = [at(-30), at(0), at(40), at(300)];
  assert.equal(revealWindows(plan, now, 0).length, 4);
  assert.equal(lookaheadMinutes(undefined), 0);
  assert.equal(lookaheadMinutes(""), 0);
  assert.equal(lookaheadMinutes("abc"), 0);
  assert.equal(lookaheadMinutes("-5"), 0);
});

test("with a look-ahead, past and open windows stay and later ones are withheld", () => {
  const plan = [at(-30), at(-1), at(10), at(25), at(300)];
  assert.deepEqual(
    revealWindows(plan, now, 15).map((a) => a.id),
    ["-30", "-1", "10"],
  );
  assert.deepEqual(revealWindows(plan, now, 15).length, 3);
});

test("the look-ahead is clamped to a sane range", () => {
  assert.equal(lookaheadMinutes("1"), 5);
  assert.equal(lookaheadMinutes("30"), 30);
  assert.equal(lookaheadMinutes("9999"), 240);
});
