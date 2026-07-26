import {
  cloneNoteLibrary,
  createEmptyNoteLibrary,
  isNoteLibrary,
  parseNoteLibraryDocument,
  type NoteIdFactory,
  type NoteLibrary,
} from './notes';

export type NoteStorageErrorCode =
  | 'unavailable'
  | 'blocked'
  | 'quota'
  | 'invalid-document'
  | 'future-version'
  | 'aborted'
  | 'save-failed'
  | 'unknown';

export class NoteStorageError extends Error {
  constructor(
    public readonly code: NoteStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NoteStorageError';
  }
}

export interface NoteDocumentStore {
  read(): Promise<unknown | undefined>;
  /** Returning the exact current reference performs no write. */
  transact(transform: (current: unknown | undefined) => unknown): Promise<unknown>;
  close(): void;
}

export interface NoteCommitNotifier {
  subscribe(listener: (revision: number) => void): () => void;
  publish(revision: number): void;
  close(): void;
}

export type NoteRepositoryStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'error'
  | 'unavailable';

export interface NoteLibrarySnapshot {
  library: NoteLibrary | null;
  status: NoteRepositoryStatus;
  hydrated: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  error: NoteStorageError | null;
  warnings: readonly string[];
}

export interface NoteWriteResult {
  ok: boolean;
  error?: NoteStorageError;
  /** The valid optimistic change remains in memory and will be retried. */
  queued?: boolean;
}

export interface NoteLibraryRepositoryDependencies {
  store: NoteDocumentStore;
  notifier: NoteCommitNotifier;
  now?: () => number;
  createId?: NoteIdFactory;
}

export interface NoteLibraryRepository {
  getSnapshot(): NoteLibrarySnapshot;
  getServerSnapshot(): NoteLibrarySnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  update(transform: (current: NoteLibrary) => NoteLibrary): Promise<NoteWriteResult>;
  replace(next: NoteLibrary): Promise<NoteWriteResult>;
  refresh(): Promise<void>;
  retry(): Promise<void>;
  close(): void;
}

export const SERVER_NOTE_LIBRARY_SNAPSHOT: NoteLibrarySnapshot = Object.freeze({
  library: null,
  status: 'idle',
  hydrated: false,
  dirty: false,
  lastSavedAt: null,
  error: null,
  warnings: Object.freeze([]),
});

type NoteTransform = (current: NoteLibrary) => NoteLibrary;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function immutableLibrary(library: NoteLibrary): NoteLibrary {
  return deepFreeze(cloneNoteLibrary(library));
}

function documentError(
  result: Extract<ReturnType<typeof parseNoteLibraryDocument>, { ok: false }>,
): NoteStorageError {
  return new NoteStorageError(
    result.reason === 'future-version' ? 'future-version' : 'invalid-document',
    result.message,
  );
}

function normalizeError(
  error: unknown,
  fallbackCode: NoteStorageErrorCode,
): NoteStorageError {
  if (error instanceof NoteStorageError) return error;
  const name = typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name
    : error instanceof Error
      ? error.name
      : '';
  if (name === 'QuotaExceededError') {
    return new NoteStorageError(
      'quota',
      'Note changes were not saved because browser storage is full.',
      { cause: error },
    );
  }
  if (
    name === 'VersionError'
    || name === 'InvalidStateError'
    || name === 'NotSupportedError'
    || name === 'SecurityError'
  ) {
    return new NoteStorageError(
      'unavailable',
      'Notes cannot be saved because browser storage is unavailable.',
      { cause: error },
    );
  }
  if (name === 'AbortError') {
    return new NoteStorageError(
      'aborted',
      'The Notes Library save was interrupted before it committed.',
      { cause: error },
    );
  }
  if (name === 'BlockedError') {
    return new NoteStorageError(
      'blocked',
      'Notes storage is blocked by another open Encounterizer tab. Close the older tab and retry.',
      { cause: error },
    );
  }
  return new NoteStorageError(
    fallbackCode,
    error instanceof Error && error.message
      ? error.message
      : 'The Notes Library could not be saved in this browser.',
    { cause: error },
  );
}

function nextCommittedLibrary(library: NoteLibrary): NoteLibrary {
  if (!Number.isSafeInteger(library.revision) || library.revision < 0) {
    throw new NoteStorageError(
      'invalid-document',
      'The Notes Library revision is invalid and was left untouched.',
    );
  }
  if (library.revision >= Number.MAX_SAFE_INTEGER) {
    throw new NoteStorageError(
      'invalid-document',
      'The Notes Library revision cannot be increased safely and was left untouched.',
    );
  }
  return {
    ...cloneNoteLibrary(library),
    revision: library.revision + 1,
  };
}

function sameLibrary(left: NoteLibrary, right: NoteLibrary): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * Transactional local-first repository for durable notes. Every transform
 * runs against the latest IndexedDB value, preventing a stale render or tab
 * from replacing a newer note collection.
 */
export function createNoteLibraryRepository(
  dependencies: NoteLibraryRepositoryDependencies,
): NoteLibraryRepository {
  const now = dependencies.now ?? Date.now;
  const listeners = new Set<() => void>();
  let snapshot: NoteLibrarySnapshot = SERVER_NOTE_LIBRARY_SNAPSHOT;
  let committedLibrary: NoteLibrary | null = null;
  let pendingTransforms: NoteTransform[] = [];
  let initialization: Promise<void> | null = null;
  let operationQueue: Promise<void> = Promise.resolve();
  let writesBlocked = false;
  let closed = false;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setSnapshot(next: NoteLibrarySnapshot): void {
    snapshot = Object.freeze({
      ...next,
      warnings: Object.freeze([...next.warnings]),
    });
    emit();
  }

  function setFailure(
    error: NoteStorageError,
    options: { preserveLibrary?: boolean; blockWrites?: boolean } = {},
  ): void {
    if (options.blockWrites) writesBlocked = true;
    setSnapshot({
      ...snapshot,
      library: options.preserveLibrary ? snapshot.library : null,
      status: error.code === 'unavailable' ? 'unavailable' : 'error',
      hydrated: true,
      dirty: pendingTransforms.length > 0,
      error,
    });
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  function parseStored(value: unknown): {
    library: NoteLibrary;
    migrated: boolean;
    warnings: string[];
  } {
    const parsed = parseNoteLibraryDocument(value, {
      now: now(),
      createId: dependencies.createId,
    });
    if (!parsed.ok) throw documentError(parsed);
    return parsed;
  }

  function publishCommit(revision: number): void {
    try {
      dependencies.notifier.publish(revision);
    } catch {
      // The transaction already committed. Visibility refresh heals signals.
    }
  }

  function applyTransforms(
    library: NoteLibrary,
    transforms: readonly NoteTransform[],
  ): NoteLibrary {
    let candidate = cloneNoteLibrary(library);
    for (const transform of transforms) {
      candidate = transform(candidate);
      if (!isNoteLibrary(candidate)) {
        throw new NoteStorageError(
          'invalid-document',
          'The Notes Library change contains invalid fields and was not saved.',
        );
      }
      candidate = cloneNoteLibrary(candidate);
    }
    return candidate;
  }

  function derivePendingLibrary(base: NoteLibrary): NoteLibrary {
    return pendingTransforms.length > 0
      ? applyTransforms(base, pendingTransforms)
      : cloneNoteLibrary(base);
  }

  async function initializeNow(): Promise<void> {
    let committed = false;
    let migrationWarnings: string[] = [];
    try {
      const stored = await dependencies.store.transact((current) => {
        if (current === undefined) {
          committed = true;
          return nextCommittedLibrary(createEmptyNoteLibrary());
        }
        const parsed = parseStored(current);
        migrationWarnings = parsed.warnings;
        if (!parsed.migrated) return current;
        committed = true;
        return nextCommittedLibrary(parsed.library);
      });
      const parsed = parseStored(stored);
      const library = immutableLibrary(parsed.library);
      committedLibrary = library;
      writesBlocked = false;
      const visible = pendingTransforms.length > 0
        ? immutableLibrary(derivePendingLibrary(library))
        : library;
      setSnapshot({
        library: visible,
        status: pendingTransforms.length > 0 ? 'saving' : 'saved',
        hydrated: true,
        dirty: pendingTransforms.length > 0,
        lastSavedAt: committed ? now() : snapshot.lastSavedAt,
        error: null,
        warnings: migrationWarnings.length > 0 ? migrationWarnings : parsed.warnings,
      });
      if (committed) publishCommit(library.revision);
    } catch (error) {
      const normalized = normalizeError(error, 'unknown');
      setFailure(normalized, {
        blockWrites: normalized.code === 'future-version'
          || normalized.code === 'invalid-document',
      });
    }
  }

  function initialize(): Promise<void> {
    if (initialization) return initialization;
    setSnapshot({ ...snapshot, status: 'loading', error: null });
    initialization = enqueue(initializeNow);
    return initialization;
  }

  async function commitTransforms(
    transforms: readonly NoteTransform[],
  ): Promise<{ library: NoteLibrary; changed: boolean }> {
    let changed = false;
    const stored = await dependencies.store.transact((current) => {
      if (current === undefined) {
        throw new NoteStorageError(
          'invalid-document',
          'The Notes Library disappeared before this change could be committed.',
        );
      }
      const currentLibrary = parseStored(current).library;
      const candidate = applyTransforms(currentLibrary, transforms);
      if (sameLibrary(candidate, currentLibrary)) return current;
      changed = true;
      return nextCommittedLibrary({
        ...candidate,
        revision: currentLibrary.revision,
      });
    });
    const library = immutableLibrary(parseStored(stored).library);
    committedLibrary = library;
    if (changed) publishCommit(library.revision);
    return { library, changed };
  }

  async function update(transform: NoteTransform): Promise<NoteWriteResult> {
    await initialize();
    if (closed || writesBlocked || !snapshot.library) {
      return {
        ok: false,
        error: snapshot.error ?? new NoteStorageError(
          'unavailable',
          'The Notes Library is not available for editing.',
        ),
      };
    }

    let optimistic: NoteLibrary;
    try {
      optimistic = immutableLibrary(applyTransforms(snapshot.library, [transform]));
    } catch (error) {
      return { ok: false, error: normalizeError(error, 'invalid-document') };
    }

    return enqueue(async () => {
      const transforms = [...pendingTransforms, transform];
      try {
        const visibleBase = snapshot.library ?? committedLibrary;
        if (!visibleBase) {
          throw new NoteStorageError(
            'unavailable',
            'The Notes Library is not available for editing.',
          );
        }
        optimistic = immutableLibrary(applyTransforms(visibleBase, [transform]));
      } catch (error) {
        return { ok: false, error: normalizeError(error, 'invalid-document') };
      }
      setSnapshot({
        ...snapshot,
        library: optimistic,
        status: 'saving',
        dirty: pendingTransforms.length > 0,
        error: null,
      });
      try {
        const { library } = await commitTransforms(transforms);
        pendingTransforms = pendingTransforms.slice(transforms.length - 1);
        const visible = pendingTransforms.length > 0
          ? immutableLibrary(derivePendingLibrary(library))
          : library;
        setSnapshot({
          library: visible,
          status: pendingTransforms.length > 0 ? 'saving' : 'saved',
          hydrated: true,
          dirty: pendingTransforms.length > 0,
          lastSavedAt: now(),
          error: null,
          warnings: snapshot.warnings,
        });
        return { ok: true };
      } catch (error) {
        const normalized = normalizeError(error, 'save-failed');
        if (
          normalized.code === 'future-version'
          || normalized.code === 'invalid-document'
        ) writesBlocked = true;
        pendingTransforms.push(transform);
        setSnapshot({
          ...snapshot,
          library: optimistic,
          status: normalized.code === 'unavailable' ? 'unavailable' : 'error',
          hydrated: true,
          dirty: true,
          error: normalized,
        });
        return { ok: false, error: normalized, queued: true };
      }
    });
  }

  async function replace(next: NoteLibrary): Promise<NoteWriteResult> {
    if (!isNoteLibrary(next)) {
      return {
        ok: false,
        error: new NoteStorageError(
          'invalid-document',
          'The replacement Notes Library contains invalid fields and was not applied.',
        ),
      };
    }
    await initialize();
    if (closed || pendingTransforms.length > 0) {
      return {
        ok: false,
        error: new NoteStorageError(
          closed ? 'unavailable' : 'save-failed',
          closed
            ? 'The Notes Library store is no longer available.'
            : 'Retry pending note changes before replacing the Notes Library.',
        ),
      };
    }
    return enqueue(async () => {
      setSnapshot({ ...snapshot, status: 'saving', error: null });
      try {
        const stored = await dependencies.store.transact((current) => {
          const revision = current === undefined
            ? 0
            : parseStored(current).library.revision;
          return nextCommittedLibrary({
            ...cloneNoteLibrary(next),
            revision,
          });
        });
        const library = immutableLibrary(parseStored(stored).library);
        committedLibrary = library;
        writesBlocked = false;
        setSnapshot({
          library,
          status: 'saved',
          hydrated: true,
          dirty: false,
          lastSavedAt: now(),
          error: null,
          warnings: snapshot.warnings,
        });
        publishCommit(library.revision);
        return { ok: true };
      } catch (error) {
        const normalized = normalizeError(error, 'save-failed');
        setSnapshot({
          ...snapshot,
          status: normalized.code === 'unavailable' ? 'unavailable' : 'error',
          error: normalized,
        });
        return { ok: false, error: normalized };
      }
    });
  }

  async function refreshNow(): Promise<void> {
    let migrated = false;
    let warnings: string[] = [];
    try {
      const stored = await dependencies.store.transact((current) => {
        if (current === undefined) {
          throw new NoteStorageError(
            'invalid-document',
            'The saved Notes Library is missing. Nothing was overwritten.',
          );
        }
        const parsed = parseStored(current);
        warnings = parsed.warnings;
        if (!parsed.migrated) return current;
        migrated = true;
        return nextCommittedLibrary(parsed.library);
      });
      const committed = immutableLibrary(parseStored(stored).library);
      committedLibrary = committed;
      const library = immutableLibrary(derivePendingLibrary(committed));
      writesBlocked = false;
      setSnapshot({
        ...snapshot,
        library,
        status: pendingTransforms.length > 0 ? snapshot.status : 'saved',
        hydrated: true,
        dirty: pendingTransforms.length > 0,
        error: pendingTransforms.length > 0 ? snapshot.error : null,
        warnings,
      });
      if (migrated) publishCommit(committed.revision);
    } catch (error) {
      const normalized = normalizeError(error, 'unknown');
      setFailure(normalized, {
        preserveLibrary: true,
        blockWrites: normalized.code === 'future-version'
          || normalized.code === 'invalid-document',
      });
    }
  }

  async function refresh(): Promise<void> {
    await initialize();
    await enqueue(refreshNow);
  }

  async function retryPending(): Promise<void> {
    if (pendingTransforms.length === 0) return;
    const transforms = [...pendingTransforms];
    setSnapshot({ ...snapshot, status: 'saving', error: null });
    try {
      const { library } = await commitTransforms(transforms);
      pendingTransforms = pendingTransforms.slice(transforms.length);
      const visible = pendingTransforms.length > 0
        ? immutableLibrary(derivePendingLibrary(library))
        : library;
      setSnapshot({
        library: visible,
        status: pendingTransforms.length > 0 ? 'saving' : 'saved',
        hydrated: true,
        dirty: pendingTransforms.length > 0,
        lastSavedAt: now(),
        error: null,
        warnings: snapshot.warnings,
      });
    } catch (error) {
      const normalized = normalizeError(error, 'save-failed');
      if (
        normalized.code === 'future-version'
        || normalized.code === 'invalid-document'
      ) writesBlocked = true;
      const base = committedLibrary ?? snapshot.library;
      setSnapshot({
        ...snapshot,
        library: base ? immutableLibrary(derivePendingLibrary(base)) : snapshot.library,
        status: normalized.code === 'unavailable' ? 'unavailable' : 'error',
        dirty: true,
        error: normalized,
      });
    }
  }

  async function retry(): Promise<void> {
    if (pendingTransforms.length > 0 && !writesBlocked) {
      do {
        const before = pendingTransforms.length;
        await enqueue(retryPending);
        if (
          pendingTransforms.length >= before
          || snapshot.status === 'error'
          || snapshot.status === 'unavailable'
        ) break;
      } while (pendingTransforms.length > 0 && !writesBlocked);
      return;
    }
    initialization = null;
    writesBlocked = false;
    await initialize();
    if (pendingTransforms.length > 0 && !writesBlocked && snapshot.library) {
      await retry();
    }
  }

  const unsubscribeNotifier = dependencies.notifier.subscribe((revision) => {
    if (!Number.isSafeInteger(revision) || revision < 0 || closed) return;
    void enqueue(refreshNow);
  });

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_NOTE_LIBRARY_SNAPSHOT,
    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    update,
    replace,
    refresh,
    retry,
    close() {
      if (closed) return;
      closed = true;
      unsubscribeNotifier();
      listeners.clear();
      dependencies.notifier.close();
      dependencies.store.close();
    },
  };
}
