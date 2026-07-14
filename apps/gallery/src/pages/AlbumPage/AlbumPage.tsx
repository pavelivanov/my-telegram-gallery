import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FC } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '@/api/client';
import {
  buildGalleryAlbumLink,
} from '@/api/publicConfig';
import type { AlbumDetail } from '@/api/types';
import { useGalleryWorkspace } from '@/components/GalleryWorkspace';
import { Page } from '@/components/Page';
import { PhotoViewer } from '@/components/PhotoViewer/PhotoViewer';
import { ErrorNote, Loading } from '@/pages/AlbumsPage/AlbumsPage';

const PRELOAD_BATCH = 5;

/** Resolves when the image is in the browser cache (or failed). */
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

export const AlbumPage: FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { config, learnTenant, presentation, tenantKey, tenantSlug } =
    useGalleryWorkspace();
  const { data: album, error } = useQuery({
    queryKey: ['tenant', tenantKey, 'albums', id],
    queryFn: () =>
      api<AlbumDetail>(`/albums/${id}`, undefined, tenantSlug ?? undefined),
  });
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);

  // Deep link into this album (handled by StartParamRedirect on launch).
  const shareLink = buildGalleryAlbumLink(config, id, presentation.bot);

  useEffect(() => {
    if (!album || tenantSlug === album.tenantSlug) return;
    queryClient.setQueryData(
      ['tenant', album.tenantSlug, 'albums', id],
      album,
    );
    learnTenant(album.tenantSlug);
  }, [album, id, learnTenant, queryClient, tenantSlug]);

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — ignore.
    }
  };

  const reportAlbum = async () => {
    if (
      !album ||
      reporting ||
      !window.confirm('Report this album to the service operator?')
    ) return;
    setReporting(true);
    setReportResult(null);
    try {
      await api(
        '/reports',
        {
          method: 'POST',
          body: JSON.stringify({ albumId: album.id, reason: 'OTHER' }),
        },
        album.tenantSlug,
      );
      setReportResult('Report sent. Thank you.');
    } catch (caught) {
      setReportResult((caught as Error).message);
    } finally {
      setReporting(false);
    }
  };

  // Live priority for the preloader: the photo currently open in the viewer.
  const priorityRef = useRef<number | null>(null);
  priorityRef.current = viewerIndex;

  // Warm the browser cache with the full-size photos in the background,
  // in small batches. Each batch is picked nearest the photo open in the
  // viewer — an opened photo must not wait behind the rest of the queue —
  // or from the start of the list when the viewer is closed.
  useEffect(() => {
    if (!album) return;
    let cancelled = false;
    const urls = album.photos.map((p) => p.url);
    const loaded = new Set<number>();
    void (async () => {
      while (!cancelled && loaded.size < urls.length) {
        const center = priorityRef.current;
        const batch = [...urls.keys()]
          .filter((i) => !loaded.has(i))
          .sort((a, b) =>
            center === null
              ? a - b
              : Math.abs(a - center) - Math.abs(b - center),
          )
          .slice(0, PRELOAD_BATCH);
        await Promise.all(
          batch.map(async (i) => {
            await preloadImage(urls[i]);
            loaded.add(i);
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [album]);

  if (!album) {
    return (
      <Page>{error ? <ErrorNote message={error.message} /> : <Loading />}</Page>
    );
  }

  const total = album.photos.length;

  return (
    <Page>
      <header className="animate-rise px-5 pt-4 pb-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-[28px] leading-tight">
            {album.name}
          </h1>
          {shareLink && (
            <button
              type="button"
              className="shrink-0 rounded-full bg-ink/10 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-ink transition-opacity active:opacity-60"
              onClick={() => void copyLink()}
            >
              {copied ? '✓ Copied' : 'Share'}
            </button>
          )}
        </div>
        <div className="mt-2 text-[13px] text-ink-dim">
          {total} {total === 1 ? 'photo' : 'photos'}
        </div>
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

      <div className="px-5 pb-10 text-center">
        <button
          type="button"
          className="text-[12px] text-ink-dim underline decoration-line underline-offset-4 disabled:opacity-50"
          disabled={reporting}
          onClick={() => void reportAlbum()}
        >
          {reporting ? 'Sending report…' : 'Report this album'}
        </button>
        {reportResult && (
          <p className="mt-2 text-[12px] text-ink-dim [overflow-wrap:anywhere]">
            {reportResult}
          </p>
        )}
      </div>

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
