import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { api } from '@/api/client';
import {
  buildAdminTenantLink,
  buildGalleryHomeLink,
  usePublicConfig,
} from '@/api/publicConfig';
import type { TenantBotState } from '@/api/types';
import { Page } from '@/components/Page';
import { useTenantWorkspace } from '@/components/TenantWorkspace';
import { Button, Placeholder, Spinner } from '@/components/Ui';

export function TenantBotPage() {
  const workspace = useTenantWorkspace();
  const selected = workspace?.selected;
  const selectedRole = selected?.role;
  const selectedSlug = selected?.slug;
  const config = usePublicConfig();
  const [state, setState] = useState<TenantBotState | null>(null);
  const [botToken, setBotToken] = useState('');
  const [adminAppShortName, setAdminAppShortName] = useState('');
  const [galleryAppShortName, setGalleryAppShortName] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState<'admin' | 'gallery' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    setAdminAppShortName((current) => current || config.adminAppShortName);
    setGalleryAppShortName((current) => current || config.galleryAppShortName);
  }, [config]);

  useEffect(() => {
    if (!selectedSlug || selectedRole !== 'owner') return;
    let active = true;
    setState(null);
    setError(null);
    void api<TenantBotState>(`/tenants/${selectedSlug}/bot`)
      .then((value) => {
        if (!active) return;
        setState(value);
        if (value.bot) {
          setAdminAppShortName(value.bot.adminAppShortName);
          setGalleryAppShortName(value.bot.galleryAppShortName);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError((caught as Error).message);
      });
    return () => {
      active = false;
    };
  }, [selectedRole, selectedSlug]);

  const links = useMemo(() => {
    if (!config || !selected || !state?.bot) return null;
    return {
      admin: buildAdminTenantLink(selected.slug, state.bot),
      gallery: buildGalleryHomeLink(config, selected.slug, state.bot),
    };
  }, [config, selected, state]);

  if (!workspace) {
    return (
      <Page>
        <Placeholder
          header="Shared bot already configured"
          description="Self-hosted single-gallery installations use the bot configured by the service operator."
        />
      </Page>
    );
  }
  if (selected?.role !== 'owner') {
    return (
      <Page>
        <Placeholder
          header="Owner access required"
          description="Only the gallery owner can connect, rotate, or disconnect its Telegram bot."
        />
      </Page>
    );
  }
  if (error && !state) {
    return <Placeholder header="Could not load bot settings" description={error} />;
  }
  if (!state || !config) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (working || !botToken) return;
    if (
      state.connected &&
      !window.confirm(
        'Rotate this bot token? The previous token will stop authenticating this gallery immediately.',
      )
    ) return;
    setWorking(true);
    setError(null);
    try {
      const next = await api<TenantBotState>(
        `/tenants/${selected.slug}/bot`,
        {
          method: 'PUT',
          body: JSON.stringify({
            botToken,
            adminAppShortName,
            galleryAppShortName,
          }),
        },
      );
      setState(next);
      workspace.updateSelectedBot(next.bot);
      setBotToken('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    if (
      working ||
      !state.connected ||
      !window.confirm(
        'Disconnect this bot? Its Mini Apps will stop authenticating this gallery. The shared service bot remains available.',
      )
    ) return;
    setWorking(true);
    setError(null);
    try {
      const next = await api<TenantBotState>(
        `/tenants/${selected.slug}/bot`,
        { method: 'DELETE' },
      );
      setState(next);
      workspace.updateSelectedBot(next.bot);
      setCopied(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const copy = async (kind: 'admin' | 'gallery') => {
    const link = links?.[kind];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Clipboard access is unavailable. Open and copy the link manually.');
    }
  };

  return (
    <Page backTo="/">
      <main className="mx-auto max-w-xl px-5 pt-8 pb-14">
        <header className="animate-rise border-b border-line pb-7">
          <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
            White label
          </span>
          <h1 className="mt-3 font-display text-[40px] font-light leading-none">
            Telegram bot
          </h1>
          <p className="mt-4 max-w-lg text-[13px] leading-5 text-ink-dim">
            Connect a BotFather bot to use its name and Mini Apps for this
            gallery. The shared service bot remains the recovery path.
          </p>
        </header>

        <section className="animate-rise border-b border-line py-7 [animation-delay:60ms]">
          <span className="block text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
            Connection
          </span>
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <strong className="font-display text-[25px] font-normal text-ink">
              {state.bot ? `@${state.bot.username}` : 'Shared bot only'}
            </strong>
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">
              {state.connected ? 'Verified' : 'Not connected'}
            </span>
          </div>
          {state.bot ? (
            <p className="mt-2 text-[12px] text-ink-dim">
              Last verified {new Date(state.bot.verifiedAt).toLocaleDateString()}
            </p>
          ) : null}
        </section>

        {links ? (
          <section className="animate-rise border-b border-line py-7 [animation-delay:90ms]">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
              Mini App links
            </h2>
            {(['admin', 'gallery'] as const).map((kind) => (
              <div key={kind} className="mt-5">
                <span className="block font-display text-[19px] capitalize text-ink">
                  {kind}
                </span>
                <span className="mt-1 block truncate text-[12px] text-ink-dim">
                  {links[kind]}
                </span>
                <div className="mt-2 flex gap-5 text-[11px] font-medium uppercase tracking-[0.16em]">
                  <button
                    type="button"
                    className="text-brass active:opacity-60"
                    onClick={() => void copy(kind)}
                  >
                    {copied === kind ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    className="text-ink-dim active:text-ink"
                    href={links[kind]}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open
                  </a>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <form
          className="animate-rise py-7 [animation-delay:120ms]"
          onSubmit={(event) => void submit(event)}
        >
          <h2 className="font-display text-[24px] text-ink">
            {state.connected ? 'Rotate credentials' : 'Connect bot'}
          </h2>
          {!state.configured ? (
            <p className="mt-3 text-[13px] leading-5 text-danger">
              The operator must configure tenant-bot encryption keys before a
              token can be stored.
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-5">
            <label>
              <span className="block text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
                BotFather token
              </span>
              <input
                aria-label="BotFather token"
                className="mt-2 w-full border-b border-line bg-transparent py-3 text-[15px] text-ink outline-none focus:border-brass"
                type="password"
                autoComplete="off"
                value={botToken}
                disabled={working || !state.configured}
                onChange={(event) => setBotToken(event.target.value)}
              />
              <span className="mt-2 block text-[12px] leading-5 text-ink-dim">
                Verified with Telegram, encrypted before storage, and never
                returned by the API.
              </span>
            </label>
            <label>
              <span className="block text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
                Admin Mini App short name
              </span>
              <input
                aria-label="Admin Mini App short name"
                className="mt-2 w-full border-b border-line bg-transparent py-3 text-[15px] text-ink outline-none focus:border-brass"
                value={adminAppShortName}
                maxLength={64}
                disabled={working || !state.configured}
                onChange={(event) => setAdminAppShortName(event.target.value)}
              />
            </label>
            <label>
              <span className="block text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
                Gallery Mini App short name
              </span>
              <input
                aria-label="Gallery Mini App short name"
                className="mt-2 w-full border-b border-line bg-transparent py-3 text-[15px] text-ink outline-none focus:border-brass"
                value={galleryAppShortName}
                maxLength={64}
                disabled={working || !state.configured}
                onChange={(event) => setGalleryAppShortName(event.target.value)}
              />
            </label>
          </div>

          {error ? (
            <p className="mt-5 text-[13px] text-danger [overflow-wrap:anywhere]">
              {error}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-2">
            <Button
              type="submit"
              loading={working}
              disabled={
                !state.configured ||
                !botToken ||
                !adminAppShortName ||
                !galleryAppShortName
              }
            >
              {state.connected ? 'Verify and rotate' : 'Verify and connect'}
            </Button>
            {state.connected ? (
              <Button
                type="button"
                variant="plain"
                className="text-danger"
                loading={working}
                onClick={() => void disconnect()}
              >
                Disconnect bot
              </Button>
            ) : null}
          </div>
        </form>

        <aside className="border-t border-line pt-6 text-[12px] leading-5 text-ink-dim">
          Create both Mini Apps in BotFather with these exact short names and
          this service’s <code>/admin</code> and gallery URLs. Connecting does
          not register a webhook or move Stars billing to this bot.
        </aside>
      </main>
    </Page>
  );
}
