import React from "react";
import BaseModal from "../../../shared/components/BaseModal";
import { Clock } from "lucide-react";

/**
 * ReservationInactivityModal
 *
 * Appears when an applicant has been inactive for 25 minutes during their room reservation.
 * Provides a 5-minute countdown and an extensible action ("I'm still here") or voluntary release.
 * Strictly adheres to Lilycrest solid styling tokens and neutral 1px borders.
 */
export default function ReservationInactivityModal({
  isOpen,
  roomName = "your room",
  secondsRemaining = 300,
  isExtending = false,
  onExtend,
  onRelease,
}) {
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onExtend}
      onCancel={onRelease}
      closeOnBackdrop={false}
      closeOnEscape={false}
      title="Are you still working on your reservation?"
      subtitle={`Room: ${roomName}`}
      variant="warning"
      size="sm"
      cancelText="Release Room"
      confirmText={isExtending ? "Extending..." : "I'm still here"}
      loading={isExtending}
      onConfirm={onExtend}
    >
      <div className="space-y-3 text-slate-600 dark:text-slate-300 text-sm">
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          You have been inactive for 25 minutes. To give all applicants a fair chance, your temporary hold on <strong>{roomName}</strong> will expire soon.
        </p>
        <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 font-mono font-medium">
          <Clock size={16} className="text-amber-500 flex-shrink-0" />
          <span>Hold expires in: <strong>{timeFormatted}</strong></span>
        </div>
      </div>
    </BaseModal>
  );
}
