import React, { useState, useEffect } from "react";
import { Loader2, Copy, Check, CheckCircle2 } from "lucide-react";
import { chatbotApi } from "../../../../shared/api/chatbotApi";

const BRANCH_OPTIONS = [
  { value: "all", label: "All Branches / General Assistance" },
  { value: "gil_puyat", label: "Gil Puyat Branch (Pasay City)" },
  { value: "guadalupe", label: "Guadalupe Branch (Makati City)" },
];

const CONCERN_CATEGORIES = [
  { value: "general_inquiry", label: "General Question & Information" },
  { value: "room_availability", label: "Room Availability & Rates" },
  { value: "house_rules", label: "House Policies, Visitors & Curfew" },
  { value: "reservation_process", label: "Application & Payment Assistance" },
  { value: "ocular_visit", label: "Schedule an In-Person Ocular Visit" },
];

const MSG_MAX = 500;

/**
 * ChatLeadEscalationForm
 *
 * Dedicated modal form for visitors to request Front Desk staff assistance or a callback.
 * Enhanced with Qwen/Llama intelligent conversation parsing.
 */
export function ChatLeadEscalationForm({
  initialBranch = "all",
  initialMessage = "",
  conversationHistory = [],
  onCancel,
  onClose,
  onSuccessSubmitted,
}) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    preferredBranch: initialBranch || "all",
    concernCategory: "general_inquiry",
    message: initialMessage || "",
  });

  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submittedRequest, setSubmittedRequest] = useState(null);
  const [copiedRef, setCopiedRef] = useState(false);

  // Auto-parse lead info from conversation history on mount
  useEffect(() => {
    let isMounted = true;
    const hasUserMessages = Array.isArray(conversationHistory) && conversationHistory.some((m) => m.role === "user");

    if (hasUserMessages) {
      setIsParsing(true);
      chatbotApi
        .parseChatbotLead({ conversationHistory, branchFocus: initialBranch })
        .then((res) => {
          if (!isMounted || !res?.data) return;
          const lead = res.data;

          setFormData((prev) => {
            const updated = { ...prev };
            let hasFilled = false;

            if (lead.name && !prev.name) {
              updated.name = lead.name;
              hasFilled = true;
            }
            if (lead.email && !prev.email) {
              updated.email = lead.email;
              hasFilled = true;
            }
            if (lead.phone && !prev.phone) {
              const clean = lead.phone.replace(/\D/g, "");
              const formatted = clean.startsWith("63") ? clean.slice(2) : clean.startsWith("0") ? clean.slice(1) : clean;
              updated.phone = formatted.slice(0, 10);
              hasFilled = true;
            }
            if (lead.preferredBranch && lead.preferredBranch !== "all" && prev.preferredBranch === "all") {
              updated.preferredBranch = lead.preferredBranch;
              hasFilled = true;
            }
            if (lead.viewingRequested && prev.concernCategory === "general_inquiry") {
              updated.concernCategory = "ocular_visit";
              hasFilled = true;
            }

            if (hasFilled) {
              setIsAutoFilled(true);
            }
            return updated;
          });
        })
        .catch(() => {
          // Fallback to local regex extraction if API fails
          if (conversationHistory && conversationHistory.length > 0) {
            let extractedName = "";
            let extractedEmail = "";
            let extractedPhone = "";
            let extractedCategory = "general_inquiry";
            let extractedBranch = initialBranch || "all";

            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i;
            const phoneRegex = /(?:\+?63|0)[\s-]?(\d{3})[\s-]?(\d{3})[\s-]?(\d{4})/;
            const nameRegex = /(?:my name is|i am|i'm|this is)\s+([a-zA-Z\s]{2,30})/i;

            conversationHistory.forEach((msg) => {
              if (msg.role === "user" && msg.text) {
                const text = msg.text;
                if (!extractedEmail) {
                  const emailMatch = text.match(emailRegex);
                  if (emailMatch) extractedEmail = emailMatch[1];
                }
                if (!extractedPhone) {
                  const phoneMatch = text.match(phoneRegex);
                  if (phoneMatch) {
                    extractedPhone = `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}`;
                  }
                }
                if (!extractedName) {
                  const nameMatch = text.match(nameRegex);
                  if (nameMatch) {
                    extractedName = nameMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
                  }
                }
                const lower = text.toLowerCase();
                if (lower.includes("guadalupe")) extractedBranch = "guadalupe";
                else if (lower.includes("gil puyat") || lower.includes("puyat")) extractedBranch = "gil_puyat";

                if (lower.includes("view") || lower.includes("tour") || lower.includes("visit")) {
                  extractedCategory = "ocular_visit";
                } else if (lower.includes("price") || lower.includes("rate") || lower.includes("rent") || lower.includes("cost") || lower.includes("available")) {
                  extractedCategory = "room_availability";
                } else if (lower.includes("reserve") || lower.includes("deposit") || lower.includes("apply")) {
                  extractedCategory = "reservation_process";
                }
              }
            });

            if (extractedName || extractedEmail || extractedPhone || extractedCategory !== "general_inquiry") {
              setFormData((prev) => ({
                ...prev,
                name: extractedName || prev.name,
                email: extractedEmail || prev.email,
                phone: extractedPhone || prev.phone,
                preferredBranch: extractedBranch !== "all" ? extractedBranch : prev.preferredBranch,
                concernCategory: extractedCategory !== "general_inquiry" ? extractedCategory : prev.concernCategory,
              }));
              setIsAutoFilled(true);
            }
          }
        })
        .finally(() => {
          if (isMounted) setIsParsing(false);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [conversationHistory, initialBranch]);

  const validate = () => {
    const nextErrors = {};

    if (!formData.name.trim()) {
      nextErrors.name = "Full name is required";
    } else if (formData.name.trim().length < 2) {
      nextErrors.name = "Name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      nextErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      nextErrors.email = "Please enter a valid email address";
    }

    const cleanPhone = formData.phone.replace(/\D/g, "");
    if (!cleanPhone) {
      nextErrors.phone = "Phone number is required";
    } else if (cleanPhone.length < 10) {
      nextErrors.phone = "Please enter a valid 10-digit mobile number";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    const truncated = raw.startsWith("63") ? raw.slice(2) : raw.startsWith("0") ? raw.slice(1) : raw;
    setFormData((prev) => ({ ...prev, phone: truncated.slice(0, 10) }));
    if (errors.phone) {
      setErrors((prev) => ({ ...prev, phone: null }));
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validate();
  };

  const formatPhoneDisplay = (digits) => {
    if (!digits) return "";
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true });

    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        name: formData.name.trim(),
        fullName: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        contactNumber: formData.phone.trim(),
        preferredBranch: formData.preferredBranch,
        branch: formData.preferredBranch,
        category: formData.concernCategory,
        concernCategory: formData.concernCategory,
        message: formData.message.trim(),
        chatContext: conversationHistory.slice(-6).map((m) => `${m.role}: ${m.text}`).join("\n"),
      };

      const res = await chatbotApi.escalateChatbotLead(payload);

      const isSuccess =
        res?.success === true ||
        Boolean(res?.inquiryId) ||
        Boolean(res?.data?.inquiryId) ||
        (res && typeof res === "object" && !res.error && !res.errors);

      if (isSuccess) {
        const inquiryId =
          res?.inquiryId ||
          res?.data?.inquiryId ||
          res?._id ||
          `INQ-${Date.now().toString().slice(-6)}`;
        const message =
          res?.message ||
          res?.data?.message ||
          "Your inquiry has been successfully sent to front desk staff.";

        const submittedData = {
          inquiryId,
          message,
          name: formData.name.trim(),
          fullName: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          preferredBranch: formData.preferredBranch,
          concernCategory: formData.concernCategory,
        };
        setSubmittedRequest(submittedData);
        if (typeof onSuccessSubmitted === "function") {
          onSuccessSubmitted({ ...res?.data, ...res, ...submittedData });
        }
      } else {
        throw new Error(res?.message || "Failed to submit request");
      }
    } catch (err) {
      console.error("Escalation submit error:", err);
      const isTechnicalError =
        !err?.message ||
        err.message.includes("is not a function") ||
        err.message.includes("Cannot read") ||
        err.message.includes("NetworkError") ||
        err.message.includes("Failed to fetch") ||
        err.message.includes("undefined") ||
        err.message.includes("null");

      setSubmitError(
        isTechnicalError
          ? "We could not submit your request at this moment. Please check your connection or contact front desk directly."
          : err.message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedRequest) {
    const selectedBranch =
      BRANCH_OPTIONS.find((b) => b.value === submittedRequest.preferredBranch)?.label ||
      "All Branches / General Assistance";
    const selectedCategory =
      CONCERN_CATEGORIES.find((c) => c.value === submittedRequest.concernCategory)?.label ||
      "General Question & Information";

    return (
      <div className="p-4 text-center animate-fadeIn flex flex-col items-center">
        {/* Success Icon */}
        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
        </div>

        {/* Heading */}
        <h4 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-1">
          Request Submitted Successfully
        </h4>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 mb-4 max-w-[290px]">
          Thank you, <span className="font-semibold text-slate-800 dark:text-slate-200">{submittedRequest.name || "Visitor"}</span>! Your inquiry has been routed to our Front Desk Admin Team. We will contact you promptly.
        </p>

        {/* Structured Details Card */}
        <div className="w-full text-left p-3.5 rounded-xl bg-slate-50 dark:bg-[#162238] border border-slate-200 dark:border-slate-700 mb-4 space-y-2.5">
          {/* Reference Row */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Reference ID
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                {submittedRequest.inquiryId}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (submittedRequest?.inquiryId && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(submittedRequest.inquiryId);
                    setCopiedRef(true);
                    setTimeout(() => setCopiedRef(false), 2000);
                  }
                }}
                aria-label="Copy reference ID"
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                title="Copy Reference"
              >
                {copiedRef ? (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Copied
                  </span>
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="block text-slate-500 dark:text-slate-400">Branch</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">
                {selectedBranch}
              </span>
            </div>
            <div>
              <span className="block text-slate-500 dark:text-slate-400">Topic</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">
                {selectedCategory}
              </span>
            </div>
          </div>

          <div className="text-[11px] pt-1">
            <span className="block text-slate-500 dark:text-slate-400">Contact</span>
            <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">
              {submittedRequest.email} {submittedRequest.phone ? `• ${submittedRequest.phone}` : ""}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-2">
          <button
            type="button"
            onClick={() => {
              if (typeof onClose === "function") {
                onClose();
              } else if (typeof onCancel === "function") {
                onCancel();
              }
            }}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white dark:text-[#0A1628] bg-[#0A1628] dark:bg-[#D4AF37] hover:bg-[#162f53] dark:hover:bg-[#E5C358] transition-all cursor-pointer shadow-sm focus:outline-none border border-[#0A1628] dark:border-[#B9921F]"
          >
            Return to Conversation
          </button>

          <button
            type="button"
            onClick={() => {
              setSubmittedRequest(null);
              setFormData({
                name: "",
                email: "",
                phone: "",
                preferredBranch: initialBranch || "all",
                concernCategory: "general_inquiry",
                message: "",
              });
              setSubmitError("");
            }}
            className="w-full py-1.5 px-3 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            Submit Another Inquiry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-1 animate-fadeIn text-left">
      <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#E6D9B2] dark:border-[#27334A]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-0.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            aria-label="Back to chat"
          >
            Back
          </button>
          <div>
            <h4 className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Request Front Desk Assistance
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Our admin team will contact you promptly
            </p>
          </div>
        </div>
      </div>

      {isAutoFilled && (
        <div className="px-2.5 py-1.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-[11px] border border-amber-200 dark:border-amber-800/60 mb-2">
          <span>Details pre-filled from your chat. Please review and confirm.</span>
        </div>
      )}

      {submitError && (
        <div role="alert" className="p-2 mb-2 rounded-lg text-xs bg-rose-50/60 dark:bg-rose-950/20 border border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-300">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <div>
          <label className="block text-[11px] font-semibold mb-0.5 text-slate-800 dark:text-slate-200">
            Full Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              name="name"
              placeholder="e.g. Maria Santos"
              value={formData.name}
              onChange={handleChange}
              onBlur={() => handleBlur("name")}
              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border outline-none transition-all bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                touched.name && errors.name
                  ? "border-red-500 bg-red-50/50 dark:bg-red-950/20"
                  : "border-slate-300 dark:border-slate-700 focus:border-amber-500"
              }`}
            />
          </div>
          {touched.name && errors.name && (
            <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-0.5 text-slate-800 dark:text-slate-200">
            Email Address <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="email"
              name="email"
              placeholder="maria.santos@gmail.com"
              value={formData.email}
              onChange={handleChange}
              onBlur={() => handleBlur("email")}
              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border outline-none transition-all bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                touched.email && errors.email
                  ? "border-red-500 bg-red-50/50 dark:bg-red-950/20"
                  : "border-slate-300 dark:border-slate-700 focus:border-amber-500"
              }`}
            />
          </div>
          {touched.email && errors.email && (
            <p className="text-[10px] text-red-500 mt-0.5">{errors.email}</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-0.5 text-slate-800 dark:text-slate-200">
            Contact Number <span className="text-red-500">*</span>
          </label>
          <div className="relative flex items-center">
            <span
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-l-lg border border-r-0 text-[11px] font-medium select-none flex-shrink-0 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              <span>+63</span>
            </span>
            <input
              type="tel"
              name="phone"
              placeholder="917 123 4567"
              value={formatPhoneDisplay(formData.phone)}
              onChange={handlePhoneChange}
              onBlur={() => handleBlur("phone")}
              maxLength={12}
              className={`w-full text-xs px-2.5 py-1.5 rounded-r-lg border outline-none transition-all bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                touched.phone && errors.phone
                  ? "border-red-500 bg-red-50/50 dark:bg-red-950/20"
                  : "border-slate-300 dark:border-slate-700 focus:border-amber-500"
              }`}
            />
          </div>
          {touched.phone && errors.phone && (
            <p className="text-[10px] text-red-500 mt-0.5">{errors.phone}</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-0.5 text-slate-800 dark:text-slate-200">
            Preferred Branch
          </label>
          <div className="relative">
            <select
              name="preferredBranch"
              value={formData.preferredBranch}
              onChange={handleChange}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 outline-none focus:border-amber-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {BRANCH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-0.5 text-slate-800 dark:text-slate-200">
            Topic of Concern
          </label>
          <div className="relative">
            <select
              name="concernCategory"
              value={formData.concernCategory}
              onChange={handleChange}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 outline-none focus:border-amber-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {CONCERN_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-0.5">
            <label className="block text-[11px] font-semibold text-slate-800 dark:text-slate-200">
              Message / Specific Question
            </label>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {formData.message.length}/{MSG_MAX}
            </span>
          </div>
          <textarea
            name="message"
            rows={3}
            placeholder="Tell us what you need assistance with..."
            value={formData.message}
            onChange={handleChange}
            maxLength={MSG_MAX}
            className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 outline-none resize-none focus:border-amber-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            title={isSubmitting ? "Submitting request..." : "Click to submit your assistance request"}
            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-white dark:text-[#0A1628] bg-[#0A1628] dark:bg-[#D4AF37] hover:bg-[#162f53] dark:hover:bg-[#E5C358] flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:outline-none border border-[#0A1628] dark:border-[#B9921F]"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <span>Submit Request</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ChatLeadEscalationForm;
