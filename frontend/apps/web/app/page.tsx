import type { Metadata } from 'next';
import Image from 'next/image';
import styles from './landing.module.css';

export const metadata: Metadata = {
  title: 'RIPSY — Rock, Paper, Strategy',
  description: 'Build a hidden army, outsmart your rival, and capture the flag in RIPSY.',
};

const steps = [
  ['01', 'Build your army', 'Hide rocks, paper, scissors, traps, and your flag across the board.'],
  ['02', 'Read your rival', 'Move with intent. Every clash reveals just enough to change your next play.'],
  ['03', 'Steal the flag', 'Break through the formation, find the flag, and take the win.'],
];

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Main navigation">
        <a className={styles.logo} href="/" aria-label="RIPSY home">RIPSY</a>
        <div className={styles.navLinks}>
          <a href="#how-it-works">How it works</a>
          <a href="/download">Download</a>
          <a className={styles.navCta} href="/app">Play now</a>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>ROCK · PAPER · SCISSORS · STRATEGY</p>
          <h1>Outthink.<br />Outplay.<br /><span>Capture the flag.</span></h1>
          <p className={styles.lede}>RIPSY turns the world’s simplest battle into a hidden-army strategy game. Build your lineup, challenge a friend, and make every move count.</p>
          <div className={styles.actions}>
            <a className={styles.primaryAction} href="/app">Play RIPSY</a>
            <a className={styles.secondaryAction} href="/download">Get the Android app</a>
          </div>
          <p className={styles.note}>Free to play · No download required on web</p>
        </div>

        <div className={styles.heroArt} aria-label="Two RIPSY fighters facing off on the game board">
          <span className={`${styles.cloud} ${styles.cloudOne}`} aria-hidden />
          <span className={`${styles.cloud} ${styles.cloudTwo}`} aria-hidden />
          <div className={styles.arena}>
            <div className={`${styles.fighter} ${styles.fighterBlue}`}>
              <Image alt="Blue RIPSY fighter" height={240} priority src="/figures/fig1.png" width={240} />
            </div>
            <span className={styles.vs} aria-hidden>VS</span>
            <div className={`${styles.fighter} ${styles.fighterCoral}`}>
              <Image alt="Coral RIPSY fighter" height={240} priority src="/figures/fig2.png" width={240} />
            </div>
          </div>
          <div className={styles.board} aria-hidden>
            {Array.from({ length: 35 }, (_, index) => <i key={index} />)}
          </div>
        </div>
      </section>

      <section className={styles.marquee} aria-label="Game features">
        <span>Hidden armies</span><i aria-hidden>★</i><span>Real-time battles</span><i aria-hidden>★</i><span>Pure strategy</span><i aria-hidden>★</i><span>Fast rematches</span>
      </section>

      <section className={styles.how} id="how-it-works" aria-labelledby="how-title">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>THREE MOVES AHEAD</p>
          <h2 id="how-title">Easy to learn.<br />Hard to read.</h2>
        </div>
        <div className={styles.steps}>
          {steps.map(([number, title, copy]) => (
            <article className={styles.step} key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.playBanner}>
        <div>
          <p className={styles.eyebrow}>YOUR ARMY IS WAITING</p>
          <h2>Ready to steal that flag?</h2>
        </div>
        <a className={styles.primaryAction} href="/app">Enter the playground</a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.logo} href="/">RIPSY</a>
        <p>Rock, paper, strategy.</p>
        <nav aria-label="Legal and support">
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/support">Support</a>
        </nav>
      </footer>
    </main>
  );
}
