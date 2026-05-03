import React, { useState } from "react";
import {
  useMyMaintenanceRequests,
  useCreateMaintenanceRequest,
} from "../../../../shared/hooks/queries/useMaintenance";
import {
  Wrench,
  Plus,
  X,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
} from "lucide-react";

/* ── Helpers ───────────────────────────────────────── */

const STATUS_MAP = {
  Pending: { color: "#D97706", bg: "#FFFBEB", icon: Clock },
  "In Progress": { color: "#2563EB", bg: "#EFF6FF", icon: Loader2 },
  Completed: { color: "#059669", bg: "#F0FDF4", icon: CheckCircle },
};

const CATEGORIES = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "hardware", label: "Hardware" },
  { value: "appliance", label: "Appliance" },
  { value: "cleaning", label: "Cleaning" },
  { value: "other", label: "Other" },
];

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/* ── Main Component ────────────────────────────────── */

const MaintenanceTab = () => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    category: "other",
    title: "",
    description: "",
  });

  const { data: requestsData, isLoading } = useMyMaintenanceRequests(50);
  const requests = requestsData?.requests || [];
  const createMutation = useCreateMaintenanceRequest();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      setFormData({ category: "other", title: "", description: "" });
      setShowForm(false);
    } catch (error) {
      console.error("Failed to submit maintenance request:", error);
    }
  };

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div style={{ width: "100%" }}>
        <div style={s.heading}>
          <h1 style={s.title}>Maintenance</h1>
          <p style={s.subtitle}>Loading your requests...</p>
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              ...s.card,
              height: 72,
              background: "#F3F4F6",
              animation: "pulse 1.5s ease-in-out infinite",
              marginBottom: 10,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div
        style={{
          ...s.heading,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1 style={s.title}>Maintenance</h1>
          <p style={s.subtitle}>Submit and track your maintenance requests</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            ...s.primaryBtn,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "New Request"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={s.formCard}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-heading)",
              margin: "0 0 16px",
            }}
          >
            Submit a Request
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Category</label>
              <div style={{ position: "relative" }}>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  required
                  style={s.select}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    color: "#9CA3AF",
                  }}
                />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Title</label>
              <input
                type="text"
                placeholder="Brief description of the issue"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
                style={s.input}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={s.label}>Description</label>
              <textarea
                rows={4}
                placeholder="Detailed description of what needs fixing..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                required
                style={{ ...s.input, resize: "vertical", minHeight: 90 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={s.ghostBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                style={{
                  ...s.primaryBtn,
                  opacity: createMutation.isPending ? 0.6 : 1,
                }}
              >
                {createMutation.isPending ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stats */}
      {requests.length > 0 && (
        <div style={s.statsRow}>
          <div style={s.statCard}>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>
              Total
            </span>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text-heading)",
              }}
            >
              {requests.length}
            </span>
          </div>
          <div style={s.statCard}>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>
              Pending
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#D97706" }}>
              {requests.filter((r) => r.status === "Pending").length}
            </span>
          </div>
          <div style={s.statCard}>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>
              Completed
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#059669" }}>
              {requests.filter((r) => r.status === "Completed").length}
            </span>
          </div>
        </div>
      )}

      {/* List */}
      {requests.length === 0 ? (
        <div style={s.emptyState}>
          <Wrench size={48} color="#D1D5DB" />
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#374151",
              margin: "16px 0 8px",
            }}
          >
            No maintenance requests
          </h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 280 }}>
            Submit a request when something in your room needs attention.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {requests.map((req) => {
            const status = STATUS_MAP[req.status] || STATUS_MAP.Pending;
            const StatusIcon = status.icon;
            return (
              <div key={req.id || req._id} style={s.card}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-heading)",
                      marginBottom: 4,
                    }}
                  >
                    {req.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                    {req.category} • {fmtDate(req.date || req.createdAt)}
                  </div>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 12px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    background: status.bg,
                    color: status.color,
                    flexShrink: 0,
                  }}
                >
                  <StatusIcon size={12} />
                  {req.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── Styles ─────────────────────────────────────────── */
const s = {
  heading: { marginBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text-heading)",
    margin: 0,
  },
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 },

  primaryBtn: {
    padding: "8px 16px",
    background: "#FF8C42",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  ghostBtn: {
    padding: "8px 16px",
    background: "none",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-card)",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },

  formCard: {
    background: "var(--surface-card)",
    border: "1px solid var(--border-card)",
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid var(--border-card)",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--text-heading)",
    background: "var(--surface-page)",
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color 0.15s",
    fontFamily: "inherit",
  },
  select: {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid var(--border-card)",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--text-heading)",
    background: "var(--surface-page)",
    boxSizing: "border-box",
    appearance: "none",
    outline: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    background: "var(--surface-card)",
    borderRadius: 10,
    border: "1px solid var(--border-card)",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  card: {
    display: "flex",
    alignItems: "center",
    padding: "14px 18px",
    background: "var(--surface-card)",
    border: "1px solid var(--border-card)",
    borderRadius: 10,
    gap: 14,
  },

  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "56px 24px",
    background: "var(--surface-card)",
    borderRadius: 10,
    border: "1px solid var(--border-card)",
  },
};

export default MaintenanceTab;
