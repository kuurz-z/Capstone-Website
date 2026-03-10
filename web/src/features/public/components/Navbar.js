import { Home, Menu, User } from "lucide-react";
import { RippleButton } from "../../../registry/magicui/ripple-button";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";

export function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, isAuthenticated, loading } = useAuth();

  // Scroll listener — compact navbar after 20px
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Determine profile URL based on role
  const isAdmin = user?.role === "admin" || user?.role === "superAdmin";
  const profileUrl = isAdmin ? "/admin/dashboard" : "/applicant/profile";

  // Display name: first name, or email prefix
  const displayName = user?.firstName || user?.email?.split("@")[0] || "User";

  const navLinks = [
    { href: "#rooms", label: "Rooms" },
    { href: "#pricing", label: "Pricing" },
    { href: "#facilities", label: "Facilities" },
    { href: "#location", label: "Location" },
    { href: "#inquiry", label: "Inquiry" },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        backgroundColor: isScrolled
          ? "rgba(12, 55, 95, 0.97)"
          : "rgba(12, 55, 95, 0.6)",
        backdropFilter: isScrolled ? "blur(20px) saturate(1.2)" : "blur(8px)",
        boxShadow: isScrolled
          ? "0 1px 0 rgba(255,255,255,0.05), 0 4px 20px rgba(0,0,0,0.15)"
          : "none",
        borderBottom: isScrolled
          ? "1px solid rgba(255,255,255,0.04)"
          : "1px solid transparent",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        className="max-w-7xl mx-auto px-8 lg:px-12"
        style={{
          paddingTop: isScrolled ? "12px" : "24px",
          paddingBottom: isScrolled ? "12px" : "24px",
          transition: "padding 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center"
              style={{
                width: isScrolled ? "30px" : "32px",
                height: isScrolled ? "30px" : "32px",
                borderRadius: "8px",
                backgroundColor: "rgba(255,255,255,0.9)",
                backdropFilter: "blur(4px)",
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <Home className="w-4 h-4" style={{ color: "#0C375F" }} />
            </div>
            <Link
              to="/"
              className="font-semibold text-lg text-white tracking-wide no-underline"
              style={{
                fontSize: isScrolled ? "17px" : "20px",
                transition: "font-size 0.4s ease",
              }}
            >
              Lilycrest
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="no-underline"
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "14px",
                  fontWeight: "400",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  transition: "color 0.2s ease, background-color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "white";
                  e.currentTarget.style.backgroundColor =
                    "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
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
                      backgroundColor: "#E7710F",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: "600",
                      letterSpacing: "0.3px",
                      transition: "box-shadow 0.2s ease, transform 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow =
                        "0 0 0 3px rgba(231,113,15,0.3), 0 4px 12px rgba(231,113,15,0.2)";
                      e.currentTarget.style.transform = "scale(1.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </Link>
                ) : (
                  /* Not logged in: show Sign In */
                  <Link
                    to="/signin"
                    className="hidden md:block no-underline"
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      fontSize: "14px",
                      fontWeight: "400",
                      transition: "color 0.2s ease",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "white")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "rgba(255,255,255,0.7)")
                    }
                  >
                    Sign In
                  </Link>
                )}
              </>
            )}
            <Link to="/applicant/check-availability">
              <RippleButton
                rippleColor="rgba(12, 55, 95, 0.4)"
                className="hidden md:block rounded-full"
                style={{
                  color: "#0C375F",
                  backgroundColor: "white",
                  fontSize: "14px",
                  fontWeight: "500",
                  padding: isScrolled ? "9px 26px" : "11px 32px",
                  transition:
                    "all 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(255,255,255,0.15)";
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
              className="md:hidden text-white bg-transparent border-none cursor-pointer"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 bg-white/10 backdrop-blur-lg rounded-2xl p-6 space-y-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block text-white hover:text-white/80 transition-colors font-light"
              >
                {link.label}
              </a>
            ))}
            {!loading &&
              (isAuthenticated ? (
                <Link
                  to={profileUrl}
                  className="flex items-center gap-2 text-white/70 hover:text-white transition-colors font-light no-underline"
                >
                  <User className="w-4 h-4" />
                  {displayName}
                </Link>
              ) : (
                <Link
                  to="/signin"
                  className="block text-white/70 hover:text-white transition-colors font-light no-underline"
                >
                  Sign In
                </Link>
              ))}
            <Link to="/applicant/check-availability">
              <RippleButton
                rippleColor="rgba(12, 55, 95, 0.4)"
                className="w-full bg-white rounded-full font-light"
                style={{ color: "#0C375F" }}
              >
                Book Now
              </RippleButton>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navigation;
