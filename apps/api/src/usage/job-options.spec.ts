import { parseBoundedJobOptions } from './job-options';

describe('bounded job options', () => {
  it('requires an explicit safe mode and parses bounds', () => {
    expect(
      parseBoundedJobOptions([
        '--dry-run',
        '--tenant',
        'alpha_gallery',
        '--limit',
        '25',
      ]),
    ).toEqual({
      apply: false,
      dryRun: true,
      limit: 25,
      tenantSlug: 'alpha_gallery',
    });
    expect(() => parseBoundedJobOptions([])).toThrow('exactly one');
    expect(() =>
      parseBoundedJobOptions(['--apply', '--limit', '10001']),
    ).toThrow('--limit');
  });
});
