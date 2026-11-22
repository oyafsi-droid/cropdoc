import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJson } from "../src/parse.js";

test("plain JSON", () => assert.equal(parseJson('{"crop":"maize"}').crop, "maize"));
test("fenced JSON with chatter", () =>
  assert.deepEqual(parseJson('Sure!\n```json\n{"healthy":false,"first_steps":["a"]}\n```'), { healthy: false, first_steps: ["a"] }));
test("no JSON throws a friendly error", () => assert.throws(() => parseJson("I can't see a plant"), /no answer/));
