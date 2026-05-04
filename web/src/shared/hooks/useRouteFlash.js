import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { showNotification } from "../utils/notification";

export function useRouteFlash() {
  const location = useLocation();
  const navigate = useNavigate();
  const processedFlashRef = useRef(false);

  const routePath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search],
  );

  useEffect(() => {
    const routeFlash = location.state?.flash;

    if (!routeFlash?.message) {
      processedFlashRef.current = false;
      return;
    }

    if (processedFlashRef.current) {
      return; // Already processed this state flash to prevent stacking/duplication
    }
    processedFlashRef.current = true;

    setTimeout(() => {
      showNotification(
        routeFlash.message,
        routeFlash.type || "info",
        routeFlash.duration || 5000,
      );
    }, 400);

    const nextState = { ...(location.state || {}) };
    delete nextState.flash;

    navigate(routePath, {
      replace: true,
      state: Object.keys(nextState).length > 0 ? nextState : undefined,
    });
  }, [location.state, navigate, routePath]);

  return {
    flash: null,
    clearFlash: () => {},
  };
}
