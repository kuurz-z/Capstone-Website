/**
 * =============================================================================
 * PRIVACY POLICY MODAL
 * =============================================================================
 *
 * Full-screen modal displaying the Privacy Policy for user registration.
 */

import "./TermsModal.css"; // reuse the same styles
import useEscapeClose from "../../../shared/hooks/useEscapeClose";

function PrivacyModal({ isOpen, onClose }) {
  useEscapeClose(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="terms-modal-overlay" onClick={onClose}>
      <div className="terms-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="terms-modal-header">
          <h2>Privacy Policy</h2>
          <button className="terms-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="terms-modal-body">
          <h3>Lilycrest Dormitory Management System</h3>
          <p>
            <strong>Last Updated:</strong> March 1, 2026
          </p>

          <h4>1. Information We Collect</h4>
          <p>
            We collect information you provide directly to us when you fill out an inquiry form,
            create an account, make a reservation, or contact us. This may include your name, email
            address, phone number, preferred accommodation details, and payment information.
          </p>

          <h4>2. How We Use Your Information</h4>
          <p>
            We use the information we collect to process your inquiries and reservations, manage
            your accommodation, communicate with you about your account and our services, improve
            our website and services, and comply with legal obligations.
          </p>

          <h4>3. Information Sharing</h4>
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share
            your information only with service providers who assist us in operating our website and
            services, or when required by law.
          </p>

          <h4>4. Data Security</h4>
          <p>
            We implement industry-standard security measures to protect your personal information
            from unauthorized access, alteration, disclosure, or destruction. However, no method
            of transmission over the Internet is 100% secure.
          </p>

          <h4>5. Cookies</h4>
          <p>
            Our website uses cookies to enhance your browsing experience. Cookies are small files
            stored on your device that help us understand how you use our website and improve our
            services.
          </p>

          <h4>6. Your Rights</h4>
          <p>
            You have the right to access, correct, or delete your personal information at any time.
            You may also opt out of receiving communications from us. To exercise these rights,
            please contact us at <a href="mailto:hello@lilycrest.com">hello@lilycrest.com</a>.
          </p>

          <h4>7. Contact Us</h4>
          <p>
            If you have any questions about this Privacy Policy, please contact us at{" "}
            <a href="mailto:hello@lilycrest.com">hello@lilycrest.com</a> or call us at +63 912 345
            6789.
          </p>

          <div className="terms-acceptance">
            <p>
              <strong className="terms-condition-statement">
                By clicking "I Understand" or by continuing to use our services, you acknowledge
                that you have read, understood, and agree to our Privacy Policy.
              </strong>
            </p>
          </div>
        </div>

        <div className="terms-modal-footer">
          <button className="terms-accept-btn" onClick={onClose}>
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrivacyModal;
