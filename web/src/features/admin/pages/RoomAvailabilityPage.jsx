/**
 * RoomAvailabilityPage — Unified Room & Inventory Management Workspace
 * Consolidated Live Occupancy & Vacancy Forecast View
 */
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  LayoutGrid,
  Plus,
  Bed,
  Wrench,
  DoorOpen,
  DoorClosed,
  Users,
  Search,
  RotateCcw,
  X,
  FilterX,
  CheckCircle2,
  AlertTriangle,
  CircleDot,
  Layers,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Download,
  RefreshCw,
} from "lucide-react";

// Components
import RoomConfigModal from "../components/rooms/RoomConfigModal";
import RoomFormModal from "../components/rooms/RoomFormModal";
import DeleteRoomModal from "../components/rooms/DeleteRoomModal";
import DoubleDeckRoomCard from "../components/rooms/DoubleDeckRoomCard";
import RoomBedHistoryDrawer from "../components/rooms/RoomBedHistoryDrawer";
import RoomImageLightboxModal from "../components/rooms/RoomImageLightboxModal";
import AdminPageHeader from "../../../shared/components/AdminPageHeader";
import { AdminRoomAvailabilitySkeleton } from "../components/AdminContentSkeletons";
import { ExportButtons } from "./analyticsTabShared.js";

// Hooks & API
import { useRooms } from "../../../shared/hooks/queries/useRooms";
import { useRoomStats } from "../../../shared/hooks/queries/useRoomStats";
import { useAuth } from "../../../shared/hooks/useAuth";
import { usePermissions } from "../../../shared/hooks/usePermissions";
import { roomApi } from "../../../shared/api/apiClient";
import { useQueryClient } from "@tanstack/react-query";
import { showNotification } from "../../../shared/utils/notification";
import { OWNER_BRANCH_FILTER_OPTIONS } from "../../../shared/utils/constants";
import {
  normalizeBranchFilterValue,
  syncBranchSearchParam,
} from "../../../shared/utils/branchFilterQuery.mjs";
import { formatRoomType, formatBranch } from "../utils/formatters";
import { getBedDisplayLabel } from "../../../shared/utils/bedIdentifier";
import {
  handleExportRoomsCSV,
  handleExportRoomsPDF,
} from "../utils/roomExportUtils.js";
import getFriendlyError from "../../../shared/utils/friendlyError";

// Styles
import "../styles/admin-room-availability.css";
import "../styles/admin-room-configuration.css";

const getEffectiveOccupancy = (room) => {
  if (!room) return 0;
  const occupiedFromBeds = (room.beds || []).filter(
    (b) => b.status === "occupied" || b.status === "reserved" || Boolean(b.occupiedBy?.userId)
  ).length;
  return Math.max(Number(room.currentOccupancy || 0), occupiedFromBeds);
};

const getTimelineStatusBadgeMeta = (days) => {
  if (days == null) {
    return {
      label: "Scheduled",
      icon: Calendar,
      dot: "bg-slate-400",
      textColor: "text-slate-700 dark:text-slate-300",
    };
  }
  if (days <= 0) {
    return {
      label: days === 0 ? "Vacant Today" : `Overdue (${Math.abs(days)}d)`,
      icon: AlertTriangle,
      dot: "bg-rose-500",
      textColor: "text-rose-700 dark:text-rose-400 font-bold",
    };
  }
  if (days <= 7) {
    return {
      label: `${days} ${days === 1 ? "day" : "days"} left`,
      icon: AlertTriangle,
      dot: "bg-rose-500",
      textColor: "text-rose-700 dark:text-rose-400 font-bold",
    };
  }
  if (days <= 30) {
    return {
      label: `${days} days left`,
      icon: Clock,
      dot: "bg-amber-500",
      textColor: "text-amber-700 dark:text-amber-400 font-semibold",
    };
  }
  if (days <= 90) {
    return {
      label: `${days} days left`,
      icon: Calendar,
      dot: "bg-sky-500",
      textColor: "text-sky-700 dark:text-sky-400 font-medium",
    };
  }
  return {
    label: `${days} days left`,
    icon: CheckCircle2,
    dot: "bg-slate-400",
    textColor: "text-slate-700 dark:text-slate-300 font-medium",
  };
};

function RoomAvailabilityPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const isOwner = user?.role === "owner";
  const [searchTerm, setSearchTerm] = useState("");
  const requestedBranch = searchParams.get("branch");
  const [branchFilter, setBranchFilter] = useState(() =>
    normalizeBranchFilterValue({
      requestedBranch: isOwner ? requestedBranch : null,
      fallbackBranch: isOwner ? null : user?.branch,
      allValue: "all",
    }),
  );
  const [floorFilter, setFloorFilter] = useState(() => searchParams.get("floor") || "all");
  const [roomTypeFilter, setRoomTypeFilter] = useState(() => searchParams.get("type") || "all");
  const [roomStatusFilter, setRoomStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [deletingRoom, setDeletingRoom] = useState(null);
  const [historyRoomId, setHistoryRoomId] = useState(null);
  const [lightboxRoom, setLightboxRoom] = useState(null);
  const [showVacancyModal, setShowVacancyModal] = useState(false);
  const [vacancySearch, setVacancySearch] = useState("");
  const [vacancyUrgencyFilter, setVacancyUrgencyFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ROOMS_PER_PAGE = 12;

  // Use the Digital Twin snapshot as a read model so bed dots and occupancy stay reservation-aware.
  // Always fetch the full scope allowed for the user (defaultBranch) to avoid API-level occupancy calculation bugs,
  // and rely entirely on client-side filtering for the branch selection.
  const defaultBranch =
    user?.branch && user.role !== "owner" ? user.branch : "all";
  const {
    data: roomsData,
    isLoading: loading,
    refetch: refetchRooms,
    isFetching: isRefetchingRooms,
  } = useRooms(defaultBranch === "all" ? {} : { branch: defaultBranch });
  const rooms = Array.isArray(roomsData) ? roomsData : (roomsData?.items ?? []);

  // Compute upcoming vacancies list for the quick-view modal/space
  const upcomingVacancies = useMemo(() => {
    const list = [];
    rooms.forEach((room) => {
      (room.beds || []).forEach((bed, bedIdx) => {
        const hasDate = Boolean(bed.expectedVacancyDate);
        const hasDays = bed.daysRemaining !== null && bed.daysRemaining !== undefined;
        if (hasDate || hasDays) {
          const formattedBedLabel = getBedDisplayLabel(bed, bedIdx, room.type);
          list.push({
            roomId: room._id,
            roomName: room.name || `Room ${room.roomNumber}`,
            roomNumber: room.roomNumber,
            branch: room.branch,
            floor: room.floor,
            bedId: bed.id,
            bedCode: bed.code || bed.id,
            bedPosition: bed.position,
            bedObj: bed,
            bedLabel: formattedBedLabel,
            occupantName:
              bed.occupiedBy?.name ||
              (bed.occupiedBy?.firstName || bed.occupiedBy?.lastName
                ? `${bed.occupiedBy?.firstName || ""} ${bed.occupiedBy?.lastName || ""}`.trim()
                : "Current Occupant"),
            expectedVacancyDate: bed.expectedVacancyDate,
            daysRemaining: bed.daysRemaining,
            roomObj: room,
          });
        }
      });
    });

    return list.sort((a, b) => {
      if (a.daysRemaining != null && b.daysRemaining != null) {
        return a.daysRemaining - b.daysRemaining;
      }
      if (a.expectedVacancyDate && b.expectedVacancyDate) {
        return new Date(a.expectedVacancyDate) - new Date(b.expectedVacancyDate);
      }
      return 0;
    });
  }, [rooms]);

  const vacancyKPIs = useMemo(() => {
    let urgent = 0;
    let upcoming = 0;
    let longTerm = 0;
    upcomingVacancies.forEach((v) => {
      const d = v.daysRemaining;
      if (d != null) {
        if (d <= 30) urgent++;
        else if (d <= 90) upcoming++;
        else longTerm++;
      } else {
        longTerm++;
      }
    });
    return { urgent, upcoming, longTerm, total: upcomingVacancies.length };
  }, [upcomingVacancies]);

  const filteredUpcomingVacancies = useMemo(() => {
    return upcomingVacancies.filter((item) => {
      const term = vacancySearch.trim().toLowerCase();
      const matchesSearch =
        !term ||
        item.roomName.toLowerCase().includes(term) ||
        item.roomNumber.toLowerCase().includes(term) ||
        item.bedCode.toLowerCase().includes(term) ||
        (item.bedLabel && item.bedLabel.toLowerCase().includes(term)) ||
        item.occupantName.toLowerCase().includes(term);

      const days = item.daysRemaining;
      let matchesUrgency = true;
      if (vacancyUrgencyFilter === "urgent") {
        matchesUrgency = days != null ? days <= 30 : false;
      } else if (vacancyUrgencyFilter === "upcoming") {
        matchesUrgency = days != null ? days > 30 && days <= 90 : false;
      } else if (vacancyUrgencyFilter === "longterm") {
        matchesUrgency = days != null ? days > 90 : true;
      }

      return matchesSearch && matchesUrgency;
    });
  }, [upcomingVacancies, vacancySearch, vacancyUrgencyFilter]);

  const [vacancyPage, setVacancyPage] = useState(1);
  const VACANCIES_PER_PAGE = 10;

  useEffect(() => {
    setVacancyPage(1);
  }, [vacancySearch, vacancyUrgencyFilter]);

  // Escape key close listener and body scroll lock for vacancy modal
  useEffect(() => {
    if (!showVacancyModal) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setShowVacancyModal(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("modal-open");
    };
  }, [showVacancyModal]);

  const totalVacancyPages = Math.ceil(filteredUpcomingVacancies.length / VACANCIES_PER_PAGE) || 1;

  const paginatedUpcomingVacancies = useMemo(() => {
    const start = (vacancyPage - 1) * VACANCIES_PER_PAGE;
    return filteredUpcomingVacancies.slice(start, start + VACANCIES_PER_PAGE);
  }, [filteredUpcomingVacancies, vacancyPage]);

  // Processing
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch =
        room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        room.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBranch =
        branchFilter === "all" || room.branch === branchFilter;
      const matchesFloor =
        floorFilter === "all" || String(room.floor) === floorFilter;
      const matchesType =
        roomTypeFilter === "all" || room.type === roomTypeFilter;

      const matchesStatus =
        roomStatusFilter === "all" ||
        (roomStatusFilter === "vacant_soon"
          ? (room.beds || []).some(
              (b) =>
                (b.daysRemaining !== null && b.daysRemaining !== undefined && b.daysRemaining <= 30) ||
                (b.expectedVacancyDate &&
                  new Date(b.expectedVacancyDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
            )
          : (() => {
              const bedsInMaintenance = (room.beds || []).filter(
                (b) => b.status === "maintenance",
              ).length;
              if (roomStatusFilter === "maintenance") {
                return bedsInMaintenance > 0 || room.status === "maintenance";
              }

              const roomLevelMaintenance =
                bedsInMaintenance === room.capacity && room.capacity > 0;
              const effectiveCapacity = roomLevelMaintenance
                ? 0
                : Math.max(0, (room.capacity || 0) - bedsInMaintenance);

              const occupiedCount = getEffectiveOccupancy(room);
              let displayStatus = "available";
              if (roomLevelMaintenance || effectiveCapacity === 0) displayStatus = "maintenance";
              else if (
                occupiedCount >= effectiveCapacity &&
                effectiveCapacity > 0
              )
                displayStatus = "full";
              else if (occupiedCount > 0) displayStatus = "partial";
              return displayStatus === roomStatusFilter;
            })());

      return (
        matchesSearch &&
        matchesBranch &&
        matchesFloor &&
        matchesType &&
        matchesStatus
      );
    });
  }, [
    rooms,
    searchTerm,
    branchFilter,
    floorFilter,
    roomTypeFilter,
    roomStatusFilter,
  ]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    branchFilter,
    floorFilter,
    roomTypeFilter,
    roomStatusFilter,
  ]);

  useEffect(() => {
    const nextBranch = normalizeBranchFilterValue({
      requestedBranch: user?.role === "owner" ? requestedBranch : null,
      fallbackBranch: user?.role === "owner" ? null : user?.branch,
      allValue: "all",
    });

    setBranchFilter((current) =>
      current === nextBranch ? current : nextBranch,
    );
  }, [requestedBranch, user?.branch, user?.role]);

  useEffect(() => {
    if (!user?.role) return;

    const nextParams = syncBranchSearchParam(searchParams, branchFilter, {
      enabled: user?.role === "owner",
      allValue: "all",
    });

    if (nextParams.toString() === searchParams.toString()) return;
    setSearchParams(nextParams, { replace: true });
  }, [branchFilter, searchParams, setSearchParams, user?.role]);

  // Dynamically compute valid floor numbers for the currently selected branch
  const availableFloors = useMemo(() => {
    const branchRooms =
      branchFilter === "all"
        ? rooms
        : rooms.filter((r) => r.branch === branchFilter);
    const set = new Set();
    branchRooms.forEach((r) => {
      if (r.floor !== undefined && r.floor !== null && r.floor !== "") {
        set.add(String(r.floor));
      }
    });
    return Array.from(set).sort(
      (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0),
    );
  }, [rooms, branchFilter]);

  // Cascading sanity reset: if selected floor is not in availableFloors, reset to "all"
  useEffect(() => {
    if (floorFilter !== "all" && !availableFloors.includes(floorFilter)) {
      setFloorFilter("all");
    }
  }, [availableFloors, floorFilter]);

  // Sync status, floor, and room type filter states to URL search parameters
  useEffect(() => {
    const currentStatus = searchParams.get("status") || "all";
    const currentFloor = searchParams.get("floor") || "all";
    const currentType = searchParams.get("type") || "all";

    if (
      currentStatus === roomStatusFilter &&
      currentFloor === floorFilter &&
      currentType === roomTypeFilter
    ) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    if (roomStatusFilter !== "all") nextParams.set("status", roomStatusFilter);
    else nextParams.delete("status");

    if (floorFilter !== "all") nextParams.set("floor", floorFilter);
    else nextParams.delete("floor");

    if (roomTypeFilter !== "all") nextParams.set("type", roomTypeFilter);
    else nextParams.delete("type");

    setSearchParams(nextParams, { replace: true });
  }, [roomStatusFilter, floorFilter, roomTypeFilter, searchParams, setSearchParams]);

  // Stats — shared hook (bed-accurate)
  const stats = useRoomStats(rooms);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim() !== "") count++;
    if (isOwner && branchFilter !== "all") count++;
    if (floorFilter !== "all") count++;
    if (roomTypeFilter !== "all") count++;
    if (roomStatusFilter !== "all") count++;
    return count;
  }, [searchTerm, isOwner, branchFilter, floorFilter, roomTypeFilter, roomStatusFilter]);

  const handleResetFilters = () => {
    setSearchTerm("");
    if (isOwner) setBranchFilter("all");
    setFloorFilter("all");
    setRoomTypeFilter("all");
    setRoomStatusFilter("all");
  };

  // Handlers
  const handleConfigure = (room) => {
    setSelectedRoom({
      ...room,
      beds: (room.beds || []).map((bed) => ({
        ...bed,
        originalId: bed.originalId || bed.id,
      })),
    });
  };

  const handleSaveConfig = async (updatedRoom) => {
    try {
      // 1. Update core room properties (images, amenities, policies, isPopular, pricing, etc.)
      await roomApi.update(updatedRoom._id, {
        name: updatedRoom.name,
        roomNumber: updatedRoom.roomNumber,
        description: updatedRoom.description,
        floor: updatedRoom.floor,
        branch: updatedRoom.branch,
        type: updatedRoom.type,
        capacity: updatedRoom.capacity,
        price: updatedRoom.price,
        regularLongRate: updatedRoom.regularLongRate || updatedRoom.price,
        regularShortRate: updatedRoom.regularShortRate || updatedRoom.price,
        amenities: updatedRoom.amenities,
        policies: updatedRoom.policies,
        intendedTenant: updatedRoom.intendedTenant,
        images: updatedRoom.images,
        isPopular: updatedRoom.isPopular,
      });

      const originalRoom =
        rooms.find((room) => room._id === updatedRoom._id) || selectedRoom;
      const originalBeds = originalRoom?.beds || [];
      const updatedBeds = updatedRoom.beds || [];

      // Match updated beds to original beds with robust fallback precedence:
      // 1. By subdocument _id (immutable MongoDB ObjectId)
      // 2. By originalId (if bed.id was renamed)
      // 3. By bed.id (string code e.g. "bed-1")
      const findMatchedOriginalBed = (updatedBed) => {
        if (updatedBed._id) {
          const matchById = originalBeds.find(
            (orig) => String(orig._id) === String(updatedBed._id),
          );
          if (matchById) return matchById;
        }
        if (updatedBed.originalId) {
          const matchByOrigId = originalBeds.find(
            (orig) => orig.id === updatedBed.originalId,
          );
          if (matchByOrigId) return matchByOrigId;
        }
        return originalBeds.find((orig) => orig.id === updatedBed.id) || null;
      };

      const matchedPairs = [];
      const newBeds = [];

      for (const updatedBed of updatedBeds) {
        const matched = findMatchedOriginalBed(updatedBed);
        if (matched) {
          matchedPairs.push({ updatedBed, originalBed: matched });
        } else {
          newBeds.push(updatedBed);
        }
      }

      // Any original bed that was NOT matched by any updated bed is truly removed
      const matchedOriginalKeys = new Set(
        matchedPairs.map((p) => String(p.originalBed._id || p.originalBed.id)),
      );
      const removedBeds = originalBeds.filter(
        (orig) => !matchedOriginalKeys.has(String(orig._id || orig.id)),
      );

      // Step A: Add new beds first (so room never drops below required bed count)
      for (const bed of newBeds) {
        await roomApi.addBed(updatedRoom._id, {
          id: bed.id,
          position: bed.position,
        });
        if (bed.status === "maintenance") {
          await roomApi.updateBedStatus(updatedRoom._id, bed.id, bed.status);
        }
      }

      // Step B: Update existing beds (id, position, status)
      for (const { updatedBed, originalBed } of matchedPairs) {
        if (
          originalBed.id !== updatedBed.id ||
          originalBed.position !== updatedBed.position
        ) {
          await roomApi.updateBed(updatedRoom._id, originalBed.id, {
            id: updatedBed.id,
            position: updatedBed.position,
          });
        }

        const origStatus = originalBed.status || "available";
        const newStatus = updatedBed.status || "available";
        if (origStatus !== newStatus) {
          await roomApi.updateBedStatus(updatedRoom._id, updatedBed.id, newStatus);
        }
      }

      // Step C: Delete removed beds (safe to do after additions)
      for (const bed of removedBeds) {
        await roomApi.deleteBed(updatedRoom._id, bed.id);
      }

      // Step D: Reorder beds if beds exist
      if (updatedBeds.length > 0) {
        await roomApi.reorderBeds(
          updatedRoom._id,
          updatedBeds.map((bed) => bed.id),
        );
      }

      showNotification("Room bed configuration updated successfully.", "success", 3000);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setSelectedRoom(null);
    } catch (err) {
      console.error("[RoomAvailabilityPage] Update bed configuration failed:", err);
      showNotification("Unable to update room bed configuration. Please try again.", "error", 5000);
    }
  };

  // CRUD handlers
  const handleSaveRoom = async (payload, roomId) => {
    try {
      if (roomId) {
        await roomApi.update(roomId, payload);
        showNotification("Room details updated successfully.", "success", 3000);
      } else {
        await roomApi.create(payload);
        showNotification("Room created successfully.", "success", 3000);
      }
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setShowCreateModal(false);
      setEditingRoom(null);
    } catch (err) {
      console.error("[RoomAvailabilityPage] Save room failed:", err);
      const errorMessage = getFriendlyError(
        err,
        "Unable to save room details. Please check the entered information and try again.",
      );
      showNotification(errorMessage, "error", 5000);
      throw err;
    }
  };

  const handleDeleteRoom = async (roomId) => {
    try {
      await roomApi.delete(roomId);
      showNotification("Room archived successfully.", "success", 3000);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setDeletingRoom(null);
    } catch (err) {
      console.error("[RoomAvailabilityPage] Delete/archive room failed:", err);
      showNotification(
        "Unable to archive room. Please try again or check if the room has active occupants.",
        "error",
        5000
      );
    }
  };

  const handleTabChange = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next);
  };

  const handleExportCSV = useCallback(() => {
    if (!filteredRooms || filteredRooms.length === 0) {
      showNotification("No room inventory records match the current filter criteria.", "info", 3000);
      return;
    }
    handleExportRoomsCSV({
      rooms: filteredRooms,
      branchFilter: isOwner ? branchFilter : (user?.branch || "all"),
    });
  }, [filteredRooms, isOwner, branchFilter, user?.branch]);

  const handleExportPDF = useCallback(async () => {
    if (!filteredRooms || filteredRooms.length === 0) {
      showNotification("No room inventory records match the current filter criteria.", "info", 3000);
      return;
    }
    setIsExporting(true);
    try {
      await handleExportRoomsPDF({
        rooms: filteredRooms,
        stats,
        branchFilter: isOwner ? branchFilter : (user?.branch || "all"),
        floorFilter,
        roomTypeFilter,
        roomStatusFilter,
        searchTerm,
      });
    } catch (err) {
      console.error("[RoomManagement] PDF export failed:", err);
      showNotification("Unable to generate room inventory PDF report. Please try again.", "error", 5000);
    } finally {
      setIsExporting(false);
    }
  }, [
    filteredRooms,
    stats,
    isOwner,
    branchFilter,
    user?.branch,
    floorFilter,
    roomTypeFilter,
    roomStatusFilter,
    searchTerm,
  ]);

  const roomFilters = [
    ...(isOwner
      ? [
          {
            key: "branch",
            label: "Branch",
            options: [
              { value: "all", label: "All Branches" },
              ...OWNER_BRANCH_FILTER_OPTIONS.filter((o) => o.value !== "all"),
            ],
            value: branchFilter,
            onChange: setBranchFilter,
          },
        ]
      : []),
    {
      key: "floor",
      label: "Floor",
      options: [
        { value: "all", label: "All Floors" },
        ...availableFloors.map((fl) => ({
          value: fl,
          label: `Floor ${fl}`,
        })),
      ],
      value: floorFilter,
      onChange: setFloorFilter,
    },
    {
      key: "type",
      label: "Type",
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


  const roomStatusLegend = [
    { key: "available", label: "Available / Vacant", dot: "bg-emerald-500" },
    { key: "partial", label: "Partially Occupied", dot: "bg-amber-500" },
    { key: "full", label: "Full / Occupied Bed", dot: "bg-red-500" },
    { key: "reserved", label: "Reserved Bed", dot: "bg-amber-600" },
    { key: "maintenance", label: "Maintenance", dot: "bg-slate-500" },
  ];

  const getRoomStatusConfig = (status) => {
    switch (status) {
      case "available":
        return {
          dot: "bg-emerald-500",
          label: "Available",
          color: "text-emerald-600",
        };
      case "partial":
        return {
          dot: "bg-amber-500",
          label: "Partially Occupied",
          color: "text-warning-dark",
        };
      case "full":
        return { dot: "bg-red-500", label: "Full", color: "text-red-600" };
      case "maintenance":
        return {
          dot: "bg-slate-500",
          label: "Maintenance",
          color: "text-slate-600",
        };
      case "reserved":
        return {
          dot: "bg-blue-500",
          label: "Reserved",
          color: "text-blue-600",
        };
      default:
        return {
          dot: "bg-border",
          label: "Unknown",
          color: "text-muted-foreground",
        };
    }
  };

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRooms.length / ROOMS_PER_PAGE));
  }, [filteredRooms]);

  const paginatedRooms = useMemo(() => {
    const start = (currentPage - 1) * ROOMS_PER_PAGE;
    return filteredRooms.slice(start, start + ROOMS_PER_PAGE);
  }, [filteredRooms, currentPage]);

  const groupedByFloor = useMemo(() => {
    const acc = {};
    paginatedRooms.forEach((room) => {
      const key = `Floor ${room.floor}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(room);
    });
    return acc;
  }, [paginatedRooms]);

  if (loading && !roomsData) {
    return <AdminRoomAvailabilitySkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Pattern 1 Sticky Sub-Header */}
      <AdminPageHeader
        title="Room Management"
        subtitle="Track available capacity, assignments, and turnover across rooms without leaving operations."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowVacancyModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 bg-card hover:bg-muted transition-colors text-foreground border-border shadow-xs"
              title="Check upcoming vacancy schedule for rooms and beds"
            >
              <Calendar className="w-4 h-4 text-amber-500" />
              <span>Check Vacancy Schedule</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-transparent ${
                  vacancyKPIs.urgent > 0
                    ? "text-rose-700 dark:text-rose-400"
                    : vacancyKPIs.upcoming > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {upcomingVacancies.length}
              </span>
            </button>
            <ExportButtons
              onCsv={handleExportCSV}
              onPdf={handleExportPDF}
              loading={isExporting}
              disabled={filteredRooms.length === 0}
            />
          </div>
        }
      />

      {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-4">
            <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                  Total Rooms
                </span>
                <div className="flex shrink-0 items-center justify-center text-slate-500 dark:text-slate-400">
                  <LayoutGrid size={18} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground mt-2">
                {stats.total}
              </div>
            </div>

            <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                  Available
                </span>
                <div className="flex shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <DoorOpen size={18} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-2">
                {stats.available}
              </div>
            </div>

            <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                  Partial
                </span>
                <div className="flex shrink-0 items-center justify-center text-amber-600 dark:text-amber-400">
                  <Users size={18} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 mt-2">
                {stats.partial}
              </div>
            </div>

            <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                  Full
                </span>
                <div className="flex shrink-0 items-center justify-center text-rose-600 dark:text-rose-400">
                  <DoorClosed size={18} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 mt-2">
                {stats.full}
              </div>
            </div>

            <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                  Maintenance
                </span>
                <div className="flex shrink-0 items-center justify-center text-slate-500 dark:text-slate-400">
                  <Wrench size={18} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground mt-2">
                {stats.maintenance}
              </div>
            </div>

            <div className="group relative flex flex-col justify-between min-h-[108px] rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                  Total Beds
                </span>
                <div className="flex shrink-0 items-center justify-center text-sky-600 dark:text-sky-400">
                  <Bed size={18} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground mt-2">
                {rooms.reduce((sum, r) => sum + (r.capacity || 0), 0)}
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-5"
            style={{
              backgroundColor: "var(--card)",

              border: "1px solid var(--border)",
            }}
          >
            {/* Optimized Toolbar with Preset Chips, Search, & Active Filter Controls */}
            <div className="flex flex-col gap-4 mb-6">
              {/* Quick Preset Filter Chips Bar */}
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-border/60">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
                    Presets:
                  </span>
                  {[
                    { id: "all", label: "All Rooms", icon: LayoutGrid, count: rooms.length,
                      iconColor: "text-slate-600 dark:text-slate-400"
                    },
                    { id: "available", label: "Available", icon: CheckCircle2, count: stats.available,
                      iconColor: "text-emerald-600 dark:text-emerald-400"
                    },
                    { id: "partial", label: "Partial", icon: AlertTriangle, count: stats.partial,
                      iconColor: "text-amber-600 dark:text-amber-400"
                    },
                    { id: "full", label: "Full", icon: CircleDot, count: stats.full,
                      iconColor: "text-rose-600 dark:text-rose-400"
                    },
                    { id: "maintenance", label: "Maintenance", icon: Wrench, count: stats.maintenance,
                      iconColor: "text-slate-500 dark:text-slate-400"
                    },
                  ].map((preset) => {
                    const isActive = roomStatusFilter === preset.id;
                    const Icon = preset.icon;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setRoomStatusFilter(preset.id)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          isActive
                            ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100 shadow-xs"
                            : "bg-card text-foreground border-border hover:bg-muted/70 shadow-2xs"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white dark:text-slate-950" : preset.iconColor}`} />
                        <span>{preset.label}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive
                            ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-950"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {preset.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Refresh and Clear Filter Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ["rooms"] });
                      refetchRooms();
                    }}
                    disabled={isRefetchingRooms}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline cursor-pointer disabled:opacity-50"
                    title="Refresh live room inventory and occupancy"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefetchingRooms ? "animate-spin text-primary" : ""}`} />
                    <span>{isRefetchingRooms ? "Refreshing..." : "Refresh"}</span>
                  </button>

                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Clear Filters ({activeFilterCount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search Bar & Dropdown Select Controls */}
              <div className="flex flex-col lg:flex-row gap-3 items-end">
                {/* Enhanced Search Input with Micro-Label */}
                <div className="flex-1 flex flex-col gap-1 min-w-[240px]">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 px-0.5">
                    Search
                  </label>
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search by room number or type..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full h-9 pl-9 pr-10 bg-card rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/70"
                      style={{ border: "1px solid var(--border)" }}
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded"
                        title="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Dropdowns */}
                <div className="flex gap-2.5 flex-wrap items-end">
                  {roomFilters.map((filter) => {
                    const isActive = filter.value !== "all";
                    return (
                      <div key={filter.key} className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 px-0.5">
                          {filter.label}
                        </label>
                        <select
                          aria-label={`Filter rooms by ${filter.label}`}
                          value={filter.value}
                          onChange={(e) => filter.onChange(e.target.value)}
                          className={`h-9 px-3 rounded-lg text-xs font-medium cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-ring/20 ${
                            isActive
                              ? "bg-primary-50/60 dark:bg-primary-950/30 text-foreground font-semibold shadow-sm"
                              : "bg-card text-foreground hover:bg-accent/40"
                          }`}
                          style={{
                            border: isActive
                              ? "1px solid var(--primary)"
                              : "1px solid var(--border)",
                          }}
                        >
                          {filter.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}

                  {(can("manageRooms") || can("create", "rooms")) && (
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="h-9 px-4 text-primary-foreground rounded-lg font-semibold transition-colors flex items-center justify-center gap-1.5 text-xs bg-primary hover:opacity-90 ml-auto lg:ml-0 self-end shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Room
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Redesigned Multi-Category Status Legend Bar */}
            <div className="mb-5 rounded-xl p-3.5 border border-border bg-card shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                
                {/* Room Status Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold uppercase tracking-wider text-muted-foreground mr-1 text-[11px]">
                    Room Status:
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium px-2.5 py-0.5 rounded-full bg-transparent text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Available
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium px-2.5 py-0.5 rounded-full bg-transparent text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Partial
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium px-2.5 py-0.5 rounded-full bg-transparent text-rose-700 dark:text-rose-400 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Full
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium px-2.5 py-0.5 rounded-full bg-transparent text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Maintenance
                  </span>
                </div>

                {/* Bed Deck Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-2.5 lg:pt-0 border-t lg:border-t-0 lg:border-l border-border lg:pl-3.5">
                  <span className="font-bold uppercase tracking-wider text-muted-foreground mr-1 text-[11px]">
                    Bed Layout:
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Vacant
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded bg-rose-50/80 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Occupied
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Reserved
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Payment Pending
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Maint
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground ml-1">
                    <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    <span>Beds in Maint</span>
                  </span>
                </div>

              </div>
            </div>

            {/* Room List or Empty State */}
            {filteredRooms.length === 0 ? (
              <div className="p-12 text-center rounded-xl border border-dashed border-border bg-muted/20 my-6 flex flex-col items-center justify-center gap-3">
                <div className="p-3 rounded-full bg-muted/60 text-muted-foreground">
                  <FilterX className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-foreground">No matching rooms found</h4>
                <p className="text-sm text-muted-foreground max-w-sm">
                  We couldn't find any rooms matching your search term or active filter criteria.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground shadow-sm hover:opacity-90"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="space-y-8 mt-2">
                {Object.keys(groupedByFloor).length > 0 ? (
                  Object.entries(groupedByFloor).map(([floor, floorRooms]) => {
                    return (
                      <div key={floor} className="space-y-3">
                        {/* High-Contrast Emphasized Floor Section Header */}
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-card border border-border shadow-xs">
                          <div className="flex shrink-0 items-center justify-center text-slate-500 dark:text-slate-400">
                            <Layers className="w-5 h-5" />
                          </div>
                          <h3 className="text-sm font-bold text-foreground tracking-wide">
                            {floor}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted/60 text-muted-foreground border border-border/60">
                            {floorRooms.length} {floorRooms.length === 1 ? "room" : "rooms"}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-stretch">
                          {floorRooms.map((room) => (
                            <DoubleDeckRoomCard
                              key={room._id || room.id}
                              room={room}
                              onConfigure={handleConfigure}
                              onViewHistory={(id) => setHistoryRoomId(id)}
                              onViewPhotos={(roomToView) => setLightboxRoom(roomToView)}
                              canManageRooms={can("manageRooms")}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : null}
              </div>
            )}

            {/* Bottom Summary & Fast Page Controls Footer */}
            {filteredRooms.length > 0 && (
              <div className="flex items-center justify-between flex-wrap gap-3 pt-4 mt-6 px-1 border-t border-border/60 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>
                    Showing <strong className="text-foreground">
                      {Math.min((currentPage - 1) * ROOMS_PER_PAGE + 1, filteredRooms.length)}–
                      {Math.min(currentPage * ROOMS_PER_PAGE, filteredRooms.length)}
                    </strong> of <strong className="text-foreground">{filteredRooms.length}</strong> rooms
                    {filteredRooms.length !== rooms.length && ` (filtered from ${rooms.length})`}
                  </span>
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400 bg-transparent px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px]">
                      {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
                    </span>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-3 ml-auto">
                    <span className="text-muted-foreground font-medium hidden sm:inline">
                      Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-foreground bg-card hover:bg-muted transition-colors border border-border shadow-xs cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Previous
                      </button>

                      <div className="hidden md:flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                          .map((p, i, arr) => {
                            const prev = arr[i - 1];
                            const showEllipsis = prev && p - prev > 1;
                            return (
                              <React.Fragment key={p}>
                                {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                                <button
                                  onClick={() => setCurrentPage(p)}
                                  className={`w-7 h-7 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                    currentPage === p
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "bg-card text-foreground hover:bg-muted border border-border"
                                  }`}
                                >
                                  {p}
                                </button>
                              </React.Fragment>
                            );
                          })}
                      </div>

                      <button
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-foreground bg-card hover:bg-muted transition-colors border border-border shadow-xs cursor-pointer"
                      >
                        Next
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
      {/* Modals */}
      {selectedRoom && (
        <RoomConfigModal
          room={selectedRoom}
          onClose={() => setSelectedRoom(null)}
          onSave={handleSaveConfig}
          onEdit={(room) => {
            setSelectedRoom(null);
            setEditingRoom(room);
          }}
          onDelete={(room) => {
            setSelectedRoom(null);
            setDeletingRoom(room);
          }}
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

      {lightboxRoom && (
        <RoomImageLightboxModal
          images={
            Array.isArray(lightboxRoom.images) && lightboxRoom.images.filter(Boolean).length > 0
              ? lightboxRoom.images.filter(Boolean)
              : (lightboxRoom.image ? [lightboxRoom.image] : [])
          }
          roomNumber={lightboxRoom.roomNumber || lightboxRoom.name}
          roomType={lightboxRoom.type}
          onClose={() => setLightboxRoom(null)}
        />
      )}

      {/* Upcoming Vacancies Modal */}
      {showVacancyModal && typeof document !== "undefined" && createPortal(
        <div className="admin-modal-overlay" onClick={() => setShowVacancyModal(false)} role="dialog" aria-modal="true">
          <div
            className="admin-modal-content vacancy-modal-wide p-6 space-y-4 rounded-2xl shadow-xl border border-border bg-card max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <h2 className="text-lg font-bold text-foreground tracking-tight">
                    Upcoming Vacancies & Move-Out Schedule
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Overview of active tenant contracts, notice periods, and bed vacancy timeline forecasts.
                  </p>
                </div>
              </div>
              <button
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setShowVacancyModal(false)}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Executive KPI Metric Cards (Fixed Top Section) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
              {[
                {
                  id: "urgent",
                  label: "Urgent (≤30 Days)",
                  icon: AlertTriangle,
                  count: vacancyKPIs.urgent,
                  subtext: "Immediate turnovers",
                  tone: "text-rose-600 dark:text-rose-400",
                },
                {
                  id: "upcoming",
                  label: "31 – 90 Days",
                  icon: Calendar,
                  count: vacancyKPIs.upcoming,
                  subtext: "Next quarter move-outs",
                  tone: "text-amber-600 dark:text-amber-400",
                },
                {
                  id: "longterm",
                  label: "90+ Days",
                  icon: CheckCircle2,
                  count: vacancyKPIs.longTerm,
                  subtext: "Distant contract ends",
                  tone: "text-emerald-600 dark:text-emerald-400",
                },
                {
                  id: "all",
                  label: "Total Move-Outs",
                  icon: Bed,
                  count: vacancyKPIs.total,
                  subtext: "Active scheduled list",
                  tone: "text-sky-600 dark:text-sky-400",
                },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div
                    key={kpi.id}
                    className="p-3 rounded-xl border border-border bg-card text-foreground transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5 cursor-default"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className={kpi.tone}>{kpi.label}</span>
                      <Icon className={`w-4 h-4 shrink-0 ${kpi.tone}`} />
                    </div>
                    <div className="text-2xl font-bold mt-1 text-foreground tracking-tight">
                      {kpi.count}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                      {kpi.subtext}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Search & Filter Controls Bar (Fixed Top Section - Never Moves on Tab Switch) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search room, bed code, or occupant name..."
                  value={vacancySearch}
                  onChange={(e) => setVacancySearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
                {vacancySearch && (
                  <button
                    type="button"
                    onClick={() => setVacancySearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border text-xs">
                {[
                  {
                    id: "all",
                    label: "All",
                    count: upcomingVacancies.length,
                    icon: LayoutGrid,
                    iconColor: "text-slate-500 dark:text-slate-400",
                  },
                  {
                    id: "urgent",
                    label: "Urgent",
                    count: vacancyKPIs.urgent,
                    icon: AlertTriangle,
                    iconColor: "text-rose-600 dark:text-rose-400",
                    isUrgent: true,
                  },
                  {
                    id: "upcoming",
                    label: "31–90 Days",
                    count: vacancyKPIs.upcoming,
                    icon: Calendar,
                    iconColor: "text-amber-600 dark:text-amber-400",
                  },
                  {
                    id: "longterm",
                    label: "90+ Days",
                    count: vacancyKPIs.longTerm,
                    icon: CheckCircle2,
                    iconColor: "text-sky-600 dark:text-sky-400",
                  },
                ].map((tab) => {
                  const isActive = vacancyUrgencyFilter === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setVacancyUrgencyFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg transition-all text-[11px] font-semibold cursor-pointer flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 ${
                        isActive
                          ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-950 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                      }`}
                    >
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? "text-white dark:text-slate-950" : tab.iconColor
                        }`}
                      />
                      <span>{tab.label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive
                            ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-950"
                            : tab.isUrgent && tab.count > 0
                            ? "bg-rose-500 text-white"
                            : "bg-muted text-muted-foreground border border-border/50"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Data Table Container with Stable Gutter to Prevent Shift */}
            <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable] border border-border rounded-xl shadow-xs bg-card">
              {filteredUpcomingVacancies.length === 0 ? (
                <div className="h-full min-h-[220px] flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  {upcomingVacancies.length === 0
                    ? "No upcoming vacancies scheduled at this time."
                    : "No move-out records match your current search/filter."}
                </div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="sticky top-0 z-10 border-b border-border bg-slate-100 dark:bg-slate-800 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider shadow-xs">
                    <tr>
                      <th className="p-3.5 pl-4 bg-slate-100 dark:bg-slate-800">Room & Bed</th>
                      <th className="p-3.5 bg-slate-100 dark:bg-slate-800">Occupant</th>
                      <th className="p-3.5 bg-slate-100 dark:bg-slate-800">Expected Vacancy Date</th>
                      <th className="p-3.5 bg-slate-100 dark:bg-slate-800">Timeline Status</th>
                      <th className="p-3.5 pr-4 text-right bg-slate-100 dark:bg-slate-800">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {paginatedUpcomingVacancies.map((item, idx) => {
                      const dateStr = item.expectedVacancyDate
                        ? new Date(item.expectedVacancyDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Scheduled";

                      const days = item.daysRemaining;
                      const timelineBadge = getTimelineStatusBadgeMeta(days);
                      const TimelineIcon = timelineBadge.icon;

                      return (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3.5 pl-4 font-medium text-foreground">
                            <span className="font-bold text-sm text-foreground block">
                              {item.roomName}
                            </span>
                            <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] text-muted-foreground font-mono bg-muted/60 rounded border border-border/50">
                              {item.bedLabel || getBedDisplayLabel(item.bedObj)}
                            </span>
                          </td>
                          <td className="p-3.5 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold">
                                {item.occupantName.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-foreground font-medium">
                                {item.occupantName}
                              </span>
                            </div>
                          </td>
                          <td className="p-3.5 font-semibold text-foreground">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              <span>{dateStr}</span>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border border-slate-200 dark:border-slate-700 bg-transparent ${timelineBadge.textColor}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${timelineBadge.dot}`} />
                              <TimelineIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>{timelineBadge.label}</span>
                            </span>
                          </td>
                          <td className="p-3.5 pr-4 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-900 hover:text-white dark:hover:bg-slate-700 dark:hover:text-white transition-all cursor-pointer shadow-xs ms-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              onClick={() => {
                                setShowVacancyModal(false);
                                handleConfigure(item.roomObj);
                              }}
                            >
                              Manage Room
                              <ChevronRight className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Bar (Fixed Bottom Section) */}
            {filteredUpcomingVacancies.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-muted-foreground border-t border-border shrink-0">
                <div>
                  Showing{" "}
                  <span className="font-semibold text-foreground">
                    {(vacancyPage - 1) * VACANCIES_PER_PAGE + 1}
                  </span>{" "}
                  to{" "}
                  <span className="font-semibold text-foreground">
                    {Math.min(vacancyPage * VACANCIES_PER_PAGE, filteredUpcomingVacancies.length)}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-foreground">
                    {filteredUpcomingVacancies.length}
                  </span>{" "}
                  vacancies
                </div>

                {totalVacancyPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVacancyPage((prev) => Math.max(1, prev - 1))}
                      disabled={vacancyPage === 1}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-foreground bg-card hover:bg-muted transition-colors border border-border shadow-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Previous
                    </button>
                    <span className="px-2 py-1 text-xs font-medium text-foreground">
                      Page {vacancyPage} of {totalVacancyPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setVacancyPage((prev) => Math.min(totalVacancyPages, prev + 1))}
                      disabled={vacancyPage === totalVacancyPages}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-foreground bg-card hover:bg-muted transition-colors border border-border shadow-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Room Bed History Drawer */}
      {historyRoomId && (
        <RoomBedHistoryDrawer
          roomId={historyRoomId}
          onClose={() => setHistoryRoomId(null)}
        />
      )}
    </div>
  );
}

export default RoomAvailabilityPage;
