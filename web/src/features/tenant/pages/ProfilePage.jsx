import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import GlobalLoading from "../../../shared/components/GlobalLoading";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import {
  authApi,
  userApi,
  reservationApi,
} from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import {
  getReservationProgress,
  getNextAction,
  DEFAULT_STEPS,
} from "../utils/reservationProgress";

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
} from "../components/profile";

// ─────────────────────────────────────────────────────────────
// ProfilePage — thin orchestrator
// 4,256 lines → ~350 lines (state, data-loading, tab routing)
// ─────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const { user: authUser, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── UI state ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [receiptModal, setReceiptModal] = useState({ open: false, step: null });

  // ── Data state ─────────────────────────────────────────────
  const [activeReservation, setActiveReservation] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [visits, setVisits] = useState([]);
  const [selectedReservationId, setSelectedReservationId] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [stayData, setStayData] = useState({
    currentStays: [],
    pastStays: [],
    stats: {
      totalStays: 0,
      completedStays: 0,
      totalNights: 0,
      memberSince: null,
    },
  });

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

  // ── Data loading ───────────────────────────────────────────
  useEffect(() => {
    const loadProfileData = async () => {
      try {
        setLoading(true);
        const profile = await authApi.getCurrentUser();
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
        await loadReservationsAndVisits();
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Failed to load profile data");
      } finally {
        setLoading(false);
      }
    };
    loadProfileData();
  }, [location.state?.refresh]);

  const loadReservationsAndVisits = async () => {
    try {
      const reservationsData = await reservationApi.getAll();
      setReservations(reservationsData || []);

      const activeOnes =
        reservationsData?.filter((r) => {
          const status = r.reservationStatus || r.status;
          return status !== "completed" && status !== "cancelled";
        }) || [];

      const active = activeOnes[0] || null;
      setActiveReservation(active);
      if (active && !selectedReservationId)
        setSelectedReservationId(active._id);

      // Extract visits
      const allVisits =
        reservationsData
          ?.filter((r) => r.visitDate)
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
          })) || [];
      setVisits(allVisits);

      // Build activity log
      const activities = [];
      reservationsData?.forEach((r) => {
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
      setActivityLog(activities);
    } catch (err) {
      console.error("Error loading reservations:", err);
    }
  };

  // Load stay data when Stay History tab is active
  useEffect(() => {
    if (activeTab === "stays") {
      (async () => {
        try {
          const data = await userApi.getMyStays();
          setStayData(data);
        } catch (err) {
          console.error("Error loading stay data:", err);
        }
      })();
    }
  }, [activeTab]);

  // ── Profile editing handlers ───────────────────────────────
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
  const progressTotalSteps = 6;
  const progressStepNumber = selectedReservation
    ? reservationProgress.currentStepIndex + 1
    : 0;
  const progressPercent = selectedReservation
    ? Math.min(
        100,
        Math.round((progressStepNumber / progressTotalSteps) * 100),
      )
    : 0;
  const currentStepLabel = selectedReservation
    ? reservationProgress.steps?.[reservationProgress.currentStepIndex]?.title
    : null;
  const roomImageUrl = selectedReservation?.roomId?.images?.[0] || null;
  const roomMonthlyPrice =
    selectedReservation?.roomId?.price ||
    selectedReservation?.roomId?.monthlyPrice ||
    selectedReservation?.totalPrice ||
    0;

  // ── Tab title map ──────────────────────────────────────────
  const TAB_TITLES = {
    dashboard: "Dashboard",
    personal: "Personal Details",
    room: "Room & Payment",
    history: "Activity Log",
    notifications: "Notifications",
    settings: "Settings",
  };

  if (loading) return <GlobalLoading />;

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen flex" style={{ backgroundColor: "#F7F8FA" }}>
        <ProfileSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
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
    </>
  );
};

export default ProfilePage;