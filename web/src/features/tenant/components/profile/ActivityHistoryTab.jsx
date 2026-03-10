import React from "react";
import { Calendar, DollarSign, FileText, Edit2, History } from "lucide-react";

/**
 * Activity History tab content for ProfilePage.
 * Displays a timeline of reservation-related activities.
 */

const ACTIVITY_ICONS = {
  payment: { icon: DollarSign, bg: "#DEF7EC", color: "text-green-600" },
  reservation: {
    icon: FileText,
    bg: "#EEF2FF",
    color: undefined,
    style: { color: "#0C375F" },
  },
  approval: {
    icon: FileText,
    bg: "#EEF2FF",
    color: undefined,
    style: { color: "#0C375F" },
  },
  visit: { icon: Calendar, bg: "#DBEAFE", color: "text-blue-600" },
  default: { icon: Edit2, bg: "#F3F4F6", color: "text-gray-600" },
};

const getStatusClass = (status) => {
  if (["Completed", "Confirmed", "Approved", "Complete"].includes(status)) {
    return "bg-green-100 text-green-700";
  }
  if (["Scheduled", "Pending"].includes(status)) {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-gray-100 text-gray-700";
};

const ActivityHistoryTab = ({ activityLog }) => (
  <div className="max-w-5xl">
    <div className="mb-8">
      <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1F2937" }}>
        Activity History
      </h1>
      <p className="text-sm text-gray-500">
        Complete record of visit requests, approvals, reservation updates, and
        payments
      </p>
    </div>

    <div
      className="bg-white rounded-xl p-6 border"
      style={{ borderColor: "#E8EBF0" }}
    >
      {activityLog.length > 0 ? (
        <div className="space-y-4">
          {activityLog.map((activity, index) => {
            const iconConfig =
              ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.default;
            const IconComponent = iconConfig.icon;

            return (
              <div key={activity.id} className="relative">
                {index !== activityLog.length - 1 && (
                  <div className="absolute left-5 top-12 bottom-0 w-px bg-gray-200" />
                )}
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 relative z-10"
                    style={{ backgroundColor: iconConfig.bg }}
                  >
                    <IconComponent
                      className={`w-5 h-5 ${iconConfig.color || ""}`}
                      style={iconConfig.style}
                    />
                  </div>
                  <div className="flex-1 pb-8">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4
                          className="font-semibold mb-1"
                          style={{ color: "#1F2937" }}
                        >
                          {activity.title}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {activity.description}
                        </p>
                      </div>
                      {activity.status && (
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-4 ${getStatusClass(activity.status)}`}
                        >
                          {activity.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(activity.date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <History className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            No Activity Yet
          </h3>
          <p className="text-sm text-gray-500">
            Your reservation activities will appear here
          </p>
        </div>
      )}
    </div>
  </div>
);

export default ActivityHistoryTab;
