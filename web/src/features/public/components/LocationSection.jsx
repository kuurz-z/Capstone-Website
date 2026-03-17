import { useState } from 'react';
import { MapPin, Bus, ShoppingBag, GraduationCap, Building2 } from 'lucide-react';

const locations = [
  {
    branch: 'Gil Puyat',
    address: '1234 Gil Puyat Avenue, Makati City, Metro Manila',
    coordinates: '14.5547° N, 121.0244° E',
    mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.6509!2d121.0!3d14.555!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTTCsDMzJzE2LjkiTiAxMjHCsDAxJzI3LjgiRQ!5e0!3m2!1sen!2sph!4v1234567890',
    nearbySchools: ['De La Salle University (2.5 km)', 'Mapua University (3 km)', 'Lyceum of the Philippines (2 km)'],
    transportation: ['Gil Puyat LRT Station (5 min walk)', 'Jeepney routes to Guadalupe, Buendia', 'Bus terminal nearby'],
    landmarks: ['SM Makati (10 min walk)', '7-Eleven (2 min walk)', 'Mercury Drug (5 min walk)'],
  },
  {
    branch: 'Guadalupe',
    address: '5678 Guadalupe Street, Guadalupe Nuevo, Makati City',
    coordinates: '14.5667° N, 121.0456° E',
    mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.5509!2d121.045!3d14.5667!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTTCsDM0JzAwLjEiTiAxMjHCsDAyJzQ0LjIiRQ!5e0!3m2!1sen!2sph!4v1234567890',
    nearbySchools: ['University of Santo Tomas (4 km)', 'PUP Manila (3.5 km)', 'Adamson University (4 km)'],
    transportation: ['Guadalupe MRT Station (3 min walk)', 'Multiple jeepney routes', 'EDSA Carousel Bus Stop'],
    landmarks: ['Guadalupe Commercial Center (5 min)', 'Landmark Makati (15 min)', 'Mini Stop (1 min walk)'],
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
                  boxShadow: activeTab === i ? '0 4px 14px rgba(255, 140, 66, 0.3)' : 'none',
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