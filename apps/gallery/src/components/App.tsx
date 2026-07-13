import { Navigate, Route, Routes, HashRouter } from 'react-router-dom';

import { routes } from '@/navigation/routes.tsx';
import { GalleryWorkspace } from './GalleryWorkspace';

export function App({ startParam }: { startParam?: string }) {
  return (
    <HashRouter>
      <GalleryWorkspace startParam={startParam}>
        <Routes>
          {routes.map((route) => <Route key={route.path} {...route} />)}
          <Route path="*" element={<Navigate to="/"/>}/>
        </Routes>
      </GalleryWorkspace>
    </HashRouter>
  );
}
