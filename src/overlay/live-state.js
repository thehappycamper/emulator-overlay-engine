function defaultIsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createLiveStateController({
  fetchState,
  onRender,
  onStatus,
  intervalMs = 1000,
  now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
  isEqual = defaultIsEqual
}) {
  if (typeof fetchState !== "function") {
    throw new TypeError("fetchState must be a function");
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new TypeError("intervalMs must be a positive number");
  }

  let running = false;
  let timer = null;
  let lastState;
  let hasRenderedOnce = false;
  let status = {
    phase: "error",
    hasRenderedOnce: false,
    lastUpdatedAt: null,
    lastErrorAt: null,
    lastErrorMessage: null
  };

  function setStatus(patch) {
    status = { ...status, ...patch };
    onStatus?.(status);
  }

  async function poll() {
    if (!running) {
      return;
    }

    try {
      const nextState = await fetchState();
      const changed = !hasRenderedOnce || !isEqual(nextState, lastState);
      lastState = nextState;
      hasRenderedOnce = true;

      setStatus({
        phase: "live",
        hasRenderedOnce: true,
        lastUpdatedAt: now(),
        lastErrorMessage: null
      });

      if (changed) {
        onRender?.(nextState);
      }
    } catch (error) {
      setStatus({
        phase: hasRenderedOnce ? "stale" : "error",
        lastErrorAt: now(),
        lastErrorMessage: error instanceof Error ? error.message : String(error)
      });
    } finally {
      if (running) {
        timer = schedule(poll, intervalMs);
      }
    }
  }

  return {
    start() {
      if (running) {
        return undefined;
      }
      running = true;
      return poll();
    },
    stop() {
      running = false;
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
    },
    getStatus() {
      return status;
    }
  };
}
