import { describe, expect, test } from "@jest/globals";
import { shouldRepairUser, computeRepairedName } from "./fix_split_google_names.mjs";

describe("fix_split_google_names", () => {
  test("shouldRepairUser identifies users with truncated first names and multi-word last names", () => {
    const user1 = { firstName: "Ma", lastName: "Elonah Kay Manes" };
    expect(shouldRepairUser(user1)).toBe(true);

    const user2 = { firstName: "Vince", lastName: "Palicpic" };
    expect(shouldRepairUser(user2)).toBe(false);

    const user3 = { firstName: "John", lastName: "Paul Smith" };
    expect(shouldRepairUser(user3)).toBe(true);
  });

  test("computeRepairedName correctly re-parses user name while preserving periods", () => {
    const user = { firstName: "Ma", lastName: "Elonah Kay Manes" };
    const repaired = computeRepairedName(user);
    expect(repaired.firstName).toBe("Ma. Elonah Kay");
    expect(repaired.lastName).toBe("Manes");
  });
});
