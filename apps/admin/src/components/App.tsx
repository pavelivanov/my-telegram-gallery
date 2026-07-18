import { Navigate, Route, Routes, HashRouter } from 'react-router-dom';

import { routes } from '@/navigation/routes.tsx';
import { TenantWorkspace } from './TenantWorkspace';
import { SourceNotice } from './SourceNotice';

export function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <TenantWorkspace>
          <Routes>
            {routes.map((route) => <Route key={route.path} {...route} />)}
            <Route path="*" element={<Navigate to="/"/>}/>
          </Routes>
        </TenantWorkspace>
        <SourceNotice />
      </div>
    </HashRouter>
  );
}
