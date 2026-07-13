import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, TenantRole } from '../generated/prisma/client';
import { DEFAULT_TENANT_SLUG } from './tenants/tenant.constants';

interface BootstrapArguments {
  ownerTgId: bigint;
  slug: string;
}

function parseArguments(argv: string[]): BootstrapArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: pnpm tenant:bootstrap --slug <slug> --owner-tg-id <id>',
      );
    }
    if (!['--slug', '--owner-tg-id'].includes(flag) || values.has(flag)) {
      throw new Error(`Unknown or duplicate argument: ${flag}`);
    }
    values.set(flag, value);
  }

  const slug = values.get('--slug')?.trim() ?? '';
  if (!/^[a-z0-9][a-z0-9_]{2,29}$/.test(slug)) {
    throw new Error(
      'Tenant slug must be 3-30 lowercase letters, numbers, or underscores',
    );
  }

  const ownerRaw = values.get('--owner-tg-id')?.trim() ?? '';
  if (!/^\d+$/.test(ownerRaw)) {
    throw new Error('Owner Telegram ID must be a positive decimal integer');
  }
  const ownerTgId = BigInt(ownerRaw);
  if (ownerTgId <= 0n || ownerTgId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Owner Telegram ID is outside the supported range');
  }

  return { ownerTgId, slug };
}

async function bootstrapTenant(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const { ownerTgId, slug } = parseArguments(process.argv.slice(2));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.tenant.findUnique({
        where: { slug },
        include: {
          memberships: { where: { role: TenantRole.OWNER } },
        },
      });

      if (!existing) {
        const tenant = await transaction.tenant.create({
          data: {
            slug,
            name: slug === DEFAULT_TENANT_SLUG ? 'Default gallery' : slug,
            memberships: {
              create: { role: TenantRole.OWNER, tgUserId: ownerTgId },
            },
          },
        });
        return { action: 'created', tenantId: tenant.id } as const;
      }

      const differentOwner = existing.memberships.find(
        (membership) => membership.tgUserId !== ownerTgId,
      );
      if (differentOwner) {
        throw new Error(
          `Tenant ${slug} already has a different owner; refusing to replace it`,
        );
      }
      if (existing.memberships.some((item) => item.tgUserId === ownerTgId)) {
        return { action: 'unchanged', tenantId: existing.id } as const;
      }

      await transaction.tenantMembership.create({
        data: {
          role: TenantRole.OWNER,
          tenantId: existing.id,
          tgUserId: ownerTgId,
        },
      });
      return { action: 'claimed', tenantId: existing.id } as const;
    });

    console.info(
      `Tenant ${slug} ${result.action}; owner ${ownerTgId.toString()}; id ${result.tenantId}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void bootstrapTenant().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
