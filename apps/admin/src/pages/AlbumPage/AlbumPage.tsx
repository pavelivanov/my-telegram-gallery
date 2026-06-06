import {
  Button,
  Placeholder,
  Spinner,
} from '@telegram-apps/telegram-ui';
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

export const AlbumPage: FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          description="Photos you upload appear here as a contact sheet."
        >
          <div className="album__empty-frame" aria-hidden>
            ✦
          </div>
        </Placeholder>
      ) : (
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
            <figure
              key={photo.id}
              className="album__tile"
              style={{ animationDelay: `${Math.min(i * 35, 420)}ms` }}
            >
              <img
                className="album__tile-img"
                src={photo.url}
                alt=""
                loading="lazy"
              />
              <figcaption className="album__tile-num">
                {String(total - i).padStart(3, '0')}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Page>
  );
};
