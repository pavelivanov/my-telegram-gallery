import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tenant } from '@/api/types';
import { PublicSharePage } from './PublicSharePage';

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
  bot: null,
  name: 'Alpha gallery',
  openReportCount: 0,
  plan: 'free',
  policyVersion: 'test',
  role: 'owner',
  slug: 'alpha_gallery',
  status: 'active',
  theme: 'paper',
  usage: {
    albumCount: 1,
    albumLimit: 1,
    photoCount: 0,
    photoLimit: 100,
    storageLimitBytes: '1000',
    storageReservedBytes: '0',
    storageUsedBytes: '0',
  },
};

describe('PublicSharePage', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.workspace = { selected: tenant, tenants: [tenant] };
  });

  it('requires confirmation and exposes only the returned opaque link', async () => {
    const user = userEvent.setup();
    const shareId = 'a'.repeat(32);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.api
      .mockResolvedValueOnce({ enabled: false, shareId: null })
      .mockResolvedValueOnce({ enabled: true, shareId });

    render(<PublicSharePage />);
    await screen.findByText('Telegram only');
    await user.click(screen.getByRole('button', { name: 'Create public link' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Create a public link? Anyone with it can view this gallery outside Telegram.',
    );
    expect(mocks.api).toHaveBeenLastCalledWith(
      '/tenants/alpha_gallery/public-share',
      { method: 'POST' },
    );
    expect(await screen.findByText('Published')).toBeInTheDocument();
    expect(screen.getByDisplayValue(new RegExp(`/#/public/${shareId}$`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/#/public/${shareId}`),
    );
  });

  it('revokes the current link after an explicit confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.api
      .mockResolvedValueOnce({ enabled: true, shareId: 'b'.repeat(32) })
      .mockResolvedValueOnce({ enabled: false, shareId: null });

    render(<PublicSharePage />);
    await screen.findByText('Published');
    await user.click(screen.getByRole('button', { name: 'Disable public link' }));

    expect(mocks.api).toHaveBeenLastCalledWith(
      '/tenants/alpha_gallery/public-share',
      { method: 'DELETE' },
    );
    expect(await screen.findByText('Telegram only')).toBeInTheDocument();
  });

  it('does not reveal sharing controls to a collaborator', () => {
    const collaborator = { ...tenant, role: 'admin' as const };
    mocks.workspace = { selected: collaborator, tenants: [collaborator] };

    render(<PublicSharePage />);

    expect(
      screen.getByRole('heading', { name: 'Owner access required' }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
