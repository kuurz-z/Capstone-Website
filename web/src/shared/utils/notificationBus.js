const listeners = new Set();
let notificationCounter = 0;

export const subscribeNotifications = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishNotification = (payload) => {
  const notification = {
    id: payload.id || `notification-${Date.now()}-${notificationCounter += 1}`,
    duration: 3000,
    presentation: "toast",
    ...payload,
  };

  listeners.forEach((listener) => listener(notification));
  return notification.id;
};
