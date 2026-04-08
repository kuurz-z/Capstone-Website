/**
 * =============================================================================
 * TERMS AND CONDITIONS MODAL
 * =============================================================================
 *
 * Full-screen modal displaying the Terms and Conditions for user registration.
 */

import "./TermsModal.css";
import useEscapeClose from "../../../shared/hooks/useEscapeClose";

function TermsModal({ isOpen, onClose }) {
  useEscapeClose(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="terms-modal-overlay" onClick={onClose}>
      <div className="terms-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="terms-modal-header">
          <h2>Terms and Conditions</h2>
          <button className="terms-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="terms-modal-body">
          <h3>Lilycrest Dormitory Management System</h3>
          <p>
            <strong>Last Updated:</strong> February 1, 2026
          </p>

          <h4>1. Acceptance of Terms</h4>
          <p>
            By accessing and using the Lilycrest Dormitory Management System,
            you accept and agree to be bound by the terms and provision of this
            agreement. If you do not agree to abide by the above, please do not
            use this service.
          </p>

          <h4>2. Use License</h4>
          <p>
            Permission is granted to temporarily use the Lilycrest Dormitory
            Management System for personal, non-commercial transitory viewing
            only. This is the grant of a license, not a transfer of title, and
            under this license you may not:
          </p>
          <ul>
            <li>Modify or copy the materials</li>
            <li>
              Use the materials for any commercial purpose or for any public
              display
            </li>
            <li>
              Attempt to reverse engineer any software contained on the
              Lilycrest website
            </li>
            <li>
              Remove any copyright or other proprietary notations from the
              materials
            </li>
            <li>
              Transfer the materials to another person or "mirror" the materials
              on any other server
            </li>
          </ul>

          <h4>3. User Registration</h4>
          <p>
            You must provide accurate, current, and complete information during
            the registration process. You are responsible for maintaining the
            confidentiality of your account credentials and for all activities
            that occur under your account.
          </p>

          <h4>4. Email Verification</h4>
          <p>
            All users must verify their email address before accessing the
            system. Registration is not complete until email verification is
            confirmed.
          </p>

          <h4>5. Branch Assignment</h4>
          <p>
            Users will be assigned to either the Gil Puyat or Guadalupe branch
            during registration. This assignment determines access to
            branch-specific resources and information.
          </p>

          <h4>6. Privacy and Data Protection</h4>
          <p>
            Your privacy is important to us. We collect and use your personal
            information solely for the purpose of providing dormitory management
            services. We will not share your information with third parties
            without your consent, except as required by law.
          </p>

          <h4>7. User Conduct</h4>
          <p>You agree not to use the service to:</p>
          <ul>
            <li>
              Upload or transmit any harmful, threatening, abusive, or
              defamatory content
            </li>
            <li>
              Violate any applicable local, state, national, or international
              law
            </li>
            <li>Impersonate any person or entity</li>
            <li>Interfere with or disrupt the service or servers</li>
          </ul>

          <h4>8. Reservation and Booking</h4>
          <p>
            All room reservations are subject to availability and confirmation
            by Lilycrest management. We reserve the right to cancel or modify
            reservations in exceptional circumstances.
          </p>

          <h4>9. Payment Terms</h4>
          <p>
            Payment details and terms will be communicated separately for
            confirmed reservations. All fees must be paid according to the
            agreed schedule.
          </p>

          <h4>10. Limitation of Liability</h4>
          <p>
            In no event shall Lilycrest or its suppliers be liable for any
            damages (including, without limitation, damages for loss of data or
            profit, or due to business interruption) arising out of the use or
            inability to use the materials on Lilycrest's website.
          </p>

          <h4>11. Revisions and Errata</h4>
          <p>
            The materials appearing on Lilycrest's website may include
            technical, typographical, or photographic errors. Lilycrest does not
            warrant that any of the materials on its website are accurate,
            complete, or current.
          </p>

          <h4>12. Account Termination</h4>
          <p>
            Lilycrest reserves the right to terminate or suspend your account at
            any time, with or without notice, for conduct that we believe
            violates these Terms and Conditions or is harmful to other users,
            us, or third parties, or for any other reason.
          </p>

          <h4>13. Changes to Terms</h4>
          <p>
            Lilycrest may revise these Terms and Conditions at any time without
            notice. By using this website, you agree to be bound by the current
            version of these Terms and Conditions.
          </p>

          <h4>14. Governing Law</h4>
          <p>
            These terms and conditions are governed by and construed in
            accordance with the laws of the Philippines, and you irrevocably
            submit to the exclusive jurisdiction of the courts in that location.
          </p>

          <h4>15. Contact Information</h4>
          <p>
            If you have any questions about these Terms and Conditions, please
            contact us through our inquiry form or visit our branch offices.
          </p>

          <div className="terms-acceptance">
            <p>
              <strong className="terms-condition-statement">
                By clicking "I Agree" or by continuing to use our services, you
                acknowledge that you have read, understood, and agree to be
                bound by these Terms and Conditions.
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

export default TermsModal;
