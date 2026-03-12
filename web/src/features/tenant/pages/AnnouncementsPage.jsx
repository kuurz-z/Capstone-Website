import React, { useState } from "react";
import { announcementApi } from "../../../shared/api/apiClient";
import { useAnnouncements } from "../../../shared/hooks/queries/useAnnouncements";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import AnnouncementsPageSkeleton from "../components/announcements/AnnouncementsPageSkeleton";
import "../styles/tenant-common.css";

const AnnouncementsPage = () => {
  const [filter, setFilter] = useState("all");
  const [acknowledged, setAcknowledged] = useState(new Set());

  const { data: announcementData, isLoading: loading } = useAnnouncements(50);
  const announcements = announcementData?.announcements || [];

  const filteredAnnouncements = announcements.filter(
    (a) => filter === "all" || a.category.toLowerCase() === filter,
  );

  if (loading) {
    return (
      <TenantLayout>
        <AnnouncementsPageSkeleton />
      </TenantLayout>
    );
  }

  const handleAcknowledge = async (id) => {
    try {
      await announcementApi.acknowledge(id);
      setAcknowledged((prev) => new Set(prev).add(id));
    } catch (error) {
      console.error("Failed to acknowledge announcement:", error);
    }
  };

  const getCategoryClass = (category) => {
    const classes = {
      Reminder: "category-reminder",
      Maintenance: "category-maintenance",
      Policy: "category-policy",
      Utilities: "category-utilities",
    };
    return classes[category] || "category-default";
  };

  return (
    <TenantLayout>
      <div className="tenant-page">
        <div className="page-header">
          <div>
            <h1>
              <i className="fas fa-bullhorn"></i> Announcements
            </h1>
            <p>Stay updated with important notices and announcements</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="filter-tabs">
          <button
            className={`tab ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`tab ${filter === "maintenance" ? "active" : ""}`}
            onClick={() => setFilter("maintenance")}
          >
            Maintenance
          </button>
          <button
            className={`tab ${filter === "utilities" ? "active" : ""}`}
            onClick={() => setFilter("utilities")}
          >
            Utilities
          </button>
          <button
            className={`tab ${filter === "policy" ? "active" : ""}`}
            onClick={() => setFilter("policy")}
          >
            Policy
          </button>
          <button
            className={`tab ${filter === "reminder" ? "active" : ""}`}
            onClick={() => setFilter("reminder")}
          >
            Reminder
          </button>
        </div>

        {/* Announcements List */}
        <div className="announcements-list">
          {filteredAnnouncements.map((announcement) => (
            <div
              key={announcement.id}
              className={`announcement-card ${announcement.unread ? "unread" : ""}`}
            >
              <div className="announcement-header">
                <div className="announcement-title-row">
                  {announcement.unread && (
                    <span className="unread-indicator"></span>
                  )}
                  <h3>{announcement.title}</h3>
                </div>
                <div className="announcement-meta">
                  <span
                    className={`category-badge ${getCategoryClass(announcement.category)}`}
                  >
                    {announcement.category}
                  </span>
                  <span className="announcement-date">
                    {new Date(announcement.date).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <p className="announcement-content">{announcement.content}</p>
              {announcement.requiresAck && (
                <div className="announcement-actions">
                  {announcement.acknowledged ? (
                    <span className="badge badge-success">
                      <i className="fas fa-check"></i> Acknowledged
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleAcknowledge(announcement.id)}
                    >
                      <i className="fas fa-check"></i> Acknowledge
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </TenantLayout>
  );
};

export default AnnouncementsPage;
