import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, X } from 'lucide-react';
import { nooksAccount } from './client';
import { useNooksAccount } from './useNooksAccount';
import { useBackdropDismiss } from '../world/useBackdropDismiss';
import { useSoftDismiss } from '../world/useSoftDismiss';
import './account.css';

export function AccountButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
 const account = useNooksAccount();
 const label = account.status === 'signed-in' ? 'Your account' : account.status === 'expired' ? 'Reconnect account' : 'Save to account';
 return <button type="button" className={`nooks-account-button${compact ? ' is-compact' : ''}`} aria-label={label} title={account.user?.email || label} onClick={onClick}>
  {account.status === 'signed-in' ? <span className="nooks-account-initial" aria-hidden="true">{account.user?.email?.slice(0, 1).toUpperCase() || 'N'}</span> : <span>{compact ? 'Account' : label}</span>}
 </button>;
}

export function AccountDialog({ onClose, onBeforeAccountChange }: { onClose: () => void; onBeforeAccountChange?: () => boolean | Promise<boolean> }) {
 const account = useNooksAccount();
 const ref = useRef<HTMLDialogElement>(null);
 const titleId = useId();
 const [email, setEmail] = useState(account.user?.email || '');
 const [code, setCode] = useState('');
 const [sent, setSent] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [resendAt, setResendAt] = useState(0);
 const [now, setNow] = useState(Date.now());
 const dismiss = useSoftDismiss(ref, onClose, { blocked: busy, queueWhenBlocked: true });
 const backdrop = useBackdropDismiss<HTMLDialogElement>(() => dismiss(), true);
 useEffect(() => {
  const dialog = ref.current;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog?.showModal();
  return () => { dialog?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
 }, []);
 useEffect(() => {
  if (resendAt <= Date.now()) return;
  const timer = window.setInterval(() => { const time = Date.now(); setNow(time); if (time >= resendAt) clearInterval(timer); }, 1000);
  return () => clearInterval(timer);
 }, [resendAt]);
 const resendWait = Math.max(0, Math.ceil((resendAt - now) / 1000));
 async function send(event?: FormEvent) {
  event?.preventDefault(); if (busy || resendWait > 0) return;
  setBusy(true); setError('');
  try { await nooksAccount.sendCode(email); setSent(true); setResendAt(Date.now() + 60000); setNow(Date.now()); }
  catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not send your sign-in email. Try again.'); }
  finally { setBusy(false); }
 }
 async function verify(event: FormEvent) {
  event.preventDefault(); if (busy) return;
  if (onBeforeAccountChange && !await onBeforeAccountChange()) return;
  setBusy(true); setError('');
  try { await nooksAccount.verifyCode(email, code); }
  catch (reason) { setError(reason instanceof Error ? reason.message : 'That code did not work. Try again.'); }
  finally { setBusy(false); }
 }
 async function signOut() {
  if (busy || (onBeforeAccountChange && !await onBeforeAccountChange())) return;
  setBusy(true); setError('');
  try { await nooksAccount.signOut(); setSent(false); setCode(''); }
  catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-out did not finish. Try again.'); }
  finally { setBusy(false); }
 }
 const signedIn = account.status === 'signed-in';
 const unavailable = !account.configured && account.status !== 'loading';
 return createPortal(<dialog ref={ref} className="nooks-account-dialog" aria-labelledby={titleId} aria-modal="true" onCancel={event => { event.preventDefault(); dismiss(); }} {...backdrop}>
  <header><span>NOOKS ACCOUNT</span><button type="button" aria-label="Close account" onClick={() => dismiss()}><X size={18}/></button></header>
  <h2 id={titleId}>{signedIn ? 'Your website library.' : unavailable ? 'Your work is on this device.' : sent ? 'Check your inbox.' : account.status === 'expired' ? 'Reconnect your account.' : 'Save your website library.'}</h2>
  {account.status === 'loading' ? <p role="status">Checking account availability…</p> : signedIn ? <>
   <div className="nooks-account-connected"><Check size={18}/><div><strong>{account.user?.email || 'Signed in'}</strong><span>Account workspace connected</span></div></div>
   <p>This account saves your library across browsers on the Nooks website. Your ChatGPT plugin library is separate for now. Notes saved on this device are not copied automatically.</p>
   <div className="nooks-account-footer"><button type="button" className="nooks-account-secondary" disabled={busy} onClick={signOut}>{busy ? 'Signing out…' : 'Sign out'}</button><button type="button" className="nooks-account-primary" onClick={() => dismiss()}>Back to studying</button></div>
  </> : unavailable ? <>
   <p>Account saving is not connected on this preview yet. Your device library stays available in this browser.</p>
   {account.configError && <p className="nooks-account-error" role="alert">{account.configError}</p>}
   <div className="nooks-account-footer"><button type="button" className="nooks-account-secondary" onClick={() => void nooksAccount.retry()}>Check again</button>{account.workspaceKey !== 'device' ? <button type="button" className="nooks-account-primary" disabled={busy} onClick={signOut}>Switch to device library</button> : <button type="button" className="nooks-account-primary" onClick={() => dismiss()}>Keep studying</button>}</div>
  </> : <>
   {account.status === 'expired' && <p className="nooks-account-error">Your account session ended. Reconnect to continue saving to the same library.</p>}
   {account.status === 'error' && <p className="nooks-account-error" role="alert">{account.configError} <button type="button" className="nooks-account-secondary" onClick={() => void nooksAccount.retry()}>Try connection again</button></p>}
   <p>{sent ? `Use the sign-in link sent to ${email}, or enter the code if your email includes one.` : 'Sign in by email to save work across browsers on this website. Your ChatGPT plugin library and notes saved on this device stay separate.'}</p>
   {!sent ? <form onSubmit={send}>
    <label htmlFor={`${titleId}-email`}>Email address</label>
    <input id={`${titleId}-email`} autoFocus type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@university.edu" required maxLength={254} disabled={busy}/>
    <button className="nooks-account-primary" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Continue with email'}<ArrowRight size={16}/></button>
   </form> : <form onSubmit={verify}>
    <label htmlFor={`${titleId}-code`}>Email code</label>
    <input id={`${titleId}-code`} autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter your code" required minLength={6} maxLength={10} disabled={busy}/>
    <button className="nooks-account-primary" disabled={busy || code.length < 6}>{busy ? 'Connecting…' : 'Open my account'}<ArrowRight size={16}/></button>
    <div className="nooks-account-resend"><button type="button" disabled={busy || resendWait > 0} onClick={() => void send()}>{resendWait > 0 ? `Resend in ${resendWait}s` : 'Resend email'}</button><button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(''); setResendAt(0); }}>Use another email</button></div>
   </form>}
   {account.workspaceKey !== 'device' && <button type="button" className="nooks-account-device" disabled={busy} onClick={signOut}>Sign out and use my device library</button>}
  </>}
  {error && <p className="nooks-account-error" role="alert">{error}</p>}
 </dialog>, document.body);
}
