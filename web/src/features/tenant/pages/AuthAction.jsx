import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { applyActionCode } from "firebase/auth";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { auth } from "../../../firebase/config";
import AuthBrandingPanel from "../../../shared/components/AuthBrandingPanel";
import Lounge from "../../../assets/images/facilities/RD Lounge Area.jpg";

function AuthAction() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Confirming your request...");

  useEffect(() => {
    const mode = searchParams.get("mode");
    const oobCode = searchParams.get("oobCode");
    const continueUrl = searchParams.get("continueUrl");

    if (!mode || !oobCode) {
      setStatus("error");
      setMessage("This link is invalid or has expired.");
      return;
    }

    if (mode === "resetPassword") {
      const params = new URLSearchParams({ oobCode });
      if (continueUrl) params.set("continueUrl", continueUrl);
      navigate(`/reset-password?${params.toString()}`, { replace: true });
      return;
    }

    if (mode !== "verifyEmail") {
      setStatus("error");
      setMessage("This action link is not supported.");
      return;
    }

    applyActionCode(auth, oobCode)
      .then(() => {
        setStatus("success");
        setMessage("Email verified successfully.");
        window.setTimeout(() => {
          navigate("/signin?verified=true", { replace: true });
        }, 3000);
      })
      .catch(() => {
        setStatus("error");
        setMessage("This verification link is invalid or has expired.");
      });
  }, [navigate, searchParams]);

  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ backgroundColor: "#0A1628" }}>
      <AuthBrandingPanel
        imageUrl={Lounge}
        headline="Secure<br/>Access"
        subtitle="Lilycrest account verification"
      />

      <div className="flex items-center justify-center p-8 lg:p-12 bg-white">
        <div className="w-full max-w-md text-center">
          <div
            style={{
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              backgroundColor: isSuccess ? "#ECFDF5" : isError ? "#FEF2F2" : "#FEF6E0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            {isSuccess ? (
              <CheckCircle style={{ width: 30, height: 30, color: "#10B981" }} />
            ) : isError ? (
              <XCircle style={{ width: 30, height: 30, color: "#EF4444" }} />
            ) : (
              <Loader2 className="animate-spin" style={{ width: 30, height: 30, color: "#D4AF37" }} />
            )}
          </div>

          <h1 className="text-3xl font-light mb-3 tracking-tight" style={{ color: "#0A1628" }}>
            {isSuccess ? "Email verified" : isError ? "Link unavailable" : "Please wait"}
          </h1>
          <p className="text-gray-600 font-light mb-8" style={{ lineHeight: 1.6 }}>
            {message}
            {isSuccess && (
              <>
                <br />
                Redirecting to sign in...
              </>
            )}
          </p>

          {isError && (
            <div className="space-y-3">
              <Link
                to="/signin"
                className="block w-full py-4 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base"
                style={{ backgroundColor: "#D4AF37" }}
              >
                Back to sign in
              </Link>
              <Link
                to="/forgot-password"
                className="block w-full py-3 rounded-xl text-sm font-light text-gray-700 hover:text-gray-900 transition-colors"
                style={{ backgroundColor: "#F3F4F6" }}
              >
                Request new reset link
              </Link>
            </div>
          )}

          {isSuccess && (
            <Link
              to="/signin?verified=true"
              className="block w-full py-4 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base"
              style={{ backgroundColor: "#D4AF37" }}
            >
              Back to sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthAction;
