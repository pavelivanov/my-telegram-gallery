export interface BoundedJobOptions {
  apply: boolean;
  dryRun: boolean;
  limit: number;
  tenantSlug?: string;
}

export function parseBoundedJobOptions(
  args: readonly string[],
): BoundedJobOptions {
  let apply = false;
  let dryRun = false;
  let limit = 100;
  let tenantSlug: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--apply') {
      apply = true;
    } else if (argument === '--dry-run') {
      dryRun = true;
    } else if (argument === '--limit') {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
        throw new Error('--limit must be an integer from 1 to 10000');
      }
      limit = value;
    } else if (argument === '--tenant') {
      tenantSlug = args[++index];
      if (!tenantSlug || !/^[a-z0-9_]{3,32}$/.test(tenantSlug)) {
        throw new Error('--tenant must be a valid tenant slug');
      }
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (apply === dryRun) {
    throw new Error('Choose exactly one of --dry-run or --apply');
  }
  return { apply, dryRun, limit, tenantSlug };
}
