import { move } from '@dnd-kit/helpers';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { popup } from '@tma.js/sdk-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
} from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '@/api/client';
import {
  buildGalleryAlbumLink,
  usePublicConfig,
} from '@/api/publicConfig';
import type { AlbumDetail, Photo } from '@/api/types';
import { confirmPhoto, stagePhoto } from '@/api/uploads';
import { Page } from '@/components/Page';
import { Button, Placeholder, Spinner } from '@/components/Ui';

interface PendingUpload {
  id: string;
  previewUrl: string;
  status: 'uploading' | 'error';
}

const tileClass =
  'relative m-0 aspect-square touch-manipulation overflow-hidden rounded bg-card';
const tileImgClass = 'block h-full w-full object-cover';

/**
 * Entrance animation that runs once and then detaches itself. Keeping
 * `animate-develop` on the element permanently means any DOM re-insertion
 * (React moving nodes on dnd-kit reorder) restarts the animation and the
 * tile flashes invisible. Once the animation ends, the class and delay are
 * removed so moved nodes have nothing to restart.
 */
function useEntranceAnimation(index: number) {
  const [entered, setEntered] = useState(false);
  const animationDelay = useRef(`${Math.min(index * 35, 420)}ms`).current;
  return entered
    ? { className: '', style: undefined, onAnimationEnd: undefined }
    : {
        className: ' animate-develop',
        style: { animationDelay },
        onAnimationEnd: () => setEntered(true),
      };
}

const PendingTile: FC<{
  upload: PendingUpload;
  onDismiss: (uploadId: string) => void;
}> = ({ upload, onDismiss }) => {
  const entrance = useEntranceAnimation(0);

  return (
    <div
      className={`${tileClass}${entrance.className}`}
      style={entrance.style}
      onAnimationEnd={entrance.onAnimationEnd}
      onClick={
        upload.status === 'error' ? () => onDismiss(upload.id) : undefined
      }
    >
      <img
        className={`${tileImgClass} brightness-[0.7] grayscale-[0.4]`}
        src={upload.previewUrl}
        alt=""
      />
      <div
        className={`absolute inset-0 flex items-center justify-center bg-black/25${
          upload.status === 'uploading' ? ' animate-pulse-veil' : ''
        }`}
      >
        {upload.status === 'uploading' ? (
          <Spinner className="h-4 w-4 text-white" />
        ) : (
          <span className="px-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
            failed — tap to dismiss
          </span>
        )}
      </div>
    </div>
  );
};

// Default PointerSensor activation: long-press (250ms) on touch, short
// drag distance on mouse — plain taps still open the photo viewer.
const PhotoTile: FC<{
  photo: Photo;
  index: number;
  onOpen: (photo: Photo) => void;
}> = ({ photo, index, onOpen }) => {
  const { ref, isDragging } = useSortable({ id: photo.id, index });
  const entrance = useEntranceAnimation(index);

  return (
    <figure
      ref={ref}
      className={`${tileClass}${entrance.className}${
        isDragging ? ' z-10 opacity-90 shadow-[0_8px_24px_rgba(0,0,0,0.45)]' : ''
      }`}
      style={entrance.style}
      onAnimationEnd={entrance.onAnimationEnd}
      onClick={() => !isDragging && onOpen(photo)}
    >
      <img
        className={tileImgClass}
        src={photo.thumbUrl ?? photo.url}
        alt=""
        loading="lazy"
      />
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 pt-3.5 pb-1 text-[10px] font-semibold tracking-[0.12em] tabular-nums text-white">
        {String(index + 1).padStart(3, '0')}
      </figcaption>
    </figure>
  );
};

export const AlbumPage: FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const publicConfig = usePublicConfig();

  // Gallery deep link: t.me Mini App link with the album as start param.
  const shareLink = publicConfig
    ? buildGalleryAlbumLink(publicConfig, id)
    : null;

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the link');
    }
  };

  const load = useCallback(() => {
    api<AlbumDetail>(`/albums/${id}`)
      .then(setAlbum)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same files
    if (!files.length) return;
    setError(null);

    // Pending previews append to the end of the grid in selection order.
    const entries = files.map((file) => ({
      file,
      item: {
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        status: 'uploading',
      } satisfies PendingUpload,
    }));
    setPending((p) => [...p, ...entries.map((entry) => entry.item)]);

    // Stage 1 concurrently: presign + direct PUT to R2.
    const staged = entries.map((entry) => ({
      ...entry,
      promise: stagePhoto(id, entry.file),
    }));

    // Stage 2 sequentially in selection order: the server appends each
    // confirmed photo to the album's end, so confirm order = final order.
    for (const upload of staged) {
      try {
        const photo = await confirmPhoto(await upload.promise);
        setPending((p) => p.filter((u) => u.id !== upload.item.id));
        setAlbum((a) => (a ? { ...a, photos: [...a.photos, photo] } : a));
        URL.revokeObjectURL(upload.item.previewUrl);
      } catch (err) {
        setPending((p) =>
          p.map((u) =>
            u.id === upload.item.id ? { ...u, status: 'error' } : u,
          ),
        );
        setError((err as Error).message);
      }
    }
  };

  const confirmDelete = async (): Promise<boolean> => {
    if (popup.isSupported()) {
      const button = await popup.show({
        title: 'Delete photo?',
        message: 'The photo is removed from the album and from storage.',
        buttons: [
          { id: 'delete', type: 'destructive', text: 'Delete' },
          { id: 'cancel', type: 'cancel' },
        ],
      });
      return button === 'delete';
    }
    return window.confirm('Delete photo?');
  };

  const deletePhoto = async (photo: Photo) => {
    if (deleting || !(await confirmDelete())) return;
    setDeleting(true);
    setError(null);
    try {
      await api<void>(`/photos/${photo.id}`, { method: 'DELETE' });
      setAlbum((a) =>
        a ? { ...a, photos: a.photos.filter((p) => p.id !== photo.id) } : a,
      );
      setViewer(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const persistOrder = async (photos: Photo[]) => {
    try {
      await api(`/albums/${id}/order`, {
        method: 'PUT',
        body: JSON.stringify({ photoIds: photos.map((p) => p.id) }),
      });
    } catch (err) {
      setError((err as Error).message);
      load(); // roll back to the server's order
    }
  };

  const dismissFailed = (uploadId: string) => {
    setPending((p) => {
      const failed = p.find((u) => u.id === uploadId);
      if (failed) URL.revokeObjectURL(failed.previewUrl);
      return p.filter((u) => u.id !== uploadId);
    });
  };

  if (!album) {
    return (
      <Page>
        <div className="animate-rise px-5 pt-10">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-2 text-[11px] font-medium uppercase tracking-[0.32em] text-brass transition-opacity active:opacity-60"
          >
            <span aria-hidden>←</span> albums
          </Link>
        </div>
        {error ? (
          <Placeholder header="Failed to load album" description={error} />
        ) : (
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        )}
      </Page>
    );
  }

  const total = album.photos.length;

  return (
    <Page>
      <header className="animate-rise px-5 pt-10 pb-2">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-2 text-[11px] font-medium uppercase tracking-[0.32em] text-brass transition-opacity active:opacity-60"
        >
          <span aria-hidden>←</span> albums
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="mt-2 font-display text-[28px] font-light leading-tight [overflow-wrap:anywhere]">
              {album.name}
            </h1>
            <p className="mt-2 text-[13px] tabular-nums text-ink-dim">
              {total} {total === 1 ? 'photo' : 'photos'}
            </p>
          </div>
          {shareLink && (
            <button
              type="button"
              className="mt-3 shrink-0 rounded-full bg-ink/10 px-4 py-2 text-[12px] font-medium uppercase tracking-[0.18em] text-ink transition-opacity active:opacity-60"
              onClick={() => void copyLink()}
            >
              {copied ? '✓ Copied' : 'Share'}
            </button>
          )}
        </div>
      </header>

      <div className="px-5 pt-3 pb-4">
        <input
          ref={fileInput}
          className="hidden"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void onFiles(event)}
        />
        <Button onClick={() => fileInput.current?.click()}>Upload photos</Button>
        {error && (
          <p className="mt-2.5 text-[13px] text-danger [overflow-wrap:anywhere]">
            {error}
          </p>
        )}
      </div>

      {total === 0 && pending.length === 0 ? (
        <Placeholder
          header="Empty album"
          description="Photos you upload appear here as a contact sheet. Long-press a photo to reorder."
        >
          <div
            className="flex h-24 w-24 items-center justify-center rounded-xl border-[1.5px] border-dashed border-line font-display text-[28px] text-brass"
            aria-hidden
          >
            ✦
          </div>
        </Placeholder>
      ) : (
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled || !album) return;
            const next = move(album.photos, event);
            if (next === album.photos) return;
            setAlbum({ ...album, photos: next });
            void persistOrder(next);
          }}
        >
          <div className="grid grid-cols-3 gap-[3px] px-[3px] pb-8">
            {album.photos.map((photo, i) => (
              <PhotoTile key={photo.id} photo={photo} index={i} onOpen={setViewer} />
            ))}
            {pending.map((u) => (
              <PendingTile key={u.id} upload={u} onDismiss={dismissFailed} />
            ))}
          </div>
        </DragDropProvider>
      )}

      {viewer && (
        <div
          className="animate-fade fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black/90 px-4 py-6"
          onClick={() => !deleting && setViewer(null)}
        >
          <img
            className="max-h-[calc(100%-72px)] max-w-full rounded-md object-contain"
            src={viewer.url}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex gap-6" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="plain"
              className="text-white"
              disabled={deleting}
              onClick={() => setViewer(null)}
            >
              Close
            </Button>
            <Button
              variant="plain"
              className="text-[#ff5c5c]"
              loading={deleting}
              onClick={() => void deletePhoto(viewer)}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
};
