import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useCurrentResidents } from "../../../shared/hooks/queries/useReservations";
import { useUsers } from "../../../shared/hooks/queries/useUsers";
import {
  PageShell,
  SummaryBar,
  ActionBar,
  DataTable,
  StatusBadge,
  DetailDrawer,
} from "../components/shared";
import { formatBranch, formatRoomType } from "../utils/formatters";
import {
  readMoveInDate,
  readMoveOutDate,
} from "../../../shared/utils/lifecycleNaming";
import "../styles/design-tokens.css";
import "../styles/admin-tenants.css";

const ITEMS_PER_PAGE = 10;

const getInitials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "-";

const getTenantStatus = (reservation) => {
  const moveOutDate = readMoveOutDate(reservation);
  if (moveOutDate) {
    const daysLeft = Math.ceil((new Date(moveOutDate) - new Date()) / 86_400_000);
    if (daysLeft <= 0) return { key: "overdue", label: "Overdue" };
    if (daysLeft <= 30) return { key: "moving-out", label: "Moving Out" };
  }

  if (reservation.paymentStatus === "pending" || reservation.paymentStatus === "partial") {
    return { key: "overdue", label: "Overdue" };
  }

  return { key: "active", label: "Active" };
};

export default function TenantsPage() {
  const { user, loading: authLoading } = useAuth();
  const isOwner = user?.role === "owner";
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState(isOwner ? "all" : user?.branch || "all");
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const currentResidentsParams = useMemo(
    () => ({
      ...((branchFilter && branchFilter !== "all") ? { branch: branchFilter } : {}),
    }),
    [branchFilter],
  );

  const {
    data: currentResidentsData,
    isLoading,
    isFetching,
    isError,
    error,
  } = useCurrentResidents(currentResidentsParams, {
    enabled: !authLoading && !!user,
  });
  const {
    data: tenantUsersData,
    isLoading: tenantUsersLoading,
    isFetching: tenantUsersFetching,
  } = useUsers({
    role: "tenant",
    ...(branchFilter && branchFilter !== "all" ? { branch: branchFilter } : {}),
    limit: 50,
    sort: "firstName",
    order: "asc",
  });
  const reservationsData = currentResidentsData?.residents || [];
  const tenantUsers = tenantUsersData?.users || [];
  const residentsLoading =
    authLoading || isLoading || isFetching || tenantUsersLoading || tenantUsersFetching;

  const tenants = useMemo(() => {
    const reservations = Array.isArray(reservationsData) ? reservationsData : [];
    const reservationTenants = reservations.map((reservation) => {
      const profile = reservation.userId || {};
      const room = reservation.roomId;
      const firstName = profile.firstName || reservation.firstName || "";
      const lastName = profile.lastName || reservation.lastName || "";
      const fullName = `${firstName} ${lastName}`.trim() || profile.email || "Unknown";
      const tenantStatus = getTenantStatus(reservation);

      return {
        id: reservation.id || reservation.reservationId || reservation._id,
        reservationId: reservation.reservationId || reservation._id,
        reservationCode: reservation.reservationCode || "-",
        userId: reservation.userId || profile._id,
        name: reservation.name || fullName,
        initials: getInitials(reservation.name || fullName),
        email: reservation.email || profile.email || "N/A",
        phone: reservation.phone || reservation.mobileNumber || profile.phone || "N/A",
        statusKey: tenantStatus.key,
        status: tenantStatus.label,
        room: reservation.room || room?.name || room?.roomNumber || "Not Assigned",
        roomId: reservation.roomId || room?._id,
        branch: formatBranch(room?.branch) || "N/A",
        branchRaw: room?.branch || "",
        floor: room?.floor || "-",
        roomType: formatRoomType(room?.type) || "-",
        monthlyRent: reservation.monthlyRent || room?.price || null,
        moveIn: fmtDate(readMoveInDate(reservation)),
        moveOut: fmtDate(readMoveOutDate(reservation)),
        bed: reservation.selectedBed?.position
          ? `${reservation.selectedBed.position.charAt(0).toUpperCase()}${reservation.selectedBed.position.slice(1)} Bed`
          : "-",
        leaseDuration: reservation.leaseDuration
          ? `${reservation.leaseDuration} month${reservation.leaseDuration > 1 ? "s" : ""}`
          : "-",
        emergencyContact: reservation.emergencyContact?.name || "-",
        emergencyPhone: reservation.emergencyContact?.contactNumber || "-",
        emergencyRelation: reservation.emergencyContact?.relationship || "-",
        nationality: reservation.nationality || "-",
        maritalStatus: reservation.maritalStatus || "-",
        school: reservation.employment?.employerSchool || "-",
        occupation: reservation.employment?.occupation || "-",
      };
    });

    const reservationUserIds = new Set(
      reservationTenants
        .map((tenant) => tenant.userId?._id || tenant.userId)
        .filter(Boolean)
        .map(String),
    );

    const manualTenants = (Array.isArray(tenantUsers) ? tenantUsers : [])
      .filter((tenantUser) => !reservationUserIds.has(String(tenantUser._id)))
      .map((tenantUser) => {
        const fullName =
          `${tenantUser.firstName || ""} ${tenantUser.lastName || ""}`.trim() ||
          tenantUser.email ||
          "Unknown";

        return {
          id: tenantUser._id,
          reservationId: null,
          reservationCode: "-",
          userId: tenantUser._id,
          name: fullName,
          initials: getInitials(fullName),
          email: tenantUser.email || "N/A",
          phone: tenantUser.phone || "N/A",
          statusKey: tenantUser.accountStatus === "active" ? "active" : "overdue",
          status: tenantUser.accountStatus === "active" ? "Active" : "Overdue",
          room: "Not Assigned",
          roomId: null,
          branch: formatBranch(tenantUser.branch) || "N/A",
          branchRaw: tenantUser.branch || "",
          floor: "-",
          roomType: "-",
          monthlyRent: null,
          moveIn: "-",
          moveOut: "-",
          bed: "-",
          leaseDuration: "-",
          emergencyContact: tenantUser.emergencyContact || "-",
          emergencyPhone: tenantUser.emergencyPhone || "-",
          emergencyRelation: "-",
          nationality: tenantUser.nationality || "-",
          maritalStatus: tenantUser.civilStatus || "-",
          school: tenantUser.school || "-",
          occupation: tenantUser.occupation || "-",
        };
      });

    return [...reservationTenants, ...manualTenants];
  }, [reservationsData, tenantUsers]);

  const stats = useMemo(
    () => ({
      total: tenants.length,
      active: tenants.filter((tenant) => tenant.statusKey === "active").length,
      overdue: tenants.filter((tenant) => tenant.statusKey === "overdue").length,
      movingOut: tenants.filter((tenant) => tenant.statusKey === "moving-out").length,
    }),
    [tenants],
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return tenants.filter((tenant) => {
      const matchSearch =
        !term ||
        tenant.name.toLowerCase().includes(term) ||
        tenant.email.toLowerCase().includes(term) ||
        tenant.room.toLowerCase().includes(term) ||
        tenant.reservationCode.toLowerCase().includes(term);
      const matchStatus = statusFilter === "all" || tenant.statusKey === statusFilter;
      const matchBranch = branchFilter === "all" || tenant.branchRaw === branchFilter;
      return matchSearch && matchStatus && matchBranch;
    });
  }, [searchTerm, statusFilter, branchFilter, tenants]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, branchFilter]);

  useEffect(() => {
    const nextPageCount = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    if (currentPage > nextPageCount) {
      setCurrentPage(nextPageCount);
    }
  }, [filtered.length, currentPage]);

  const summaryItems = [
    { label: "Current Residents", value: stats.total, color: "blue" },
    { label: "Active", value: stats.active, color: "green" },
    { label: "Overdue", value: stats.overdue, color: "red" },
    { label: "Moving Out Soon", value: stats.movingOut, color: "orange" },
  ];

  const filters = [
    ...(isOwner
      ? [
          {
            key: "branch",
            options: [
              { value: "all", label: "All Branches" },
              { value: "gil-puyat", label: "Gil Puyat" },
              { value: "guadalupe", label: "Guadalupe" },
            ],
            value: branchFilter,
            onChange: setBranchFilter,
          },
        ]
      : []),
    {
      key: "status",
      options: [
        { value: "all", label: "All Status" },
        { value: "active", label: "Active" },
        { value: "overdue", label: "Overdue" },
        { value: "moving-out", label: "Moving Out" },
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
            <span className="tenant-cell__meta">{row.phone}</span>
          </div>
        </div>
      ),
    },
    {
      key: "room",
      label: "Room",
      sortable: true,
      render: (row) => (
        <div className="tenant-room-cell">
          <span className="tenant-room-cell__primary">{row.room}</span>
          <span className="tenant-room-cell__secondary">{row.bed}</span>
        </div>
      ),
    },
    ...(isOwner ? [{ key: "branch", label: "Branch", sortable: true }] : []),
    { key: "roomType", label: "Type", sortable: true },
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
          search={{
            value: searchTerm,
            onChange: setSearchTerm,
            placeholder: "Search by name, email, room, or code...",
          }}
          filters={filters}
        />
      </PageShell.Actions>

      <PageShell.Content>
        <DataTable
          columns={columns}
          data={filtered}
          loading={residentsLoading}
          onRowClick={setSelectedTenant}
          pagination={{
            page: currentPage,
            pageSize: ITEMS_PER_PAGE,
            total: filtered.length,
            onPageChange: setCurrentPage,
          }}
          emptyState={
            isError
              ? {
                  icon: Users,
                  title: "Unable to load residents",
                  description: error?.message || "The residents list could not be fetched right now.",
                }
              : {
                  icon: Users,
                  title: "No moved-in residents",
                  description: "Residents appear here once an admin completes their move-in.",
                }
          }
        />

        <DetailDrawer
          open={!!selectedTenant}
          onClose={() => setSelectedTenant(null)}
          title="Tenant Details"
        >
          {selectedTenant && (
            <>
              <DetailDrawer.Section label="Personal Info">
                <DetailDrawer.Row label="Full Name" value={selectedTenant.name} />
                <DetailDrawer.Row label="Email" value={selectedTenant.email} />
                <DetailDrawer.Row label="Phone" value={selectedTenant.phone} />
                <DetailDrawer.Row label="Nationality" value={selectedTenant.nationality} />
                <DetailDrawer.Row label="Civil Status" value={selectedTenant.maritalStatus} />
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Accommodation">
                <DetailDrawer.Row label="Reservation" value={selectedTenant.reservationCode} />
                <DetailDrawer.Row label="Room" value={selectedTenant.room} />
                <DetailDrawer.Row label="Branch" value={selectedTenant.branch} />
                <DetailDrawer.Row label="Floor" value={String(selectedTenant.floor)} />
                <DetailDrawer.Row label="Room Type" value={selectedTenant.roomType} />
                <DetailDrawer.Row label="Bed" value={selectedTenant.bed} />
                <DetailDrawer.Row label="Lease Duration" value={selectedTenant.leaseDuration} />
                <DetailDrawer.Row label="Monthly Rent">
                  {selectedTenant.monthlyRent
                    ? `PHP ${Number(selectedTenant.monthlyRent).toLocaleString()}`
                    : "-"}
                </DetailDrawer.Row>
                <DetailDrawer.Row label="Move In" value={selectedTenant.moveIn} />
                <DetailDrawer.Row label="Move Out" value={selectedTenant.moveOut} />
                <DetailDrawer.Row label="Status">
                  <StatusBadge status={selectedTenant.status} />
                </DetailDrawer.Row>
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Emergency Contact">
                <DetailDrawer.Row label="Name" value={selectedTenant.emergencyContact} />
                <DetailDrawer.Row label="Phone" value={selectedTenant.emergencyPhone} />
                <DetailDrawer.Row label="Relationship" value={selectedTenant.emergencyRelation} />
              </DetailDrawer.Section>

              <DetailDrawer.Section label="Employment / School">
                <DetailDrawer.Row label="Employer / School" value={selectedTenant.school} />
                <DetailDrawer.Row label="Occupation" value={selectedTenant.occupation} />
              </DetailDrawer.Section>
            </>
          )}
        </DetailDrawer>
      </PageShell.Content>
    </PageShell>
  );
}
