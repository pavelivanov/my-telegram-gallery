import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '@/components/App.tsx';
import { ErrorBoundary } from '@/components/ErrorBoundary.tsx';

// Session-lifetime cache: visited pages render instantly with no refetch.
// Closing and reopening the Mini App is a fresh page load, which starts
// with an empty cache — exactly when content should reload.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ErrorBoundaryError({ error }: { error: unknown }) {
  return (
    <div>
      <p>An unhandled error occurred:</p>
      <blockquote>
        <code>
          {error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : JSON.stringify(error)}
        </code>
      </blockquote>
    </div>
  );
}

export function Root({ startParam }: { startParam?: string }) {
  return (
    <ErrorBoundary fallback={ErrorBoundaryError}>
      <QueryClientProvider client={queryClient}>
        <App startParam={startParam}/>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
