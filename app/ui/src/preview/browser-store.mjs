import { createWorkspace } from '../../../server/seed.mjs';
import { InputError } from '../../../server/errors.mjs';

const DATABASE = 'nooks-browser-preview-v1';
const TABLE = 'private-workspace';
const KEY = 'workspace';
const MAX_BYTES = 24 * 1024 * 1024;

function storageError(error) {
  if (error instanceof InputError) return error;
  if (error?.name === 'QuotaExceededError') return new InputError('This browser’s storage is full. Your earlier saved work is unchanged. Export or remove older material, then retry.', 'STORAGE_FULL');
  return new InputError('This browser could not save your nook. Your earlier saved work is unchanged. Keep this page open and retry, or allow browser storage.', 'STORAGE_UNAVAILABLE');
}

function validate(workspace) {
  if (!workspace || workspace.version !== 1 || !Number.isSafeInteger(workspace.revision) || workspace.revision < 0 || !Array.isArray(workspace.artifacts) || !Array.isArray(workspace.progress) || !Array.isArray(workspace.focusSessions) || !workspace.plan || !Array.isArray(workspace.plan.tasks)) throw new InputError('The saved browser workspace could not be read safely. Existing data has not been reset.', 'STORAGE_INVALID');
  return workspace;
}

/** Browser-only preview storage. It never imports local files or contacts an API. */
export class BrowserPreviewStore {
  constructor({ indexedDB = globalThis.indexedDB, database = DATABASE, clock = () => new Date() } = {}) {
    this.factory = indexedDB;
    this.database = database;
    this.clock = clock;
    this.connection = null;
    this.pending = Promise.resolve();
  }

  open() {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      if (!this.factory) { reject(new InputError('Browser storage is unavailable. Allow storage for this site to save your work.', 'STORAGE_UNAVAILABLE')); return; }
      let settled = false;
      const fail = error => { if (!settled) { settled = true; clearTimeout(timeout); reject(storageError(error)); } };
      const timeout = setTimeout(() => fail(new Error('Storage open timed out')), 8000);
      let request;
      try { request = this.factory.open(this.database, 1); } catch (error) { fail(error); return; }
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(TABLE)) request.result.createObjectStore(TABLE); };
      request.onblocked = () => fail(new Error('Close older tabs before opening this workspace'));
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true; clearTimeout(timeout);
        const database = request.result;
        database.onversionchange = () => { database.close(); this.connection = null; };
        resolve(database);
      };
    }).catch(error => { this.connection = null; throw error; });
    return this.connection;
  }

  empty() {
    // Only authored sample material is seeded, never the developer's preview data.
    return { ...createWorkspace(this.clock().toISOString()), revision: 0, backend: 'browser-preview' };
  }

  async load() {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let transaction;
      try { transaction = database.transaction(TABLE, 'readonly'); } catch (error) { reject(storageError(error)); return; }
      const request = transaction.objectStore(TABLE).get(KEY);
      transaction.onabort = () => reject(storageError(transaction.error ?? request.error));
      transaction.onerror = () => {};
      transaction.oncomplete = () => {
        try { resolve(request.result === undefined ? this.empty() : validate(request.result)); }
        catch (error) { reject(error); }
      };
    });
  }

  async read() {
    await this.pending.catch(() => {});
    return structuredClone(await this.load());
  }

  async commit(expectedRevision, workspace) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let transaction;
      try { transaction = database.transaction(TABLE, 'readwrite'); } catch (error) { reject(storageError(error)); return; }
      let written = false;
      let failure;
      const table = transaction.objectStore(TABLE);
      const request = table.get(KEY);
      // The read and conditional write share one native transaction. IndexedDB
      // serializes these across tabs; asynchronous engine work happens beforehand.
      request.onsuccess = () => {
        try {
          const current = request.result === undefined ? 0 : validate(request.result).revision;
          if (current !== expectedRevision) return;
          table.put(workspace, KEY);
          written = true;
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(written);
      transaction.onerror = () => {};
      transaction.onabort = () => reject(storageError(failure ?? transaction.error ?? request.error));
    });
  }

  transact(_browserIdentity, mutate) {
    const operation = this.pending.catch(() => {}).then(async () => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const workspace = await this.load();
        const revision = workspace.revision;
        if (revision >= Number.MAX_SAFE_INTEGER) throw new InputError('The browser workspace has reached its revision limit.', 'STORAGE_FULL');
        const result = await mutate(workspace);
        workspace.revision = revision + 1;
        workspace.updatedAt = this.clock().toISOString();
        workspace.backend = 'browser-preview';
        if (new TextEncoder().encode(JSON.stringify(workspace)).length > MAX_BYTES) throw new InputError('This preview workspace is full. Export or remove older material before saving more. Your earlier saved work is unchanged.', 'STORAGE_FULL');
        if (await this.commit(revision, workspace)) return { ...result, workspace: structuredClone(workspace) };
        // A concurrent tab committed first. Re-run validation on its fresh state;
        // artifact expectedRevision checks reject stale edits instead of overwriting.
      }
      throw new InputError('Your nook changed in another tab. Review the saved version before retrying.', 'REVISION_CONFLICT');
    });
    this.pending = operation.then(() => {}, () => {});
    return operation;
  }
}
