import { useState } from "react";
import { inquiryApi } from "../../../shared/api/apiClient";
import useBodyScrollLock from "../../../shared/hooks/useBodyScrollLock";
import "../styles/inquiry-details-modal.css";

export default function InquiryDetailsModal({ inquiry, onClose, onUpdate }) {
  const [response, setResponse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useBodyScrollLock(!!inquiry);

  if (!inquiry) return null;

  const handleSubmitResponse = async (e) => {
    e.preventDefault();
    if (!response.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await inquiryApi.respond(inquiry._id, response);
      setSuccess(true);
      setResponse("");

      setTimeout(() => {
        if (onUpdate) onUpdate();
      }, 1500);
    } catch (err) {
      console.error(err);
      setError("Failed to send response. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="inquiry-details-modal-overlay" onClick={onClose}>
      <div
        className="inquiry-details-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="inquiry-details-modal-header">
          <h2 className="inquiry-details-modal-title">Inquiry Details</h2>
          <button
            className="inquiry-details-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Tabs / Status */}
        <div className="inquiry-details-modal-tabs">
          <span className="inquiry-details-modal-tab-pill">General</span>
          <span
            className={`inquiry-details-modal-status-badge ${inquiry.status}`}
          >
            {inquiry.status === "resolved" ? "Responded" : inquiry.status === "in-progress" ? "In Progress" : inquiry.status}
          </span>
        </div>

        {/* Content */}
        <div className="inquiry-details-modal-content">
          {/* Alerts */}
          {success && (
            <div className="inquiry-details-modal-success">
              Response sent successfully!
            </div>
          )}
          {error && (
            <div className="inquiry-details-modal-error">{error}</div>
          )}

          {/* =====================
              Inquiry Information
          ====================== */}
          <div className="inquiry-details-modal-card">
            <div className="inquiry-details-modal-card-header">
              <h3 className="inquiry-details-modal-card-title">
                Inquiry Information
              </h3>
            </div>

            <div className="inquiry-details-modal-form-group">
              <label className="inquiry-details-modal-label">Name</label>
              <p className="inquiry-details-modal-value">{inquiry.name}</p>
            </div>

            <div className="inquiry-details-modal-form-group">
              <label className="inquiry-details-modal-label">Email</label>
              <p className="inquiry-details-modal-value">{inquiry.email}</p>
            </div>

            <div className="inquiry-details-modal-form-group">
              <label className="inquiry-details-modal-label">Phone</label>
              <p className="inquiry-details-modal-value">
                {inquiry.phone || "N/A"}
              </p>
            </div>

            <div className="inquiry-details-modal-form-group">
              <label className="inquiry-details-modal-label">Branch</label>
              <p className="inquiry-details-modal-value">{inquiry.branch}</p>
            </div>

            <div className="inquiry-details-modal-form-group">
              <label className="inquiry-details-modal-label">Subject</label>
              <p className="inquiry-details-modal-value">
                {inquiry.subject || "General Inquiry"}
              </p>
            </div>

            <div className="inquiry-details-modal-form-group">
              <label className="inquiry-details-modal-label">
                Date & Time
              </label>
              <p className="inquiry-details-modal-value">
                {formatDateTime(inquiry.createdAt)}
              </p>
            </div>
          </div>

          {/* =====================
              Message
          ====================== */}
          <div className="inquiry-details-modal-card">
            <div className="inquiry-details-modal-card-header">
              <h3 className="inquiry-details-modal-card-title">Message</h3>
            </div>

            <div className="inquiry-details-modal-message-box">
              <p className="inquiry-details-modal-message-text">
                {inquiry.message || "No message provided."}
              </p>
            </div>
          </div>

          {/* =====================
              Previous Response
          ====================== */}
          {inquiry.response && (
            <div className="inquiry-details-modal-card">
              <div className="inquiry-details-modal-card-header">
                <h3 className="inquiry-details-modal-card-title">
                  Previous Response
                </h3>
              </div>

              <div className="inquiry-details-modal-previous-response">
                <p className="inquiry-details-modal-message-text">
                  {inquiry.response}
                </p>
                <p className="inquiry-details-modal-responded-by">
                  Responded on {formatDateTime(inquiry.respondedAt)}
                </p>
              </div>
            </div>
          )}

          {/* =====================
              Send Response
          ====================== */}
          {inquiry.status !== "resolved" && (
            <div className="inquiry-details-modal-response-section">
              <h3 className="inquiry-details-modal-response-title">
                Send Response
              </h3>

              <form
                onSubmit={handleSubmitResponse}
                className="inquiry-details-modal-response-form"
              >
                <textarea
                  className="inquiry-details-modal-response-textarea"
                  placeholder="Type your response here..."
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={6}
                  disabled={isSubmitting || success}
                />

                <button
                  type="submit"
                  className="inquiry-details-modal-response-button"
                  disabled={!response.trim() || isSubmitting || success}
                >
                  {isSubmitting ? "Sending..." : "Send Response"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
