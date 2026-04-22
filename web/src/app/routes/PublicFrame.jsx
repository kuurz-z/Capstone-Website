import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import RouteTransitionBoundary from "../../shared/components/RouteTransitionBoundary";
import { useRouteFlash } from "../../shared/hooks/useRouteFlash";

export function PublicFrame() {
  const location = useLocation();
  useRouteFlash();

  return (
    <div className="public-route-frame">
      <RouteTransitionBoundary
        routeKey={`${location.pathname}${location.search}`}
      >
        <Outlet />
      </RouteTransitionBoundary>
    </div>
  );
}
