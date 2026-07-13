import {
  useEffect,
  useState,
  type CSSProperties,
  type FC,
} from 'react';

import { api } from '@/api/client';
import type { Album, GalleryTheme, Tenant } from '@/api/types';
import { Page } from '@/components/Page';
import { useTenantWorkspace } from '@/components/TenantWorkspace';
import { Button, Placeholder, Spinner } from '@/components/Ui';

interface ThemePreset {
  accent: string;
  background: string;
  card: string;
  description: string;
  id: GalleryTheme;
  ink: string;
  label: string;
  line: string;
  muted: string;
}

const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'nocturne',
    label: 'Nocturne',
    description: 'Warm black, ivory, and brass for an intimate exhibition.',
    background: '#0e0c09',
    card: '#17140f',
    line: '#2b261d',
    ink: '#f2ede3',
    muted: '#9a917e',
    accent: '#c9a35c',
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Soft parchment and walnut for daylight collections.',
    background: '#eee7dc',
    card: '#f8f4ed',
    line: '#d2c7b8',
    ink: '#211d18',
    muted: '#756d62',
    accent: '#9a632e',
  },
  {
    id: 'moss',
    label: 'Moss',
    description: 'Deep green and lichen for landscapes and field notes.',
    background: '#0f1612',
    card: '#18221b',
    line: '#29382d',
    ink: '#edf0e8',
    muted: '#98a295',
    accent: '#aeb974',
  },
] as const;

function presetStyle(preset: ThemePreset): CSSProperties {
  return {
    '--color-night': preset.background,
    '--color-card': preset.card,
    '--color-line': preset.line,
    '--color-ink': preset.ink,
    '--color-ink-dim': preset.muted,
    '--color-brass': preset.accent,
  } as CSSProperties;
}

function ThemePreview({
  coverUrl,
  name,
  preset,
}: {
  coverUrl: string | null;
  name: string;
  preset: ThemePreset;
}) {
  return (
    <section
      aria-label={`${preset.label} gallery preview`}
      className="overflow-hidden border border-line bg-night text-ink shadow-2xl shadow-black/20"
      style={presetStyle(preset)}
    >
      <div className="px-5 pt-7 pb-5">
        <span className="text-[9px] font-medium uppercase tracking-[0.3em] text-brass">
          the collection
        </span>
        <h2 className="mt-2 truncate font-display text-[27px] font-light leading-none">
          {name}
        </h2>
        <p className="mt-2 text-[11px] text-ink-dim">3 albums · 42 photos</p>
      </div>
      <div className="mx-5 mb-7 border border-line bg-card p-2">
        {coverUrl ? (
          <img
            className="aspect-[16/9] w-full object-cover"
            src={coverUrl}
            alt=""
          />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center bg-line font-display text-3xl text-brass">
            ✦
          </div>
        )}
        <div className="flex items-baseline justify-between gap-4 px-2 pt-3 pb-1">
          <span className="font-display text-[17px]">Selected works</span>
          <span className="text-[10px] text-ink-dim">12 photos</span>
        </div>
      </div>
    </section>
  );
}

export const ThemePage: FC = () => {
  const workspace = useTenantWorkspace();
  const slug = workspace?.selected.slug ?? 'default';
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<GalleryTheme>('nocturne');
  const [savedTheme, setSavedTheme] = useState<GalleryTheme>('nocturne');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setTenant(null);
    setError(null);
    void api<Tenant>(`/tenants/${slug}`)
      .then((loadedTenant) => {
        if (!active) return;
        setTenant(loadedTenant);
        setTheme(loadedTenant.theme);
        setSavedTheme(loadedTenant.theme);
      })
      .catch((caught: unknown) => {
        if (active) setError((caught as Error).message);
      });
    void api<Album[]>('/albums')
      .then((albums) => {
        if (active) {
          setCoverUrl(
            albums.find((album) => album.coverUrl)?.coverUrl ?? null,
          );
        }
      })
      .catch(() => {
        // A cover is optional; theme management remains available without one.
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const save = async () => {
    if (!tenant || saving || theme === savedTheme) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api<{ theme: GalleryTheme }>(
        `/tenants/${tenant.slug}/theme`,
        {
          method: 'PUT',
          body: JSON.stringify({ theme: theme.toUpperCase() }),
        },
      );
      setSavedTheme(result.theme);
      setTheme(result.theme);
      setMessage('Gallery style saved.');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !tenant) {
    return <Placeholder header="Could not load gallery style" description={error} />;
  }
  if (!tenant) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const selected =
    THEME_PRESETS.find((preset) => preset.id === theme) ?? THEME_PRESETS[0];

  return (
    <Page backTo="/">
      <main className="mx-auto max-w-xl px-5 pt-8 pb-12">
        <header className="animate-rise">
          <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
            gallery presentation
          </span>
          <h1 className="mt-3 font-display text-[36px] font-light leading-none">
            Choose an atmosphere
          </h1>
          <p className="mt-4 max-w-lg text-[14px] leading-6 text-ink-dim">
            Presets change the gallery surface while keeping photographs,
            typography, and sharing behavior consistent.
          </p>
        </header>

        <div className="animate-rise mt-8" style={{ animationDelay: '80ms' }}>
          <ThemePreview
            coverUrl={coverUrl}
            name={tenant.name}
            preset={selected}
          />
        </div>

        <fieldset className="mt-9 border-t border-line">
          <legend className="sr-only">Gallery theme</legend>
          {THEME_PRESETS.map((preset) => (
            <label
              key={preset.id}
              className="flex cursor-pointer items-center gap-4 border-b border-line py-4"
            >
              <input
                className="sr-only"
                type="radio"
                name="gallery-theme"
                value={preset.id}
                checked={theme === preset.id}
                disabled={saving}
                onChange={() => {
                  setTheme(preset.id);
                  setMessage(null);
                }}
              />
              <span
                className="flex h-10 w-10 shrink-0 overflow-hidden border border-line"
                aria-hidden
              >
                <span
                  className="h-full flex-1"
                  style={{ background: preset.background }}
                />
                <span
                  className="h-full flex-1"
                  style={{ background: preset.accent }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[18px] text-ink">
                  {preset.label}
                </span>
                <span className="mt-0.5 block text-[12px] leading-5 text-ink-dim">
                  {preset.description}
                </span>
              </span>
              <span
                className={`text-lg ${theme === preset.id ? 'text-brass' : 'text-line'}`}
                aria-hidden
              >
                {theme === preset.id ? '●' : '○'}
              </span>
            </label>
          ))}
        </fieldset>

        {error ? (
          <p className="mt-5 text-[13px] text-danger [overflow-wrap:anywhere]">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-5 text-[13px] text-ink-dim" role="status">
            {message}
          </p>
        ) : null}

        <div className="mt-7">
          <Button
            type="button"
            disabled={theme === savedTheme || saving}
            loading={saving}
            onClick={() => void save()}
          >
            Save gallery style
          </Button>
        </div>
      </main>
    </Page>
  );
};
