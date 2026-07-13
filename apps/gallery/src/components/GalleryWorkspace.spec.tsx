import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GalleryWorkspace, useGalleryWorkspace } from './GalleryWorkspace';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  getPublicConfig: vi.fn(),
}));

vi.mock('@/api/client', () => ({ api: mocks.api }));
vi.mock('@/api/publicConfig', () => ({
  getPublicConfig: mocks.getPublicConfig,
}));

function WorkspaceProbe() {
  const { presentation, tenantSlug } = useGalleryWorkspace();
  return (
    <div>
      {presentation.name}:{presentation.theme}:{tenantSlug}
    </div>
  );
}

describe('GalleryWorkspace', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.getPublicConfig.mockReset();
    delete document.documentElement.dataset.galleryTheme;
  });

  it('loads and applies a selected tenant presentation before rendering', async () => {
    mocks.getPublicConfig.mockResolvedValue({ tenancyMode: 'multi' });
    mocks.api.mockResolvedValue({
      name: 'Field notes',
      slug: 'field_notes',
      theme: 'moss',
    });

    render(
      <GalleryWorkspace startParam="tenant_field_notes">
        <WorkspaceProbe />
      </GalleryWorkspace>,
    );

    expect(
      await screen.findByText('Field notes:moss:field_notes'),
    ).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith(
      '/tenants/presentation',
      undefined,
      'field_notes',
    );
    expect(document.documentElement.dataset.galleryTheme).toBe('moss');
  });

  it('lets an album start parameter resolve its tenant on the server', async () => {
    mocks.getPublicConfig.mockResolvedValue({ tenancyMode: 'multi' });
    mocks.api.mockResolvedValue({
      name: 'Deep collection',
      slug: 'deep_collection',
      theme: 'paper',
    });

    render(
      <GalleryWorkspace startParam="album_album1">
        <WorkspaceProbe />
      </GalleryWorkspace>,
    );

    expect(
      await screen.findByText('Deep collection:paper:'),
    ).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith(
      '/tenants/presentation',
      undefined,
      undefined,
    );
  });
});
