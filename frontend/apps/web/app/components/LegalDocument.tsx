import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from '../legal.module.css';

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalDocumentProps {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  sections: LegalSection[];
}

export function LegalDocument({ eyebrow, title, description, effectiveDate, sections }: LegalDocumentProps) {
  return (
    <main className={styles.page}>
      <div aria-hidden="true" className={styles.grid} />
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="RIPSY home">RIPSY</Link>
        <nav aria-label="Legal pages" className={styles.headerNav}>
          <a href="/terms">Terms</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <p className={styles.sidebarLabel}>On this page</p>
          <nav aria-label={`${title} sections`}>
            <ol>
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className={styles.document}>
          <header className={styles.intro}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1>{title}</h1>
            <p className={styles.description}>{description}</p>
            <p className={styles.effective}>Effective {effectiveDate}</p>
          </header>

          <div className={styles.sections}>
            {sections.map((section, index) => (
              <section id={section.id} key={section.id} className={styles.section}>
                <div className={styles.sectionHeading}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <h2>{section.title}</h2>
                </div>
                <div className={styles.sectionBody}>{section.content}</div>
              </section>
            ))}
          </div>
        </article>
      </div>

      <footer className={styles.footer}>
        <span>© {new Date().getUTCFullYear()} RIPSY</span>
        <nav aria-label="Footer">
          <Link href="/support">Support</Link>
          <a href="https://github.com/Danger-Valley/ripsy/issues">Contact</a>
        </nav>
      </footer>
    </main>
  );
}
