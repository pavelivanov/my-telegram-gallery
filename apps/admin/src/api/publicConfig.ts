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
  bot?: BotLinkIdentity | null,
): string {
  const identity = bot ?? {
    username: config.botUsername,
    adminAppShortName: config.adminAppShortName,
    galleryAppShortName: config.galleryAppShortName,
  };
  const link = new URL(
    `https://t.me/${identity.username}/${identity.galleryAppShortName}`,
  );
  link.searchParams.set('startapp', `album_${albumId}`);
  return link.toString();
}

export function buildGalleryHomeLink(
  config: PublicConfig,
  tenantSlug: string,
  bot?: BotLinkIdentity | null,
): string {
  const identity = bot ?? {
    username: config.botUsername,
    adminAppShortName: config.adminAppShortName,
    galleryAppShortName: config.galleryAppShortName,
  };
  const link = new URL(
    `https://t.me/${identity.username}/${identity.galleryAppShortName}`,
  );
  link.searchParams.set('startapp', `tenant_${tenantSlug}`);
  return link.toString();
}

export function buildAdminTenantLink(
  tenantSlug: string,
  bot: BotLinkIdentity,
): string {
  const link = new URL(
    `https://t.me/${bot.username}/${bot.adminAppShortName}`,
  );
  link.searchParams.set('startapp', `tenant_${tenantSlug}`);
  return link.toString();
}
