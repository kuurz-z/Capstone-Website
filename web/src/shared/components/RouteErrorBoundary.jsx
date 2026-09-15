/**
 * ============================================================================
 * ROUTE ERROR BOUNDARY
 * ============================================================================
 *
 * Per-route error boundary that catches crashes in individual pages
 * without taking down the entire application.
 *
 * Usage: <RouteErrorBoundary><SomePage /></RouteErrorBoundary>
 *
 * ============================================================================
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, isChunkError: false, isRetrying: false };
  }

  static getDerivedStateFromError(error) {
    const isChunkError =
      error?.name === "ChunkLoadError" ||
      (error instanceof TypeError &&
        (error.message?.includes("Failed to fetch dynamically imported module") ||
         error.message?.includes("importing a module script failed"))) ||
      error?.message?.includes("Loading chunk");

    return { hasError: true, error, isChunkError: Boolean(isChunkError), isRetrying: false };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error(
      `[RouteErrorBoundary] Error in ${this.props.name || "route"}:`,
      error,
      errorInfo,
    );
  }

  handleRetry = () => {
    this.setState({ isRetrying: true });
    try {
      sessionStorage.removeItem("socialAuthInProgress");
    } catch (_) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // If a custom fallback was provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

 return (
 <div
 style={{
 display: "flex",
 flexDirection: "column",
 alignItems: "center",
 justifyContent: "center",
 minHeight: "60vh",
 padding: "40px 24px",
 fontFamily:
 "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
 textAlign: "center",
 }}
 >
 <div
 style={{
 background: "var(--surface-card, #fff)",
 borderRadius: "16px",
 padding: "48px",
 maxWidth: "480px",
 boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
 border: "1px solid var(--border-card, #f0f0f0)",
 }}
 >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
              <AlertTriangle size={48} strokeWidth={1.5} style={{ color: "#D97706" }} />
            </div>
 <h2
 style={{
 margin: "0 0 8px 0",
 fontSize: "20px",
 color: "var(--text-heading, #1a1a2e)",
 }}
 >
 {this.state.isChunkError ? "Page Update Available" : "Something went wrong"}
 </h2>
 <p
 style={{
 margin: "0 0 24px 0",
 color: "var(--text-muted, #666)",
 fontSize: "14px",
 lineHeight: "1.5",
 }}
 >
 {this.state.isChunkError
    ? "A new version of this page is available or the network connection was updated. Reloading will load the latest version."
    : "This page encountered an unexpected error. Your other pages still work fine."}
 </p>

 <div
 style={{ display: "flex", gap: "12px", justifyContent: "center" }}
 >
              <button
                onClick={this.handleRetry}
                disabled={this.state.isRetrying}
                style={{
                  background: "#1a3f6b",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 24px",
                  fontSize: "14px",
                  cursor: this.state.isRetrying ? "not-allowed" : "pointer",
                  fontWeight: 500,
                  opacity: this.state.isRetrying ? 0.7 : 1,
                }}
              >
                {this.state.isRetrying
                  ? "Reloading..."
                  : this.state.isChunkError
                    ? "Reload Page"
                    : "Try Again"}
              </button>
 <button
 onClick={() => (window.location.href = "/")}
 style={{
 background: "transparent",
 color: "#1a3f6b",
 border: "1px solid #1a3f6b",
 borderRadius: "8px",
 padding: "10px 24px",
 fontSize: "14px",
 cursor: "pointer",
 fontWeight: 500,
 }}
 >
 Go Home
 </button>
 </div>

 {process.env.NODE_ENV === "development" && this.state.error && (
 <pre
 style={{
 marginTop: "24px",
 padding: "16px",
 background: "rgba(220, 38, 38, 0.06)",
 borderRadius: "8px",
 fontSize: "12px",
 textAlign: "left",
 overflow: "auto",
 maxHeight: "200px",
 color: "#991b1b",
 }}
 >
 {this.state.error.toString()}
 {this.state.errorInfo?.componentStack}
 </pre>
 )}
 </div>
 </div>
 );
 }

 return this.props.children;
 }
}

export default RouteErrorBoundary;
