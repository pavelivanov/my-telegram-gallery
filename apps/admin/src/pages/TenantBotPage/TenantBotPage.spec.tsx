import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tenant, TenantBotIdentity, TenantBotState } from '@/api/types';
import { TenantBotPage } from './TenantBotPage';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  config: {
    botUsername: 'service_gallery_bot',
    adminAppShortName: 'admin_app',
    galleryAppShortName: 'gallery_app',
    privacyUrl: null,
    sourceUrl: 'https://github.com/example/gallery/tree/abc123',
    tenancyMode: 'multi' as const,
    termsUrl: null,
    uploadMaxBytes: 1024,
    version: '0.1.0',
  },
  updateSelectedBot: vi.fn(),
  workspace: null as {
    selected: Tenant;
    tenants: Tenant[];
    updateSelectedBot: (bot: TenantBotIdentity | null) => void;
  } | null,
}));

vi.mock('@/api/client', () => ({ api: mocks.api }));
vi.mock('@/api/publicConfig', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/publicConfig')>();
  return {
    ...original,
    usePublicConfig: () => mocks.config,
  };
});
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
  plan: 'pro',
  policyVersion: 'test',
  role: 'owner',
  slug: 'alpha_gallery',
  status: 'active',
  theme: 'paper',
  usage: {
    albumCount: 1,
    albumLimit: 100,
    photoCount: 4,
    photoLimit: 10_000,
    storageLimitBytes: '100000',
    storageReservedBytes: '0',
    storageUsedBytes: '1000',
  },
};

const connected: TenantBotState = {
  configured: true,
  connected: true,
  bot: {
    username: 'alpha_white_label_bot',
    adminAppShortName: 'alpha_admin',
    galleryAppShortName: 'alpha_gallery',
    verifiedAt: '2026-07-14T10:00:00.000Z',
  },
};

describe('TenantBotPage', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.updateSelectedBot.mockReset();
    mocks.workspace = {
      selected: tenant,
      tenants: [tenant],
      updateSelectedBot: mocks.updateSelectedBot,
    };
  });

  it('verifies and connects a bot without retaining or returning its token', async () => {
    const user = userEvent.setup();
    const token = '700000001:tenant_bot_secret_token_1234567890';
    mocks.api
      .mockResolvedValueOnce({ configured: true, connected: false, bot: null })
      .mockResolvedValueOnce(connected);

    render(<TenantBotPage />);
    await screen.findByText('Shared bot only');
    await user.type(screen.getByLabelText('BotFather token'), token);
    await user.clear(screen.getByLabelText('Admin Mini App short name'));
    await user.type(
      screen.getByLabelText('Admin Mini App short name'),
      'alpha_admin',
    );
    await user.clear(screen.getByLabelText('Gallery Mini App short name'));
    await user.type(
      screen.getByLabelText('Gallery Mini App short name'),
      'alpha_gallery',
    );
    await user.click(screen.getByRole('button', { name: 'Verify and connect' }));

    expect(mocks.api).toHaveBeenLastCalledWith('/tenants/alpha_gallery/bot', {
      method: 'PUT',
      body: JSON.stringify({
        botToken: token,
        adminAppShortName: 'alpha_admin',
        galleryAppShortName: 'alpha_gallery',
      }),
    });
    expect(await screen.findByText('@alpha_white_label_bot')).toBeInTheDocument();
    expect(mocks.updateSelectedBot).toHaveBeenCalledWith(connected.bot);
    expect(screen.getByLabelText('BotFather token')).toHaveValue('');
    expect(document.body.textContent).not.toContain('tenant_bot_secret');
  });

  it('builds tenant-bound custom links and confirmation-gates disconnect', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.api
      .mockResolvedValueOnce(connected)
      .mockResolvedValueOnce({ configured: true, connected: false, bot: null });

    render(<TenantBotPage />);
    await screen.findByText('@alpha_white_label_bot');
    const links = screen.getAllByRole('link', { name: 'Open' });
    expect(links[0]).toHaveAttribute(
      'href',
      'https://t.me/alpha_white_label_bot/alpha_admin?startapp=tenant_alpha_gallery',
    );
    expect(links[1]).toHaveAttribute(
      'href',
      'https://t.me/alpha_white_label_bot/alpha_gallery?startapp=tenant_alpha_gallery',
    );

    await user.click(screen.getByRole('button', { name: 'Disconnect bot' }));
    expect(window.confirm).toHaveBeenCalledWith(
      'Disconnect this bot? Its Mini Apps will stop authenticating this gallery. The shared service bot remains available.',
    );
    expect(mocks.api).toHaveBeenLastCalledWith('/tenants/alpha_gallery/bot', {
      method: 'DELETE',
    });
    expect(await screen.findByText('Shared bot only')).toBeInTheDocument();
    expect(mocks.updateSelectedBot).toHaveBeenCalledWith(null);
  });

  it('does not expose tenant-bot controls to collaborators', () => {
    const collaborator = { ...tenant, role: 'admin' as const };
    mocks.workspace = {
      selected: collaborator,
      tenants: [collaborator],
      updateSelectedBot: mocks.updateSelectedBot,
    };

    render(<TenantBotPage />);

    expect(
      screen.getByRole('heading', { name: 'Owner access required' }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
