import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  FileText,
  Megaphone,
  ShieldAlert,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { announcementApi } from "../../../../shared/api/apiClient";
import {
  useAcknowledgeAnnouncement,
  useAnnouncements,
} from "../../../../shared/hooks/queries/useAnnouncements";
import {
  formatAnnouncementCategory,
  getAnnouncementCategoryMeta,
} from "../../../../shared/utils/announcementConfig";

const CATEGORY_ICONS = {
  general: Megaphone,
  reminder: Bell,
  maintenance: Wrench,
  policy: FileText,
  alert: TriangleAlert,
  event: Megaphone,
};

const CATEGORY_COLORS = {
  neutral: { color: "#0A1628", bg: "#F1F5F9" },
  info: { color: "#2563EB", bg: "#EFF6FF" },
  warning: { color: "#D97706", bg: "#FFFBEB" },
  accent: { color: "#7C3AED", bg: "#F5F3FF" },
  success: { color: "#059669", bg: "#ECFDF5" },
  danger: { color: "#DC2626", bg: "#FEF2F2" },
};

const fmtDate = (value) =>
  new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const getAnnouncementId = (announcement) => announcement.id || announcement._id;

const LoadingState = () => (
  <div style={{ width: "100%" }}>
    <div style={s.heading}>
      <h1 style={s.title}>Announcements</h1>
      <p style={s.subtitle}>Loading announcements...</p>
    </div>
    {[1, 2, 3].map((item) => (
      <div
        key={item}
        style={{
          ...s.card,
          height: 88,
          background: "#F3F4F6",
          animation: "pulse 1.5s ease-in-out infinite",
          marginBottom: 10,
        }}
      />
    ))}
  </div>
);

export default function AnnouncementsTab() {
  const [filter, setFilter] = useState("all");
  const queryClient = useQueryClient();
  const acknowledgeAnnouncement = useAcknowledgeAnnouncement();
  const markReadAttemptsRef = useRef(new Set());

  const { data: announcementData, isLoading } = useAnnouncements(50);
  const announcements = announcementData?.announcements || [];

  const filters = useMemo(() => {
    const values = [
      "all",
      ...new Set(
        announcements
          .map((announcement) => announcement.category)
          .filter(Boolean),
      ),
    ];

    return values.map((value) => ({
      value,
      label: value === "all" ? "All" : formatAnnouncementCategory(value),
    }));
  }, [announcements]);

  const filtered = useMemo(
    () =>
      announcements.filter(
        (announcement) =>
          filter === "all" || announcement.category === filter,
      ),
    [announcements, filter],
  );

  useEffect(() => {
    const unreadIds = announcements
      .map((announcement) => getAnnouncementId(announcement))
      .filter(
        (announcementId, index) =>
          announcements[index].unread &&
          !markReadAttemptsRef.current.has(announcementId),
      );

    if (unreadIds.length === 0) return undefined;

    unreadIds.forEach((announcementId) =>
      markReadAttemptsRef.current.add(announcementId),
    );

    let cancelled = false;
    Promise.allSettled(
      unreadIds.map((announcementId) => announcementApi.markAsRead(announcementId)),
    ).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          markReadAttemptsRef.current.delete(unreadIds[index]);
        }
      });
      if (!cancelled) {
        queryClient.invalidateQueries({ queryKey: ["announcements"] });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [announcements, queryClient]);

  const handleAcknowledge = async (announcementId) => {
    try {
      await acknowledgeAnnouncement.mutateAsync(announcementId);
    } catch (error) {
      console.error("Failed to acknowledge announcement:", error);
    }
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={s.heading}>
        <h1 style={s.title}>Announcements</h1>
        <p style={s.subtitle}>
          Stay updated with branch notices, policy versions, and required acknowledgments
        </p>
      </div>

      <div style={s.filterRow}>
        {filters.map((item) => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value)}
            style={{
              ...s.chip,
              ...(filter === item.value ? s.chipActive : {}),
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={s.emptyState}>
          <Megaphone size={48} color="#D1D5DB" />
          <h3 style={s.emptyTitle}>No announcements</h3>
          <p style={s.emptyBody}>
            {filter === "all"
              ? "There are no announcements yet."
              : `No ${formatAnnouncementCategory(filter).toLowerCase()} announcements to show.`}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((announcement) => {
            const categoryMeta = getAnnouncementCategoryMeta(announcement.category);
            const tone =
              CATEGORY_COLORS[categoryMeta.tone] || CATEGORY_COLORS.neutral;
            const CategoryIcon =
              CATEGORY_ICONS[announcement.category] || Megaphone;

            return (
              <div
                key={getAnnouncementId(announcement)}
                style={{
                  ...s.card,
                  borderLeft: `3px solid ${tone.color}`,
                  ...(announcement.unread ? { background: "var(--surface-page)" } : {}),
                }}
              >
                <div style={s.cardTop}>
                  <div style={s.cardHeading}>
                    {announcement.unread ? <div style={s.unreadDot} /> : null}
                    <h3 style={s.cardTitle}>{announcement.title}</h3>
                  </div>

                  <div style={s.cardMeta}>
                    <span
                      style={{
                        ...s.categoryBadge,
                        background: tone.bg,
                        color: tone.color,
                      }}
                    >
                      <CategoryIcon size={11} />
                      {categoryMeta.label}
                    </span>
                    <span style={s.dateText}>{fmtDate(announcement.date)}</span>
                  </div>
                </div>

                <p style={s.cardBody}>{announcement.content}</p>

                {announcement.contentType === "policy" ? (
                  <div style={{ marginTop: 10, color: "#64748B", fontSize: 12 }}>
                    Version {announcement.version || 1}
                    {announcement.effectiveDate
                      ? ` • Effective ${fmtDate(announcement.effectiveDate)}`
                      : ""}
                  </div>
                ) : null}

                {announcement.requiresAck ? (
                  <div style={s.actionRow}>
                    {announcement.acknowledged ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={s.ackBadge}>
                          <Check size={13} /> Acknowledged
                        </span>
                        {announcement.acknowledgedAt ? (
                          <span style={{ color: "#64748B", fontSize: 12 }}>
                            Acknowledged {fmtDate(announcement.acknowledgedAt)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(getAnnouncementId(announcement))}
                        style={s.ackButton}
                        disabled={acknowledgeAnnouncement.isPending}
                      >
                        <ShieldAlert size={12} /> Acknowledge
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  heading: { marginBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text-heading)",
    margin: 0,
  },
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 },
  filterRow: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 20,
    border: "1px solid var(--border-card)",
    background: "var(--surface-card)",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  chipActive: {
    background: "#0A1628",
    color: "#fff",
    border: "1px solid #0A1628",
  },
  card: {
    padding: "16px 18px",
    background: "var(--surface-card)",
    border: "1px solid var(--border-card)",
    borderRadius: 10,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  cardHeading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#FF8C42",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-heading)",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  categoryBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
  },
  dateText: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  cardBody: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
    lineHeight: 1.5,
  },
  actionRow: {
    marginTop: 12,
  },
  ackBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "#059669",
  },
  ackButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 14px",
    background: "#FF8C42",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#374151",
    margin: "16px 0 8px",
  },
  emptyBody: {
    fontSize: 13,
    color: "#9CA3AF",
    maxWidth: 280,
  },
};
