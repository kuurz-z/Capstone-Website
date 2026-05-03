import React from "react";
import FileUploadField from "./FileUploadField";

/**
 * Section 1: Email & Photo — email (disabled) + selfie upload.
 */
const PhotoEmailSection = ({ billingEmail, selfiePhoto, setSelfiePhoto, showValidationErrors }) => (
  <>
    <div className="form-group">
      <label className="form-label">Email Address</label>
      <input
        type="email"
        className="form-input"
        value={billingEmail}
        disabled
      />
      <div className="form-helper">
        This is where we'll send your billing statements
      </div>
    </div>
    <div data-field="selfiePhoto">
      <FileUploadField
        label="2x2 Photo or Selfie Photo"
        value={selfiePhoto}
        onChange={setSelfiePhoto}
        accept="image/*"
        hint="Clear 2x2 or selfie photo"
        hasError={showValidationErrors && !selfiePhoto}
        required
      />
    </div>
  </>
);

export default PhotoEmailSection;
