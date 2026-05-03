import {
 X,
 Users,
 MapPin,
 FileText,
 DollarSign,
 History,
 AlertTriangle,
 CheckCircle,
 Shield,
 Download,
 RefreshCw,
 ArrowRightLeft,
 LogOut,
} from "lucide-react";
import { showNotification } from "../../../shared/utils/notification";
import useEscapeClose from "../../../shared/hooks/useEscapeClose";

const formatDate = (d) => {
 if (!d || d === "-") return "N/A";
 const date = new Date(d);
 return Number.isNaN(date.getTime()) ? "N/A" : date.toISOString().split("T")[0];
};

const formatMoney = (amount) => {
 if (!amount && amount !== 0) return "N/A";
 return `₱${Number(amount).toLocaleString()}`;
};

const getInitials = (name) => {
 if (!name) return "--";
 const parts = name.split(/\s+/).filter(Boolean);
 if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
 return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
};

const getContractStatusConfig = (status) => {
 switch (status) {
 case "active":
 return {
 color: "text-success dark:text-success-dark",
 dot: "bg-success dark:bg-success-dark",
 label: "Active",
 };
 case "ending-soon":
 return {
 color: "text-warning dark:text-warning-dark",
 dot: "bg-warning dark:bg-warning-dark",
 label: "Ending Soon",
 };
 case "expired":
 return {
 color: "text-error dark:text-error-dark",
 dot: "bg-error dark:bg-error-dark",
 label: "Expired",
 };
 default:
 return {
 color: "text-neutral dark:text-neutral-dark",
 dot: "bg-neutral dark:bg-neutral-dark",
 label: status || "Unknown",
 };
 }
};

const getPaymentStatusConfig = (status) => {
 switch (status) {
 case "paid":
 return {
 color: "text-success dark:text-success-dark",
 dot: "bg-success dark:bg-success-dark",
 label: "Paid",
 };
 case "partial":
 return {
 color: "text-warning dark:text-warning-dark",
 dot: "bg-warning dark:bg-warning-dark",
 label: "Partial",
 };
 case "overdue":
 return {
 color: "text-error dark:text-error-dark",
 dot: "bg-error dark:bg-error-dark",
 label: "Overdue",
 };
 default:
 return {
 color: "text-neutral dark:text-neutral-dark",
 dot: "bg-neutral dark:bg-neutral-dark",
 label: status || "Unknown",
 };
 }
};

const getOccupancyStatusConfig = (status) => {
 switch (status) {
 case "active":
 return {
 color: "text-success dark:text-success-dark",
 dot: "bg-success dark:bg-success-dark",
 label: "Active",
 };
 case "inactive":
 return {
 color: "text-neutral dark:text-neutral-dark",
 dot: "bg-neutral dark:bg-neutral-dark",
 label: "Inactive",
 };
 default:
 return {
 color: "text-neutral dark:text-neutral-dark",
 dot: "bg-neutral dark:bg-neutral-dark",
 label: status || "Unknown",
 };
 }
};

const getNextActionLabel = (action) => {
 switch (action) {
 case "renew":
 return "Renew";
 case "follow-up":
 return "Follow-up";
 case "none":
 return "No action needed";
 default:
 return action || "No action needed";
 }
};

const getPaymentStatusLabel = (record) => {
 switch (record.status) {
 case "completed":
 return {
 color: "text-success dark:text-success-dark",
 bg: "bg-success-light dark:bg-success-light",
 label: "Completed",
 };
 case "pending":
 return {
 color: "text-warning dark:text-warning-dark",
 bg: "bg-warning-light dark:bg-warning-light",
 label: "Pending",
 };
 case "failed":
 return {
 color: "text-error dark:text-error-dark",
 bg: "bg-error-light dark:bg-error-light",
 label: "Failed",
 };
 default:
 return {
 color: "text-neutral dark:text-neutral-dark",
 bg: "bg-neutral-light dark:bg-neutral-light",
 label: record.status || "Unknown",
 };
 }
};

const getWarningSeverityConfig = (severity) => {
 switch (severity) {
 case "high":
 return {
 color: "text-error dark:text-error-dark",
 bg: "bg-error-light dark:bg-error-light",
 border: "border-error dark:border-error",
 };
 case "medium":
 return {
 color: "text-warning dark:text-warning-dark",
 bg: "bg-warning-light dark:bg-warning-light",
 border: "border-warning dark:border-warning",
 };
 case "low":
 return {
 color: "text-info dark:text-info-dark",
 bg: "bg-info-light dark:bg-info-light",
 border: "border-info dark:border-info",
 };
 default:
 return {
 color: "text-neutral dark:text-neutral-dark",
 bg: "bg-neutral-light dark:bg-neutral-light",
 border: "border-neutral dark:border-neutral",
 };
 }
};

export default function TenantDetailModal({ tenant, onClose }) {
 useEscapeClose(!!tenant, onClose);
 if (!tenant) return null;

 const contractStatus = tenant.contractStatus || tenant.status || "active";
 const paymentStatus = tenant.paymentStatus || "paid";
 const occupancyStatus = tenant.occupancyStatus || "active";
 const nextAction = tenant.nextAction || "none";
 const paymentHistory = tenant.paymentHistory || [];
 const roomHistory = tenant.roomHistory || [];
 const extensionHistory = tenant.extensionHistory || [];
 const warnings = tenant.warnings || [];

 const contractConfig = getContractStatusConfig(contractStatus);
 const paymentConfig = getPaymentStatusConfig(paymentStatus);
 const occupancyConfig = getOccupancyStatusConfig(occupancyStatus);

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
 <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
 <div className="px-6 py-3 border-b border-border bg-card rounded-t-xl flex-shrink-0">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground font-semibold text-sm bg-blue-500">
 {tenant.initials || getInitials(tenant.name)}
 </div>
 <div>
 <h3 className="font-semibold text-foreground">{tenant.name}</h3>
 <div className="flex items-center gap-3 text-xs text-muted-foreground">
 <span>{tenant.email || "N/A"}</span>
 <span>•</span>
 <span>{tenant.phone || "N/A"}</span>
 </div>
 </div>
 </div>
 <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
 <X className="w-5 h-5 text-muted-foreground" />
 </button>
 </div>
 </div>

 <div className="p-6 flex-1 overflow-y-auto bg-card">
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
 <div className="space-y-4">
 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <Users className="w-3.5 h-3.5" />
 Basic Information
 </h4>
 <div className="space-y-2">
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Emergency Contact</span>
 <span className="text-foreground font-medium">{tenant.emergencyContact || "Not provided"}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Emergency Phone</span>
 <span className="text-foreground font-medium">{tenant.emergencyPhone || "Not provided"}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Move-in Date</span>
 <span className="text-foreground font-medium">{tenant.moveInDate || tenant.moveIn || "N/A"}</span>
 </div>
 </div>
 </div>

 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <MapPin className="w-3.5 h-3.5" />
 Room Assignment
 </h4>
 <div className="space-y-2">
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Branch</span>
 <span className="text-foreground font-medium">{tenant.branch || "N/A"}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Room</span>
 <span className="text-foreground font-medium">{tenant.room || "N/A"}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Bed</span>
 <span className="text-foreground font-medium capitalize">{tenant.bed || "No bed"}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Occupancy Status</span>
 <div className={`flex items-center gap-1 ${occupancyConfig.color}`}>
 <div className={`w-1.5 h-1.5 rounded-full ${occupancyConfig.dot}`} />
 <span className="font-medium text-xs">{occupancyConfig.label}</span>
 </div>
 </div>
 </div>
 </div>

 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <FileText className="w-3.5 h-3.5" />
 Contract Details
 </h4>
 <div className="space-y-2">
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Contract Status</span>
 <div className={`flex items-center gap-1 ${contractConfig.color}`}>
 <div className={`w-1.5 h-1.5 rounded-full ${contractConfig.dot}`} />
 <span className="font-medium text-xs">{contractConfig.label}</span>
 </div>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Contract End</span>
 <span className="text-foreground font-medium">{tenant.contractEnd || tenant.moveOut || "N/A"}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Days Remaining</span>
 <span className="text-foreground font-medium">{tenant.daysRemaining ?? "N/A"}{typeof tenant.daysRemaining === "number" ?" days" : ""}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Next Action</span>
 <span className="text-foreground font-medium">{getNextActionLabel(nextAction)}</span>
 </div>
 </div>
 </div>
 </div>

 <div className="space-y-4">
 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <DollarSign className="w-3.5 h-3.5" />
 Payment Information
 </h4>
 <div className="space-y-2">
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Monthly Rate</span>
 <span className="text-foreground font-medium">{formatMoney(tenant.monthlyRate)}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Initial Deposit</span>
 <span className="text-foreground font-medium">{formatMoney(tenant.initialDeposit)}</span>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Payment Status</span>
 <div className={`flex items-center gap-1 ${paymentConfig.color}`}>
 <div className={`w-1.5 h-1.5 rounded-full ${paymentConfig.dot}`} />
 <span className="font-medium text-xs">{paymentConfig.label}</span>
 </div>
 </div>
 <div className="flex justify-between text-xs">
 <span className="text-muted-foreground">Current Balance</span>
 <span className={`font-medium ${(tenant.balance || 0) > 0 ? "text-error dark:text-error-dark" : "text-success dark:text-success-dark"}`}>
 {formatMoney(tenant.balance || 0)}
 </span>
 </div>
 </div>
 </div>

 {extensionHistory.length > 0 ? (
 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <History className="w-3.5 h-3.5" />
 Extensions ({extensionHistory.length})
 </h4>
 <div className="space-y-2">
 {extensionHistory.map((extension) => (
 <div key={extension.id} className="p-2 bg-card border border-border rounded text-xs">
 <div className="flex items-center justify-between mb-1">
 <span className="font-medium text-foreground">{extension.duration}</span>
 <span className="text-muted-foreground">{extension.date}</span>
 </div>
 <div className="text-muted-foreground">{extension.previousEnd} → {extension.newEnd}</div>
 </div>
 ))}
 </div>
 </div>
 ) : null}

 {roomHistory.length > 0 ? (
 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <MapPin className="w-3.5 h-3.5" />
 Room History
 </h4>
 <div className="space-y-2">
 {roomHistory.map((room) => (
 <div key={room.id} className="flex items-center justify-between p-2 bg-card border border-border rounded text-xs">
 <div>
 <div className="font-medium text-foreground">{room.branch} - {room.room}</div>
 <div className="text-muted-foreground capitalize">{room.bed} • {room.moveInDate}</div>
 </div>
 <div
 className={`px-1.5 py-0.5 text-xs rounded ${
 room.status === "current"
 ? "bg-success-light dark:bg-success-light text-success-dark dark:text-success-dark"
 : "bg-neutral-light dark:bg-neutral-light text-neutral-dark dark:text-neutral-dark"
 }`}
 >
 {room.status === "current" ? "Current" : "Past"}
 </div>
 </div>
 ))}
 </div>
 </div>
 ) : null}
 </div>

 <div className="space-y-4">
 {paymentHistory.length > 0 ? (
 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <DollarSign className="w-3.5 h-3.5" />
 Payment History ({paymentHistory.length})
 </h4>
 <div className="space-y-2">
 {paymentHistory.map((payment) => {
 const paymentStatusConfig = getPaymentStatusLabel(payment);
 return (
 <div key={payment.id} className="p-2 bg-card border border-border rounded">
 <div className="flex items-center justify-between mb-1">
 <span className="text-sm font-medium text-foreground">₱{Number(payment.amount || 0).toLocaleString()}</span>
 <div className={`px-1.5 py-0.5 text-xs rounded ${paymentStatusConfig.bg} ${paymentStatusConfig.color}`}>
 {paymentStatusConfig.label}
 </div>
 </div>
 <div className="text-xs text-muted-foreground">{payment.date}</div>
 <div className="text-xs text-muted-foreground">{payment.method} • {payment.reference}</div>
 </div>
 );
 })}
 </div>
 </div>
 ) : null}

 {warnings.length > 0 ? (
 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <AlertTriangle className="w-3.5 h-3.5" />
 System Warnings ({warnings.length})
 </h4>
 <div className="space-y-2">
 {warnings.map((warning) => {
 const warningConfig = getWarningSeverityConfig(warning.severity);
 return (
 <div key={warning.id} className={`p-2 border-l-2 ${warningConfig.border} ${warningConfig.bg} rounded text-xs`}>
 <div className="flex items-start justify-between mb-1">
 <span className={`font-medium capitalize ${warningConfig.color}`}>{warning.type}</span>
 <span className="text-muted-foreground">{warning.date}</span>
 </div>
 <div className="text-foreground">{warning.message}</div>
 </div>
 );
 })}
 </div>
 </div>
 ) : (
 <div className="bg-success-light dark:bg-success-light rounded-lg p-3 text-center">
 <CheckCircle className="w-8 h-8 text-success dark:text-success-dark mx-auto mb-2" />
 <p className="text-xs text-success-dark dark:text-success-dark font-medium">No active warnings</p>
 <p className="text-xs text-muted-foreground mt-1">All systems clear</p>
 </div>
 )}

 {tenant.reservationId ? (
 <div className="bg-muted/30 rounded-lg p-3">
 <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
 <Shield className="w-3.5 h-3.5" />
 Tenant Actions
 </h4>
 <div className="flex flex-col gap-2">
 <button
 className="w-full flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 px-3 py-2 text-sm font-semibold"
 onClick={async () => {
 const months = prompt("Extend lease by how many months? (1-24)", "12");
 if (!months) return;
 const m = parseInt(months, 10);
 if (Number.isNaN(m) || m < 1 || m > 24) return alert("Enter 1-24");
 try {
 const { reservationApi } = await import("../../../shared/api/apiClient");
 const res = await reservationApi.renew(tenant.reservationId, { additionalMonths: m });
 showNotification(res.message || "Contract renewed!", "success");
 onClose();
 } catch (err) {
 showNotification("Renewal failed. Please try again.", "error");
 }
 }}
 >
 <RefreshCw className="w-4 h-4" />
 Renew Contract
 </button>

 <button
 className="w-full flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm font-semibold"
 onClick={async () => {
 const kwhInput = prompt(
 `Enter the current meter reading for ${tenant.room} (kWh).\n\nThis is required to record the move-out electricity consumption.`,
 "",
 );
 if (kwhInput === null) return;
 const meterReading = Number(kwhInput.trim());
 if (!kwhInput.trim() || Number.isNaN(meterReading) || meterReading < 0) {
 showNotification(
 "A valid meter reading (kWh) is required to move out a tenant.",
 "error",
 4000,
 );
 return;
 }
 if (!confirm(`Move out ${tenant.name} with meter reading ${meterReading} kWh? This will vacate their bed and mark them as inactive.`)) return;
 try {
 const { reservationApi } = await import("../../../shared/api/apiClient");
 const res = await reservationApi.moveOut(tenant.reservationId, {
 notes: "Admin move-out",
 meterReading,
 });
 const extra = res.electricityResult
 ? `\nMove-out reading recorded: ${res.electricityResult.meterReading} kWh`
 : "";
 showNotification((res.message || "Tenant moved out") + extra, "success");
 onClose();
 } catch (err) {
 showNotification("Move-out failed. Please try again.", "error");
 }
 }}
 >
 <LogOut className="w-4 h-4" />
 Move Out Tenant
 </button>

 <button
 className="w-full flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 text-orange-600 px-3 py-2 text-sm font-semibold"
 onClick={async () => {
 const newRoomId = prompt("Enter new Room ID (ObjectId):");
 if (!newRoomId) return;
 const newBedId = prompt("Enter new Bed ID (ObjectId):");
 if (!newBedId) return;
 const reason = prompt("Reason for transfer:", "Room maintenance / accommodation change");
 try {
 const { reservationApi } = await import("../../../shared/api/apiClient");
 const res = await reservationApi.transfer(tenant.reservationId, { newRoomId, newBedId, reason });
 showNotification(res.message || "Transfer complete", "success");
 onClose();
 } catch (err) {
 showNotification("Transfer failed. Please try again.", "error");
 }
 }}
 >
 <ArrowRightLeft className="w-4 h-4" />
 Transfer Room
 </button>
 </div>
 </div>
 ) : null}
 </div>
 </div>
 </div>

 <div className="px-6 py-4 border-t border-border bg-card flex justify-end sticky bottom-0 rounded-b-xl">
 <button onClick={onClose} className="px-6 py-2 border border-border rounded-md hover:bg-muted transition-colors text-sm font-medium">
 Close
 </button>
 </div>
 </div>
 </div>
 );
}
