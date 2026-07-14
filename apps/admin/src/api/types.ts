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

export type GalleryTheme = 'nocturne' | 'paper' | 'moss';

export interface TenantBotIdentity {
  adminAppShortName: string;
  galleryAppShortName: string;
  username: string;
  verifiedAt: string;
}

export interface Tenant {
  bot: TenantBotIdentity | null;
  name: string;
  openReportCount: number;
  plan: string;
  policyVersion: string;
  role: 'owner' | 'admin';
  slug: string;
  status: 'active' | 'suspended';
  theme: GalleryTheme;
  usage: {
    albumCount: number;
    albumLimit: number;
    photoCount: number;
    photoLimit: number;
    storageLimitBytes: string;
    storageReservedBytes: string;
    storageUsedBytes: string;
  };
}

export interface TenantBotState {
  configured: boolean;
  connected: boolean;
  bot: TenantBotIdentity | null;
}

export interface TenantMember {
  createdAt: string;
  role: 'owner' | 'admin';
  tgUserId: string;
}

export interface TenantMembers {
  adminLimit: number;
  members: TenantMember[];
}

export interface PublicShareState {
  enabled: boolean;
  shareId: string | null;
}

export interface BillingState {
  configured: boolean;
  testMode: boolean;
  priceStars: number | null;
  supportContact: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  graceDays: number;
  plan: 'free' | 'pro';
  subscription: {
    status: 'active' | 'grace' | 'expired';
    currentPeriodEnd: string;
    graceEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  limits: {
    albums: number;
    photos: number;
    storageBytes: string;
    uploadBytes: number;
  };
}

export interface BillingCheckout {
  invoiceUrl: string | null;
  expiresAt: string | null;
  billing: BillingState | null;
}
