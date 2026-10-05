import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createWorkspace } from './seed.mjs';

/** One process serializes per-account transactions; each account has its own file. */
export class WorkspaceStore {
  constructor(directory, { clock = () => new Date(), seeded = true } = {}) {
    this.directory = directory;
    this.clock = clock;
    this.seeded = seeded;
    this.pending = new Map();
  }
  file(userId) {
    if (typeof userId !== 'string' || !userId || userId.length > 256) throw new Error('Verified account identity required.');
    return join(this.directory, createHash('sha256').update(userId).digest('hex') + '.json');
  }
  async load(userId) {
    try {
      const value = JSON.parse(await readFile(this.file(userId), 'utf8'));
      if (value.version !== 1 || !Array.isArray(value.artifacts)) throw new Error('Unsupported or corrupted workspace.');
      value.revision ??= 0;
      if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Unsupported or corrupted workspace revision.');
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const value = createWorkspace(this.clock().toISOString());
      value.revision = 0;
      if (!this.seeded) { value.artifacts = []; value.plan.tasks = []; }
      return value;
    }
  }
  async read(userId) {
    await this.pending.get(userId)?.catch(() => {});
    return structuredClone(await this.load(userId));
  }
  async transact(userId, mutate) {
    const predecessor = this.pending.get(userId) ?? Promise.resolve();
    const operation = predecessor.catch(() => {}).then(async () => {
      const workspace = await this.load(userId);
      const revision = workspace.revision;
      if (revision >= Number.MAX_SAFE_INTEGER) throw new Error('Workspace revision limit reached.');
      const value = await mutate(workspace);
      // Mutation inputs cannot select the revision used to order committed snapshots.
      workspace.revision = revision + 1;
      workspace.updatedAt = this.clock().toISOString();
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const destination = this.file(userId);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(workspace), { mode: 0o600, flag: 'wx' });
        await rename(temporary, destination);
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      return { ...value, workspace: structuredClone(workspace) };
    });
    this.pending.set(userId, operation);
    try { return await operation; }
    finally { if (this.pending.get(userId) === operation) this.pending.delete(userId); }
  }
  sharedFile(shareId) {
    if (typeof shareId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(shareId)) throw new Error('Invalid share identifier.');
    return join(this.directory, 'shared', shareId + '.json');
  }
  async publishShare(userId, snapshot) {
    const directory = join(this.directory, 'shared');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(this.sharedFile(snapshot.id), JSON.stringify({ ownerHash: createHash('sha256').update(userId).digest('hex'), snapshot }), { mode: 0o600, flag: 'wx' });
  }
  async readShare(shareId) {
    try { return JSON.parse(await readFile(this.sharedFile(shareId), 'utf8')).snapshot; }
    catch (error) { if (error.code === 'ENOENT' || error.message === 'Invalid share identifier.') return null; throw error; }
  }
  async revokeShare(userId, shareId) {
    let record;
    try { record = JSON.parse(await readFile(this.sharedFile(shareId), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' || error.message === 'Invalid share identifier.') return false; throw error; }
    if (record.ownerHash !== createHash('sha256').update(userId).digest('hex')) return false;
    await unlink(this.sharedFile(shareId)); return true;
  }
}
