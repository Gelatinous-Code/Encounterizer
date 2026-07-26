import {
  NoteStorageError,
  type NoteDocumentStore,
} from './notes-repository';

export const NOTE_DATABASE_NAME = 'encounterizer';
export const NOTE_DATABASE_VERSION = 1;
export const NOTE_DOCUMENT_STORE = 'documents';
export const NOTE_DOCUMENT_KEY = 'notes-library';

function unavailable(): NoteStorageError {
  return new NoteStorageError(
    'unavailable',
    'Notes cannot be saved because IndexedDB is unavailable in this browser.',
  );
}

/** Native IndexedDB adapter; browser access is delayed until a method call. */
export class IndexedDbNoteDocumentStore implements NoteDocumentStore {
  private connection: Promise<IDBDatabase> | null = null;

  constructor(private readonly providedFactory?: IDBFactory) {}

  private factory(): IDBFactory {
    const factory = this.providedFactory
      ?? (typeof window !== 'undefined' ? window.indexedDB : undefined);
    if (!factory) throw unavailable();
    return factory;
  }

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise<IDBDatabase>((resolve, reject) => {
      let rejected = false;
      let request: IDBOpenDBRequest;
      try {
        request = this.factory().open(NOTE_DATABASE_NAME, NOTE_DATABASE_VERSION);
      } catch (error) {
        rejected = true;
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(NOTE_DOCUMENT_STORE)) {
          database.createObjectStore(NOTE_DOCUMENT_STORE);
        }
      };
      request.onblocked = () => {
        rejected = true;
        reject(new NoteStorageError(
          'blocked',
          'Notes storage is blocked by another open Encounterizer tab.',
        ));
      };
      request.onerror = () => {
        rejected = true;
        reject(request.error ?? unavailable());
      };
      request.onsuccess = () => {
        if (rejected) {
          request.result.close();
          return;
        }
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.connection = null;
        };
        resolve(database);
      };
    }).catch((error) => {
      this.connection = null;
      throw error;
    });
    return this.connection;
  }

  async read(): Promise<unknown | undefined> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let value: unknown | undefined;
      let settled = false;
      const transaction = database.transaction(NOTE_DOCUMENT_STORE, 'readonly');
      const request = transaction.objectStore(NOTE_DOCUMENT_STORE).get(NOTE_DOCUMENT_KEY);
      request.onsuccess = () => {
        value = request.result as unknown | undefined;
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error ?? new NoteStorageError(
          'unknown',
          'The Notes Library could not be read.',
        ));
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      transaction.onabort = () => {
        if (settled) return;
        settled = true;
        reject(transaction.error ?? new DOMException('Notes read aborted.', 'AbortError'));
      };
    });
  }

  async transact(transform: (current: unknown | undefined) => unknown): Promise<unknown> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let result: unknown;
      let transformError: unknown;
      let settled = false;
      const transaction = database.transaction(NOTE_DOCUMENT_STORE, 'readwrite');
      const store = transaction.objectStore(NOTE_DOCUMENT_STORE);
      const request = store.get(NOTE_DOCUMENT_KEY);
      request.onsuccess = () => {
        const current = request.result as unknown | undefined;
        try {
          result = transform(current);
          if (result !== current) store.put(result, NOTE_DOCUMENT_KEY);
        } catch (error) {
          transformError = error;
          transaction.abort();
        }
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error ?? new NoteStorageError(
          'unknown',
          'The Notes Library transaction could not start.',
        ));
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onabort = () => {
        if (settled) return;
        settled = true;
        reject(
          transformError
          ?? transaction.error
          ?? new DOMException('Notes transaction aborted.', 'AbortError'),
        );
      };
    });
  }

  close(): void {
    if (!this.connection) return;
    void this.connection.then((database) => database.close(), () => undefined);
    this.connection = null;
  }
}
