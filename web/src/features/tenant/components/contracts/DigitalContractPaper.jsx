import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import {
  Download,
  Printer,
  ShieldCheck,
  FileCheck,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize2,
  Columns2,
  FileText,
  X,
  Loader2,
} from "lucide-react";
import { tenantContractApi } from "../../api/tenantContractApi";
import useBodyScrollLock from "../../../../shared/hooks/useBodyScrollLock";

dayjs.extend(advancedFormat);

const numberWords = Object.freeze({
  1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
  7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve",
});

const durationInWords = (value) => {
  const number = Number(value);
  return numberWords[number] || String(value);
};

const formatMoney = (val) => Number(val || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Mirrors normalizeContractBedDisplay in server/services/contractPdfService.js
// so the live web view shows the same "Upper"/"Lower" wording as the
// generated PDF instead of the raw compact code (e.g. "GD-106-A-L").
const BED_CODE_POSITION_SUFFIX = /-(U|L|S)$/i;
const BED_CODE_POSITION_LABELS = Object.freeze({ U: "Upper", L: "Lower", S: "" });
const normalizeBedDisplay = (value) => {
  const text = String(value || "").trim();
  if (!text) return text;
  if (/^upper$/i.test(text)) return "Upper";
  if (/^lower$/i.test(text)) return "Lower";
  const suffixMatch = text.match(BED_CODE_POSITION_SUFFIX);
  if (suffixMatch) return BED_CODE_POSITION_LABELS[suffixMatch[1].toUpperCase()];
  return text;
};

// Professional 1:1 Legal Contract Typography matching official master template
const POPULATED_COLOR = "inherit";

const Populated = ({ children, className = "", style = {} }) => (
  <span
    className={`font-bold text-slate-950 dark:text-white ${className}`}
    style={{ color: POPULATED_COLOR, ...style }}
  >
    {children}
  </span>
);

export default function DigitalContractPaper({
  stayData,
  contract,
  onDownloadPdf,
  isDownloading,
  onViewSigned,
  onDownloadSigned,
  // Optional: (contract) => Promise<Blob> — resolves the actual canonical
  // backend PDF (prepared draft or final, whichever this contract's own
  // documents indicate) for the caller's context (tenant vs admin route).
  // When supplied and a real document exists, Print/Download use this exact
  // file instead of reconstructing one from this component's DOM — per the
  // "print the actual PDF, don't rebuild from HTML" requirement. Falls back
  // to the existing DOM print/export below when absent (e.g. an early-stage
  // preview before any PDF has been generated yet).
  fetchDocumentPdf,
  // Optional: ({ contractId, version, download }) => Promise<Blob> — resolves
  // the wet-signed / final scan for the CANONICAL identity the backend
  // returned in `signedScan` (which may be an ANCESTOR lease's contract id
  // when the current contract is a Room Transfer Addendum). Admin injects
  // contractApi.getSignedContractFile; Tenant injects
  // tenantContractApi.getMySignedContractFile. When absent, the tenant route
  // is used with the resolved contractId (back-compat).
  fetchSignedDoc,
}) {
  const pdfLegalPageRef = useRef(null);
  // R5.2/R5.4 — the hidden <iframe> + its blob: URL used for printing the
  // canonical PDF. window.print() returns BEFORE the browser's print preview
  // has finished owning the document, so revoking the URL / removing the
  // iframe on a short timer kills the preview mid-view ("Total: 1 sheet… then
  // it disappears"). We keep ONE print resource alive until this component
  // unmounts, and replace (never leak) it on a repeat print.
  const printResourceRef = useRef(null); // { iframe, url }
  const [realPdfBusy, setRealPdfBusy] = useState(false);
  const [documentError, setDocumentError] = useState(null);

  const rawRoom = String(stayData?.roomType || contract?.roomType || "").toLowerCase();
  const roomNumberStr = String(stayData?.roomNumber || contract?.roomNumber || "").toLowerCase();
  let roomLabel = "DOUBLE SHARING";
  let isPrivate = false;
  if (rawRoom.includes("private") || roomNumberStr.includes("803") || roomNumberStr.includes("private")) {
    roomLabel = "PRIVATE ROOM";
    isPrivate = true;
  } else if (rawRoom.includes("quad")) {
    roomLabel = "QUADRUPLE SHARING";
  }

  const durationMonths = Number(stayData?.leaseDurationMonths || contract?.leaseDurationMonths || 12);
  const isShortTerm = durationMonths < 6;
  const termLabel = isShortTerm ? "SHORT TERM" : "LONG TERM";

  let regularRate = Number(stayData?.regularMonthlyRate ?? contract?.regularMonthlyRate ?? 0);
  let monthlyRent = Number(stayData?.approvedMonthlyRate ?? contract?.approvedMonthlyRate ?? 0);
  let discountPercent = Number(stayData?.discountPercentage ?? contract?.discountPercentage ?? (isPrivate ? 10 : 0));
  let advanceRent = Number(stayData?.advanceRentAmount ?? contract?.advanceRentAmount ?? 0);
  let securityDeposit = Number(stayData?.securityDepositAmount ?? contract?.securityDepositAmount ?? 0);

  // Only fill in a placeholder when the contract genuinely has no value yet
  // (e.g. previewing before pricing is set) — never override a real,
  // authoritative value just because it looks low. Contract.regularMonthlyRate
  // /approvedMonthlyRate/advanceRentAmount/securityDepositAmount are already
  // the single canonical pricing snapshot (see tenantContractViewService.js);
  // this view must render them verbatim like every other consumer does.
  if (isPrivate) {
    if (regularRate <= 0) regularRate = 15000;
    if (monthlyRent <= 0) monthlyRent = 13500;
    if (advanceRent <= 0) advanceRent = monthlyRent || 13500;
    if (securityDeposit <= 0) securityDeposit = monthlyRent || 13500;
  } else {
    if (regularRate <= 0) regularRate = 5400;
    if (monthlyRent <= 0) monthlyRent = 5400;
    if (advanceRent <= 0) advanceRent = monthlyRent || 5400;
    if (securityDeposit <= 0) securityDeposit = monthlyRent || 5400;
  }

  const startDate = stayData?.leaseStartDate || contract?.leaseStartDate ? dayjs(stayData?.leaseStartDate || contract?.leaseStartDate) : dayjs();
  const endDate = stayData?.leaseEndDate || contract?.leaseEndDate ? dayjs(stayData?.leaseEndDate || contract?.leaseEndDate) : startDate.add(durationMonths, "month");

  const formattedStart = startDate.format("MMMM D, YYYY");
  const formattedEnd = endDate.format("MMMM D, YYYY");
  const advanceStart = formattedStart;
  const advanceEnd = startDate.add(1, "month").format("MMMM D, YYYY");

  const executionDay = startDate.format("Do");
  const executionMonth = startDate.format("MMMM");
  const executionYear = startDate.format("YYYY");

  const tenantName = stayData?.tenantLegalName || contract?.tenantLegalName || stayData?.tenantName || contract?.tenantName || "Valued Tenant";
  // No hardcoded literal fallback here on purpose: both stayData and contract
  // now carry the tenant's real tenantResidentialAddress (see
  // tenantContractViewService.js / digitalStayProofService.js) — a specific
  // sample address silently substituted for missing data is exactly the
  // class of bug this replaces (a real tenant's contract must never render
  // another address that looks legitimate but isn't theirs).
  // contract.tenantAddress is the raw Contract schema field name (see
  // Contract.js) — tenantResidentialAddress is the alias
  // tenantContractViewService.js/digitalStayProofService.js expose on their
  // computed views. Accept both so a caller passing the raw Contract record
  // (e.g. Admin Web's /contracts list, before its own canonical fetch
  // resolves) still renders the tenant's real address instead of falling
  // through to "—".
  const tenantAddress = stayData?.tenantResidentialAddress || contract?.tenantResidentialAddress
    || contract?.tenantAddress || "—";
  const roomNumber = stayData?.roomNumber || contract?.roomNumber || (isPrivate ? "GP-803" : "GP-305");
  const bedSlot = isPrivate ? "Entire Room" : normalizeBedDisplay(stayData?.bedLabel || contract?.bedLabel || "upper");

  const branchName = String(stayData?.branch || contract?.branch || "").toLowerCase().includes("guadalupe")
    ? "LILYCREST GUADALUPE"
    : "LILYCREST GIL PUYAT";

  const branchAddress = stayData?.propertyAddress || contract?.propertyAddress || (String(stayData?.branch || contract?.branch || "").toLowerCase().includes("guadalupe")
    ? "9431 Magallanes St., Guadalupe Nuevo, Makati City"
    : "#7 Gil Puyat Ave. corner Marconi St., Makati City");

  const leaseSpaceSubject = isPrivate ? "private room" : "bed space";
  const durationCondition = isShortTerm
    ? "not less than one (1) month and less than six (6) months."
    : "not less than six (6) months.";

  const amenitiesParagraph = isPrivate
    ? "The said rental fee is inclusive of the use of the leased premises and the room’s own private toilet and bath and kitchenette, as well as the common lounge area on the same floor, subject to the House Rules and Regulations (ANNEX “A”) provided by the LESSOR. The leased premises are fully furnished with a double-decked bed and mattress, an air conditioning unit, table, chair, cabinet, and shower water heater."
    : "The said rental fee is inclusive of the use of the leased premises and the common facilities provided on the same floor of the unit, such as the toilet and bath and the lounge area with kitchen appliances, subject to the House Rules and Regulations (ANNEX “A”) provided by the LESSOR. The leased premises are fully furnished with a double-decked bed and mattress, an air conditioning unit, table, chair, cabinet, and shower water heater.";

  // ── CANONICAL signed-scan identity ───────────────────────────────────────
  // The backend (signedContractScanResolver) resolves which contract + version
  // actually owns the wet-signed / final scan for what is being viewed — and,
  // for a Room Transfer Addendum with no scan of its own, walks the lineage to
  // the original lease and flags `inherited`. NEVER infer availability from
  // `contract.signedDocuments.length` on the current contract alone.
  const signedScan = stayData?.signedScan || contract?.signedScan || null;
  const activeSignedDocs = (contract?.signedDocuments || []).filter((doc) => !doc.superseded);
  // Multi-version history is only shown when the scan lives on the SAME
  // contract being viewed (not inherited) AND that contract carries the
  // signedDocuments[] entries.
  const scanContractId =
    signedScan?.contractId || contract?.id || contract?._id || null;
  const ownsScanDocs =
    !!signedScan &&
    !signedScan.inherited &&
    activeSignedDocs.length > 0 &&
    String(scanContractId) === String(contract?.id || contract?._id || "");
  const hasSignedDoc = Boolean(signedScan) || activeSignedDocs.length > 0;

  // View & Interactive State (Default to Initial Lease view)
  const [layoutMode, setLayoutMode] = useState("digital");
  const [selectedVersion, setSelectedVersion] = useState(
    signedScan?.version || activeSignedDocs[0]?.version || 1,
  );
  const [signedBlobUrl, setSignedBlobUrl] = useState(null);
  const [signedBlobLoading, setSignedBlobLoading] = useState(false);
  const [signedBlobError, setSignedBlobError] = useState(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Synchronize layout mode and selected version if signed documents change or are deleted
  useEffect(() => {
    if (!hasSignedDoc && layoutMode !== "digital") {
      setLayoutMode("digital");
    }
  }, [hasSignedDoc, layoutMode]);

  useEffect(() => {
    if (ownsScanDocs && !activeSignedDocs.some((d) => d.version === selectedVersion)) {
      setSelectedVersion(activeSignedDocs[0].version);
    } else if (!ownsScanDocs && signedScan?.version && selectedVersion !== signedScan.version) {
      setSelectedVersion(signedScan.version);
    }
  }, [ownsScanDocs, activeSignedDocs, selectedVersion, signedScan?.version]);

  // Zoom & Inspection States
  const [digitalZoom, setDigitalZoom] = useState(100);
  const [scanZoom, setScanZoom] = useState(100);
  const [isFullscreenScanOpen, setIsFullscreenScanOpen] = useState(false);
  const [modalZoom, setModalZoom] = useState(100);
  const [modalRotation, setModalRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const resetModalView = useCallback(() => {
    setModalZoom(100);
    setModalRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleModalZoomIn = useCallback(() => {
    setModalZoom((prev) => Math.min(400, prev + 25));
  }, []);

  const handleModalZoomOut = useCallback(() => {
    setModalZoom((prev) => Math.max(50, prev - 25));
  }, []);

  const handleModalRotate = useCallback(() => {
    setModalRotation((prev) => (prev + 90) % 360);
  }, []);

  // Mouse Drag to Pan
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch Drag to Pan
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      });
    }
  }, [pan]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse Wheel Zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 20 : -20;
    setModalZoom((prev) => Math.min(400, Math.max(50, prev + delta)));
  }, []);

  // Keyboard Shortcuts & Body Scroll Lock
  useBodyScrollLock(isFullscreenScanOpen);

  useEffect(() => {
    if (!isFullscreenScanOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsFullscreenScanOpen(false);
      } else if (e.key === "+" || e.key === "=") {
        handleModalZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        handleModalZoomOut();
      } else if (e.key === "0") {
        resetModalView();
      } else if (e.key === "r" || e.key === "R") {
        handleModalRotate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreenScanOpen, handleModalZoomIn, handleModalZoomOut, resetModalView, handleModalRotate]);

  // The selected scan descriptor. When the current contract owns its
  // signedDocuments[] history, pick the entry for the chosen version;
  // otherwise fall back to the canonical `signedScan` descriptor (single
  // version — possibly inherited from an ancestor lease).
  const selectedDoc =
    (ownsScanDocs &&
      (activeSignedDocs.find((d) => Number(d.version) === Number(selectedVersion)) ||
        activeSignedDocs[0])) ||
    (signedScan
      ? {
          version: signedScan.version,
          fileName: signedScan.fileName,
          mimeType: signedScan.mimeType,
          uploadedAt: signedScan.uploadedAt || null,
        }
      : null);
  const isPdf =
    selectedDoc?.mimeType === "application/pdf" ||
    selectedDoc?.fileName?.toLowerCase().endsWith(".pdf");

  // The canonical fetch identity — ALWAYS the contract that owns the scan
  // (may be an ancestor lease), NEVER blindly `contract.id`.
  const signedFetchContractId = scanContractId;
  const signedFetchVersion = ownsScanDocs ? selectedVersion : signedScan?.version;

  // Download the signed scan from the SAME canonical identity as Preview /
  // Open-in-tab. Prefer the injected route-aware fetcher; fall back to the
  // parent's onDownloadSigned (which resolves by the same version).
  const handleDownloadSignedScan = useCallback(async () => {
    const fileName =
      selectedDoc?.fileName ||
      signedScan?.fileName ||
      `Signed-Contract-v${signedFetchVersion || 1}.pdf`;
    if (fetchSignedDoc) {
      try {
        const blob = await fetchSignedDoc({
          contractId: signedFetchContractId,
          version: signedFetchVersion,
          download: true,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      } catch {
        // fall through to the parent handler
      }
    }
    if (onDownloadSigned) onDownloadSigned(signedFetchVersion, fileName);
  }, [
    fetchSignedDoc,
    onDownloadSigned,
    signedFetchContractId,
    signedFetchVersion,
    selectedDoc?.fileName,
    signedScan?.fileName,
  ]);

  // Fetch Signed Document Scan Blob — via the injected `fetchSignedDoc`
  // (admin vs tenant route), falling back to the tenant route for back-compat.
  useEffect(() => {
    if (!hasSignedDoc || !signedFetchContractId) {
      setSignedBlobUrl(null);
      return;
    }
    let active = true;
    setSignedBlobLoading(true);
    setSignedBlobError(null);

    const fetcher = fetchSignedDoc
      ? fetchSignedDoc({
          contractId: signedFetchContractId,
          version: signedFetchVersion,
          download: false,
        })
      : tenantContractApi.getMySignedContractFile(
          signedFetchContractId,
          signedFetchVersion,
          false,
        );

    Promise.resolve(fetcher)
      .then((blob) => {
        if (active) {
          const url = URL.createObjectURL(blob);
          setSignedBlobUrl(url);
        }
      })
      .catch((err) => {
        if (active) {
          setSignedBlobError(err?.message || "Could not load signed document preview.");
        }
      })
      .finally(() => {
        if (active) setSignedBlobLoading(false);
      });

    return () => {
      active = false;
    };
  }, [signedFetchContractId, signedFetchVersion, hasSignedDoc, fetchSignedDoc]);

  // Clean up Object URL
  useEffect(() => {
    return () => {
      if (signedBlobUrl) {
        URL.revokeObjectURL(signedBlobUrl);
      }
    };
  }, [signedBlobUrl]);

  // Single-Page 1:1 Legal (8.5in x 13in) PDF Exporter (Guaranteed Zero Cutoff)
  const handleInternalDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const legalPage = pdfLegalPageRef.current;
      if (!legalPage) {
        throw new Error("Contract PDF print template not mounted.");
      }

      // Dynamically load html2canvas and jsPDF on demand
      const [{ default: html2canvas }, jsPdfModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Capture single page at 2x Retina Resolution
      const canvas = await html2canvas(legalPage, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        onclone: (clonedDoc) => {
          const clonedWrapper = clonedDoc.getElementById("offscreen-legal-pdf-container");
          if (clonedWrapper) {
            clonedWrapper.style.position = "static";
            clonedWrapper.style.left = "0";
            clonedWrapper.style.top = "0";
            clonedWrapper.style.opacity = "1";
            clonedWrapper.style.display = "block";
            clonedWrapper.style.visibility = "visible";
          }
        },
      });

      // Create Philippine Legal standard document (8.5in x 13in = 215.9mm x 330.2mm)
      const DocClass = jsPdfModule.jsPDF || jsPdfModule.default || jsPdfModule;
      const pdf = new DocClass({
        orientation: "portrait",
        unit: "mm",
        format: [215.9, 330.2],
      });

      // 0.31-inch margin = 8 mm
      const marginMm = 8;
      const contentWidthMm = 215.9 - (marginMm * 2); // 199.9 mm
      const pHeightMm = (canvas.height * contentWidthMm) / canvas.width;

      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.98),
        "JPEG",
        marginMm,
        marginMm,
        contentWidthMm,
        Math.min(pHeightMm, 330.2 - (marginMm * 2)),
        undefined,
        "FAST"
      );

      const safeTenantFilename = String(tenantName || "")
        .normalize("NFKD")
        .replace(/[^\w.-]+/g, "-")
        .replace(/^[._-]+|[._-]+$/g, "")
        .trim();
      const refCode = contract?.contractNumber || stayData?.referenceNumber || "Official";
      const downloadFileName = safeTenantFilename
        ? `Contract-of-Lease-${refCode}-${safeTenantFilename}.pdf`
        : `Contract-of-Lease-${refCode}.pdf`;
      pdf.save(downloadFileName);
    } catch (err) {
      console.error("PDF generation failed:", err);
      if (onDownloadPdf) onDownloadPdf();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const safeTenantFilename = String(tenantName || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .trim();
  const refCode = contract?.contractNumber || stayData?.referenceNumber || "Official";
  const contractPdfDownloadName = safeTenantFilename
    ? `Contract-of-Lease-${refCode}-${safeTenantFilename}.pdf`
    : `Contract-of-Lease-${refCode}.pdf`;
  const contractPrintDocumentTitle = safeTenantFilename
    ? `Contract of Lease - ${tenantName} (${refCode})`
    : `Contract of Lease - ${refCode}`;

  // A real canonical PDF exists once the backend has either generated a
  // prepared draft or published a final document. The tenant-facing fetch
  // (toTenantContractView) always includes `tenantDocument.available` — the
  // resolver's own pre-computed answer, per contractPresentation's "never
  // re-derive this from other fields" rule — so prefer that when present.
  // The admin route (getTenantCurrentContract) returns the raw Contract
  // document instead (no tenantDocument field), where `finalDocument` is
  // either null or a real populated sub-document, so its own truthiness is
  // already the correct signal there.
  // A synthetic (Stay-derived) contract carries a human reference string as
  // `id`, not a Mongo ObjectId — /contracts/my/:id/documents/* 404s on it, so
  // there is no canonical PDF to print/download; the DOM preview is all we
  // have. Detect it explicitly so Print/Download never silently fall through
  // to window.print() (which would print the whole app page).
  const contractDocId = contract?.id || contract?._id;
  const hasRealContractId = /^[a-f\d]{24}$/i.test(String(contractDocId || ""));
  const isSyntheticContract = Boolean(contract?.isSynthetic) || (Boolean(contractDocId) && !hasRealContractId);

  const hasCanonicalPdf = Boolean(fetchDocumentPdf) && !isSyntheticContract && (
    contract?.tenantDocument
      ? Boolean(contract.tenantDocument.available)
      : Boolean(contract?.finalDocument || contract?.generatedStorageKey)
  );

  // Tear down the previous print iframe + blob URL (if any). Called before a
  // new print and on unmount — NOT on a short timer after print(), which is
  // what previously killed the preview while the user was still looking at it.
  const releasePrintResource = useCallback(() => {
    const res = printResourceRef.current;
    printResourceRef.current = null;
    if (!res) return;
    try { res.iframe?.remove(); } catch { /* already detached */ }
    try { if (res.url) URL.revokeObjectURL(res.url); } catch { /* already revoked */ }
  }, []);

  // Release the print resource only when the viewer/modal unmounts. The blob
  // URL + iframe stay alive for the entire lifetime of the open viewer so the
  // browser's print preview always has its source document.
  useEffect(() => releasePrintResource, [releasePrintResource]);

  // Print a PDF blob by loading it into a hidden iframe and invoking the
  // iframe's own print. Guards against:
  //  1. onload firing before the browser's built-in PDF viewer has finished
  //     initializing, so contentWindow.print() is a silent no-op — poll
  //     briefly for readiness, then retry.
  //  2. Some browsers (Firefox) throwing on contentWindow.print() for a
  //     PDF-viewer iframe — reject so the caller shows a visible error.
  //  3. R5.2 — the print preview losing its source: the iframe + blob URL are
  //     retained until the viewer unmounts (see releasePrintResource), never
  //     revoked on a post-print timer.
  const printBlobViaIframe = (blob) => new Promise((resolve, reject) => {
    if (!(blob instanceof Blob) || blob.size === 0) {
      reject(new Error("The contract PDF could not be loaded for printing."));
      return;
    }
    // Repeat print: drop the previous resource first so we never leak iframes.
    releasePrintResource();

    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.title = contractPrintDocumentTitle;
    printResourceRef.current = { iframe, url };

    let settled = false;
    let watchdog = null;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      // On reject, the resource is useless — release it now. On resolve, KEEP
      // it: the print preview still needs the document; it is released when
      // the viewer unmounts (or replaced on the next print).
      if (fn === reject) releasePrintResource();
      fn(arg);
    };

    const tryPrint = (attempt = 0) => {
      if (settled) return;
      const win = iframe.contentWindow;
      if (!win) {
        if (attempt < 20) { setTimeout(() => tryPrint(attempt + 1), 150); return; }
        finish(reject, new Error("The print dialog could not be opened."));
        return;
      }
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.title = contractPrintDocumentTitle;
        }
        win.focus();
        win.print();
        finish(resolve);
      } catch (err) {
        if (attempt < 20) { setTimeout(() => tryPrint(attempt + 1), 150); return; }
        finish(reject, err instanceof Error ? err : new Error("The print dialog could not be opened."));
      }
    };

    iframe.onload = () => {
      // Give the PDF viewer plugin a moment to attach before the first attempt.
      setTimeout(() => tryPrint(0), 250);
    };
    iframe.onerror = () => finish(reject, new Error("Failed to load the contract PDF for printing."));
    // Absolute safety net: never hang the button forever.
    watchdog = setTimeout(
      () => finish(reject, new Error("Timed out opening the print dialog. Please use Download instead.")),
      15000,
    );

    iframe.src = url;
    document.body.appendChild(iframe);
  });

  // A FINAL/wet-signed document has no faithful DOM equivalent — the DOM
  // "Digital Contract" is a live re-render of the original lease TERMS, not
  // the actual signed artifact, so falling back to it on fetch failure would
  // silently show what looks like a valid final contract when the real
  // signed file is actually missing/unreachable. Falling back is only safe
  // for the pre-signature draft stage, where the DOM view is a genuine
  // preview of the same document that would be generated.
  const isFinalDocument = Boolean(
    contract?.tenantDocument ? contract.tenantDocument.isFinal : contract?.finalDocument,
  );

  const friendlyDocumentError = (err) => {
    const code = err?.response?.data?.code;
    if (err?.response?.status === 410 || code === "FINAL_DOCUMENT_STORAGE_MISSING" || code === "CONTRACT_ARTIFACT_STORAGE_MISSING") {
      return "The saved contract file is unavailable. Please contact the branch admin to replace the signed copy.";
    }
    return "Unable to load the contract file right now. Please try again in a moment.";
  };

  const handlePrintClick = async () => {
    const originalTitle = document.title;
    setDocumentError(null);
    try {
      document.title = contractPrintDocumentTitle;
      // No canonical PDF (synthetic contract, or nothing generated yet): the
      // DOM preview IS the document — print it via the scoped @media print
      // stylesheet below. This is a genuine preview of the same terms, not a
      // rebuild of a signed artifact.
      if (!hasCanonicalPdf) {
        if (isSyntheticContract) {
          setDocumentError(
            "Your lease draft PDF is still being prepared. You can review the details on this page; printing will be available shortly.",
          );
          return;
        }
        try {
          window.print();
        } catch {
          setDocumentError("Your browser blocked the print dialog. Please try again or use Download.");
        }
        return;
      }
      setRealPdfBusy(true);
      try {
        const blob = await fetchDocumentPdf(contract);
        await printBlobViaIframe(blob);
      } catch (err) {
        console.error("Failed to print the canonical contract PDF.", err);
        // Always surface a visible error — never silently window.print() the
        // whole app page. For a draft we additionally offer the DOM fallback.
        if (isFinalDocument) {
          setDocumentError(friendlyDocumentError(err));
        } else {
          setDocumentError(
            (err?.message || "Couldn't open the print dialog for the contract PDF.") +
              " You can use Download instead, or try again.",
          );
        }
      } finally {
        setRealPdfBusy(false);
      }
    } finally {
      setTimeout(() => {
        document.title = originalTitle;
      }, 2000);
    }
  };

  const handleDownloadClick = async () => {
    setDocumentError(null);
    if (!hasCanonicalPdf) {
      // Synthetic / not-yet-generated: fall back to the DOM export (a
      // faithful preview of the same lease terms).
      await handleInternalDownloadPdf();
      return;
    }
    setRealPdfBusy(true);
    try {
      const blob = await fetchDocumentPdf(contract);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = contractPdfDownloadName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Failed to download the canonical contract PDF.", err);
      if (isFinalDocument) {
        setDocumentError(friendlyDocumentError(err));
      } else {
        // Draft: DOM export is an acceptable equivalent preview.
        await handleInternalDownloadPdf();
      }
    } finally {
      setRealPdfBusy(false);
    }
  };

  const isDownloadingAny = isDownloading || isGeneratingPdf || realPdfBusy;

  return (
    <div className="w-full space-y-3">
      {/* Print stylesheet for 1:1 Legal (8.5in x 13in). Sized to fit a short
          lease on ONE sheet, but content that genuinely overflows flows onto
          additional Legal pages — signature / notarial blocks are kept intact
          across the break (R5.5). */}
      <style>{`
        @media print {
          @page {
            size: 8.5in 13in;
            margin: 0.26in 0.35in;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          body * {
            visibility: hidden !important;
          }
          #digital-contract-paper, #digital-contract-paper * {
            visibility: visible !important;
            color: #000000 !important;
            box-sizing: border-box !important;
          }
          #digital-contract-paper {
            background: #ffffff !important;
            /* static (not absolute) so a long contract paginates instead of
               being clipped to the first sheet by some print engines */
            position: static !important;
            left: auto !important;
            top: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            transform: none !important;
            font-family: "Times New Roman", Times, "Liberation Serif", serif !important;
            font-size: 8.35pt !important;
            line-height: 1.18 !important;
          }
          /* Keep multi-line blocks from splitting awkwardly across a page break */
          #digital-contract-paper .print-sig-container,
          #digital-contract-paper .print-witness-container,
          #digital-contract-paper .print-ack-container,
          #digital-contract-paper .print-notary-stack,
          #digital-contract-paper .print-title-wrap {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          #digital-contract-paper * {
            font-family: "Times New Roman", Times, "Liberation Serif", serif !important;
            line-height: 1.18 !important;
          }
          #digital-contract-paper .print-header-notice {
            font-size: 7.5pt !important;
            margin: 0 0 5pt 0 !important;
            padding: 0 !important;
          }
          #digital-contract-paper .print-title-wrap {
            padding-bottom: 1pt !important;
            margin-bottom: 2.5pt !important;
            border-bottom: 0.5pt solid #000 !important;
          }
          #digital-contract-paper h1 {
            font-size: 12.5pt !important;
            margin: 0 !important;
            line-height: 1.15 !important;
          }
          #digital-contract-paper h2 {
            font-size: 9.5pt !important;
            margin: 1pt 0 0 0 !important;
            line-height: 1.15 !important;
          }
          #digital-contract-paper p {
            margin: 0 0 3.2pt 0 !important;
            padding: 0 !important;
            font-size: 8.35pt !important;
            line-height: 1.18 !important;
          }
          #digital-contract-paper div {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }
          /* Reset Tailwind space-y in print */
          #digital-contract-paper .space-y-1 > :not([hidden]) ~ :not([hidden]),
          #digital-contract-paper .space-y-2 > :not([hidden]) ~ :not([hidden]),
          #digital-contract-paper .space-y-3 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0 !important;
          }
          #digital-contract-paper .print-terms-title {
            margin: 3.5pt 0 2.5pt 0 !important;
            font-size: 8.75pt !important;
          }
          #digital-contract-paper .print-terms-body {
            font-size: 8.35pt !important;
            line-height: 1.18 !important;
          }
          #digital-contract-paper .print-terms-body p {
            margin: 0 0 3.2pt 0 !important;
            font-size: 8.35pt !important;
            line-height: 1.18 !important;
          }
          #digital-contract-paper .print-sig-container {
            padding-top: 6pt !important;
            padding-bottom: 0 !important;
          }
          #digital-contract-paper .print-sig-spacer {
            height: 0px !important;
            margin-top: 1.5pt !important;
            margin-bottom: 9pt !important;
          }
          #digital-contract-paper .print-lessee-spacer {
            height: 0px !important;
          }
          #digital-contract-paper .print-witness-container {
            padding-top: 6pt !important;
          }
          #digital-contract-paper .print-witness-lines {
            padding-top: 16pt !important;
            padding-bottom: 0 !important;
          }
          #digital-contract-paper .print-ack-container {
            padding-top: 8pt !important;
            font-size: 8.0pt !important;
            line-height: 1.18 !important;
          }
          #digital-contract-paper .print-ack-container p {
            margin: 0 0 3pt 0 !important;
            font-size: 8.0pt !important;
            line-height: 1.18 !important;
          }
          #digital-contract-paper .print-notary-stack {
            padding-top: 3pt !important;
            font-size: 8.0pt !important;
            line-height: 1.25 !important;
          }
          #digital-contract-paper .print-notary-stack div {
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {documentError && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs">
          <span className="flex-1">{documentError}</span>
          <button
            type="button"
            onClick={() => setDocumentError(null)}
            className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 font-bold cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Toolbar & Layout Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
            Digital Contract
          </span>
          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200/90 dark:border-slate-700">
            {stayData?.referenceNumber || contract?.contractNumber || "LIL-CONTRACT"}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden md:inline">
            • {isPrivate ? "Private Room Accommodation" : "Dormitory Accommodation"}
          </span>
        </div>

        {/* Layout Switcher (When Signed Doc is Present) */}
        {hasSignedDoc && (
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-lg gap-1 flex-shrink-0 shadow-xs">
            <button
              type="button"
              onClick={() => setLayoutMode("digital")}
              className={`px-3 py-1.5 rounded-md text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                layoutMode === "digital"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold shadow-xs border border-slate-200/90 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 border border-transparent font-semibold"
              }`}
            >
              <FileText className={`w-3.5 h-3.5 ${layoutMode === "digital" ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`} />
              <span>Initial Lease</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode("side-by-side")}
              className={`px-3 py-1.5 rounded-md text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                layoutMode === "side-by-side"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold shadow-xs border border-slate-200/90 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 border border-transparent font-semibold"
              }`}
              title="Side-by-side comparison"
            >
              <Columns2 className={`w-3.5 h-3.5 ${layoutMode === "side-by-side" ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`} />
              <span>Side-by-Side</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode("signed")}
              className={`px-3 py-1.5 rounded-md text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                layoutMode === "signed"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold shadow-xs border border-slate-200/90 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 border border-transparent font-semibold"
              }`}
            >
              <FileCheck className={`w-3.5 h-3.5 ${layoutMode === "signed" ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`} />
              <span>Signed Scan</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area - Strictly Equalized Grid */}
      <div
        className={
          layoutMode === "side-by-side" && hasSignedDoc
            ? "grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch"
            : "w-full flex justify-center"
        }
      >
        {/* PANEL 1: INITIAL DIGITAL CONTRACT OF LEASE (Equalized Structure) */}
        {(layoutMode === "side-by-side" || layoutMode === "digital" || !hasSignedDoc) && (
          <section
            aria-label="Initial Digital Contract"
            className={`w-full ${
              layoutMode === "digital" || !hasSignedDoc ? "max-w-4xl" : "max-w-full"
            } bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden flex flex-col h-[70vh] min-h-[380px] max-h-[800px] sm:h-[800px]`}
          >
            {/* Panel Header (Exact h-11 height alignment) */}
            <div className="h-11 flex-shrink-0 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Initial Agreement
                </h3>
              </div>

              {/* Action Buttons & Zoom Controls */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Zoom Controls */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDigitalZoom((prev) => Math.max(70, prev - 10))}
                    disabled={digitalZoom <= 70}
                    className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDigitalZoom(100)}
                    className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                    title="Reset Zoom"
                  >
                    {digitalZoom}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setDigitalZoom((prev) => Math.min(130, prev + 10))}
                    disabled={digitalZoom >= 130}
                    className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                </div>

                {/* Print Button */}
                <button
                  type="button"
                  disabled={isDownloadingAny}
                  onClick={handlePrintClick}
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                  title={hasCanonicalPdf
                    ? "Print the official Contract PDF (Legal 8.5in × 13in)"
                    : "Print Digital Agreement Preview (Legal 8.5in × 13in)"}
                >
                  {realPdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500 dark:text-slate-400" /> : <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />}
                  <span>Print</span>
                </button>

                {/* Download PDF Button */}
                <button
                  type="button"
                  disabled={isDownloadingAny}
                  onClick={handleDownloadClick}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                  title={hasCanonicalPdf
                    ? "Download the official Contract PDF (Legal 8.5in × 13in)"
                    : "Download Lease Contract PDF Preview (Legal 8.5in × 13in)"}
                >
                  {isDownloadingAny ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Scrollable Container (flex-1 fill height). Compact padding on
                narrow viewports so the document itself gets the width (R5.6). */}
            <div className="flex-1 min-h-0 px-3 py-4 sm:px-12 sm:py-10 overflow-y-auto overflow-x-auto bg-slate-100 dark:bg-slate-950 flex justify-center">
              <article
                id="digital-contract-paper"
                className="w-full max-w-[840px] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg p-6 sm:p-12 shadow-sm"
                style={{
                  fontFamily: '"Times New Roman", Times, "Liberation Serif", serif',
                  fontSize: `${(14 * digitalZoom) / 100}px`,
                  lineHeight: "1.55",
                }}
              >
                {/* Header Notice */}
                <p className="print-header-notice text-xs text-center font-semibold text-slate-500 dark:text-slate-400 tracking-wider uppercase mb-3">
                  PREPARED COPY — NOT YET SIGNED OR NOTARIZED
                </p>

                {/* Main Titles */}
                <div className="print-title-wrap text-center pb-2 mb-3 border-b border-slate-200 dark:border-slate-800">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-wide uppercase m-0 text-slate-900 dark:text-slate-100">
                    CONTRACT OF LEASE
                  </h1>
                  <h2 className="text-sm sm:text-base font-bold tracking-wider uppercase mt-1 text-slate-900 dark:text-slate-100">
                    <Populated>{roomLabel} — {termLabel} LEASE</Populated>
                  </h2>
                </div>

                <p className="font-bold uppercase tracking-wider text-xs sm:text-sm text-slate-900 dark:text-slate-100 mt-4 mb-2">
                  KNOWN TO ALL MEN BY THESE PRESENTS:
                </p>

                <p className="text-justify indent-8 text-slate-900 dark:text-slate-100 mb-2 leading-relaxed">
                  This <strong>CONTRACT OF LEASE</strong> is made and executed in the City of Makati, this{" "}
                  <Populated>{executionDay}</Populated> day of{" "}
                  <Populated>{executionMonth} {executionYear}</Populated>, by and between:
                </p>

                <p className="text-justify indent-8 text-slate-900 dark:text-slate-100 mb-2 leading-relaxed">
                  <strong>FIRST JRAC PARTNERSHIP CO.</strong>, a general partnership duly organized and existing under and by virtue of the laws of the Republic of the Philippines, with principal office at 9431 Magallanes St., Guadalupe Nuevo, Makati City, represented herein by its General Partner, <strong>JOANNE ONG</strong>, hereinafter referred to as the <strong>LESSOR</strong>;
                </p>

                <p className="text-center font-bold tracking-widest text-xs my-2.5 text-slate-900 dark:text-slate-100">
                  — and —
                </p>

                <p className="text-justify indent-8 text-slate-900 dark:text-slate-100 mb-2.5 leading-relaxed">
                  <Populated>{tenantName}</Populated>, of legal age, Filipino, with postal and residential address at{" "}
                  <Populated>{tenantAddress}</Populated>, hereinafter referred to as the <strong>LESSEE</strong>;
                </p>

                <p className="font-bold tracking-wide text-xs sm:text-sm mt-3 mb-2 text-slate-900 dark:text-slate-100">
                  WITNESSETH: That
                </p>

                <p className="text-justify indent-8 text-slate-900 dark:text-slate-100 mb-2 leading-relaxed">
                  <strong>WHEREAS</strong>, the LESSOR is the owner of a residential establishment known as{" "}
                  <Populated>{branchName}</Populated>, located at <Populated>{branchAddress}</Populated>;
                </p>

                <p className="text-justify indent-8 text-slate-900 dark:text-slate-100 mb-2 leading-relaxed">
                  <strong>WHEREAS</strong>, the LESSOR agrees to lease to the LESSEE a <Populated>{roomLabel}</Populated> accommodation known as Room{" "}
                  <Populated>{roomNumber}</Populated>
                  {!isPrivate && (
                    <>
                      , Bed/Slot No. <Populated>{bedSlot}</Populated>
                    </>
                  )}{" "}
                  (the “LEASED PREMISES”) within the said establishment, and the LESSEE is willing to lease the same for a limited time or period;
                </p>

                <p className="text-justify indent-8 text-slate-900 dark:text-slate-100 mb-3 leading-relaxed">
                  <strong>NOW THEREFORE</strong>, for and in consideration of the foregoing premises, the LESSOR leases unto the LESSEE and the LESSEE hereby accepts from the LESSOR the LEASED PREMISES, subject to the following:
                </p>

                <div className="print-terms-title text-center font-bold tracking-wider text-xs sm:text-sm uppercase my-3 text-slate-900 dark:text-slate-100">
                  TERMS AND CONDITIONS
                </div>

                <div className="print-terms-body text-justify text-[13.5px] sm:text-[14px] leading-relaxed text-slate-900 dark:text-slate-100 space-y-2">
                  <p className="indent-8 mb-2">
                    <strong>SECTION 1 – PURPOSE.</strong> The leased premises shall be used exclusively by the LESSEE for residential purposes only and shall not be diverted to other uses. It is hereby expressly agreed that if at any time the premises are used for other purposes, the LESSOR shall have the right to rescind this Contract, without prejudice to its other rights under the law.
                  </p>

                  <p className="indent-8 mb-2">
                    <strong>SECTION 2 – DURATION.</strong> The lease of the {leaseSpaceSubject} shall run for a period of{" "}
                    <Populated>{durationMonths} ( {durationInWords(durationMonths)} )</Populated> months, from{" "}
                    <Populated>{formattedStart}</Populated> to <Populated>{formattedEnd}</Populated>. Being a <Populated>{termLabel}</Populated> LEASE, the period shall be <Populated>{durationCondition}</Populated>
                  </p>

                  <p className="indent-8 mb-2">
                    <strong>SECTION 3 – RENTAL RATE.</strong> The regular and basic monthly rental fee is{" "}
                    <Populated>Php {formatMoney(regularRate)}</Populated> exclusive of any tax.{" "}
                    {discountPercent > 0 ? (
                      <>
                        The LESSOR, however, shall grant a promo rate or discount of{" "}
                        <Populated>{discountPercent} percent</Populated>, which brings the basic monthly rental fee to{" "}
                        <Populated>Php {formatMoney(monthlyRent)}</Populated> exclusive of any tax and net of discount.
                      </>
                    ) : (
                      <>
                        The basic monthly rental fee is <Populated>Php {formatMoney(monthlyRent)}</Populated> exclusive of any tax.
                      </>
                    )}
                  </p>

                  <p className="indent-8 mb-2">
                    {amenitiesParagraph}
                  </p>

                  <p className="indent-8 mb-2">
                    The electricity consumption of the LESSEE, which is not part of the rental fee, shall be billed on a monthly basis.
                  </p>

                  <p className="indent-8 mb-2">
                    All payments shall be paid directly to the LESSOR through bank deposit or transfer, supported by an official acknowledgment receipt and/or service invoice.
                  </p>

                  <p className="indent-8 mb-2">
                    Delay in the payment of the rental fee or electricity consumption for three (3) consecutive months shall be ground for the LESSOR to terminate this Contract of Lease. In such case, the LESSEE shall voluntarily vacate the leased premises, surrender the key to the LESSOR, and shall no longer be allowed to access the leased premises except to retrieve his or her personal belongings.
                  </p>

                  <p className="indent-8 mb-2">
                    <strong>SECTION 4 – DEPOSITS AND ADVANCES.</strong> Prior to moving in, the LESSEE shall pay one (1) month advance rent in the amount of{" "}
                    <Populated>Php {formatMoney(advanceRent)}</Populated>, covering the period of <Populated>{advanceStart}</Populated> to <Populated>{advanceEnd}</Populated>, and one (1) month security deposit in the amount of{" "}
                    <Populated>Php {formatMoney(securityDeposit)}</Populated>.
                  </p>

                  <p className="indent-8 mb-2">
                    The reservation fee of <Populated>Php 2,000.00</Populated> paid by the LESSEE shall be credited as partial payment for the said amounts. The LESSOR agrees to refund the deposit not later than thirty (30) days after the termination of this Contract, less payment, if any, for unpaid bills of electricity or other utility charges, failure to return the key (<Populated>Php 1,000.00</Populated>), and the cost of damages to the leased premises occasioned by the LESSEE’s fault or negligence. This deposit, which shall be non-interest bearing, cannot be applied by the LESSEE to any unpaid rent or to the last month’s rental, and shall be kept intact throughout the life of this Contract.
                  </p>

                  <p className="indent-8 mb-2">
                    Furthermore, if the LESSEE vacates the premises before the expiration of the period of lease, the full amount of the security deposit shall be forfeited in favor of the LESSOR.
                  </p>

                  <p className="indent-8 mb-2">
                    <strong>SECTION 5 – FORCE MAJEURE.</strong> If the whole or any part of the leased premises shall be destroyed or damaged by fire, flood, lightning, typhoon, earthquake, storm, riot, or any other unforeseen disabling cause or act of God, as to render the leased premises during the term substantially unfit for the use and occupation of the LESSEE, then this Contract may be terminated without compensation by either the LESSOR or the LESSEE by notice in writing to the other party.
                  </p>

                  <p className="indent-8 mb-2">
                    <strong>SECTION 6 – LESSOR’S RIGHT OF ENTRY.</strong> The LESSOR or its authorized representative shall, after giving due notice to the LESSEE, have the right to enter the premises in the presence of the LESSEE or his or her representative at any reasonable hour to examine the same, make repairs therein, undertake the operation and maintenance of the building, exhibit the leased premises to prospective lessees, or for any other lawful purpose which it may deem necessary.
                  </p>

                  <p className="indent-8 mb-2">
                    <strong>SECTION 7 – EXPIRATION OF LEASE.</strong> At the expiration of the term of this lease or the cancellation thereof, as herein provided, the LESSEE shall promptly deliver to the LESSOR the leased premises with all corresponding keys, in as good and tenantable condition as the same is now, ordinary wear and tear excepted, devoid of all occupants, movable furniture, articles, and effects of any kind.
                  </p>
                </div>

                <p className="text-justify indent-8 pt-3 text-slate-900 dark:text-slate-100 text-[13.5px] sm:text-[14px] mb-2 leading-relaxed">
                  <strong>IN WITNESS WHEREOF</strong>, both parties herein have affixed their signatures on the date and place first above written.
                </p>

                {/* Signatures Grid */}
                <div className="print-sig-container pt-6 pb-2 text-center text-xs sm:text-sm">
                  <div className="grid grid-cols-2 gap-8 sm:gap-14 items-end">
                    {/* LESSEE Column */}
                    <div className="flex flex-col">
                      <div className="print-lessee-spacer border-b border-slate-400 dark:border-slate-600 w-full h-10"></div>
                      <div className="text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-bold uppercase tracking-wider mt-2">
                        LESSEE
                      </div>
                    </div>

                    {/* LESSOR Column */}
                    <div className="flex flex-col">
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">FIRST JRAC PARTNERSHIP CO.</div>
                      <div className="print-sig-spacer text-xs italic text-slate-600 dark:text-slate-400 mt-1 mb-5">By:</div>
                      <div className="border-b border-slate-400 dark:border-slate-600 w-full h-0"></div>
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base mt-2">
                        JOANNE ONG
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 text-xs font-medium mt-1">
                        General Partner – LESSOR
                      </div>
                    </div>
                  </div>

                  {/* Witnesses */}
                  <div className="print-witness-container pt-6 text-left text-xs sm:text-sm">
                    <div className="font-bold tracking-wide text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                      SIGNED IN THE PRESENCE OF:
                    </div>
                    <div className="print-witness-lines grid grid-cols-2 gap-8 sm:gap-14 pt-8 pb-2">
                      <div className="border-b border-slate-400 dark:border-slate-600 w-full h-0"></div>
                      <div className="border-b border-slate-400 dark:border-slate-600 w-full h-0"></div>
                    </div>
                  </div>
                </div>

                {/* Notarial Acknowledgment */}
                <div className="print-ack-container pt-6 space-y-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-relaxed">
                  <div className="text-center font-bold tracking-wider uppercase text-xs sm:text-sm text-slate-900 dark:text-slate-100 mb-2">
                    ACKNOWLEDGMENT
                  </div>
                  <p className="leading-normal mb-2">
                    REPUBLIC OF THE PHILIPPINES )<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;) S.S.
                  </p>
                  <p className="text-justify indent-8 mb-2">
                    BEFORE ME, this _____ day of ____________________, personally appeared the above-named parties, all known to me and to known to be the same persons who executed the foregoing instrument, and who acknowledged to me that the same is their free and voluntary act and deed.
                  </p>
                  <p className="text-justify indent-8 mb-2">
                    This instrument, consisting of _____ ( ____ ) page/s, including the page on which this acknowledgment is written, has been signed on each and every page thereof by the concerned parties and their witnesses, and sealed with my notarial seal.
                  </p>
                  <p className="indent-8 mb-2">
                    WITNESS MY HAND AND SEAL, on the date and place first above written.
                  </p>

                  <div className="print-notary-stack pt-2 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <div>Doc. No. _______;</div>
                    <div>Page No. _______;</div>
                    <div>Book No. _______;</div>
                    <div>Series of _______.</div>
                  </div>
                </div>
              </article>
            </div>

            {/* Panel Footer */}
            <div className="h-10 flex-shrink-0 px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">Official Digital Agreement</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 truncate">
                  Ref: {stayData?.referenceNumber || contract?.contractNumber || "Official"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-shrink-0">
                <span>Philippine Legal</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span>8.5&quot; × 13&quot;</span>
              </div>
            </div>
          </section>
        )}

        {/* PANEL 2: WET-SIGNED CONTRACT SCAN & AMENDMENTS (Equalized Structure) */}
        {(layoutMode === "side-by-side" || layoutMode === "signed") && hasSignedDoc && (
          <section
            aria-label="Wet-Signed Contract Scan"
            className={`w-full ${
              layoutMode === "signed" ? "max-w-4xl" : "max-w-full"
            } bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden flex flex-col h-[70vh] min-h-[380px] max-h-[800px] sm:h-[800px]`}
          >
            {/* Panel Header (Exact h-11 height alignment) */}
            <div className="h-11 flex-shrink-0 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <FileCheck className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Signed Scan Copy
                </h3>
                {ownsScanDocs && activeSignedDocs.length > 1 && (
                  <div className="flex items-center gap-1 ml-1">
                    {activeSignedDocs.map((doc) => (
                      <button
                        key={doc.version}
                        type="button"
                        onClick={() => setSelectedVersion(doc.version)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                          Number(selectedVersion) === Number(doc.version)
                            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        }`}
                      >
                        v{doc.version}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Scan Zoom & Action Controls */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {!isPdf && (
                  <>
                    <button
                      type="button"
                      onClick={() => setScanZoom((prev) => Math.max(50, prev - 15))}
                      disabled={scanZoom <= 50}
                      className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
                      title="Zoom Out Scan"
                    >
                      <ZoomOut className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanZoom(100)}
                      className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                      title="Reset Zoom"
                    >
                      {scanZoom}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanZoom((prev) => Math.min(250, prev + 15))}
                      disabled={scanZoom >= 250}
                      className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-40 cursor-pointer"
                      title="Zoom In Scan"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalZoom(100);
                        setIsFullscreenScanOpen(true);
                      }}
                      className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      title="Full Screen Zoom & Inspect"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                {(onDownloadSigned || fetchSignedDoc) && (
                  <button
                    type="button"
                    onClick={handleDownloadSignedScan}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors flex items-center gap-1 shadow-xs cursor-pointer ml-0.5"
                    title="Download Scanned File"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                )}
              </div>
            </div>

            {/* Inherited-scan notice — the current contract is a Room Transfer
                Addendum with no scan of its own; this scan belongs to the
                original lease. Do NOT imply the Addendum itself was signed. */}
            {signedScan?.inherited && (
              <div className="flex-shrink-0 px-3.5 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  Signed copy from original lease
                  {signedScan.inheritedFromContractNumber
                    ? ` — ${signedScan.inheritedFromContractNumber}`
                    : ""}
                  . This Room Transfer Addendum is acknowledged, not wet-signed.
                </span>
              </div>
            )}

            {/* Scan Preview Canvas (flex-1 fill height) */}
            <div className="flex-1 min-h-0 p-3.5 overflow-auto bg-slate-100/70 dark:bg-slate-950/40 flex items-center justify-center">
              {signedBlobLoading ? (
                <div className="flex flex-col items-center justify-center p-8 text-slate-500 gap-1.5">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-700 dark:text-slate-300" />
                  <p className="text-xs font-semibold">Loading signed scan...</p>
                </div>
              ) : signedBlobError ? (
                <div className="text-center p-6 text-red-600 dark:text-red-400 space-y-1">
                  <p className="text-xs font-bold">Failed to load signed scan.</p>
                  <p className="text-[11px] text-slate-500">{signedBlobError}</p>
                </div>
              ) : signedBlobUrl ? (
                isPdf ? (
                  <iframe
                    src={signedBlobUrl}
                    title="Signed Contract PDF"
                    className="w-full h-full rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs bg-white"
                  />
                ) : (
                  <div className="relative group max-h-full flex items-center justify-center">
                    <img
                      src={signedBlobUrl}
                      alt={selectedDoc?.fileName || "Wet-signed contract scan copy"}
                      className="max-h-[620px] w-auto max-w-full rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs object-contain bg-white cursor-zoom-in hover:brightness-95 transition-all"
                      style={{
                        transform: `scale(${scanZoom / 100})`,
                        transformOrigin: "center center",
                        transition: "transform 150ms ease-out",
                      }}
                      onClick={() => {
                        resetModalView();
                        setIsFullscreenScanOpen(true);
                      }}
                      title="Click to open Fullscreen Inspection Lightbox"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        resetModalView();
                        setIsFullscreenScanOpen(true);
                      }}
                      className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-slate-900/85 hover:bg-slate-900 text-white text-xs font-semibold backdrop-blur-sm border border-white/10 shadow-lg flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-white" />
                      <span>Inspect Fullscreen</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="text-center p-6 text-slate-500">
                  <p className="text-xs font-medium">No signed copy available to preview.</p>
                </div>
              )}
            </div>

            {/* Panel Footer */}
            <div className="h-10 flex-shrink-0 px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span
                  className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[180px] sm:max-w-xs cursor-default"
                  title={selectedDoc?.fileName || "Signed Copy"}
                >
                  {selectedDoc?.fileName || "Signed Copy"}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex-shrink-0">
                  v{selectedDoc?.version || 1}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-shrink-0">
                  {dayjs(selectedDoc?.uploadedAt).format("MMM D, YYYY")}
                </span>
              </div>
              {selectedDoc?.replacementReason && (
                <div
                  className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 max-w-[200px] sm:max-w-xs truncate flex-shrink-0 cursor-default"
                  title={`Upload Note: ${selectedDoc.replacementReason}`}
                >
                  <span className="italic truncate">&ldquo;{selectedDoc.replacementReason}&rdquo;</span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* DEDICATED OFFSCREEN 1-PAGE LEGAL (8.5in x 13in) PRINT TEMPLATE */}
      <div
        id="offscreen-legal-pdf-container"
        style={{
          position: "fixed",
          left: "-99999px",
          top: "-99999px",
          width: "780px",
          zIndex: -9999,
          opacity: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <div
          ref={pdfLegalPageRef}
          style={{
            width: "780px",
            boxSizing: "border-box",
            backgroundColor: "#ffffff",
            color: "#000000",
            fontFamily: '"Times New Roman", Times, "Liberation Serif", serif',
            fontSize: "9.0px",
            lineHeight: "1.18",
            padding: "16px 24px",
          }}
        >
          {/* Header Notice */}
          <p style={{ fontSize: "7.5px", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px 0", color: "#333333" }}>
            PREPARED COPY — NOT YET SIGNED OR NOTARIZED
          </p>

          <div style={{ textAlign: "center", paddingBottom: "1px", marginBottom: "3px" }}>
            <h1 style={{ fontSize: "12px", fontWeight: "bold", letterSpacing: "0.5px", textTransform: "uppercase", margin: "0", color: "#000000" }}>
              CONTRACT OF LEASE
            </h1>
            <h2 style={{ fontSize: "9.5px", fontWeight: "bold", letterSpacing: "0.5px", textTransform: "uppercase", margin: "1px 0 0 0", color: "#000000" }}>
              <Populated>{roomLabel} — {termLabel} LEASE</Populated>
            </h2>
          </div>

          <p style={{ fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px", fontSize: "8.8px", margin: "3px 0 1.5px 0", color: "#000000" }}>
            KNOWN TO ALL MEN BY THESE PRESENTS:
          </p>

          <p style={{ textAlign: "justify", textIndent: "18px", margin: "0 0 1.5px 0", color: "#000000" }}>
            This <strong>CONTRACT OF LEASE</strong> is made and executed in the City of Makati, this{" "}
            <Populated>{executionDay}</Populated> day of{" "}
            <Populated>{executionMonth} {executionYear}</Populated>, by and between:
          </p>

          <p style={{ textAlign: "justify", textIndent: "18px", margin: "0 0 1.5px 0", color: "#000000" }}>
            <strong>FIRST JRAC PARTNERSHIP CO.</strong>, a general partnership duly organized and existing under and by virtue of the laws of the Republic of the Philippines, with principal office at 9431 Magallanes St., Guadalupe Nuevo, Makati City, represented herein by its General Partner, <strong>JOANNE ONG</strong>, hereinafter referred to as the <strong>LESSOR</strong>;
          </p>

          <p style={{ textAlign: "center", fontWeight: "bold", letterSpacing: "2px", fontSize: "8.5px", margin: "1.5px 0", color: "#000000" }}>
            — and —
          </p>

          <p style={{ textAlign: "justify", textIndent: "18px", margin: "0 0 1.5px 0", color: "#000000" }}>
            <Populated>{tenantName}</Populated>, of legal age, Filipino, with postal and residential address at{" "}
            <Populated>{tenantAddress}</Populated>, hereinafter referred to as the <strong>LESSEE</strong>;
          </p>

          <p style={{ fontWeight: "bold", letterSpacing: "0.5px", fontSize: "8.8px", margin: "2.5px 0 1.5px 0", color: "#000000" }}>
            WITNESSETH: That
          </p>

          <p style={{ textAlign: "justify", textIndent: "18px", margin: "0 0 1.5px 0", color: "#000000" }}>
            <strong>WHEREAS</strong>, the LESSOR is the owner of a residential establishment known as{" "}
            <Populated>{branchName}</Populated>, located at <Populated>{branchAddress}</Populated>;
          </p>

          <p style={{ textAlign: "justify", textIndent: "18px", margin: "0 0 1.5px 0", color: "#000000" }}>
            <strong>WHEREAS</strong>, the LESSOR agrees to lease to the LESSEE a <Populated>{roomLabel}</Populated> accommodation known as Room{" "}
            <Populated>{roomNumber}</Populated>
            {!isPrivate && (
              <>
                , Bed/Slot No. <Populated>{bedSlot}</Populated>
              </>
            )}{" "}
            (the “LEASED PREMISES”) within the said establishment, and the LESSEE is willing to lease the same for a limited time or period;
          </p>

          <p style={{ textAlign: "justify", textIndent: "18px", margin: "0 0 2px 0", color: "#000000" }}>
            <strong>NOW THEREFORE</strong>, for and in consideration of the foregoing premises, the LESSOR leases unto the LESSEE and the LESSEE hereby accepts from the LESSOR the LEASED PREMISES, subject to the following:
          </p>

          <div style={{ textAlign: "center", fontWeight: "bold", letterSpacing: "0.5px", textTransform: "uppercase", fontSize: "8.8px", margin: "2.5px 0 1.5px 0", color: "#000000" }}>
            TERMS AND CONDITIONS
          </div>

          <div style={{ textAlign: "justify", fontSize: "8.5px", lineHeight: "1.12", color: "#000000" }}>
            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              <strong>SECTION 1 – PURPOSE.</strong> The leased premises shall be used exclusively by the LESSEE for residential purposes only and shall not be diverted to other uses. It is hereby expressly agreed that if at any time the premises are used for other purposes, the LESSOR shall have the right to rescind this Contract, without prejudice to its other rights under the law.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              <strong>SECTION 2 – DURATION.</strong> The lease of the {leaseSpaceSubject} shall run for a period of{" "}
              <Populated>{durationMonths} ( {durationInWords(durationMonths)} )</Populated> months, from{" "}
              <Populated>{formattedStart}</Populated> to <Populated>{formattedEnd}</Populated>. Being a <Populated>{termLabel}</Populated> LEASE, the period shall be <Populated>{durationCondition}</Populated>
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              <strong>SECTION 3 – RENTAL RATE.</strong> The regular and basic monthly rental fee is{" "}
              <Populated>Php {formatMoney(regularRate)}</Populated> exclusive of any tax.{" "}
              {discountPercent > 0 ? (
                <>
                  The LESSOR, however, shall grant a promo rate or discount of{" "}
                  <Populated>{discountPercent} percent</Populated>, which brings the basic monthly rental fee to{" "}
                  <Populated>Php {formatMoney(monthlyRent)}</Populated> exclusive of any tax and net of discount.
                </>
              ) : (
                <>
                  The basic monthly rental fee is <Populated>Php {formatMoney(monthlyRent)}</Populated> exclusive of any tax.
                </>
              )}
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              {amenitiesParagraph}
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              The electricity consumption of the LESSEE, which is not part of the rental fee, shall be billed on a monthly basis.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              All payments shall be paid directly to the LESSOR through bank deposit or transfer, supported by an official acknowledgment receipt and/or service invoice.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              Delay in the payment of the rental fee or electricity consumption for three (3) consecutive months shall be ground for the LESSOR to terminate this Contract of Lease. In such case, the LESSEE shall voluntarily vacate the leased premises, surrender the key to the LESSOR, and shall no longer be allowed to access the leased premises except to retrieve his or her personal belongings.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              <strong>SECTION 4 – DEPOSITS AND ADVANCES.</strong> Prior to moving in, the LESSEE shall pay one (1) month advance rent in the amount of{" "}
              <Populated>Php {formatMoney(advanceRent)}</Populated>, covering the period of <Populated>{advanceStart}</Populated> to <Populated>{advanceEnd}</Populated>, and one (1) month security deposit in the amount of{" "}
              <Populated>Php {formatMoney(securityDeposit)}</Populated>.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              The reservation fee of <Populated>Php 2,000.00</Populated> paid by the LESSEE shall be credited as partial payment for the said amounts. The LESSOR agrees to refund the deposit not later than thirty (30) days after the termination of this Contract, less payment, if any, for unpaid bills of electricity or other utility charges, failure to return the key (<Populated>Php 1,000.00</Populated>), and the cost of damages to the leased premises occasioned by the LESSEE’s fault or negligence. This deposit, which shall be non-interest bearing, cannot be applied by the LESSEE to any unpaid rent or to the last month’s rental, and shall be kept intact throughout the life of this Contract.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              Furthermore, if the LESSEE vacates the premises before the expiration of the period of lease, the full amount of the security deposit shall be forfeited in favor of the LESSOR.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              <strong>SECTION 5 – FORCE MAJEURE.</strong> If the whole or any part of the leased premises shall be destroyed or damaged by fire, flood, lightning, typhoon, earthquake, storm, riot, or any other unforeseen disabling cause or act of God, as to render the leased premises during the term substantially unfit for the use and occupation of the LESSEE, then this Contract may be terminated without compensation by either the LESSOR or the LESSEE by notice in writing to the other party.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              <strong>SECTION 6 – LESSOR’S RIGHT OF ENTRY.</strong> The LESSOR or its authorized representative shall, after giving due notice to the LESSEE, have the right to enter the premises in the presence of the LESSEE or his or her representative at any reasonable hour to examine the same, make repairs therein, undertake the operation and maintenance of the building, exhibit the leased premises to prospective lessees, or for any other lawful purpose which it may deem necessary.
            </p>

            <p style={{ textIndent: "18px", margin: "0 0 1.5px 0" }}>
              <strong>SECTION 7 – EXPIRATION OF LEASE.</strong> At the expiration of the term of this lease or the cancellation thereof, as herein provided, the LESSEE shall promptly deliver to the LESSOR the leased premises with all corresponding keys, in as good and tenantable condition as the same is now, ordinary wear and tear excepted, devoid of all occupants, movable furniture, articles, and effects of any kind.
            </p>
          </div>

          <p style={{ textAlign: "justify", textIndent: "18px", paddingTop: "2.5px", margin: "0 0 3px 0", fontSize: "8.8px", color: "#000000" }}>
            <strong>IN WITNESS WHEREOF</strong>, both parties herein have affixed their signatures on the date and place first above written.
          </p>

          {/* Signatures Grid */}
          <div style={{ paddingTop: "4px", paddingBottom: "1px", textAlign: "center", fontSize: "8.8px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "flex-end" }}>
              {/* LESSEE Column */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ borderBottom: "0.8px solid #000000", width: "100%", height: "0px" }}></div>
                <div style={{ color: "#000000", fontSize: "8.5px", fontWeight: "bold", textTransform: "uppercase", marginTop: "1.5px" }}>LESSEE</div>
              </div>

              {/* LESSOR Column */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: "bold", color: "#000000", fontSize: "8.5px" }}>FIRST JRAC PARTNERSHIP CO.</div>
                <div style={{ fontSize: "8px", fontStyle: "italic", color: "#000000", marginTop: "1px", marginBottom: "8px" }}>By:</div>
                <div style={{ borderBottom: "0.8px solid #000000", width: "100%", height: "0px" }}></div>
                <div style={{ fontWeight: "bold", color: "#000000", marginTop: "1.5px", fontSize: "8.5px" }}>JOANNE ONG</div>
                <div style={{ color: "#000000", fontSize: "8px", marginTop: "0.5px" }}>General Partner – LESSOR</div>
              </div>
            </div>

            <div style={{ paddingTop: "4px", textAlign: "left", fontSize: "8.5px" }}>
              <div style={{ fontWeight: "bold" }}>SIGNED IN THE PRESENCE OF:</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", paddingTop: "11px" }}>
                <div style={{ borderBottom: "0.8px solid #000000", width: "100%", height: "0px" }}></div>
                <div style={{ borderBottom: "0.8px solid #000000", width: "100%", height: "0px" }}></div>
              </div>
            </div>
          </div>

          {/* Notarial Acknowledgment */}
          <div style={{ paddingTop: "4px", marginTop: "1px", fontSize: "8.25px", lineHeight: "1.12" }}>
            <div style={{ textAlign: "center", fontWeight: "bold", letterSpacing: "0.5px", textTransform: "uppercase", fontSize: "8.25px", margin: "0 0 2px 0" }}>
              ACKNOWLEDGMENT
            </div>
            <p style={{ margin: "0 0 1.5px 0" }}>
              REPUBLIC OF THE PHILIPPINES )<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;) S.S.
            </p>
            <p style={{ textAlign: "justify", textIndent: "16px", margin: "0 0 1.5px 0" }}>
              BEFORE ME, this _____ day of ____________________, personally appeared the above-named parties, all known to me and to known to be the same persons who executed the foregoing instrument, and who acknowledged to me that the same is their free and voluntary act and deed.
            </p>
            <p style={{ textAlign: "justify", textIndent: "16px", margin: "0 0 1.5px 0" }}>
              This instrument, consisting of _____ ( ____ ) page/s, including the page on which this acknowledgment is written, has been signed on each and every page thereof by the concerned parties and their witnesses, and sealed with my notarial seal.
            </p>
            <p style={{ textIndent: "16px", margin: "0 0 1.5px 0" }}>
              WITNESS MY HAND AND SEAL, on the date and place first above written.
            </p>

            <div style={{ paddingTop: "1px", fontSize: "7.75px", color: "#000000", lineHeight: "1.15" }}>
              <div>Doc. No. _______;</div>
              <div>Page No. _______;</div>
              <div>Book No. _______;</div>
              <div>Series of _______.</div>
            </div>
          </div>
        </div>
      </div>

      {/* FULLSCREEN INTERACTIVE IMAGE ZOOM LIGHTBOX (Mounted to document.body via Portal) */}
      {isFullscreenScanOpen && signedBlobUrl && !isPdf && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-[#090d16]/98 backdrop-blur-2xl flex flex-col select-none overflow-hidden animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="High-Resolution Signed Contract Inspection Lightbox"
        >
          {/* Lightbox Header */}
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-slate-900/95 border-b border-white/10 text-white z-10 shadow-lg">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileCheck className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-[220px] sm:max-w-md">
                    {selectedDoc?.fileName || "Signed Contract Scan"}
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    v{selectedDoc?.version || 1}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 hidden sm:block truncate">
                  Inspect high-resolution signatures, initials, and notarization
                </p>
              </div>
            </div>

            {/* Control Toolbar */}
            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
              {/* Zoom Out */}
              <button
                type="button"
                onClick={handleModalZoomOut}
                disabled={modalZoom <= 50}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 cursor-pointer"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              {/* Zoom Level Indicator (click to reset) */}
              <button
                type="button"
                onClick={resetModalView}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold transition-colors cursor-pointer"
                title="Click to Reset Zoom (0)"
              >
                {modalZoom}%
              </button>

              {/* Zoom In */}
              <button
                type="button"
                onClick={handleModalZoomIn}
                disabled={modalZoom >= 400}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 cursor-pointer"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {/* Rotate */}
              <button
                type="button"
                onClick={handleModalRotate}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Rotate 90° (R)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Reset Pan & Zoom */}
              <button
                type="button"
                onClick={resetModalView}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer hidden sm:inline-flex"
                title="Reset View (0)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Download Button */}
              {(onDownloadSigned || fetchSignedDoc) && (
                <button
                  type="button"
                  onClick={handleDownloadSignedScan}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm ml-1"
                  title="Download Scanned Document"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </button>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsFullscreenScanOpen(false)}
                className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors cursor-pointer ml-1"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Canvas / Drag & Pan Stage */}
          <div
            className={`flex-1 relative overflow-hidden flex items-center justify-center ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            <img
              src={signedBlobUrl}
              alt={selectedDoc?.fileName || "Signed Contract Fullscreen View"}
              draggable={false}
              onDoubleClick={() => setModalZoom((prev) => (prev === 100 ? 175 : 100))}
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-md shadow-2xl transition-transform ease-out select-none bg-white"
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${modalZoom / 100}) rotate(${modalRotation}deg)`,
                transformOrigin: "center center",
                transitionDuration: isDragging ? "0ms" : "150ms",
              }}
            />

            {/* Floating Bottom Help Badge */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md border border-white/10 text-white/70 text-[11px] font-medium pointer-events-none shadow-lg flex items-center gap-2">
              <span>Drag to Pan</span>
              <span className="text-white/30">•</span>
              <span>Scroll / +/- to Zoom</span>
              <span className="text-white/30">•</span>
              <span>Double-click to toggle</span>
              <span className="text-white/30">•</span>
              <span>ESC to Close</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
