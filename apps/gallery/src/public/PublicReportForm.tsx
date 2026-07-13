import { useState, type FormEvent } from 'react';

import { publicApi } from '@/api/client';

const REPORT_REASONS = [
  ['OTHER', 'Other concern'],
  ['SPAM', 'Spam'],
  ['ILLEGAL_CONTENT', 'Illegal content'],
  ['HARASSMENT', 'Harassment'],
  ['COPYRIGHT', 'Copyright'],
] as const;

export function PublicReportForm({
  albumId,
  shareId,
}: {
  albumId?: string;
  shareId: string;
}) {
  const [reason, setReason] = useState('OTHER');
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setResult(null);
    try {
      await publicApi(`/galleries/${shareId}/reports`, {
        method: 'POST',
        body: JSON.stringify({
          ...(albumId ? { albumId } : {}),
          reason,
          ...(detail.trim() ? { detail: detail.trim() } : {}),
        }),
      });
      setResult('Report sent. Thank you.');
      setDetail('');
    } catch (caught) {
      setResult((caught as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <details className="public-report">
      <summary>Report this {albumId ? 'album' : 'gallery'}</summary>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          <span>Reason</span>
          <select
            value={reason}
            disabled={sending}
            onChange={(event) => setReason(event.target.value)}
          >
            {REPORT_REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Optional detail</span>
          <textarea
            maxLength={500}
            rows={3}
            value={detail}
            disabled={sending}
            onChange={(event) => setDetail(event.target.value)}
          />
        </label>
        <button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send report'}
        </button>
        {result ? <p role="status">{result}</p> : null}
      </form>
    </details>
  );
}
