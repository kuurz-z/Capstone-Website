import { useEffect, useMemo, useState } from "react";
import TenantDetailModal from "../components/TenantDetailModal";
import { showNotification } from "../../../shared/utils/notification";
import { useUsers } from "../../../shared/hooks/queries/useUsers";
import { useReservations } from "../../../shared/hooks/queries/useReservations";

import TenantStatsBar from "../components/tenants/TenantStatsBar";
import TenantToolbar from "../components/tenants/TenantToolbar";
import TenantTable from "../components/tenants/TenantTable";
import TenantPagination from "../components/tenants/TenantPagination";
import "../styles/admin-tenants.css";

export default function TenantsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch tenants (users with role="tenant") and reservations
  const { data: usersResponse, isLoading: usersLoading, error: usersError } = useUsers({ role: "tenant" });
  const { data: reservationsData = [], isLoading: reservationsLoading } = useReservations();

  const loading = usersLoading || reservationsLoading;
  const error = usersError ? "Failed to load tenants. Please try again." : null;

  const tenants = useMemo(() => {
    const users = usersResponse?.users || usersResponse || [];
    const reservations = reservationsData || [];

    return users.map((user) => {
      const userReservation = reservations
        .filter(
          (res) =>
            res.userId?._id === user._id && res.status === "checked-in",
        )
        .sort(
          (a, b) => new Date(b.checkInDate) - new Date(a.checkInDate),
        )[0];

      let status = "Active";
      if (userReservation) {
        if (
          userReservation.paymentStatus === "pending" ||
          userReservation.paymentStatus === "partial"
        ) {
          status = "Overdue";
        }
        if (userReservation.checkOutDate) {
          const daysUntilMoveOut = Math.ceil(
            (new Date(userReservation.checkOutDate) - new Date()) /
              (1000 * 60 * 60 * 24),
          );
          if (daysUntilMoveOut <= 30 && daysUntilMoveOut > 0) {
            status = "Moving Out";
          }
        }
      }

      const firstName = user.firstName || "";
      const lastName = user.lastName || "";
      const fullName =
        `${firstName} ${lastName}`.trim() || user.email || "Unknown";

      return {
        id: user._id,
        name: fullName,
        initials:
          `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
          user.email?.charAt(0).toUpperCase() ||
          "U",
        status,
        room:
          userReservation?.roomId?.name ||
          userReservation?.roomId?.roomNumber ||
          "Not Assigned",
        roomType: userReservation?.roomId?.type || "Standard Room",
        monthlyRent: userReservation?.roomId?.price || null,
        branch:
          userReservation?.roomId?.branch === "gil-puyat"
            ? "Gil Puyat"
            : userReservation?.roomId?.branch === "guadalupe"
              ? "Guadalupe"
              : "N/A",
        moveIn: userReservation?.checkInDate
          ? new Date(userReservation.checkInDate)
              .toISOString()
              .split("T")[0]
          : "-",
        moveOut: userReservation?.checkOutDate
          ? new Date(userReservation.checkOutDate)
              .toISOString()
              .split("T")[0]
          : "-",
        email: user.email || "N/A",
        phone: userReservation?.mobileNumber || user.phone || "N/A",
        reservationId: userReservation?._id,
        // Extended profile fields
        dateOfBirth: user.dateOfBirth || null,
        gender: user.gender || "",
        address: user.address || "",
        city: user.city || "",
        emergencyContact: user.emergencyContact || "",
        emergencyPhone: user.emergencyPhone || "",
        studentId: user.studentId || "",
        school: user.school || "",
        yearLevel: user.yearLevel || "",
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
    return tenants.filter((tenant) => {
      const matchesSearch =
        !term ||
        tenant.name.toLowerCase().includes(term) ||
        tenant.email.toLowerCase().includes(term) ||
        tenant.room.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === "all" || tenant.status.toLowerCase() === statusFilter;
      const matchesBranch =
        branchFilter === "all" || tenant.branch.toLowerCase() === branchFilter;
      return matchesSearch && matchesStatus && matchesBranch;
    });
  }, [searchTerm, statusFilter, branchFilter, tenants]);

  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTenants = filteredTenants.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="admin-tenants-page">
      <main className="admin-tenants-main">
        <TenantStatsBar stats={stats} />
        <TenantToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          branchFilter={branchFilter}
          onBranchChange={setBranchFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
        />

        <section className="admin-tenants-table">
          <div className="admin-tenants-table-header">
            <div>Tenant Name</div>
            <div>Contract</div>
            <div>Room / Room #</div>
            <div>Move In</div>
            <div>Move Out</div>
            <div>Contact Details</div>
            <div>Action</div>
          </div>

          <TenantTable
            tenants={paginatedTenants}
            loading={loading}
            error={error}
            onSelectTenant={setSelectedTenant}
          />

          {!loading && !error && filteredTenants.length > 0 && (
            <TenantPagination
              currentPage={currentPage}
              totalPages={totalPages}
              startIndex={startIndex}
              itemsPerPage={itemsPerPage}
              totalItems={filteredTenants.length}
              onPageChange={setCurrentPage}
            />
          )}
        </section>

        {selectedTenant && (
          <TenantDetailModal
            tenant={selectedTenant}
            onClose={() => setSelectedTenant(null)}
          />
        )}
      </main>
    </div>
  );
}
