import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';

import { publicApi } from '@/api/client';
import {
  buildGalleryHomeLink,
  usePublicConfigState,
} from '@/api/publicConfig';
import type {
  GalleryTheme,
  PublicAlbumDetail,
  PublicGalleryHome,
  PublicGalleryInfo,
} from '@/api/types';
import { PhotoViewer } from '@/components/PhotoViewer/PhotoViewer';
import { PublicReportForm } from './PublicReportForm';

function useGalleryTheme(theme: GalleryTheme | undefined) {
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.galleryTheme = theme;
    return () => {
      delete document.documentElement.dataset.galleryTheme;
    };
  }, [theme]);
}

function TelegramLink({ gallery }: { gallery: PublicGalleryInfo }) {
  const { config } = usePublicConfigState();
  if (!config) return null;
  return (
    <a
      className="public-action"
      href={buildGalleryHomeLink(config, gallery.telegramSlug)}
      rel="noreferrer"
      target="_blank"
    >
      Open in Telegram ↗
    </a>
  );
}

function PublicUnavailable() {
  return (
    <main className="public-unavailable">
      <a className="public-brand" href="/">
        Gallery<span>.</span>
      </a>
      <h1>Gallery unavailable</h1>
      <p>The link may have been disabled, replaced, or suspended.</p>
    </main>
  );
}

function PublicLoading() {
  return (
    <div className="public-loading" aria-label="Loading gallery">
      <span>✦</span>
    </div>
  );
}

function PublicGalleryHomePage() {
  const { shareId = '' } = useParams<{ shareId: string }>();
  const { data, error } = useQuery({
    queryKey: ['public-gallery', shareId],
    queryFn: () =>
      publicApi<PublicGalleryHome>(`/galleries/${encodeURIComponent(shareId)}`),
    retry: false,
  });
  useGalleryTheme(data?.gallery.theme);

  if (error) return <PublicUnavailable />;
  if (!data) return <PublicLoading />;

  return (
    <main className="public-gallery">
      <header className="public-gallery__header">
        <a className="public-brand" href="/">
          Gallery<span>.</span>
        </a>
        <TelegramLink gallery={data.gallery} />
        <p>The collection</p>
        <h1>{data.gallery.name}</h1>
        <span>
          {data.albums.length}{' '}
          {data.albums.length === 1 ? 'album' : 'albums'} ·{' '}
          {data.albums.reduce((total, album) => total + album.photoCount, 0)}{' '}
          photos
        </span>
      </header>

      {data.albums.length === 0 ? (
        <section className="public-empty">
          <span aria-hidden>✦</span>
          <p>This collection has no published albums yet.</p>
        </section>
      ) : (
        <ol className="public-album-index">
          {data.albums.map((album, index) => (
            <li key={album.id}>
              <Link to={`/public/${shareId}/albums/${album.id}`}>
                <figure>
                  {album.coverUrl ? (
                    <img
                      src={album.coverUrl}
                      alt=""
                      loading={index < 2 ? 'eager' : 'lazy'}
                    />
                  ) : (
                    <div className="public-album-index__empty" aria-hidden>
                      ✦
                    </div>
                  )}
                  <figcaption>
                    <span>{String(index + 1).padStart(3, '0')}</span>
                    <h2>{album.name}</h2>
                    <p>{album.photoCount} photos</p>
                  </figcaption>
                </figure>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <footer className="public-gallery__footer">
        <TelegramLink gallery={data.gallery} />
        <PublicReportForm shareId={shareId} />
      </footer>
    </main>
  );
}

function PublicAlbumPage() {
  const { shareId = '', albumId = '' } = useParams<{
    shareId: string;
    albumId: string;
  }>();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { data, error } = useQuery({
    queryKey: ['public-gallery', shareId, 'album', albumId],
    queryFn: () =>
      publicApi<PublicAlbumDetail>(
        `/galleries/${encodeURIComponent(shareId)}/albums/${encodeURIComponent(albumId)}`,
      ),
    retry: false,
  });
  useGalleryTheme(data?.gallery.theme);

  if (error) return <PublicUnavailable />;
  if (!data) return <PublicLoading />;

  return (
    <main className="public-album">
      <header className="public-album__header">
        <Link to={`/public/${shareId}`}>← {data.gallery.name}</Link>
        <p>Album</p>
        <h1>{data.album.name}</h1>
        <span>
          {data.album.photos.length}{' '}
          {data.album.photos.length === 1 ? 'photograph' : 'photographs'}
        </span>
      </header>

      {data.album.photos.length === 0 ? (
        <section className="public-empty">
          <span aria-hidden>✦</span>
          <p>This album is empty.</p>
        </section>
      ) : (
        <ol className="public-photo-grid">
          {data.album.photos.map((photo, index) => (
            <li key={photo.id}>
              <button type="button" onClick={() => setViewerIndex(index)}>
                <img
                  src={photo.thumbUrl ?? photo.url}
                  alt=""
                  loading={index < 6 ? 'eager' : 'lazy'}
                />
              </button>
            </li>
          ))}
        </ol>
      )}

      <footer className="public-gallery__footer">
        <TelegramLink gallery={data.gallery} />
        <PublicReportForm shareId={shareId} albumId={data.album.id} />
      </footer>

      {viewerIndex !== null ? (
        <PhotoViewer
          photos={data.album.photos}
          initialIndex={viewerIndex}
          showClose
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </main>
  );
}

export function PublicGalleryApp() {
  return (
    <Routes>
      <Route path="/public/:shareId" element={<PublicGalleryHomePage />} />
      <Route
        path="/public/:shareId/albums/:albumId"
        element={<PublicAlbumPage />}
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
