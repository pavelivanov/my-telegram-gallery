import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  getPublicConfig,
  type PublicConfig,
} from '@/api/publicConfig';

interface GalleryWorkspaceValue {
  config: PublicConfig;
  learnTenant: (slug: string) => void;
  tenantKey: string;
  tenantSlug: string | null;
}

const GalleryWorkspaceContext = createContext<GalleryWorkspaceValue | null>(
  null,
);

export function useGalleryWorkspace(): GalleryWorkspaceValue {
  const workspace = useContext(GalleryWorkspaceContext);
  if (!workspace) throw new Error('Gallery workspace is unavailable');
  return workspace;
}

function parseStartParam(startParam: string | undefined) {
  const tenant = /^tenant_([a-z0-9][a-z0-9_]{2,29})$/.exec(
    startParam ?? '',
  );
  if (tenant) return { kind: 'tenant' as const, slug: tenant[1] };

  const album = /^album_([A-Za-z0-9_-]{1,57})$/.exec(startParam ?? '');
  if (album) return { kind: 'album' as const, id: album[1] };
  return { kind: 'none' as const };
}

function NeutralLaunch() {
  return (
    <main className="flex min-h-[100svh] items-center px-7 py-16">
      <div className="animate-rise max-w-sm">
        <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
          the collection
        </span>
        <h1 className="mt-4 font-display text-[36px] leading-[1.08]">
          Open a gallery link
        </h1>
        <p className="mt-4 text-[14px] leading-6 text-ink-dim">
          This Mini App opens a specific gallery. Return to the Telegram message
          or profile where you received its link.
        </p>
      </div>
    </main>
  );
}

export function GalleryWorkspace({
  children,
  startParam,
}: PropsWithChildren<{ startParam?: string }>) {
  const launch = useMemo(() => parseStartParam(startParam), [startParam]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [learnedSlug, setLearnedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getPublicConfig()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((caught: unknown) => {
        if (active) setError((caught as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="px-6 py-20 text-center">
        <h1 className="font-display text-xl">Could not open gallery</h1>
        <p className="mt-2 break-words text-[13px] text-ink-dim">{error}</p>
      </main>
    );
  }
  if (!config) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center" aria-label="Loading">
        <span className="inline-block animate-spin font-display text-2xl text-brass [animation-duration:2.5s]">
          ✦
        </span>
      </div>
    );
  }

  const tenantSlug =
    config.tenancyMode === 'single'
      ? 'default'
      : launch.kind === 'tenant'
        ? launch.slug
        : learnedSlug;
  if (
    config.tenancyMode === 'multi' &&
    launch.kind !== 'album' &&
    !tenantSlug
  ) {
    return <NeutralLaunch />;
  }

  const tenantKey =
    tenantSlug ?? (launch.kind === 'album' ? `album:${launch.id}` : 'default');
  return (
    <GalleryWorkspaceContext.Provider
      value={{
        config,
        learnTenant: setLearnedSlug,
        tenantKey,
        tenantSlug,
      }}
    >
      {children}
    </GalleryWorkspaceContext.Provider>
  );
}
