import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  IndexedDbNoteDocumentStore,
  NOTE_DATABASE_NAME,
  NOTE_DATABASE_VERSION,
  NOTE_DOCUMENT_STORE,
} from '@/lib/notes-indexeddb';

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(NOTE_DATABASE_NAME, NOTE_DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('IndexedDbNoteDocumentStore', () => {
  it('shares the game-data document store and preserves notes across reopen', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbNoteDocumentStore(factory);
    const document = { version: 1, revision: 1, notes: [], quarantine: [] };

    expect(await first.read()).toBeUndefined();
    expect(await first.transact(() => document)).toEqual(document);

    const database = await openDatabase(factory);
    expect(database.objectStoreNames.contains(NOTE_DOCUMENT_STORE)).toBe(true);
    database.close();
    first.close();

    const reopened = new IndexedDbNoteDocumentStore(factory);
    expect(await reopened.read()).toEqual(document);
    reopened.close();
  });

  it('aborts a throwing transform without replacing committed notes', async () => {
    const store = new IndexedDbNoteDocumentStore(new IDBFactory());
    const original = { version: 1, revision: 4, notes: [], quarantine: [] };
    await store.transact(() => original);

    await expect(store.transact(() => {
      throw new Error('invalid future document');
    })).rejects.toThrow('invalid future document');
    expect(await store.read()).toEqual(original);
    store.close();
  });

  it('serializes concurrent note transforms across connections', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbNoteDocumentStore(factory);
    const second = new IndexedDbNoteDocumentStore(factory);
    await first.transact(() => ({ count: 0, changes: [] as string[] }));

    await Promise.all([
      first.transact((current) => {
        const value = current as { count: number; changes: string[] };
        return { count: value.count + 1, changes: [...value.changes, 'first'] };
      }),
      second.transact((current) => {
        const value = current as { count: number; changes: string[] };
        return { count: value.count + 1, changes: [...value.changes, 'second'] };
      }),
    ]);

    expect(await first.read()).toEqual({
      count: 2,
      changes: ['first', 'second'],
    });
    first.close();
    second.close();
  });
});
