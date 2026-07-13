import { useNavigate } from 'react-router-dom';
import { backButton } from '@tma.js/sdk-react';
import { type PropsWithChildren, useEffect } from 'react';

export function Page({ children, back = true, backTo = '/' }: PropsWithChildren<{
  /**
   * True if it is allowed to go back from this page.
   */
  back?: boolean
  /**
   * Route the native back button navigates to. An explicit route (not
   * `history(-1)`) because deep-linked opens have no usable history.
   */
  backTo?: string
}>) {
  const navigate = useNavigate();

  useEffect(() => {
    if (back) {
      backButton.show();
      return backButton.onClick(() => {
        // The photo viewer pushes its own history entry and closes on
        // popstate — pop that first so back closes the viewer, not the page.
        const historyState = window.history.state as {
          photoViewer?: boolean;
        } | null;
        if (historyState?.photoViewer) {
          window.history.back();
        } else {
          navigate(backTo);
        }
      });
    }
    backButton.hide();
  }, [back, backTo]);

  return <>{children}</>;
}
