import { describe, test, expect, jest } from "@jest/globals";
import { touchReservationActivity } from "./reservationLifecycleController.js";

describe("touchReservationActivity", () => {
  test("returns 400 when reservationId is not a valid ObjectId", async () => {
    const req = {
      params: { reservationId: "not-a-valid-id" },
      user: { uid: "firebase_user_1" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await touchReservationActivity(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/invalid/i) })
    );
  });
});
