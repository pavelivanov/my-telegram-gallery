import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type PropsWithChildren,
} from 'react';
import { useNavigate } from 'react-router-dom';

import {
  api,
  getSelectedTenantSlug,
  setSelectedTenantSlug,
} from '@/api/client';
import {
  buildGalleryHomeLink,
  getPublicConfig,
  type PublicConfig,
} from '@/api/publicConfig';
import type { Tenant } from '@/api/types';
import { Button, Placeholder, Spinner } from './Ui';

interface TenantWorkspaceValue {
  selected: Tenant;
  tenants: Tenant[];
}

const TenantWorkspaceContext = createContext<TenantWorkspaceValue | null>(
  null,
);

export function useTenantWorkspace(): TenantWorkspaceValue | null {
  return useContext(TenantWorkspaceContext);
}

function suggestedSlug(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}

function formatBytes(value: bigint): string {
  const mebibytes = Number(value / (1024n * 1024n));
  if (mebibytes < 1024) return `${mebibytes} MB`;
  const gibibytes = Number(value / (1024n * 1024n * 1024n));
  return `${gibibytes} GB`;
}

function committedStorage(tenant: Tenant): bigint {
  return (
    BigInt(tenant.usage.storageUsedBytes) +
    BigInt(tenant.usage.storageReservedBytes)
  );
}

function TenantOnboarding({
  onCancel,
  onCreated,
}: {
  onCancel?: () => void;
  onCreated: (tenant: Tenant) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validSlug = /^[a-z0-9][a-z0-9_]{2,29}$/.test(slug);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !validSlug || creating) return;
    setCreating(true);
    setError(null);
    try {
      const tenant = await api<Tenant>('/tenants', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), slug }),
      });
      onCreated(tenant);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen px-6 pt-14 pb-10">
      <div className="animate-rise mx-auto max-w-md">
        <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
          my gallery · admin
        </span>
        <h1 className="mt-4 max-w-xs font-display text-[38px] font-light leading-[1.04]">
          Create your gallery
        </h1>
        <p className="mt-4 max-w-sm text-[14px] leading-6 text-ink-dim">
          Choose the name people will see and a short address for Telegram links.
        </p>

        <form
          className="mt-10 border-t border-line pt-7"
          onSubmit={(event) => void submit(event)}
        >
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
                Gallery name
              </span>
              <input
                autoFocus
                className="w-full border-b border-line bg-transparent px-0 py-3 text-[18px] text-ink outline-none placeholder:text-ink-dim/60 focus:border-brass"
                placeholder="Family archive"
                value={name}
                maxLength={100}
                disabled={creating}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setName(nextName);
                  if (!slugEdited) setSlug(suggestedSlug(nextName));
                }}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
                Link address
              </span>
              <div className="flex items-baseline gap-1 border-b border-line focus-within:border-brass">
                <span className="pb-3 text-[15px] text-ink-dim">tenant_</span>
                <input
                  className="min-w-0 flex-1 bg-transparent py-3 text-[17px] text-ink outline-none placeholder:text-ink-dim/60"
                  placeholder="family_archive"
                  value={slug}
                  maxLength={30}
                  disabled={creating}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(event.target.value.toLowerCase());
                  }}
                />
              </div>
              <span className="text-[12px] leading-5 text-ink-dim">
                3–30 lowercase letters, numbers, or underscores.
              </span>
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
              disabled={!name.trim() || !validSlug}
              loading={creating}
            >
              Create gallery
            </Button>
            {onCancel ? (
              <Button type="button" variant="plain" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </main>
  );
}

function TenantNavigation({
  config,
  onCreate,
  onSelect,
  selected,
  tenants,
}: {
  config: PublicConfig;
  onCreate: () => void;
  onSelect: (slug: string) => void;
  selected: Tenant;
  tenants: Tenant[];
}) {
  const homeLink = buildGalleryHomeLink(config, selected.slug);
  const storageCommitted = committedStorage(selected);

  return (
    <nav className="animate-fade border-b border-line px-5 pt-5 pb-4">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Selected gallery</span>
          {tenants.length > 1 ? (
            <select
              className="max-w-full bg-night pr-6 font-display text-[17px] text-ink outline-none focus:text-brass"
              value={selected.slug}
              onChange={(event) => onSelect(event.target.value)}
            >
              {tenants.map((tenant) => (
                <option key={tenant.slug} value={tenant.slug}>
                  {tenant.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="block truncate font-display text-[17px] text-ink">
              {selected.name}
            </span>
          )}
          <span className="mt-0.5 block truncate text-[11px] uppercase tracking-[0.16em] text-ink-dim">
            {selected.slug}
          </span>
          <span className="mt-1 block truncate text-[11px] tabular-nums text-ink-dim">
            {selected.usage.photoCount}/{selected.usage.photoLimit} photos ·{' '}
            {formatBytes(storageCommitted)}/
            {formatBytes(BigInt(selected.usage.storageLimitBytes))}
            {selected.openReportCount > 0
              ? ` · ${selected.openReportCount} report${selected.openReportCount === 1 ? '' : 's'} under review`
              : ''}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-4 text-[11px] font-medium uppercase tracking-[0.16em]">
          <a
            className="text-brass transition-opacity active:opacity-60"
            href={homeLink}
            target="_blank"
            rel="noreferrer"
          >
            Open gallery
          </a>
          <button
            type="button"
            className="text-ink-dim transition-colors hover:text-ink active:text-ink"
            onClick={onCreate}
          >
            New
          </button>
        </div>
      </div>
    </nav>
  );
}

export function TenantWorkspace({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getPublicConfig()
      .then(async (publicConfig) => {
        if (!active) return;
        setConfig(publicConfig);
        if (publicConfig.tenancyMode === 'single') {
          setSelectedTenantSlug(null);
          return;
        }

        const owned = await api<Tenant[]>('/tenants');
        if (!active) return;
        const storedSlug = getSelectedTenantSlug();
        const selected =
          owned.find((tenant) => tenant.slug === storedSlug) ?? owned[0] ?? null;
        setTenants(owned);
        setSelectedSlug(selected?.slug ?? null);
        setSelectedTenantSlug(selected?.slug ?? null);
      })
      .catch((caught: unknown) => {
        if (active) setError((caught as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  const select = useCallback(
    (slug: string) => {
      setSelectedTenantSlug(slug);
      setSelectedSlug(slug);
      navigate('/');
    },
    [navigate],
  );

  if (error) {
    return <Placeholder header="Could not load galleries" description={error} />;
  }
  if (!config || (config.tenancyMode === 'multi' && tenants === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (config.tenancyMode === 'single') return children;

  const selected =
    tenants?.find((tenant) => tenant.slug === selectedSlug) ?? null;
  if (creating || !selected) {
    return (
      <TenantOnboarding
        onCancel={selected ? () => setCreating(false) : undefined}
        onCreated={(tenant) => {
          setTenants((current) => [...(current ?? []), tenant]);
          setCreating(false);
          select(tenant.slug);
        }}
      />
    );
  }

  if (selected.status === 'suspended') {
    return (
      <>
        <TenantNavigation
          config={config}
          onCreate={() => setCreating(true)}
          onSelect={select}
          selected={selected}
          tenants={tenants ?? []}
        />
        <Placeholder
          header="Gallery suspended"
          description={`This gallery is read-only. Usage: ${selected.usage.photoCount}/${selected.usage.photoLimit} photos and ${formatBytes(committedStorage(selected))} of ${formatBytes(BigInt(selected.usage.storageLimitBytes))}. Contact the service operator to restore access.`}
        />
      </>
    );
  }

  return (
    <TenantWorkspaceContext.Provider value={{ selected, tenants: tenants ?? [] }}>
      <TenantNavigation
        config={config}
        onCreate={() => setCreating(true)}
        onSelect={select}
        selected={selected}
        tenants={tenants ?? []}
      />
      <div key={selected.slug}>{children}</div>
    </TenantWorkspaceContext.Provider>
  );
}
