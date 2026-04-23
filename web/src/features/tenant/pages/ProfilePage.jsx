import React, { useEffect, useMemo, useState } from "react";
import "../../../shared/styles/notification.css";
import "../styles/profile-page.css";
import "../styles/profile-dark-overrides.css";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import ProfilePageSkeleton from "../components/profile/ProfilePageSkeleton";
import ConfirmModal from "../../../shared/components/ConfirmModal";
import { authFetch } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import { useQueryClient } from "@tanstack/react-query";
import {
  getReservationProgress,
  getNextAction,
} from "../utils/reservationProgress";
import { useCurrentUser } from "../../../shared/hooks/queries/useUsers";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import { billingApi } from "../../../shared/api/billingApi";
import { hasReservationStatus } from "../../../shared/utils/lifecycleNaming";
import TenantMaintenanceWorkspace from "../components/maintenance/TenantMaintenanceWorkspace";
import {
  ReceiptModal,
  DashboardTab,
  PersonalDetailsTab,
  ActivityHistoryTab,
  NotificationsTab,
  SettingsTab,
  ContractTab,
  ReservationAgreementPage,
  AnnouncementsTab,
} from "../components/profile";

const ProfilePage = () => {
  const { user: authUser, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const canViewAnnouncements = authUser?.role === "tenant";

  const [activeTab, setActiveTab] = useState(
    location.state?.tab === "announcements" && !canViewAnnouncements
      ? "dashboard"
      : location.state?.tab || "dashboard",
  );
  const [saving, setSaving] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
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
    tenantStatus: "applicant",
    createdAt: "",
    gender: "",
    civilStatus: "",
    nationality: "",
    occupation: "",
    address: "",
    city: "",
    province: "",
    zipCode: "",
    dateOfBirth: "",
    emergencyContact: "",
    emergencyPhone: "",
    emergencyRelationship: "",
  });

  const [editData, setEditData] = useState({
    firstName: "",
    lastName: "",
    profileImage: "",
    dateOfBirth: "",
    gender: "",
    civilStatus: "",
    nationality: "",
    occupation: "",
  });

  const { data: profile, isLoading: profileLoading } = useCurrentUser();
  const { data: reservationsData, isLoading: reservationsLoading } = useReservations();
  const loading = (!profile && profileLoading) || (!reservationsData && reservationsLoading);

  useEffect(() => {
    if (!profile) return;

    setProfileData(profile);
    setEditData({
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      profileImage: profile.profileImage || "",
      dateOfBirth: profile.dateOfBirth || "",
      gender: profile.gender || "",
      civilStatus: profile.civilStatus || "",
      nationality: profile.nationality || "",
      occupation: profile.occupation || "",
    });
  }, [profile]);

  useEffect(() => {
    const nextTab =
      location.state?.tab === "announcements" && !canViewAnnouncements
        ? "dashboard"
        : location.state?.tab || "dashboard";

    setActiveTab(nextTab);
  }, [canViewAnnouncements, location.state]);

  useEffect(() => {
    if (activeTab === "announcements" && !canViewAnnouncements) {
      setActiveTab("dashboard");
    }
  }, [activeTab, canViewAnnouncements]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentStatus = params.get("payment");
    const rawSessionId = params.get("session_id");

    if (!paymentStatus) return;

    const alreadyPaid = (Array.isArray(reservationsData) ? reservationsData : []).find(
      (reservation) =>
        reservation.status !== "cancelled" &&
        (reservation.paymentStatus === "paid" || reservation.status === "reserved"),
    );

    if (alreadyPaid) {
      navigate(location.pathname, { replace: true });
      navigate("/applicant/reservation", {
        state: { step: 5, continueFlow: true, reservationId: alreadyPaid._id },
        replace: true,
      });
      return;
    }

    const urlSessionId = rawSessionId && rawSessionId !== "{id}" ? rawSessionId : null;
    if (!urlSessionId && !reservationsData) return;

    navigate(location.pathname, { replace: true });

    const verifyPayment = async () => {
      let sessionId = urlSessionId;
      const active = (Array.isArray(reservationsData) ? reservationsData : []).find(
        (reservation) => reservation.paymongoSessionId && reservation.status !== "cancelled",
      );

      if (!sessionId && active?.paymongoSessionId) {
        sessionId = active.paymongoSessionId;
      }

      if (sessionId) {
        try {
          const result = await billingApi.checkPaymentStatus(sessionId);
          if (result?.status === "paid") {
            showNotification(
              "Payment successful! Your reservation is confirmed.",
              "success",
              5000,
            );
            queryClient.invalidateQueries({ queryKey: ["reservations"] });
            navigate("/applicant/reservation", {
              state: { step: 5, continueFlow: true, reservationId: active?._id },
              replace: true,
            });
            return;
          }
        } catch (error) {
          console.error("Payment verification failed:", error);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["reservations"] });

      if (active && (active.paymentStatus === "paid" || active.status === "reserved")) {
        navigate("/applicant/reservation", {
          state: { step: 5, continueFlow: true, reservationId: active._id },
          replace: true,
        });
        return;
      }

      if (paymentStatus === "cancelled") {
        showNotification(
          "Payment was cancelled. You can try again from your profile.",
          "warning",
          5000,
        );
      } else {
        showNotification(
          "Payment is being processed. Please wait a moment.",
          "info",
          5000,
        );
      }
    };

    verifyPayment();
  }, [location.pathname, location.search, navigate, queryClient, reservationsData]);

  const reservations = useMemo(() => reservationsData || [], [reservationsData]);

  const activeReservation = useMemo(() => {
    const activeOnes = reservations.filter((reservation) => {
      const status = reservation.reservationStatus || reservation.status;
      return !hasReservationStatus(status, "moveOut", "cancelled");
    });

    return activeOnes[0] || null;
  }, [reservations]);

  const activeReservations = useMemo(
    () =>
      reservations.filter((reservation) => {
        const status = reservation.reservationStatus || reservation.status;
        return !hasReservationStatus(status, "moveOut", "cancelled");
      }),
    [reservations],
  );

  useEffect(() => {
    if (activeReservation && !selectedReservationId) {
      setSelectedReservationId(activeReservation._id);
    }
  }, [activeReservation, selectedReservationId]);

  const visits = useMemo(
    () =>
      reservations
        .filter((reservation) => reservation.visitDate)
        .map((reservation) => ({
          id: reservation._id,
          roomNumber: reservation.roomId?.name || "N/A",
          location: reservation.roomId?.branch || "N/A",
          floor: reservation.roomId?.floor || 1,
          date: reservation.visitDate,
          time: reservation.visitTime || "TBD",
          status: reservation.visitCompleted
            ? "Completed"
            : new Date(reservation.visitDate) < new Date()
              ? "Missed"
              : "Scheduled",
          specialInstructions:
            "Please bring valid ID. Meet at the reception area.",
        })),
    [reservations],
  );

  const handleSaveProfile = async () => {
    setSaving(true);
    const imageChanged =
      editData.profileImage && editData.profileImage !== profileData.profileImage;

    try {
      const updatedUser = await authFetch("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(editData),
      });

      setProfileData((prev) => ({ ...prev, ...updatedUser.user }));
      setIsEditingProfile(false);
      if (updateUser) updateUser(updatedUser.user);
      queryClient.invalidateQueries({ queryKey: ["users", "currentUser"] });

      showNotification(
        imageChanged
          ? "Profile photo updated successfully!"
          : "Profile updated successfully!",
        "success",
        3000,
      );
    } catch (error) {
      console.error("Error updating profile:", error);
      showNotification("Failed to update profile. Please try again.", "error", 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditData({
      firstName: profileData.firstName || "",
      lastName: profileData.lastName || "",
      profileImage: profileData.profileImage || "",
      dateOfBirth: profileData.dateOfBirth || "",
      gender: profileData.gender || "",
      civilStatus: profileData.civilStatus || "",
      nationality: profileData.nationality || "",
      occupation: profileData.occupation || "",
    });
    setIsEditingProfile(false);
  };

  const hasUnsavedChanges =
    isEditingProfile &&
    (editData.firstName !== (profileData.firstName || "") ||
      editData.lastName !== (profileData.lastName || "") ||
      editData.profileImage !== (profileData.profileImage || "") ||
      editData.dateOfBirth !== (profileData.dateOfBirth || "") ||
      editData.gender !== (profileData.gender || "") ||
      editData.civilStatus !== (profileData.civilStatus || "") ||
      editData.nationality !== (profileData.nationality || "") ||
      editData.occupation !== (profileData.occupation || ""));

  const handleTabChange = (nextTab) => {
    if (hasUnsavedChanges) {
      setPendingTab(nextTab);
      setShowUnsavedWarning(true);
      return;
    }

    setActiveTab(nextTab);
    setIsEditingProfile(false);
    navigate("/applicant/profile", {
      replace: true,
      state: { tab: nextTab },
    });
  };

  const confirmDiscardChanges = () => {
    setShowUnsavedWarning(false);
    handleCancelEdit();

    if (pendingTab) {
      setActiveTab(pendingTab);
      navigate("/applicant/profile", {
        replace: true,
        state: { tab: pendingTab },
      });
      setPendingTab(null);
    }
  };

  const selectedReservation = selectedReservationId
    ? activeReservations.find((reservation) => reservation._id === selectedReservationId) ||
      activeReservations[0]
    : activeReservations[0];

  const reservationProgress = getReservationProgress(selectedReservation);
  const nextAction = getNextAction(activeReservation, reservationProgress);

  const isReservationConfirmed =
    selectedReservation &&
    (selectedReservation.reservationStatus === "reserved" ||
      selectedReservation.status === "reserved" ||
      selectedReservation.paymentStatus === "paid");

  const confirmedReservation = isReservationConfirmed
    ? selectedReservation || activeReservation
    : null;

  useEffect(() => {
    if (!isReservationConfirmed) return;

    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isReservationConfirmed]);

  const fullName =
    `${profileData.firstName || ""} ${profileData.lastName || ""}`.trim() || "User";

  if (loading) return <ProfilePageSkeleton />;

  return (
    <>
      {activeTab === "dashboard" && (
        <DashboardTab
          profileData={profileData}
          activeReservation={activeReservation}
          selectedReservation={selectedReservation}
          visits={visits}
          nextAction={nextAction}
          onGoToPersonal={() => handleTabChange("personal")}
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

      {activeTab === "reservation" && (
        <ReservationAgreementPage
          reservation={confirmedReservation}
          onBack={() => handleTabChange("dashboard")}
        />
      )}

      {activeTab === "history" && (
        <ActivityHistoryTab reservations={reservations} />
      )}

      {activeTab === "maintenance" && <TenantMaintenanceWorkspace embedded />}
      {activeTab === "announcements" && canViewAnnouncements && <AnnouncementsTab />}
      {activeTab === "notifications" && <NotificationsTab />}
      {activeTab === "settings" && <SettingsTab />}
      {activeTab === "contract" && <ContractTab />}

      <ReceiptModal
        isOpen={receiptModal.open}
        step={receiptModal.step}
        reservation={activeReservation}
        onClose={() => setReceiptModal({ open: false, step: null })}
      />

      <ConfirmModal
        isOpen={showUnsavedWarning}
        onClose={() => {
          setShowUnsavedWarning(false);
          setPendingTab(null);
        }}
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
