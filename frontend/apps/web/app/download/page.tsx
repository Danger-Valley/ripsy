import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

const repository = 'Danger-Valley/ripsy-downloads';
const releaseTag = 'seeker-latest';
const downloadUrl = `https://github.com/${repository}/releases/download/${releaseTag}/ripsy-seeker.apk`;

interface ReleaseAsset {
  name: string;
  size: number;
  updated_at: string;
}

interface ReleaseInfo {
  name: string;
  assets: ReleaseAsset[];
}

export const metadata: Metadata = {
  title: 'Download RIPSY for Android',
  description: 'Download the latest RIPSY Android build for Seeker.',
};

export default async function DownloadPage() {
  const release = await getLatestRelease();
  const apk = release?.assets.find(asset => asset.name === 'ripsy-seeker.apk');
  const buildLabel = release?.name || 'Latest Android build';

  return (
    <main className={styles.page}>
      <div aria-hidden="true" className={styles.grid} />
      <header className={styles.header}>
        <Link className={styles.brand} href="/">RIPSY</Link>
        <span className={styles.platform}>ANDROID · SEEKER</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>THE BATTLE GOES MOBILE</p>
          <h1>RIPSY for Android</h1>
          <p className={styles.intro}>
            Play the real-time strategy battle natively on Android. This APK is optimized for Seeker and arm64 devices.
          </p>
        </div>

        <div className={styles.downloadCard}>
          <div aria-hidden="true" className={styles.appMark}>R</div>
          <div className={styles.releaseDetails}>
            <span className={styles.releaseLabel}>CURRENT RELEASE</span>
            <strong>{buildLabel}</strong>
            <span>{apk ? `${formatFileSize(apk.size)} · Updated ${formatDate(apk.updated_at)}` : 'The newest published APK'}</span>
          </div>
          <a className={styles.downloadButton} href={downloadUrl}>
            <span>Download APK</span>
            <span aria-hidden="true" className={styles.arrow}>↓</span>
          </a>
          <p className={styles.requirement}>Requires Android 8 or newer · arm64</p>
        </div>
      </section>

      <section aria-labelledby="install-title" className={styles.install}>
        <div>
          <p className={styles.sectionNumber}>01</p>
          <h2 id="install-title">Install in three steps</h2>
        </div>
        <ol className={styles.steps}>
          <li><span>Download</span><p>Save the latest APK to your Android device.</p></li>
          <li><span>Allow</span><p>If asked, allow your browser to install this app.</p></li>
          <li><span>Play</span><p>Open RIPSY, create a battle, and invite an opponent.</p></li>
        </ol>
      </section>

      <footer className={styles.footer}>
        <span>Direct distribution · Always the latest build</span>
        <Link href="/support">Need help?</Link>
      </footer>
    </main>
  );
}

async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${releaseTag}`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
