import { useEffect, useState, type FC } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '@/api/client';
import type { AlbumDetail } from '@/api/types';
import { Page } from '@/components/Page';
import { PhotoViewer } from '@/components/PhotoViewer/PhotoViewer';
import { ErrorNote, Loading } from '@/pages/AlbumsPage/AlbumsPage';

export const AlbumPage: FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    api<AlbumDetail>(`/albums/${id}`)
      .then(setAlbum)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (!album) {
    return (
      <Page>
        <div className="animate-rise px-5 pt-10">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-2 text-[11px] font-medium uppercase tracking-[0.32em] text-brass transition-opacity active:opacity-60"
          >
            <span aria-hidden>←</span> the collection
          </Link>
        </div>
        {error ? <ErrorNote message={error} /> : <Loading />}
      </Page>
    );
  }

  const total = album.photos.length;

  return (
    <Page>
      <header className="animate-rise px-5 pt-10 pb-6">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-2 text-[11px] font-medium uppercase tracking-[0.32em] text-brass transition-opacity active:opacity-60"
        >
          <span aria-hidden>←</span> the collection
        </Link>
        <h1 className="mt-2 font-display text-[28px] leading-tight">
          {album.name}
        </h1>
        <p className="mt-2 text-[13px] text-ink-dim">
          {total} {total === 1 ? 'photo' : 'photos'}
        </p>
      </header>

      {total === 0 ? (
        <div className="animate-fade px-5 py-24 text-center">
          <span className="font-display text-3xl text-brass" aria-hidden>
            ✦
          </span>
          <p className="mt-4 text-[15px] text-ink-dim">This album is empty.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-0.5 pb-12">
          {album.photos.map((photo, i) => (
            <li
              key={photo.id}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i * 30, 360)}ms` }}
            >
              <button
                type="button"
                className="block aspect-square w-full rounded overflow-hidden bg-card"
                onClick={() => setViewerIndex(i)}
              >
                <img
                  className="h-full w-full object-cover"
                  src={photo.thumbUrl ?? photo.url}
                  alt=""
                  loading="lazy"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={album.photos}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </Page>
  );
};
