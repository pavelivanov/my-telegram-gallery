import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';

import { PublicGalleryApp } from './PublicGalleryApp';

const publicQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

export function PublicGalleryRoot() {
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    const previous = existing?.content;
    const meta = existing ?? document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow, noarchive';
    if (!existing) document.head.append(meta);
    return () => {
      if (existing && previous !== undefined) existing.content = previous;
      else meta.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={publicQueryClient}>
      <HashRouter>
        <PublicGalleryApp />
      </HashRouter>
    </QueryClientProvider>
  );
}
