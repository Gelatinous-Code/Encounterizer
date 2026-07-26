import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedNoteWriter } from '@/lib/notes-autosave';

afterEach(() => {
  vi.useRealTimers();
});

describe('debounced note writer', () => {
  it('saves only the latest draft after the debounce window', async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const writer = createDebouncedNoteWriter<string>({
      delayMs: 500,
      save: async (value) => {
        saved.push(value);
      },
    });

    writer.schedule('first');
    await vi.advanceTimersByTimeAsync(300);
    writer.schedule('latest');
    await vi.advanceTimersByTimeAsync(499);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(['latest']);
  });

  it('flushes the final draft before the debounce window', async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const writer = createDebouncedNoteWriter<string>({
      delayMs: 500,
      save: async (value) => {
        saved.push(value);
      },
    });

    writer.schedule('pagehide draft');
    await writer.flush();
    await vi.runAllTimersAsync();
    expect(saved).toEqual(['pagehide draft']);
    expect(writer.hasPending()).toBe(false);
  });

  it('retains a failed draft and retries it without user re-entry', async () => {
    let attempts = 0;
    const errors: unknown[] = [];
    const writer = createDebouncedNoteWriter<string>({
      save: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('quota');
      },
      onError: (error) => errors.push(error),
    });

    writer.schedule('recover me');
    await expect(writer.flush()).rejects.toThrow('quota');
    expect(writer.hasPending()).toBe(true);
    await writer.retry();
    expect(attempts).toBe(2);
    expect(errors).toHaveLength(1);
    expect(writer.hasPending()).toBe(false);
  });

  it('flushes a scheduled edit during disposal', async () => {
    const saved: string[] = [];
    const writer = createDebouncedNoteWriter<string>({
      save: async (value) => {
        saved.push(value);
      },
    });
    writer.schedule('last edit');
    await writer.dispose();
    expect(saved).toEqual(['last edit']);
  });
});
