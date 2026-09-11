import { showNotification } from "../../../../../shared/utils/notification";
import getFriendlyError from "../../../../../shared/utils/friendlyError";
import { friendlyWaterError } from '../utility/waterErrors';

export default function useBillingNotifier(utilityType, context = {}) {
 return {
 success(message) {
 showNotification(message, "success");
 },
 error(error, fallback) {
 showNotification(utilityType === 'water' ? friendlyWaterError(error, typeof context === 'function' ? context() : context) : getFriendlyError(error, fallback), "error");
 },
 warn(message) {
 showNotification(message, "warning");
 },
 warning(message) {
 showNotification(message, "warning");
 },
 info(message) {
 showNotification(message, "info");
 },
 };
}
