import { invoice } from '@tma.js/sdk-react';
import { useCallback, useEffect, useState, type FC } from 'react';

import { api } from '@/api/client';
import type { BillingCheckout, BillingState } from '@/api/types';
import { Page } from '@/components/Page';
import { Button, Placeholder, Spinner } from '@/components/Ui';

function formatBytes(value: string | number): string {
  const bytes = typeof value === 'string' ? BigInt(value) : BigInt(value);
  const mib = bytes / (1024n * 1024n);
  if (mib < 1024n) return `${mib} MB`;
  return `${mib / 1024n} GB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export const BillingPage: FC = () => {
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<
    'cancel' | 'checkout' | 'refresh' | 'restore' | null
  >(null);

  const load = useCallback(async () => {
    const state = await api<BillingState>('/billing');
    setBilling(state);
    setError(null);
    return state;
  }, []);

  useEffect(() => {
    void load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  const refresh = async () => {
    setWorking('refresh');
    try {
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const upgrade = async () => {
    if (working || !billing?.configured) return;
    setWorking('checkout');
    setError(null);
    try {
      const checkout = await api<BillingCheckout>('/billing/checkout', {
        method: 'POST',
      });
      if (!checkout.invoiceUrl) {
        if (checkout.billing) setBilling(checkout.billing);
        return;
      }
      if (!invoice.isSupported()) {
        throw new Error('This Telegram client cannot open subscription invoices.');
      }
      await invoice.openUrl(checkout.invoiceUrl);
      // The close status is presentation-only. The webhook-backed API remains
      // the sole source of truth for plan changes.
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const setCancellation = async (cancel: boolean) => {
    if (working) return;
    if (
      cancel &&
      !window.confirm(
        'Stop automatic renewal? Pro remains active through the current paid period.',
      )
    ) {
      return;
    }
    setWorking(cancel ? 'cancel' : 'restore');
    setError(null);
    try {
      const state = await api<BillingState>(
        cancel
          ? '/billing/subscription/cancel'
          : '/billing/subscription/re-enable',
        { method: 'POST' },
      );
      setBilling(state);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(null);
    }
  };

  if (!billing) {
    return (
      <Page>
        {error ? (
          <Placeholder header="Could not load plan" description={error} />
        ) : (
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        )}
      </Page>
    );
  }

  const subscription = billing.subscription;
  const paid = billing.plan === 'pro' && subscription?.status !== 'expired';

  return (
    <Page>
      <main className="mx-auto max-w-xl px-5 pt-8 pb-14">
        <header className="animate-rise border-b border-line pb-7">
          <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
            Plan status
          </span>
          <div className="mt-3 flex items-end justify-between gap-5">
            <div>
              <h1 className="font-display text-[40px] font-light leading-none">
                {paid ? 'Pro' : 'Free'}
              </h1>
              <p className="mt-3 max-w-sm text-[13px] leading-5 text-ink-dim">
                {paid && subscription
                  ? subscription.status === 'grace'
                    ? `Renewal grace ends ${formatDate(subscription.graceEndsAt!)}.`
                    : `Current period ends ${formatDate(subscription.currentPeriodEnd)}.`
                  : 'Core gallery publishing with conservative limits.'}
              </p>
            </div>
            <button
              type="button"
              className="pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-dim transition-colors active:text-brass"
              disabled={working !== null}
              onClick={() => void refresh()}
            >
              {working === 'refresh' ? 'Checking…' : 'Refresh'}
            </button>
          </div>
          {billing.testMode && billing.configured ? (
            <p className="mt-5 border-l border-brass pl-3 text-[12px] leading-5 text-brass">
              Telegram test mode — no production charge is available here.
            </p>
          ) : null}
        </header>

        <section className="animate-rise border-b border-line py-7 [animation-delay:60ms]">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.24em] text-ink-dim">
            Included limits
          </h2>
          <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5 tabular-nums">
            <div>
              <dt className="text-[12px] text-ink-dim">Albums</dt>
              <dd className="mt-1 font-display text-[25px]">{billing.limits.albums}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-dim">Photos</dt>
              <dd className="mt-1 font-display text-[25px]">{billing.limits.photos}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-dim">Storage</dt>
              <dd className="mt-1 font-display text-[25px]">
                {formatBytes(billing.limits.storageBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-dim">Per upload</dt>
              <dd className="mt-1 font-display text-[25px]">
                {formatBytes(billing.limits.uploadBytes)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="animate-rise py-7 [animation-delay:120ms]">
          {error ? (
            <p className="mb-5 text-[13px] leading-5 text-danger [overflow-wrap:anywhere]">
              {error}
            </p>
          ) : null}

          {!billing.configured ? (
            <p className="text-[13px] leading-6 text-ink-dim">
              Paid billing is not configured for this installation. Free remains
              fully available.
            </p>
          ) : paid && subscription ? (
            <div>
              {subscription.cancelAtPeriodEnd ? (
                <>
                  <p className="mb-5 text-[13px] leading-5 text-ink-dim">
                    Renewal is off. Pro access remains available through the paid
                    period.
                  </p>
                  <Button
                    loading={working === 'restore'}
                    onClick={() => void setCancellation(false)}
                  >
                    Re-enable renewal
                  </Button>
                </>
              ) : (
                <Button
                  variant="plain"
                  className="w-full"
                  loading={working === 'cancel'}
                  onClick={() => void setCancellation(true)}
                >
                  Stop renewal
                </Button>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-4 text-[12px] leading-5 text-ink-dim">
                Review the{' '}
                <a
                  className="underline underline-offset-4"
                  href={billing.termsUrl!}
                  target="_blank"
                  rel="noreferrer"
                >
                  Terms
                </a>{' '}
                and{' '}
                <a
                  className="underline underline-offset-4"
                  href={billing.privacyUrl!}
                  target="_blank"
                  rel="noreferrer"
                >
                  Privacy notice
                </a>{' '}
                before subscribing.
              </p>
              <Button loading={working === 'checkout'} onClick={() => void upgrade()}>
                Upgrade · {billing.priceStars} Stars / 30 days
              </Button>
              <p className="mt-4 text-[12px] leading-5 text-ink-dim">
                Renews every 30 days. Cancel any time; access continues through
                the paid period. Downgrade never deletes existing content.
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-ink-dim">
            {paid && billing.termsUrl ? (
              <a
                className="underline underline-offset-4"
                href={billing.termsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Terms
              </a>
            ) : null}
            {paid && billing.privacyUrl ? (
              <a
                className="underline underline-offset-4"
                href={billing.privacyUrl}
                target="_blank"
                rel="noreferrer"
              >
                Privacy
              </a>
            ) : null}
            {billing.supportContact ? (
              <span>Payment support: {billing.supportContact}</span>
            ) : null}
          </div>
        </section>
      </main>
    </Page>
  );
};
