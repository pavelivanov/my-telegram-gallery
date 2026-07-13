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
   * `history(-1)`) so back always works regardless of webview history.
   */
  backTo?: string
}>) {
  const navigate = useNavigate();

  useEffect(() => {
    if (back) {
      backButton.show();
      return backButton.onClick(() => {
        navigate(backTo);
      });
    }
    backButton.hide();
  }, [back, backTo]);

  return <>{children}</>;
}
