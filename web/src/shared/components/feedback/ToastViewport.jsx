import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import { subscribeNotifications } from "../../utils/notificationBus";

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
};

function ToastItem({ notification, onDismiss }) {
  const prefersReducedMotion = useReducedMotion();
  const Icon = TOAST_ICONS[notification.type] || TOAST_ICONS.info;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(notification.id);
    }, notification.duration);

    return () => window.clearTimeout(timer);
  }, [notification.duration, notification.id, onDismiss]);

  return (
    <motion.div
      className={`notification notification-${notification.type || "info"}`}
      initial={
        prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 400, scale: 0.95 }
      }
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 400, scale: 0.95 }}
      transition={{
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 400,
        damping: 30,
        mass: 1,
        duration: prefersReducedMotion ? 0.01 : undefined,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="notification-icon">
        <Icon size={18} />
      </div>
      <div className="notification-message">{notification.message}</div>
      <button
        className="notification-close"
        type="button"
        aria-label="Close notification"
        onClick={() => onDismiss(notification.id)}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export default function ToastViewport() {
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    return subscribeNotifications((notification) => {
      if (notification.presentation !== "toast") {
        return;
      }

      setNotifications([notification]);
    });
  }, []);

  const dismissNotification = useMemo(
    () => (id) => {
      setNotifications((current) => current.filter((item) => item.id !== id));
    },
    [],
  );

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="notification-stack"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      <AnimatePresence mode="wait">
        {notifications.map((notification) => (
          <ToastItem
            key={notification.id}
            notification={notification}
            onDismiss={dismissNotification}
          />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
