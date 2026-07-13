import {
  useCallback,
  useEffect,
  useState,
  type FC,
  type FormEvent,
} from 'react';

import { api } from '@/api/client';
import type { TenantMember, TenantMembers } from '@/api/types';
import { Page } from '@/components/Page';
import { useTenantWorkspace } from '@/components/TenantWorkspace';
import { Button, Placeholder, Spinner } from '@/components/Ui';

function validTelegramId(value: string): boolean {
  if (!/^[1-9]\d{0,15}$/.test(value)) return false;
  return BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER);
}

export const TeamPage: FC = () => {
  const workspace = useTenantWorkspace();
  const [team, setTeam] = useState<TenantMembers | null>(null);
  const [tgUserId, setTgUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const selected = workspace?.selected;

  const load = useCallback(async () => {
    if (!selected || selected.role !== 'owner') return;
    const result = await api<TenantMembers>(
      `/tenants/${selected.slug}/members`,
    );
    setTeam(result);
    setError(null);
  }, [selected]);

  useEffect(() => {
    void load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  if (!selected) {
    return (
      <Page>
        <Placeholder
          header="Team unavailable"
          description="Collaborator management is available for multi-gallery workspaces."
        />
      </Page>
    );
  }
  if (selected.role !== 'owner') {
    return (
      <Page>
        <Placeholder
          header="Owner access required"
          description="Only the gallery owner can view or change collaborators."
        />
      </Page>
    );
  }

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!validTelegramId(tgUserId) || working) return;
    setWorking('add');
    setError(null);
    try {
      const member = await api<TenantMember>(
        `/tenants/${selected.slug}/members`,
        {
          method: 'POST',
          body: JSON.stringify({ tgUserId }),
        },
      );
      setTeam((current) =>
        current
          ? { ...current, members: [...current.members, member] }
          : current,
      );
      setTgUserId('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const remove = async (member: TenantMember) => {
    if (working || member.role !== 'admin') return;
    if (!window.confirm(`Remove Telegram user ${member.tgUserId}?`)) return;
    setWorking(member.tgUserId);
    setError(null);
    try {
      await api(
        `/tenants/${selected.slug}/members/${encodeURIComponent(member.tgUserId)}`,
        { method: 'DELETE' },
      );
      setTeam((current) =>
        current
          ? {
              ...current,
              members: current.members.filter(
                (item) => item.tgUserId !== member.tgUserId,
              ),
            }
          : current,
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const admins =
    team?.members.filter((member) => member.role === 'admin') ?? [];

  return (
    <Page>
      <main className="mx-auto max-w-xl px-5 pt-8 pb-14">
        <header className="animate-rise border-b border-line pb-7">
          <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-brass">
            Access
          </span>
          <h1 className="mt-3 font-display text-[40px] font-light leading-none">
            Team
          </h1>
          <p className="mt-3 max-w-md text-[13px] leading-5 text-ink-dim">
            Collaborators can create albums and manage photos. Billing,
            ownership, and team access remain owner-only.
          </p>
        </header>

        <form
          className="animate-rise border-b border-line py-7 [animation-delay:60ms]"
          onSubmit={(event) => void add(event)}
        >
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-dim">
              Telegram user ID
            </span>
            <input
              className="w-full rounded-xl border border-line bg-night px-3.5 py-2.5 text-[15px] tabular-nums text-ink outline-none placeholder:text-ink-dim focus:border-brass"
              inputMode="numeric"
              placeholder="123456789"
              value={tgUserId}
              disabled={working !== null}
              onChange={(event) =>
                setTgUserId(event.target.value.replace(/\D/g, ''))
              }
            />
          </label>
          <p className="mt-2 text-[12px] leading-5 text-ink-dim">
            Ask the collaborator for their numeric Telegram ID. Usernames can
            change and are not accepted as authorization identities.
          </p>
          <Button
            type="submit"
            className="mt-4"
            disabled={
              !validTelegramId(tgUserId) ||
              working !== null ||
              Boolean(team && admins.length >= team.adminLimit)
            }
            loading={working === 'add'}
          >
            Add collaborator
          </Button>
        </form>

        {error ? (
          <p className="mt-6 text-[13px] leading-5 text-danger [overflow-wrap:anywhere]">
            {error}
          </p>
        ) : null}

        {!team ? (
          error ? null : (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          )
        ) : (
          <section className="animate-rise py-7 [animation-delay:120ms]">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.24em] text-ink-dim">
                Members
              </h2>
              <span className="text-[12px] tabular-nums text-ink-dim">
                {admins.length}/{team.adminLimit} collaborators
              </span>
            </div>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {team.members.map((member) => (
                <li
                  key={member.tgUserId}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] tabular-nums text-ink">
                      {member.tgUserId}
                    </span>
                    <span className="mt-1 block text-[11px] uppercase tracking-[0.18em] text-ink-dim">
                      {member.role}
                    </span>
                  </span>
                  {member.role === 'admin' ? (
                    <Button
                      variant="plain"
                      loading={working === member.tgUserId}
                      onClick={() => void remove(member)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </Page>
  );
};
