import { register } from "node:module";
import { before, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { mount } from "../../../test-fixtures/reactMountHarness.mjs";
import { fireEvent, getByRole } from "@testing-library/dom";

register("../../../test-fixtures/transferModalLoader.mjs", import.meta.url);
const state = globalThis.__transferModalTest = {
  rooms: [{ _id: "destination", name: "Room 202", type: "double-sharing", monthlyPrice: 7000, beds: [{ id: "bed-1", status: "available" }] }],
  preview: { data: undefined, isFetching: true },
  api: {},
};
let TransferTenantModal, mounted;
before(async () => {
  ({ TransferTenantModal } = await import("./TenantWorkspaceModals.jsx"));
});
afterEach(() => { mounted?.unmount(); mounted = null; });

const element = (open = true) => React.createElement(TransferTenantModal, {
  open,
  tenant: { reservationId: "test-reservation", roomId: "source", room: "Room 201", branch: "gil-puyat", monthlyRate: 6300 },
  detail: {},
  onClose() {},
  onSubmit() { assert.fail("Opening the modal must not submit a transfer"); },
});
function selectDestination() {
  const search = document.querySelector(".twm-search-select input");
  act(() => { search.focus(); });
  act(() => { fireEvent.mouseDown(document.querySelector(".twm-search-select__option")); });
}

test("transfer modal opens while preview is pending and retains existing rent", () => {
  state.preview = { data: undefined, isFetching: true };
  mounted = mount(element());
  assert.ok(getByRole(document.body, "heading", { name: "Transfer Tenant" }));
  selectDestination();
  assert.match(document.body.textContent, /Now: PHP 6,300\/mo/);
});

test("transfer modal uses the resolved preview rent and can reopen without crashing", () => {
  state.preview = { data: undefined, isFetching: true };
  mounted = mount(element());
  selectDestination();
  state.preview = { data: { data: { transferPreview: { rent: { sourceEffectiveRate: 6400 } } } }, isFetching: false };
  mounted.rerender(element());
  assert.match(document.body.textContent, /Now: PHP 6,400\/mo/);
  mounted.rerender(element(false));
  mounted.rerender(element());
  assert.ok(getByRole(document.body, "heading", { name: "Transfer Tenant" }));
});
