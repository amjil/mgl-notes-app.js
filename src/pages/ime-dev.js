import { mountImeUserWordDev } from '../ime/user-word-dev.js';
import { navigate } from '../router.js';

/** Dev-only: #/ime-dev — IME dictionary overlay tester (not in production builds). */
export function mountImeDev(container) {
  if (!import.meta.env.DEV) {
    navigate('/today', { replace: true });
    return { destroy() {} };
  }
  const page = mountImeUserWordDev(container);
  if (!page) {
    navigate('/today', { replace: true });
    return { destroy() {} };
  }
  return page;
}
