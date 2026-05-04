import React from "react";

/**
 * Section 6: Agreements & Consent — privacy consent + certification checkboxes
 * with links to policy modals.
 */
const AgreementsSection = ({
  agreedToPrivacy, setAgreedToPrivacy,
  agreedToCertification, setAgreedToCertification,
  showValidationErrors, onShowPolicies, onShowPrivacy,
}) => {
  const allAgreed = agreedToPrivacy && agreedToCertification;
  const hasError = showValidationErrors && !allAgreed;

  return (
    <div className="rf-agreements-wrap">
      {hasError && (
        <div className="rf-agreements-error">
          Please agree to both consent items to continue.
        </div>
      )}

      <ConsentCheckbox
        id="privacy-consent"
        checked={agreedToPrivacy}
        onChange={(e) => setAgreedToPrivacy(e.target.checked)}
        title="Privacy Policy & Data Protection Consent"
        description="I consent to the collection and use of my personal data for dormitory services."
      />

      <ConsentCheckbox
        id="certification"
        checked={agreedToCertification}
        onChange={(e) => setAgreedToCertification(e.target.checked)}
        title="Information Accuracy Certification"
        description="I certify all information is true and accurate. False information may result in rejection."
      />

      <div className="rf-policy-footer">
        By proceeding, you agree to our{" "}
        <PolicyLink onClick={onShowPolicies}>Policies &amp; Terms of Service</PolicyLink>{" "}
        and <PolicyLink onClick={onShowPrivacy}>Privacy Policy</PolicyLink>.
      </div>
    </div>
  );
};

const ConsentCheckbox = ({ id, checked, onChange, title, description }) => (
  <div className="rf-consent-row">
    <input type="checkbox" id={id} checked={checked} onChange={onChange} className="rf-consent-checkbox" />
    <label htmlFor={id} className="rf-consent-label">
      <strong>{title}</strong> <span className="rf-required">*</span>
      <span className="rf-consent-description">{description}</span>
    </label>
  </div>
);

const PolicyLink = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="rf-policy-link">
    {children}
  </button>
);

export default AgreementsSection;
