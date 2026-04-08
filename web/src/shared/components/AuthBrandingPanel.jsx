import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "../../assets/images/LOGO.svg";

/**
 * Left-side branding panel shared by SignUp and SignIn pages.
 * Accepts a hero image URL, headline, and subtitle.
 */
const AuthBrandingPanel = ({ imageUrl, headline, subtitle }) => (
  <div
    className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
    style={{ position: "sticky", top: 0, height: "100vh" }}
  >
    <div
      className="absolute inset-0 z-10"
      style={{
        background:
          "linear-gradient(135deg, rgba(30, 30, 30, 0.7) 0%, rgba(45, 45, 45, 0.65) 50%, rgba(60, 60, 60, 0.6) 100%)",
      }}
    ></div>
    <img
      src={imageUrl}
      alt="Lilycrest Dormitory"
      className="absolute inset-0 w-full h-full object-cover"
    />

    <div className="relative z-20">
      <Link
        to="/"
        className="inline-flex items-center gap-2 transition-colors"
        style={{ color: "rgba(255, 255, 255, 0.82)" }}
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm font-light">Back to website</span>
      </Link>
    </div>

    <div className="relative z-20">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center">
          <img src={logo} alt="Lilycrest logo" className="w-8 h-8" />
        </div>
        <span className="font-semibold text-2xl tracking-wide" style={{ color: "#FFFFFF" }}>
          Lilycrest
        </span>
      </div>
      <h2 className="text-5xl font-light mb-4 leading-tight" style={{ color: "#FFFFFF" }}>
        {headline.split(/<br\s*\/?>/i)[0]}
        {headline.split(/<br\s*\/?>/i)[1] && (
          <>
            <br />
            <span style={{ color: "#D4AF37" }}>{headline.split(/<br\s*\/?>/i)[1]}</span>
          </>
        )}
      </h2>
      <p className="font-light text-lg" style={{ color: "rgba(255, 255, 255, 0.82)" }}>{subtitle}</p>
    </div>

    <div className="relative z-20 flex gap-2"></div>
  </div>
);

export default AuthBrandingPanel;
