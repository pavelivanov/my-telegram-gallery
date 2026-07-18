import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SourceNotice } from './SourceNotice';

vi.mock('@/api/publicConfig', () => ({
  usePublicConfig: () => ({
    sourceUrl: 'https://github.com/example/gallery/tree/abc123',
    version: '0.1.0',
  }),
}));

describe('SourceNotice', () => {
  it('offers the corresponding source and identifies the license', () => {
    render(<SourceNotice />);

    expect(screen.getByLabelText('Network source offer')).toHaveTextContent(
      'AGPL-3.0-only · no warranty',
    );
    expect(screen.getByRole('link', { name: 'version 0.1.0' })).toHaveAttribute(
      'href',
      'https://github.com/example/gallery/tree/abc123',
    );
  });
});
