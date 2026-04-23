import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

const normalizeFlash = (flash) => {
  if (!flash) return null;

  if (typeof flash === "string") {
    return {
      message: flash,
      type: "info",
    };
  }

  return {
    type: "info",
    ...flash,
  };
};

export function useAppNavigation() {
  const navigate = useNavigate();

  return useCallback(
    (to, options = {}) => {
      const { flash, state, ...navigateOptions } = options;
      const nextState = state ? { ...state } : {};
      const normalizedFlash = normalizeFlash(flash);

      if (normalizedFlash) {
        nextState.flash = normalizedFlash;
      }

      navigate(to, {
        ...navigateOptions,
        state: Object.keys(nextState).length > 0 ? nextState : undefined,
      });
    },
    [navigate],
  );
}
