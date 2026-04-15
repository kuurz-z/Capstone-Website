import React, { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import "./App.css";
import { AppRoutes } from "./app/routes/AppRoutes";
import { ThemeProvider } from "./features/public/context/ThemeContext";
import GlobalLoading from "./shared/components/GlobalLoading";
import ScrollToTop from "./shared/components/ScrollToTop";
import { FirebaseAuthProvider } from "./shared/hooks/FirebaseAuthContext";
import { AuthProvider, useAuth } from "./shared/hooks/useAuth";

function AppContent() {
  const { globalLoading, setGlobalLoading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!globalLoading) return;

    const timer = setTimeout(() => {
      setGlobalLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [location.pathname, globalLoading, setGlobalLoading]);

  return (
    <>
      <ScrollToTop />
      {globalLoading ? (
        <GlobalLoading />
      ) : (
        <Suspense fallback={null}>
          <AppRoutes />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <FirebaseAuthProvider>
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </FirebaseAuthProvider>
  );
}
