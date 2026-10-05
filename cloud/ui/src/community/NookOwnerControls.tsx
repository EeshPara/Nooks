import { useEffect, useState } from 'react';
import type { LiveInvite, LiveInvitePage, LiveNook, LiveNooksState } from './useLiveNooks';

/** Owner controls use server-confirmed results; invitation secrets are never listed. */
export function NookOwnerControls({ live, nook, onInvite, onArchived }: { live: LiveNooksState; nook: LiveNook; onInvite: (invite: LiveInvite) => void; onArchived: () => void }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<LiveInvitePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true; setLoading(true); setPage(null); setError('');
    void live.listInvites(nook.id, offset).then(result => {
      if (current) setPage(result);
    }).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'Invitations could not load.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [nook.id, offset, revision, live.listInvites]);
  const act = async (work: () => Promise<void>) => {
    setError(''); try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your change could not be saved.'); }
  };
  return <div className="nooks-live-manage">
    <h3>Manage {nook.title}</h3>
    <p>Control invitations and access to your nook.</p>
    {error && <div className="nooks-live-error" role="alert"><span>{error}</span><button type="button" disabled={live.busy || loading} onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
    <div className="nooks-live-actions"><button type="button" disabled={live.busy || loading} onClick={() => void act(async () => onInvite(await live.createInvite(nook.id)))}>Create invitation</button></div>
    <h4>Invitations</h4>
    {loading ? <p role="status">Loading invitations…</p> : !page?.invites.length ? <p>No invitations yet.</p> : <ul className="nooks-live-invites">{page.invites.map((invite, index) => {
      const expired = Date.parse(invite.expiresAt) <= Date.now();
      const used = invite.uses >= invite.maxUses;
      const status = invite.revokedAt ? 'Revoked' : used ? 'Used' : expired ? 'Expired' : 'Active';
      return <li key={invite.id}><div><strong>Invitation {offset + index + 1}</strong><small>{status} · {invite.uses}/{invite.maxUses} used</small><small>{expired ? 'Expired' : 'Expires'} {new Date(invite.expiresAt).toLocaleString()}</small></div>
        {status === 'Active' && <button type="button" disabled={live.busy} onClick={() => void act(async () => { await live.revokeInvite(nook.id, invite.id); setRevision(value => value + 1); })}>Revoke<span className="sr-only"> invitation {offset + index + 1}</span></button>}
      </li>;
    })}</ul>}
    {(offset > 0 || page?.hasMore) && <div className="nooks-live-pagination" aria-label="Invitation pages"><button type="button" disabled={loading || live.busy || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</button><span>Page {offset / 50 + 1}</span><button type="button" disabled={loading || live.busy || !page?.hasMore} onClick={() => setOffset(page?.nextOffset ?? offset)}>Next</button></div>}
    <section className="nooks-live-archive"><h4>Archive this nook</h4><p>Close it to everyone and remove it from discovery. Members keep their notes and earned history. Personal timers continue; community focus credit stops.</p>
      {confirmArchive ? <div role="group" aria-label="Confirm archive"><p>Archive “{nook.title}” for all members?</p><div className="nooks-live-actions"><button type="button" disabled={live.busy} onClick={() => setConfirmArchive(false)}>Keep nook open</button><button type="button" className="nooks-live-danger" disabled={live.busy} onClick={() => void act(async () => { await live.archive(nook.id); onArchived(); })}>Confirm archive</button></div></div> : <div className="nooks-live-actions"><button type="button" disabled={live.busy || loading} onClick={() => setConfirmArchive(true)}>Archive nook…</button></div>}
    </section>
  </div>;
}
