import React from "react";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import AnnouncementsTab from "../components/profile/AnnouncementsTab";
import "../styles/tenant-common.css";

export default function AnnouncementsPage() {
  return (
    <TenantLayout>
      <div className="tenant-page">
        <AnnouncementsTab />
      </div>
    </TenantLayout>
  );
}
