import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tenant } from '@/api/types';
import { ThemePage } from './ThemePage';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  workspace: null as { selected: Tenant; tenants: Tenant[] } | null,
}));

vi.mock('@/api/client', () => ({ api: mocks.api }));
vi.mock('@/components/TenantWorkspace', () => ({
  useTenantWorkspace: () => mocks.workspace,
}));
vi.mock('@/components/Page', () => ({
  Page: ({ children }: PropsWithChildren) => children,
}));

const tenant: Tenant = {
  name: 'Alpha gallery',
  openReportCount: 0,
  plan: 'free',
  policyVersion: 'test',
  role: 'admin',
  slug: 'alpha_gallery',
  status: 'active',
  theme: 'nocturne',
  usage: {
    albumCount: 1,
    albumLimit: 1,
    photoCount: 1,
    photoLimit: 100,
    storageLimitBytes: '1000',
    storageReservedBytes: '0',
    storageUsedBytes: '100',
  },
};

describe('ThemePage', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.workspace = { selected: tenant, tenants: [tenant] };
  });

  it('previews and saves a bounded theme for a collaborator', async () => {
    const user = userEvent.setup();
    mocks.api
      .mockResolvedValueOnce(tenant)
      .mockResolvedValueOnce([
        {
          id: 'album-1',
          name: 'Existing album',
          createdAt: '2026-07-13T12:00:00.000Z',
          photoCount: 1,
          coverUrl: '/cover.jpg',
          coverThumbUrl: '/cover-thumb.jpg',
          tenantSlug: tenant.slug,
        },
      ])
      .mockResolvedValueOnce({ theme: 'paper' });

    render(<ThemePage />);
    const preview = await screen.findByLabelText('Nocturne gallery preview');
    expect(preview).toBeInTheDocument();
    expect(preview.querySelector('img')).toHaveAttribute(
      'src',
      '/cover.jpg',
    );

    await user.click(screen.getByRole('radio', { name: /Paper/ }));
    expect(screen.getByLabelText('Paper gallery preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save gallery style' }));

    expect(mocks.api).toHaveBeenLastCalledWith(
      '/tenants/alpha_gallery/theme',
      {
        method: 'PUT',
        body: JSON.stringify({ theme: 'PAPER' }),
      },
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Gallery style saved.',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save gallery style' }),
      ).toBeDisabled(),
    );
  });

  it('loads the default tenant in self-hosted single mode', async () => {
    mocks.workspace = null;
    mocks.api
      .mockResolvedValueOnce({ ...tenant, slug: 'default', role: 'owner' })
      .mockResolvedValueOnce([]);

    render(<ThemePage />);
    await screen.findByLabelText('Nocturne gallery preview');

    expect(mocks.api).toHaveBeenNthCalledWith(1, '/tenants/default');
    expect(mocks.api).toHaveBeenNthCalledWith(2, '/albums');
  });
});
