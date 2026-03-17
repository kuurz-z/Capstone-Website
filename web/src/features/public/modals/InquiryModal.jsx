import { useState } from "react";

import { inquiryApi } from "../../../shared/api/apiClient";

function InquiryModal({ isOpen, onClose, defaultBranch = "general" }) {
  const [inquiryType, setInquiryType] = useState("General Inquiry");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user types
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Map inquiry type to subject
      const subject = `${inquiryType}: ${formData.name}`;

      // Prepare inquiry data for API
      const inquiryData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        subject: subject,
        message: formData.message.trim(),
        branch: defaultBranch, // Use the branch passed as prop or default to "general"
      };

      // Submit to API
      const response = await inquiryApi.create(inquiryData);
      // Show success state
      setSuccess(true);

      // Reset form after delay
      setTimeout(() => {
        setFormData({ name: "", email: "", phone: "", message: "" });
        setInquiryType("General Inquiry");
        setSuccess(false);
        onClose();
      }, 3000);
    } catch (err) {
      console.error("❌ Failed to submit inquiry:", err);
      setError(err.message || "Failed to submit inquiry. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset states when closing
    setError("");
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="inquiry-modal-overlay" onClick={handleClose}>
      <div
        className="inquiry-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="inquiry-modal-close" onClick={handleClose}>
          ×
        </button>

        <div className="inquiry-modal-wrapper">
          {/* Left Side - Form */}
          <div className="inquiry-modal-form-section">
            <h2 className="inquiry-modal-title">Send Us a Message</h2>

            {/* Success Message */}
            {success && (
              <div className="inquiry-success-message">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22,4 12,14.01 9,11.01" />
                </svg>
                <div>
                  <p className="inquiry-success-title">Inquiry Submitted!</p>
                  <p className="inquiry-success-text">
                    Thank you for reaching out. We'll get back to you within 24
                    hours.
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="inquiry-error-message">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p>{error}</p>
              </div>
            )}

            {!success && (
              <>
                {/* Inquiry Type Selection */}
                <div className="inquiry-type-section">
                  <label className="inquiry-label">
                    Select Type of Inquiry
                  </label>
                  <div className="inquiry-type-buttons">
                    <button
                      type="button"
                      className={`inquiry-type-btn ${inquiryType === "Reservation" ? "active" : ""}`}
                      onClick={() => setInquiryType("Reservation")}
                      disabled={loading}
                    >
                      Reservation
                    </button>
                    <button
                      type="button"
                      className={`inquiry-type-btn ${inquiryType === "Information" ? "active" : ""}`}
                      onClick={() => setInquiryType("Information")}
                      disabled={loading}
                    >
                      Information
                    </button>
                    <button
                      type="button"
                      className={`inquiry-type-btn ${inquiryType === "General Inquiry" ? "active" : ""}`}
                      onClick={() => setInquiryType("General Inquiry")}
                      disabled={loading}
                    >
                      General Inquiry
                    </button>
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="inquiry-form">
                  {/* Name Field */}
                  <div className="inquiry-form-group">
                    <label htmlFor="name" className="inquiry-label">
                      Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      placeholder="Enter your full name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      disabled={loading}
                      className="inquiry-input"
                    />
                  </div>

                  {/* Email Field */}
                  <div className="inquiry-form-group">
                    <label htmlFor="email" className="inquiry-label">
                      Email Address <span className="required">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder="your.email@example.com"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      disabled={loading}
                      className="inquiry-input"
                    />
                  </div>

                  {/* Phone Field */}
                  <div className="inquiry-form-group">
                    <label htmlFor="phone" className="inquiry-label">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      placeholder="+63 XXX XXX XXXX"
                      value={formData.phone}
                      onChange={handleInputChange}
                      disabled={loading}
                      className="inquiry-input"
                    />
                  </div>

                  {/* Message Field */}
                  <div className="inquiry-form-group">
                    <label htmlFor="message" className="inquiry-label">
                      Message <span className="required">*</span>
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      placeholder="Please describe your inquiry or any questions you may have..."
                      value={formData.message}
                      onChange={handleInputChange}
                      required
                      disabled={loading}
                      className="inquiry-textarea"
                      rows="6"
                    ></textarea>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className={`inquiry-btn-submit ${loading ? "loading" : ""}`}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="inquiry-spinner"></span>
                        Sending...
                      </>
                    ) : (
                      "Send Inquiry"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Right Side - Contact Info */}
          <div className="inquiry-modal-contact-section">
            <h3 className="inquiry-contact-title">Contact Info</h3>

            {/* Phone */}
            <div className="inquiry-contact-info-item">
              <div className="inquiry-contact-info-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                >
                  <g clipPath="url(#clip0_5_567)">
                    <path
                      d="M11.5267 13.8065C11.6988 13.8855 11.8927 13.9036 12.0764 13.8577C12.2602 13.8118 12.4228 13.7047 12.5375 13.554L12.8334 13.1665C12.9886 12.9595 13.1899 12.7915 13.4213 12.6758C13.6528 12.5601 13.9079 12.4998 14.1667 12.4998H16.6667C17.1087 12.4998 17.5326 12.6754 17.8452 12.988C18.1578 13.3006 18.3334 13.7245 18.3334 14.1665V16.6665C18.3334 17.1085 18.1578 17.5325 17.8452 17.845C17.5326 18.1576 17.1087 18.3332 16.6667 18.3332C12.6884 18.3332 8.87313 16.7528 6.06009 13.9398C3.24704 11.1267 1.66669 7.31142 1.66669 3.33317C1.66669 2.89114 1.84228 2.46722 2.15484 2.15466C2.4674 1.8421 2.89133 1.6665 3.33335 1.6665H5.83335C6.27538 1.6665 6.6993 1.8421 7.01186 2.15466C7.32443 2.46722 7.50002 2.89114 7.50002 3.33317V5.83317C7.50002 6.09191 7.43978 6.3471 7.32407 6.57853C7.20835 6.80995 7.04035 7.01126 6.83335 7.1665L6.44335 7.459C6.29037 7.57582 6.18254 7.74199 6.13818 7.9293C6.09382 8.1166 6.11567 8.31348 6.20002 8.4865C7.33892 10.7997 9.21204 12.6705 11.5267 13.8065Z"
                      stroke="#FF8C42"
                      strokeWidth="1.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_5_567">
                      <rect width="20" height="20" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              </div>
              <div className="inquiry-contact-info-text">
                <p className="inquiry-contact-info-label">Phone</p>
                <p className="inquiry-contact-info-value">+63 2 1234 5678</p>
                <p className="inquiry-contact-info-value">+63 917 123 4567</p>
              </div>
            </div>

            {/* Email */}
            <div className="inquiry-contact-info-item">
              <div className="inquiry-contact-info-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                >
                  <g clipPath="url(#clip0_5_577)">
                    <path
                      d="M18.3334 5.8335L10.8409 10.606C10.5866 10.7537 10.2978 10.8315 10.0038 10.8315C9.70974 10.8315 9.42094 10.7537 9.16669 10.606L1.66669 5.8335"
                      stroke="#FF8C42"
                      strokeWidth="1.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M16.6667 3.3335H3.33335C2.41288 3.3335 1.66669 4.07969 1.66669 5.00016V15.0002C1.66669 15.9206 2.41288 16.6668 3.33335 16.6668H16.6667C17.5872 16.6668 18.3334 15.9206 18.3334 15.0002V5.00016C18.3334 4.07969 17.5872 3.3335 16.6667 3.3335Z"
                      stroke="#FF8C42"
                      strokeWidth="1.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_5_577">
                      <rect width="20" height="20" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              </div>
              <div className="inquiry-contact-info-text">
                <p className="inquiry-contact-info-label">Email</p>
                <p className="inquiry-contact-info-value">info@lilycrest.ph</p>
                <p className="inquiry-contact-info-value">
                  reservations@lilycrest.ph
                </p>
              </div>
            </div>

            {/* Address */}
            <div className="inquiry-contact-info-item">
              <div className="inquiry-contact-info-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                >
                  <path
                    d="M16.6666 8.33317C16.6666 12.494 12.0508 16.8273 10.5008 18.1657C10.3564 18.2742 10.1806 18.333 9.99998 18.333C9.81931 18.333 9.64354 18.2742 9.49915 18.1657C7.94915 16.8273 3.33331 12.494 3.33331 8.33317C3.33331 6.56506 4.03569 4.86937 5.28593 3.61913C6.53618 2.36888 8.23187 1.6665 9.99998 1.6665C11.7681 1.6665 13.4638 2.36888 14.714 3.61913C15.9643 4.86937 16.6666 6.56506 16.6666 8.33317Z"
                    stroke="#FF8C42"
                    strokeWidth="1.66667"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 10.8335C11.3807 10.8335 12.5 9.71421 12.5 8.3335C12.5 6.95278 11.3807 5.8335 10 5.8335C8.61929 5.8335 7.5 6.95278 7.5 8.3335C7.5 9.71421 8.61929 10.8335 10 10.8335Z"
                    stroke="#FF8C42"
                    strokeWidth="1.66667"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="inquiry-contact-info-text">
                <p className="inquiry-contact-info-label">Address</p>
                <p className="inquiry-contact-info-value">
                  Gil Puyat Branch:
                  <br />
                  123 Gil Puyat Ave, Makati
                </p>
                <p className="inquiry-contact-info-value">
                  Makati Branch:
                  <br />
                  456 Buendia Ave, Makati
                </p>
              </div>
            </div>

            {/* Hours */}
            <div className="inquiry-contact-info-item">
              <div className="inquiry-contact-info-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                >
                  <g clipPath="url(#clip0_5_603)">
                    <path
                      d="M10 5V10L13.3333 11.6667"
                      stroke="#FF8C42"
                      strokeWidth="1.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10 18.3332C14.6024 18.3332 18.3334 14.6022 18.3334 9.99984C18.3334 5.39746 14.6024 1.6665 10 1.6665C5.39765 1.6665 1.66669 5.39746 1.66669 9.99984C1.66669 14.6022 5.39765 18.3332 10 18.3332Z"
                      stroke="#FF8C42"
                      strokeWidth="1.66667"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_5_603">
                      <rect width="20" height="20" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              </div>
              <div className="inquiry-contact-info-text">
                <p className="inquiry-contact-info-label">Office Hours</p>
                <p className="inquiry-contact-info-value">
                  Monday - Friday
                  <br />
                  9:00 AM - 6:00 PM
                </p>
                <p className="inquiry-contact-info-value">
                  Saturday
                  <br />
                  10:00 AM - 4:00 PM
                </p>
              </div>
            </div>

            {/* Response Time Note */}
            <div className="inquiry-response-note">
              <p>
                We typically respond to inquiries within 24 hours during
                business days.
              </p>
            </div>
          </div>
        </div>

        <div className="inquiry-modal-contacts"></div>
      </div>
    </div>
  );
}

export default InquiryModal;
