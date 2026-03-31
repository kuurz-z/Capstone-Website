import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const roomListings = [
  {
    id: 1,
    title: 'Private Room',
    subtitle: 'Gil Puyat Branch',
    description: 'Your own space with complete privacy. Each room has its own toilet, shower, and kitchenette.',
    price: '₱13,500',
    priceNote: '/room',
    popular: false,
    image: 'https://images.unsplash.com/photo-1610307522657-8c0304960189?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwYmVkcm9vbSUyMGRlc2lnbnxlbnwxfHx8fDE3NzAzMDM5ODB8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    inclusions: ['Max 2 Pax', 'Private Toilet & Shower', 'Kitchenette', 'Aircon', 'Wi-Fi', 'Fully Furnished'],
  },
  {
    id: 2,
    title: 'Double Sharing',
    subtitle: 'Gil Puyat Branch',
    description: 'Share with a roommate while enjoying your own space. Common areas per floor include lounge, toilet & shower.',
    price: '₱7,200',
    priceNote: '/pax',
    popular: true,
    image: 'https://images.unsplash.com/photo-1764760764956-fcb78be107a5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBiZWRyb29tJTIwaW50ZXJpb3IlMjBuYXR1cmFsJTIwbGlnaHR8ZW58MXx8fHwxNzcwMjkwMzY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    inclusions: ['2 Pax per Room', 'Double Decker Bed', 'Shared Floor Amenities', 'Aircon', 'Wi-Fi', 'Fully Furnished'],
  },
  {
    id: 3,
    title: 'Quadruple Sharing',
    subtitle: 'Gil Puyat & Guadalupe',
    description: 'Budget-friendly option with a vibrant community atmosphere. Common areas per floor include lounge, toilet & shower.',
    price: '₱5,400',
    priceNote: '/pax',
    popular: false,
    image: 'https://images.unsplash.com/photo-1758521540263-e15a58e64248?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3p5JTIwc2hhcmVkJTIwYmVkcm9vbXxlbnwxfHx8fDE3NzAzNTI3MTB8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    inclusions: ['4 Pax per Room', 'Double Decker Beds', 'Shared Floor Amenities', 'Aircon', 'Wi-Fi', 'Fully Furnished'],
  },
];

export function RoomInventory() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: 'var(--lp-bg)' }} id="rooms">
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-xs mb-3 tracking-widest uppercase font-medium" style={{ color: 'var(--lp-accent)' }}>
            Room Options
          </p>
          <h2
            className="text-3xl lg:text-4xl font-medium mb-5 tracking-tight"
            style={{ color: 'var(--lp-text)' }}
          >
            Choose Your Room Type
          </h2>
          <p className="max-w-xl mx-auto font-light leading-relaxed" style={{ color: 'var(--lp-text-secondary)' }}>
            All rooms come fully furnished with essential amenities. Pick the
            option that fits your budget and lifestyle.
          </p>
        </div>

        {/* Room Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
          {roomListings.map((room) => (
            <div
              key={room.id}
              role="article"
              className="group rounded-2xl overflow-hidden transition-all duration-300"
              style={{
                backgroundColor: 'var(--lp-bg-card)',
                border: room.popular ? '2px solid var(--lp-accent)' : '1px solid var(--lp-border)',
                boxShadow: room.popular ? 'var(--lp-card-shadow-hover)' : 'var(--lp-card-shadow)',
                ...(room.popular ? { marginTop: '-16px', marginBottom: '16px' } : {}),
              }}
              onMouseEnter={(e) => {
                if (!room.popular) e.currentTarget.style.boxShadow = 'var(--lp-card-shadow-hover)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                if (!room.popular) e.currentTarget.style.boxShadow = 'var(--lp-card-shadow)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Image - Popular badge now a corner ribbon */}
              <div className="relative h-72 overflow-hidden">
                <img
                  src={room.image}
                  alt={room.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Price Badge */}
                <div
                  className="absolute top-4 left-4 backdrop-blur-sm rounded-full px-4 py-2"
                  style={{
                    backgroundColor: 'var(--lp-bg)',
                    boxShadow: 'var(--lp-card-shadow)',
                    border: '1px solid var(--lp-border)',
                  }}
                >
                  <span className="text-lg font-medium" style={{ color: 'var(--lp-text)' }}>
                    {room.price}
                  </span>
                  <span className="text-xs ml-1" style={{ color: 'var(--lp-text-muted)' }}>{room.priceNote || '/mo'}</span>
                </div>

                {/* Corner Ribbon — replaces full-width bar */}
                {room.popular && (
                  <span
                    className="absolute top-4 right-4 text-white text-xs font-medium tracking-wider uppercase px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--lp-accent)' }}
                  >
                    ★ Most Popular
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="p-7" style={{ backgroundColor: 'var(--lp-bg-card)' }}>
                <h3 className="font-medium text-xl mb-1.5 tracking-tight" style={{ color: 'var(--lp-text)' }}>
                  {room.title}
                </h3>
                <p className="text-xs mb-4 font-light" style={{ color: 'var(--lp-text-muted)' }}>
                  {room.subtitle}
                </p>
                <p className="text-sm mb-6 leading-relaxed font-light" style={{ color: 'var(--lp-text-secondary)' }}>
                  {room.description}
                </p>

                {/* Inclusions — capped at 4 to prevent overflow */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {room.inclusions.slice(0, 4).map((item, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-3 py-1.5 rounded-full font-light"
                      style={{
                        backgroundColor: 'var(--lp-icon-bg)',
                        color: 'var(--lp-text-secondary)',
                      }}
                    >
                      {item}
                    </span>
                  ))}
                  {room.inclusions.length > 4 && (
                    <span
                      className="text-xs px-3 py-1.5 rounded-full font-light"
                      style={{
                        backgroundColor: 'var(--lp-icon-bg)',
                        color: 'var(--lp-text-muted)',
                      }}
                    >
                      +{room.inclusions.length - 4} more
                    </span>
                  )}
                </div>

                {/* CTA Button — improved ghost contrast */}
                <Link
                  to="/applicant/check-availability"
                  className="flex items-center justify-center gap-2 w-full py-4 rounded-full text-sm font-medium transition-all duration-300"
                  style={
                    room.popular
                      ? {
                          backgroundColor: 'var(--lp-accent)',
                          color: '#ffffff',
                          boxShadow: '0 4px 12px rgba(255, 140, 66, 0.25)',
                        }
                      : {
                          border: '1.5px solid var(--lp-accent)',
                          color: 'var(--lp-accent)',
                          backgroundColor: 'transparent',
                          fontWeight: '500',
                        }
                  }
                  onMouseEnter={(e) => {
                    if (!room.popular) {
                      e.currentTarget.style.backgroundColor = 'var(--lp-accent)';
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!room.popular) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--lp-accent)';
                    }
                  }}
                >
                  View Details
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* View All Link */}
        <div className="text-center mt-12">
          <Link
            to="/applicant/check-availability"
            className="inline-flex items-center gap-2 text-sm font-medium hover:gap-3 transition-all duration-300"
            style={{ color: 'var(--lp-accent)' }}
          >
            View All Available Rooms
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default RoomInventory;