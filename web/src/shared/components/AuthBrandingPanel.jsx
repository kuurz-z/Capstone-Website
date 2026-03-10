import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";

/**
 * Left-side branding panel shared by SignUp and SignIn pages.
 * Accepts a hero image URL, headline, and subtitle.
 */
const AuthBrandingPanel = ({ imageUrl, headline, subtitle }) => (
  <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-black/40 to-black/60 z-10"></div>
    <img
      src={imageUrl}
      alt="Lilycrest Dormitory"
      className="absolute inset-0 w-full h-full object-cover"
    />

    <div className="relative z-20">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm font-light">Back to website</span>
      </Link>
    </div>

    <div className="relative z-20">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
          <Home className="w-6 h-6" style={{ color: "#0C375F" }} />
        </div>
        <span className="font-semibold text-2xl text-white tracking-wide">
          Lilycrest
        </span>
      </div>
      <h2
        className="text-5xl font-light text-white mb-4 leading-tight"
        dangerouslySetInnerHTML={{ __html: headline }}
      />
      <p className="text-white/70 font-light text-lg">{subtitle}</p>
    </div>

    <div className="relative z-20 flex gap-2"></div>
  </div>
);

export default AuthBrandingPanel;
