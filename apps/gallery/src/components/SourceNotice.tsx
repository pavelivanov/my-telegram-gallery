import { usePublicConfig } from '@/api/publicConfig';

export function SourceNotice() {
  const config = usePublicConfig();
  if (!config) return null;

  return (
    <aside className="source-notice" aria-label="Network source offer">
      <span>Corresponding source:</span>{' '}
      <a href={config.sourceUrl} rel="noreferrer" target="_blank">
        version {config.version}
      </a>{' '}
      <span>· AGPL-3.0-only · no warranty</span>
    </aside>
  );
}
