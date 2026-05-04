import React from "react";
import Sidebar from "../../features/admin/components/Sidebar";

const AdminLayout = ({ children }) => {
  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-content">{children}</main>
    </div>
  );
};

export default AdminLayout;
