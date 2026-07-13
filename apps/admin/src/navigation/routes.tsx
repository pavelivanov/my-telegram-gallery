import type { ComponentType } from 'react';

import { AlbumPage } from '@/pages/AlbumPage/AlbumPage';
import { AlbumsPage } from '@/pages/AlbumsPage/AlbumsPage';
import { BillingPage } from '@/pages/BillingPage/BillingPage';
import { TeamPage } from '@/pages/TeamPage/TeamPage';
import { ThemePage } from '@/pages/ThemePage/ThemePage';

interface Route {
  path: string;
  Component: ComponentType;
  title?: string;
}

export const routes: Route[] = [
  { path: '/', Component: AlbumsPage },
  { path: '/albums/:id', Component: AlbumPage, title: 'Album' },
  { path: '/billing', Component: BillingPage, title: 'Plan' },
  { path: '/team', Component: TeamPage, title: 'Team' },
  { path: '/theme', Component: ThemePage, title: 'Gallery style' },
];
