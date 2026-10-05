import { createWorkspace } from '../server/seed.mjs';
import { InputError } from '../server/errors.mjs';
const MAX_WORKSPACE_BYTES = 1_500_000;
const encoder = new TextEncoder();
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
function encode64(bytes) { let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value); }

/** Request-scoped adapter. D1 compare-and-swap prevents lost updates between Workers. */
export class CloudStore {
  constructor(env, { clock = () => new Date() } = {}) {
    this.db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
    this.bucket = env.BUCKET; this.clock = clock; this.pendingShares = null;
  }
  owner(userId) { if (typeof userId !== 'string' || !userId || userId.length > 256) throw new Error('Verified identity required.'); return hash(userId); }
  empty() { const value = createWorkspace(this.clock().toISOString()); value.artifacts = []; value.plan.tasks = []; return value; }
  async pack(value, owner) {
    const stored = structuredClone(value);
    const space = stored.space;
    if (space?.backgroundImage) {
      const image = space.backgroundImage;
      const mime = image.slice(5, image.indexOf(';'));
      const key = `backgrounds/${owner}/${await hash(image)}`;
      const bytes = Uint8Array.from(atob(image.slice(image.indexOf(',') + 1)), c => c.charCodeAt(0));
      await this.bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
      delete space.backgroundImage;
      space._storedBackground = { key, mime };
    }
    const json = JSON.stringify(stored);
    if (encoder.encode(json).length > MAX_WORKSPACE_BYTES) throw new InputError('Your private preview storage is full. Export or remove older study items before saving more. Your existing work is unchanged.', 'STORAGE_FULL');
    return json;
  }
  async unpack(json, owner) {
    const value = JSON.parse(json);
    const ref = value.space?._storedBackground;
    if (ref) {
      if (!ref.key.startsWith(`backgrounds/${owner}/`)) throw new Error('Invalid artwork owner.');
      const object = await this.bucket.get(ref.key);
      if (!object) throw new Error('Saved artwork is temporarily unavailable.');
      value.space.backgroundImage = `data:${ref.mime};base64,${encode64(new Uint8Array(await object.arrayBuffer()))}`;
      delete value.space._storedBackground;
    }
    return value;
  }
  async load(owner) {
    const row = await this.db.prepare('SELECT revision, payload FROM workspaces WHERE owner = ?').bind(owner).first();
    return row ? { revision: row.revision, workspace: await this.unpack(row.payload, owner) } : { revision: 0, workspace: this.empty() };
  }
  async read(userId) { return (await this.load(await this.owner(userId))).workspace; }
  async transact(userId, mutate) {
    const owner = await this.owner(userId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { revision, workspace } = await this.load(owner);
      this.pendingShares = { owner, operations: [] };
      let value;
      try { value = await mutate(workspace); } catch (error) { this.pendingShares = null; throw error; }
      const operations = this.pendingShares.operations; this.pendingShares = null;
      workspace.updatedAt = this.clock().toISOString();
      const payload = await this.pack(workspace, owner), tag = crypto.randomUUID();
      const write = revision === 0
        ? this.db.prepare('INSERT INTO workspaces(owner, revision, write_tag, payload) VALUES (?, 1, ?, ?) ON CONFLICT(owner) DO NOTHING').bind(owner, tag, payload)
        : this.db.prepare('UPDATE workspaces SET revision = revision + 1, write_tag = ?, payload = ? WHERE owner = ? AND revision = ?').bind(tag, payload, owner, revision);
      const batch = [write];
      for (const op of operations) {
        if (op.kind === 'publish') {
          const snapshot = await this.pack(op.snapshot, owner);
          batch.push(this.db.prepare('INSERT INTO shares(id, owner, payload) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM workspaces WHERE owner = ? AND write_tag = ?)').bind(op.snapshot.id, owner, snapshot, owner, tag));
        } else batch.push(this.db.prepare('DELETE FROM shares WHERE id = ? AND owner = ? AND EXISTS (SELECT 1 FROM workspaces WHERE owner = ? AND write_tag = ?)').bind(op.id, owner, owner, tag));
      }
      const results = await this.db.batch(batch);
      if (results[0].meta.changes === 1) return { workspace: structuredClone(workspace), ...value };
    }
    throw new InputError('Your nook changed in another session. Please try saving again.', 'CONFLICT');
  }
  async publishShare(userId, snapshot) {
    const owner = await this.owner(userId);
    if (this.pendingShares?.owner !== owner) throw new Error('Share requires an account transaction.');
    this.pendingShares.operations.push({ kind: 'publish', snapshot });
  }
  async revokeShare(userId, id) {
    const owner = await this.owner(userId);
    if (this.pendingShares?.owner !== owner) throw new Error('Share requires an account transaction.');
    const found = await this.db.prepare('SELECT id FROM shares WHERE id = ? AND owner = ?').bind(id, owner).first();
    if (!found) return false;
    this.pendingShares.operations.push({ kind: 'revoke', id }); return true;
  }
  async readShare(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
    const record = await this.db.prepare('SELECT owner, payload FROM shares WHERE id = ?').bind(id).first();
    return record ? this.unpack(record.payload, record.owner) : null;
  }
}
