import type { ComponentType } from 'react';

import { AlbumPage } from '@/pages/AlbumPage/AlbumPage';
import { AlbumsPage } from '@/pages/AlbumsPage/AlbumsPage';

interface Route {
  path: string;
  Component: ComponentType;
}

export const routes: Route[] = [
  { path: '/', Component: AlbumsPage },
  { path: '/albums/:id', Component: AlbumPage },
];
