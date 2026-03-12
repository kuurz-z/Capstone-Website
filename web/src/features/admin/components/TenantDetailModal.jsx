import '../styles/tenant-detail-modal.css';

const formatDate = (d) => {
  if (!d || d === '-') return 'N/A';
  const date = new Date(d);
  return isNaN(date) ? 'N/A' : date.toISOString().split('T')[0];
};

const formatMoney = (amount) => {
  if (!amount && amount !== 0) return 'N/A';
  return `₱${Number(amount).toLocaleString()}`;
};

export default function TenantDetailModal({ tenant, onClose }) {
  if (!tenant) return null;

  return (
    <div className="tenant-detail-modal-overlay" onClick={onClose}>
      <div className="tenant-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="tenant-detail-modal-close" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Modal Header */}
        <div className="tenant-detail-modal-header">
          <div className="tenant-detail-modal-profile">
            <div className="tenant-detail-modal-avatar">
              {tenant.initials}
            </div>
            <div className="tenant-detail-modal-profile-info">
              <h2 className="tenant-detail-modal-name">{tenant.name}</h2>
              <p className="tenant-detail-modal-label">Tenant's Name</p>
              <div className="tenant-detail-modal-status-badge">
                <span className="tenant-detail-modal-status-dot"></span>
                <span className="tenant-detail-modal-status-text">MSI Status: {tenant.status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Content */}
        <div className="tenant-detail-modal-content">
          {/* Left Column */}
          <div className="tenant-detail-modal-left">
            {/* Personal Information */}
            <div className="tenant-detail-modal-section">
              <div className="tenant-detail-modal-form-row">
                <div className="tenant-detail-modal-form-group">
                  <label className="tenant-detail-modal-form-label">Name</label>
                  <input type="text" className="tenant-detail-modal-form-input" value={tenant.name} readOnly />
                </div>
                <div className="tenant-detail-modal-form-group">
                  <label className="tenant-detail-modal-form-label">Email</label>
                  <input type="email" className="tenant-detail-modal-form-input" value={tenant.email} readOnly />
                </div>
              </div>

              <div className="tenant-detail-modal-form-row">
                <div className="tenant-detail-modal-form-group">
                  <label className="tenant-detail-modal-form-label">Phone</label>
                  <input type="tel" className="tenant-detail-modal-form-input" value={tenant.phone} readOnly />
                </div>
                <div className="tenant-detail-modal-form-group">
                  <label className="tenant-detail-modal-form-label">Date of Birth</label>
                  <input type="text" className="tenant-detail-modal-form-input" value={formatDate(tenant.dateOfBirth)} readOnly />
                </div>
              </div>

              <div className="tenant-detail-modal-form-row">
                <div className="tenant-detail-modal-form-group">
                  <label className="tenant-detail-modal-form-label">Gender</label>
                  <input type="text" className="tenant-detail-modal-form-input" value={tenant.gender ? tenant.gender.charAt(0).toUpperCase() + tenant.gender.slice(1) : 'Not provided'} readOnly />
                </div>
              </div>

              <div className="tenant-detail-modal-form-group">
                <label className="tenant-detail-modal-form-label">Address</label>
                <input type="text" className="tenant-detail-modal-form-input" value={[tenant.address, tenant.city].filter(Boolean).join(', ') || 'Not provided'} readOnly />
              </div>
            </div>

            {/* Contract Details */}
            <div className="tenant-detail-modal-section">
              <h3 className="tenant-detail-modal-section-title">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <g clip-path="url(#clip0_141_476)">
    <path d="M12.4997 1.66675H4.99967C4.55765 1.66675 4.13372 1.84234 3.82116 2.1549C3.5086 2.46746 3.33301 2.89139 3.33301 3.33341V16.6667C3.33301 17.1088 3.5086 17.5327 3.82116 17.8453C4.13372 18.1578 4.55765 18.3334 4.99967 18.3334H14.9997C15.4417 18.3334 15.8656 18.1578 16.1782 17.8453C16.4907 17.5327 16.6663 17.1088 16.6663 16.6667V5.83341L12.4997 1.66675Z" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11.667 1.66675V5.00008C11.667 5.44211 11.8426 5.86603 12.1551 6.17859C12.4677 6.49115 12.8916 6.66675 13.3337 6.66675H16.667" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.33366 7.5H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.3337 10.8333H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.3337 14.1667H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <defs>
    <clipPath id="clip0_141_476">
      <rect width="20" height="20" fill="white"/>
    </clipPath>
  </defs>
</svg>
                Contract Details
              </h3>

              <div className="tenant-detail-modal-contract">
                <div className="tenant-detail-modal-contract-header">
                  <span className="tenant-detail-modal-contract-name">Lease Agreement</span>
                  <span className="tenant-detail-modal-contract-status active">{tenant.status || 'N/A'}</span>
                </div>
                <div className="tenant-detail-modal-contract-dates">
                  <div className="tenant-detail-modal-contract-date">
                    <span className="tenant-detail-modal-contract-label">Start Date</span>
                    <span className="tenant-detail-modal-contract-value">{tenant.moveIn || 'N/A'}</span>
                  </div>
                  <div className="tenant-detail-modal-contract-date">
                    <span className="tenant-detail-modal-contract-label">End Date</span>
                    <span className="tenant-detail-modal-contract-value">{tenant.moveOut || 'N/A'}</span>
                  </div>
                </div>
                <button
                  className="tenant-detail-modal-contract-download"
                  onClick={async () => {
                    try {
                      const { generateContractPDF } = await import('../../../shared/utils/pdfUtils');
                      generateContractPDF({
                        userId: { firstName: tenant.name?.split(' ')[0] || '', lastName: tenant.name?.split(' ').slice(1).join(' ') || '', email: tenant.email },
                        reservationCode: tenant.reservationId || 'N/A',
                        roomId: { name: tenant.room, branch: tenant.branch, type: tenant.roomType },
                        selectedBed: { position: 'N/A' },
                        checkInDate: tenant.moveIn !== '-' ? tenant.moveIn : null,
                        leaseDuration: 12,
                        totalPrice: tenant.monthlyRent,
                      });
                    } catch (err) { console.error('PDF generation failed:', err); alert('Failed to generate contract PDF'); }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 1V10M8 10L4.5 6.5M8 10L11.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 14H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Download Contract
                </button>
              </div>
            </div>

            {/* Other Documents */}
            <div className="tenant-detail-modal-section">
              <h3 className="tenant-detail-modal-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <g clip-path="url(#clip0_141_476)">
    <path d="M12.4997 1.66675H4.99967C4.55765 1.66675 4.13372 1.84234 3.82116 2.1549C3.5086 2.46746 3.33301 2.89139 3.33301 3.33341V16.6667C3.33301 17.1088 3.5086 17.5327 3.82116 17.8453C4.13372 18.1578 4.55765 18.3334 4.99967 18.3334H14.9997C15.4417 18.3334 15.8656 18.1578 16.1782 17.8453C16.4907 17.5327 16.6663 17.1088 16.6663 16.6667V5.83341L12.4997 1.66675Z" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11.667 1.66675V5.00008C11.667 5.44211 11.8426 5.86603 12.1551 6.17859C12.4677 6.49115 12.8916 6.66675 13.3337 6.66675H16.667" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.33366 7.5H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.3337 10.8333H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.3337 14.1667H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <defs>
    <clipPath id="clip0_141_476">
      <rect width="20" height="20" fill="white"/>
    </clipPath>
  </defs>
</svg>
                Other Documents
              </h3>

              <div className="tenant-detail-modal-documents">
                <div className="tenant-detail-modal-document-item">
                  <div className="tenant-detail-modal-document-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <g clip-path="url(#clip0_141_476)">
    <path d="M12.4997 1.66675H4.99967C4.55765 1.66675 4.13372 1.84234 3.82116 2.1549C3.5086 2.46746 3.33301 2.89139 3.33301 3.33341V16.6667C3.33301 17.1088 3.5086 17.5327 3.82116 17.8453C4.13372 18.1578 4.55765 18.3334 4.99967 18.3334H14.9997C15.4417 18.3334 15.8656 18.1578 16.1782 17.8453C16.4907 17.5327 16.6663 17.1088 16.6663 16.6667V5.83341L12.4997 1.66675Z" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11.667 1.66675V5.00008C11.667 5.44211 11.8426 5.86603 12.1551 6.17859C12.4677 6.49115 12.8916 6.66675 13.3337 6.66675H16.667" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.33366 7.5H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.3337 10.8333H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.3337 14.1667H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <defs>
    <clipPath id="clip0_141_476">
      <rect width="20" height="20" fill="white"/>
    </clipPath>
  </defs>
</svg>
                  </div>
                  <div className="tenant-detail-modal-document-info">
                    <span className="tenant-detail-modal-document-name">Valid ID</span>
                    <span className="tenant-detail-modal-document-date">Government ID • 2025-12-20</span>
                  </div>
                  <button className="tenant-detail-modal-document-download">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 1V10M8 10L4.5 6.5M8 10L11.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 14H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                <div className="tenant-detail-modal-document-item">
                  <div className="tenant-detail-modal-document-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <g clip-path="url(#clip0_141_476)">
    <path d="M12.4997 1.66675H4.99967C4.55765 1.66675 4.13372 1.84234 3.82116 2.1549C3.5086 2.46746 3.33301 2.89139 3.33301 3.33341V16.6667C3.33301 17.1088 3.5086 17.5327 3.82116 17.8453C4.13372 18.1578 4.55765 18.3334 4.99967 18.3334H14.9997C15.4417 18.3334 15.8656 18.1578 16.1782 17.8453C16.4907 17.5327 16.6663 17.1088 16.6663 16.6667V5.83341L12.4997 1.66675Z" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11.667 1.66675V5.00008C11.667 5.44211 11.8426 5.86603 12.1551 6.17859C12.4677 6.49115 12.8916 6.66675 13.3337 6.66675H16.667" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.33366 7.5H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.3337 10.8333H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.3337 14.1667H6.66699" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <defs>
    <clipPath id="clip0_141_476">
      <rect width="20" height="20" fill="white"/>
    </clipPath>
  </defs>
</svg>
                  </div>
                  <div className="tenant-detail-modal-document-info">
                    <span className="tenant-detail-modal-document-name">Proof of Employment</span>
                    <span className="tenant-detail-modal-document-date">Employment • 2025-12-20</span>
                  </div>
                  <button className="tenant-detail-modal-document-download">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 1V10M8 10L4.5 6.5M8 10L11.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 14H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              <button className="tenant-detail-modal-edit-docs">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 14H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M11.5 2.5L13.5 4.5M1.5 13.5L4.5 10.5C4.89782 10.1022 5.60218 10.1022 6 10.5L12.5 4C12.8978 3.60218 13.6022 3.60218 14 4L14.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Edit Documents/Info
              </button>
            </div>
          </div>

          {/* Right Column */}
          <div className="tenant-detail-modal-right">
            {/* Emergency Contact */}
            <div className="tenant-detail-modal-section">
              <h3 className="tenant-detail-modal-section-title">Emergency Contact</h3>

              <div className="tenant-detail-modal-form-group">
                <label className="tenant-detail-modal-form-label">Name</label>
                <input type="text" className="tenant-detail-modal-form-input" value={tenant.emergencyContact || 'Not provided'} readOnly />
              </div>

              <div className="tenant-detail-modal-form-group">
                <label className="tenant-detail-modal-form-label">Email</label>
                <input type="email" className="tenant-detail-modal-form-input" value={tenant.emergencyEmail || 'Not provided'} readOnly />
              </div>

              <div className="tenant-detail-modal-form-group">
                <label className="tenant-detail-modal-form-label">Phone</label>
                <input type="tel" className="tenant-detail-modal-form-input" value={tenant.emergencyPhone || 'Not provided'} readOnly />
              </div>

              <div className="tenant-detail-modal-form-group">
                <label className="tenant-detail-modal-form-label">Relationship</label>
                <input type="text" className="tenant-detail-modal-form-input" value={tenant.emergencyRelation || 'Not provided'} readOnly />
              </div>
            </div>

            {/* Room Assignment */}
            <div className="tenant-detail-modal-section">
              <h3 className="tenant-detail-modal-section-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
  <g clip-path="url(#clip0_141_581)">
    <path d="M10 8.33325H10.0083" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 11.6667H10.0083" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 5H10.0083" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.333 8.33325H13.3413" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.333 11.6667H13.3413" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.333 5H13.3413" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.66699 8.33325H6.67533" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.66699 11.6667H6.67533" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.66699 5H6.67533" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7.5 18.3333V15.8333C7.5 15.6123 7.5878 15.4004 7.74408 15.2441C7.90036 15.0878 8.11232 15 8.33333 15H11.6667C11.8877 15 12.0996 15.0878 12.2559 15.2441C12.4122 15.4004 12.5 15.6123 12.5 15.8333V18.3333" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14.9997 1.66675H4.99967C4.0792 1.66675 3.33301 2.41294 3.33301 3.33341V16.6667C3.33301 17.5872 4.0792 18.3334 4.99967 18.3334H14.9997C15.9201 18.3334 16.6663 17.5872 16.6663 16.6667V3.33341C16.6663 2.41294 15.9201 1.66675 14.9997 1.66675Z" stroke="#155DFC" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <defs>
    <clipPath id="clip0_141_581">
      <rect width="20" height="20" fill="white"/>
    </clipPath>
  </defs>
</svg>
                Room Assignment
              </h3>

              <div className="tenant-detail-modal-room-card">
                <div className="tenant-detail-modal-room-number">{tenant.room}</div>
                <div className="tenant-detail-modal-room-type">{tenant.roomType || 'Standard Room'}</div>

                <div className="tenant-detail-modal-room-details">
                  <div className="tenant-detail-modal-room-detail">
                    <span className="tenant-detail-modal-room-detail-label">Branch</span>
                    <span className="tenant-detail-modal-room-detail-value">{tenant.branch}</span>
                  </div>
                  <div className="tenant-detail-modal-room-detail">
                    <span className="tenant-detail-modal-room-detail-label">Monthly Rent</span>
                    <span className="tenant-detail-modal-room-detail-value">{formatMoney(tenant.monthlyRent)}</span>
                  </div>
                </div>

                <div className="tenant-detail-modal-room-dates">
                  <div className="tenant-detail-modal-room-date">
                    <span className="tenant-detail-modal-room-date-label">Move In</span>
                    <span className="tenant-detail-modal-room-date-value">{tenant.moveIn}</span>
                  </div>
                  <div className="tenant-detail-modal-room-date">
                    <span className="tenant-detail-modal-room-date-label">Move Out</span>
                    <span className="tenant-detail-modal-room-date-value">{tenant.moveOut}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Admin Actions ─── */}
            {tenant.reservationId && (
              <div className="tenant-detail-modal-section">
                <h3 className="tenant-detail-modal-section-title">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 1.66675L2.5 5.00008V9.16675C2.5 13.7501 5.7 18.0834 10 18.3334C14.3 18.0834 17.5 13.7501 17.5 9.16675V5.00008L10 1.66675Z" stroke="#155DFC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Tenant Actions
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Renew Contract */}
                  <button
                    className="tenant-detail-modal-contract-download"
                    onClick={async () => {
                      const months = prompt('Extend lease by how many months? (1–24)', '12');
                      if (!months) return;
                      const m = parseInt(months, 10);
                      if (isNaN(m) || m < 1 || m > 24) return alert('Enter 1–24');
                      try {
                        const { reservationApi } = await import('../../../shared/api/apiClient');
                        const res = await reservationApi.renew(tenant.reservationId, { additionalMonths: m });
                        alert(res.message || 'Contract renewed!');
                        onClose();
                      } catch (err) { alert(err.error || err.message || 'Renewal failed'); }
                    }}
                    style={{ background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 7.33A6 6 0 0 0 3.26 3.34M2 1.34v2.67h2.67M2 8.67a6 6 0 0 0 10.74 3.99M14 14.67V12h-2.67" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Renew Contract
                  </button>

                  {/* Check Out */}
                  <button
                    className="tenant-detail-modal-contract-download"
                    onClick={async () => {
                      if (!confirm(`Check out ${tenant.name}? This will vacate their bed and mark them as inactive.`)) return;
                      try {
                        const { reservationApi } = await import('../../../shared/api/apiClient');
                        const res = await reservationApi.checkout(tenant.reservationId, { reason: 'Admin checkout' });
                        alert(res.message || 'Tenant checked out');
                        onClose();
                      } catch (err) { alert(err.error || err.message || 'Checkout failed'); }
                    }}
                    style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 14H3.33A1.33 1.33 0 0 1 2 12.67V3.33A1.33 1.33 0 0 1 3.33 2H6M10.67 11.33 14 8l-3.33-3.33M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Check Out Tenant
                  </button>

                  {/* Transfer Room */}
                  <button
                    className="tenant-detail-modal-contract-download"
                    onClick={async () => {
                      const newRoomId = prompt('Enter new Room ID (ObjectId):');
                      if (!newRoomId) return;
                      const newBedId = prompt('Enter new Bed ID (ObjectId):');
                      if (!newBedId) return;
                      const reason = prompt('Reason for transfer:', 'Room maintenance / accommodation change');
                      try {
                          const { reservationApi } = await import('../../../shared/api/apiClient');
                          const res = await reservationApi.transfer(tenant.reservationId, { newRoomId, newBedId, reason });
                          alert(res.message || 'Transfer complete');
                          onClose();
                      } catch (err) { alert(err.error || err.message || 'Transfer failed'); }
                    }}
                    style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M9.33 1.33 12 4 9.33 6.67M12 4H4M6.67 9.33 4 12l2.67 2.67M4 12h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Transfer Room
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}