import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tenant, TenantMembers } from '@/api/types';
import { TeamPage } from './TeamPage';

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
  role: 'owner',
  slug: 'alpha_gallery',
  status: 'active',
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

const team: TenantMembers = {
  adminLimit: 10,
  members: [
    {
      createdAt: '2026-07-13T12:00:00.000Z',
      role: 'owner',
      tgUserId: '101',
    },
  ],
};

describe('TeamPage', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.workspace = { selected: tenant, tenants: [tenant] };
  });

  afterEach(() => vi.restoreAllMocks());

  it('adds a numeric Telegram collaborator and renders the returned role', async () => {
    const user = userEvent.setup();
    mocks.api.mockResolvedValueOnce(team).mockResolvedValueOnce({
      createdAt: '2026-07-13T12:05:00.000Z',
      role: 'admin',
      tgUserId: '909',
    });

    render(<TeamPage />);
    await screen.findByText('101');
    await user.type(screen.getByPlaceholderText('123456789'), 'user-909');
    await user.click(screen.getByRole('button', { name: 'Add collaborator' }));

    expect(mocks.api).toHaveBeenLastCalledWith(
      '/tenants/alpha_gallery/members',
      { method: 'POST', body: JSON.stringify({ tgUserId: '909' }) },
    );
    expect(await screen.findByText('909')).toBeInTheDocument();
    expect(screen.getByText('1/10 collaborators')).toBeInTheDocument();
  });

  it('confirms and removes only collaborator rows', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.api
      .mockResolvedValueOnce({
        ...team,
        members: [
          ...team.members,
          {
            createdAt: '2026-07-13T12:05:00.000Z',
            role: 'admin',
            tgUserId: '909',
          },
        ],
      })
      .mockResolvedValueOnce({ removed: true, tgUserId: '909' });

    render(<TeamPage />);
    await screen.findByText('909');
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(window.confirm).toHaveBeenCalledWith('Remove Telegram user 909?');
    expect(mocks.api).toHaveBeenLastCalledWith(
      '/tenants/alpha_gallery/members/909',
      { method: 'DELETE' },
    );
    await waitFor(() => expect(screen.queryByText('909')).toBeNull());
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('does not load team data for a collaborator', () => {
    const adminTenant = { ...tenant, role: 'admin' as const };
    mocks.workspace = { selected: adminTenant, tenants: [adminTenant] };

    render(<TeamPage />);

    expect(
      screen.getByRole('heading', { name: 'Owner access required' }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
