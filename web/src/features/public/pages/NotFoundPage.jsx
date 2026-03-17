import { Link } from "react-router-dom";
import { Home, ArrowRight } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0B1120",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* 404 Number */}
      <p
        style={{
          fontSize: "clamp(80px, 15vw, 160px)",
          fontWeight: "700",
          lineHeight: 1,
          color: "#FF8C42",
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
          borderRadius: "16px",
          backgroundColor: "rgba(255, 140, 66, 0.1)",
          border: "1px solid rgba(255, 140, 66, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Home style={{ width: "28px", height: "28px", color: "#FF8C42" }} />
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize: "clamp(22px, 4vw, 32px)",
          fontWeight: "600",
          color: "white",
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
          color: "rgba(255,255,255,0.5)",
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
          backgroundColor: "#FF8C42",
          color: "white",
          padding: "14px 32px",
          borderRadius: "50px",
          fontWeight: "500",
          fontSize: "15px",
          textDecoration: "none",
          boxShadow: "0 4px 20px rgba(255, 140, 66, 0.3)",
          transition: "all 0.3s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 28px rgba(255, 140, 66, 0.45)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 4px 20px rgba(255, 140, 66, 0.3)";
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
          color: "rgba(255,255,255,0.2)",
          fontWeight: "300",
          letterSpacing: "0.5px",
        }}
      >
        Lilycrest
      </p>
    </div>
  );
}
