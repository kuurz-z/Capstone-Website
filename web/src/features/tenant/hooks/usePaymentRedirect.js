import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { billingApi } from "../../../shared/api/billingApi.js";

/**
 * usePaymentRedirect — Handle PayMongo return redirects
 *
 * Detects `?payment=success|cancelled&session_id=xxx` in the URL,
 * verifies the session with the backend, and updates flow state.
 *
 * Guards against PayMongo's back button which sends literal `{id}`
 * as the session_id instead of the real checkout session ID.
 */
export function usePaymentRedirect({
  user,
  showNotification,
  navigate,
  setPaymentSubmitted,
  setPaymentApproved,
  setPaymentMethod,
  setCurrentStage,
  setHighestStageReached,
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!user) return;

    const paymentStatus = searchParams.get("payment");

    if (!paymentStatus) {
      return;
    }

    // NOTE: Don't show "cancelled" toast here — wait for PayMongo verification
    // in loadExistingReservation() to determine the actual payment status.
    // This prevents a misleading flash when the user presses browser-back
    // after a successful payment (PayMongo sends ?payment=cancelled).

    // Clean URL params immediately — the init effect's
    // loadExistingReservation(resId, true) handles ALL state updates
    // (verification, stage, payment flags, notification) atomically
    // before setIsLoading(false), so no intermediate gray-step renders.
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { searchParams, setSearchParams };
}
