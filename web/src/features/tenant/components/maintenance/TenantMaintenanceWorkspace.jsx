import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Clock3,
    Edit3,
    LoaderCircle,
    Paperclip,
    Plus,
    RefreshCcw,
    RotateCcw,
    Search,
    Trash2,
    Wrench,
    X,
    XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
    useCancelMaintenanceRequest,
    useCreateMaintenanceRequest,
    useMyMaintenanceRequests,
    useReopenMaintenanceRequest,
    useUpdateMyMaintenanceRequest,
} from "../../../../shared/hooks/queries/useMaintenance";
import { uploadToImageKit } from "../../../../shared/utils/imageUpload";
import {
    ACTIVE_MAINTENANCE_STATUSES,
    MAINTENANCE_REQUEST_TYPES,
    MAINTENANCE_URGENCY_LEVELS,
    MIN_MAINTENANCE_DESCRIPTION_LENGTH,
    REOPENABLE_MAINTENANCE_STATUSES,
    RESOLVED_MAINTENANCE_STATUSES,
    formatMaintenanceStatus,
    getMaintenanceStatusMeta,
    getMaintenanceTypeMeta,
    getMaintenanceUrgencyMeta,
} from "../../../../shared/utils/maintenanceConfig";
import { showNotification } from "../../../../shared/utils/notification";
import "../../styles/tenant-common.css";

const initialFormData = {
  request_type: "",
  urgency: "normal",
  description: "",
  attachments: [],
};

const fmtDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const fmtDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatSlaLabel = (slaState) => {
  if (!slaState) return "No SLA";
  if (slaState.label === "delayed") return "Delayed";
  if (slaState.label === "priority") return "Priority";
  if (slaState.label === "closed") return "Closed";
  return "On Track";
};

const validateRequestForm = (formData) => {
  const errors = {};
  if (!formData.request_type) {
    errors.request_type = "Please select a request type.";
  }
  if (
    String(formData.description || "").trim().length <
    MIN_MAINTENANCE_DESCRIPTION_LENGTH
  ) {
    errors.description = `Description must be at least ${MIN_MAINTENANCE_DESCRIPTION_LENGTH} characters.`;
  }
  return errors;
};

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

export default function TenantMaintenanceWorkspace({ embedded = false }) {
  const [showForm, setShowForm] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [formTouched, setFormTouched] = useState(false);
  const [banner, setBanner] = useState(null);
  const [activeTab, setActiveTab] = useState("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(initialFormData);
  const [editTouched, setEditTouched] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [reopenNote, setReopenNote] = useState("");
  const [pendingSimilarRequest, setPendingSimilarRequest] = useState(null);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useMyMaintenanceRequests({ limit: 50 });
  const createMutation = useCreateMaintenanceRequest();
  const updateMutation = useUpdateMyMaintenanceRequest();
  const cancelMutation = useCancelMaintenanceRequest();
  const reopenMutation = useReopenMaintenanceRequest();
  const requests = data?.requests || [];

  const createErrors = useMemo(() => validateRequestForm(formData), [formData]);
  const editErrors = useMemo(() => validateRequestForm(editData), [editData]);
  const createIsValid = Object.keys(createErrors).length === 0;
  const editIsValid = Object.keys(editErrors).length === 0;
  const formIsDirty =
    Boolean(formData.request_type) ||
    formData.description.trim().length > 0 ||
    formData.attachments.length > 0;

  const showBanner = (type, message) => {
    setBanner({ type, message });
    showNotification(message, type === "error" ? "error" : type);
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setFormTouched(false);
  };

  const openCreateForm = (prefill = null) => {
    setFormData(
      prefill
        ? {
            request_type: prefill.request_type || "",
            urgency: prefill.urgency || "normal",
            description: prefill.description || "",
            attachments: [],
          }
        : initialFormData,
    );
    setFormTouched(false);
    setShowForm(true);
  };

  const closeCreateForm = () => {
    if (formIsDirty) {
      setPendingConfirm({ type: "discard-create" });
      return;
    }
    setShowForm(false);
    resetForm();
  };

  const handleAttachmentUpload = async (event) => {
    const files = Array.from(event.target.files || []).filter(Boolean);
    if (files.length === 0) return;

    setUploadingAttachment(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const uri = await uploadToImageKit(file);
        uploaded.push({
          name: file.name,
          uri,
          type: file.type || "application/octet-stream",
        });
      }

      setFormData((current) => ({
        ...current,
        attachments: [...(current.attachments || []), ...uploaded],
      }));
      showBanner("success", "Attachment uploaded.");
    } catch (error) {
      showBanner("error", getErrorMessage(error, "Failed to upload attachment."));
    } finally {
      setUploadingAttachment(false);
      event.target.value = "";
    }
  };

  const handleRemoveAttachment = (uri) => {
    setFormData((current) => ({
      ...current,
      attachments: (current.attachments || []).filter((entry) => entry.uri !== uri),
    }));
  };

  const handleSubmitRequest = async (event) => {
    event.preventDefault();
    setFormTouched(true);
    if (!createIsValid) {
      showBanner("warning", "Please complete the required fields before submitting.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        ...formData,
        description: formData.description.trim(),
      });
      resetForm();
      setShowForm(false);
      showBanner("success", "Maintenance request submitted.");
    } catch (error) {
      const duplicateRequest = error?.response?.data?.request;
      if (error?.response?.data?.code === "DUPLICATE_REQUEST" && duplicateRequest) {
        showBanner("warning", "A similar request is already open. Reviewing that request instead.");
        setShowForm(false);
        setSelectedRequest(duplicateRequest);
        setActiveTab("active");
        return;
      }
      showBanner(
        "error",
        getErrorMessage(error, "Failed to submit maintenance request."),
      );
    }
  };

  const openDetail = (request) => {
    setSelectedRequest(request);
    setEditMode(false);
    setEditTouched(false);
    setReopenNote("");
  };

  const closeDetail = () => {
    if (editMode && editTouched) {
      setPendingConfirm({ type: "discard-edit", closeAfter: true });
      return;
    }
    setSelectedRequest(null);
    setEditMode(false);
    setEditTouched(false);
    setReopenNote("");
  };

  const startEdit = () => {
    if (!selectedRequest || selectedRequest.status !== "pending") return;
    setEditData({
      request_type: selectedRequest.request_type || "",
      urgency: selectedRequest.urgency || "normal",
      description: selectedRequest.description || "",
      attachments: selectedRequest.attachments || [],
    });
    setEditTouched(false);
    setEditMode(true);
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    setEditTouched(true);
    if (!selectedRequest || selectedRequest.status !== "pending") return;
    if (!editIsValid) {
      showBanner("warning", "Please complete the required fields before saving.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        requestId: selectedRequest.request_id,
        data: {
          request_type: editData.request_type,
          urgency: editData.urgency,
          description: editData.description.trim(),
          attachments: editData.attachments,
        },
      });
      showBanner("success", "Maintenance request updated.");
      setSelectedRequest(null);
      setEditMode(false);
    } catch (error) {
      showBanner(
        "error",
        getErrorMessage(error, "Failed to update maintenance request."),
      );
    }
  };

  const confirmCancelRequest = async () => {
    if (!selectedRequest || selectedRequest.status !== "pending") return;
    try {
      await cancelMutation.mutateAsync(selectedRequest.request_id);
      showBanner("success", "Maintenance request cancelled.");
      setPendingConfirm(null);
      setSelectedRequest(null);
    } catch (error) {
      showBanner(
        "error",
        getErrorMessage(error, "Failed to cancel maintenance request."),
      );
    }
  };

  const confirmReopenRequest = async () => {
    if (
      !selectedRequest ||
      !REOPENABLE_MAINTENANCE_STATUSES.includes(selectedRequest.status)
    ) {
      return;
    }

    try {
      await reopenMutation.mutateAsync({
        requestId: selectedRequest.request_id,
        note: reopenNote.trim() || undefined,
      });
      showBanner("success", "Maintenance request reopened.");
      setPendingConfirm(null);
      setSelectedRequest(null);
      setReopenNote("");
      setActiveTab("active");
    } catch (error) {
      showBanner(
        "error",
        getErrorMessage(error, "Failed to reopen maintenance request."),
      );
    }
  };

  const submitSimilar = () => {
    if (!selectedRequest) return;
    if (formIsDirty) {
      setPendingSimilarRequest(selectedRequest);
      setPendingConfirm({ type: "discard-similar" });
      return;
    }
    openCreateForm(selectedRequest);
    setSelectedRequest(null);
  };

  const searchedRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter((request) => {
      const typeLabel = getMaintenanceTypeMeta(request.request_type).label;
      return [
        request.request_id,
        request.description,
        request.status,
        typeLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [requests, searchQuery]);

  const groupedRequests = useMemo(
    () => ({
      active: searchedRequests.filter((request) =>
        ACTIVE_MAINTENANCE_STATUSES.includes(request.status),
      ),
      resolved: searchedRequests.filter((request) =>
        RESOLVED_MAINTENANCE_STATUSES.includes(request.status),
      ),
      cancelled: searchedRequests.filter((request) => request.status === "cancelled"),
    }),
    [searchedRequests],
  );

  const currentRequests = groupedRequests[activeTab] || groupedRequests.active;

  const summary = useMemo(
    () => ({
      total: requests.length,
      active: requests.filter((request) =>
        ACTIVE_MAINTENANCE_STATUSES.includes(request.status),
      ).length,
      resolved: requests.filter((request) =>
        RESOLVED_MAINTENANCE_STATUSES.includes(request.status),
      ).length,
    }),
    [requests],
  );

  const renderRequestForm = ({
    idPrefix,
    data: requestData,
    errors,
    touched,
    isSubmitting,
    onSubmit,
    onCancel,
    setData,
    submitLabel,
  }) => (
    <form className="maintenance-form" onSubmit={onSubmit}>
      <div className={`form-group ${touched && errors.request_type ? "has-error" : ""}`}>
        <label htmlFor={`${idPrefix}-type`}>Request Type</label>
        <select
          id={`${idPrefix}-type`}
          className="form-control"
          value={requestData.request_type}
          onChange={(event) => {
            if (idPrefix === "edit") {
              setEditTouched(true);
            } else {
              setFormTouched(true);
            }
            setData((current) => ({
              ...current,
              request_type: event.target.value,
            }));
          }}
          onBlur={() => (idPrefix === "edit" ? setEditTouched(true) : setFormTouched(true))}
        >
          <option value="">Select request type</option>
          {MAINTENANCE_REQUEST_TYPES.map((requestType) => (
            <option key={requestType} value={requestType}>
              {getMaintenanceTypeMeta(requestType).label}
            </option>
          ))}
        </select>
        {touched && errors.request_type ? (
          <p className="maintenance-field-error">{errors.request_type}</p>
        ) : null}
      </div>

      <div className="form-group">
        <label htmlFor={`${idPrefix}-urgency`}>Urgency</label>
        <select
          id={`${idPrefix}-urgency`}
          className="form-control"
          value={requestData.urgency}
          onChange={(event) =>
            setData((current) => ({
              ...current,
              urgency: event.target.value,
            }))
          }
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

      <div className={`form-group ${touched && errors.description ? "has-error" : ""}`}>
        <label htmlFor={`${idPrefix}-description`}>Description</label>
        <textarea
          id={`${idPrefix}-description`}
          className="form-control"
          rows="5"
          placeholder="Describe the problem in detail."
          value={requestData.description}
          onChange={(event) => {
            if (idPrefix === "edit") {
              setEditTouched(true);
            } else {
              setFormTouched(true);
            }
            setData((current) => ({
              ...current,
              description: event.target.value,
            }));
          }}
          onBlur={() => (idPrefix === "edit" ? setEditTouched(true) : setFormTouched(true))}
        />
        {touched && errors.description ? (
          <p className="maintenance-field-error">{errors.description}</p>
        ) : null}
      </div>

      {idPrefix === "create" ? (
        <div className="form-group">
          <label htmlFor="maintenance-attachments">Attachments</label>
          <label
            htmlFor="maintenance-attachments"
            className="btn btn-secondary"
            style={{
              width: "fit-content",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {uploadingAttachment ? (
              <LoaderCircle size={16} className="admin-announcements-spin" />
            ) : (
              <Paperclip size={16} />
            )}
            {uploadingAttachment ? "Uploading..." : "Upload photo or file"}
          </label>
          <input
            id="maintenance-attachments"
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={handleAttachmentUpload}
          />
          {requestData.attachments?.length ? (
            <div className="maintenance-attachment-list">
              {requestData.attachments.map((attachment) => (
                <div key={attachment.uri} className="maintenance-attachment-row">
                  <span>{attachment.name}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleRemoveAttachment(attachment.uri)}
                    style={{ padding: "6px 10px" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="maintenance-help-text">
              Attach photos of leaks, broken beds, damaged fixtures, or related proof.
            </p>
          )}
        </div>
      ) : null}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={
            isSubmitting ||
            uploadingAttachment ||
            (idPrefix === "create" ? !createIsValid : !editIsValid)
          }
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );

  const emptyCopy = {
    active: {
      icon: Clock3,
      title: "No active requests",
      text: "You have no pending or in-progress requests.",
    },
    resolved: {
      icon: CheckCircle2,
      title: "No resolved requests",
      text: "Resolved, completed, or rejected requests will appear here.",
    },
    cancelled: {
      icon: XCircle,
      title: "No cancelled requests",
      text: "You have not cancelled any maintenance requests.",
    },
  }[activeTab];
  const EmptyIcon = emptyCopy.icon;

  return (
    <div className={embedded ? "" : "tenant-page"}>
      <div className="page-header">
        <div>
          <h1>
            <Wrench size={22} /> Maintenance Requests
          </h1>
          <p>
            Report repair, room, or bed concerns, check request progress, and
            review admin responses from one place.
          </p>
        </div>
        <div className="maintenance-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCcw size={16} className={isFetching ? "admin-announcements-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (showForm ? closeCreateForm() : openCreateForm())}
          >
            <Plus size={16} />
            {showForm ? "Close Form" : "New Request"}
          </button>
        </div>
      </div>

      {banner ? (
        <div className={`maintenance-banner maintenance-banner--${banner.type}`}>
          <span>{banner.message}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ) : null}

      {showForm ? (
        <div className="section-card">
          <h2>Submit Maintenance Request</h2>
          {renderRequestForm({
            idPrefix: "create",
            data: formData,
            errors: createErrors,
            touched: formTouched,
            isSubmitting: createMutation.isPending,
            onSubmit: handleSubmitRequest,
            onCancel: closeCreateForm,
            setData: setFormData,
            submitLabel: "Submit Request",
          })}
        </div>
      ) : null}

      {requests.length > 0 ? (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <h2>Overview</h2>
          <div className="maintenance-summary-grid">
            {[
              { label: "Total Requests", value: summary.total },
              { label: "Active", value: summary.active },
              { label: "Resolved", value: summary.resolved },
            ].map((item) => (
              <div key={item.label} className="maintenance-summary-card">
                <div>{item.label}</div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section-card">
        <div className="maintenance-history-header">
          <h2>Request History</h2>
          <label className="maintenance-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="maintenance-tabs">
          {[
            { key: "active", label: "Active", count: groupedRequests.active.length },
            { key: "resolved", label: "Resolved", count: groupedRequests.resolved.length },
            { key: "cancelled", label: "Cancelled", count: groupedRequests.cancelled.length },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "active" : ""}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="maintenance-empty-state">
            <LoaderCircle size={24} className="admin-announcements-spin" />
            <div>
              <strong>Loading maintenance requests</strong>
              <p>Please wait while your request history is refreshed.</p>
            </div>
          </div>
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
        ) : currentRequests.length === 0 ? (
          <div className="maintenance-empty-state">
            <EmptyIcon size={30} />
            <div>
              <strong>{emptyCopy.title}</strong>
              <p>{emptyCopy.text}</p>
            </div>
          </div>
        ) : (
          <div className="maintenance-list">
            {currentRequests.map((request) => {
              const typeMeta = getMaintenanceTypeMeta(request.request_type);
              const urgencyMeta = getMaintenanceUrgencyMeta(request.urgency);
              const statusMeta = getMaintenanceStatusMeta(request.status);
              const TypeIcon = typeMeta.icon;

              return (
                <article
                  key={request.request_id}
                  className="maintenance-item maintenance-item--clickable"
                  onClick={() => openDetail(request)}
                >
                  <div className="maintenance-card-topline">
                    <div className="maintenance-card-title">
                      <div
                        className="maintenance-type-icon"
                        style={{
                          background: `${typeMeta.color}1A`,
                          color: typeMeta.color,
                        }}
                      >
                        <TypeIcon size={18} />
                      </div>
                      <div>
                        <h3>{typeMeta.label}</h3>
                        <p>
                          {fmtDate(request.created_at)} • {urgencyMeta.label}
                        </p>
                      </div>
                    </div>

                    <span
                      className="maintenance-status-pill"
                      style={{ background: statusMeta.bg, color: statusMeta.color }}
                    >
                      {formatMaintenanceStatus(request.status)}
                    </span>
                  </div>

                  <p className="maintenance-description-preview">
                    {request.description}
                  </p>

                  <div className="maintenance-card-meta">
                    <span>ETA: {urgencyMeta.estimate}</span>
                    <span>SLA: {formatSlaLabel(request.slaState)}</span>
                    <span>Attachments: {request.attachments?.length || 0}</span>
                    {request.notes ? <span>Admin response available</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {selectedRequest ? (
        <div className="maintenance-modal-backdrop" role="presentation">
          <div className="maintenance-modal" role="dialog" aria-modal="true">
            <div className="maintenance-modal__header">
              <div>
                <h2>{editMode ? "Edit Request" : "Request Details"}</h2>
                <p>{selectedRequest.request_id}</p>
              </div>
              <button type="button" onClick={closeDetail} aria-label="Close details">
                <X size={18} />
              </button>
            </div>

            {editMode ? (
              renderRequestForm({
                idPrefix: "edit",
                data: editData,
                errors: editErrors,
                touched: editTouched,
                isSubmitting: updateMutation.isPending,
                onSubmit: saveEdit,
                onCancel: () =>
                  editTouched
                    ? setPendingConfirm({ type: "discard-edit" })
                    : setEditMode(false),
                setData: (updater) => {
                  setEditTouched(true);
                  setEditData(updater);
                },
                submitLabel: "Save Changes",
              })
            ) : (
              <>
                <div className="maintenance-detail-grid">
                  <div>
                    <span>Type</span>
                    <strong>
                      {getMaintenanceTypeMeta(selectedRequest.request_type).label}
                    </strong>
                  </div>
                  <div>
                    <span>Urgency</span>
                    <strong>
                      {getMaintenanceUrgencyMeta(selectedRequest.urgency).label}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{formatMaintenanceStatus(selectedRequest.status)}</strong>
                  </div>
                  <div>
                    <span>SLA</span>
                    <strong>{formatSlaLabel(selectedRequest.slaState)}</strong>
                  </div>
                </div>

                <section className="maintenance-detail-section">
                  <h3>Description</h3>
                  <p>{selectedRequest.description}</p>
                </section>

                {selectedRequest.notes ? (
                  <section className="maintenance-detail-callout">
                    <AlertTriangle size={16} />
                    <div>
                      <h3>Admin Response</h3>
                      <p>{selectedRequest.notes}</p>
                    </div>
                  </section>
                ) : null}

                {selectedRequest.reopen_note ? (
                  <section className="maintenance-detail-callout maintenance-detail-callout--info">
                    <RotateCcw size={16} />
                    <div>
                      <h3>Reopen Note</h3>
                      <p>{selectedRequest.reopen_note}</p>
                    </div>
                  </section>
                ) : null}

                <section className="maintenance-detail-section">
                  <h3>Attachments</h3>
                  {selectedRequest.attachments?.length ? (
                    <div className="maintenance-detail-links">
                      {selectedRequest.attachments.map((attachment, index) => (
                        <a
                          key={`${attachment.uri}-${index}`}
                          href={attachment.uri}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Paperclip size={14} />
                          {attachment.name || `Attachment ${index + 1}`}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p>No attachments uploaded.</p>
                  )}
                </section>

                <section className="maintenance-detail-section">
                  <h3>Timeline</h3>
                  {selectedRequest.statusHistory?.length ? (
                    <div className="maintenance-timeline">
                      {selectedRequest.statusHistory.map((entry, index) => (
                        <article key={`${entry.timestamp}-${entry.status}-${index}`}>
                          <strong>{fmtDateTime(entry.timestamp)}</strong>
                          <span>
                            {formatMaintenanceStatus(entry.status)}
                            {entry.actor_name ? ` • ${entry.actor_name}` : ""}
                          </span>
                          <p>{entry.note || entry.event || "Status updated."}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>No timeline entries recorded yet.</p>
                  )}
                </section>

                {selectedRequest.reopen_history?.length ? (
                  <section className="maintenance-detail-section">
                    <h3>Reopen History</h3>
                    <div className="maintenance-timeline">
                      {selectedRequest.reopen_history.map((entry, index) => (
                        <article key={`${entry.reopened_at}-${index}`}>
                          <strong>{fmtDateTime(entry.reopened_at)}</strong>
                          <span>
                            Reopened from {formatMaintenanceStatus(entry.previous_status)}
                          </span>
                          <p>{entry.note || "No reopen note provided."}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="maintenance-detail-actions">
                  {selectedRequest.status === "pending" ? (
                    <>
                      <button type="button" className="btn btn-primary" onClick={startEdit}>
                        <Edit3 size={15} />
                        Edit Request
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary maintenance-danger-button"
                        onClick={() => setPendingConfirm({ type: "cancel-request" })}
                      >
                        <XCircle size={15} />
                        Cancel Request
                      </button>
                    </>
                  ) : null}
                  {REOPENABLE_MAINTENANCE_STATUSES.includes(selectedRequest.status) ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setPendingConfirm({ type: "reopen-request" })}
                    >
                      <RotateCcw size={15} />
                      Reopen Request
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-secondary" onClick={submitSimilar}>
                    <Plus size={15} />
                    Submit Similar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {pendingConfirm ? (
        <div className="maintenance-modal-backdrop" role="presentation">
          <div className="maintenance-confirm" role="dialog" aria-modal="true">
            {pendingConfirm.type === "reopen-request" ? (
              <>
                <h2>Reopen this request?</h2>
                <p>The request will return to pending so the team can review it again.</p>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Add a note (optional)"
                  value={reopenNote}
                  onChange={(event) => setReopenNote(event.target.value)}
                />
              </>
            ) : pendingConfirm.type === "cancel-request" ? (
              <>
                <h2>Cancel this request?</h2>
                <p>This action will cancel your pending maintenance request.</p>
              </>
            ) : pendingConfirm.type === "discard-similar" ? (
              <>
                <h2>Replace current draft?</h2>
                <p>Your unsaved request draft will be replaced with details from this request.</p>
              </>
            ) : (
              <>
                <h2>Discard changes?</h2>
                <p>Your current selections and description will be lost.</p>
              </>
            )}
            <div className="maintenance-confirm__actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPendingConfirm(null)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={cancelMutation.isPending || reopenMutation.isPending}
                onClick={() => {
                  if (pendingConfirm.type === "cancel-request") {
                    confirmCancelRequest();
                    return;
                  }
                  if (pendingConfirm.type === "reopen-request") {
                    confirmReopenRequest();
                    return;
                  }
                  if (pendingConfirm.type === "discard-edit") {
                    setEditMode(false);
                    setEditTouched(false);
                    if (pendingConfirm.closeAfter) {
                      setSelectedRequest(null);
                    }
                    setPendingConfirm(null);
                    return;
                  }
                  if (pendingConfirm.type === "discard-similar") {
                    if (pendingSimilarRequest) {
                      openCreateForm(pendingSimilarRequest);
                    }
                    setPendingSimilarRequest(null);
                    setSelectedRequest(null);
                    setPendingConfirm(null);
                    return;
                  }
                  setShowForm(false);
                  resetForm();
                  setPendingConfirm(null);
                }}
              >
                {cancelMutation.isPending || reopenMutation.isPending
                  ? "Working..."
                  : pendingConfirm.type === "cancel-request"
                    ? "Cancel Request"
                    : pendingConfirm.type === "reopen-request"
                      ? "Reopen"
                      : pendingConfirm.type === "discard-similar"
                        ? "Replace Draft"
                      : "Discard"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
