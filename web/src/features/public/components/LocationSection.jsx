import { MapPin, Bus, Train, Building2, ShoppingBag, GraduationCap } from 'lucide-react';

const locations = [
  {
    branch: 'Gil Puyat',
    address: '1234 Gil Puyat Avenue, Makati City, Metro Manila',
    coordinates: '14.5547° N, 121.0244° E',
    mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.6509!2d121.0!3d14.555!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTTCsDMzJzE2LjkiTiAxMjHCsDAxJzI3LjgiRQ!5e0!3m2!1sen!2sph!4v1234567890',
    nearbySchools: ['De La Salle University (2.5 km)', 'Mapua University (3 km)', 'Lyceum of the Philippines (2 km)'],
    transportation: ['Gil Puyat LRT Station (5 min walk)', 'Jeepney routes to Guadalupe, Buendia', 'Bus terminal nearby'],
    landmarks: ['SM Makati (10 min walk)', '7-Eleven (2 min walk)', 'Mercury Drug (5 min walk)'],
    color: '#D4982B'
  },
  {
    branch: 'Guadalupe',
    address: '5678 Guadalupe Street, Guadalupe Nuevo, Makati City',
    coordinates: '14.5667° N, 121.0456° E',
    mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.5509!2d121.045!3d14.5667!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTTCsDM0JzAwLjEiTiAxMjHCsDAyJzQ0LjIiRQ!5e0!3m2!1sen!2sph!4v1234567890',
    nearbySchools: ['University of Santo Tomas (4 km)', 'PUP Manila (3.5 km)', 'Adamson University (4 km)'],
    transportation: ['Guadalupe MRT Station (3 min walk)', 'Multiple jeepney routes', 'EDSA Carousel Bus Stop'],
    landmarks: ['Guadalupe Commercial Center (5 min)', 'Landmark Makati (15 min)', 'Mini Stop (1 min walk)'],
    color: '#EDB938'
  }
];

export function LocationSection() {
  return (
    <section className="py-16 lg:py-20 bg-white" id="location">
      <div className="max-w-7xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs text-gray-500 mb-3 tracking-widest uppercase font-medium">Where We Are</p>
          <h2 className="text-4xl lg:text-5xl font-normal mb-5 tracking-tight" style={{ color: '#183153' }}>
            Strategic Locations
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto font-normal leading-relaxed">
            Both branches are strategically located near universities, public transport, and essential establishments.
          </p>
        </div>

        {/* Location Cards */}
        <div className="space-y-16">
          {locations.map((location, index) => (
            <div key={index} className="grid lg:grid-cols-2 gap-8 items-start">
              {/* Map */}
              <div className="rounded-3xl overflow-hidden border border-gray-100 shadow-lg order-2 lg:order-1">
                <div className="aspect-[4/3] bg-gray-100 relative">
                  <iframe
                    src={location.mapEmbed}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`${location.branch} Location Map`}
                  ></iframe>
                </div>
              </div>

              {/* Details */}
              <div className="order-1 lg:order-2">
                <div className="mb-6">
                  <div className="inline-block px-4 py-2 rounded-full text-xs font-medium mb-4" style={{ backgroundColor: `${location.color}15`, color: location.color }}>
                    {location.branch} Branch
                  </div>
                  <h3 className="text-2xl font-medium mb-3 tracking-tight" style={{ color: '#183153' }}>
                    {location.address}
                  </h3>
                  <p className="text-sm text-gray-500">{location.coordinates}</p>
                </div>

                {/* Nearby Schools */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <GraduationCap className="w-5 h-5" style={{ color: location.color }} />
                    <h4 className="text-sm font-normal" style={{ color: '#183153' }}>Nearby Universities</h4>
                  </div>
                  <ul className="space-y-2">
                    {location.nearbySchools.map((school, idx) => (
                      <li key={idx} className="text-sm text-gray-600 pl-7">
                        • {school}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Transportation */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Bus className="w-5 h-5" style={{ color: location.color }} />
                    <h4 className="text-sm font-normal" style={{ color: '#183153' }}>Transportation Access</h4>
                  </div>
                  <ul className="space-y-2">
                    {location.transportation.map((transport, idx) => (
                      <li key={idx} className="text-sm text-gray-600 pl-7">
                        • {transport}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Landmarks */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingBag className="w-5 h-5" style={{ color: location.color }} />
                    <h4 className="text-sm font-normal" style={{ color: '#183153' }}>Nearby Establishments</h4>
                  </div>
                  <ul className="space-y-2">
                    {location.landmarks.map((landmark, idx) => (
                      <li key={idx} className="text-sm text-gray-600 pl-7">
                        • {landmark}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default LocationSection;