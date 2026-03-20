import { useMemo } from "react";
import { Building2, Users, BedDouble, TrendingUp, UserCog } from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useBranchOccupancy, useRooms } from "../../../shared/hooks/queries/useRooms";
import { useUsers } from "../../../shared/hooks/queries/useUsers";
import { useBillingStats } from "../../../shared/hooks/queries/useBilling";
import "../styles/superadmin-dashboard.css";
import "../styles/superadmin-branches.css";

const BRANCHES = [
  { key: "gil-puyat", label: "Gil Puyat", color: "#6366f1" },
  { key: "guadalupe", label: "Guadalupe", color: "#f59e0b" },
];

export default function BranchManagementPage() {
  const { data: gilOccupancy } = useBranchOccupancy("gil-puyat");
  const { data: guadOccupancy } = useBranchOccupancy("guadalupe");
  const { data: allRooms = [] } = useRooms();
  const { data: usersResponse } = useUsers();
  const { data: billingStats } = useBillingStats();

  const users = usersResponse?.users || usersResponse || [];

  const branchData = useMemo(() => {
    return BRANCHES.map((branch) => {
      const occ = branch.key === "gil-puyat" ? gilOccupancy : guadOccupancy;
      const stats = occ?.statistics || occ || {};
      const rooms = (Array.isArray(allRooms) ? allRooms : []).filter(
        (r) => r.branch === branch.key
      );
      const admins = users.filter(
        (u) => (u.role === "admin" || u.role === "superAdmin") && u.branch === branch.key
      );
      const tenants = users.filter(
        (u) => u.role === "tenant" && u.branch === branch.key
      );

      const totalCapacity = stats.totalCapacity || rooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
      const totalOccupancy = stats.totalOccupancy || rooms.reduce((sum, r) => sum + (r.currentOccupancy || 0), 0);
      const occupancyRate = totalCapacity > 0
        ? ((totalOccupancy / totalCapacity) * 100).toFixed(1)
        : "0.0";

      return {
        ...branch,
        totalRooms: rooms.length,
        totalCapacity,
        totalOccupancy,
        availableBeds: totalCapacity - totalOccupancy,
        occupancyRate,
        admins,
        tenantCount: tenants.length,
      };
    });
  }, [gilOccupancy, guadOccupancy, allRooms, users]);

  return (
    <div className="sa2">
      <div className="sa2-header">
        <div>
          <p className="sa2-eyebrow">Super Admin</p>
          <h1 className="sa2-title">Branch Management</h1>
        </div>
      </div>

      {/* Branch Cards */}
      <div className="sa-branches-grid">
        {branchData.map((branch) => (
          <div key={branch.key} className="sa-branch-card">
            <div className="sa-branch-card-header">
              <div className="sa-branch-icon" style={{ background: branch.color + "18", color: branch.color }}>
                <Building2 size={22} />
              </div>
              <div>
                <h2 className="sa-branch-card-name">{branch.label}</h2>
                <span className="sa-branch-card-id">{branch.key}</span>
              </div>
            </div>

            {/* Occupancy Bar */}
            <div className="sa-branch-occupancy">
              <div className="sa-branch-occupancy-header">
                <span>Occupancy</span>
                <span className="sa-branch-occupancy-rate" style={{ color: branch.color }}>
                  {branch.occupancyRate}%
                </span>
              </div>
              <div className="sa2-bar-track">
                <div
                  className="sa2-bar-fill"
                  style={{
                    width: `${Math.min(branch.occupancyRate, 100)}%`,
                    background: branch.color,
                  }}
                />
              </div>
              <div className="sa-branch-occupancy-detail">
                {branch.totalOccupancy} / {branch.totalCapacity} beds occupied
              </div>
            </div>

            {/* Stats Grid */}
            <div className="sa-branch-stats">
              <div className="sa-branch-stat-item">
                <BedDouble size={16} className="sa-branch-stat-icon" />
                <div>
                  <span className="sa-branch-stat-value">{branch.totalRooms}</span>
                  <span className="sa-branch-stat-label">Rooms</span>
                </div>
              </div>
              <div className="sa-branch-stat-item">
                <BedDouble size={16} className="sa-branch-stat-icon" />
                <div>
                  <span className="sa-branch-stat-value">{branch.availableBeds}</span>
                  <span className="sa-branch-stat-label">Available Beds</span>
                </div>
              </div>
              <div className="sa-branch-stat-item">
                <Users size={16} className="sa-branch-stat-icon" />
                <div>
                  <span className="sa-branch-stat-value">{branch.tenantCount}</span>
                  <span className="sa-branch-stat-label">Tenants</span>
                </div>
              </div>
              <div className="sa-branch-stat-item">
                <TrendingUp size={16} className="sa-branch-stat-icon" />
                <div>
                  <span className="sa-branch-stat-value">{branch.occupancyRate}%</span>
                  <span className="sa-branch-stat-label">Occ. Rate</span>
                </div>
              </div>
            </div>

            {/* Assigned Admins */}
            <div className="sa-branch-admins">
              <div className="sa-branch-admins-header">
                <UserCog size={14} />
                <span>Assigned Staff ({branch.admins.length})</span>
              </div>
              {branch.admins.length > 0 ? (
                <div className="sa-branch-admins-list">
                  {branch.admins.map((admin) => (
                    <div key={admin._id} className="sa-branch-admin-row">
                      <span className="sa-branch-admin-name">
                        {admin.firstName} {admin.lastName}
                      </span>
                      <span className={`sa2-badge sa2-badge-${admin.role === "superAdmin" ? "checked-in" : "reserved"}`}>
                        {admin.role === "superAdmin" ? "super admin" : "admin"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="sa2-empty">No admins assigned to this branch.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
