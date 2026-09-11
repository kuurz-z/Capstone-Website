import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const roomFind = jest.fn();
const roomFindById = jest.fn();
const reservationDistinct = jest.fn();
const utilityReadingDistinct = jest.fn();
const utilityPeriodFind = jest.fn();
const utilityReadingFind = jest.fn();
const reservationFind = jest.fn();
const billFind = jest.fn();

await jest.unstable_mockModule("../models/index.js", () => ({
  Bill: {
    find: billFind,
  },
  Room: {
    find: roomFind,
    findById: roomFindById,
  },
  Reservation: {
    distinct: reservationDistinct,
    find: reservationFind,
  },
  UtilityPeriod: {
    find: utilityPeriodFind,
  },
  UtilityReading: {
    distinct: utilityReadingDistinct,
    find: utilityReadingFind,
  },
}));

const { getUtilityDiagnostics, getReadyUtilityPeriods } = await import("./utilityDiagnostics.js");

describe('completed utility publication discovery', () => {
  const period = (id, overrides={}) => ({_id:id,status:'closed',startDate:'2026-07-01',endDate:'2026-08-01',tenantSummaries:[{billId:'bill-'+id,billAmount:100}],...overrides});
  const bill = (id, overrides={}) => ({_id:'bill-'+id,status:'draft',charges:{electricity:100,water:100},utilityDispatch:{electricity:{state:'draft',periodId:id},water:{state:'draft',periodId:id}},...overrides});
  const ready = (periods,bills,type='electricity') => getReadyUtilityPeriods({periods,utilityType:type,billStatusMap:new Map(bills.map(b=>[b._id,b]))}).map(p=>p.id);
  test('returns every older completed draft even when the newest period is open',()=>{
    expect(ready([period('first'),period('second',{status:'revised'}),period('next',{status:'open'})],[bill('first'),bill('second'),bill('next')])).toEqual(['first','second']);
  });
  test('excludes archived, invalid-date, review, zero, settled and already sent periods',()=>{
    const periods=[period('archived',{isArchived:true}),period('dates',{endDate:'2026-06-01'}),period('review',{status:'manual_review_required'}),period('zero',{tenantSummaries:[{billId:'bill-zero',billAmount:0}]}),period('settled',{tenantSummaries:[{billId:'bill-settled',billAmount:100,settledOnTransfer:true}]}),period('sent'),period('missing')];
    const bills=periods.map(p=>bill(p._id));
    bills.find(b=>b._id==='bill-sent').utilityDispatch.electricity.state='sent';
    expect(ready(periods,bills.filter(b=>b._id!=='bill-missing'))).toEqual([]);
  });
  test('Water discovery uses allocation identities despite sent aggregate dispatch or a paid invoice',()=>{
    const shared={...bill('shared'),utilityDispatch:{water:{state:'sent'}},waterAllocations:[{utilityPeriodId:'sent',state:'sent',amount:100},{utilityPeriodId:'draft',state:'draft',amount:100}]};
    const periods=['sent','draft','unrelated'].map(id=>period(id,{tenantSummaries:[{billId:shared._id,billAmount:100}]}));
    expect(ready(periods,[shared],'water')).toEqual(['draft']);
    // Publication moves the draft to a separate invoice, preserving the paid one.
    expect(ready(periods,[{...shared,status:'paid'}],'water')).toEqual(['draft']);
  });
  test('excludes archived/voided invoices and paid legacy Water',()=>{
    expect(ready([period('a'),period('b'),period('c')],[bill('a',{isArchived:true}),bill('b',{status:'voided'}),bill('c',{status:'paid'})],'water')).toEqual([]);
  });
});

function mockLeanResult(value) {
  return {
    lean: jest.fn().mockResolvedValue(value),
  };
}

function mockSelectLeanResult(value) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  };
}

function mockSortedLeanResult(value) {
  return {
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  };
}

describe("getUtilityDiagnostics", () => {
  beforeEach(() => {
    roomFind.mockReset();
    roomFindById.mockReset();
    reservationDistinct.mockReset();
    utilityReadingDistinct.mockReset();
    utilityPeriodFind.mockReset();
    utilityReadingFind.mockReset();
    reservationFind.mockReset();
    billFind.mockReset();

    utilityPeriodFind.mockReturnValue(mockSortedLeanResult([]));
    utilityReadingFind.mockReturnValue(mockSortedLeanResult([]));
    billFind.mockReturnValue(mockSelectLeanResult([]));
    reservationFind.mockReturnValue({
      populate: jest.fn().mockReturnValue(mockLeanResult([])),
    });
  });

  test("includes branch rooms with active moved-in tenants even when no readings exist yet", async () => {
    roomFind.mockReturnValueOnce(
      mockSelectLeanResult([
        {
          _id: "room-1",
          name: "Room A",
          roomNumber: "A-101",
          branch: "gil-puyat",
          type: "private",
          capacity: 1,
        },
      ]),
    );
    roomFindById.mockReturnValue(
      mockSelectLeanResult({
        _id: "room-1",
        name: "Room A",
        roomNumber: "A-101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
      }),
    );

    reservationDistinct.mockResolvedValue(["room-1"]);
    utilityReadingDistinct.mockResolvedValue([]);

    const result = await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(result.electricityRooms).toHaveLength(1);
    expect(result.electricityRooms[0]).toMatchObject({
      roomId: "room-1",
      id: "room-1",
      name: "Room A",
      roomName: "Room A",
      branch: "gil-puyat",
      activeTenantCount: 0,
      hasOpenPeriod: false,
      latestReading: null,
    });
    expect(roomFind).toHaveBeenCalledWith({
      isArchived: false,
      branch: "gil-puyat",
    });
  });

  test("returns all branch rooms when the branch has no reservations or readings yet", async () => {
    roomFind.mockReturnValueOnce(
      mockSelectLeanResult([
        {
          _id: "room-2",
          name: "Room B",
          roomNumber: "B-201",
          branch: "gil-puyat",
          type: "double-sharing",
          capacity: 2,
        },
      ]),
    );
    roomFindById.mockReturnValue(
      mockSelectLeanResult({
        _id: "room-2",
        name: "Room B",
        roomNumber: "B-201",
        branch: "gil-puyat",
        type: "double-sharing",
        capacity: 2,
      }),
    );

    reservationDistinct.mockResolvedValue([]);
    utilityReadingDistinct.mockResolvedValue([]);

    const result = await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(result.electricityRooms).toHaveLength(1);
    expect(result.waterRooms).toHaveLength(1);
    expect(roomFind).toHaveBeenCalledWith({
      isArchived: false,
      branch: "gil-puyat",
    });
  });

  test("filters out guadalupe rooms from electricity and water diagnostics because it uses fixed-rate billing", async () => {
    roomFind.mockReturnValueOnce(
      mockSelectLeanResult([
        {
          _id: "room-gp",
          name: "GP Room 101",
          roomNumber: "101",
          branch: "gil-puyat",
          type: "private",
          capacity: 1,
        },
        {
          _id: "room-gd",
          name: "GD Room 102",
          roomNumber: "102",
          branch: "guadalupe",
          type: "quadruple",
          capacity: 4,
        },
      ]),
    );

    const result = await getUtilityDiagnostics();

    expect(result.electricityRooms).toHaveLength(1);
    expect(result.electricityRooms[0].branch).toBe("gil-puyat");
    expect(result.waterRooms).toHaveLength(1);
    expect(result.waterRooms[0].branch).toBe("gil-puyat");
  });

  test("limits water rooms to private and double-sharing types", async () => {
    const rooms = [
      {
        _id: "room-private",
        name: "Room Private",
        roomNumber: "P-101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
      },
      {
        _id: "room-double",
        name: "Room Double",
        roomNumber: "D-201",
        branch: "gil-puyat",
        type: "double-sharing",
        capacity: 2,
      },
      {
        _id: "room-quad",
        name: "Room Quad",
        roomNumber: "Q-301",
        branch: "gil-puyat",
        type: "quadruple-sharing",
        capacity: 4,
      },
    ];

    roomFind.mockReturnValueOnce(mockSelectLeanResult(rooms));
    roomFindById.mockImplementation((roomId) =>
      mockSelectLeanResult(rooms.find((room) => room._id === roomId) || null),
    );

    const result = await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(result.electricityRooms).toHaveLength(3);
    expect(result.waterRooms).toHaveLength(2);
    expect(result.waterRooms.map((room) => room.type)).toEqual([
      "private",
      "double-sharing",
    ]);
  });

  test("loads room type when building water room eligibility", async () => {
    const selectedFields = [];
    roomFind.mockReturnValueOnce({
      select: jest.fn().mockImplementation((fields) => {
        selectedFields.push(fields);
        return {
          lean: jest.fn().mockResolvedValue([
            {
              _id: "room-private",
              type: "private",
            },
          ]),
        };
      }),
    });
    roomFindById.mockReturnValue(
      mockSelectLeanResult({
        _id: "room-private",
        name: "Room Private",
        roomNumber: "P-101",
        branch: "gil-puyat",
        type: "private",
        capacity: 1,
      }),
    );

    await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(selectedFields).toContain("_id name roomNumber branch type capacity");
  });

  test("adds tenant-aware electricity review data for rooms with periods", async () => {
    const room = {
      _id: "room-review",
      name: "Room Review",
      roomNumber: "R-101",
      branch: "gil-puyat",
      type: "private",
      capacity: 1,
    };
    roomFind.mockReturnValueOnce(mockSelectLeanResult([room]));
    utilityPeriodFind.mockReturnValue(
      mockSortedLeanResult([
        {
          _id: "period-review-old",
          utilityType: "electricity",
          roomId: "room-review",
          status: "closed",
          startDate: "2025-12-01T00:00:00.000Z",
          endDate: "2025-12-31T00:00:00.000Z",
          startReading: 900,
          endReading: 990,
          ratePerUnit: 12,
          computedTotalUsage: 90,
          verified: true,
          tenantSummaries: [
            {
              tenantId: "tenant-1",
              tenantName: "Ana Santos",
              totalUsage: 90,
              coveredDays: 30,
              billAmount: 1080,
            },
          ],
        },
        {
          _id: "period-review-current",
          utilityType: "electricity",
          roomId: "room-review",
          status: "closed",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-01-31T00:00:00.000Z",
          startReading: 990,
          endReading: 1200,
          ratePerUnit: 12,
          computedTotalUsage: 210,
          verified: true,
          tenantSummaries: [
            {
              tenantId: "tenant-1",
              tenantName: "Ana Santos",
              totalUsage: 210,
              coveredDays: 30,
              billAmount: 2520,
            },
          ],
        },
      ]),
    );

    const result = await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(result.electricityRooms[0].electricityReview).toMatchObject({
      validationState: "ok",
      reviewRequired: true,
      canSendBill: true,
      anomalyReview: expect.objectContaining({
        riskLevel: expect.any(String),
        reasons: expect.arrayContaining([
          expect.objectContaining({ code: "tenant_spike" }),
        ]),
      }),
    });
  });

  test("diagnostics GET reports missing anchors without mutating an open period", async () => {
    const save = jest.fn();
    roomFind.mockReturnValueOnce(mockSelectLeanResult([{
      _id: "room-read-only",
      name: "Room Read Only",
      roomNumber: "RO-1",
      branch: "gil-puyat",
      type: "private",
      capacity: 1,
    }]));
    utilityPeriodFind.mockReturnValue(mockSortedLeanResult([{
      _id: "period-open",
      utilityType: "electricity",
      roomId: "room-read-only",
      status: "open",
      startDate: "2026-08-01T00:00:00.000Z",
      startReading: 100,
      ratePerUnit: 16,
      save,
    }]));
    reservationFind.mockReturnValue({
      populate: jest.fn().mockReturnValue(mockLeanResult([{
        _id: "reservation-1",
        roomId: "room-read-only",
        userId: { _id: "tenant-1", firstName: "Tenant", lastName: "One" },
        status: "moveIn",
        moveInDate: "2026-08-02T00:00:00.000Z",
      }])),
    });

    const result = await getUtilityDiagnostics({ branch: "gil-puyat" });

    expect(save).not.toHaveBeenCalled();
    expect(result.electricityRooms[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ issueCode: "electricity_missing_movein_anchor", status: "manual_review_required" }),
    ]));
  });
});
