export function getTenantActionMeta(tenant, actionKey) {
  return tenant?.allowedActions?.[actionKey] || { enabled: false, reason: "" };
}

export function hasEnabledTenantAction(tenant, actionKeys = []) {
  return actionKeys.some((actionKey) => getTenantActionMeta(tenant, actionKey).enabled);
}

export function openTenantAction({
  tenant,
  actionKey,
  actionType,
  notifyBlocked,
  onAction,
}) {
  const actionMeta = getTenantActionMeta(tenant, actionKey);
  if (!actionMeta.enabled) {
    notifyBlocked(actionMeta);
    return false;
  }

  onAction({ type: actionType, tenant });
  return true;
}

export function shouldCloseTenantActionMenu({
  target,
  triggerElement,
  menuElement,
}) {
  if (!target) return true;
  if (triggerElement?.contains?.(target) || menuElement?.contains?.(target)) {
    return false;
  }
  return true;
}
