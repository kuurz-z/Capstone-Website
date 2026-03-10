import Navbar from "../components/Navbar";
import { ContactFooter } from "../components/ContactFooter";
import { HeroSection } from "../components/HeroSection";
import { BenefitsSection } from "../components/BenefitsSection";
import { RoomInventory } from "../components/RoomInventory";
import { PricingSection } from "../components/PricingSection";
import { FacilitiesSection } from "../components/FacilitiesSection";
import { LocationSection } from "../components/LocationSection";
import { RulesSection } from "../components/RulesSection";
import { StorytellingSection } from "../components/StorytellingSection";
import { GuaranteeSection } from "../components/GuaranteeSection";
import { InquiryForm } from "../components/InquiryForm";
import { CTASection } from "../components/CTASection";
import ScrollReveal from "../../../shared/components/ScrollReveal";
import ScrollToTopButton from "../../../shared/components/ScrollToTopButton";

function LandingPage() {
  return (
    <div className="landing-page" style={{ overflowX: "hidden" }}>
      <Navbar type="landing" currentPage="home" />

      {/* Hero — has its own entrance animations, no ScrollReveal needed */}
      <HeroSection />

      {/* Each section reveals as you scroll down */}
      <ScrollReveal variant="fade-up">
        <BenefitsSection />
      </ScrollReveal>

      <ScrollReveal variant="fade-up" delay={0.1}>
        <RoomInventory />
      </ScrollReveal>

      <ScrollReveal variant="fade-up">
        <PricingSection />
      </ScrollReveal>

      <ScrollReveal variant="fade-up">
        <FacilitiesSection />
      </ScrollReveal>

      <ScrollReveal variant="fade-up">
        <LocationSection />
      </ScrollReveal>

      <ScrollReveal variant="fade-up">
        <RulesSection />
      </ScrollReveal>

      <ScrollReveal variant="fade-left">
        <StorytellingSection />
      </ScrollReveal>

      <ScrollReveal variant="zoom">
        <GuaranteeSection />
      </ScrollReveal>

      <ScrollReveal variant="fade-up">
        <InquiryForm />
      </ScrollReveal>

      <ScrollReveal variant="zoom">
        <CTASection />
      </ScrollReveal>

      <ScrollReveal variant="fade">
        <ContactFooter />
      </ScrollReveal>

      <ScrollToTopButton />
    </div>
  );
}

export default LandingPage;
