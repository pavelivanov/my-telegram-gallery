import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicGalleryRoot } from './PublicGalleryRoot';

const mocks = vi.hoisted(() => ({
  publicApi: vi.fn(),
  usePublicConfig: vi.fn(),
  usePublicConfigState: vi.fn(),
}));

vi.mock('@/api/client', () => ({ publicApi: mocks.publicApi }));
vi.mock('@/api/publicConfig', () => ({
  buildGalleryHomeLink: (_config: unknown, slug: string) =>
    `https://t.me/gallery_bot/gallery?startapp=tenant_${slug}`,
  usePublicConfigState: mocks.usePublicConfigState,
  usePublicConfig: mocks.usePublicConfig,
}));

describe('PublicGalleryRoot', () => {
  beforeEach(() => {
    mocks.publicApi.mockReset();
    const config = {
      tenancyMode: 'multi',
      sourceUrl: 'https://github.com/example/gallery/tree/abc123',
      version: '0.1.0',
    };
    mocks.usePublicConfig.mockReturnValue(config);
    mocks.usePublicConfigState.mockReturnValue({
      config,
      failed: false,
    });
    delete document.documentElement.dataset.galleryTheme;
  });

  it('renders an owner-shared gallery and submits an anonymous report', async () => {
    const user = userEvent.setup();
    const shareId = 'a'.repeat(32);
    window.location.hash = `/public/${shareId}`;
    mocks.publicApi.mockImplementation((path: string) => {
      if (path.endsWith('/reports')) {
        return Promise.resolve({ id: 'report-1', status: 'open' });
      }
      return Promise.resolve({
        gallery: {
          name: 'Field Notes',
          telegramSlug: 'field_notes',
          theme: 'paper',
        },
        albums: [
          {
            id: 'album-1',
            name: 'Northern light',
            createdAt: '2026-07-13T12:00:00.000Z',
            photoCount: 4,
            coverUrl: '/cover.jpg',
            coverThumbUrl: '/cover-thumb.jpg',
          },
        ],
      });
    });

    render(<PublicGalleryRoot />);

    expect(
      await screen.findByRole('heading', { name: 'Field Notes' }),
    ).toBeInTheDocument();
    expect(document.documentElement.dataset.galleryTheme).toBe('paper');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive',
    );
    expect(
      screen.getByRole('link', { name: /Northern light/ }),
    ).toHaveAttribute('href', `#/public/${shareId}/albums/album-1`);
    expect(
      screen.getAllByRole('link', { name: /Open in Telegram/ })[0],
    ).toHaveAttribute(
      'href',
      'https://t.me/gallery_bot/gallery?startapp=tenant_field_notes',
    );
    expect(
      screen.getByRole('link', { name: 'version 0.1.0' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/example/gallery/tree/abc123',
    );

    await user.click(screen.getByText('Report this gallery'));
    await user.selectOptions(screen.getByRole('combobox'), 'SPAM');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Report sent. Thank you.',
    );
    expect(mocks.publicApi).toHaveBeenLastCalledWith(
      `/galleries/${shareId}/reports`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'SPAM' }),
      },
    );
  });

  it('does not disclose why a revoked link is unavailable', async () => {
    const shareId = 'b'.repeat(32);
    window.location.hash = `/public/${shareId}`;
    mocks.publicApi.mockRejectedValue(new Error('Gallery not found'));

    render(<PublicGalleryRoot />);

    expect(
      await screen.findByRole('heading', { name: 'Gallery unavailable' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/disabled, replaced, or suspended/),
    ).toBeInTheDocument();
  });
});
