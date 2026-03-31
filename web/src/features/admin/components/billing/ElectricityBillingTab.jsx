import { useState, useMemo } from "react";
import {
  Zap, Plus, Check, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, Trash2, X, Send, Pencil, Save
} from "lucide-react";
import { showNotification } from "../../../../shared/utils/notification";
import getFriendlyError from "../../../../shared/utils/friendlyError";
import { useAuth } from "../../../../shared/hooks/useAuth";
import ConfirmModal from "../../../../shared/components/ConfirmModal";
import {
  useElectricityRooms,
  useMeterReadings,
  useLatestReading,
  useBillingPeriods,
  useBillingResult,
  useRecordReading,
  useOpenPeriod,
  useClosePeriod,
  useReviseResult,
  useDeleteReading,
  useDeletePeriod,
  useDraftBills,
  useSendBills,
  useAdjustBill,
} from "../../../../shared/hooks/queries/useElectricity";
import "./ElectricityBillingTab.css";

const ElectricityBillingTab = () => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  /** Mask tenant name for privacy: "Leander Ponce" → "Leander *****" */
  const maskName = (name) => {
    if (!name) return "—";
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0];
    const first = parts[0];
    const last = parts.slice(1).join(" ");
    return `${first} ${"*".repeat(Math.max(last.length, 4))}`;
  };

  // Selection
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);
  // The period ID to load draft bills for (set after a period is closed)
  const [draftPeriodId, setDraftPeriodId] = useState(null);
  const [branchFilter, setBranchFilter] = useState(isOwner ? "" : (user?.branch || ""));

  // Panel state
  const [activePanel, setActivePanel] = useState(null);
  const [expandedResult, setExpandedResult] = useState(true);
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null });

  // Draft Bills state
  const [globalDueDate, setGlobalDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [editingBillId, setEditingBillId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Revision note modal (replaces window.prompt)
  const [reviseModal, setReviseModal] = useState({ open: false, periodId: null });
  const [revisionNote, setRevisionNote] = useState("");

  // Pagination
  const PERIODS_PER_PAGE = 5;
  const READINGS_PER_PAGE = 7;
  const [periodsPage, setPeriodsPage] = useState(1);
  const [readingsPage, setReadingsPage] = useState(1);

  // Form state — billing periods default to 15th-to-15th cycle
  const get15th = () => {
    const d = new Date();
    d.setDate(15);
    return d.toISOString().slice(0, 10);
  };

  /** 15th of the NEXT month relative to a given date string (or now). */
  const getNext15th = (fromDateStr) => {
    const d = fromDateStr ? new Date(fromDateStr) : new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(15);
    return d.toISOString().slice(0, 10);
  };

  const [readingForm, setReadingForm] = useState({
    reading: "", date: get15th(),
    eventType: "regular-billing", tenantId: ""
  });
  const [periodForm, setPeriodForm] = useState({
    startDate: get15th(), startReading: "", ratePerKwh: "",
    endReading: "", endDate: getNext15th(),
  });

  // Queries
  const { data: roomsData, isLoading: roomsLoading } = useElectricityRooms(branchFilter);
  const { data: readingsData } = useMeterReadings(selectedRoomId);
  const { data: latestData } = useLatestReading(selectedRoomId);
  const { data: periodsData } = useBillingPeriods(selectedRoomId);
  const { data: resultData } = useBillingResult(selectedPeriodId);
  const { data: draftBillsData } = useDraftBills(draftPeriodId);

  // Mutations
  const recordReading = useRecordReading();
  const openPeriod = useOpenPeriod();
  const closePeriod = useClosePeriod();
  const reviseResult = useReviseResult();
  const deleteReading = useDeleteReading();
  const deletePeriod = useDeletePeriod();
  const sendBills = useSendBills();
  const adjustBill = useAdjustBill();

  const rooms = roomsData?.rooms || [];
  const readings = readingsData?.readings || [];
  const periods = periodsData?.periods || [];
  const result = resultData?.result || null;
  const draftBills = draftBillsData?.bills || [];
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const openPeriodForRoom = periods.find((p) => p.status === "open");

  const filteredRooms = useMemo(() => {
    if (!branchFilter) return rooms;
    return rooms.filter((r) => r.branch === branchFilter);
  }, [rooms, branchFilter]);

  // Paginated slices
  const totalPeriodPages = Math.max(1, Math.ceil(periods.length / PERIODS_PER_PAGE));
  const pagedPeriods = periods.slice((periodsPage - 1) * PERIODS_PER_PAGE, periodsPage * PERIODS_PER_PAGE);
  const totalReadingPages = Math.max(1, Math.ceil(readings.length / READINGS_PER_PAGE));
  const pagedReadings = readings.slice((readingsPage - 1) * READINGS_PER_PAGE, readingsPage * READINGS_PER_PAGE);

  // Reusable pagination control
  const Pagination = ({ page, total, onChange, countLabel }) => {
    if (total <= 1) return null;
    return (
      <div className="eb-pagination">
        <span className="eb-pagination__info">{countLabel}</span>
        <div className="eb-pagination__controls">
          <button className="eb-page-btn" onClick={() => onChange(page - 1)} disabled={page === 1}>‹</button>
          {Array.from({ length: total }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              className={`eb-page-btn${page === n ? ' eb-page-btn--active' : ''}`}
              onClick={() => onChange(n)}
            >{n}</button>
          ))}
          <button className="eb-page-btn" onClick={() => onChange(page + 1)} disabled={page === total}>›</button>
        </div>
      </div>
    );
  };

  // ── Handlers ──

  const openPanel = (panel, extras = {}) => {
    setActivePanel(panel);
    if (panel === "newPeriod") {
      const startDate = get15th();
      setPeriodForm(f => ({
        ...f,
        startReading: latestData?.reading ?? "",
        startDate,
        endDate: getNext15th(startDate),
        endReading: "",
        ...extras,
      }));
    }
  };

  const closePanel = () => setActivePanel(null);

  const handleRecordReading = async () => {
    if (!readingForm.reading || !readingForm.date) {
      return showNotification("Reading value and date are required.", "error");
    }
    try {
      await recordReading.mutateAsync({
        roomId: selectedRoomId,
        reading: Number(readingForm.reading),
        date: readingForm.date,
        eventType: readingForm.eventType,
        tenantId: readingForm.tenantId || undefined,
      });
      showNotification("Meter reading recorded.", "success");
      closePanel();
      setReadingForm({ reading: "", date: new Date().toISOString().slice(0, 10), eventType: "regular-billing", tenantId: "" });
    } catch (err) {
      showNotification(getFriendlyError(err, "Failed to record reading."), "error");
    }
  };

  const handleDeleteReading = (readingId) => {
    setConfirmModal({
      open: true,
      title: "Delete Meter Reading",
      message: "This reading will be permanently removed from the database. If it belongs to a closed period, click 'Re-run' afterward to update the billing result.",
      variant: "danger",
      confirmText: "Delete Reading",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          await deleteReading.mutateAsync(readingId);
          showNotification("Reading permanently deleted.", "success");
        } catch (err) {
          showNotification(getFriendlyError(err, "Failed to delete reading."), "error");
        }
      },
    });
  };

  const handleDeletePeriod = (periodId) => {
    setConfirmModal({
      open: true,
      title: "Delete Billing Period",
      message: "This will permanently delete the billing period AND all its meter readings and generated tenant bills from the database. This cannot be undone.",
      variant: "danger",
      confirmText: "Delete Period",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          await deletePeriod.mutateAsync(periodId);
          if (selectedPeriodId === periodId) setSelectedPeriodId(null);
          if (draftPeriodId === periodId) setDraftPeriodId(null);
          showNotification("Billing period permanently deleted.", "success");
        } catch (err) {
          showNotification(getFriendlyError(err, "Failed to delete period."), "error");
        }
      },
    });
  };

  const handleOpenPeriod = async () => {
    if (!periodForm.startReading || !periodForm.ratePerKwh || !periodForm.endReading) {
      return showNotification("Start reading, rate, and end reading are all required.", "error");
    }
    try {
      // Step 1: open
      const opened = await openPeriod.mutateAsync({
        roomId: selectedRoomId,
        startDate: periodForm.startDate,
        startReading: Number(periodForm.startReading),
        ratePerKwh: Number(periodForm.ratePerKwh),
      });
      // Step 2: immediately close with the final reading
      const newPeriodId = opened?.period?._id || opened?.period?.id;
      if (!newPeriodId) throw new Error("Could not retrieve new period ID.");
      await closePeriod.mutateAsync({
        periodId: newPeriodId,
        endReading: Number(periodForm.endReading),
        endDate: periodForm.endDate,
      });
      showNotification("Billing period created and closed — draft bills ready to review.", "success");
      setDraftPeriodId(newPeriodId);
      closePanel();
    } catch (err) {
      showNotification(getFriendlyError(err, "Failed to create billing period."), "error");
    }
  };

  // Legacy close handler kept for "open" periods that pre-date this UX change
  const handleClosePeriod = async () => {
    if (!periodForm.endReading) {
      return showNotification("End reading is required.", "error");
    }
    if (!openPeriodForRoom) return;
    try {
      await closePeriod.mutateAsync({
        periodId: openPeriodForRoom.id,
        endReading: Number(periodForm.endReading),
        endDate: periodForm.endDate || new Date().toISOString().slice(0, 10),
      });
      showNotification("Period closed — draft bills created.", "success");
      setDraftPeriodId(openPeriodForRoom.id);
      closePanel();
    } catch (err) {
      showNotification(getFriendlyError(err, "Failed to close period."), "error");
    }
  };

  // Revision: use modal instead of window.prompt
  const handleRevise = (periodId) => {
    setRevisionNote("");
    setReviseModal({ open: true, periodId });
  };

  const handleReviseConfirm = async () => {
    const { periodId } = reviseModal;
    setReviseModal({ open: false, periodId: null });
    try {
      await reviseResult.mutateAsync({ periodId, revisionNote });
      showNotification("Billing result revised.", "success");
    } catch (err) {
      showNotification(getFriendlyError(err, "Failed to revise."), "error");
    }
  };

  // ── Draft bills handlers ──

  const startEditBill = (bill) => {
    setEditingBillId(String(bill.billId));
    setEditForm({
      electricity: bill.charges.electricity ?? 0,
      water: bill.charges.water ?? 0,
      rent: bill.charges.rent ?? 0,
      applianceFees: bill.charges.applianceFees ?? 0,
      corkageFees: bill.charges.corkageFees ?? 0,
      notes: bill.notes ?? "",
      dueDate: bill.dueDate ? new Date(bill.dueDate).toISOString().slice(0, 10) : globalDueDate,
    });
  };

  const cancelEdit = () => {
    setEditingBillId(null);
    setEditForm({});
  };

  const computeEditTotal = () => {
    const f = editForm;
    return (
      (Number(f.electricity) || 0) +
      (Number(f.water) || 0) +
      (Number(f.rent) || 0) +
      (Number(f.applianceFees) || 0) +
      (Number(f.corkageFees) || 0)
    );
  };

  const handleSaveEdit = async (billId) => {
    try {
      await adjustBill.mutateAsync({
        billId,
        periodId: draftPeriodId,
        charges: {
          electricity: Number(editForm.electricity) || 0,
          water: Number(editForm.water) || 0,
          rent: Number(editForm.rent) || 0,
          applianceFees: Number(editForm.applianceFees) || 0,
          corkageFees: Number(editForm.corkageFees) || 0,
        },
        notes: editForm.notes,
        dueDate: editForm.dueDate || undefined,
      });
      showNotification("Bill updated.", "success");
      cancelEdit();
    } catch (err) {
      showNotification(getFriendlyError(err, "Failed to update bill."), "error");
    }
  };

  const handleSendBills = () => {
    setConfirmModal({
      open: true,
      title: "Send Bills to Tenants",
      message: `This will send ${draftBills.length} bill${draftBills.length !== 1 ? "s" : ""} to tenants and notify them by email. This action cannot be undone.`,
      variant: "primary",
      confirmText: "Send Bills",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          const result = await sendBills.mutateAsync({
            periodId: draftPeriodId,
            defaultDueDate: globalDueDate,
          });
          showNotification(`${result.sent} bill${result.sent !== 1 ? "s" : ""} sent to tenants.`, "success");
          setDraftPeriodId(null);
        } catch (err) {
          showNotification(getFriendlyError(err, "Failed to send bills."), "error");
        }
      },
    });
  };

  const fmt = (date) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // ── Render ──

  return (
    <>
    <div className="eb-layout">

      {/* ── Sidebar ── */}
      <aside className="eb-sidebar">
        <div className="eb-sidebar__header">
          <span className="eb-sidebar__title"><Zap size={15} /> Rooms</span>
          {isOwner && (
            <select
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value); setSelectedRoomId(null); }}
              className="eb-sidebar__filter"
            >
              <option value="">All</option>
              <option value="gil-puyat">Gil-Puyat</option>
              <option value="guadalupe">Guadalupe</option>
            </select>
          )}
        </div>

        <div className="eb-sidebar__list">
          {roomsLoading ? (
            <div className="eb-sidebar__loading">Loading…</div>
          ) : filteredRooms.length === 0 ? (
            <div className="eb-sidebar__empty">No rooms found</div>
          ) : (
            filteredRooms.map((room) => {
              const isEmpty = !room.hasActiveTenants;
              return (
                <button
                  key={room.id}
                  className={`eb-room${selectedRoomId === room.id ? " eb-room--active" : ""}`}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setSelectedPeriodId(null);
                    setDraftPeriodId(null);
                    setPeriodsPage(1);
                    setReadingsPage(1);
                    closePanel();
                  }}
                >
                  <span className="eb-room__name">{room.name || room.roomNumber}</span>
                  <span className={`eb-room__badge${room.hasOpenPeriod ? " eb-room__badge--open" : ""}${isEmpty ? " eb-room__badge--empty" : ""}`}>
                    {isEmpty ? "No Tenants" : room.hasOpenPeriod ? "Active" : "No Period"}
                  </span>
                  {room.latestReading != null && (
                    <span className="eb-room__kwh">{room.latestReading} kWh</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="eb-main">
        {!selectedRoomId ? (
          <div className="eb-empty-state">
            <Zap size={40} strokeWidth={1.5} />
            <p>Select a room to manage electricity billing</p>
          </div>
        ) : (
          <div className="eb-content">

            {/* Header */}
            <div className="eb-header">
              <div className="eb-header__left">
                <h2 className="eb-header__title">{selectedRoom?.name || selectedRoom?.roomNumber}</h2>
                <span className="eb-header__branch">{selectedRoom?.branch}</span>
              </div>
              <div className="eb-header__actions">
                {!openPeriodForRoom ? (
                  <button
                    className={`eb-btn eb-btn--primary${activePanel === "newPeriod" ? " eb-btn--active" : ""}`}
                    onClick={() => activePanel === "newPeriod" ? closePanel() : openPanel("newPeriod")}
                  >
                    <Plus size={14} /> New Billing Period
                  </button>
                ) : (
                  <button
                    className={`eb-btn eb-btn--primary${activePanel === "closePeriod" ? " eb-btn--active" : ""}`}
                    onClick={() => activePanel === "closePeriod" ? closePanel() : openPanel("closePeriod")}
                  >
                    <Check size={14} /> Enter Final Reading
                  </button>
                )}
              </div>
            </div>

            {/* ── Inline panels ── */}
            {activePanel === "reading" && (
              <div className="eb-panel">
                <div className="eb-panel__header">
                  <span>Record Meter Reading</span>
                  <button className="eb-panel__close" onClick={closePanel}><X size={15} /></button>
                </div>
                <div className="eb-panel__body">
                  <div className="eb-form-row">
                    <div className="eb-field">
                      <label>Reading (kWh)</label>
                      <input
                        type="number"
                        value={readingForm.reading}
                        onChange={(e) => setReadingForm({ ...readingForm, reading: e.target.value })}
                        placeholder={latestData?.reading != null ? `Last: ${latestData.reading}` : "e.g. 1250"}
                        autoFocus
                      />
                    </div>
                    <div className="eb-field">
                      <label>Date</label>
                      <input type="date" value={readingForm.date} onChange={(e) => setReadingForm({ ...readingForm, date: e.target.value })} />
                    </div>
                    <div className="eb-field">
                      <label>Event</label>
                      <select value={readingForm.eventType} onChange={(e) => setReadingForm({ ...readingForm, eventType: e.target.value })}>
                        <option value="regular-billing">Regular</option>
                        <option value="move-in">Move-In</option>
                        <option value="move-out">Move-Out</option>
                      </select>
                    </div>
                    {(readingForm.eventType === "move-in" || readingForm.eventType === "move-out") && (
                      <div className="eb-field">
                        <label>Tenant ID</label>
                        <input type="text" value={readingForm.tenantId} onChange={(e) => setReadingForm({ ...readingForm, tenantId: e.target.value })} placeholder="Tenant MongoDB ID" />
                      </div>
                    )}
                  </div>
                  <div className="eb-panel__footer">
                    <button className="eb-btn eb-btn--primary" onClick={handleRecordReading} disabled={recordReading.isPending}>
                      {recordReading.isPending ? "Saving…" : "Save Reading"}
                    </button>
                    <button className="eb-btn eb-btn--ghost" onClick={closePanel}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── New Billing Period panel (combined open + close) ── */}
            {activePanel === "newPeriod" && (
              <div className="eb-panel">
                <div className="eb-panel__header">
                  <span>New Billing Period</span>
                  <button className="eb-panel__close" onClick={closePanel}><X size={15} /></button>
                </div>
                <div className="eb-panel__body">
                  <p className="eb-panel__hint">Enter the meter readings for the full billing period. Bills will be created as drafts for review.</p>
                  <div className="eb-form-row">
                    <div className="eb-field">
                      <label>Start Date</label>
                      <input type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
                    </div>
                    <div className="eb-field">
                      <label>Start Reading (kWh)</label>
                      <input
                        type="number"
                        value={periodForm.startReading}
                        onChange={(e) => setPeriodForm({ ...periodForm, startReading: e.target.value })}
                        placeholder={latestData?.reading != null ? `Last: ${latestData.reading}` : "e.g. 1200"}
                        autoFocus
                      />
                    </div>
                    <div className="eb-field">
                      <label>Rate (₱/kWh)</label>
                      <input type="number" step="0.01" value={periodForm.ratePerKwh} onChange={(e) => setPeriodForm({ ...periodForm, ratePerKwh: e.target.value })} placeholder="e.g. 16.00" />
                    </div>
                  </div>
                  <div className="eb-form-row" style={{ marginTop: "8px" }}>
                    <div className="eb-field">
                      <label>End Reading (kWh) — final meter value</label>
                      <input
                        type="number"
                        value={periodForm.endReading}
                        onChange={(e) => setPeriodForm({ ...periodForm, endReading: e.target.value })}
                        placeholder="Enter the final reading"
                      />
                    </div>
                    <div className="eb-field">
                      <label>End Date</label>
                      <input type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="eb-panel__footer">
                    <button
                      className="eb-btn eb-btn--primary"
                      onClick={handleOpenPeriod}
                      disabled={openPeriod.isPending || closePeriod.isPending}
                    >
                      {(openPeriod.isPending || closePeriod.isPending) ? "Processing…" : "Create & Generate Draft Bills"}
                    </button>
                    <button className="eb-btn eb-btn--ghost" onClick={closePanel}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Legacy: Close Period panel for pre-existing open periods ── */}
            {activePanel === "closePeriod" && openPeriodForRoom && (
              <div className="eb-panel eb-panel--warning">
                <div className="eb-panel__header">
                  <span>Enter Final Reading</span>
                  <button className="eb-panel__close" onClick={closePanel}><X size={15} /></button>
                </div>
                <div className="eb-panel__body">
                  <p className="eb-panel__hint">
                    Started {fmt(openPeriodForRoom.startDate)} · {openPeriodForRoom.startReading} kWh · ₱{openPeriodForRoom.ratePerKwh}/kWh
                  </p>
                  <div className="eb-form-row">
                    <div className="eb-field">
                      <label>Final Meter Reading (kWh)</label>
                      <input
                        type="number"
                        value={periodForm.endReading}
                        onChange={(e) => setPeriodForm({ ...periodForm, endReading: e.target.value })}
                        placeholder={latestData?.reading != null ? `Last: ${latestData.reading}` : "Enter final reading"}
                        autoFocus
                      />
                    </div>
                    <div className="eb-field">
                      <label>End Date</label>
                      <input type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="eb-panel__footer">
                    <button className="eb-btn eb-btn--primary" onClick={handleClosePeriod} disabled={closePeriod.isPending}>
                      {closePeriod.isPending ? "Computing…" : "Close & Create Drafts"}
                    </button>
                    <button className="eb-btn eb-btn--ghost" onClick={closePanel}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Draft Bills Panel ── */}
            {draftPeriodId && draftBills.length > 0 && (
              <section className="eb-section eb-section--draft">
                <div className="eb-section__header">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h3 className="eb-section__title eb-section__title--draft">
                      <Send size={14} />
                      Draft Bills
                    </h3>
                    <span className="eb-section__count eb-section__count--draft">
                      {draftBills.length} bill{draftBills.length !== 1 ? "s" : ""} pending
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="eb-field" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Default due date</label>
                      <input
                        type="date"
                        value={globalDueDate}
                        onChange={(e) => setGlobalDueDate(e.target.value)}
                        style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                      />
                    </div>
                    <button
                      className="eb-btn eb-btn--send"
                      onClick={handleSendBills}
                      disabled={sendBills.isPending}
                    >
                      <Send size={14} />
                      {sendBills.isPending ? "Sending…" : `Send ${draftBills.length} Bill${draftBills.length !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>

                <div className="eb-table-wrap">
                  <table className="eb-table">
                    <colgroup>
                      <col style={{ width: "24%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "16%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Tenant</th>
                        <th>Electricity</th>
                        <th>Water</th>
                        <th>Rent</th>
                        <th>Other</th>
                        <th>Total</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftBills.map((bill) => {
                        const billId = String(bill.billId);
                        const isEditing = editingBillId === billId;

                        return (
                          <tr key={billId} className={isEditing ? "eb-row--editing" : ""}>
                            <td>
                              {maskName(bill.tenantName)}
                              {bill.isManuallyAdjusted && (
                                <span className="eb-revised-tag" title="Manually adjusted">edited</span>
                              )}
                            </td>

                            {isEditing ? (
                              <>
                                <td><input type="number" step="0.01" className="eb-inline-input" value={editForm.electricity} onChange={e => setEditForm(f => ({ ...f, electricity: e.target.value }))} /></td>
                                <td><input type="number" step="0.01" className="eb-inline-input" value={editForm.water} onChange={e => setEditForm(f => ({ ...f, water: e.target.value }))} /></td>
                                <td><input type="number" step="0.01" className="eb-inline-input" value={editForm.rent} onChange={e => setEditForm(f => ({ ...f, rent: e.target.value }))} /></td>
                                <td><input type="number" step="0.01" className="eb-inline-input" value={editForm.applianceFees} onChange={e => setEditForm(f => ({ ...f, applianceFees: e.target.value }))} /></td>
                                <td className="eb-cell--num eb-cell--bold">₱{computeEditTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="eb-cell--actions">
                                  <button className="eb-btn eb-btn--xs eb-btn--primary" onClick={() => handleSaveEdit(billId)} disabled={adjustBill.isPending}>
                                    <Save size={11} /> Save
                                  </button>
                                  <button className="eb-btn eb-btn--xs eb-btn--ghost" onClick={cancelEdit}>Cancel</button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="eb-cell--num">₱{(bill.charges.electricity || 0).toLocaleString()}</td>
                                <td className="eb-cell--num">₱{(bill.charges.water || 0).toLocaleString()}</td>
                                <td className="eb-cell--num">₱{(bill.charges.rent || 0).toLocaleString()}</td>
                                <td className="eb-cell--num">₱{((bill.charges.applianceFees || 0) + (bill.charges.corkageFees || 0)).toLocaleString()}</td>
                                <td className="eb-cell--num eb-cell--bold">₱{Number(bill.totalAmount).toLocaleString()}</td>
                                <td className="eb-cell--actions">
                                  <button className="eb-btn eb-btn--xs eb-btn--outline" onClick={() => startEditBill(bill)}>
                                    <Pencil size={11} /> Edit
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{ textAlign: "right", fontWeight: 600, paddingRight: "8px", fontSize: "0.8rem" }}>Grand Total</td>
                        <td className="eb-cell--num eb-cell--bold" style={{ fontSize: "0.9rem" }}>
                          ₱{draftBills.reduce((s, b) => s + Number(b.totalAmount), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Per-bill due date and notes row when editing */}
                {editingBillId && (
                  <div className="eb-edit-extras">
                    <div className="eb-field">
                      <label>Due Date (this bill only)</label>
                      <input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} />
                    </div>
                    <div className="eb-field" style={{ flex: 2 }}>
                      <label>Adjustment Note</label>
                      <input type="text" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reason for adjustment…" />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* No draft bills but draftPeriodId is set — all sent */}
            {draftPeriodId && draftBills.length === 0 && draftBillsData && (
              <div className="eb-panel" style={{ borderColor: "var(--success, #22c55e)" }}>
                <div className="eb-panel__body" style={{ color: "var(--success, #22c55e)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Check size={16} /> All draft bills have been sent to tenants.
                </div>
              </div>
            )}

            {/* ── Billing Periods (PRIMARY) ── */}
            <section className="eb-section eb-section--primary">
              <div className="eb-section__header">
                <h3 className="eb-section__title eb-section__title--primary">
                  <Zap size={14} style={{ color: "var(--primary, #6366f1)" }} />
                  Billing Periods
                </h3>
                <span className="eb-section__count">{periods.length} period{periods.length !== 1 ? "s" : ""}</span>
              </div>
              {periods.length === 0 ? (
                <p className="eb-empty-hint">No billing periods yet. Open the first period to start tracking.</p>
              ) : (
                <>
                <div className="eb-table-wrap">
                  <table className="eb-table">
                    <colgroup>
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '10%' }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Start Date</th>
                        <th>End Date</th>
                        <th>Start kWh</th>
                        <th>End kWh</th>
                        <th>Rate</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPeriods.map((p) => (
                        <tr
                          key={p.id}
                          className={[
                            selectedPeriodId === p.id ? "eb-row--selected" : "",
                            p.status === "open" ? "eb-row--open" : "",
                          ].join(" ").trim()}
                        >
                          <td><strong>{fmt(p.startDate)}</strong></td>
                          <td className="eb-cell--muted">{p.endDate ? fmt(p.endDate) : "—"}</td>
                          <td>{p.startReading} <span style={{ color: "var(--text-secondary, #9ca3af)", fontSize: "0.75rem" }}>kWh</span></td>
                          <td>{p.endReading != null ? <>{p.endReading} <span style={{ color: "var(--text-secondary, #9ca3af)", fontSize: "0.75rem" }}>kWh</span></> : <span className="eb-cell--muted">—</span>}</td>
                          <td>₱{p.ratePerKwh}</td>
                          <td>
                            <span className={`eb-status-pill eb-status-pill--${p.status}`}>{p.status}</span>
                            {p.revised && <span className="eb-revised-tag">edited</span>}
                          </td>
                          <td className="eb-cell--actions" style={{ whiteSpace: "nowrap" }}>
                            {(p.status === "closed" || p.status === "revised") && (
                              <>
                                <button
                                  className={`eb-btn eb-btn--xs eb-btn--outline${selectedPeriodId === p.id ? " eb-btn--active" : ""}`}
                                  onClick={() => setSelectedPeriodId(selectedPeriodId === p.id ? null : p.id)}
                                >
                                  {selectedPeriodId === p.id ? "Hide" : "View"}
                                </button>
                                <button
                                  className="eb-btn eb-btn--xs eb-btn--ghost"
                                  onClick={() => handleRevise(p.id)}
                                  disabled={reviseResult.isPending}
                                  title="Re-run billing calculation"
                                >
                                  <RefreshCw size={11} />
                                </button>
                                <button
                                  className="eb-btn eb-btn--xs eb-btn--ghost"
                                  title={draftPeriodId === p.id ? "Hide draft bills" : "View draft bills"}
                                  onClick={() => setDraftPeriodId(draftPeriodId === p.id ? null : p.id)}
                                >
                                  <Send size={11} />
                                </button>
                              </>
                            )}
                            <button
                              className="eb-icon-btn eb-icon-btn--danger"
                              title="Delete period"
                              onClick={() => handleDeletePeriod(p.id)}
                              disabled={deletePeriod.isPending}
                            >
                              {deletePeriod.isPending ? "…" : <Trash2 size={13} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={periodsPage}
                  total={totalPeriodPages}
                  onChange={setPeriodsPage}
                  countLabel={`${periods.length} total period${periods.length !== 1 ? 's' : ''}`}
                />
                </>
              )}
            </section>

            {/* ── Meter Reading History ── */}
            <section className="eb-section">
              <div className="eb-section__header">
                <h3 className="eb-section__title">Reading History</h3>
              </div>
              {readings.length === 0 ? (
                <p className="eb-empty-hint">No readings recorded yet.</p>
              ) : (
                <>
                <div className="eb-table-wrap">
                  <table className="eb-table">
                    <colgroup>
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '25%' }} />
                      <col />
                      <col style={{ width: '36px' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Reading</th>
                        <th>Event</th>
                        <th>Tenant</th>
                        <th>Recorded By</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedReadings.map((r) => (
                        <tr key={r.id}>
                          <td>{fmt(r.date)}</td>
                          <td>{r.reading} <span style={{ color: "var(--text-secondary, #9ca3af)", fontSize: "0.75rem" }}>kWh</span></td>
                          <td>
                            <span className={`eb-event-tag eb-event-tag--${r.eventType}`}>
                              {r.eventType === "move-in" ? "Move-In"
                                : r.eventType === "move-out" ? "Move-Out"
                                : "Regular"}
                            </span>
                          </td>
                          <td className="eb-cell--muted">{maskName(r.tenant)}</td>
                          <td className="eb-cell--muted">{r.recordedBy}</td>
                          <td>
                            <button
                              className="eb-icon-btn eb-icon-btn--danger"
                              title="Delete reading"
                              onClick={() => handleDeleteReading(r.id)}
                              disabled={deleteReading.isPending}
                            >
                              {deleteReading.isPending ? "…" : <Trash2 size={13} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={readingsPage}
                  total={totalReadingPages}
                  onChange={setReadingsPage}
                  countLabel={`${readings.length} total reading${readings.length !== 1 ? 's' : ''}`}
                />
                </>
              )}
            </section>

            {/* ── Billing Result ── */}
            {result && selectedPeriodId && (
              <section className="eb-section eb-result">
                <div className="eb-result__header" onClick={() => setExpandedResult(!expandedResult)}>
                  <div className="eb-result__title">
                    <Zap size={15} />
                    <span>Billing Result</span>
                    {result.verified ? (
                      <span className="eb-verified"><Check size={11} /> Verified</span>
                    ) : (
                      <span className="eb-unverified"><AlertTriangle size={11} /> Unverified</span>
                    )}
                  </div>
                  {expandedResult ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {expandedResult && (
                  <>
                    <div className="eb-stats">
                      <div className="eb-stat">
                        <span className="eb-stat__label">Total kWh</span>
                        <span className="eb-stat__value">{result.totalRoomKwh}</span>
                      </div>
                      <div className="eb-stat">
                        <span className="eb-stat__label">Total Cost</span>
                        <span className="eb-stat__value">₱{Number(result.totalRoomCost).toLocaleString()}</span>
                      </div>
                      <div className="eb-stat">
                        <span className="eb-stat__label">Rate</span>
                        <span className="eb-stat__value">₱{result.ratePerKwh}/kWh</span>
                      </div>
                      <div className="eb-stat">
                        <span className="eb-stat__label">Segments</span>
                        <span className="eb-stat__value">{result.segments?.length || 0}</span>
                      </div>
                    </div>

                    <h4 className="eb-subsection-title">Segment Breakdown</h4>
                    <div className="eb-table-wrap">
                      <table className="eb-table">
                        <colgroup>
                          <col style={{ width: '26%' }} />
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '11%' }} />
                          <col style={{ width: '11%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Period</th>
                            <th>From kWh</th>
                            <th>To kWh</th>
                            <th>Consumed</th>
                            <th>Cost</th>
                            <th>Tenants</th>
                            <th>Share kWh</th>
                            <th>Share ₱</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(result.segments || []).map((seg, i) => (
                            <tr key={i}>
                              <td className="eb-cell--muted">{seg.periodLabel}</td>
                              <td className="eb-cell--num">{seg.readingFrom}</td>
                              <td className="eb-cell--num">{seg.readingTo}</td>
                              <td className="eb-cell--num">{seg.kwhConsumed}</td>
                              <td className="eb-cell--num">₱{Number(seg.totalCost).toLocaleString()}</td>
                              <td className="eb-cell--center">{seg.activeTenantCount}</td>
                              <td className="eb-cell--num">{seg.sharePerTenantKwh}</td>
                              <td className="eb-cell--num">₱{Number(seg.sharePerTenantCost).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <h4 className="eb-subsection-title">Tenant Summary</h4>
                    <div className="eb-table-wrap">
                      <table className="eb-table">
                        <colgroup>
                          <col style={{ width: '60%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '20%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Tenant</th>
                            <th>Total kWh</th>
                            <th>Bill Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(result.tenantSummaries || []).map((t, i) => (
                            <tr key={i}>
                              <td>{t.tenantName}</td>
                              <td className="eb-cell--num">{t.totalKwh}</td>
                              <td className="eb-cell--num eb-cell--bold">₱{Number(t.billAmount).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>

    {/* Standard confirm modal */}
    <ConfirmModal
      isOpen={confirmModal.open}
      onClose={() => setConfirmModal(prev => ({ ...prev, open: false }))}
      onConfirm={confirmModal.onConfirm}
      title={confirmModal.title}
      message={confirmModal.message}
      variant={confirmModal.variant || "danger"}
      confirmText={confirmModal.confirmText || "Confirm"}
    />

    {/* Revision note modal (replaces window.prompt) */}
    {reviseModal.open && (
      <div className="eb-modal-overlay" onClick={() => setReviseModal({ open: false, periodId: null })}>
        <div className="eb-modal" onClick={e => e.stopPropagation()}>
          <div className="eb-modal__header">
            <span>Re-run Billing Computation</span>
            <button className="eb-panel__close" onClick={() => setReviseModal({ open: false, periodId: null })}><X size={15} /></button>
          </div>
          <div className="eb-modal__body">
            <p style={{ marginBottom: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              This will re-compute billing for this closed period using the current meter readings. Add a note to explain why.
            </p>
            <div className="eb-field">
              <label>Revision Note (optional)</label>
              <input
                type="text"
                value={revisionNote}
                onChange={e => setRevisionNote(e.target.value)}
                placeholder="e.g. Corrected reading entered on Mar 15"
                autoFocus
              />
            </div>
          </div>
          <div className="eb-modal__footer">
            <button className="eb-btn eb-btn--primary" onClick={handleReviseConfirm} disabled={reviseResult.isPending}>
              <RefreshCw size={13} /> {reviseResult.isPending ? "Re-running…" : "Re-run Computation"}
            </button>
            <button className="eb-btn eb-btn--ghost" onClick={() => setReviseModal({ open: false, periodId: null })}>Cancel</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default ElectricityBillingTab;
