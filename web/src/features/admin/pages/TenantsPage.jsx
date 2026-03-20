import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useUsers } from "../../../shared/hooks/queries/useUsers";
import { useReservations } from "../../../shared/hooks/queries/useReservations";
import { PageShell, SummaryBar, ActionBar, DataTable, StatusBadge, DetailDrawer } from "../components/shared";
import "../styles/design-tokens.css";
import "../styles/admin-tenants.css";

export default function TenantsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState(
    isSuperAdmin ? "all" : (user?.branch || "all")
  );
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: usersResponse, isLoading: usersLoading, error: usersError } = useUsers({ role: "tenant" });
  const { data: reservationsData = [], isLoading: reservationsLoading } = useReservations();
  const loading = usersLoading || reservationsLoading;

  const tenants = useMemo(() => {
    const users = usersResponse?.users || usersResponse || [];
    const reservations = reservationsData || [];

    return users.map((u) => {
      const userReservation = reservations
        .filter((res) => res.userId?._id === u._id && res.status === "checked-in")
        .sort((a, b) => new Date(b.checkInDate) - new Date(a.checkInDate))[0];

      let status = "Active";
      if (userReservation) {
        if (userReservation.paymentStatus === "pending" || userReservation.paymentStatus === "partial") {
          status = "Overdue";
        }
        if (userReservation.checkOutDate) {
          const daysUntilMoveOut = Math.ceil(
            (new Date(userReservation.checkOutDate) - new Date()) / (1000 * 60 * 60 * 24),
          );
          if (daysUntilMoveOut <= 30 && daysUntilMoveOut > 0) status = "Moving Out";
        }
      }

      const firstName = u.firstName || "";
      const lastName = u.lastName || "";
      const fullName = `${firstName} ${lastName}`.trim() || u.email || "Unknown";

      return {
        id: u._id,
        name: fullName,
        initials: `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U",
        status,
        room: userReservation?.roomId?.name || userReservation?.roomId?.roomNumber || "Not Assigned",
        branch: userReservation?.roomId?.branch === "gil-puyat" ? "Gil Puyat"
          : userReservation?.roomId?.branch === "guadalupe" ? "Guadalupe" : "N/A",
        moveIn: userReservation?.checkInDate ? new Date(userReservation.checkInDate).toISOString().split("T")[0] : "—",
        moveOut: userReservation?.checkOutDate ? new Date(userReservation.checkOutDate).toISOString().split("T")[0] : "—",
        email: u.email || "N/A",
        phone: userReservation?.mobileNumber || u.phone || "N/A",
        monthlyRent: userReservation?.roomId?.price || null,
        roomType: userReservation?.roomId?.type || "—",
        gender: u.gender || "",
        emergencyContact: u.emergencyContact || "",
        emergencyPhone: u.emergencyPhone || "",
        school: u.school || "",
        yearLevel: u.yearLevel || "",
      };
    });
  }, [usersResponse, reservationsData]);

  const stats = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter((t) => t.status === "Active").length;
    const overdue = tenants.filter((t) => t.status === "Overdue").length;
    const movingOut = tenants.filter((t) => t.status === "Moving Out").length;
    return { total, active, overdue, movingOut };
  }, [tenants]);

  const filteredTenants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tenants.filter((t) => {
      const matchesSearch = !term || t.name.toLowerCase().includes(term) || t.email.toLowerCase().includes(term) || t.room.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || t.status.toLowerCase() === statusFilter;
      const matchesBranch = branchFilter === "all" || t.branch.toLowerCase().includes(branchFilter);
      return matchesSearch && matchesStatus && matchesBranch;
    });
  }, [searchTerm, statusFilter, branchFilter, tenants]);

  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTenants = filteredTenants.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);
  }, [currentPage, totalPages]);

  const summaryItems = [
    { label: "Total", value: stats.total, color: "blue" },
    { label: "Active", value: stats.active, color: "green" },
    { label: "Overdue", value: stats.overdue, color: "red" },
    { label: "Moving Out", value: stats.movingOut, color: "orange" },
  ];

  const filters = [
    ...(isSuperAdmin ? [{
      key: "branch",
      options: [
        { value: "all", label: "All Branches" },
        { value: "gil puyat", label: "Gil Puyat" },
        { value: "guadalupe", label: "Guadalupe" },
      ],
      value: branchFilter,
      onChange: setBranchFilter,
    }] : []),
    {
      key: "status",
      options: [
        { value: "all", label: "All Status" },
        { value: "active", label: "Active" },
        { value: "overdue", label: "Overdue" },
        { value: "moving out", label: "Moving Out" },
      ],
      value: statusFilter,
      onChange: setStatusFilter,
    },
  ];

  const columns = [
    {
      key: "name",
      label: "Tenant",
      sortable: true,
      render: (row) => (
        <div className="tenant-cell">
          <div className="tenant-cell__avatar">{row.initials}</div>
          <div className="tenant-cell__info">
            <span className="tenant-cell__name">{row.name}</span>
            <span className="tenant-cell__email">{row.email}</span>
          </div>
        </div>
      ),
    },
    { key: "room", label: "Room", sortable: true },
    { key: "branch", label: "Branch", sortable: true },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: "moveIn", label: "Move In", sortable: true },
    { key: "moveOut", label: "Move Out", sortable: true },
  ];

  return (
    <PageShell>
      <PageShell.Summary>
        <SummaryBar items={summaryItems} />
      </PageShell.Summary>

      <PageShell.Actions>
        <ActionBar
          search={{ value: searchTerm, onChange: setSearchTerm, placeholder: "Search tenants..." }}
          filters={filters}
        />
      </PageShell.Actions>

      <PageShell.Content>
        <DataTable
          columns={columns}
          data={paginatedTenants}
          loading={loading}
          onRowClick={setSelectedTenant}
          pagination={{
            page: currentPage,
            pageSize: itemsPerPage,
            total: filteredTenants.length,
            onPageChange: setCurrentPage,
          }}
          emptyState={{ icon: Users, title: "No tenants found", description: "Try adjusting your filters." }}
        />

        {/* Tenant detail drawer */}
        <DetailDrawer
          open={!!selectedTenant}
          onClose={() => setSelectedTenant(null)}
          title="Tenant Details"
        >
          {selectedTenant && (
            <>
              <DetailDrawer.Section label="Personal Info">
                <DetailDrawer.Row label="Name" value={selectedTenant.name} />
                <DetailDrawer.Row label="Email" value={selectedTenant.email} />
                <DetailDrawer.Row label="Phone" value={selectedTenant.phone} />
                <DetailDrawer.Row label="Gender" value={selectedTenant.gender || "—"} />
                <DetailDrawer.Row label="School" value={selectedTenant.school || "—"} />
                <DetailDrawer.Row label="Year Level" value={selectedTenant.yearLevel || "—"} />
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Accommodation">
                <DetailDrawer.Row label="Room" value={selectedTenant.room} />
                <DetailDrawer.Row label="Branch" value={selectedTenant.branch} />
                <DetailDrawer.Row label="Room Type" value={selectedTenant.roomType} />
                <DetailDrawer.Row label="Monthly Rent">
                  {selectedTenant.monthlyRent ? `₱${Number(selectedTenant.monthlyRent).toLocaleString()}` : "—"}
                </DetailDrawer.Row>
                <DetailDrawer.Row label="Move In" value={selectedTenant.moveIn} />
                <DetailDrawer.Row label="Move Out" value={selectedTenant.moveOut} />
                <DetailDrawer.Row label="Status">
                  <StatusBadge status={selectedTenant.status} />
                </DetailDrawer.Row>
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Emergency Contact">
                <DetailDrawer.Row label="Contact" value={selectedTenant.emergencyContact || "—"} />
                <DetailDrawer.Row label="Phone" value={selectedTenant.emergencyPhone || "—"} />
              </DetailDrawer.Section>
            </>
          )}
        </DetailDrawer>
      </PageShell.Content>
    </PageShell>
  );
}
