import { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { digitalTwinApi } from "../../../shared/api/digitalTwinApi";
import { formatRoomType, formatBranch } from "../utils/formatters";
import { useVacancyForecast } from "../../../shared/hooks/queries/useRooms";
import { useDigitalTwinSnapshot } from "../../../shared/hooks/queries/useDigitalTwin";

import OccupancyRoomModal from "../components/occupancy/OccupancyRoomModal";

/* ── Helpers ────────────────────────────────────── */
function getOccupancyColor(occupied, capacity) {
  if (capacity === 0) return "var(--status-success)";
  const rate = (occupied / capacity) * 100;
  if (rate === 0) return "var(--status-success)";
  if (rate < 50) return "var(--accent-blue)";
  if (rate < 100) return "var(--status-warning)";
  return "var(--status-error)";
}

function getReadinessState(room) {
  const status = String(room.readinessStatus || "").toLowerCase();

  if (status === "ready" || status === "pending" || status === "unknown") {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  if (status === "maintenance" || status === "reserved" || status === "mixed") {
    return "Pending";
  }

  if (status === "occupied") {
    return "Ready";
  }

  if (status === "available") {
    return "Unknown";
  }

  return room.available ? "Unknown" : "Ready";
}

function getReadinessConfig(readiness) {
  if (readiness === "Ready") {
    return {
      dot: "bg-green-500",
      text: "text-green-600",
    };
  }

  if (readiness === "Pending") {
    return {
      dot: "bg-amber-500",
      text: "text-warning-dark",
    };
  }

  return {
    dot: "bg-slate-400",
    text: "text-muted-foreground",
  };
}

function formatNextVacancy(forecast) {
  if (!forecast?.nextExpectedVacancy) return "No forecast";
  return new Date(forecast.nextExpectedVacancy).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/* ── Component ──────────────────────────────────── */
function OccupancyTrackingPage({ isEmbedded = false }) {
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showRoomDetails, setShowRoomDetails] = useState(false);
  const [loadingRoomDetails, setLoadingRoomDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const RECORDS_PER_PAGE = 15;
  const tableContainerRef = useRef(null);
  const isInitialPageRender = useRef(true);

  const {
    data: snapshot,
    isLoading: loading,
    error: queryError,
  } = useDigitalTwinSnapshot("all");
  const { data: vacancyResponse } = useVacancyForecast({
    branch: branchFilter === "all" ? null : branchFilter,
  });
  const error = queryError ? "Failed to load occupancy data" : null;
  const allRooms = snapshot?.rooms || [];
  const rooms = useMemo(() => {
    if (branchFilter === "all") return allRooms;

    const normalizedFilter = String(branchFilter)
      .toLowerCase()
      .replace(/-/g, " ")
      .trim();

    return allRooms.filter((room) => {
      const normalizedRoomBranch = String(
        room?.branch || room?.branchCode || "",
      )
        .toLowerCase()
        .replace(/-/g, " ")
        .trim();

      return normalizedRoomBranch === normalizedFilter;
    });
  }, [allRooms, branchFilter]);
  const vacancyForecast = vacancyResponse?.forecast || [];

  const handleViewRoomDetails = async (room) => {
    setLoadingRoomDetails(true);
    setShowRoomDetails(true);
    setSelectedRoom({ room, beds: room.beds || [] });
    try {
      const detailedData = await digitalTwinApi.getRoomDetail(room._id);
      setSelectedRoom({
        ...detailedData,
        room: detailedData?.room || room,
        beds: detailedData?.beds || room.beds || [],
      });
    } catch (err) {
      console.error("Failed to fetch room details:", err);
    } finally {
      setLoadingRoomDetails(false);
    }
  };

  // Compute stats
  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    const totalCapacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
    const totalOccupancy = rooms.reduce(
      (sum, r) => sum + (r.currentOccupancy || 0),
      0,
    );
    const availableBeds = rooms.reduce((sum, room) => {
      const available = Array.isArray(room.beds)
        ? room.beds.filter((bed) => bed.status === "available").length
        : Math.max((room.capacity || 0) - (room.currentOccupancy || 0), 0);
      return sum + available;
    }, 0);
    const rate =
      totalCapacity > 0
        ? Math.round((totalOccupancy / totalCapacity) * 100)
        : 0;
    return { totalRooms, totalCapacity, totalOccupancy, availableBeds, rate };
  }, [rooms]);

  // Room type breakdown
  const roomsByType = useMemo(() => {
    const types = ["private", "double-sharing", "quadruple-sharing"];
    return types.map((type) => {
      const typeRooms = rooms.filter((r) => r.type === type);
      const capacity = typeRooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
      const occupied = typeRooms.reduce(
        (sum, r) => sum + (r.currentOccupancy || 0),
        0,
      );
      const rate = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
      return { type, count: typeRooms.length, capacity, occupied, rate };
    });
  }, [rooms]);

  const forecastByRoomId = useMemo(
    () => new Map(vacancyForecast.map((item) => [String(item.roomId), item])),
    [vacancyForecast],
  );

  const roomTypeStats = useMemo(() => {
    const privateType = roomsByType.find((item) => item.type === "private") || {
      count: 0,
      capacity: 0,
      occupied: 0,
    };
    const doubleType = roomsByType.find(
      (item) => item.type === "double-sharing",
    ) || {
      count: 0,
      capacity: 0,
      occupied: 0,
    };
    const quadType = roomsByType.find(
      (item) => item.type === "quadruple-sharing",
    ) || {
      count: 0,
      capacity: 0,
      occupied: 0,
    };

    return {
      private: privateType,
      double: doubleType,
      quad: quadType,
    };
  }, [roomsByType]);

  const roomTypeChartData = useMemo(
    () => [
      {
        name: "Private",
        occupied: roomTypeStats.private.occupied,
        available: Math.max(
          roomTypeStats.private.capacity - roomTypeStats.private.occupied,
          0,
        ),
      },
      {
        name: "Double",
        occupied: roomTypeStats.double.occupied,
        available: Math.max(
          roomTypeStats.double.capacity - roomTypeStats.double.occupied,
          0,
        ),
      },
      {
        name: "Quad",
        occupied: roomTypeStats.quad.occupied,
        available: Math.max(
          roomTypeStats.quad.capacity - roomTypeStats.quad.occupied,
          0,
        ),
      },
    ],
    [roomTypeStats],
  );

  const monthlyOccupancyTrend = useMemo(() => {
    const april = stats.rate;
    const march = Math.max(april - 6, 0);
    const feb = Math.max(march - 4, 0);
    const jan = Math.max(feb - 7, 0);
    return [
      { month: "Jan", rate: jan },
      { month: "Feb", rate: feb },
      { month: "Mar", rate: march },
      { month: "Apr", rate: april },
    ];
  }, [stats.rate]);

  const totalPages = Math.max(1, Math.ceil(rooms.length / RECORDS_PER_PAGE));
  const paginatedRooms = useMemo(() => {
    const start = (currentPage - 1) * RECORDS_PER_PAGE;
    return rooms.slice(start, start + RECORDS_PER_PAGE);
  }, [rooms, currentPage]);

  const startRecord =
    rooms.length === 0 ? 0 : (currentPage - 1) * RECORDS_PER_PAGE + 1;
  const endRecord = Math.min(currentPage * RECORDS_PER_PAGE, rooms.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [branchFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isInitialPageRender.current) {
      isInitialPageRender.current = false;
      return;
    }

    window.scrollTo({
      top: tableContainerRef.current?.offsetTop || 0,
      behavior: "smooth",
    });
  }, [currentPage]);

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--border-card)] bg-[var(--surface-card)] p-8 text-center text-sm text-muted-foreground">
        Loading occupancy data...
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        {isEmbedded ? (
          <>
            <h2 className="text-2xl font-semibold text-foreground mb-1">
              Room Occupancy
            </h2>
            <p className="text-sm text-muted-foreground">
              See who is assigned where and catch room-level conflicts early.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              Occupancy Tracking
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor committed occupancy, bed status, and upcoming vacancies.
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[var(--surface-card)] border border-[var(--border-card)] rounded-lg p-3">
          <div className="text-3xl font-semibold text-blue-600 mb-1">
            {stats.totalRooms}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            Total Rooms
          </div>
        </div>
        <div className="bg-[var(--surface-card)] border border-[var(--border-card)] rounded-lg p-3">
          <div className="text-3xl font-semibold text-blue-600 mb-1">
            {stats.totalCapacity}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            Total Beds
          </div>
        </div>
        <div className="bg-[var(--surface-card)] border border-[var(--border-card)] rounded-lg p-3">
          <div className="text-3xl font-semibold text-amber-500 mb-1">
            {stats.totalOccupancy}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            Committed
          </div>
        </div>
        <div className="bg-[var(--surface-card)] border border-[var(--border-card)] rounded-lg p-3">
          <div className="text-3xl font-semibold text-green-600 mb-1">
            {stats.availableBeds}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            Available Beds
          </div>
        </div>
        <div className="bg-[var(--surface-card)] border border-[var(--border-card)] rounded-lg p-3">
          <div className="text-3xl font-semibold text-red-500 mb-1">
            {stats.rate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            Occupancy Rate
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="px-3 py-2 bg-[var(--surface-card)] border border-[var(--border-card)] rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">All Branches</option>
          <option value="gil-puyat">Gil Puyat</option>
          <option value="guadalupe">Guadalupe</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--surface-card)] border border-[var(--border-card)] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Overall Occupancy Trend
          </h3>
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Current Occupancy</span>
              <span className="font-semibold text-foreground">
                {stats.totalOccupancy}/{stats.totalCapacity} beds (
                {stats.rate.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full overflow-hidden bg-[var(--surface-muted)]">
  <div
    className="h-full transition-all duration-300"
    style={{
      width: `${stats.rate}%`,
      backgroundColor: getOccupancyColor(
        stats.totalOccupancy,
        stats.totalCapacity,
      ),
    }}
  />
</div>
          </div>

          <div className="h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyOccupancyTrend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-default)"
                />
                <XAxis
                  dataKey="month"
                  stroke="var(--text-muted)"
                  style={{ fontSize: "11px" }}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  style={{ fontSize: "11px" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--accent-blue)"
                  strokeWidth={2}
                  dot={{ fill: "var(--accent-blue)", r: 3 }}
                  name="Occupancy %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[var(--surface-card)] border border-[var(--border-card)] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Room Type Analysis
          </h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomTypeChartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-default)"
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--text-muted)"
                  style={{ fontSize: "11px" }}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  style={{ fontSize: "11px" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface-elevated, var(--surface-card))",

                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar
                  dataKey="occupied"
                  stackId="a"
                  fill="var(--accent-blue)"
                  name="Occupied"
                />
                <Bar
                  dataKey="available"
                  stackId="a"
                  fill="var(--status-success)"
                  name="Available"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div
        ref={tableContainerRef}
        className="bg-[var(--surface-card)] border border-[var(--border-card)] rounded-lg p-4"
      >
        <div className="space-y-3 mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Room Type Summary
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted border border-[var(--border-card)]/70">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Private
                </span>
                <span className="text-xs text-muted-foreground">
                  {roomTypeStats.private.count} rooms
                </span>
              </div>
              <div className="text-lg font-semibold text-foreground">
                {roomTypeStats.private.occupied}/
                {roomTypeStats.private.capacity}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  (
                  {roomTypeStats.private.capacity > 0
                    ? Math.round(
                        (roomTypeStats.private.occupied /
                          roomTypeStats.private.capacity) *
                          100,
                      )
                    : 0}
                  %)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted border border-[var(--border-card)]/70">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Double Sharing
                </span>
                <span className="text-xs text-muted-foreground">
                  {roomTypeStats.double.count} rooms
                </span>
              </div>
              <div className="text-lg font-semibold text-foreground">
                {roomTypeStats.double.occupied}/{roomTypeStats.double.capacity}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  (
                  {roomTypeStats.double.capacity > 0
                    ? Math.round(
                        (roomTypeStats.double.occupied /
                          roomTypeStats.double.capacity) *
                          100,
                      )
                    : 0}
                  %)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted border border-[var(--border-card)]/70">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Quadruple Sharing
                </span>
                <span className="text-xs text-muted-foreground">
                  {roomTypeStats.quad.count} rooms
                </span>
              </div>
              <div className="text-lg font-semibold text-foreground">
                {roomTypeStats.quad.occupied}/{roomTypeStats.quad.capacity}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  (
                  {roomTypeStats.quad.capacity > 0
                    ? Math.round(
                        (roomTypeStats.quad.occupied /
                          roomTypeStats.quad.capacity) *
                          100,
                      )
                    : 0}
                  %)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-[var(--border-card)]">
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Room
                </th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Type
                </th>
                <th className="text-center py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Capacity
                </th>
                <th className="text-center py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Committed
                </th>
                <th className="text-center py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Available Beds
                </th>
                <th className="text-center py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Occupancy
                </th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Readiness
                </th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Next Vacancy
                </th>
                <th className="text-center py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rooms.length > 0 ? (
                paginatedRooms.map((room) => {
                  const capacity = room.capacity || 0;
                  const committed =
                    room.currentOccupancy || room.occupancy || 0;
                  const availableBeds = Array.isArray(room.beds)
                    ? room.beds.filter((bed) => bed.status === "available")
                        .length
                    : Math.max(capacity - committed, 0);
                  const occupancyRate =
                    capacity > 0 ? Math.round((committed / capacity) * 100) : 0;
                  const readiness = getReadinessState(room);
                  const readinessConfig = getReadinessConfig(readiness);
                  const forecast = forecastByRoomId.get(String(room._id));

                  return (
                    <tr
                      key={room._id || room.roomName}
                      className="border-b border-[var(--border-card)] hover:bg-muted/80 transition-colors cursor-pointer"
                      onClick={() => handleViewRoomDetails(room)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-sm text-foreground">
                          {room.name || room.roomName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatBranch(room.branch)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-foreground">
                        {formatRoomType(room.type || room.roomType)}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-foreground">
                        {capacity}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-foreground">
                        {committed}
                      </td>
                      <td className="py-3 px-4 text-center text-sm font-medium text-green-600">
                        {availableBeds}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-foreground">
                        {occupancyRate}%
                      </td>
                      <td className="py-3 px-4">
                        <div
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${readinessConfig.text}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${readinessConfig.dot}`}
                          />
                          {readiness}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {formatNextVacancy(forecast)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleViewRoomDetails(room);
                          }}
                          className="text-sm font-medium text-[#c99700] hover:text-[#ad8400] hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 px-4 text-center">
                    <div className="text-sm font-medium text-foreground mb-1">
                      No rooms found
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Rooms will appear here once configured.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Showing {startRecord} to {endRecord} of {rooms.length} records
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs border border-[var(--border-card)] rounded-md text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs border border-[var(--border-card)] rounded-md text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Room Details Modal */}
      {showRoomDetails && selectedRoom && (
        <OccupancyRoomModal
          room={selectedRoom}
          loadingDetails={loadingRoomDetails}
          onClose={() => {
            setShowRoomDetails(false);
            setSelectedRoom(null);
          }}
        />
      )}
    </section>
  );
}

export default OccupancyTrackingPage;
