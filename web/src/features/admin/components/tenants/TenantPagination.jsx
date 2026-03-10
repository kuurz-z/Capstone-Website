export default function TenantPagination({
  currentPage,
  totalPages,
  startIndex,
  itemsPerPage,
  totalItems,
  onPageChange,
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderTop: "1px solid #e5e7eb",
        backgroundColor: "white",
      }}
    >
      <div style={{ fontSize: "14px", color: "#6b7280" }}>
        Showing {startIndex + 1} to{" "}
        {Math.min(startIndex + itemsPerPage, totalItems)} of {totalItems}{" "}
        tenants
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            backgroundColor: currentPage === 1 ? "#f3f4f6" : "white",
            color: currentPage === 1 ? "#9ca3af" : "#374151",
            cursor: currentPage === 1 ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          ← Previous
        </button>

        <div style={{ display: "flex", gap: "4px" }}>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let page;
            if (totalPages <= 5) {
              page = i + 1;
            } else if (currentPage <= 3) {
              page = i + 1;
            } else if (currentPage >= totalPages - 2) {
              page = totalPages - 4 + i;
            } else {
              page = currentPage - 2 + i;
            }
            return (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                style={{
                  padding: "6px 10px",
                  border:
                    page === currentPage
                      ? "1px solid #0C375F"
                      : "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor: page === currentPage ? "#0C375F" : "white",
                  color: page === currentPage ? "white" : "#374151",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "500",
                  minWidth: "32px",
                }}
              >
                {page}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            backgroundColor: currentPage === totalPages ? "#f3f4f6" : "white",
            color: currentPage === totalPages ? "#9ca3af" : "#374151",
            cursor: currentPage === totalPages ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
