import type { ComponentType } from 'react';

import { AlbumPage } from '@/pages/AlbumPage/AlbumPage';
import { AlbumsPage } from '@/pages/AlbumsPage/AlbumsPage';
import { BillingPage } from '@/pages/BillingPage/BillingPage';

interface Route {
  path: string;
  Component: ComponentType;
  title?: string;
}

export const routes: Route[] = [
  { path: '/', Component: AlbumsPage },
  { path: '/albums/:id', Component: AlbumPage, title: 'Album' },
  { path: '/billing', Component: BillingPage, title: 'Plan' },
];
