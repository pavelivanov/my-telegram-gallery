export interface Album {
  id: string;
  name: string;
  createdAt: string;
  photoCount: number;
  coverUrl: string | null;
  coverThumbUrl: string | null;
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
  photos: Photo[];
}
