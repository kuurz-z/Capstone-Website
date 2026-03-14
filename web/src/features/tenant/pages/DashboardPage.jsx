import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useAnnouncements } from "../../../shared/hooks/queries/useAnnouncements";
import { useMyStays } from "../../../shared/hooks/queries/useUsers";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import DashboardPageSkeleton from "../components/dashboard/DashboardPageSkeleton";
import {
  AlertTriangle,
  CalendarCheck,
  User,
  Search,
  FileText,
  Wrench,
  Home,
  Bed,
  CheckCircle,
  Megaphone
} from "lucide-react";
import "../styles/dashboard.css";

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isTenant =
    user?.role === "tenant" ||
    user?.tenantStatus === "active" ||
    user?.tenantStatus === "inactive";

  const { data: announcementData, isLoading: announcementsLoading } = useAnnouncements(5);
  const { data: stayData, isLoading: staysLoading } = useMyStays(isTenant);

  const announcements = announcementData?.announcements || [];
  const loading = announcementsLoading || (isTenant && staysLoading);

  const getStatusBadge = (status) => {
    const badges = {
      none: { class: "status-registered", text: "Pre-Tenant" },
      active: { class: "status-active", text: "Active" },
      inactive: { class: "status-inactive", text: "Former Tenant" },
      evicted: { class: "status-evicted", text: "Evicted" },
      blacklisted: { class: "status-blacklisted", text: "Blacklisted" },
    };
    return badges[status] || { class: "", text: status };
  };

  const unacknowledgedCount = announcements.filter(
    (a) => a.unread && a.requiresAck,
  ).length;

  if (loading) {
    return <DashboardPageSkeleton />;
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
                getStatusBadge(user?.tenantStatus || "none").class
              }
            >
              {getStatusBadge(user?.tenantStatus || "none").text}
            </span>
          </div>
        </div>

        {/* Alerts */}
        {unacknowledgedCount > 0 && (
          <div className="dashboard-alert alert-warning">
            <AlertTriangle size={16} />
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
                  <CalendarCheck size={20} />
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
                  <User size={20} />
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
                  <Search size={20} />
                </div>
                <div className="card-content">
                  <h3>Find Rooms</h3>
                  <p>Browse available room options</p>
                  <button
                    className="btn btn-secondary-outline btn-sm"
                    onClick={() => navigate("/applicant/check-availability")}
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
                    <Megaphone size={18} /> Latest Announcements
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
                  <Home size={20} />
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
                  <CalendarCheck size={20} />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{stayData.stats.totalStays}</div>
                  <div className="stat-label">Total Bookings</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Bed size={20} />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{stayData.stats.totalNights}</div>
                  <div className="stat-label">Total Nights</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <CheckCircle size={20} />
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
                  <FileText size={20} />
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
                  <Wrench size={20} />
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
                  <User size={20} />
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
                    <Megaphone size={18} /> Latest Announcements
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
