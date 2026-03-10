import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { userApi, announcementApi } from "../../../shared/api/apiClient";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import "../styles/dashboard.css";

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stayData, setStayData] = useState(null);
  const [announcements, setAnnouncements] = useState([]);

  const isTenant =
    user?.role === "tenant" ||
    user?.tenantStatus === "active" ||
    user?.tenantStatus === "inactive";

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const announcementData = await announcementApi.getAll(5);
      setAnnouncements(announcementData.announcements || []);
      if (isTenant) {
        const stays = await userApi.getMyStays();
        setStayData(stays);
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      registered: { class: "status-registered", text: "Registered" },
      "with-reservation": {
        class: "status-reserved",
        text: "With Reservation",
      },
      visited: { class: "status-visited", text: "Visited" },
      reserved: { class: "status-reserved", text: "Reserved" },
      active: { class: "status-active", text: "Active" },
      inactive: { class: "status-inactive", text: "Former Tenant" },
    };
    return badges[status] || { class: "", text: status };
  };

  const unacknowledgedCount = announcements.filter(
    (a) => a.unread && a.requiresAck,
  ).length;

  if (loading) {
    return (
      <TenantLayout>
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </TenantLayout>
    );
  }

  return (
    <TenantLayout>
      <div className="dashboard-page">
        {/* Welcome Header */}
        <div className="dashboard-header">
          <div>
            <h1>Welcome back, {user?.firstName}!</h1>
            <p className="dashboard-subtitle">
              {isTenant
                ? "Here's your stay overview and important updates"
                : "Manage your reservation and account"}
            </p>
          </div>
          <div className="dashboard-status-badge">
            <span
              className={
                getStatusBadge(user?.tenantStatus || "registered").class
              }
            >
              {getStatusBadge(user?.tenantStatus || "registered").text}
            </span>
          </div>
        </div>

        {/* Alerts */}
        {unacknowledgedCount > 0 && (
          <div className="dashboard-alert alert-warning">
            <i className="fas fa-exclamation-triangle"></i>
            <div>
              <strong>Action Required:</strong> You have {unacknowledgedCount}{" "}
              unacknowledged notice{unacknowledgedCount > 1 ? "s" : ""}.
              <button
                className="alert-link"
                onClick={() => navigate("/applicant/announcements")}
              >
                View Announcements
              </button>
            </div>
          </div>
        )}

        {/* Pre-Tenant Dashboard */}
        {!isTenant && (
          <div className="dashboard-content">
            <div className="dashboard-cards">
              {/* Quick Actions */}
              <div className="dashboard-card card-accent">
                <div className="card-icon">
                  <i className="fas fa-calendar-check"></i>
                </div>
                <div className="card-content">
                  <h3>My Reservation</h3>
                  <p>View and manage your room reservation</p>
                  <button
                    className="btn btn-primary-outline btn-sm"
                    onClick={() => navigate("/applicant/reservation")}
                  >
                    View Details
                  </button>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">
                  <i className="fas fa-user"></i>
                </div>
                <div className="card-content">
                  <h3>Profile</h3>
                  <p>Update your personal information</p>
                  <button
                    className="btn btn-secondary-outline btn-sm"
                    onClick={() => navigate("/applicant/profile")}
                  >
                    Edit Profile
                  </button>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">
                  <i className="fas fa-search"></i>
                </div>
                <div className="card-content">
                  <h3>Find Rooms</h3>
                  <p>Browse available room options</p>
                  <button
                    className="btn btn-secondary-outline btn-sm"
                    onClick={() => navigate("/check-availability")}
                  >
                    Check Availability
                  </button>
                </div>
              </div>
            </div>

            {/* Latest Announcements Preview */}
            {announcements.length > 0 && (
              <div className="dashboard-section">
                <div className="section-header">
                  <h2>
                    <i className="fas fa-bullhorn"></i> Latest Announcements
                  </h2>
                  <button
                    className="btn-link"
                    onClick={() => navigate("/applicant/announcements")}
                  >
                    View All
                  </button>
                </div>
                <div className="announcements-preview">
                  {announcements.slice(0, 2).map((announcement) => (
                    <div
                      key={announcement.id}
                      className="announcement-preview-item"
                    >
                      {announcement.unread && (
                        <span className="unread-dot"></span>
                      )}
                      <div className="announcement-preview-content">
                        <h4>{announcement.title}</h4>
                        <p className="announcement-meta">
                          <span className="announcement-category">
                            {announcement.category}
                          </span>
                          <span className="announcement-date">
                            {new Date(announcement.date).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                      {announcement.requiresAck && (
                        <span className="badge badge-warning">
                          Acknowledgment Required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tenant Dashboard */}
        {isTenant && stayData && (
          <div className="dashboard-content">
            {/* Stats Overview */}
            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-icon">
                  <i className="fas fa-home"></i>
                </div>
                <div className="stat-content">
                  <div className="stat-value">
                    {stayData.currentStays.length}
                  </div>
                  <div className="stat-label">
                    Current Stay{stayData.currentStays.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <i className="fas fa-calendar-check"></i>
                </div>
                <div className="stat-content">
                  <div className="stat-value">{stayData.stats.totalStays}</div>
                  <div className="stat-label">Total Bookings</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <i className="fas fa-bed"></i>
                </div>
                <div className="stat-content">
                  <div className="stat-value">{stayData.stats.totalNights}</div>
                  <div className="stat-label">Total Nights</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <i className="fas fa-check-circle"></i>
                </div>
                <div className="stat-content">
                  <div className="stat-value">
                    {stayData.stats.completedStays}
                  </div>
                  <div className="stat-label">Completed Stays</div>
                </div>
              </div>
            </div>

            {/* Quick Access Cards */}
            <div className="dashboard-cards">
              <div className="dashboard-card card-accent">
                <div className="card-icon">
                  <i className="fas fa-file-invoice-dollar"></i>
                </div>
                <div className="card-content">
                  <h3>Billing</h3>
                  <p>View your balance and payment history</p>
                  <button
                    className="btn btn-primary-outline btn-sm"
                    onClick={() => navigate("/applicant/billing")}
                  >
                    View Billing
                  </button>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">
                  <i className="fas fa-tools"></i>
                </div>
                <div className="card-content">
                  <h3>Maintenance</h3>
                  <p>Submit and track maintenance requests</p>
                  <button
                    className="btn btn-secondary-outline btn-sm"
                    onClick={() => navigate("/applicant/maintenance")}
                  >
                    Maintenance
                  </button>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="card-icon">
                  <i className="fas fa-user"></i>
                </div>
                <div className="card-content">
                  <h3>Profile</h3>
                  <p>View your stay details and documents</p>
                  <button
                    className="btn btn-secondary-outline btn-sm"
                    onClick={() => navigate("/applicant/profile")}
                  >
                    View Profile
                  </button>
                </div>
              </div>
            </div>

            {/* Latest Announcements Preview */}
            {announcements.length > 0 && (
              <div className="dashboard-section">
                <div className="section-header">
                  <h2>
                    <i className="fas fa-bullhorn"></i> Latest Announcements
                  </h2>
                  <button
                    className="btn-link"
                    onClick={() => navigate("/applicant/announcements")}
                  >
                    View All
                  </button>
                </div>
                <div className="announcements-preview">
                  {announcements.slice(0, 2).map((announcement) => (
                    <div
                      key={announcement.id}
                      className="announcement-preview-item"
                    >
                      {announcement.unread && (
                        <span className="unread-dot"></span>
                      )}
                      <div className="announcement-preview-content">
                        <h4>{announcement.title}</h4>
                        <p className="announcement-meta">
                          <span className="announcement-category">
                            {announcement.category}
                          </span>
                          <span className="announcement-date">
                            {new Date(announcement.date).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                      {announcement.requiresAck && (
                        <span className="badge badge-warning">
                          Acknowledgment Required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TenantLayout>
  );
};

export default DashboardPage;
