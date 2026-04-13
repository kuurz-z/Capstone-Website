import test from "node:test";
import assert from "node:assert/strict";
import {
  getTenantActionMeta,
  hasEnabledTenantAction,
  openTenantAction,
  shouldCloseTenantActionMenu,
} from "./tenantWorkspaceActions.mjs";

test("getTenantActionMeta returns fallback metadata when the action is missing", () => {
  assert.deepEqual(getTenantActionMeta({}, "renew"), {
    enabled: false,
    reason: "",
  });
});

test("hasEnabledTenantAction detects when at least one tenant action is available", () => {
  const tenant = {
    allowedActions: {
      renew: { enabled: false, reason: "blocked" },
      transfer: { enabled: true, reason: "" },
    },
  };

  assert.equal(hasEnabledTenantAction(tenant, ["renew", "transfer", "moveOut"]), true);
  assert.equal(hasEnabledTenantAction(tenant, ["renew", "moveOut"]), false);
});

test("openTenantAction dispatches enabled actions", () => {
  const tenant = {
    id: "tenant-1",
    allowedActions: {
      renew: { enabled: true, reason: "" },
    },
  };
  const calls = [];

  const opened = openTenantAction({
    tenant,
    actionKey: "renew",
    actionType: "renew",
    notifyBlocked: () => calls.push("blocked"),
    onAction: (payload) => calls.push(payload),
  });

  assert.equal(opened, true);
  assert.deepEqual(calls, [{ type: "renew", tenant }]);
});

test("openTenantAction reports blocked actions instead of silently failing", () => {
  const tenant = {
    allowedActions: {
      moveOut: { enabled: false, reason: "Only active moved-in stays can be moved out." },
    },
  };
  const blocked = [];
  const actions = [];

  const opened = openTenantAction({
    tenant,
    actionKey: "moveOut",
    actionType: "moveOut",
    notifyBlocked: (meta) => blocked.push(meta.reason),
    onAction: (payload) => actions.push(payload),
  });

  assert.equal(opened, false);
  assert.deepEqual(blocked, ["Only active moved-in stays can be moved out."]);
  assert.deepEqual(actions, []);
});

test("shouldCloseTenantActionMenu stays open for clicks inside the trigger or menu", () => {
  const triggerTarget = { id: "trigger-target" };
  const menuTarget = { id: "menu-target" };
  const outsideTarget = { id: "outside-target" };
  const triggerElement = {
    contains: (target) => target === triggerTarget,
  };
  const menuElement = {
    contains: (target) => target === menuTarget,
  };

  assert.equal(
    shouldCloseTenantActionMenu({ target: triggerTarget, triggerElement, menuElement }),
    false,
  );
  assert.equal(
    shouldCloseTenantActionMenu({ target: menuTarget, triggerElement, menuElement }),
    false,
  );
  assert.equal(
    shouldCloseTenantActionMenu({ target: outsideTarget, triggerElement, menuElement }),
    true,
  );
});
