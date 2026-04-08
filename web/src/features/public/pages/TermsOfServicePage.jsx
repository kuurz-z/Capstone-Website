import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SEOHead from "../../../shared/components/SEOHead";
import { useTheme } from "../context/ThemeContext";

export function TermsOfServicePage() {
  const { theme } = useTheme();
  const resolvedTheme =
    theme === "system"
      ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  const headerBackgroundColor = resolvedTheme === "dark" ? "#0A1628" : "#D4AF37";

  return (
    <div className="min-h-screen bg-gray-50">
      <SEOHead title="Terms of Service" description="Terms of service for Lilycrest Dormitory — reservation, payment, cancellation, and house rules." />
      {/* Header */}
      <div style={{ backgroundColor: headerBackgroundColor }} className="py-16 lg:py-20">
        <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <h1 className="text-4xl lg:text-5xl font-light text-white tracking-tight">
            Terms of Service
          </h1>
          <p className="text-white/50 mt-3 font-light">
            Last updated: March 2026
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-8 lg:px-12 py-16">
        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2
              className="text-xl font-medium mb-4 tracking-tight"
              style={{ color: "#0A1628" }}
            >
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-600 leading-relaxed font-light">
              By accessing or using the Lilycrest website and services, you
              agree to be bound by these Terms of Service. If you do not agree
              to these terms, please do not use our services.
            </p>
          </section>

          <section>
            <h2
              className="text-xl font-medium mb-4 tracking-tight"
              style={{ color: "#0A1628" }}
            >
              2. Reservation and Booking
            </h2>
            <p className="text-gray-600 leading-relaxed font-light">
              All reservations are subject to availability. A reservation is
              confirmed only upon receipt of the required security deposit and
              advance payment. We reserve the right to cancel or modify
              reservations in accordance with our policies.
            </p>
          </section>

          <section>
            <h2
              className="text-xl font-medium mb-4 tracking-tight"
              style={{ color: "#0A1628" }}
            >
              3. Payment Terms
            </h2>
            <p className="text-gray-600 leading-relaxed font-light">
              Monthly rent is due on or before the 5th of each month. A
              security deposit equivalent to one month's rent is required upon
              move-in, along with one month advance payment. Late payments may
              incur additional charges.
            </p>
          </section>

          <section>
            <h2
              className="text-xl font-medium mb-4 tracking-tight"
              style={{ color: "#0A1628" }}
            >
              4. Cancellation Policy
            </h2>
            <p className="text-gray-600 leading-relaxed font-light">
              Residents may cancel their contract with 30 days written notice.
              The security deposit will be refunded upon move-out, provided the
              room is in good condition and all outstanding balances are
              settled. A 7-day satisfaction guarantee applies to new residents.
            </p>
          </section>

          <section>
            <h2
              className="text-xl font-medium mb-4 tracking-tight"
              style={{ color: "#0A1628" }}
            >
              5. House Rules
            </h2>
            <p className="text-gray-600 leading-relaxed font-light">
              All residents must comply with Lilycrest's house rules and
              policies. Violation of house rules may result in warnings, fines,
              or termination of the lease agreement. Complete house rules are
              provided upon move-in.
            </p>
          </section>

          <section>
            <h2
              className="text-xl font-medium mb-4 tracking-tight"
              style={{ color: "#0A1628" }}
            >
              6. Liability
            </h2>
            <p className="text-gray-600 leading-relaxed font-light">
              Lilycrest is not liable for loss, theft, or damage to personal
              belongings of residents. Residents are encouraged to secure their
              valuables and obtain personal insurance as needed. We maintain
              insurance for common areas and building structures.
            </p>
          </section>

          <section>
            <h2
              className="text-xl font-medium mb-4 tracking-tight"
              style={{ color: "#0A1628" }}
            >
              7. Modifications
            </h2>
            <p className="text-gray-600 leading-relaxed font-light">
              We reserve the right to modify these Terms of Service at any
              time. Changes will be posted on this page with an updated
              revision date. Continued use of our services constitutes
              acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2
              className="text-xl font-medium mb-4 tracking-tight"
              style={{ color: "#0A1628" }}
            >
              8. Contact Us
            </h2>
            <p className="text-gray-600 leading-relaxed font-light">
              If you have any questions about these Terms of Service, please
              contact us at hello@lilycrest.com or call us at +63 912 345 6789.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default TermsOfServicePage;
