import React, { useState, useEffect, useMemo } from "react";
import "../../../shared/styles/notification.css";
import "../styles/profile-page.css";
import "../styles/profile-dark-overrides.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import ProfilePageSkeleton from "../components/profile/ProfilePageSkeleton";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { authFetch } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import { useQueryClient } from "@tanstack/react-query";
import {
  getReservationProgress,
  getNextAction,
  DEFAULT_STEPS,
} from "../utils/reservationProgress";
import { useCurrentUser } from "../../../shared/hooks/queries/useUsers";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import { billingApi } from "../../../shared/api/billingApi";
import { ThemeProvider } from "../../../features/public/context/ThemeContext";

// Sub-components
import {
  ProfileSidebar,
  ReceiptModal,
  DashboardTab,
  BillingTab,
  PersonalDetailsTab,
  ActivityHistoryTab,
  NotificationsTab,
  SettingsTab,
  ProfileCompletionCard,
  ContractTab,
  ReservationAgreementPage,
} from "../components/profile";

// ─────────────────────────────────────────────────────────────
// ProfilePage — thin orchestrator
// ─────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const { user: authUser, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── UI state ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(
    location.state?.tab || "dashboard"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [receiptModal, setReceiptModal] = useState({ open: false, step: null });
  const [selectedReservationId, setSelectedReservationId] = useState(null);

  // Mobile detection for layout
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    phone: "",
    profileImage: "",
    branch: "",
    role: "",
    tenantStatus: "none",
    createdAt: "",
    address: "",
    city: "",
    dateOfBirth: "",
    emergencyContact: "",
    emergencyPhone: "",

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

  });

  // ── TanStack Query data fetching ──────────────────────────
  const { data: profile, isLoading: profileLoading } = useCurrentUser();
  const { data: reservationsData, isLoading: reservationsLoading } = useReservations();

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

    });
  }, [profile]);

  // ── Payment redirect handler (success OR cancelled) ────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentStatus = params.get("payment");
    const rawSessionId = params.get("session_id");

    if (!paymentStatus) return;

    // INSTANT: If reservation already paid, skip everything — prevents blue flash
    const alreadyPaid = (Array.isArray(reservationsData) ? reservationsData : [])
      .find(r => r.status !== "cancelled" && (r.paymentStatus === "paid" || r.status === "reserved"));
    if (alreadyPaid) {
      navigate(location.pathname, { replace: true });
      navigate("/applicant/reservation", {
        state: { step: 5, continueFlow: true, reservationId: alreadyPaid._id },
        replace: true,
      });
      return;
    }

    // PayMongo back button doesn't replace {id} placeholder — detect it
    const urlSessionId = rawSessionId && rawSessionId !== "{id}" ? rawSessionId : null;

    // If we need the fallback (no valid URL session ID), wait for reservationsData
    if (!urlSessionId && !reservationsData) return;

    // Clean URL only AFTER we have what we need
    navigate(location.pathname, { replace: true });

    const verifyPayment = async () => {
      // 1. Try URL session ID first (works on proper success redirect)
      // 2. Fall back to active reservation's stored paymongoSessionId
      let sessionId = urlSessionId;

      const active = (Array.isArray(reservationsData) ? reservationsData : [])
        .find(r => r.paymongoSessionId && r.status !== "cancelled");

      if (!sessionId && active?.paymongoSessionId) {
        sessionId = active.paymongoSessionId;
      }

      if (sessionId) {
        try {
          const result = await billingApi.checkPaymentStatus(sessionId);
          if (result?.status === "paid") {
            showNotification("Payment successful! Your reservation is confirmed.", "success", 5000);
            queryClient.invalidateQueries({ queryKey: ["reservations"] });
            // Navigate to confirmation step so user sees reservation code + receipt
            // Use replace:true to prevent back-button loops through PayMongo URLs
            navigate("/applicant/reservation", {
              state: { step: 5, continueFlow: true, reservationId: active?._id },
              replace: true,
            });
            return;
          }
        } catch (err) {
          console.error("Payment verification failed:", err);
        }
      }

      // Could not verify — check if reservation is already paid before showing cancelled
      queryClient.invalidateQueries({ queryKey: ["reservations"] });

      // If the reservation is already paid/reserved, skip cancelled flash and go to confirmation
      if (active && (active.paymentStatus === "paid" || active.status === "reserved")) {
        navigate("/applicant/reservation", {
          state: { step: 5, continueFlow: true, reservationId: active._id },
          replace: true,
        });
        return;
      }

      if (paymentStatus === "cancelled") {
        showNotification("Payment was cancelled. You can try again from your profile.", "warning", 5000);
      } else {
        showNotification("Payment is being processed. Please wait a moment.", "info", 5000);
      }
    };
    verifyPayment();
  }, [location.search, reservationsData]);

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


  // ── Profile editing handlers ───────────────────────────────
  const queryClient = useQueryClient();

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const imageChanged = editData.profileImage && editData.profileImage !== profileData.profileImage;
    try {
      const updatedUser = await authFetch("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(editData),
      });
      setProfileData((prev) => ({ ...prev, ...updatedUser.user }));
      setSuccess("Profile updated successfully!");
      setIsEditingProfile(false);
      if (updateUser) updateUser(updatedUser.user);
      // Invalidate cache so sidebar/header reflect new data immediately
      queryClient.invalidateQueries({ queryKey: ["users", "currentUser"] });
      if (imageChanged) {
        showNotification("Profile photo updated successfully!", "success", 3000);
      } else {
        showNotification("Profile updated successfully!", "success", 3000);
      }
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("Failed to update profile. Please try again.");
      showNotification("Failed to update profile. Please try again.", "error", 4000);
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
      showNotification("You have been signed out successfully.", "success", 3000);
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
    editData.emergencyPhone !== (profileData.emergencyPhone || "")
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
    (selectedReservation.reservationStatus === "reserved" ||
      selectedReservation.status === "reserved" ||
      selectedReservation.paymentStatus === "paid");

  // My Reservation page only shows confirmed (paid/reserved) reservations.
  // Pending stages show the empty state instead.
  const confirmedReservation = isReservationConfirmed
    ? (selectedReservation || activeReservation)
    : null;

  // Prevent browser back button when reservation is reserved
  useEffect(() => {
    if (!isReservationConfirmed) return;
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      showNotification(
        "Your reservation is secured. You cannot go back to edit previous steps.",
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

  if (loading) return <ProfilePageSkeleton />;

  // ── Render ─────────────────────────────────────────────────
  return (
    <ThemeProvider>
    <>
      <div className="min-h-screen flex" style={{ backgroundColor: "var(--surface-page)" }}>
        <ProfileSidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          profileData={profileData}
          fullName={fullName}
          hasActiveReservation={Boolean(activeReservation)}
          onLogout={handleLogout}
        />

        <div className="flex-1 flex flex-col" style={{ minWidth: 0, overflowX: "hidden" }}>

          <main className="flex-1 overflow-auto">
            <div style={{ padding: isMobile ? '16px 16px 16px' : 32, paddingTop: isMobile ? 72 : 32 }}>
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

              {activeTab === "billing" && <BillingTab />}

              {activeTab === "reservation" && (
                <ReservationAgreementPage
                  reservation={confirmedReservation}
                  onBack={() => setActiveTab("dashboard")}
                />
              )}

              {activeTab === "contract" && <ContractTab />}

              {activeTab === "history" && (
                <ActivityHistoryTab reservations={reservations} />
              )}

              {activeTab === "notifications" && <NotificationsTab />}
              {activeTab === "settings" && <SettingsTab />}
            </div>
          </main>
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
    </ThemeProvider>
  );
};

export default ProfilePage;
