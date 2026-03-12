import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import ProfilePageSkeleton from "../components/profile/ProfilePageSkeleton";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { authApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import { useQueryClient } from "@tanstack/react-query";
import {
  getReservationProgress,
  getNextAction,
  DEFAULT_STEPS,
} from "../utils/reservationProgress";
import { useCurrentUser } from "../../../shared/hooks/queries/useUsers";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import { useMyStays } from "../../../shared/hooks/queries/useUsers";

// Sub-components
import {
  ProfileSidebar,
  ReceiptModal,
  DashboardTab,
  PersonalDetailsTab,
  RoomPaymentTab,
  ActivityHistoryTab,
  NotificationsTab,
  SettingsTab,
  ProfileCompletionCard,
} from "../components/profile";

// ─────────────────────────────────────────────────────────────
// ProfilePage — thin orchestrator
// ─────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const { user: authUser, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── UI state ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [receiptModal, setReceiptModal] = useState({ open: false, step: null });
  const [selectedReservationId, setSelectedReservationId] = useState(null);

  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    phone: "",
    profileImage: "",
    branch: "",
    role: "",
    tenantStatus: "",
    createdAt: "",
    address: "",
    city: "",
    dateOfBirth: "",
    emergencyContact: "",
    emergencyPhone: "",
    studentId: "",
    school: "",
    yearLevel: "",
  });

  const [editData, setEditData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    profileImage: "",
    address: "",
    city: "",
    dateOfBirth: "",
    emergencyContact: "",
    emergencyPhone: "",
    studentId: "",
    school: "",
    yearLevel: "",
  });

  // ── TanStack Query data fetching ──────────────────────────
  const { data: profile, isLoading: profileLoading } = useCurrentUser();
  const { data: reservationsData, isLoading: reservationsLoading } = useReservations();
  const { data: stayData } = useMyStays(activeTab === "stays");

  // Only show full-screen loader on FIRST load (no cached data yet).
  // Refetches happen silently in background — no stutter/flash.
  const loading = (!profile && profileLoading) || (!reservationsData && reservationsLoading);

  // Sync profile data when query resolves
  useEffect(() => {
    if (!profile) return;
    setProfileData(profile);
    setEditData({
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      phone: profile.phone || "",
      profileImage: profile.profileImage || "",
      address: profile.address || "",
      city: profile.city || "",
      dateOfBirth: profile.dateOfBirth || "",
      emergencyContact: profile.emergencyContact || "",
      emergencyPhone: profile.emergencyPhone || "",
      studentId: profile.studentId || "",
      school: profile.school || "",
      yearLevel: profile.yearLevel || "",
    });
  }, [profile]);

  // ── Derive reservations, visits, activity from cached data ─
  const reservations = useMemo(() => reservationsData || [], [reservationsData]);

  const activeReservation = useMemo(() => {
    const activeOnes =
      reservations.filter((r) => {
        const status = r.reservationStatus || r.status;
        return status !== "completed" && status !== "cancelled";
      }) || [];
    return activeOnes[0] || null;
  }, [reservations]);

  // Set initial selected reservation
  useEffect(() => {
    if (activeReservation && !selectedReservationId) {
      setSelectedReservationId(activeReservation._id);
    }
  }, [activeReservation, selectedReservationId]);

  const visits = useMemo(
    () =>
      reservations
        .filter((r) => r.visitDate)
        .map((r) => ({
          id: r._id,
          roomNumber: r.roomId?.name || "N/A",
          location: r.roomId?.branch || "N/A",
          floor: r.roomId?.floor || 1,
          date: r.visitDate,
          time: r.visitTime || "TBD",
          status: r.visitCompleted
            ? "Completed"
            : new Date(r.visitDate) < new Date()
              ? "Missed"
              : "Scheduled",
          specialInstructions:
            "Please bring valid ID. Meet at the reception area.",
        })),
    [reservations],
  );

  const activityLog = useMemo(() => {
    const activities = [];
    reservations.forEach((r) => {
      if (r.createdAt)
        activities.push({
          id: `res-${r._id}`,
          type: "reservation",
          title: "Room Reservation Submitted",
          description: `Submitted reservation request for Room ${r.roomId?.name || "N/A"}`,
          date: r.createdAt,
          status: "Pending",
        });
      if (r.visitDate)
        activities.push({
          id: `visit-${r._id}`,
          type: "visit",
          title: r.visitCompleted ? "Visit Completed" : "Visit Scheduled",
          description: `${r.visitCompleted ? "Completed" : "Scheduled"} visit to Room ${r.roomId?.name || "N/A"}`,
          date: r.visitDate,
          status: r.visitCompleted ? "Completed" : "Scheduled",
        });
      if (r.paymentDate)
        activities.push({
          id: `payment-${r._id}`,
          type: "payment",
          title: "Deposit Payment Completed",
          description: `Successfully paid security deposit for Room ${r.roomId?.name || "N/A"}`,
          date: r.paymentDate,
          status: "Completed",
        });
      if (r.approvedDate)
        activities.push({
          id: `approval-${r._id}`,
          type: "approval",
          title: "Reservation Approved",
          description: `Your reservation for Room ${r.roomId?.name || "N/A"} has been approved by admin`,
          date: r.approvedDate,
          status: "Approved",
        });
    });
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    return activities;
  }, [reservations]);

  // ── Profile editing handlers ───────────────────────────────
  const queryClient = useQueryClient();

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updatedUser = await authApi.updateProfile(editData);
      setProfileData((prev) => ({ ...prev, ...updatedUser.user }));
      setSuccess("Profile updated successfully!");
      setIsEditingProfile(false);
      if (updateUser) updateUser(updatedUser.user);
      // Invalidate cache so sidebar/header reflect new data immediately
      queryClient.invalidateQueries({ queryKey: ["users", "currentUser"] });
    } catch (err) {
      console.error("Error updating profile:", err);
      setError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditData({
      firstName: profileData.firstName || "",
      lastName: profileData.lastName || "",
      phone: profileData.phone || "",
      profileImage: profileData.profileImage || "",
      address: profileData.address || "",
      city: profileData.city || "",
      dateOfBirth: profileData.dateOfBirth || "",
      emergencyContact: profileData.emergencyContact || "",
      emergencyPhone: profileData.emergencyPhone || "",
      studentId: profileData.studentId || "",
      school: profileData.school || "",
      yearLevel: profileData.yearLevel || "",
    });
    setIsEditingProfile(false);
  };

  // ── Logout handlers ────────────────────────────────────────
  const handleLogout = (event) => {
    event.preventDefault();
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      await logout();
      navigate("/signin");
    } catch (err) {
      console.error("Logout failed:", err);
      showNotification("Logout failed. Please try again.", "error", 3000);
    }
  };

  // ── Unsaved changes warning ────────────────────────────────
  const hasUnsavedChanges = isEditingProfile && (
    editData.firstName !== (profileData.firstName || "") ||
    editData.lastName !== (profileData.lastName || "") ||
    editData.phone !== (profileData.phone || "") ||
    editData.address !== (profileData.address || "") ||
    editData.city !== (profileData.city || "") ||
    editData.dateOfBirth !== (profileData.dateOfBirth || "") ||
    editData.emergencyContact !== (profileData.emergencyContact || "") ||
    editData.emergencyPhone !== (profileData.emergencyPhone || "") ||
    editData.studentId !== (profileData.studentId || "") ||
    editData.school !== (profileData.school || "") ||
    editData.yearLevel !== (profileData.yearLevel || "")
  );

  const handleTabChange = (newTab) => {
    if (hasUnsavedChanges) {
      setPendingTab(newTab);
      setShowUnsavedWarning(true);
    } else {
      setActiveTab(newTab);
      setIsEditingProfile(false);
    }
  };

  const confirmDiscardChanges = () => {
    setShowUnsavedWarning(false);
    handleCancelEdit();
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };

  // ── Derived values ─────────────────────────────────────────
  const activeReservations = reservations.filter((r) => {
    const status = r.reservationStatus || r.status;
    return status !== "completed" && status !== "cancelled";
  });

  const selectedReservation = selectedReservationId
    ? activeReservations.find((r) => r._id === selectedReservationId) ||
      activeReservations[0]
    : activeReservations[0];

  const reservationProgress = getReservationProgress(selectedReservation);
  const nextAction = getNextAction(activeReservation, reservationProgress);

  const isReservationConfirmed =
    selectedReservation &&
    (selectedReservation.reservationStatus === "confirmed" ||
      selectedReservation.status === "confirmed" ||
      selectedReservation.paymentStatus === "paid");

  // Prevent browser back button when reservation is confirmed
  useEffect(() => {
    if (!isReservationConfirmed) return;
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      showNotification(
        "Your reservation is confirmed. You cannot go back to edit previous steps.",
        "info",
        3000,
      );
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isReservationConfirmed]);

  const fullName =
    `${profileData.firstName || ""} ${profileData.lastName || ""}`.trim() ||
    "User";
  const activeStatusLabel =
    activeReservation?.reservationStatus ||
    activeReservation?.status ||
    "pending";
  const selectedRoom = selectedReservation?.roomId
    ? {
        roomNumber: selectedReservation.roomId.name,
        location: selectedReservation.roomId.branch,
        floor: selectedReservation.roomId.floor,
        roomType: selectedReservation.roomId.type,
        price: selectedReservation.roomId.price,
      }
    : null;

  // ── Tab title map ──────────────────────────────────────────
  const TAB_TITLES = {
    dashboard: "Dashboard",
    personal: "Personal Details",
    room: "Room & Payment",
    history: "Activity Log",
    notifications: "Notifications",
    settings: "Settings",
  };

  if (loading) return <ProfilePageSkeleton />;

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen flex" style={{ backgroundColor: "#F7F8FA" }}>
        <ProfileSidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          profileData={profileData}
          fullName={fullName}
          hasActiveReservation={Boolean(activeReservation)}
          onLogout={handleLogout}
        />

        <div className="flex-1 flex flex-col">
          {/* Top Header */}
          <header
            className="bg-white border-b flex items-center justify-between px-8"
            style={{
              borderColor: "#E8EBF0",
              height: "60px",
              minHeight: "60px",
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-sm font-medium"
                style={{ color: "#1F2937" }}
              >
                {TAB_TITLES[activeTab] || "Profile"}
              </span>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <div className="p-8">
              {activeTab === "dashboard" && (
                <DashboardTab
                  profileData={profileData}
                  activeReservation={activeReservation}
                  selectedReservation={selectedReservation}
                  visits={visits}
                  nextAction={nextAction}
                  onGoToPersonal={() => setActiveTab("personal")}
                />
              )}

              {activeTab === "personal" && (
                <PersonalDetailsTab
                  profileData={profileData}
                  editData={editData}
                  setEditData={setEditData}
                  fullName={fullName}
                  isEditingProfile={isEditingProfile}
                  setIsEditingProfile={setIsEditingProfile}
                  saving={saving}
                  onSave={handleSaveProfile}
                  onCancel={handleCancelEdit}
                />
              )}

              {activeTab === "room" && (
                <RoomPaymentTab
                  selectedRoom={selectedRoom}
                  activeReservation={activeReservation}
                  activeStatusLabel={activeStatusLabel}
                />
              )}

              {activeTab === "history" && (
                <ActivityHistoryTab activityLog={activityLog} />
              )}
            </div>
          </main>

          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "settings" && <SettingsTab />}
        </div>

        <ReceiptModal
          isOpen={receiptModal.open}
          step={receiptModal.step}
          reservation={activeReservation}
          onClose={() => setReceiptModal({ open: false, step: null })}
        />
      </div>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        variant="warning"
        confirmText="Sign Out"
        cancelText="Cancel"
      />

      <ConfirmModal
        isOpen={showUnsavedWarning}
        onClose={() => { setShowUnsavedWarning(false); setPendingTab(null); }}
        onConfirm={confirmDiscardChanges}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave this tab? Your changes will be lost."
        variant="warning"
        confirmText="Discard Changes"
        cancelText="Keep Editing"
      />
    </>
  );
};

export default ProfilePage;
