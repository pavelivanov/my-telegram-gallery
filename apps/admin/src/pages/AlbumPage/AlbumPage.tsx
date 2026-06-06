import { move } from '@dnd-kit/helpers';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import {
  Button,
  Placeholder,
  Spinner,
} from '@telegram-apps/telegram-ui';
import { popup } from '@tma.js/sdk-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
} from 'react';
import { useParams } from 'react-router-dom';

import { api } from '@/api/client';
import type { AlbumDetail, Photo } from '@/api/types';
import { uploadPhoto } from '@/api/uploads';
import { Page } from '@/components/Page';

import './AlbumPage.css';

interface PendingUpload {
  id: string;
  previewUrl: string;
  status: 'uploading' | 'error';
}

// Default PointerSensor activation: long-press (250ms) on touch, short
// drag distance on mouse — plain taps still open the photo viewer.
const PhotoTile: FC<{
  photo: Photo;
  index: number;
  onOpen: (photo: Photo) => void;
}> = ({ photo, index, onOpen }) => {
  const { ref, isDragging } = useSortable({ id: photo.id, index });

  return (
    <figure
      ref={ref}
      className={`album__tile${isDragging ? ' album__tile--dragging' : ''}`}
      style={{ animationDelay: `${Math.min(index * 35, 420)}ms` }}
      onClick={() => !isDragging && onOpen(photo)}
    >
      <img className="album__tile-img" src={photo.url} alt="" loading="lazy" />
      <figcaption className="album__tile-num">
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

    await Promise.all(
      files.map(async (file) => {
        const item: PendingUpload = {
          id: crypto.randomUUID(),
          previewUrl: URL.createObjectURL(file),
          status: 'uploading',
        };
        setPending((p) => [item, ...p]);
        try {
          const photo = await uploadPhoto(id, file);
          setPending((p) => p.filter((u) => u.id !== item.id));
          setAlbum((a) =>
            a ? { ...a, photos: [photo as Photo, ...a.photos] } : a,
          );
          URL.revokeObjectURL(item.previewUrl);
        } catch (err) {
          setPending((p) =>
            p.map((u) => (u.id === item.id ? { ...u, status: 'error' } : u)),
          );
          setError((err as Error).message);
        }
      }),
    );
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
        {error ? (
          <Placeholder header="Failed to load album" description={error} />
        ) : (
          <div className="album__loading">
            <Spinner size="m" />
          </div>
        )}
      </Page>
    );
  }

  const total = album.photos.length;

  return (
    <Page>
      <div className="album__masthead">
        <span className="album__kicker">album</span>
        <h1 className="album__title">{album.name}</h1>
        <span className="album__count">
          {total} {total === 1 ? 'photo' : 'photos'}
        </span>
      </div>

      <div className="album__toolbar">
        <input
          ref={fileInput}
          className="album__file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={onFiles}
        />
        <Button size="l" stretched onClick={() => fileInput.current?.click()}>
          Upload photos
        </Button>
        {error && <p className="album__error">{error}</p>}
      </div>

      {total === 0 && pending.length === 0 ? (
        <Placeholder
          header="Empty album"
          description="Photos you upload appear here as a contact sheet. Long-press a photo to reorder."
        >
          <div className="album__empty-frame" aria-hidden>
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
            persistOrder(next);
          }}
        >
          <div className="album__grid">
            {pending.map((u) => (
              <div
                key={u.id}
                className={`album__tile album__tile--${u.status}`}
                onClick={u.status === 'error' ? () => dismissFailed(u.id) : undefined}
              >
                <img className="album__tile-img" src={u.previewUrl} alt="" />
                <div className="album__tile-veil">
                  {u.status === 'uploading' ? (
                    <Spinner size="s" />
                  ) : (
                    <span className="album__tile-error">failed — tap to dismiss</span>
                  )}
                </div>
              </div>
            ))}
            {album.photos.map((photo, i) => (
              <PhotoTile key={photo.id} photo={photo} index={i} onOpen={setViewer} />
            ))}
          </div>
        </DragDropProvider>
      )}

      {viewer && (
        <div className="album__viewer" onClick={() => !deleting && setViewer(null)}>
          <img
            className="album__viewer-img"
            src={viewer.url}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
          <div className="album__viewer-bar" onClick={(e) => e.stopPropagation()}>
            <Button
              size="m"
              mode="plain"
              disabled={deleting}
              onClick={() => setViewer(null)}
            >
              Close
            </Button>
            <Button
              size="m"
              mode="plain"
              className="album__viewer-delete"
              loading={deleting}
              onClick={() => deletePhoto(viewer)}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
};
