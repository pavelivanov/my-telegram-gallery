import { parseMaintenanceOptions } from './maintenance-options';

describe('maintenance options', () => {
  it.each(['uploads', 'hourly'] as const)(
    'parses the %s cycle with a bounded limit',
    (kind) => {
      expect(parseMaintenanceOptions([kind])).toEqual({ kind, limit: 500 });
      expect(parseMaintenanceOptions([kind, '--limit', '42'])).toEqual({
        kind,
        limit: 42,
      });
    },
  );

  it.each([
    [[], 'Choose maintenance kind'],
    [['daily'], 'Choose maintenance kind'],
    [['uploads', '--tenant', 'alpha'], 'Unknown option'],
    [['hourly', '--limit', '0'], 'integer from 1 to 10000'],
    [['hourly', '--limit', '10001'], 'integer from 1 to 10000'],
    [['hourly', '--limit'], 'integer from 1 to 10000'],
  ])('rejects invalid arguments %#', (args, message) => {
    expect(() => parseMaintenanceOptions(args)).toThrow(message);
  });
});
