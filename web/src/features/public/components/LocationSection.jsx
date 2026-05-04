import { useState } from 'react';
import { MapPin, Bus, ShoppingBag, GraduationCap, Building2 } from 'lucide-react';

const locations = [
  {
    branch: 'Gil Puyat',
    address: 'Lilycrest Gil Puyat, Sen. Gil J. Puyat Ave, Makati City, Metro Manila',
    coordinates: '14.5552° N, 121.0003° E',
    mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.769459999064!2d120.99770221068401!3d14.555171985867126!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397c94bcde61457%3A0xff20ed97a7872fbc!2sLilycrest%20Gil%20Puyat!5e0!3m2!1sen!2sph!4v1775296600671!5m2!1sen!2sph" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade',
    nearbySchools: ['FEU Makati – Gil Puyat Campus (~0.3 km)',
      'Centro Escolar University (CEU) – Gil Puyat Campus (~0.3 km)',
      'De La Salle University – Makati Extension Campus (RCBC Plaza) (~1.0 km)'],
    transportation: ['Gil Puyat (Buendia) LRT Station – main LRT stop for LRT Line 1 (~5 min walk)',
      'Jeepney routes along Gil Puyat Ave (to Guadalupe, Buendia)',
      'Bus stop along Gil Puyat Ave or nearby streets (local routes available)'],
    landmarks: ['RCBC Plaza (major office and commercial complex)',
      'Petron Megaplaza (office building)',
      'Makati Medical Center (hospital and healthcare services)'],
  },
  {
    branch: 'Guadalupe',
    address: 'Lilycrest Guadalupe, EDSA, Brgy. Guadalupe Nuevo, Makati City',
    coordinates: '14.5618° N, 121.0446° E',
    mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.6532149739655!2d121.04459131068413!3d14.561812985861252!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397c8585182eb27%3A0xd31f8e47d977544!2sLilycrest%20Guadalupe!5e0!3m2!1sen!2sph!4v1775298417299!5m2!1sen!2sph" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade',
    nearbySchools: ['University of Makati (~1.5–2 km)',
    'Rizal Technological University (~2–3 km)',
    'De La Salle University – Makati Extension Campus (~2–3 km)'],
    transportation: ['Guadalupe MRT Station (3–5 min walk)',
    'EDSA Carousel Bus Stop (Guadalupe)',
    'Jeepney Terminal (routes to Makati, BGC, Pasay)'],
    landmarks: ['Guadalupe Commercial Complex (3–5 min walk)',
    'Our Lady of Guadalupe Church (5–7 min walk)',
    'Bonifacio Global City (~2–3 km)'],
  },
];

export function LocationSection() {
  const [activeTab, setActiveTab] = useState(0);
  const location = locations[activeTab];

  return (
    <section className="py-16 lg:py-20" style={{ backgroundColor: 'var(--lp-bg)' }} id="location">
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-xs mb-3 tracking-widest uppercase font-medium" style={{ color: 'var(--lp-accent)' }}>
            Where We Are
          </p>
          <h2 className="text-3xl lg:text-4xl font-medium mb-5 tracking-tight" style={{ color: 'var(--lp-text)' }}>
            Strategic Locations
          </h2>
          <p className="max-w-2xl mx-auto font-normal leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
            Both branches are strategically located near public transport and essential establishments.
          </p>
        </div>

        {/* Branch Tabs */}
        <div className="flex justify-center mb-8">
          <div
            className="inline-flex rounded-full p-1.5"
            style={{
              backgroundColor: 'var(--lp-bg-card)',
              border: '1px solid var(--lp-border)',
            }}
          >
            {locations.map((loc, i) => (
              <button
                key={loc.branch}
                onClick={() => setActiveTab(i)}
                className="relative px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300"
                style={{
                  backgroundColor: activeTab === i ? 'var(--lp-accent)' : 'transparent',
                  color: activeTab === i ? '#ffffff' : 'var(--lp-text-secondary)',
                  boxShadow: activeTab === i ? '0 4px 14px rgba(212, 175, 55, 0.3)' : 'none',
                }}
              >
                <MapPin
                  className="inline-block w-3.5 h-3.5 mr-1.5"
                  style={{ verticalAlign: 'text-bottom' }}
                />
                {loc.branch}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div
          key={activeTab}
          className="grid lg:grid-cols-2 gap-8 items-start"
          style={{ animation: 'locFadeIn 0.3s ease forwards' }}
        >
          {/* Map */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              border: '1px solid var(--lp-border)',
              boxShadow: 'var(--lp-card-shadow-hover)',
            }}
          >
            <div className="aspect-[4/3] relative" style={{ backgroundColor: 'var(--lp-bg-card)' }}>
              <iframe
                src={location.mapEmbed}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`${location.branch} Location Map`}
              />
            </div>
          </div>

          {/* Details */}
          <div>
            <div className="mb-6">
              <div
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium mb-4"
                style={{
                  backgroundColor: 'var(--lp-icon-bg)',
                  color: 'var(--lp-accent)',
                }}
              >
                <Building2 className="w-3.5 h-3.5" />
                {location.branch} Branch
              </div>
              <h3 className="text-xl font-medium mb-2 tracking-tight" style={{ color: 'var(--lp-text)' }}>
                {location.address}
              </h3>
              <p className="text-sm" style={{ color: 'var(--lp-text-muted)' }}>{location.coordinates}</p>
            </div>

            {/* Nearby info grid */}
            <div className="space-y-5">
              {/* Nearby Schools */}
              <div
                className="p-5 rounded-2xl"
                style={{
                  backgroundColor: 'var(--lp-bg-card)',
                  border: '1px solid var(--lp-border)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <GraduationCap className="w-4 h-4" style={{ color: 'var(--lp-accent)' }} />
                  <h4 className="text-sm font-medium" style={{ color: 'var(--lp-text)' }}>Nearby Universities</h4>
                </div>
                <ul className="space-y-1.5">
                  {location.nearbySchools.map((school, idx) => (
                    <li key={idx} className="text-sm flex items-center gap-2" style={{ color: 'var(--lp-text-secondary)' }}>
                      <span style={{ color: 'var(--lp-accent)', fontSize: '10px' }}>●</span>
                      {school}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Transportation */}
              <div
                className="p-5 rounded-2xl"
                style={{
                  backgroundColor: 'var(--lp-bg-card)',
                  border: '1px solid var(--lp-border)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Bus className="w-4 h-4" style={{ color: 'var(--lp-accent)' }} />
                  <h4 className="text-sm font-medium" style={{ color: 'var(--lp-text)' }}>Transportation Access</h4>
                </div>
                <ul className="space-y-1.5">
                  {location.transportation.map((t, idx) => (
                    <li key={idx} className="text-sm flex items-center gap-2" style={{ color: 'var(--lp-text-secondary)' }}>
                      <span style={{ color: 'var(--lp-accent)', fontSize: '10px' }}>●</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Landmarks */}
              <div
                className="p-5 rounded-2xl"
                style={{
                  backgroundColor: 'var(--lp-bg-card)',
                  border: '1px solid var(--lp-border)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingBag className="w-4 h-4" style={{ color: 'var(--lp-accent)' }} />
                  <h4 className="text-sm font-medium" style={{ color: 'var(--lp-text)' }}>Nearby Establishments</h4>
                </div>
                <ul className="space-y-1.5">
                  {location.landmarks.map((l, idx) => (
                    <li key={idx} className="text-sm flex items-center gap-2" style={{ color: 'var(--lp-text-secondary)' }}>
                      <span style={{ color: 'var(--lp-accent)', fontSize: '10px' }}>●</span>
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes locFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}

export default LocationSection;