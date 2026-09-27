import test from "node:test";
import assert from "node:assert/strict";

import {
  getReservationCancellationUiState,
  hasPaidReservationFee,
  hasSettledAdvanceAndDeposit,
} from "./reservationCancellationUi.js";

test("paid reserved reservation can request cancellation", () => {
  const reservation = {
    status: "reserved",
    paymentStatus: "paid",
    paymentDate: "2026-05-17T00:00:00.000Z",
  };

  assert.equal(hasPaidReservationFee(reservation), true);
  assert.equal(hasSettledAdvanceAndDeposit(reservation), false);
  assert.deepEqual(getReservationCancellationUiState(reservation), {
    visible: true,
    canRequest: true,
    isPending: false,
    isSettledLocked: false,
  });
});

test("advance rent and security deposit settled reservation locks cancellation with isSettledLocked true", () => {
  const reservation = {
    status: "reserved",
    paymentStatus: "paid_in_full",
    initialPaymentStatus: "paid",
  };

  assert.equal(hasSettledAdvanceAndDeposit(reservation), true);
  assert.deepEqual(getReservationCancellationUiState(reservation), {
    visible: true,
    canRequest: false,
    isPending: false,
    isSettledLocked: true,
  });
});

test("pending cancellation request shows pending state instead of request action", () => {
  const reservation = {
    status: "reserved",
    paymentStatus: "paid",
    cancellationRequested: true,
    cancellationStatus: "pending",
  };

  assert.deepEqual(getReservationCancellationUiState(reservation), {
    visible: true,
    canRequest: false,
    isPending: true,
    isSettledLocked: false,
  });
});

test("moved-in and cancelled reservations hide applicant cancellation request action", () => {
  assert.equal(
    getReservationCancellationUiState({
      status: "moveIn",
      paymentStatus: "paid",
    }).visible,
    false,
  );
  assert.equal(
    getReservationCancellationUiState({
      status: "cancelled",
      paymentStatus: "paid",
    }).visible,
    false,
  );
});
