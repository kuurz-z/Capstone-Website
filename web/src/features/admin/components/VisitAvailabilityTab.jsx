import { useEffect, useMemo, useState } from "react";
import { CalendarOff, Clock, Plus, Save, Trash2 } from "lucide-react";
import {
  useUpdateVisitAvailabilitySettings,
  useVisitAvailabilitySettings,
} from "../../../shared/hooks/queries/useReservations";
import { useCurrentUser } from "../../../shared/hooks/queries/useUsers";
import { showNotification } from "../../../shared/utils/notification";
import { getBranchLabel } from "../utils/reservationRows";
import "../styles/design-tokens.css";
import "../styles/admin-reservations.css";

const WEEKDAYS = [
  { value: 1, label: "Mon", full: "Monday" },
  { value: 2, label: "Tue", full: "Tuesday" },
  { value: 3, label: "Wed", full: "Wednesday" },
  { value: 4, label: "Thu", full: "Thursday" },
  { value: 5, label: "Fri", full: "Friday" },
  { value: 6, label: "Sat", full: "Saturday" },
  { value: 0, label: "Sun", full: "Sunday" },
];

const DEFAULT_SLOT_LABELS = [
  "08:00 AM",
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "01:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
];

const createDefaultDraft = () => ({
  enabledWeekdays: [1, 2, 3, 4, 5],
  slots: DEFAULT_SLOT_LABELS.map((label) => ({
    label,
    enabled: true,
    capacity: 5,
  })),
  blackoutDates: [],
});

function VisitAvailabilityTab() {
  const { data: currentUser } = useCurrentUser();
  const isBranchAdmin = currentUser?.role === "branch_admin";
  const branchOptions = useMemo(
    () =>
      isBranchAdmin
        ? [
            {
              value: currentUser?.branch || "gil-puyat",
              label: getBranchLabel(currentUser?.branch || "gil-puyat"),
            },
          ]
        : [
            { value: "gil-puyat", label: "Gil Puyat" },
            { value: "guadalupe", label: "Guadalupe" },
          ],
    [currentUser?.branch, isBranchAdmin],
  );

  const [branch, setBranch] = useState(branchOptions[0]?.value || "gil-puyat");
  const [draft, setDraft] = useState(createDefaultDraft);
  const canLoadSettings =
    Boolean(currentUser) && (!isBranchAdmin || branch === currentUser.branch);
  const { data: settings, isLoading } = useVisitAvailabilitySettings(branch, {
    enabled: canLoadSettings,
  });
  const updateSettings = useUpdateVisitAvailabilitySettings();

  useEffect(() => {
    if (isBranchAdmin && currentUser?.branch && branch !== currentUser.branch) {
      setBranch(currentUser.branch);
    }
  }, [branch, currentUser?.branch, isBranchAdmin]);

  useEffect(() => {
    if (!settings) return;
    setDraft({
      enabledWeekdays: settings.enabledWeekdays || [1, 2, 3, 4, 5],
      slots: settings.slots?.length ? settings.slots : createDefaultDraft().slots,
      blackoutDates: settings.blackoutDates || [],
    });
  }, [settings]);

  const activeSlots = draft.slots.filter((slot) => slot.enabled);
  const totalCapacity = activeSlots.reduce(
    (sum, slot) => sum + (Number(slot.capacity) || 0),
    0,
  );

  const toggleWeekday = (day) => {
    setDraft((previous) => {
      const next = new Set(previous.enabledWeekdays);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return { ...previous, enabledWeekdays: [...next].sort((a, b) => a - b) };
    });
  };

  const updateSlot = (index, patch) => {
    setDraft((previous) => ({
      ...previous,
      slots: previous.slots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    }));
  };

  const addBlackout = () => {
    setDraft((previous) => ({
      ...previous,
      blackoutDates: [...previous.blackoutDates, { date: "", reason: "" }],
    }));
  };

  const updateBlackout = (index, patch) => {
    setDraft((previous) => ({
      ...previous,
      blackoutDates: previous.blackoutDates.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeBlackout = (index) => {
    setDraft((previous) => ({
      ...previous,
      blackoutDates: previous.blackoutDates.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const save = async () => {
    try {
      await updateSettings.mutateAsync({
        branch,
        data: {
          enabledWeekdays: draft.enabledWeekdays,
          slots: draft.slots.map((slot) => ({
            ...slot,
            capacity: Math.max(0, Math.floor(Number(slot.capacity) || 0)),
          })),
          blackoutDates: draft.blackoutDates.filter((item) => item.date),
        },
      });
      showNotification("Visit availability rules saved", "success", 3000);
    } catch (error) {
      showNotification(
        error?.response?.data?.error || "Failed to save visit availability rules.",
        "error",
        4000,
      );
    }
  };

  return (
    <div className="visit-availability-workspace">
      <div className="visit-availability-header">
        <div>
          <span className="visit-availability-kicker">Admin Controls</span>
          <h2>Visit Availability Rules</h2>
          <p>Set booking days, available time slots, slot capacity, and blackout dates per branch.</p>
        </div>
        <div className="visit-availability-header__actions">
          <label>
            <span>Branch</span>
            <select
              value={branch}
              disabled={isBranchAdmin}
              onChange={(event) => setBranch(event.target.value)}
            >
              {branchOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="res-action-btn res-action-btn--success"
            disabled={isLoading || updateSettings.isPending}
            onClick={save}
          >
            <Save size={15} />
            {updateSettings.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="visit-availability-summary">
        <div>
          <strong>{draft.enabledWeekdays.length}</strong>
          <span>Open Days</span>
        </div>
        <div>
          <strong>{activeSlots.length}</strong>
          <span>Active Slots</span>
        </div>
        <div>
          <strong>{totalCapacity}</strong>
          <span>Daily Capacity</span>
        </div>
        <div>
          <strong>{draft.blackoutDates.filter((item) => item.date).length}</strong>
          <span>Blackout Dates</span>
        </div>
      </div>

      <div className="visit-availability-layout">
        <section className="visit-rule-section">
          <div className="visit-rule-section__title">
            <CalendarOff size={18} />
            <div>
              <h3>Open Weekdays</h3>
              <p>Applicants can only pick enabled days.</p>
            </div>
          </div>
          <div className="visit-weekday-grid">
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                className={draft.enabledWeekdays.includes(day.value) ? "active" : ""}
                onClick={() => toggleWeekday(day.value)}
              >
                <strong>{day.label}</strong>
                <span>{day.full}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="visit-rule-section">
          <div className="visit-rule-section__title">
            <Clock size={18} />
            <div>
              <h3>Time Slots And Capacity</h3>
              <p>Disable closed times or set how many visits each slot accepts.</p>
            </div>
          </div>
          <div className="visit-slot-table">
            <div className="visit-slot-table__head">
              <span>Time</span>
              <span>Status</span>
              <span>Capacity</span>
            </div>
            {draft.slots.map((slot, index) => (
              <div key={slot.label} className="visit-slot-table__row">
                <span>{slot.label}</span>
                <label className="visit-switch">
                  <input
                    type="checkbox"
                    checked={slot.enabled}
                    onChange={(event) => updateSlot(index, { enabled: event.target.checked })}
                  />
                  <span>{slot.enabled ? "Open" : "Closed"}</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={slot.capacity}
                  disabled={!slot.enabled}
                  onChange={(event) => updateSlot(index, { capacity: event.target.value })}
                  aria-label={`${slot.label} capacity`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="visit-rule-section visit-rule-section--wide">
          <div className="visit-rule-section__title">
            <CalendarOff size={18} />
            <div>
              <h3>Blackout Dates</h3>
              <p>Close specific calendar dates for holidays, staff events, or maintenance.</p>
            </div>
            <button type="button" className="res-action-btn" onClick={addBlackout}>
              <Plus size={15} />
              Add Date
            </button>
          </div>
          <div className="visit-blackout-list">
            {draft.blackoutDates.length === 0 && (
              <div className="visit-empty-state">No blackout dates configured.</div>
            )}
            {draft.blackoutDates.map((item, index) => (
              <div key={`${item.date}-${index}`} className="visit-blackout-row">
                <input
                  type="date"
                  value={item.date || ""}
                  onChange={(event) => updateBlackout(index, { date: event.target.value })}
                />
                <input
                  type="text"
                  value={item.reason || ""}
                  placeholder="Reason shown to applicants"
                  onChange={(event) => updateBlackout(index, { reason: event.target.value })}
                />
                <button
                  type="button"
                  className="res-icon-btn res-icon-btn--danger"
                  onClick={() => removeBlackout(index)}
                  title="Remove blackout date"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default VisitAvailabilityTab;
