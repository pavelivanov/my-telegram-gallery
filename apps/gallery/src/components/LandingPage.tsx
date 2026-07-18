import {
  buildAdminHomeLink,
  usePublicConfigState,
} from '@/api/publicConfig';

const STEPS = [
  {
    number: '01',
    title: 'Create',
    copy: 'Name the gallery in the Telegram admin app. No separate account or password.',
  },
  {
    number: '02',
    title: 'Curate',
    copy: 'Upload, order, and group photographs into focused collections.',
  },
  {
    number: '03',
    title: 'Share',
    copy: 'Send one Telegram link. The collection opens where the conversation already lives.',
  },
] as const;

export function LandingPage() {
  const { config, failed } = usePublicConfigState();
  const adminLink = config ? buildAdminHomeLink(config) : null;

  return (
    <main className="landing">
      <header className="landing__header">
        <a className="landing__brand" href="#top" aria-label="Gallery home">
          Gallery<span aria-hidden="true">.</span>
        </a>
        <a className="landing__header-link" href="#how-it-works">
          How it works
        </a>
      </header>

      <section className="landing__hero" id="top">
        <div className="landing__glow" aria-hidden="true" />
        <div className="landing__hero-copy">
          <p className="landing__eyebrow">Telegram-native photo galleries</p>
          <h1>Private collections, beautifully shared.</h1>
          <p className="landing__lede">
            Run your own gallery or host many from one bot. One codebase, one
            calm place for the photographs that matter.
          </p>
          <div className="landing__actions">
            {adminLink ? (
              <a
                className="landing__button landing__button--primary"
                href={adminLink}
                rel="noreferrer"
                target="_blank"
              >
                Create in Telegram <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <span
                className="landing__button landing__button--loading"
                aria-live="polite"
              >
                {failed ? 'Telegram link unavailable' : 'Connecting to Telegram…'}
              </span>
            )}
            <a className="landing__button landing__button--quiet" href="#self-host">
              Explore self-hosting
            </a>
          </div>
          <p className="landing__proof">
            One image <span>·</span> one domain <span>·</span> PostgreSQL + local or S3 media
          </p>
        </div>

        <div className="landing__gallery-plane" aria-hidden="true">
          <div className="landing__frame landing__frame--primary">
            <div className="landing__frame-topline">
              <span>The collection</span>
              <span>001</span>
            </div>
            <div className="landing__frame-image landing__frame-image--coast" />
            <div className="landing__frame-caption">
              <strong>North Coast</strong>
              <span>12 photographs</span>
            </div>
          </div>
          <div className="landing__frame landing__frame--secondary">
            <div className="landing__frame-image landing__frame-image--studio" />
            <div className="landing__frame-caption">
              <strong>After light</strong>
              <span>07</span>
            </div>
          </div>
          <div className="landing__telegram-mark">TG</div>
        </div>
      </section>

      <section className="landing__modes" id="self-host">
        <div className="landing__section-label">One foundation, two modes</div>
        <div className="landing__mode-grid">
          <article>
            <p>For your own collection</p>
            <h2>Keep the keys.</h2>
            <div className="landing__mode-visual landing__mode-visual--single">
              <span>your domain</span>
              <i aria-hidden="true" />
              <span>one gallery</span>
            </div>
            <p className="landing__mode-copy">
              A single container serves the gallery, admin, and API. Bring
              PostgreSQL and local disk—or any S3-compatible store.
            </p>
          </article>
          <article>
            <p>For a hosted service</p>
            <h2>Share the stage.</h2>
            <div className="landing__mode-visual landing__mode-visual--multi">
              <span>one bot</span>
              <i aria-hidden="true" />
              <span>many galleries</span>
            </div>
            <p className="landing__mode-copy">
              Tenant boundaries, quotas, abuse controls, and Telegram Stars
              billing are built into the same deployable.
            </p>
          </article>
        </div>
      </section>

      <section className="landing__steps" id="how-it-works">
        <div className="landing__steps-heading">
          <p className="landing__section-label">From empty to shared</p>
          <h2>Three gestures. No new habit.</h2>
        </div>
        <div className="landing__step-list">
          {STEPS.map((step) => (
            <article className="landing__step" key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing__closing">
        <p className="landing__eyebrow">Ready when your photographs are</p>
        <h2>Open the door.<br />Keep the room yours.</h2>
        {adminLink ? (
          <a
            className="landing__button landing__button--primary"
            href={adminLink}
            rel="noreferrer"
            target="_blank"
          >
            Open the admin app <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </section>

      <footer className="landing__footer">
        <span>Gallery · pre-release</span>
        {config ? (
          <nav aria-label="Legal">
            <a href={config.sourceUrl} rel="noreferrer" target="_blank">
              Source v{config.version} · AGPL-3.0-only · no warranty
            </a>
            {config.termsUrl ? (
              <a href={config.termsUrl} rel="noreferrer" target="_blank">Terms</a>
            ) : null}
            {config.privacyUrl ? (
              <a href={config.privacyUrl} rel="noreferrer" target="_blank">Privacy</a>
            ) : null}
          </nav>
        ) : null}
      </footer>
    </main>
  );
}
