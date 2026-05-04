import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { CheckCircle, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { auth } from "../../../firebase/config";
import AuthBrandingPanel from "../../../shared/components/AuthBrandingPanel";
import Lounge from "../../../assets/images/facilities/RD Lounge Area.jpg";

const rules = [
  { label: "At least 8 characters", test: (value) => value.length >= 8 },
  { label: "At least 1 uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { label: "At least 1 lowercase letter", test: (value) => /[a-z]/.test(value) },
  { label: "At least 1 number", test: (value) => /\d/.test(value) },
  { label: "At least 1 special character", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get("oobCode");
  const [status, setStatus] = useState("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!oobCode) {
      setStatus("error");
      return;
    }

    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [oobCode]);

  useEffect(() => {
    if (status !== "success") return undefined;
    const timer = window.setTimeout(() => {
      navigate("/signin", { replace: true });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [navigate, status]);

  const ruleState = useMemo(
    () => rules.map((rule) => ({ ...rule, passed: rule.test(password) })),
    [password],
  );
  const passwordValid = ruleState.every((rule) => rule.passed);
  const confirmValid = Boolean(confirmPassword) && confirmPassword === password;
  const canSubmit = status === "ready" && passwordValid && confirmValid && !submitting;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || !oobCode) return;

    setSubmitting(true);
    setErrorMessage("");
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("This reset link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderPasswordInput = ({
    id,
    label,
    value,
    onChange,
    visible,
    setVisible,
    autoComplete,
  }) => (
    <div>
      <label htmlFor={id} className="block text-sm font-light text-gray-700 mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="w-full px-4 py-4 pr-12 rounded-xl bg-gray-50 border border-gray-200 focus:border-gray-300 focus:outline-none text-gray-900 font-light placeholder:text-gray-400 transition-colors"
          disabled={submitting}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ backgroundColor: "#0A1628" }}>
      <AuthBrandingPanel
        imageUrl={Lounge}
        headline="Create A<br/>New Password"
        subtitle="Secure your Lilycrest account"
      />

      <div className="flex items-center justify-center p-8 lg:p-12 bg-white">
        <div className="w-full max-w-md">
          {status === "checking" && (
            <div className="text-center">
              <Loader2 className="animate-spin mx-auto mb-5" style={{ width: 36, height: 36, color: "#D4AF37" }} />
              <h1 className="text-3xl font-light mb-3 tracking-tight" style={{ color: "#0A1628" }}>
                Checking reset link
              </h1>
              <p className="text-gray-600 font-light">Please wait while we verify your request.</p>
            </div>
          )}

          {status === "ready" && (
            <>
              <div className="mb-8">
                <h1 className="text-4xl font-light mb-3 tracking-tight" style={{ color: "#0A1628" }}>
                  Reset password
                </h1>
                <p className="text-gray-600 font-light" style={{ lineHeight: 1.6 }}>
                  Enter a new password for {email || "your account"}.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {renderPasswordInput({
                  id: "new-password",
                  label: "New password",
                  value: password,
                  onChange: (event) => setPassword(event.target.value),
                  visible: showPassword,
                  setVisible: setShowPassword,
                  autoComplete: "new-password",
                })}

                <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2">
                  {ruleState.map((rule) => (
                    <div
                      key={rule.label}
                      className="flex items-center gap-2 text-sm"
                      style={{ color: rule.passed ? "#10B981" : "#6B7280" }}
                    >
                      <span>{rule.passed ? "✓" : "•"}</span>
                      <span>{rule.label}</span>
                    </div>
                  ))}
                </div>

                {renderPasswordInput({
                  id: "confirm-password",
                  label: "Confirm password",
                  value: confirmPassword,
                  onChange: (event) => setConfirmPassword(event.target.value),
                  visible: showConfirm,
                  setVisible: setShowConfirm,
                  autoComplete: "new-password",
                })}

                {confirmPassword && !confirmValid && (
                  <p className="text-sm" style={{ color: "#EF4444" }}>
                    Confirm password must match.
                  </p>
                )}

                {errorMessage && (
                  <p className="text-sm" style={{ color: "#EF4444" }}>
                    {errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-4 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base flex items-center justify-center gap-2"
                  style={{ backgroundColor: "#D4AF37", opacity: canSubmit ? 1 : 0.65 }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Reset password"
                  )}
                </button>
              </form>
            </>
          )}

          {status === "success" && (
            <div className="text-center">
              <CheckCircle className="mx-auto mb-5" style={{ width: 56, height: 56, color: "#10B981" }} />
              <h1 className="text-3xl font-light mb-3 tracking-tight" style={{ color: "#0A1628" }}>
                Password reset successfully.
              </h1>
              <p className="text-gray-600 font-light mb-8">Redirecting to sign in in 3 seconds.</p>
              <Link
                to="/signin"
                className="block w-full py-4 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base"
                style={{ backgroundColor: "#D4AF37" }}
              >
                Back to sign in
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="text-center">
              <XCircle className="mx-auto mb-5" style={{ width: 56, height: 56, color: "#EF4444" }} />
              <h1 className="text-3xl font-light mb-3 tracking-tight" style={{ color: "#0A1628" }}>
                Reset link unavailable
              </h1>
              <p className="text-gray-600 font-light mb-8">
                This reset link is invalid or has expired.
              </p>
              <div className="space-y-3">
                <Link
                  to="/forgot-password"
                  className="block w-full py-4 rounded-xl text-white font-light hover:opacity-90 transition-opacity text-base"
                  style={{ backgroundColor: "#D4AF37" }}
                >
                  Request new reset link
                </Link>
                <Link
                  to="/signin"
                  className="block w-full py-3 rounded-xl text-sm font-light text-gray-700 hover:text-gray-900 transition-colors"
                  style={{ backgroundColor: "#F3F4F6" }}
                >
                  Back to sign in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
