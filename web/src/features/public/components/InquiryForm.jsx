import { useState, useRef } from 'react';
import { Send, CheckCircle, Loader2, ChevronDown } from 'lucide-react';
import { inquiryApi } from '../../../shared/api/apiClient';

// ─── Constants ──────────────────────────────────────────────────────

const NAME_MAX = 100;
const MSG_MAX = 500;
const MSG_MIN = 10;
const PHONE_DIGITS = 10; // digits after +63

const ROOM_LABELS = {
  private: 'Private Room',
  double: 'Double Occupancy',
  quadruple: 'Quadruple Room',
};

const INQUIRY_TYPE_LABELS = {
  'room-inquiry': 'Room Inquiry',
  pricing: 'Pricing',
  availability: 'Availability',
  amenities: 'Amenities',
  location: 'Location',
  booking: 'Booking',
  general: 'General Question',
};

// ─── Validation helpers ─────────────────────────────────────────────

const validators = {
  name: (v) => {
    if (!v.trim()) return 'Full name is required';
    if (v.trim().length < 2) return 'Name must be at least 2 characters';
    if (v.trim().length > NAME_MAX) return `Name can't exceed ${NAME_MAX} characters`;
    if (!/^[a-zA-ZÀ-ÿ\s.\-']+$/.test(v.trim())) return 'Name contains invalid characters';
    return null;
  },
  email: (v) => {
    if (!v.trim()) return 'Email address is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Please enter a valid email';
    return null;
  },
  phone: (v) => {
    // v is stored as raw digits only (no +63 prefix in state)
    if (!v || v.length === 0) return 'Phone number is required';
    if (v.length < PHONE_DIGITS) return `Enter ${PHONE_DIGITS} digits after +63`;
    if (!/^\d{10}$/.test(v)) return 'Only digits allowed';
    return null;
  },
  branch: (v) => (!v ? 'Please select a branch' : null),
  roomType: (v) => (!v ? 'Please select a room type' : null),
  inquiryType: (v) => (!v ? 'Please select an inquiry type' : null),
  message: (v) => {
    if (!v.trim()) return 'Message is required';
    if (v.trim().length < MSG_MIN) return `Message must be at least ${MSG_MIN} characters`;
    if (v.trim().length > MSG_MAX) return `Message can't exceed ${MSG_MAX} characters`;
    return null;
  },
};

// ─── Phone formatter: "9171234567" → "917 123 4567" ─────────────────

function formatPhoneDisplay(digits) {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

// ─── Reusable styled field components (consistent static labels) ────

function FormInput({ label, name, type = 'text', value, onChange, onBlur, error, placeholder, inputMode, autoComplete, maxLength, prefix, children }) {
  const hasError = !!error;
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium mb-2" style={{ color: hasError ? '#ef4444' : 'var(--lp-text)' }}>
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium pointer-events-none select-none"
            style={{ color: 'var(--lp-text-muted)' }}
          >
            {prefix}
          </span>
        )}
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          className={`inquiry-field w-full py-3.5 px-4 rounded-xl text-[15px] transition-all duration-200${hasError ? ' has-error' : ''}`}
          style={{
            backgroundColor: 'var(--lp-bg)',
            color: 'var(--lp-text)',
            border: hasError ? '1.5px solid #ef4444' : '1.5px solid var(--lp-border)',
            ...(prefix ? { paddingLeft: '3rem' } : {}),
          }}
        />
      </div>
      {children}
      {hasError && <p className="text-xs mt-1.5 pl-0.5 font-medium" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}

function FormSelect({ label, name, value, onChange, options, error }) {
  const hasError = !!error;
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium mb-2" style={{ color: hasError ? '#ef4444' : 'var(--lp-text)' }}>
        {label}
      </label>
      <div className="relative">
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          className={`inquiry-field w-full py-3.5 px-4 pr-10 rounded-xl text-[15px] appearance-none transition-all duration-200 cursor-pointer${hasError ? ' has-error' : ''}`}
          style={{
            backgroundColor: 'var(--lp-bg)',
            color: value ? 'var(--lp-text)' : 'var(--lp-text-muted)',
            border: hasError ? '1.5px solid #ef4444' : '1.5px solid var(--lp-border)',
          }}
        >
          <option value="" disabled>Select…</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--lp-text-muted)' }} />
      </div>
      {hasError && <p className="text-xs mt-1.5 pl-0.5 font-medium" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}

function FormTextarea({ label, name, value, onChange, onBlur, rows = 4, maxLength, error }) {
  const hasError = !!error;
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium mb-2" style={{ color: hasError ? '#ef4444' : 'var(--lp-text)' }}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        rows={rows}
        maxLength={maxLength}
        className={`inquiry-field w-full py-3.5 px-4 rounded-xl text-[15px] transition-all duration-200 resize-none${hasError ? ' has-error' : ''}`}
        style={{
          backgroundColor: 'var(--lp-bg)',
          color: 'var(--lp-text)',
          border: hasError ? '1.5px solid #ef4444' : '1.5px solid var(--lp-border)',
        }}
        placeholder="Tell us what you'd like to know…"
      />
      <div className="flex justify-between items-center mt-1.5">
        {hasError ? (
          <p className="text-xs pl-0.5 font-medium" style={{ color: '#ef4444' }}>{error}</p>
        ) : (
          <span />
        )}
        {maxLength && (
          <p className="text-xs" style={{ color: value.length > maxLength * 0.9 ? '#ef4444' : 'var(--lp-text-muted)' }}>
            {value.length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function InquiryForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneDigits: '', // raw 10 digits after +63
    branch: '',
    roomType: '',
    inquiryType: '',
    message: '',
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);

  // ── Handlers ──

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Enforce character limits
    if (name === 'name' && value.length > NAME_MAX) return;
    if (name === 'message' && value.length > MSG_MAX) return;

    setFormData((prev) => ({ ...prev, [name]: value }));
    setApiError(null);
    if (touched[name] && validators[name]) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const handlePhoneChange = (e) => {
    // Extract only digits, cap at 10
    const raw = e.target.value.replace(/\D/g, '').slice(0, PHONE_DIGITS);
    setFormData((prev) => ({ ...prev, phoneDigits: raw }));
    setApiError(null);
    if (touched.phone && validators.phone) {
      setErrors((prev) => ({ ...prev, phone: validators.phone(raw) }));
    }
  };

  const handleBlur = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
    const val = fieldName === 'phone' ? formData.phoneDigits : formData[fieldName];
    if (validators[fieldName]) {
      setErrors((prev) => ({ ...prev, [fieldName]: validators[fieldName](val) }));
    }
  };

  const handleSelectChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTouched((prev) => ({ ...prev, [name]: true }));
    if (validators[name]) {
      setErrors((prev) => ({ ...prev, [name]: validators[name](value) }));
    }
  };

  const validateAll = () => {
    const fieldMap = {
      name: formData.name,
      email: formData.email,
      phone: formData.phoneDigits,
      branch: formData.branch,
      roomType: formData.roomType,
      inquiryType: formData.inquiryType,
      message: formData.message,
    };
    const newErrors = {};
    let hasError = false;
    for (const [field, val] of Object.entries(fieldMap)) {
      const err = validators[field](val);
      newErrors[field] = err;
      if (err) hasError = true;
    }
    setErrors(newErrors);
    setTouched(Object.fromEntries(Object.keys(fieldMap).map((f) => [f, true])));
    return !hasError;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);
    if (!validateAll()) return;
    setSubmitting(true);
    try {
      const typeLabel = INQUIRY_TYPE_LABELS[formData.inquiryType] || formData.inquiryType;
      const roomLabel = ROOM_LABELS[formData.roomType] || formData.roomType;
      const fullPhone = `+63${formData.phoneDigits}`;
      await inquiryApi.create({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: fullPhone,
        subject: `${typeLabel} — ${roomLabel}`,
        message: formData.message.trim(),
        branch: formData.branch,
      });
      setSubmitted(true);
    } catch (err) {
      // Handle rate limit
      if (err?.response?.status === 429 || err?.status === 429) {
        setApiError("You've submitted too many inquiries. Please try again in 15 minutes.");
      } else {
        setApiError(err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──

  return (
    <section className="py-20 lg:py-24" style={{ backgroundColor: 'var(--lp-bg)' }} id="inquiry">
      <div className="max-w-3xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-xs mb-3 tracking-widest uppercase font-medium" style={{ color: 'var(--lp-accent)' }}>
            Get Started
          </p>
          <h2 className="text-3xl lg:text-4xl font-medium mb-5 tracking-tight" style={{ color: 'var(--lp-text)' }}>
            Reserve Your Slot Today
          </h2>
          <p className="max-w-2xl mx-auto font-light leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
            Fill out the form below and our team will reach out within 24 hours to schedule a viewing or answer your questions.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-2xl p-12 lg:p-16 text-center" style={{ backgroundColor: 'var(--lp-bg-card)', border: '1px solid var(--lp-border)', boxShadow: 'var(--lp-card-shadow-hover)' }}>
            <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
              <CheckCircle className="w-8 h-8" style={{ color: '#10B981' }} />
            </div>
            <h3 className="text-2xl font-normal mb-3 tracking-tight" style={{ color: 'var(--lp-text)' }}>
              Thank you for your inquiry!
            </h3>
            <p className="font-light mb-8 leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
              We'll contact you within 24 hours to schedule a viewing or answer your questions.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                setFormData({ name: '', email: '', phoneDigits: '', branch: '', roomType: '', inquiryType: '', message: '' });
                setErrors({});
                setTouched({});
              }}
              className="text-sm font-medium hover:underline transition-all cursor-pointer"
              style={{ color: 'var(--lp-accent)' }}
            >
              Send another inquiry
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-2xl p-8 lg:p-10"
            style={{
              backgroundColor: 'var(--lp-bg-card)',
              border: '1px solid var(--lp-border)',
              boxShadow: 'var(--lp-card-shadow-hover)',
            }}
          >
            {apiError && (
              <div className="mb-6 p-4 rounded-xl text-sm font-medium text-center" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {apiError}
              </div>
            )}

            {/* ── Section 1: Personal Info ── */}
            <div className="grid md:grid-cols-2 gap-x-5 gap-y-4">
              <FormInput
                label="Full Name *"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={() => handleBlur('name')}
                error={touched.name ? errors.name : null}
                placeholder="Juan Dela Cruz"
                autoComplete="name"
                maxLength={NAME_MAX}
              />
              <FormInput
                label="Email Address *"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={() => handleBlur('email')}
                error={touched.email ? errors.email : null}
                placeholder="juan@email.com"
                autoComplete="email"
              />
              {/* Phone with locked +63 prefix */}
              <FormInput
                label="Phone Number *"
                name="phoneDisplay"
                type="tel"
                value={formatPhoneDisplay(formData.phoneDigits)}
                onChange={handlePhoneChange}
                onBlur={() => handleBlur('phone')}
                error={touched.phone ? errors.phone : null}
                placeholder="917 123 4567"
                inputMode="numeric"
                autoComplete="tel"
                prefix="+63"
              />
              <FormSelect
                label="Preferred Branch *"
                name="branch"
                value={formData.branch}
                onChange={handleSelectChange}
                error={touched.branch ? errors.branch : null}
                options={[
                  { value: 'gil-puyat', label: 'Gil Puyat' },
                  { value: 'guadalupe', label: 'Guadalupe' },
                ]}
              />
            </div>

            {/* ── Divider ── */}
            <div className="my-6" style={{ borderTop: '1px solid var(--lp-border)' }} />

            {/* ── Section 2: Inquiry Details ── */}
            <div className="grid md:grid-cols-2 gap-x-5 gap-y-4 mb-5">
              <FormSelect
                label="Inquiry Type *"
                name="inquiryType"
                value={formData.inquiryType}
                onChange={handleSelectChange}
                error={touched.inquiryType ? errors.inquiryType : null}
                options={[
                  { value: 'room-inquiry', label: 'Room Inquiry' },
                  { value: 'pricing', label: 'Pricing' },
                  { value: 'availability', label: 'Availability' },
                  { value: 'amenities', label: 'Amenities' },
                  { value: 'location', label: 'Location' },
                  { value: 'booking', label: 'Booking' },
                  { value: 'general', label: 'General Question' },
                ]}
              />
              <FormSelect
                label="Room Type *"
                name="roomType"
                value={formData.roomType}
                onChange={handleSelectChange}
                error={touched.roomType ? errors.roomType : null}
                options={[
                  { value: 'private', label: 'Private Room' },
                  { value: 'double', label: 'Double Occupancy' },
                  { value: 'quadruple-sharing', label: 'Quadruple Sharing' },
                ]}
              />
            </div>

            {/* ── Message (required) ── */}
            <div className="mb-8">
              <FormTextarea
                label="Your Message *"
                name="message"
                value={formData.message}
                onChange={handleChange}
                onBlur={() => handleBlur('message')}
                error={touched.message ? errors.message : null}
                rows={3}
                maxLength={MSG_MAX}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full text-white py-4 px-6 rounded-full font-medium text-base flex items-center justify-center gap-3 transition-all duration-300 cursor-pointer"
              style={{
                backgroundColor: submitting ? '#c4c4c4' : 'var(--lp-accent)',
                boxShadow: submitting ? 'none' : '0 4px 16px rgba(212, 175, 55, 0.25)',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /><span>Submitting...</span></>
              ) : (
                <><span>Submit Inquiry</span><Send className="w-5 h-5" /></>
              )}
            </button>

            <p className="text-xs text-center mt-5 font-light" style={{ color: 'var(--lp-text-muted)' }}>
              By submitting this form, you agree to our privacy policy. We will never share your information with third parties.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

export default InquiryForm;