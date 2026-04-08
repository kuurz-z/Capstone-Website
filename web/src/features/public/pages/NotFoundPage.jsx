import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import SEOHead from "../../../shared/components/SEOHead";
import { useTheme } from "../context/ThemeContext";
import logo from "../../../assets/images/LOGO.svg";

export default function NotFoundPage() {
  const { theme } = useTheme();
  const resolvedTheme =
    theme === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  const isDark = resolvedTheme === "dark";

  const pageBackground = isDark ? "#0B1120" : "#F9FAFB";
  const headingColor = isDark ? "#FFFFFF" : "#0A1628";
  const descriptionColor = isDark ? "rgba(255,255,255,0.5)" : "#4B5563";
  const brandColor = isDark ? "rgba(255,255,255,0.2)" : "#9CA3AF";
  const accentColor = "#D4AF37";
  const ctaShadow = isDark ? "0 4px 20px rgba(212, 175, 55, 0.35)" : "0 4px 20px rgba(184, 138, 26, 0.28)";
  const ctaHoverShadow = isDark ? "0 8px 28px rgba(212, 175, 55, 0.5)" : "0 8px 28px rgba(184, 138, 26, 0.42)";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pageBackground,
        padding: "2rem",
        textAlign: "center",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <SEOHead title="Page Not Found" description="The page you're looking for doesn't exist or has been moved." />
      {/* 404 Number */}
      <p
        style={{
          fontSize: "clamp(80px, 15vw, 160px)",
          fontWeight: "700",
          lineHeight: 1,
          color: accentColor,
          opacity: 0.15,
          margin: 0,
          letterSpacing: "-4px",
          userSelect: "none",
        }}
      >
        404
      </p>

      {/* Icon */}
      <div
        style={{
          marginTop: "-2rem",
          marginBottom: "1.5rem",
          width: "64px",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={logo}
          alt="Lilycrest logo"
          style={{ width: "52px", height: "52px", objectFit: "contain" }}
        />
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize: "clamp(22px, 4vw, 32px)",
          fontWeight: "600",
          color: headingColor,
          marginBottom: "0.75rem",
          letterSpacing: "-0.5px",
        }}
      >
        Page Not Found
      </h1>

      {/* Description */}
      <p
        style={{
          fontSize: "15px",
          color: descriptionColor,
          maxWidth: "380px",
          lineHeight: 1.7,
          fontWeight: "300",
          marginBottom: "2.5rem",
        }}
      >
        The page you're looking for doesn't exist or has been moved.
      </p>

      {/* CTA */}
      <Link
        to="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: accentColor,
          color: "white",
          padding: "14px 32px",
          borderRadius: "50px",
          fontWeight: "500",
          fontSize: "15px",
          textDecoration: "none",
          boxShadow: ctaShadow,
          transition: "all 0.3s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = ctaHoverShadow;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = ctaShadow;
        }}
      >
        Back to Home
        <ArrowRight style={{ width: "16px", height: "16px" }} />
      </Link>

      {/* Brand */}
      <p
        style={{
          marginTop: "3rem",
          fontSize: "13px",
          color: brandColor,
          fontWeight: "300",
          letterSpacing: "0.5px",
        }}
      >
        Lilycrest
      </p>
    </div>
  );
}
