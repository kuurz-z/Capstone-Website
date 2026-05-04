import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./AdminSidebar";
import RouteTransitionBoundary from "../../../shared/components/RouteTransitionBoundary";
import useSocketClient from "../../../shared/hooks/useSocketClient";
import { useRouteFlash } from "../../../shared/hooks/useRouteFlash";
import { getPageMeta } from "./adminShellMeta.mjs";
import { useTheme } from "../../public/context/ThemeContext";
import TopBar from "./TopBar";
import "../styles/admin-layout.css";
import "../styles/admin-common.css";

const COLLAPSE_STORAGE_KEY = "sidebar-collapsed";

export default function AdminLayout() {
 useSocketClient();
 const location = useLocation();
 useRouteFlash();
 const { theme, toggleTheme } = useTheme();
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const contentRef = useRef(null);
 const [collapsed, setCollapsed] = useState(() => {
 try {
 return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
 } catch {
 return false;
 }
 });

 const pageMeta = getPageMeta(location.pathname, location.search);

 const handleToggleCollapse = () => {
 setCollapsed((prev) => {
 const next = !prev;
 try {
 localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
 } catch {}
 return next;
 });
 };

 useEffect(() => {
 contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
 }, [location.pathname, location.search]);

 const breadcrumbs = ["Admin", pageMeta.title];

 return (
 <div className={`admin-layout ${collapsed ? "admin-layout--collapsed" : ""}`}>
 <Sidebar
 isOpen={sidebarOpen}
 onClose={() => setSidebarOpen(false)}
 collapsed={collapsed}
 onToggleCollapse={handleToggleCollapse}
 />

 <div className="admin-layout-main">
 <TopBar
 darkMode={theme === "dark"}
 onToggleDarkMode={toggleTheme}
 breadcrumbs={breadcrumbs}
 onOpenSidebar={() => setSidebarOpen(true)}
 />

 {/* Page Content */}
 <main
 ref={contentRef}
 className="admin-content"
 >
 <RouteTransitionBoundary
 routeKey={`${location.pathname}${location.search}`}
 >
 <Outlet />
 </RouteTransitionBoundary>
 </main>
 </div>

 {/* Mobile overlay */}
 {sidebarOpen && (
 <div
 className="admin-sidebar-overlay"
 onClick={() => setSidebarOpen(false)}
 />
 )}
 </div>
 );
}
