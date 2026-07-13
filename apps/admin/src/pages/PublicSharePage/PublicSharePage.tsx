import { useEffect, useState, type FC } from 'react';

import { api } from '@/api/client';
import type { PublicShareState } from '@/api/types';
import { Page } from '@/components/Page';
import { useTenantWorkspace } from '@/components/TenantWorkspace';
import { Button, Placeholder, Spinner } from '@/components/Ui';

function publicGalleryUrl(shareId: string): string {
  const link = new URL('/', window.location.origin);
  link.hash = `/public/${shareId}`;
  return link.toString();
}

export const PublicSharePage: FC = () => {
  const workspace = useTenantWorkspace();
  const selected = workspace?.selected;
  const slug = selected?.slug ?? 'default';
  const owner = !selected || selected.role === 'owner';
  const [state, setState] = useState<PublicShareState | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner) return;
    let active = true;
    setState(null);
    setError(null);
    void api<PublicShareState>(`/tenants/${slug}/public-share`)
      .then((value) => {
        if (active) setState(value);
      })
      .catch((caught: unknown) => {
        if (active) setError((caught as Error).message);
      });
    return () => {
      active = false;
    };
  }, [owner, slug]);

  if (!owner) {
    return (
      <Page>
        <Placeholder
          header="Owner access required"
          description="Only the gallery owner can publish or revoke a browser link."
        />
      </Page>
    );
  }
  if (error && !state) {
    return <Placeholder header="Could not load public sharing" description={error} />;
  }
  if (!state) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const link = state.shareId ? publicGalleryUrl(state.shareId) : null;

  const enable = async () => {
    if (working) return;
    if (
      !window.confirm(
        'Create a public link? Anyone with it can view this gallery outside Telegram.',
      )
    ) return;
    setWorking(true);
    setError(null);
    try {
      setState(
        await api<PublicShareState>(`/tenants/${slug}/public-share`, {
          method: 'POST',
        }),
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const disable = async () => {
    if (working || !state.enabled) return;
    if (
      !window.confirm(
        'Disable this public link? The current browser URL will stop working immediately.',
      )
    ) return;
    setWorking(true);
    setError(null);
    try {
      setState(
        await api<PublicShareState>(`/tenants/${slug}/public-share`, {
          method: 'DELETE',
        }),
      );
      setCopied(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard access is unavailable. Copy the link manually.');
    }
  };

  return (
    <Page backTo="/">
      <main className="mx-auto max-w-xl px-5 pt-8 pb-14">
        <header className="animate-rise border-b border-line pb-7">
          <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
            Browser access
          </span>
          <h1 className="mt-3 font-display text-[40px] font-light leading-none">
            Public link
          </h1>
          <p className="mt-4 max-w-lg text-[13px] leading-5 text-ink-dim">
            Telegram sharing stays available either way. Turn this on only when
            the collection is ready for anyone who receives the browser link.
          </p>
        </header>

        <section className="animate-rise py-8 [animation-delay:60ms]">
          <div className="flex items-center justify-between gap-6">
            <div>
              <span className="block font-display text-[24px] text-ink">
                {state.enabled ? 'Published' : 'Telegram only'}
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-ink-dim">
                {state.enabled
                  ? 'Anyone with the opaque link can view albums and submit a report.'
                  : 'Ordinary browsers cannot access gallery content.'}
              </span>
            </div>
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${
                state.enabled ? 'bg-brass' : 'border border-ink-dim'
              }`}
              aria-hidden
            />
          </div>

          {link ? (
            <div className="mt-7 border-y border-line py-5">
              <label className="block text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
                Public gallery URL
              </label>
              <input
                className="mt-3 w-full bg-transparent text-[13px] leading-5 text-ink outline-none"
                readOnly
                value={link}
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="mt-5 flex items-center gap-5 text-[11px] font-medium uppercase tracking-[0.16em]">
                <button
                  type="button"
                  className="text-brass active:opacity-60"
                  onClick={() => void copy()}
                >
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <a
                  className="text-ink-dim active:text-ink"
                  href={link}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open
                </a>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-5 text-[13px] text-danger [overflow-wrap:anywhere]">
              {error}
            </p>
          ) : null}

          <div className="mt-8">
            {state.enabled ? (
              <Button
                type="button"
                variant="plain"
                className="w-full border border-line py-3 text-danger"
                loading={working}
                onClick={() => void disable()}
              >
                Disable public link
              </Button>
            ) : (
              <Button
                type="button"
                loading={working}
                onClick={() => void enable()}
              >
                Create public link
              </Button>
            )}
          </div>
        </section>

        <aside className="border-t border-line pt-6 text-[12px] leading-5 text-ink-dim">
          Disabling revokes the current address. Creating another link later
          generates a different address. Previously loaded media can remain
          cached or signed until its configured expiry. Suspended galleries are
          unavailable through both Telegram and the browser.
        </aside>
      </main>
    </Page>
  );
};
