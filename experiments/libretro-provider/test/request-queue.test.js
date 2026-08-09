import assert from "node:assert/strict";
import { test } from "node:test";
import { createSerialQueue } from "../request-queue.mjs";

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

test("tasks run strictly in enqueue order, even when earlier tasks are slower", async () => {
  const queue = createSerialQueue();
  const order = [];
  const results = await Promise.all([
    queue.enqueue(async () => { await delay(30); order.push("a"); return "a"; }),
    queue.enqueue(async () => { await delay(0); order.push("b"); return "b"; }),
    queue.enqueue(async () => { await delay(0); order.push("c"); return "c"; }),
  ]);
  assert.deepEqual(order, ["a", "b", "c"]);
  assert.deepEqual(results, ["a", "b", "c"]);
});

test("a task that throws does not block, corrupt, or get skipped by later tasks", async () => {
  const queue = createSerialQueue();
  const order = [];
  const first = queue.enqueue(async () => { order.push("first-start"); throw new Error("boom"); });
  const second = queue.enqueue(async () => { order.push("second"); return "second-result"; });

  await assert.rejects(first, /boom/);
  assert.equal(await second, "second-result");
  assert.deepEqual(order, ["first-start", "second"]);
});

test("a synchronously-throwing task is also handled without breaking the chain", async () => {
  const queue = createSerialQueue();
  const first = queue.enqueue(() => { throw new Error("sync boom"); });
  const second = queue.enqueue(async () => "ok");
  await assert.rejects(first, /sync boom/);
  assert.equal(await second, "ok");
});

test("each enqueue() call's returned promise settles with that task's own outcome, not a shared/mixed one", async () => {
  const queue = createSerialQueue();
  const a = queue.enqueue(async () => 1);
  const b = queue.enqueue(async () => { throw new Error("only b fails"); });
  const c = queue.enqueue(async () => 3);
  assert.equal(await a, 1);
  await assert.rejects(b, /only b fails/);
  assert.equal(await c, 3);
});

test("a burst of synchronous enqueue() calls in the same tick still executes one at a time in call order", async () => {
  const queue = createSerialQueue();
  let inFlight = 0;
  let maxConcurrent = 0;
  const order = [];
  const tasks = Array.from({ length: 10 }, (_, index) => () => queue.enqueue(async () => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await delay(5);
    order.push(index);
    inFlight -= 1;
  }));
  await Promise.all(tasks.map((run) => run()));
  assert.equal(maxConcurrent, 1, "no two tasks should ever be in flight simultaneously");
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("queue.enqueue never lets the internal chain itself become a permanently rejected promise", async () => {
  const queue = createSerialQueue();
  for (let i = 0; i < 5; i += 1) {
    // Every other task fails; the queue must keep accepting and running
    // new tasks regardless.
    await queue.enqueue(async () => {
      if (i % 2 === 0) throw new Error(`fail-${i}`);
      return `ok-${i}`;
    }).catch((error) => error.message);
  }
  const finalResult = await queue.enqueue(async () => "still alive");
  assert.equal(finalResult, "still alive");
});
