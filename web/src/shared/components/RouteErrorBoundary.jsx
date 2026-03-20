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

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
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
    this.setState({ hasError: false, error: null, errorInfo: null });
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
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <h2
              style={{
                margin: "0 0 8px 0",
                fontSize: "20px",
                color: "var(--text-heading, #1a1a2e)",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                margin: "0 0 24px 0",
                color: "var(--text-muted, #666)",
                fontSize: "14px",
                lineHeight: "1.5",
              }}
            >
              This page encountered an unexpected error. Your other pages still
              work fine.
            </p>

            <div
              style={{ display: "flex", gap: "12px", justifyContent: "center" }}
            >
              <button
                onClick={this.handleRetry}
                style={{
                  background: "#1a3f6b",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 24px",
                  fontSize: "14px",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Try Again
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
