import Navbar from "../components/Navbar";
import { ContactFooter } from "../components/ContactFooter";
import { HeroSection } from "../components/HeroSection";
import { BenefitsSection } from "../components/BenefitsSection";
import { SocialProofSection } from "../components/SocialProofSection";
import { RoomInventory } from "../components/RoomInventory";
import { FacilitiesSection } from "../components/FacilitiesSection";
import { LocationSection } from "../components/LocationSection";
import { RulesSection } from "../components/RulesSection";
import { StorytellingSection } from "../components/StorytellingSection";
import { InquiryForm } from "../components/InquiryForm";
import { CTASection } from "../components/CTASection";
import ScrollReveal from "../../../shared/components/ScrollReveal";
import ScrollToTopButton from "../../../shared/components/ScrollToTopButton";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import RouteErrorBoundary from "../../../shared/components/RouteErrorBoundary";

import SEOHead from "../../../shared/components/SEOHead";

/* Lightweight section fallback — only hides the broken section, not the whole page */
function SectionFallback({ name }) {
  return (
    <div
      style={{
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--lp-text-muted)",
        fontSize: "13px",
      }}
    >
      {name} section is temporarily unavailable.
    </div>
  );
}

function LandingPageContent() {
  const { theme } = useTheme();

  return (
    <div className="landing-page" data-theme={theme} style={{ overflowX: "hidden", backgroundColor: "var(--lp-bg)" }}>
      <SEOHead title="Home" description="Affordable, safe, and fully-furnished dormitory rooms near universities in Makati, Philippines. Book a visit today." />

      {/* A2: Skip-to-content link — visible only on keyboard focus */}
      <a
        href="#main-content"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          zIndex: 9999,
        }}
        onFocus={(e) => {
          Object.assign(e.currentTarget.style, {
            position: "fixed", left: "16px", top: "16px",
            width: "auto", height: "auto", overflow: "visible",
            padding: "12px 24px", backgroundColor: "var(--lp-accent)",
            color: "white", borderRadius: "8px", fontWeight: "600",
            fontSize: "14px", textDecoration: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          });
        }}
        onBlur={(e) => {
          Object.assign(e.currentTarget.style, {
            position: "absolute", left: "-9999px", top: "auto",
            width: "1px", height: "1px", overflow: "hidden",
            padding: "", backgroundColor: "", color: "",
            borderRadius: "", fontWeight: "", fontSize: "",
            textDecoration: "", boxShadow: "",
          });
        }}
      >
        Skip to main content
      </a>

      <Navbar type="landing" currentPage="home" />

      {/* Main content target for skip link */}
      <main id="main-content">

      {/* 1. HOOK — First impression */}
      <RouteErrorBoundary name="HeroSection" fallback={<SectionFallback name="Hero" />}>
        <HeroSection />
      </RouteErrorBoundary>

      {/* 2. FEATURES — Why choose us */}
      <div style={{ borderBottom: '1px solid var(--lp-border)' }}>
        <ScrollReveal variant="fade-up">
          <RouteErrorBoundary name="BenefitsSection" fallback={<SectionFallback name="Benefits" />}>
            <BenefitsSection />
          </RouteErrorBoundary>
        </ScrollReveal>
      </div>

      {/* 3. PRODUCT — What we offer */}
      <div style={{ borderBottom: '1px solid var(--lp-border)' }}>
        <ScrollReveal variant="fade-up" delay={0.1}>
          <RouteErrorBoundary name="RoomInventory" fallback={<SectionFallback name="Rooms" />}>
            <RoomInventory />
          </RouteErrorBoundary>
        </ScrollReveal>
      </div>

      {/* 4. FACILITIES — Shared spaces */}
      <div style={{ borderBottom: '1px solid var(--lp-border)' }}>
        <ScrollReveal variant="fade-up">
          <RouteErrorBoundary name="FacilitiesSection" fallback={<SectionFallback name="Facilities" />}>
            <FacilitiesSection />
          </RouteErrorBoundary>
        </ScrollReveal>
      </div>

      {/* 5. CONVENIENCE — Where we are */}
      <div style={{ borderBottom: '1px solid var(--lp-border)' }}>
        <ScrollReveal variant="fade-up">
          <RouteErrorBoundary name="LocationSection" fallback={<SectionFallback name="Location" />}>
            <LocationSection />
          </RouteErrorBoundary>
        </ScrollReveal>
      </div>

      {/* 6. TRUST — Social proof */}
      <div style={{ borderBottom: '1px solid var(--lp-border)' }}>
        <ScrollReveal variant="fade-up">
          <RouteErrorBoundary name="SocialProofSection" fallback={<SectionFallback name="Testimonials" />}>
            <SocialProofSection />
          </RouteErrorBoundary>
        </ScrollReveal>
      </div>

      {/* 7. STORY — Brand identity */}
      <div style={{ borderBottom: '1px solid var(--lp-border)' }}>
        <ScrollReveal variant="fade-left">
          <RouteErrorBoundary name="StorytellingSection" fallback={<SectionFallback name="About" />}>
            <StorytellingSection />
          </RouteErrorBoundary>
        </ScrollReveal>
      </div>

      {/* 8. TRANSPARENCY — House rules */}
      <ScrollReveal variant="fade">
        <RouteErrorBoundary name="RulesSection" fallback={<SectionFallback name="Rules" />}>
          <RulesSection />
        </RouteErrorBoundary>
      </ScrollReveal>

      {/* 9. ACTION — Convert the visitor */}
      <div style={{ borderBottom: '1px solid var(--lp-border)' }}>
        <ScrollReveal variant="fade-up">
          <RouteErrorBoundary name="InquiryForm" fallback={<SectionFallback name="Inquiry Form" />}>
            <InquiryForm />
          </RouteErrorBoundary>
        </ScrollReveal>
      </div>

      {/* 10. FINAL CTA */}
      <div style={{ borderBottom: '1px solid var(--lp-border)' }}>
        <ScrollReveal variant="zoom">
          <RouteErrorBoundary name="CTASection" fallback={<SectionFallback name="CTA" />}>
            <CTASection />
          </RouteErrorBoundary>
        </ScrollReveal>
      </div>

      </main>

      {/* FOOTER */}
      <ScrollReveal variant="fade">
        <RouteErrorBoundary name="ContactFooter" fallback={<SectionFallback name="Footer" />}>
          <ContactFooter />
        </RouteErrorBoundary>
      </ScrollReveal>

      <ScrollToTopButton />
    </div>
  );
}

function LandingPage() {
  return (
    <ThemeProvider>
      <LandingPageContent />
    </ThemeProvider>
  );
}

export default LandingPage;
