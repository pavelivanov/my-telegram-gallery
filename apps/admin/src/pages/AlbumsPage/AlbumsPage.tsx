import { useCallback, useEffect, useState, type FC, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import type { Album } from '@/api/types';
import { Page } from '@/components/Page';
import { Button, Placeholder, Spinner } from '@/components/Ui';

export const AlbumsPage: FC = () => {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<Album[]>('/albums')
      .then(setAlbums)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const createAlbum = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const album = await api<Album>('/albums', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      setName('');
      navigate(`/albums/${album.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Page back={false}>
      <header className="animate-rise px-5 pt-10 pb-6">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
            my gallery
          </span>
          <button
            type="button"
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-dim active:text-brass"
            onClick={() => navigate('/billing')}
          >
            Plan
          </button>
        </div>
        <h1 className="mt-2 font-display text-[34px] font-light leading-none">
          Albums
        </h1>
        {albums && (
          <p className="mt-3 text-[13px] tabular-nums text-ink-dim">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'} ·{' '}
            {albums.reduce((n, a) => n + a.photoCount, 0)} photos
          </p>
        )}
      </header>

      <form
        className="mx-5 flex flex-col gap-3 rounded-2xl border border-line bg-card p-4"
        onSubmit={(event) => void createAlbum(event)}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
            New album
          </span>
          <input
            className="w-full rounded-xl border border-line bg-night px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-dim focus:border-brass"
            placeholder="Album name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
          />
        </label>
        <Button type="submit" disabled={!name.trim() || creating} loading={creating}>
          Create album
        </Button>
        {error && (
          <p className="text-[13px] text-danger [overflow-wrap:anywhere]">{error}</p>
        )}
      </form>

      {albums === null ? (
        error ? (
          <Placeholder header="Failed to load albums" description={error} />
        ) : (
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        )
      ) : albums.length === 0 ? (
        <Placeholder
          header="No albums yet"
          description="Create your first album above — photos live inside albums."
        >
          <div
            className="flex h-24 w-24 items-center justify-center rounded-xl border-[1.5px] border-dashed border-line font-display text-[28px] text-brass"
            aria-hidden
          >
            ✦
          </div>
        </Placeholder>
      ) : (
        <ul className="mx-5 mt-5 mb-12 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {albums.map((album, i) => (
            <li
              key={album.id}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i * 45, 360)}ms` }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-night"
                onClick={() => navigate(`/albums/${album.id}`)}
              >
                {album.coverThumbUrl ?? album.coverUrl ? (
                  <img
                    className="h-12 w-12 shrink-0 rounded-xl object-cover"
                    src={(album.coverThumbUrl ?? album.coverUrl)!}
                    alt=""
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-dashed border-line text-[16px] text-ink-dim"
                    aria-hidden
                  >
                    ✦
                  </div>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[16px] text-ink">{album.name}</span>
                  <span className="text-[13px] tabular-nums text-ink-dim">
                    {album.photoCount} {album.photoCount === 1 ? 'photo' : 'photos'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
};
