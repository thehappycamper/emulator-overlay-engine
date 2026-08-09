// A minimal, dependency-free strict FIFO async task queue: exactly one
// enqueued task is ever in flight at a time, and every task always
// settles the queue's own internal chain (whether the task's own promise
// resolves or rejects) before the next task begins - a task that throws
// never blocks, corrupts, or is skipped by later tasks.
//
// This exists specifically to serialize provider-child.mjs's request
// handling: Node's readline "line" event does not itself wait for an
// async listener's returned promise before emitting the next line, so
// without an explicit queue, two requests submitted back-to-back (e.g.
// `initialize` immediately followed by `run`) can have their async
// bodies interleave, letting the second observe state the first has not
// finished establishing yet.
export function createSerialQueue() {
  let tail = Promise.resolve();

  // Returns the caller's own task's settlement (so the caller still sees
  // their own request's real success/failure), while `tail` itself is
  // always reset to a resolved promise regardless of outcome, so the next
  // `enqueue()` call's task is guaranteed to run right after - never
  // skipped, never left waiting on a permanently-rejected chain.
  function enqueue(task) {
    const started = tail.then(task);
    tail = started.then(
      () => undefined,
      () => undefined,
    );
    return started;
  }

  return { enqueue };
}
