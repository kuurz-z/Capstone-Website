import { useEffect, useMemo, useRef, useState } from "react";
import { User, LogOut, Moon, Sun, ChevronDown, Clock, Menu } from "lucide-react";
import NotificationBell from "../../../shared/components/NotificationBell";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useAppNavigation } from "../../../shared/hooks/useAppNavigation";
import { useTheme } from "../../public/context/ThemeContext";
import { buildSignOutSuccessFlash } from "../../../shared/utils/authToasts";

export default function TopBar({
  darkMode,
  onToggleDarkMode,
  breadcrumbs,
  onOpenSidebar,
}) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const appNavigate = useAppNavigation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const resolvedDarkMode = darkMode ?? theme === "dark";
  const handleToggleDarkMode = onToggleDarkMode ?? toggleTheme;

  const displayName = useMemo(() => {
    if (!user) return "Admin User";
    return (
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.username ||
      "Admin User"
    );
  }, [user]);

  const roleLabel = useMemo(() => {
    if (!user?.role) return "Administrator";
    if (user.role === "owner") return "Owner";
    if (user.role === "branch_admin") return "Branch Admin";
    return "Administrator";
  }, [user]);

  const initials = useMemo(() => {
    if (!user) return "A";
    const first = (user.firstName || "A")[0];
    const last = (user.lastName || "")[0] || "";
    return `${first}${last}`.toUpperCase();
  }, [user]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowUserMenu(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }

    return undefined;
  }, [showUserMenu]);

  const formatDate = (date) =>
    date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatTime = (date) =>
    date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  const handleLogout = async () => {
    if (logoutInProgress) return;
    setLogoutInProgress(true);
    try {
      const result = await logout();
      if (result?.success) {
        appNavigate("/signin", {
          replace: true,
          ...buildSignOutSuccessFlash(),
        });
      }
    } catch (error) {
      console.error("Admin logout error:", error);
    } finally {
      setLogoutInProgress(false);
      setShowUserMenu(false);
    }
  };

  const currentCrumb = breadcrumbs?.[breadcrumbs.length - 1] || "Admin";

  return (
    <header
      className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur-xl md:px-6"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-light)",
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <nav
          aria-label="Breadcrumb"
          className="hidden min-w-0 items-center gap-2 overflow-hidden text-sm text-[var(--text-muted)] md:flex"
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <div key={`${crumb}-${index}`} className="flex min-w-0 items-center gap-2">
                {index > 0 && <span className="text-[var(--text-muted)]/70">/</span>}
                <span
                  className={`min-w-0 truncate ${isLast ? "font-semibold text-[var(--text-primary)]" : ""}`}
                >
                  {crumb}
                </span>
              </div>
            );
          })}
        </nav>

        <div className="min-w-0 md:hidden">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {currentCrumb}
          </div>
          <div className="text-xs text-[var(--text-muted)]">Lilycrest admin</div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 rounded-xl border px-2 py-1.5 text-[11px] sm:px-3 sm:py-2 sm:text-xs"
          style={{
            backgroundColor: "var(--bg-hover)",
            borderColor: "var(--border-light)",
          }}
        >
          <Clock className="h-4 w-4 text-[var(--text-muted)]" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-xs text-[var(--text-primary)]">{formatDate(currentDateTime)}</span>
            <span className="text-xs text-[var(--text-muted)]">{formatTime(currentDateTime)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleDarkMode}
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-primary)" }}
        >
          {resolvedDarkMode ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        <div className="shrink-0">
          <NotificationBell />
        </div>

        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setShowUserMenu((previous) => !previous)}
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition-colors hover:bg-[var(--bg-hover)] sm:px-3"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--accent-blue)" }}
            >
              {initials}
            </div>
            <div className="hidden min-w-0 text-left md:block">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {displayName}
              </div>
              <div className="text-xs text-[var(--text-muted)]">{roleLabel}</div>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-[var(--text-muted)] md:block" />
          </button>

          {showUserMenu ? (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              <div
                ref={menuRef}
                role="menu"
                className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border shadow-xl"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-light)",
                  boxShadow: "var(--shadow-xl)",
                }}
              >
                <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-light)" }}>
                  <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {displayName}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">{roleLabel}</div>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    appNavigate("/admin/users");
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: "var(--text-primary)" }}
                >
                  <User className="h-4 w-4" />
                  Profile
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  disabled={logoutInProgress}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ color: "var(--status-error)" }}
                >
                  <LogOut className="h-4 w-4" />
                  {logoutInProgress ? "Signing out..." : "Logout"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}