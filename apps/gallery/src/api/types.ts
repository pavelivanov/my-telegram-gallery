export type GalleryTheme = 'nocturne' | 'paper' | 'moss';

export interface GalleryPresentation {
  name: string;
  slug: string;
  theme: GalleryTheme;
}

export interface PublicGalleryInfo {
  name: string;
  telegramSlug: string;
  theme: GalleryTheme;
}

export interface PublicAlbum {
  id: string;
  name: string;
  createdAt: string;
  photoCount: number;
  coverUrl: string | null;
  coverThumbUrl: string | null;
}

export interface PublicGalleryHome {
  gallery: PublicGalleryInfo;
  albums: PublicAlbum[];
}

export interface PublicAlbumDetail {
  gallery: PublicGalleryInfo;
  album: {
    id: string;
    name: string;
    createdAt: string;
    photos: Photo[];
  };
}

export interface Album {
  id: string;
  name: string;
  createdAt: string;
  photoCount: number;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  tenantSlug: string;
}

export interface Photo {
  id: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  position: number;
  createdAt: string;
  url: string;
  thumbUrl: string | null;
}

export interface AlbumDetail {
  id: string;
  name: string;
  createdAt: string;
  tenantSlug: string;
  photos: Photo[];
}
