export default function InquiryItem({ inquiry }) {
  return (
    <div className="admin-inquiry-item">
      <div className="admin-inquiry-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M18 14.1667C18 14.6087 17.8244 15.0326 17.5118 15.3452C17.1993 15.6577 16.7754 15.8333 16.3333 15.8333H5.35667C4.91467 15.8334 4.49082 16.0091 4.17833 16.3217L2.34333 18.1567C2.26059 18.2394 2.15517 18.2957 2.04041 18.3186C1.92564 18.3414 1.80669 18.3297 1.69859 18.2849C1.59048 18.2401 1.49808 18.1643 1.43307 18.067C1.36806 17.9697 1.33335 17.8553 1.33333 17.7383V4.16667C1.33333 3.72464 1.50893 3.30072 1.82149 2.98816C2.13405 2.67559 2.55797 2.5 3 2.5H16.3333C16.7754 2.5 17.1993 2.67559 17.5118 2.98816C17.8244 3.30072 18 3.72464 18 4.16667V14.1667Z"
            stroke="#0F4A7F"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="admin-inquiry-content">
        <p className="admin-inquiry-name">{inquiry.name}</p>
        <p className="admin-inquiry-email">{inquiry.email}</p>
        <div className="admin-inquiry-meta">
          <span className="admin-inquiry-branch">{inquiry.branch}</span>
          <span className="admin-inquiry-time">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle
                cx="6"
                cy="6"
                r="5"
                stroke="currentColor"
                strokeWidth="1"
              />
              <path
                d="M6 3V6L8 7"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
            {inquiry.time}
          </span>
        </div>
      </div>
      <div className={`admin-inquiry-status ${inquiry.status}`}>
        {inquiry.status}
      </div>
    </div>
  );
}
