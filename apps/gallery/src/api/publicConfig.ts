import { useEffect, useState } from 'react';
import { apiUrl } from './client';

export interface PublicConfig {
  botUsername: string;
  adminAppShortName: string;
  galleryAppShortName: string;
  privacyUrl: string | null;
  sourceUrl: string;
  tenancyMode: 'single' | 'multi';
  termsUrl: string | null;
  uploadMaxBytes: number;
  version: string;
}

export interface BotLinkIdentity {
  adminAppShortName: string;
  galleryAppShortName: string;
  username: string;
}

let configPromise: Promise<PublicConfig> | undefined;

interface PublicConfigState {
  config: PublicConfig | null;
  failed: boolean;
}

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

export function usePublicConfigState(): PublicConfigState {
  const [state, setState] = useState<PublicConfigState>({
    config: null,
    failed: false,
  });

  useEffect(() => {
    let active = true;
    void getPublicConfig()
      .then((value) => {
        if (active) setState({ config: value, failed: false });
      })
      .catch(() => {
        if (active) setState({ config: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function usePublicConfig(): PublicConfig | null {
  return usePublicConfigState().config;
}

export function buildGalleryAlbumLink(
  config: PublicConfig,
  albumId: string,
  bot?: BotLinkIdentity | null,
): string {
  if (!/^[A-Za-z0-9_-]{1,57}$/.test(albumId)) {
    throw new Error('Album ID cannot be used in a Telegram start parameter');
  }
  return buildGalleryStartLink(config, `album_${albumId}`, bot);
}

export function buildAdminHomeLink(config: PublicConfig): string {
  return new URL(
    `https://t.me/${config.botUsername}/${config.adminAppShortName}`,
  ).toString();
}

export function buildGalleryHomeLink(
  config: PublicConfig,
  tenantSlug: string,
  bot?: BotLinkIdentity | null,
): string {
  if (config.tenancyMode === 'single' && !bot) {
    return new URL(
      `https://t.me/${config.botUsername}/${config.galleryAppShortName}`,
    ).toString();
  }
  if (!/^[a-z0-9][a-z0-9_]{2,29}$/.test(tenantSlug)) {
    throw new Error('Tenant slug cannot be used in a Telegram start parameter');
  }
  return buildGalleryStartLink(config, `tenant_${tenantSlug}`, bot);
}

function buildGalleryStartLink(
  config: PublicConfig,
  startParam: string,
  bot?: BotLinkIdentity | null,
): string {
  if (!/^[\x20-\x7E]+$/.test(startParam) || startParam.length >= 64) {
    throw new Error('Telegram start parameter must be fewer than 64 ASCII characters');
  }
  const identity = bot ?? {
    username: config.botUsername,
    adminAppShortName: config.adminAppShortName,
    galleryAppShortName: config.galleryAppShortName,
  };
  const link = new URL(
    `https://t.me/${identity.username}/${identity.galleryAppShortName}`,
  );
  link.searchParams.set('startapp', startParam);
  return link.toString();
}
