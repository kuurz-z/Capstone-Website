import { useState, useMemo } from "react";
import {
  MessageSquare,
  Search,
  User,
  Mail,
  MapPin,
  Phone,
  FileText,
  Calendar,
  ChevronDown,
  MoreVertical,
  Check,
  X as XIcon,
} from "lucide-react";
import PageShell from "../components/shared/PageShell";
import { reservationApi } from "../../../shared/api/apiClient";
import { showNotification } from "../../../shared/utils/notification";
import { useInquiries } from "../../../shared/hooks/queries/useInquiries";
import InquiryDetailsModal from "../components/InquiryDetailsModal";

const getAvatarColor = (initials = "") => {
  const colors = [
    "bg-[color:var(--chart-5)] text-white",
    "bg-[color:var(--chart-1)] text-white",
    "bg-[color:var(--chart-4)] text-white",
    "bg-[color:var(--danger)] text-white",
    "bg-[color:var(--chart-2)] text-white",
    "bg-[color:var(--warning)] text-white",
  ];
  const charCode = initials.length > 0 ? initials.charCodeAt(0) : 0;
  const index = charCode % colors.length;
  return colors[index];
};

function initial(name = "") {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (parts[0]?.[0] || "?").toUpperCase();
}

function fmtDate(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SUMMARY_FILTERS = ["", "pending", "resolved"];

function InquiriesPage() {
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(1);
  const limit = 10;

  const {
    data,
    isLoading: loading,
    refetch,
  } = useInquiries({
    page,
    limit,
    search: searchTerm,
    status: statusFilter,
    branch: branchFilter,
    sortBy,
  });

  const inquiries = data?.inquiries || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);



  return (
    <PageShell>

      <PageShell.Content>
        <div className="flex flex-col gap-4 mb-6">

          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search inquiries..."
                style={{
                  backgroundColor: "var(--input-background)",
                  borderColor: "var(--border-light)",
                }}
                className="w-full pl-10 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={branchFilter}
                onChange={(event) => {
                  setBranchFilter(event.target.value);
                  setPage(1);
                }}
                style={{
                  backgroundColor: "var(--input-background)",
                  borderColor: "var(--border-light)",
                }}
                className="px-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Branches</option>
                <option value="gil-puyat">Gil Puyat</option>
                <option value="guadalupe">Guadalupe</option>
              </select>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                style={{
                  backgroundColor: "var(--input-background)",
                  borderColor: "var(--border-light)",
                }}
                className="px-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                style={{
                  backgroundColor: "var(--input-background)",
                  borderColor: "var(--border-light)",
                }}
                className="px-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest First</option>
                <option value="name-az">Name A-Z</option>
                <option value="name-za">Name Z-A</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Loading inquiries...
                </p>
              </div>
            ) : inquiries.length === 0 ? (
              <div className="p-12 text-center">
                <MessageSquare className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                <p className="text-base font-medium text-foreground">
                  No inquiries found
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your filters.
                </p>
              </div>
            ) : (
              inquiries.map((inquiry) => {
                const name =
                  inquiry.name ||
                  `${inquiry.firstName || ""} ${inquiry.lastName || ""}`.trim() ||
                  "Unknown";
                const status = inquiry.status || "pending";

                return (
                  <div
                    key={inquiry._id}
                    onClick={() => setSelectedInquiry(inquiry)}
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-light)",
                    }}
                    className="flex items-start justify-between p-5 border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center font-medium ${getAvatarColor(initial(name))}`}
                      >
                        {initial(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {inquiry.email || "-"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(inquiry.createdAt)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedInquiry(inquiry);
                              }}
                              className="p-1 hover:bg-muted rounded-md transition-colors"
                            >
                              <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                        {inquiry.message && (
                          <p className="text-sm text-foreground mb-2 line-clamp-2">
                            {inquiry.message}
                          </p>
                        )}
                        <div className="flex items-center gap-3">
                          {(inquiry.subject || inquiry.inquiryType) && (
                            <span className="text-xs px-3 py-1 bg-muted text-foreground rounded-md">
                              {inquiry.subject || inquiry.inquiryType}
                            </span>
                          )}
                          <span
                            style={{
                              backgroundColor: status === "resolved" 
                                ? "var(--status-success-bg)" 
                                : "var(--status-warning-bg)",
                              color: status === "resolved" 
                                ? "var(--status-success)" 
                                : "var(--status-warning)",
                            }}
                            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                          >
                            {status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-6">
              <p className="text-sm text-muted-foreground">
                Showing {inquiries.length} of {total} results
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-light)",
                  }}
                  className="px-3 py-1 text-sm border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-light)",
                  }}
                  className="px-3 py-1 text-sm border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </PageShell.Content>

      {selectedInquiry && (
        <InquiryDetailsModal
          inquiry={selectedInquiry}
          onClose={() => setSelectedInquiry(null)}
          onUpdate={refetch}
        />
      )}
    </PageShell>
  );
}

export default InquiriesPage;
