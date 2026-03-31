import { useState, useMemo, useEffect } from "react";
import { LayoutGrid, Settings, Plus, Pencil, Trash2 } from "lucide-react";

// Components
import { PageShell, SummaryBar, ActionBar, DataTable } from "../components/shared";
import RoomConfigModal from "../components/rooms/RoomConfigModal";
import RoomFormModal from "../components/rooms/RoomFormModal";
import DeleteRoomModal from "../components/rooms/DeleteRoomModal";


// Hooks & API
import { useDigitalTwinSnapshot } from "../../../shared/hooks/queries/useDigitalTwin";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { roomApi } from "../../../shared/api/apiClient";
import { useQueryClient } from "@tanstack/react-query";
import { showNotification } from "../../../shared/utils/notification";
import { formatRoomType, formatBranch } from "../utils/formatters";

// Styles
import "../styles/admin-room-availability.css";
import "../styles/admin-room-configuration.css";

function RoomAvailabilityPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState("rooms");
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [deletingRoom, setDeletingRoom] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ROOMS_PER_PAGE = 10;

  // Use Digital Twin snapshot so bed dots and occupancy bar are reservation-aware
  // Admins are branch-scoped; super admins (owners) see all
  const dtBranch = user?.branch && user.role !== "owner" ? user.branch : "all";
  const { data: snapshot, isLoading: loading } = useDigitalTwinSnapshot(dtBranch);
  const rooms = snapshot?.rooms ?? [];

  // Processing
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch =
        room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        room.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBranch = branchFilter === "all" || room.branch === branchFilter;
      const matchesFloor = floorFilter === "all" || String(room.floor) === floorFilter;
      const matchesType = roomTypeFilter === "all" || room.type === roomTypeFilter;

      return matchesSearch && matchesBranch && matchesFloor && matchesType;
    });
  }, [rooms, searchTerm, branchFilter, floorFilter, roomTypeFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, branchFilter, floorFilter, roomTypeFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = rooms.length;
    const occupied = rooms.reduce((sum, r) => sum + (r.currentOccupancy || 0), 0);
    const capacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
    const full = rooms.filter((r) => r.currentOccupancy >= r.capacity).length;
    const partial = rooms.filter((r) => r.currentOccupancy > 0 && r.currentOccupancy < r.capacity).length;
    const available = rooms.filter((r) => r.currentOccupancy === 0).length;

    return {
      total,
      full,
      partial,
      available,
      rate: capacity > 0 ? ((occupied / capacity) * 100).toFixed(1) : "0.0",
    };
  }, [rooms]);

  // Handlers
  const handleConfigure = (room) => {
    setSelectedRoom(room);
  };

  const handleToggleBed = (bedId) => {
    if (!selectedRoom) return;
    const updatedBeds = selectedRoom.beds.map((bed) => {
      if (bed.id !== bedId) return bed;
      const currentStatus = bed.status || (bed.available === false ? "occupied" : "available");
      if (currentStatus === "occupied") return bed;
      const newStatus = currentStatus === "available" ? "maintenance" : "available";
      return { ...bed, status: newStatus };
    });
    setSelectedRoom({ ...selectedRoom, beds: updatedBeds });
  };

  const handleSaveConfig = async (updatedRoom) => {
    try {
      await roomApi.update(updatedRoom._id, { beds: updatedRoom.beds });
      showNotification("Room configuration updated", "success");
      queryClient.invalidateQueries({ queryKey: ["digital-twin", "snapshot"] });
      setSelectedRoom(null);
    } catch (err) {
      showNotification(err.message || "Failed to update", "error");
    }
  };

  // CRUD handlers
  const handleSaveRoom = async (payload, roomId) => {
    try {
      if (roomId) {
        await roomApi.update(roomId, payload);
        showNotification("Room updated successfully", "success");
      } else {
        await roomApi.create(payload);
        showNotification("Room created successfully", "success");
      }
      queryClient.invalidateQueries({ queryKey: ["digital-twin", "snapshot"] });
      setShowCreateModal(false);
      setEditingRoom(null);
    } catch (err) {
      showNotification(err.message || "Failed to save room", "error");
      throw err;
    }
  };

  const handleDeleteRoom = async (roomId) => {
    try {
      await roomApi.delete(roomId);
      showNotification("Room deleted successfully", "success");
      queryClient.invalidateQueries({ queryKey: ["digital-twin", "snapshot"] });
      setDeletingRoom(null);
    } catch (err) {
      showNotification(err.message || "Failed to delete room", "error");
    }
  };

  // Config — 2 tabs: Rooms (merged with Bed Config) + Occupancy
  const tabs = [
    { key: "rooms", label: "Room Management", icon: LayoutGrid },
  ];

  const summaryItems = [
    { label: "Total Rooms", value: stats.total, color: "blue" },
    { label: "Full", value: stats.full, color: "red" },
    { label: "Partial", value: stats.partial, color: "orange" },
    { label: "Available", value: stats.available, color: "green" },
    { label: "Occupancy Rate", value: `${stats.rate}%`, color: "purple" },
  ];

  const filters = [
    {
      key: "branch",
      options: [
        { value: "all", label: "All Branches" },
        { value: "gil-puyat", label: "Gil Puyat" },
        { value: "guadalupe", label: "Guadalupe" },
      ],
      value: branchFilter,
      onChange: setBranchFilter,
    },
    {
      key: "floor",
      options: [
        { value: "all", label: "All Floors" },
        { value: "1", label: "Floor 1" },
        { value: "2", label: "Floor 2" },
      ],
      value: floorFilter,
      onChange: setFloorFilter,
    },
    {
      key: "type",
      options: [
        { value: "all", label: "All Types" },
        { value: "private", label: "Private" },
        { value: "double-sharing", label: "Double" },
        { value: "quadruple-sharing", label: "Quadruple" },
      ],
      value: roomTypeFilter,
      onChange: setRoomTypeFilter,
    },
  ];

  const columns = [
    {
      key: "room",
      label: "Room",
      render: (r) => (
        <div className="room-name-cell">
          <span className="room-name-primary">{r.name}</span>
          <span className="room-name-sub">Floor {r.floor}</span>
        </div>
      ),
    },
    { key: "branch", label: "Branch", render: (r) => formatBranch(r.branch) },
    { key: "type", label: "Type", render: (r) => formatRoomType(r.type) },
    {
      key: "beds",
      label: "Beds",
      render: (r) => {
        const beds = r.beds || [];
        const count = r.currentOccupancy || 0;
        // Exact same mapping as Digital Twin bedStatusColor()
        const dotColor = (status) => {
          switch (status) {
            case "occupied":    return "var(--status-success)";
            case "reserved":    return "var(--accent-blue)";
            case "locked":      return "var(--accent-orange)";
            case "maintenance": return "var(--status-error)";
            default:            return "var(--border-default)";
          }
        };
        const dotLabel = (status) => {
          switch (status) {
            case "occupied":    return "Moved In";
            case "reserved":    return "Reserved";
            case "locked":      return "Locked";
            case "maintenance": return "Maintenance";
            default:            return "Available";
          }
        };
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {beds.length > 0 ? beds.map((bed) => (
                <span
                  key={bed.id || bed._id}
                  title={`${bed.position || "Bed"} — ${dotLabel(bed.status)}`}
                  style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: dotColor(bed.status),
                    display: "inline-block",
                    border: "1.5px solid rgba(255,255,255,0.7)",
                    boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08)",
                    flexShrink: 0,
                  }}
                />
              )) : (
                Array.from({ length: r.capacity || 0 }).map((_, i) => (
                  <span key={i} style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: i < count ? "var(--status-success)" : "var(--border-default)",
                    display: "inline-block",
                    border: "1.5px solid rgba(255,255,255,0.7)",
                    boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08)",
                  }} />
                ))
              )}
            </div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 550 }}>
              {count}/{r.capacity}
            </span>
          </div>
        );
      },
    },
    {
      key: "occupancyRate",
      label: "Occupancy Rate",
      render: (r) => {
        const occupied = r.physicalOccupancy ?? 0;
        const reserved = r.reservedCount ?? 0;
        const capacity = r.capacity || 1;
        const occupiedPct = Math.round((occupied / capacity) * 100);
        const reservedPct = Math.round((reserved / capacity) * 100);
        const totalPct = Math.round(((occupied + reserved) / capacity) * 100);
        return (
          <div className="room-occupancy-cell">
            <div className="room-occupancy-bar" style={{ display: "flex", gap: "1px", overflow: "hidden", borderRadius: 3 }}>
              {occupiedPct > 0 && (
                <div
                  className="room-occupancy-fill"
                  style={{ width: `${occupiedPct}%`, background: "var(--status-success)", flexShrink: 0 }}
                />
              )}
              {reservedPct > 0 && (
                <div
                  className="room-occupancy-fill"
                  style={{ width: `${reservedPct}%`, background: "var(--accent-blue)", opacity: 0.75, flexShrink: 0 }}
                />
              )}
            </div>
            <span>{totalPct}%</span>
          </div>
        );
      },
    },
    ...(can("manageRooms")
      ? [
          {
            key: "action",
            label: "Actions",
            align: "right",
            render: (r) => (
              <div className="room-action-buttons">
                <button
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfigure(r);
                  }}
                  title="Configure beds"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  <Settings size={12} />
                </button>
                <button
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingRoom(r);
                  }}
                  title="Edit room"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="btn-secondary btn-icon-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingRoom(r);
                  }}
                  title="Delete room"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <PageShell tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      {/* Only show SummaryBar + ActionBar for the Rooms tab */}
      <PageShell.Summary>
        {activeTab === "rooms" && <SummaryBar items={summaryItems} />}
      </PageShell.Summary>

      <PageShell.Actions>
        {activeTab === "rooms" && (
          <ActionBar
            search={{
              value: searchTerm,
              onChange: setSearchTerm,
              placeholder: "Search rooms...",
            }}
            filters={filters}
            actions={
              can("manageRooms")
                ? [
                    {
                      label: "Add Room",
                      icon: Plus,
                      variant: "primary",
                      onClick: () => setShowCreateModal(true),
                    },
                  ]
                : []
            }
          />
        )}
      </PageShell.Actions>

      <PageShell.Content>
          {/* Color legend — matches Digital Twin bedStatusColor() exactly */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "8px 12px", marginBottom: 8,
            background: "var(--bg-inset, rgba(0,0,0,0.03))",
            borderRadius: 8, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>Bed Status:</span>
            {[
              { color: "var(--status-success)",   label: "Occupied" },
              { color: "var(--accent-blue)",      label: "Reserved" },
              { color: "var(--border-default)",   label: "Available" },
              { color: "var(--status-error)",     label: "Maintenance" },
            ].map(({ color, label }) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span style={{
                  width: 9, height: 9, borderRadius: "50%", background: color,
                  display: "inline-block", border: "1.5px solid rgba(0,0,0,0.08)",
                  flexShrink: 0,
                }} />
                {label}
              </span>
            ))}
          </div>

          <DataTable
            columns={columns}
            data={filteredRooms}
            loading={loading}
            onRowClick={can("manageRooms") ? handleConfigure : null}
            pagination={{
              page: currentPage,
              pageSize: ROOMS_PER_PAGE,
              total: filteredRooms.length,
              onPageChange: setCurrentPage,
            }}
            emptyState={{
              icon: LayoutGrid,
              title: "No rooms found",
              description: "Try adjusting your filters or adding new rooms.",
            }}
          />

        {selectedRoom && (
          <RoomConfigModal
            room={selectedRoom}
            onToggleBed={handleToggleBed}
            onClose={() => setSelectedRoom(null)}
            onSave={handleSaveConfig}
          />
        )}

        {(showCreateModal || editingRoom) && (
          <RoomFormModal
            room={editingRoom}
            onClose={() => {
              setShowCreateModal(false);
              setEditingRoom(null);
            }}
            onSave={handleSaveRoom}
          />
        )}

        {deletingRoom && (
          <DeleteRoomModal
            room={deletingRoom}
            onClose={() => setDeletingRoom(null)}
            onDelete={handleDeleteRoom}
          />
        )}
      </PageShell.Content>
    </PageShell>
  );
}

export default RoomAvailabilityPage;
