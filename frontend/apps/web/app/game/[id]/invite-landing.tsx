'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { androidGameIntent, createNativeGameUrl, detectInviteDevice, gameRoomPath, type InviteDevice, type InviteInstallLinks } from '@rps/core/invitations';
import { InviteQr } from '../../components/InviteQr';
import styles from './invite.module.css';

export function InviteLanding({ gameId, links, stay }: { gameId: string; links: InviteInstallLinks; stay: boolean }) {
  const [device, setDevice] = useState<InviteDevice>('desktop');
  const [detected, setDetected] = useState(false);
  const [paused, setPaused] = useState(stay);
  const [copyStatus, setCopyStatus] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    setDevice(detectInviteDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
    setDetected(true);
  }, []);
  const install = device === 'desktop' ? null : links[device];
  const installLabel = device === 'ios' ? install?.includes('testflight.apple.com') ? 'Install with TestFlight' : 'Install on iPhone' : device === 'seeker' ? 'Install on Seeker' : 'Install on Android';
  useEffect(() => {
    if (!detected || paused || !install) return;
    const key = `ripsy.invite-install.${gameId}`;
    // Do not redirect again when returning from the store. Never claim deferred joining.
    try { if (sessionStorage.getItem(key)) return; } catch { return; }
    setRedirecting(true);
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') { setRedirecting(false); return; }
      try { sessionStorage.setItem(key, gameId); window.location.assign(install); }
      catch { setRedirecting(false); setPaused(true); }
    }, 5000);
    const pause = () => { window.clearTimeout(timer); setRedirecting(false); };
    window.addEventListener('pagehide', pause);
    document.addEventListener('visibilitychange', pause);
    return () => { pause(); window.removeEventListener('pagehide', pause); document.removeEventListener('visibilitychange', pause); };
  }, [detected, gameId, install, paused]);

  const openUrl = device === 'android' || device === 'seeker' ? androidGameIntent(gameId) : createNativeGameUrl(gameId);
  const copyCode = async () => {
    setPaused(true);
    try { await navigator.clipboard.writeText(gameId); setCopyStatus('Room code copied!'); }
    catch { setCopyStatus('Select the room code above to copy it.'); }
  };
  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="invite-title">
      <Image src="/icon-192.png" alt="RIPSY" width={80} height={80} className={styles.logo} />
      <p className={styles.eyebrow}>YOUR FRIEND IS WAITING</p>
      <h1 id="invite-title">Join the battle!</h1>
      <p>Keep this room code. Open RIPSY to join your friend.</p>
      <strong className={styles.code}>{gameId}</strong>
      <button type="button" onClick={copyCode}>Copy room code</button>
      <p role="status" className={styles.note}>{copyStatus}</p>
      {detected && device !== 'desktop' && <a className={styles.primary} href={openUrl} onClick={() => setPaused(true)}>Open this game in RIPSY</a>}
      <p className={styles.note}>No app yet? Install, then return here and tap Open this game. You can also enter the code on Home.</p>
      <nav className={styles.devices} aria-label="Choose your device">
        {(['ios', 'android', 'seeker'] as const).map(kind => <button type="button" key={kind} aria-pressed={device === kind} onClick={() => { setPaused(true); setDevice(kind); }}>{kind === 'ios' ? 'iPhone' : kind === 'seeker' ? 'Seeker' : 'Android'}</button>)}
      </nav>
      {install && <a className={styles.install} href={install} onClick={() => setPaused(true)}>{installLabel}</a>}
      {redirecting && !paused && <div role="status"><p className={styles.note}>Opening installation shortly. Your code stays on this page.</p><button type="button" onClick={() => { setPaused(true); setRedirecting(false); }}>Stay on this page</button></div>}
      {device === 'desktop' && <div className={styles.qr}><InviteQr gameId={gameId} /><p className={styles.note}>Scan with your phone to join.</p></div>}
      <p className={styles.note}>Rooms can expire while you install. If this room closes, ask your friend for a new invite.</p>
      <Link className={styles.web} href={gameRoomPath(gameId)} onClick={() => setPaused(true)}>Play this game in the browser instead</Link>
    </section>
  </main>;
}
