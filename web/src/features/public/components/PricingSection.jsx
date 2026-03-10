import { Check, X } from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/hooks/useAuth";

const pricingPlans = [
  {
    type: "Private Room",
    price: "₱8,500",
    branch: "Gil Puyat",
    popular: false,
    included: [
      "Single Bed",
      "Study Desk & Chair",
      "Personal Closet",
      "Air Conditioning",
      "High-Speed Wi-Fi",
      "Electricity (up to ₱800)",
      "Water",
      "Weekly Cleaning",
      "All Facilities Access",
    ],
    excluded: ["Excess Electricity", "Personal Laundry Detergent"],
  },
  {
    type: "Double Occupancy",
    price: "₱5,000",
    branch: "Gil Puyat",
    popular: true,
    included: [
      "2 Single Beds",
      "2 Study Desks",
      "Shared Closet",
      "Air Conditioning",
      "High-Speed Wi-Fi",
      "Electricity (up to ₱800)",
      "Water",
      "Weekly Cleaning",
      "All Facilities Access",
    ],
    excluded: ["Excess Electricity", "Personal Laundry Detergent"],
  },
  {
    type: "Quadruple Room",
    price: "₱3,500",
    branch: "Gil Puyat & Guadalupe",
    popular: false,
    included: [
      "4 Beds (Bunk Style)",
      "4 Study Desks",
      "Shared Storage",
      "Air Conditioning",
      "High-Speed Wi-Fi",
      "Electricity (up to ₱600)",
      "Water",
      "Weekly Cleaning",
      "All Facilities Access",
    ],
    excluded: ["Excess Electricity", "Personal Laundry Detergent"],
  },
];

export function PricingSection() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const handleReserve = () => {
    if (loading) return;
    if (isAuthenticated) {
      navigate("/applicant/reserve");
    } else {
      setShowLoginDialog(true);
    }
  };

  return (
    <section className="py-24 lg:py-32 bg-white" id="pricing">
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-20">
          <p className="text-xs text-gray-400 mb-3 tracking-widest uppercase font-light">
            Transparent Pricing
          </p>
          <h2
            className="text-4xl lg:text-5xl font-light mb-5 tracking-tight"
            style={{ color: "#0C375F" }}
          >
            Monthly Rates & Inclusions
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto font-light leading-relaxed">
            No hidden fees, no surprises. Here's exactly what you're paying for
            each month.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {pricingPlans.map((plan, index) => (
            <div
              key={index}
              className={`rounded-3xl overflow-hidden border-2 transition-all duration-300 hover:shadow-2xl ${
                plan.popular
                  ? "border-transparent shadow-xl"
                  : "border-gray-100 hover:border-gray-200"
              }`}
              style={plan.popular ? { borderColor: "#E7710F" } : {}}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div
                  className="text-center py-3 text-white text-xs font-light tracking-wider uppercase"
                  style={{ backgroundColor: "#E7710F" }}
                >
                  Most Popular
                </div>
              )}

              <div className="p-8">
                {/* Header */}
                <div className="mb-8">
                  <h3
                    className="text-2xl font-normal mb-2 tracking-tight"
                    style={{ color: "#0C375F" }}
                  >
                    {plan.type}
                  </h3>
                  <p className="text-xs text-gray-400 font-light mb-6">
                    {plan.branch}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-5xl font-light tracking-tight"
                      style={{ color: "#E7710F" }}
                    >
                      {plan.price}
                    </span>
                    <span className="text-gray-400 text-sm font-light">
                      /month
                    </span>
                  </div>
                </div>

                {/* Included */}
                <div className="mb-6">
                  <p className="text-xs text-gray-400 mb-4 font-light tracking-wider uppercase">
                    What's Included
                  </p>
                  <ul className="space-y-3">
                    {plan.included.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check
                          className="w-4 h-4 mt-0.5 flex-shrink-0"
                          style={{ color: "#EDB938" }}
                        />
                        <span className="text-sm text-gray-600 font-light">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Excluded */}
                <div className="mb-8">
                  <p className="text-xs text-gray-400 mb-4 font-light tracking-wider uppercase">
                    Not Included
                  </p>
                  <ul className="space-y-3">
                    {plan.excluded.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <X className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-300" />
                        <span className="text-sm text-gray-400 font-light">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <Button
                  onClick={handleReserve}
                  className={`w-full py-6 rounded-full font-light transition-all ${
                    plan.popular
                      ? "text-white hover:opacity-90"
                      : "bg-transparent border hover:bg-gray-50"
                  }`}
                  style={
                    plan.popular
                      ? { backgroundColor: "#E7710F" }
                      : { borderColor: "#E7710F", color: "#E7710F" }
                  }
                >
                  Reserve This Room
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Notes */}
        <div className="mt-16 max-w-4xl mx-auto">
          <div className="p-8 rounded-3xl bg-gradient-to-br from-gray-50 to-white border border-gray-100">
            <h4
              className="text-lg font-normal mb-4 tracking-tight"
              style={{ color: "#0C375F" }}
            >
              Payment Terms
            </h4>
            <ul className="space-y-2 text-sm text-gray-600 font-light">
              <li className="flex items-start gap-3">
                <span className="text-gray-400">•</span>
                <span>
                  Security deposit: One month advance + one month deposit
                  required upon move-in
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-400">•</span>
                <span>Monthly rent due on or before the 5th of each month</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-400">•</span>
                <span>
                  Electricity charges above the allocation will be billed
                  separately based on meter reading
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-gray-400">•</span>
                <span>Minimum contract period: 3 months (or one semester)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Login Required Dialog */}
      {showLoginDialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowLoginDialog(false)}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
                style={{ backgroundColor: "#FFF4E6" }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#E7710F"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <h3
                className="text-xl font-semibold mb-2"
                style={{ color: "#0C375F" }}
              >
                Sign in to reserve
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                You need an account to reserve a room. Sign in if you already
                have one, or create a new account — it only takes a minute.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLoginDialog(false)}
                  className="flex-1 py-3 px-4 rounded-full border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Maybe later
                </button>
                <button
                  onClick={() => navigate("/signin")}
                  className="flex-1 py-3 px-4 rounded-full text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: "#E7710F" }}
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default PricingSection;
