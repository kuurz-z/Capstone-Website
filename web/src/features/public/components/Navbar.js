import { Menu, User, X } from "lucide-react";
import { RippleButton } from "../../../registry/magicui/ripple-button";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";
import ThemeToggleButton from "./ThemeToggleButton";
import { useTheme } from "../context/ThemeContext";
import logo from "../../../assets/images/LOGO.svg";

export function Navigation({ type } = {}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const { user, isAuthenticated, loading } = useAuth();
  const { theme } = useTheme();

  const resolvedTheme =
    theme === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  const isDark = resolvedTheme === "dark";

  // Scroll listener — compact navbar after 20px
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy: highlight active nav link based on visible section
  useEffect(() => {
    const sectionIds = ["rooms", "facilities", "location", "inquiry"];
    const observers = [];

    const handleIntersect = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        const observer = new IntersectionObserver(handleIntersect, {
          rootMargin: "-20% 0px -70% 0px",
          threshold: 0,
        });
        observer.observe(el);
        observers.push(observer);
      }
    });

    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isMenuOpen]);

  // Determine profile URL based on role
  const isAdmin = user?.role === "branch_admin" || user?.role === "owner";
  const profileUrl = isAdmin ? "/admin/dashboard" : "/applicant/profile";

  // Display name: first name, or email prefix
  const displayName = user?.firstName || user?.email?.split("@")[0] || "User";

  const navLinks = [
    { href: "#rooms", label: "Rooms", id: "rooms" },
    { href: "#facilities", label: "Facilities", id: "facilities" },
    { href: "#location", label: "Location", id: "location" },
    { href: "#inquiry", label: "Contact", id: "inquiry" },
  ];

  // Colors adapt: transparent hero = always white text; scrolled = theme-aware
  const textColor = isScrolled ? "var(--lp-text)" : (isDark ? "rgba(255,255,255,0.9)" : "var(--lp-navy)");
  const textHoverColor = isScrolled ? "var(--lp-accent)" : (isDark ? "white" : "var(--lp-accent)");
  const linkHoverBg = isScrolled ? "var(--lp-icon-bg)" : (isDark ? "rgba(255,255,255,0.08)" : "rgba(10,22,40,0.06)");

  // Ghost button styles for Sign In
  const ghostBtnStyle = {
    color: isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)"),
    fontSize: "14px",
    fontWeight: "500",
    padding: "8px 22px",
    borderRadius: "24px",
    border: isScrolled ? "1px solid var(--lp-border)" : (isDark ? "1.5px solid rgba(255,255,255,0.3)" : "1.5px solid rgba(10,22,40,0.25)"),
    backgroundColor: "transparent",
    transition: "all 0.3s ease",
    textDecoration: "none",
    letterSpacing: "0.3px",
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        backgroundColor: isScrolled
          ? "var(--lp-bg)"
          : "transparent",
        backdropFilter: isScrolled ? "blur(20px) saturate(1.2)" : "none",
        boxShadow: isScrolled
          ? "var(--lp-nav-shadow)"
          : "none",
        borderBottom: isScrolled
          ? "1px solid var(--lp-border)"
          : "1px solid transparent",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        className="max-w-screen-2xl mx-auto px-8 lg:px-12"
        style={{
          paddingTop: isScrolled ? "18px" : "24px",
          paddingBottom: isScrolled ? "18px" : "24px",
          transition: "padding 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="relative flex items-center">
          {/* Logo + Theme Toggle (left side) */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="font-semibold tracking-wide no-underline inline-flex items-center gap-2"
              style={{
                color: isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)"),
                fontSize: isScrolled ? "18px" : "22px",
                transition: "all 0.4s ease",
                letterSpacing: "0.5px",
              }}
            >
              <img
                src={logo}
                alt="Lilycrest logo"
                style={{
                  width: isScrolled ? "24px" : "28px",
                  height: isScrolled ? "24px" : "28px",
                  transition: "all 0.4s ease",
                }}
              />
              Lilycrest
            </Link>
            {/* Theme Toggle — desktop only */}
            {type === "landing" && (
              <ThemeToggleButton variant={isScrolled ? "scrolled" : "hero"} />
            )}
          </div>

          {/* Desktop Nav Links — absolutely centered */}
          <div
            className="hidden md:flex items-center gap-1"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            {navLinks.map((link) => {
              const isActive = activeSection === link.id;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className="no-underline"
                  aria-current={isActive ? "true" : undefined}
                  style={{
                    color: isActive
                      ? (isScrolled ? "var(--lp-accent)" : (isDark ? "white" : "var(--lp-navy)"))
                      : textColor,
                    fontSize: "15px",
                    fontWeight: isActive ? "500" : "400",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    position: "relative",
                    transition: "color 0.2s ease, background-color 0.2s ease, font-weight 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = textHoverColor;
                      e.currentTarget.style.backgroundColor = linkHoverBg;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = textColor;
                    }
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {link.label}
                  {/* Active indicator underline */}
                  <span
                    style={{
                      position: "absolute",
                      bottom: "4px",
                      left: "50%",
                      transform: `translateX(-50%) scaleX(${isActive ? 1 : 0})`,
                      width: "20px",
                      height: "2px",
                      backgroundColor: "var(--lp-accent)",
                      borderRadius: "2px",
                      transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      transformOrigin: "center",
                    }}
                  />
                </a>
              );
            })}
          </div>

          {/* Right Side: Sign In + Book Now + Mobile hamburger */}
          <div className="flex items-center gap-3 ml-auto">
            {!loading && (
              <>
                {isAuthenticated ? (
                  <Link
                    to={profileUrl}
                    className="hidden md:flex items-center justify-center no-underline"
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: isScrolled ? "var(--lp-icon-bg)" : "rgba(255,255,255,0.15)",
                      border: isScrolled ? "1px solid var(--lp-border)" : "1.5px solid rgba(255,255,255,0.3)",
                      color: isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)"),
                      fontSize: "14px",
                      fontWeight: "500",
                      letterSpacing: "0.3px",
                      transition: "all 0.3s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isScrolled
                        ? "var(--lp-accent)"
                        : (isDark ? "rgba(255,255,255,0.25)" : "rgba(10,22,40,0.12)");
                      e.currentTarget.style.color = "white";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isScrolled
                        ? "var(--lp-icon-bg)"
                        : (isDark ? "rgba(255,255,255,0.15)" : "rgba(10,22,40,0.06)");
                      e.currentTarget.style.color = isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)");
                    }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </Link>
                ) : (
                  /* Not logged in: ghost-button Sign In */
                  <Link
                    to="/signin"
                    className="hidden md:inline-flex items-center justify-center no-underline"
                    style={ghostBtnStyle}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isScrolled
                        ? "var(--lp-icon-bg)"
                        : (isDark ? "rgba(255,255,255,0.1)" : "rgba(10,22,40,0.05)");
                      e.currentTarget.style.borderColor = isScrolled
                        ? "var(--lp-accent)"
                        : (isDark ? "rgba(255,255,255,0.5)" : "rgba(10,22,40,0.35)");
                      if (isScrolled) e.currentTarget.style.color = "var(--lp-accent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.borderColor = isScrolled
                        ? "var(--lp-border)"
                        : (isDark ? "rgba(255,255,255,0.3)" : "rgba(10,22,40,0.25)");
                      e.currentTarget.style.color = isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)");
                    }}
                  >
                    Sign In
                  </Link>
                )}
              </>
            )}
            <Link to="/applicant/check-availability">
              <RippleButton
                rippleColor="rgba(10, 22, 40, 0.4)"
                className="hidden md:block rounded-full"
                style={{
                  color: "white",
                  backgroundColor: "var(--lp-accent)",
                  fontSize: "15px",
                  fontWeight: "500",
                  padding: isScrolled ? "10px 28px" : "12px 34px",
                  transition:
                    "all 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(212, 175, 55, 0.35)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Book Now
              </RippleButton>
            </Link>
            <button
              className="md:hidden bg-transparent border-none cursor-pointer"
              style={{ color: isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)") }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-expanded={isMenuOpen}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div
            className="md:hidden mt-4 backdrop-blur-lg rounded-2xl p-6"
            style={{
              backgroundColor: isScrolled
                ? "var(--lp-bg-card)"
                : (isDark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.92)"),
              border: isScrolled
                ? "1px solid var(--lp-border)"
                : (isDark ? "none" : "1px solid rgba(10,22,40,0.12)"),
            }}
          >
            {/* Nav links with stagger animation */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {navLinks.map((link, index) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block font-light transition-colors no-underline"
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    color: activeSection === link.id
                      ? "var(--lp-accent)"
                      : (isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)")),
                    fontWeight: activeSection === link.id ? "500" : "300",
                    padding: "12px 0",
                    animation: `navFadeIn 0.3s ease forwards`,
                    animationDelay: `${index * 60}ms`,
                    opacity: 0,
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Divider */}
            <div
              style={{
                height: "1px",
                backgroundColor: isScrolled ? "var(--lp-border)" : "rgba(255,255,255,0.15)",
                margin: "12px 0",
              }}
            />

            {/* Action buttons — side by side */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                animation: "navFadeIn 0.3s ease forwards",
                animationDelay: `${navLinks.length * 60}ms`,
                opacity: 0,
              }}
            >
              {!loading &&
                (isAuthenticated ? (
                  <Link
                    to={profileUrl}
                    className="flex items-center justify-center gap-2 no-underline"
                    onClick={() => setIsMenuOpen(false)}
                    style={{
                      flex: 1,
                      color: isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)"),
                      padding: "14px 0",
                      fontWeight: "500",
                      fontSize: "15px",
                      borderRadius: "12px",
                      border: isScrolled
                        ? "1px solid var(--lp-border)"
                        : (isDark ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(10,22,40,0.2)"),
                      textAlign: "center",
                    }}
                  >
                    <User className="w-4 h-4" />
                    {displayName}
                  </Link>
                ) : (
                  <Link
                    to="/signin"
                    className="no-underline"
                    onClick={() => setIsMenuOpen(false)}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: isScrolled ? "var(--lp-text)" : (isDark ? "white" : "var(--lp-navy)"),
                      fontSize: "15px",
                      fontWeight: "500",
                      padding: "14px 0",
                      borderRadius: "12px",
                      border: isScrolled
                        ? "1px solid var(--lp-border)"
                        : (isDark ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(10,22,40,0.2)"),
                      backgroundColor: "transparent",
                      transition: "all 0.2s ease",
                    }}
                  >
                    Sign In
                  </Link>
                ))}
              <Link
                to="/applicant/check-availability"
                className="no-underline"
                onClick={() => setIsMenuOpen(false)}
                style={{ flex: 1 }}
              >
                <RippleButton
                  rippleColor="rgba(10, 22, 40, 0.4)"
                  className="w-full rounded-full"
                  style={{
                    color: "white",
                    backgroundColor: "var(--lp-accent)",
                    fontWeight: "500",
                    fontSize: "15px",
                    padding: "14px 0",
                  }}
                >
                  Book Now
                </RippleButton>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Keyframe for stagger fade-in */}
      <style>{`
        @keyframes navFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </nav>
  );
}

export default Navigation;
