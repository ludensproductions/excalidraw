import { useEffect, useRef } from "react";

// a shared room (#room=) or copy (#json=) link
export const hasExternalLinkInUrl = (): boolean => {
  const hash = window.location.hash;
  return (
    /^#room=[a-zA-Z0-9_-]+,[a-zA-Z0-9_-]+(,ro)?$/.test(hash) ||
    /^#json=[a-zA-Z0-9_-]+,[a-zA-Z0-9_-]+$/.test(hash)
  );
};

// Pasting a shared or copy link in the address bar only changes the hash: the
// browser doesn't reload, so nothing opened the board until F5 (RD-551).
export const useExternalLinkNavigation = (
  enabled: boolean,
  onExternalLink: () => void,
) => {
  const callbackRef = useRef(onExternalLink);
  useEffect(() => {
    callbackRef.current = onExternalLink;
  });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onHashChange = () => {
      if (hasExternalLinkInUrl()) {
        callbackRef.current();
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [enabled]);
};
