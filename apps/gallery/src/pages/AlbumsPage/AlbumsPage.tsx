import { useEffect, useState, type FC } from 'react';
import { Link } from 'react-router-dom';

import { api } from '@/api/client';
import type { Album } from '@/api/types';
import { Page } from '@/components/Page';

export const AlbumsPage: FC = () => {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Album[]>('/albums')
      .then(setAlbums)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Page back={false}>
      <header className="animate-rise px-5 pt-10 pb-6">
        <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
          the collection
        </span>
        <h1 className="mt-2 font-display text-[34px] font-light italic leading-none">
          Gallery
        </h1>
        {albums && albums.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-dim">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'} ·{' '}
            {albums.reduce((n, a) => n + a.photoCount, 0)} photos
          </p>
        )}
      </header>

      {albums === null ? (
        error ? (
          <ErrorNote message={error} />
        ) : (
          <Loading />
        )
      ) : albums.length === 0 ? (
        <div className="animate-fade px-5 py-24 text-center">
          <span className="font-display text-3xl text-brass" aria-hidden>
            ✦
          </span>
          <p className="mt-4 text-[15px] text-ink-dim">
            Nothing here yet — albums appear once they are published.
          </p>
        </div>
      ) : (
        <ul className="space-y-5 px-5 pb-12">
          {albums.map((album, i) => (
            <li
              key={album.id}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i * 70, 420)}ms` }}
            >
              <Link
                to={`/albums/${album.id}`}
                className="group relative block overflow-hidden rounded-2xl border border-line bg-card"
              >
                {album.coverUrl ? (
                  <img
                    className="aspect-[4/3] w-full object-cover transition-transform duration-700 ease-out group-active:scale-[1.03]"
                    src={album.coverUrl}
                    alt={album.name}
                    loading={i < 3 ? 'eager' : 'lazy'}
                  />
                ) : (
                  <div
                    className="flex aspect-[4/3] w-full items-center justify-center font-display text-3xl text-line"
                    aria-hidden
                  >
                    ✦
                  </div>
                )}

                {/* Scrim so the title stays readable on any photo. */}
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-night/90 via-night/35 to-transparent" />

                <span className="absolute top-3 right-4 text-[11px] font-medium tracking-[0.2em] text-ink/70">
                  {String(i + 1).padStart(3, '0')}
                </span>

                <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-3 px-4 pb-3.5">
                  <h2 className="font-display text-[22px] font-light leading-tight">
                    {album.name}
                  </h2>
                  <span className="shrink-0 text-[12px] text-ink-dim">
                    {album.photoCount}{' '}
                    {album.photoCount === 1 ? 'photo' : 'photos'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
};

export const Loading: FC = () => (
  <div className="flex justify-center py-24" aria-label="Loading">
    <span className="inline-block animate-spin font-display text-2xl text-brass [animation-duration:2.5s]">
      ✦
    </span>
  </div>
);

export const ErrorNote: FC<{ message: string }> = ({ message }) => (
  <div className="animate-fade px-5 py-24 text-center">
    <p className="font-display text-xl">Could not load</p>
    <p className="mt-2 break-words text-[13px] text-ink-dim">{message}</p>
  </div>
);
