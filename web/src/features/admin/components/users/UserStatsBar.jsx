export default function UserStatsBar({ statsData }) {
  return (
    <div className="stats">
      <div className="stat-card">
        <div className="stat-header">
          <div>
            <div className="stat-label">Total Users</div>
            <div className="stat-value">{statsData.total}</div>
            <div className="stat-change">Updated just now</div>
          </div>
          <div className="stat-icon blue">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H7C5.93913 15 4.92172 15.4214 4.17157 16.1716C3.42143 16.9217 3 17.9391 3 19V21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 11C12.2091 11 14 9.20914 14 7C14 4.79086 12.2091 3 10 3C7.79086 3 6 4.79086 6 7C6 9.20914 7.79086 11 10 11Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 21V19C20.9993 18.1137 20.7044 17.2527 20.1614 16.5523C19.6184 15.8519 18.8577 15.3516 18 15.13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 3.13C15.8604 3.3503 16.623 3.8507 17.1676 4.55231C17.7122 5.25392 18.0078 6.11683 18.0078 7.005C18.0078 7.89318 17.7122 8.75608 17.1676 9.45769C16.623 10.1593 15.8604 10.6597 15 10.88"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <div>
            <div className="stat-label">Active Users</div>
            <div className="stat-value">{statsData.active}</div>
            <div className="stat-subtitle">
              {statsData.total
                ? `${Math.round((statsData.active / statsData.total) * 100)}% active rate`
                : "No users yet"}
            </div>
          </div>
          <div className="stat-icon blue">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M20 6L9 17L4 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <div>
            <div className="stat-label">Branches</div>
            <div className="stat-value">{statsData.branches}</div>
            <div className="stat-subtitle">{statsData.branchLabel}</div>
          </div>
          <div className="stat-icon orange">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M3 21V8L12 3L21 8V21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 21V12H15V21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <div>
            <div className="stat-label">User Roles</div>
            <div className="stat-value">{statsData.roles}</div>
            <div className="stat-subtitle">Different access levels</div>
          </div>
          <div className="stat-icon orange">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 3L19 6.5V11.5C19 16 16 19.5 12 21C8 19.5 5 16 5 11.5V6.5L12 3Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 12.5L11 14L14.5 10.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
