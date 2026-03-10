import { useState, useEffect, useMemo } from "react";
import { reservationApi } from "../../../shared/api/apiClient";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import "../styles/tenant-common.css";
import "../styles/contracts.css";

const ContractsPage = () => {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await reservationApi.getAll();
        setReservations(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message || "Failed to load contracts");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Active contract = checked-in reservations
  const activeContract = useMemo(
    () => reservations.find((r) => r.status === "checked-in"),
    [reservations],
  );

  // Past contracts = completed/cancelled/archived
  const pastContracts = useMemo(
    () =>
      reservations.filter(
        (r) =>
          r.status === "completed" ||
          r.status === "cancelled" ||
          r.status === "checked-out",
      ),
    [reservations],
  );

  // Confirmed (upcoming) = confirmed but not checked-in yet
  const upcomingContract = useMemo(
    () => reservations.find((r) => r.status === "confirmed"),
    [reservations],
  );

  const formatDate = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCurrency = (amount) =>
    `₱${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

  const getStatusBadge = (status) => {
    const map = {
      "checked-in": { label: "Active", className: "badge-active" },
      confirmed: { label: "Upcoming", className: "badge-upcoming" },
      completed: { label: "Completed", className: "badge-completed" },
      "checked-out": { label: "Completed", className: "badge-completed" },
      cancelled: { label: "Cancelled", className: "badge-cancelled" },
    };
    const info = map[status] || { label: status, className: "badge-default" };
    return (
      <span className={`contract-badge ${info.className}`}>{info.label}</span>
    );
  };

  const computeEndDate = (startDate, months) => {
    if (!startDate || !months) return null;
    const end = new Date(startDate);
    end.setMonth(end.getMonth() + months);
    return end;
  };

  const computeProgress = (startDate, months) => {
    if (!startDate || !months) return 0;
    const start = new Date(startDate).getTime();
    const end = computeEndDate(startDate, months)?.getTime();
    if (!end) return 0;
    const now = Date.now();
    if (now <= start) return 0;
    if (now >= end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  };

  const renderContractCard = (reservation, isActive = false) => {
    const room = reservation.roomId;
    const startDate = reservation.checkInDate || reservation.approvedDate;
    const endDate = computeEndDate(startDate, reservation.leaseDuration || 12);
    const progress = isActive
      ? computeProgress(startDate, reservation.leaseDuration || 12)
      : null;
    const monthsRemaining = endDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24 * 30),
          ),
        )
      : null;

    return (
      <div
        className={`contract-card ${isActive ? "contract-active" : ""}`}
        key={reservation._id}
      >
        <div className="contract-card-header">
          <div className="contract-title-row">
            <h3>{room?.name || reservation.roomName || "Room Assignment"}</h3>
            {getStatusBadge(reservation.status)}
          </div>
          {reservation.reservationCode && (
            <span className="contract-code">
              #{reservation.reservationCode}
            </span>
          )}
        </div>

        <div className="contract-card-body">
          {/* Progress bar for active contract */}
          {isActive && progress !== null && (
            <div className="contract-progress">
              <div className="progress-header">
                <span>Lease Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {monthsRemaining !== null && (
                <span className="progress-remaining">
                  {monthsRemaining > 0
                    ? `${monthsRemaining} month${monthsRemaining !== 1 ? "s" : ""} remaining`
                    : "Contract period ended"}
                </span>
              )}
            </div>
          )}

          <div className="contract-details">
            <div className="detail-item">
              <span className="detail-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </span>
              <div>
                <div className="detail-label">Room</div>
                <div className="detail-value">
                  {room?.name || "N/A"}
                  {room?.type && ` — ${room.type}`}
                </div>
              </div>
            </div>

            <div className="detail-item">
              <span className="detail-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <div>
                <div className="detail-label">Contract Period</div>
                <div className="detail-value">
                  {formatDate(startDate)} —{" "}
                  {endDate ? formatDate(endDate) : "Ongoing"}
                </div>
              </div>
            </div>

            <div className="detail-item">
              <span className="detail-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              <div>
                <div className="detail-label">Lease Duration</div>
                <div className="detail-value">
                  {reservation.leaseDuration || 12} months
                </div>
              </div>
            </div>

            <div className="detail-item">
              <span className="detail-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </span>
              <div>
                <div className="detail-label">Monthly Rent</div>
                <div className="detail-value">
                  {formatCurrency(reservation.totalPrice)}
                </div>
              </div>
            </div>

            {reservation.selectedBed && (
              <div className="detail-item">
                <span className="detail-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 4v16" />
                    <path d="M2 8h18a2 2 0 0 1 2 2v10" />
                    <path d="M2 17h20" />
                    <path d="M6 8v9" />
                  </svg>
                </span>
                <div>
                  <div className="detail-label">Bed Assignment</div>
                  <div className="detail-value">
                    {reservation.selectedBed.position
                      ? `${reservation.selectedBed.position} bunk`
                      : "Assigned"}
                  </div>
                </div>
              </div>
            )}

            {reservation.branch && (
              <div className="detail-item">
                <span className="detail-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <div>
                  <div className="detail-label">Branch</div>
                  <div
                    className="detail-value"
                    style={{ textTransform: "capitalize" }}
                  >
                    {reservation.branch || room?.branch || "—"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <TenantLayout>
      <div className="contracts-page">
        <div className="contracts-header">
          <h1>My Contracts</h1>
          <p>View your rental contract details and lease information</p>
        </div>

        {loading ? (
          <div className="contracts-loading">Loading contracts...</div>
        ) : error ? (
          <div className="contracts-error">{error}</div>
        ) : !activeContract &&
          !upcomingContract &&
          pastContracts.length === 0 ? (
          <div className="contracts-empty">
            <div className="empty-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h3>No Contracts Yet</h3>
            <p>
              Your contract details will appear here once your reservation is
              confirmed and you've checked in.
            </p>
          </div>
        ) : (
          <>
            {/* Active Contract */}
            {activeContract && (
              <section className="contracts-section">
                <h2 className="section-title">Active Contract</h2>
                {renderContractCard(activeContract, true)}
              </section>
            )}

            {/* Upcoming Contract */}
            {upcomingContract && (
              <section className="contracts-section">
                <h2 className="section-title">Upcoming Contract</h2>
                {renderContractCard(upcomingContract)}
              </section>
            )}

            {/* Past Contracts */}
            {pastContracts.length > 0 && (
              <section className="contracts-section">
                <h2 className="section-title">Past Contracts</h2>
                {pastContracts.map((r) => renderContractCard(r))}
              </section>
            )}
          </>
        )}
      </div>
    </TenantLayout>
  );
};

export default ContractsPage;
