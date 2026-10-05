import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getHostContext, isEmbedded, subscribeHostContext } from '../bridge';
import { hostLayoutStyle, readHostLayout, type HostDisplayMode } from './hostLayout';

/** React view of host-reported layout. This never inspects host DOM or chat content. */
export function useHostLayout() {
  const [context, setContext] = useState(() => isEmbedded ? getHostContext() : {});
  useEffect(() => {
    if (!isEmbedded) return;
    const refresh = () => setContext(getHostContext());
    const unsubscribe = subscribeHostContext(refresh);
    refresh(); // Catch initialization between the initial render and subscription.
    return unsubscribe;
  }, []);
  return useMemo(() => {
    const layout = readHostLayout(isEmbedded ? context : undefined);
    return {
      ...layout,
      displayMode: (isEmbedded ? layout.displayMode ?? 'unknown' : 'standalone') as HostDisplayMode | 'unknown' | 'standalone',
      hasHostInsets: Boolean(layout.safeAreaInsets),
      style: hostLayoutStyle(layout) as CSSProperties,
    };
  }, [context]);
}
