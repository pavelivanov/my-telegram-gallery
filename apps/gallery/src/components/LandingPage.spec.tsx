import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LandingPage } from './LandingPage';

const mocks = vi.hoisted(() => ({
  usePublicConfigState: vi.fn(),
}));

vi.mock('@/api/publicConfig', () => ({
  buildAdminHomeLink: (config: {
    adminAppShortName: string;
    botUsername: string;
  }) => `https://t.me/${config.botUsername}/${config.adminAppShortName}`,
  usePublicConfigState: mocks.usePublicConfigState,
}));

describe('LandingPage', () => {
  beforeEach(() => {
    mocks.usePublicConfigState.mockReturnValue({
      config: {
        botUsername: 'gallery_bot',
        adminAppShortName: 'admin',
        galleryAppShortName: 'gallery',
        privacyUrl: 'https://example.test/privacy',
        tenancyMode: 'multi',
        termsUrl: 'https://example.test/terms',
        uploadMaxBytes: 25_000_000,
      },
      failed: false,
    });
  });

  it('uses runtime Telegram and legal links without rendering gallery data', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('link', { name: /Create in Telegram/ }),
    ).toHaveAttribute('href', 'https://t.me/gallery_bot/admin');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      'https://example.test/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      'https://example.test/privacy',
    );
    expect(screen.queryByText(/customer|album|photo count/i)).toBeNull();
  });

  it('shows an explicit unavailable state when public config cannot load', () => {
    mocks.usePublicConfigState.mockReturnValue({
      config: null,
      failed: true,
    });

    render(<LandingPage />);

    expect(screen.getByText('Telegram link unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Create in Telegram/ })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Legal' })).toBeNull();
  });
});
