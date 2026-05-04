import { showNotification } from "../../../../../shared/utils/notification";
import getFriendlyError from "../../../../../shared/utils/friendlyError";

export default function useBillingNotifier() {
  return {
    success(message) {
      showNotification(message, "success");
    },
    error(error, fallback) {
      showNotification(getFriendlyError(error, fallback), "error");
    },
    warn(message) {
      showNotification(message, "error");
    },
  };
}
