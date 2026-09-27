import { CheckCircle2 } from "lucide-react";

export default function AdminChatClosedBanner({ closingNote, status = "closed" }) {
  return (
    <div className="p-3.5 bg-slate-100 dark:bg-slate-900 border-t border-border text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        <div className="font-bold">{status === "resolved" ? "This request is resolved." : "This conversation is closed."}</div>
        {closingNote && (
          <div className="text-muted-foreground">
            Resolution Note: <em>{closingNote}</em>
          </div>
        )}
      </div>
    </div>
  );
}
