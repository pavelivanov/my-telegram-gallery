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

export interface Tenant {
  name: string;
  openReportCount: number;
  plan: string;
  policyVersion: string;
  slug: string;
  status: 'active' | 'suspended';
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
