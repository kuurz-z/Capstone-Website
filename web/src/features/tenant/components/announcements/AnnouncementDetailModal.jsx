import React, { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  FileText,
  LoaderCircle,
  Megaphone,
  Pin,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  Building,
  User,
} from "lucide-react";
import BaseModal from "../../../../shared/components/BaseModal";
import {
  formatAnnouncementBranch,
  formatAnnouncementCategory,
  getAnnouncementCategoryMeta,
} from "../../../../shared/utils/announcementConfig";
import {
  useAcknowledgeAnnouncement,
  useMarkAnnouncementRead,
} from "../../../../shared/hooks/queries/useAnnouncements";
import { showNotification } from "../../../../shared/utils/notification";

const CATEGORY_ICONS = {
  general: Megaphone,
  reminder: Bell,
  maintenance: Wrench,
  policy: FileText,
  alert: TriangleAlert,
  emergency: TriangleAlert,
  event: Megaphone,
};

const getPriorityObjective = (announcement) => {
  const cat = announcement.category?.toLowerCase();
  if (cat === "emergency" || cat === "alert" || announcement.priority === "urgent") {
    return {
      tier: "urgent",
      badgeStyle: styles.urgentBadge,
      iconColor: "#dc2626",
      label: cat === "emergency" ? "Emergency" : "Alert",
    };
  }
  if (cat === "maintenance" || announcement.priority === "high") {
    return {
      tier: "warning",
      badgeStyle: styles.warningBadge,
      iconColor: "#d97706",
      label: "Maintenance",
    };
  }
  if (announcement.contentType === "policy" || cat === "policy") {
    return {
      tier: "policy",
      badgeStyle: styles.policyBadge,
      iconColor: "#2563eb",
      label: "Policy",
    };
  }
  return {
    tier: "neutral",
    badgeStyle: styles.neutralBadge,
    iconColor: "#64748b",
    label: formatAnnouncementCategory(announcement.category),
  };
};

const fmtDateTime = (value) => {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const datePart = d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return String(value);
  }
};

const fmtDate = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
};

export default function AnnouncementDetailModal({
  isOpen,
  onClose,
  announcement,
}) {
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const acknowledgeMutation = useAcknowledgeAnnouncement();
  const markReadMutation = useMarkAnnouncementRead();

  const announcementId = announcement?.id || announcement?._id;

  // Mark notice as read upon opening if unread
  useEffect(() => {
    if (isOpen && announcement && announcement.unread && announcementId) {
      markReadMutation.mutate(announcementId);
    }
  }, [isOpen, announcementId, announcement?.unread]);

  if (!announcement) return null;

  const priority = getPriorityObjective(announcement);
  const CategoryIcon = CATEGORY_ICONS[announcement.category] || Megaphone;

  const handleAcknowledge = async () => {
    if (!announcementId || isAcknowledging) return;
    setIsAcknowledging(true);
    try {
      await acknowledgeMutation.mutateAsync(announcementId);
      showNotification("Notice acknowledged successfully.", "success", 3500);
    } catch (err) {
      showNotification(err?.message || "Failed to acknowledge notice.", "error", 4000);
    } finally {
      setIsAcknowledging(false);
    }
  };

  const isPolicy =
    announcement.contentType === "policy" ||
    announcement.category === "policy";

  const needsAck = announcement.requiresAck && !announcement.acknowledged;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      variant={null}
      size="md"
      title={announcement.title}
      subtitle={
        <div style={styles.headerMetaRow}>
          {/* Priority-Aware Badge */}
          <span style={priority.badgeStyle}>
            <CategoryIcon size={12} style={{ color: priority.iconColor }} />
            {priority.label}
          </span>

          {announcement.isPinned ? (
            <span style={styles.neutralBadge}>
              <Pin size={11} style={{ opacity: 0.8 }} />
              Pinned
            </span>
          ) : null}

          {isPolicy ? (
            <span style={styles.policyBadge}>
              Policy v{announcement.version || 1}
            </span>
          ) : null}

          <span style={styles.metaDot}>•</span>
          <span style={styles.dateText}>
            {fmtDateTime(announcement.date)}
          </span>
        </div>
      }
      showCloseButton={true}
      footer={
        needsAck ? (
          <div style={styles.footerContainer}>
            <div style={styles.ackPendingWarning}>
              <ShieldAlert size={15} />
              <span>Tenant Acknowledgment Required</span>
            </div>

            <button
              type="button"
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
              style={{
                ...styles.acknowledgeBtn,
                ...(isAcknowledging ? { opacity: 0.6, cursor: "not-allowed" } : {}),
              }}
            >
              {isAcknowledging ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" />
                  Recording Acknowledgment...
                </>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  Acknowledge Notice
                </>
              )}
            </button>
          </div>
        ) : null
      }
    >
      <div style={styles.bodyContainer}>
        {/* Policy Metadata Strip if Policy Notice */}
        {isPolicy ? (
          <div style={styles.policyMetaStrip}>
            <div style={styles.policyMetaItem}>
              <span style={styles.policyMetaLabel}>Policy Reference:</span>
              <span style={styles.policyMetaVal}>{announcement.policyKey || "General Policy"}</span>
            </div>
            <div style={styles.policyMetaItem}>
              <span style={styles.policyMetaLabel}>Effective:</span>
              <span style={styles.policyMetaVal}>
                {fmtDate(announcement.effectiveDate || announcement.date)}
              </span>
            </div>
            {announcement.endsAt ? (
              <div style={styles.policyMetaItem}>
                <span style={styles.policyMetaLabel}>Expires:</span>
                <span style={styles.policyMetaVal}>{fmtDate(announcement.endsAt)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Notice Main Content — Crisp, Dark & Readable */}
        <div style={styles.contentText}>
          {announcement.content}
        </div>

        {/* Notice Footnote Metadata */}
        <div style={styles.footnoteRow}>
          <div style={styles.footnoteLeft}>
            <div style={styles.footnoteItem}>
              <Building size={13} style={{ opacity: 0.7 }} />
              <span>
                Target: {formatAnnouncementBranch(announcement.targetBranch || "both")}
              </span>
            </div>

            {announcement.authorName ? (
              <div style={styles.footnoteItem}>
                <User size={13} style={{ opacity: 0.7 }} />
                <span>Published by {announcement.authorName}</span>
              </div>
            ) : null}
          </div>

          {/* Green Acknowledged status badge if already completed */}
          {announcement.requiresAck && announcement.acknowledged ? (
            <div style={styles.acknowledgedBadge}>
              <CheckCheck size={14} />
              <span>
                Acknowledged on {fmtDate(announcement.acknowledgedAt)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </BaseModal>
  );
}

const styles = {
  headerMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 6,
  },
  neutralBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11.5,
    fontWeight: 600,
    background: "var(--muted, #f1f5f9)",
    color: "var(--text-heading, #0f172a)",
    border: "1px solid var(--border, #e2e8f0)",
  },
  urgentBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 0",
    fontSize: 11.5,
    fontWeight: 600,
    background: "transparent",
    color: "#dc2626",
  },
  warningBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 0",
    fontSize: 11.5,
    fontWeight: 600,
    background: "transparent",
    color: "#d97706",
  },
  policyBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 0",
    fontSize: 11.5,
    fontWeight: 600,
    background: "transparent",
    color: "#2563eb",
  },
  metaDot: {
    color: "var(--muted-foreground, #64748b)",
    fontSize: 11,
    opacity: 0.6,
  },
  dateText: {
    fontSize: 12,
    color: "var(--muted-foreground, #64748b)",
    fontWeight: 500,
  },
  bodyContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: "4px 0",
  },
  policyMetaStrip: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    padding: "8px 12px",
    borderRadius: 8,
    background: "var(--muted, #f1f5f9)",
    border: "1px solid var(--border, #e2e8f0)",
    fontSize: 12,
  },
  policyMetaItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  policyMetaLabel: {
    color: "var(--muted-foreground, #64748b)",
    fontWeight: 500,
  },
  policyMetaVal: {
    color: "var(--text-heading, #0f172a)",
    fontWeight: 600,
  },
  contentText: {
    fontSize: 15,
    lineHeight: 1.7,
    color: "var(--text-body, #1e293b)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontWeight: 400,
  },
  footnoteRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    paddingTop: 12,
    borderTop: "1px solid var(--border, #e2e8f0)",
    fontSize: 12,
    color: "var(--muted-foreground, #64748b)",
  },
  footnoteLeft: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  footnoteItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  },
  acknowledgedBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "#16a34a",
    fontSize: 12,
    fontWeight: 600,
  },
  footerContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    gap: 12,
    flexWrap: "wrap",
    padding: "14px 20px",
    borderTop: "1px solid var(--border, #e2e8f0)",
    background: "var(--card, #ffffff)",
  },
  ackPendingWarning: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "#15803d",
    fontSize: 12.5,
    fontWeight: 600,
  },
  acknowledgeBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 18px",
    borderRadius: 7,
    border: "1px solid #15803d",
    background: "#16a34a",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(22, 163, 74, 0.2)",
    transition: "all 0.15s ease",
    marginLeft: "auto",
  },
};
