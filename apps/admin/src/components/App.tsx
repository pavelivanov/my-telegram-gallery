import { Navigate, Route, Routes, HashRouter } from 'react-router-dom';

import { routes } from '@/navigation/routes.tsx';
import { TenantWorkspace } from './TenantWorkspace';

export function App() {
  return (
    <HashRouter>
      <TenantWorkspace>
        <Routes>
          {routes.map((route) => <Route key={route.path} {...route} />)}
          <Route path="*" element={<Navigate to="/"/>}/>
        </Routes>
      </TenantWorkspace>
    </HashRouter>
  );
}
