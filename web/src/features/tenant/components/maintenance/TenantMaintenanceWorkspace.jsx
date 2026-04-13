import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Plus,
  Wrench,
} from "lucide-react";
import {
  useCreateMaintenanceRequest,
  useMyMaintenanceRequests,
} from "../../../../shared/hooks/queries/useMaintenance";
import { showNotification } from "../../../../shared/utils/notification";
import {
  MAINTENANCE_REQUEST_TYPES,
  MAINTENANCE_URGENCY_LEVELS,
  formatMaintenanceStatus,
  getMaintenanceStatusMeta,
  getMaintenanceTypeMeta,
  getMaintenanceUrgencyMeta,
} from "../../../../shared/utils/maintenanceConfig";
import "../../styles/tenant-common.css";

const fmtDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function TenantMaintenanceWorkspace({ embedded = false }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    request_type: "other",
    urgency: "normal",
    description: "",
  });

  const { data, isLoading } = useMyMaintenanceRequests({ limit: 50 });
  const createMutation = useCreateMaintenanceRequest();
  const requests = data?.requests || [];

  const summary = useMemo(
    () => ({
      total: requests.length,
      active: requests.filter((request) =>
        ["pending", "viewed", "in_progress"].includes(request.status),
      ).length,
      resolved: requests.filter((request) =>
        ["resolved", "completed"].includes(request.status),
      ).length,
    }),
    [requests],
  );

  const handleSubmitRequest = async (event) => {
    event.preventDefault();

    try {
      await createMutation.mutateAsync(formData);
      setFormData({
        request_type: "other",
        urgency: "normal",
        description: "",
      });
      setShowForm(false);
      showNotification("Maintenance request submitted.", "success");
    } catch (error) {
      showNotification(
        error.message || "Failed to submit maintenance request.",
        "error",
      );
    }
  };

  return (
    <div className={embedded ? "" : "tenant-page"}>
      <div className="page-header">
        <div>
          <h1>
            <Wrench size={22} /> Maintenance Requests
          </h1>
          <p>
            Report issues, check request progress, and review admin responses
            from one place.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowForm((current) => !current)}
        >
          <Plus size={16} />
          {showForm ? "Close Form" : "New Request"}
        </button>
      </div>

      {showForm ? (
        <div className="section-card">
          <h2>Submit Maintenance Request</h2>
          <form className="maintenance-form" onSubmit={handleSubmitRequest}>
            <div className="form-group">
              <label htmlFor="maintenance-type">Request Type</label>
              <select
                id="maintenance-type"
                className="form-control"
                value={formData.request_type}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    request_type: event.target.value,
                  }))
                }
                required
              >
                {MAINTENANCE_REQUEST_TYPES.map((requestType) => (
                  <option key={requestType} value={requestType}>
                    {getMaintenanceTypeMeta(requestType).label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="maintenance-urgency">Urgency</label>
              <select
                id="maintenance-urgency"
                className="form-control"
                value={formData.urgency}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    urgency: event.target.value,
                  }))
                }
                required
              >
                {MAINTENANCE_URGENCY_LEVELS.map((urgency) => {
                  const meta = getMaintenanceUrgencyMeta(urgency);
                  return (
                    <option key={urgency} value={urgency}>
                      {meta.label} - {meta.description}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="maintenance-description">Description</label>
              <textarea
                id="maintenance-description"
                className="form-control"
                rows="5"
                placeholder="Describe the problem in detail."
                value={formData.description}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {requests.length > 0 ? (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <h2>Overview</h2>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            }}
          >
            {[
              { label: "Total Requests", value: summary.total },
              { label: "Active", value: summary.active },
              { label: "Resolved", value: summary.resolved },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#64748B",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {item.label}
                </div>
                <strong style={{ fontSize: 22, color: "#0F172A" }}>
                  {item.value}
                </strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section-card">
        <h2>Request History</h2>
        {isLoading ? (
          <p>Loading maintenance requests...</p>
        ) : requests.length === 0 ? (
          <div className="maintenance-empty-state">
            <ClipboardList size={30} />
            <div>
              <strong>No maintenance requests yet</strong>
              <p>
                Use the new request button when you need help with repairs,
                utilities, or room concerns.
              </p>
            </div>
          </div>
        ) : (
          <div className="maintenance-list">
            {requests.map((request) => {
              const typeMeta = getMaintenanceTypeMeta(request.request_type);
              const urgencyMeta = getMaintenanceUrgencyMeta(request.urgency);
              const statusMeta = getMaintenanceStatusMeta(request.status);
              const TypeIcon = typeMeta.icon;

              return (
                <article
                  key={request.request_id}
                  className="maintenance-item"
                  style={{ flexDirection: "column", alignItems: "stretch" }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 14,
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ display: "flex", gap: 12 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          background: `${typeMeta.color}1A`,
                          color: typeMeta.color,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <TypeIcon size={18} />
                      </div>
                      <div>
                        <h3 style={{ margin: "0 0 4px" }}>{typeMeta.label}</h3>
                        <p style={{ margin: 0, color: "#64748B" }}>
                          {fmtDate(request.created_at)} • {urgencyMeta.label}
                        </p>
                      </div>
                    </div>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 999,
                        background: statusMeta.bg,
                        color: statusMeta.color,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {formatMaintenanceStatus(request.status)}
                    </span>
                  </div>

                  <p style={{ margin: "14px 0 0", color: "#334155" }}>
                    {request.description}
                  </p>

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      color: "#64748B",
                      fontSize: 13,
                    }}
                  >
                    <span>ETA: {urgencyMeta.estimate}</span>
                    <span>Attachments: {request.attachments?.length || 0}</span>
                    {request.reopen_note ? (
                      <span>Reopen note saved</span>
                    ) : null}
                  </div>

                  {request.notes ? (
                    <div
                      style={{
                        marginTop: 14,
                        borderRadius: 12,
                        padding: "12px 14px",
                        background: "#FEF3C7",
                        color: "#92400E",
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <strong style={{ display: "block", marginBottom: 4 }}>
                          Admin Response
                        </strong>
                        <span>{request.notes}</span>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
