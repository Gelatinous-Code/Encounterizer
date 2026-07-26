'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { IndexedDbNoteDocumentStore } from '@/lib/notes-indexeddb';
import { BrowserNoteCommitNotifier } from '@/lib/notes-notifications';
import {
  NoteStorageError,
  SERVER_NOTE_LIBRARY_SNAPSHOT,
  createNoteLibraryRepository,
  type NoteLibraryRepository,
  type NoteLibrarySnapshot,
  type NoteWriteResult,
} from '@/lib/notes-repository';
import type { NoteLibrary } from '@/lib/notes';

let browserRepository: NoteLibraryRepository | null = null;

function noopSubscribe(): () => void {
  return () => undefined;
}

function serverSnapshot(): NoteLibrarySnapshot {
  return SERVER_NOTE_LIBRARY_SNAPSHOT;
}

export function getBrowserNoteLibraryRepository(): NoteLibraryRepository | null {
  if (typeof window === 'undefined') return null;
  if (!browserRepository) {
    browserRepository = createNoteLibraryRepository({
      store: new IndexedDbNoteDocumentStore(),
      notifier: new BrowserNoteCommitNotifier(window),
    });
  }
  return browserRepository;
}

function unavailableResult(): NoteWriteResult {
  return {
    ok: false,
    error: new NoteStorageError(
      'unavailable',
      'Notes can only be saved in the browser.',
    ),
  };
}

export interface NotesLibraryApi extends NoteLibrarySnapshot {
  updateNotes: (
    transform: (current: NoteLibrary) => NoteLibrary,
  ) => Promise<NoteWriteResult>;
  replaceNotes: (next: NoteLibrary) => Promise<NoteWriteResult>;
  refreshNotes: () => Promise<void>;
  retryNoteStorage: () => Promise<void>;
}

export function useNotesLibrary(): NotesLibraryApi {
  const repository = getBrowserNoteLibraryRepository();
  const snapshot = useSyncExternalStore(
    repository?.subscribe ?? noopSubscribe,
    repository?.getSnapshot ?? serverSnapshot,
    serverSnapshot,
  );

  useEffect(() => {
    if (repository) void repository.initialize();
  }, [repository]);

  const updateNotes = useCallback(
    (transform: (current: NoteLibrary) => NoteLibrary) => repository
      ? repository.update(transform)
      : Promise.resolve(unavailableResult()),
    [repository],
  );
  const replaceNotes = useCallback(
    (next: NoteLibrary) => repository
      ? repository.replace(next)
      : Promise.resolve(unavailableResult()),
    [repository],
  );
  const refreshNotes = useCallback(
    () => repository?.refresh() ?? Promise.resolve(),
    [repository],
  );
  const retryNoteStorage = useCallback(
    () => repository?.retry() ?? Promise.resolve(),
    [repository],
  );

  return {
    ...snapshot,
    updateNotes,
    replaceNotes,
    refreshNotes,
    retryNoteStorage,
  };
}
