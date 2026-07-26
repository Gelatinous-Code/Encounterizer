export interface DebouncedNoteWriter<T> {
  schedule(value: T): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  hasPending(): boolean;
  dispose(options?: { flush?: boolean }): Promise<void>;
}

export interface DebouncedNoteWriterOptions<T> {
  delayMs?: number;
  save(value: T): Promise<void>;
  onSaving?: (value: T) => void;
  onSaved?: (value: T) => void;
  onError?: (error: unknown, value: T) => void;
}

/**
 * Debounces frequent note edits while retaining the newest failed value for a
 * visible retry. Flush is safe during pagehide/unmount and serializes behind
 * an in-flight write.
 */
export function createDebouncedNoteWriter<T>(
  options: DebouncedNoteWriterOptions<T>,
): DebouncedNoteWriter<T> {
  const delayMs = options.delayMs ?? 500;
  let pending: T | undefined;
  let pendingSet = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let disposed = false;

  function clearTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function scheduleTimer(): void {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(() => {
        // onError owns presentation; the value remains queued for retry.
      });
    }, delayMs);
  }

  function schedule(value: T): void {
    if (disposed) return;
    pending = value;
    pendingSet = true;
    scheduleTimer();
  }

  function flush(): Promise<void> {
    clearTimer();
    if (!pendingSet) return inFlight;
    const value = pending as T;
    pending = undefined;
    pendingSet = false;
    const write = inFlight.then(async () => {
      options.onSaving?.(value);
      try {
        await options.save(value);
        options.onSaved?.(value);
      } catch (error) {
        if (!pendingSet) {
          pending = value;
          pendingSet = true;
        }
        options.onError?.(error, value);
        throw error;
      }
    });
    inFlight = write.catch(() => undefined);
    return write;
  }

  async function dispose(
    disposeOptions: { flush?: boolean } = { flush: true },
  ): Promise<void> {
    if (disposed) return inFlight;
    clearTimer();
    if (disposeOptions.flush !== false) {
      try {
        await flush();
      } catch {
        // The caller already received onError; keep teardown non-throwing.
      }
    }
    disposed = true;
    await inFlight;
  }

  return {
    schedule,
    flush,
    retry: flush,
    hasPending: () => pendingSet,
    dispose,
  };
}
