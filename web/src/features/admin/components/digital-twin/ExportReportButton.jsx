import { useState, useCallback } from "react";
import { Download } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * ExportReportButton — Generates a branded PDF snapshot of the Digital Twin dashboard.
 * Captures KPIs, at-risk rooms, and the visual room grid into a downloadable PDF.
 *
 * @param {{ kpis: object, rooms: Array, branchLabel: string, captureRef: React.RefObject }} props
 */
export default function ExportReportButton({ kpis, rooms, branchLabel, captureRef }) {
 const [exporting, setExporting] = useState(false);

 const handleExport = useCallback(async () => {
 setExporting(true);
 try {
 const pdf = new jsPDF("p", "mm", "a4");
 const pageW = pdf.internal.pageSize.getWidth();
 const margin = 14;
 let y = margin;

 // ── Header ──
 pdf.setFont("helvetica", "bold");
 pdf.setFontSize(18);
 pdf.setTextColor(30, 30, 30);
 pdf.text("Lilycrest Digital Twin Report", margin, y);
 y += 7;

 pdf.setFont("helvetica", "normal");
 pdf.setFontSize(10);
 pdf.setTextColor(120, 120, 120);
 pdf.text(`Branch: ${branchLabel} • Generated: ${new Date().toLocaleString("en-PH")}`, margin, y);
 y += 10;

 // ── Divider ──
 pdf.setDrawColor(220, 220, 220);
 pdf.line(margin, y, pageW - margin, y);
 y += 8;

 // ── KPI Section ──
 pdf.setFont("helvetica", "bold");
 pdf.setFontSize(11);
 pdf.setTextColor(50, 50, 50);
 pdf.text("KEY PERFORMANCE INDICATORS", margin, y);
 y += 7;

 const kpiItems = [
 { label: "Overall Health", value: `${kpis.overallHealth ?? "—"}/100` },
 { label: "Occupancy Rate", value: `${kpis.occupancyRate ?? 0}%` },
 { label: "Total Rooms", value: `${kpis.totalRooms ?? 0}` },
 { label: "At-Risk Rooms", value: `${kpis.atRiskRooms ?? 0}` },
 { label: "Open Maintenance", value: `${kpis.openMaintenance ?? 0}` },
 { label: "Revenue Due", value: `₱${(kpis.totalOwed ?? 0).toLocaleString()}` },
 ];

 const colW = (pageW - margin * 2) / 3;
 kpiItems.forEach((item, i) => {
 const col = i % 3;
 const row = Math.floor(i / 3);
 const x = margin + col * colW;
 const yPos = y + row * 12;

 pdf.setFont("helvetica", "normal");
 pdf.setFontSize(9);
 pdf.setTextColor(140, 140, 140);
 pdf.text(item.label, x, yPos);

 pdf.setFont("helvetica", "bold");
 pdf.setFontSize(12);
 pdf.setTextColor(30, 30, 30);
 pdf.text(item.value, x, yPos + 5);
 });

 y += Math.ceil(kpiItems.length / 3) * 12 + 8;

 // ── Divider ──
 pdf.line(margin, y, pageW - margin, y);
 y += 8;

 // ── At-Risk Rooms Table ──
 const atRisk = rooms
 .filter((r) => r.health?.tier === "critical" || r.health?.tier === "warning")
 .sort((a, b) => a.health.score - b.health.score)
 .slice(0, 10);

 if (atRisk.length > 0) {
 pdf.setFont("helvetica", "bold");
 pdf.setFontSize(11);
 pdf.setTextColor(50, 50, 50);
 pdf.text("AT-RISK ROOMS", margin, y);
 y += 7;

 // Table header
 pdf.setFont("helvetica", "bold");
 pdf.setFontSize(8);
 pdf.setTextColor(100, 100, 100);
 pdf.text("Room", margin, y);
 pdf.text("Health", margin + 45, y);
 pdf.text("Occupancy", margin + 70, y);
 pdf.text("Maintenance", margin + 100, y);
 pdf.text("Overdue", margin + 130, y);
 y += 2;
 pdf.setDrawColor(230, 230, 230);
 pdf.line(margin, y, pageW - margin, y);
 y += 4;

 // Table rows
 pdf.setFont("helvetica", "normal");
 pdf.setFontSize(9);
 atRisk.forEach((room) => {
 if (y > 270) {
 pdf.addPage();
 y = margin;
 }
 pdf.setTextColor(30, 30, 30);
 pdf.text(room.name || "—", margin, y);

 const healthColor = room.health.tier === "critical" ? [220, 38, 38] : [234, 179, 8];
 pdf.setTextColor(...healthColor);
 pdf.text(`${room.health.score}`, margin + 45, y);

 pdf.setTextColor(80, 80, 80);
 pdf.text(`${room.currentOccupancy}/${room.capacity}`, margin + 70, y);
 pdf.text(`${room.maintenance?.openCount ?? 0}`, margin + 100, y);
 pdf.text(`${room.billing?.overdueCount ?? 0}`, margin + 130, y);
 y += 6;
 });

 y += 4;
 }

 // ── Visual Grid Screenshot ──
 if (captureRef?.current) {
 try {
 const canvas = await html2canvas(captureRef.current, {
 scale: 1.5,
 useCORS: true,
 backgroundColor: "#ffffff",
 logging: false,
 });

 if (y > 200) {
 pdf.addPage();
 y = margin;
 }

 pdf.setFont("helvetica", "bold");
 pdf.setFontSize(11);
 pdf.setTextColor(50, 50, 50);
 pdf.text("ROOM OVERVIEW", margin, y);
 y += 6;

 const imgData = canvas.toDataURL("image/jpeg", 0.85);
 const imgW = pageW - margin * 2;
 const imgH = (canvas.height / canvas.width) * imgW;
 const maxH = 260 - y;

 pdf.addImage(imgData, "JPEG", margin, y, imgW, Math.min(imgH, maxH));
 } catch {
 // Screenshot failed silently — PDF still includes KPIs + table
 }
 }

 // ── Footer ──
 const totalPages = pdf.internal.getNumberOfPages();
 for (let i = 1; i <= totalPages; i++) {
 pdf.setPage(i);
 pdf.setFont("helvetica", "normal");
 pdf.setFontSize(8);
 pdf.setTextColor(180, 180, 180);
 pdf.text(
 `Lilycrest DMS • Page ${i} of ${totalPages}`,
 pageW / 2,
 pdf.internal.pageSize.getHeight() - 8,
 { align: "center" },
 );
 }

 const filename = `digital-twin-report-${branchLabel.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
 pdf.save(filename);
 } catch (err) {
 console.error("PDF export failed:", err);
 } finally {
 setExporting(false);
 }
 }, [kpis, rooms, branchLabel, captureRef]);

 return (
 <button
 className="dt-export-btn"
 onClick={handleExport}
 disabled={exporting}
 aria-label="Export report as PDF"
 >
 <Download size={14} />
 {exporting ? "Generating…" : "Download Report"}
 </button>
 );
}
