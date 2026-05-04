import jsPDF from "jspdf";

const formatValue = (value) => {
  if (value == null) return "-";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value);
};

export function exportReportPdf({
  title,
  subtitle,
  filename,
  kpis = [],
  sections = [],
}) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed = 12) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const toLines = (text, width = contentWidth) => doc.splitTextToSize(String(text ?? ""), width);

  const writeLines = (lines, { x = margin, lineHeight = 4.5, font = "normal", size = 9, color } = {}) => {
    const normalizedLines = Array.isArray(lines) ? lines : [String(lines ?? "")];
    if (normalizedLines.length === 0) return;
    ensureSpace(normalizedLines.length * lineHeight + 1);
    doc.setFont("helvetica", font);
    doc.setFontSize(size);
    if (color) {
      doc.setTextColor(...color);
    }
    doc.text(normalizedLines, x, y);
    if (color) {
      doc.setTextColor(0, 0, 0);
    }
    y += normalizedLines.length * lineHeight;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title || "Analytics Report", margin, y);
  y += 7;

  if (subtitle) {
    writeLines(toLines(subtitle), {
      size: 10,
      color: [100, 100, 100],
    });
    y += 3.5;
  }

  if (kpis.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Summary", margin, y);
    y += 6;

    const colWidth = (pageWidth - margin * 2) / 2;
    kpis.forEach((item, index) => {
      ensureSpace(10);
      const x = margin + (index % 2) * colWidth;
      const row = Math.floor(index / 2);
      const rowOffset = row * 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text(item.label, x, y + rowOffset);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text(formatValue(item.value), x, y + rowOffset + 4.5);
    });
    y += Math.ceil(kpis.length / 2) * 10 + 4;
  }

  sections.forEach((section) => {
    ensureSpace(16);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(section.title, margin, y);
    y += 6;

    if (section.description) {
      writeLines(toLines(section.description), {
        size: 9,
        color: [100, 100, 100],
      });
      y += 1;
    }

    if (Array.isArray(section.rows) && section.rows.length > 0) {
      section.rows.forEach((row) => {
        const rowLines = toLines(row);
        writeLines(rowLines, {
          size: 9,
          lineHeight: 4.5,
        });
      });
    } else {
      writeLines("No rows available.", { size: 9 });
    }
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 170);
    doc.text(
      `Lilycrest Reports • Page ${page} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" },
    );
  }

  doc.save(filename || "analytics-report.pdf");
}
