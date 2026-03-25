import { useState, useMemo } from "react";
import { LayoutGrid, Settings, Plus, Pencil, Trash2 } from "lucide-react";

// Components
import { PageShell, SummaryBar, ActionBar, DataTable, StatusBadge } from "../components/shared";
import RoomConfigModal from "../components/rooms/RoomConfigModal";
import RoomFormModal from "../components/rooms/RoomFormModal";
import DeleteRoomModal from "../components/rooms/DeleteRoomModal";


// Hooks & API
import { useRooms } from "../../../shared/hooks/queries/useRooms";
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

  // Data fetching
  const { data: rooms = [], isLoading: loading } = useRooms();

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
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
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
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
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
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
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
      render: (r) => `${r.currentOccupancy || 0}/${r.capacity}`,
    },
    {
      key: "occupancyRate",
      label: "Occupancy Rate",
      render: (r) => {
        const rate = Math.round(((r.currentOccupancy || 0) / r.capacity) * 100);
        const color =
          rate >= 100
            ? "var(--status-error)"
            : rate > 0
              ? "var(--status-warning)"
              : "var(--status-success)";
        return (
          <div className="room-occupancy-cell">
            <div className="room-occupancy-bar">
              <div
                className="room-occupancy-fill"
                style={{ width: `${rate}%`, background: color }}
              />
            </div>
            <span>{rate}%</span>
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (r) => {
        if (r.currentOccupancy >= r.capacity) return <StatusBadge variant="error">Full</StatusBadge>;
        if (r.currentOccupancy > 0) return <StatusBadge variant="warning">Partial</StatusBadge>;
        return <StatusBadge variant="success">Available</StatusBadge>;
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
          <DataTable
            columns={columns}
            data={filteredRooms}
            loading={loading}
            onRowClick={can("manageRooms") ? handleConfigure : null}
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
