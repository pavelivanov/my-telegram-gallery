import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import { retrieveLaunchParams } from '@tma.js/sdk-react';

import { Root } from '@/components/Root.tsx';
import { EnvUnsupported } from '@/components/EnvUnsupported.tsx';
import { init } from '@/init.ts';

import './index.css';

// Mock the environment in case, we are outside Telegram.
import './mockEnv.ts';

const root = ReactDOM.createRoot(document.getElementById('root')!);

try {
  const launchParams = retrieveLaunchParams();
  const { tgWebAppPlatform: platform } = launchParams;
  const startParam = launchParams.tgWebAppStartParam;
  const debug = (launchParams.tgWebAppStartParam || '').includes('debug')
    || import.meta.env.DEV;

  // Deep link: `?startapp=album_<id>` opens that album. The hash must be
  // set BEFORE the router renders — Telegram delivers launch params in the
  // URL hash, which HashRouter would treat as an unknown route and replace
  // with "/" via the catch-all redirect.
  const startMatch = /^album_([\w-]+)$/.exec(
    startParam || '',
  );
  if (startMatch) {
    window.location.hash = `#/albums/${startMatch[1]}`;
  }

  // Configure all application dependencies.
  await init({
    debug,
    eruda: debug && ['ios', 'android'].includes(platform),
    mockForMacOS: platform === 'macos',
  });
  root.render(
    <StrictMode>
      <Root startParam={startParam}/>
    </StrictMode>,
  );
} catch {
  root.render(<EnvUnsupported/>);
}
