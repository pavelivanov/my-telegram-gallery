export type MaintenanceKind = 'uploads' | 'hourly';

export interface MaintenanceOptions {
  kind: MaintenanceKind;
  limit: number;
}

export function parseMaintenanceOptions(
  args: readonly string[],
): MaintenanceOptions {
  const [kind, ...options] = args;
  if (kind !== 'uploads' && kind !== 'hourly') {
    throw new Error('Choose maintenance kind uploads or hourly');
  }

  let limit = 500;
  for (let index = 0; index < options.length; index++) {
    if (options[index] !== '--limit') {
      throw new Error(`Unknown option: ${options[index]}`);
    }
    const value = Number(options[++index]);
    if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
      throw new Error('--limit must be an integer from 1 to 10000');
    }
    limit = value;
  }

  return { kind, limit };
}
