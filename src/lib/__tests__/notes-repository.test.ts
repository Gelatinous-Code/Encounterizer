import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createNote, type NoteIdFactory, type NoteLibrary } from '@/lib/notes';
import { IndexedDbNoteDocumentStore } from '@/lib/notes-indexeddb';
import {
  createNoteLibraryRepository,
  type NoteCommitNotifier,
  type NoteDocumentStore,
} from '@/lib/notes-repository';

class RecordingNotifier implements NoteCommitNotifier {
  readonly published: number[] = [];
  private readonly listeners = new Set<(revision: number) => void>();

  subscribe(listener: (revision: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(revision: number): void {
    this.published.push(revision);
  }

  signal(revision: number): void {
    for (const listener of this.listeners) listener(revision);
  }

  close(): void {
    this.listeners.clear();
  }
}

class NotifierHub {
  private readonly listeners = new Set<(revision: number) => void>();

  create(): NoteCommitNotifier {
    let ownListener: ((revision: number) => void) | null = null;
    return {
      subscribe: (listener) => {
        ownListener = listener;
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      publish: (revision) => {
        for (const listener of this.listeners) {
          if (listener !== ownListener) listener(revision);
        }
      },
      close: () => {
        if (ownListener) this.listeners.delete(ownListener);
      },
    };
  }
}

class FailNextStore implements NoteDocumentStore {
  failNext = false;

  constructor(private readonly inner: NoteDocumentStore) {}

  read(): Promise<unknown | undefined> {
    return this.inner.read();
  }

  transact(transform: (current: unknown | undefined) => unknown): Promise<unknown> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new DOMException('full', 'QuotaExceededError'));
    }
    return this.inner.transact(transform);
  }

  close(): void {
    this.inner.close();
  }
}

function ids(namespace: string): NoteIdFactory {
  let next = 0;
  return (kind) => `${namespace}-${kind}-${++next}`;
}

describe('NoteLibraryRepository', () => {
  it('creates one durable empty Notes Library', async () => {
    const factory = new IDBFactory();
    const notifier = new RecordingNotifier();
    const repository = createNoteLibraryRepository({
      store: new IndexedDbNoteDocumentStore(factory),
      notifier,
      now: () => 100,
      createId: ids('create'),
    });

    await repository.initialize();
    expect(repository.getSnapshot()).toMatchObject({
      library: { version: 1, revision: 1, notes: [], quarantine: [] },
      status: 'saved',
      hydrated: true,
      dirty: false,
      lastSavedAt: 100,
    });
    expect(notifier.published).toEqual([1]);
    repository.close();
  });

  it('commits isolation of an invalid record without losing its bytes', async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbNoteDocumentStore(factory);
    await store.transact(() => ({
      version: 1,
      revision: 4,
      notes: [{
        id: 'broken',
        kind: 'future-kind',
        custom: { keep: true },
      }],
    }));
    const repository = createNoteLibraryRepository({
      store,
      notifier: new RecordingNotifier(),
      now: () => 200,
      createId: ids('isolate'),
    });

    await repository.initialize();
    expect(repository.getSnapshot()).toMatchObject({
      library: {
        revision: 5,
        notes: [],
        quarantine: [{
          raw: {
            id: 'broken',
            kind: 'future-kind',
            custom: { keep: true },
          },
        }],
      },
      warnings: [expect.stringMatching(/Isolated 1 invalid note record/)],
    });
    repository.close();
  });

  it('preserves concurrent transforms through transactional updates', async () => {
    const factory = new IDBFactory();
    const first = createNoteLibraryRepository({
      store: new IndexedDbNoteDocumentStore(factory),
      notifier: new RecordingNotifier(),
      now: () => 300,
      createId: ids('first'),
    });
    const second = createNoteLibraryRepository({
      store: new IndexedDbNoteDocumentStore(factory),
      notifier: new RecordingNotifier(),
      now: () => 301,
      createId: ids('second'),
    });
    await Promise.all([first.initialize(), second.initialize()]);

    await Promise.all([
      first.update((current) => ({
        ...current,
        notes: [...current.notes, createNote({
          kind: 'scratchpad',
          title: 'First',
          order: current.notes.length,
        }, { id: 'note-first', now: 300 })],
      })),
      second.update((current) => ({
        ...current,
        notes: [...current.notes, createNote({
          kind: 'sticky',
          title: 'Second',
          order: current.notes.length,
        }, { id: 'note-second', now: 301 })],
      })),
    ]);

    const reader = new IndexedDbNoteDocumentStore(factory);
    const committed = await reader.read() as NoteLibrary;
    expect(committed.revision).toBe(3);
    expect(committed.notes.map((note) => note.id)).toEqual([
      'note-first',
      'note-second',
    ]);
    reader.close();
    first.close();
    second.close();
  });

  it('keeps a failed optimistic edit and commits it on retry', async () => {
    const inner = new IndexedDbNoteDocumentStore(new IDBFactory());
    const store = new FailNextStore(inner);
    const repository = createNoteLibraryRepository({
      store,
      notifier: new RecordingNotifier(),
      now: () => 400,
      createId: ids('retry'),
    });
    await repository.initialize();
    store.failNext = true;

    const result = await repository.update((current) => ({
      ...current,
      notes: [...current.notes, createNote({
        kind: 'scratchpad',
        body: 'Unsaved but recoverable',
      }, { id: 'note-retry', now: 400 })],
    }));

    expect(result).toMatchObject({ ok: false, queued: true });
    expect(repository.getSnapshot()).toMatchObject({
      library: { notes: [expect.objectContaining({ id: 'note-retry' })] },
      status: 'error',
      dirty: true,
      error: { code: 'quota' },
    });

    await repository.retry();
    expect(repository.getSnapshot()).toMatchObject({
      library: { notes: [expect.objectContaining({ id: 'note-retry' })] },
      status: 'saved',
      dirty: false,
    });
    expect((await inner.read() as NoteLibrary).notes[0].id).toBe('note-retry');
    repository.close();
  });

  it('reloads a committed note change through the cross-tab notifier', async () => {
    const factory = new IDBFactory();
    const hub = new NotifierHub();
    const first = createNoteLibraryRepository({
      store: new IndexedDbNoteDocumentStore(factory),
      notifier: hub.create(),
      createId: ids('first'),
    });
    const second = createNoteLibraryRepository({
      store: new IndexedDbNoteDocumentStore(factory),
      notifier: hub.create(),
      createId: ids('second'),
    });
    await Promise.all([first.initialize(), second.initialize()]);

    await first.update((current) => ({
      ...current,
      notes: [...current.notes, createNote({
        kind: 'sticky',
        title: 'Across tabs',
      }, { id: 'note-shared', now: 500 })],
    }));
    await second.refresh();

    expect(second.getSnapshot().library?.notes).toEqual([
      expect.objectContaining({ id: 'note-shared', title: 'Across tabs' }),
    ]);
    first.close();
    second.close();
  });

  it('refuses to overwrite a future-version document', async () => {
    const store = new IndexedDbNoteDocumentStore(new IDBFactory());
    const future = { version: 9, revision: 50, notes: [{ future: true }] };
    await store.transact(() => future);
    const repository = createNoteLibraryRepository({
      store,
      notifier: new RecordingNotifier(),
    });

    await repository.initialize();
    expect(repository.getSnapshot()).toMatchObject({
      library: null,
      status: 'error',
      error: { code: 'future-version' },
    });
    expect(await store.read()).toEqual(future);
    repository.close();
  });
});
