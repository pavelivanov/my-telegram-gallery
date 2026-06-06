import {
  Button,
  Cell,
  Image,
  Input,
  List,
  Placeholder,
  Section,
  Spinner,
} from '@telegram-apps/telegram-ui';
import { useCallback, useEffect, useState, type FC, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api/client';
import type { Album } from '@/api/types';
import { Page } from '@/components/Page';

import './AlbumsPage.css';

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
      <div className="albums__masthead">
        <span className="albums__kicker">my gallery</span>
        <h1 className="albums__title">Albums</h1>
        {albums && (
          <span className="albums__count">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'} ·{' '}
            {albums.reduce((n, a) => n + a.photoCount, 0)} photos
          </span>
        )}
      </div>

      <List>
        <Section footer={error ?? undefined}>
          <form className="albums__create" onSubmit={createAlbum}>
            <Input
              header="New album"
              placeholder="Album name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creating}
            />
            <div className="albums__create-action">
              <Button
                size="m"
                stretched
                type="submit"
                disabled={!name.trim() || creating}
                loading={creating}
              >
                Create album
              </Button>
            </div>
          </form>
        </Section>

        {albums === null ? (
          error ? (
            <Placeholder header="Failed to load albums" description={error} />
          ) : (
            <div className="albums__loading">
              <Spinner size="m" />
            </div>
          )
        ) : albums.length === 0 ? (
          <Placeholder
            header="No albums yet"
            description="Create your first album above — photos live inside albums."
          >
            <div className="albums__empty-frame" aria-hidden>
              ✦
            </div>
          </Placeholder>
        ) : (
          <Section>
            {albums.map((album, i) => (
              <Cell
                key={album.id}
                className="albums__cell"
                style={{ animationDelay: `${Math.min(i * 45, 360)}ms` }}
                before={
                  album.coverUrl ? (
                    <Image size={48} src={album.coverUrl} />
                  ) : (
                    <div className="albums__cover-blank" aria-hidden>
                      ✦
                    </div>
                  )
                }
                subtitle={`${album.photoCount} ${album.photoCount === 1 ? 'photo' : 'photos'}`}
                onClick={() => navigate(`/albums/${album.id}`)}
              >
                {album.name}
              </Cell>
            ))}
          </Section>
        )}
      </List>
    </Page>
  );
};
