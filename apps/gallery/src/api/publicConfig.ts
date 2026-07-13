import { useEffect, useState } from 'react';
import { apiUrl } from './client';

export interface PublicConfig {
  botUsername: string;
  adminAppShortName: string;
  galleryAppShortName: string;
  tenancyMode: 'single';
  uploadMaxBytes: number;
}

let configPromise: Promise<PublicConfig> | undefined;

export function getPublicConfig(): Promise<PublicConfig> {
  configPromise ??= fetch(apiUrl('/api/config/public')).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(`Public config ${response.status}`);
      }
      return (await response.json()) as PublicConfig;
    },
  );
  return configPromise;
}

export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    let active = true;
    void getPublicConfig()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return config;
}

export function buildGalleryAlbumLink(
  config: PublicConfig,
  albumId: string,
): string {
  const link = new URL(
    `https://t.me/${config.botUsername}/${config.galleryAppShortName}`,
  );
  link.searchParams.set('startapp', `album_${albumId}`);
  return link.toString();
}
