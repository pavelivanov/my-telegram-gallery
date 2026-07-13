import { useEffect, useState } from 'react';
import { apiUrl } from './client';

export interface PublicConfig {
  botUsername: string;
  adminAppShortName: string;
  galleryAppShortName: string;
  tenancyMode: 'single' | 'multi';
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
  if (!/^[A-Za-z0-9_-]{1,57}$/.test(albumId)) {
    throw new Error('Album ID cannot be used in a Telegram start parameter');
  }
  return buildGalleryStartLink(config, `album_${albumId}`);
}

export function buildGalleryHomeLink(
  config: PublicConfig,
  tenantSlug: string,
): string {
  if (config.tenancyMode === 'single') {
    return new URL(
      `https://t.me/${config.botUsername}/${config.galleryAppShortName}`,
    ).toString();
  }
  if (!/^[a-z0-9][a-z0-9_]{2,29}$/.test(tenantSlug)) {
    throw new Error('Tenant slug cannot be used in a Telegram start parameter');
  }
  return buildGalleryStartLink(config, `tenant_${tenantSlug}`);
}

function buildGalleryStartLink(config: PublicConfig, startParam: string): string {
  if (!/^[\x20-\x7E]+$/.test(startParam) || startParam.length >= 64) {
    throw new Error('Telegram start parameter must be fewer than 64 ASCII characters');
  }
  const link = new URL(
    `https://t.me/${config.botUsername}/${config.galleryAppShortName}`,
  );
  link.searchParams.set('startapp', startParam);
  return link.toString();
}
