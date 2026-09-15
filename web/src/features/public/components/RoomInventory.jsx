import { useState, useEffect, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { roomApi } from '../../../shared/api/roomApi';
import { ProgressiveImage } from '../../../shared/components/ProgressiveImage';
import {
  ScrollReveal,
  ScrollRevealStagger,
  ScrollRevealItem,
} from '../../../shared/components/ScrollReveal';
import privateRoomImg from "../../../assets/images/branches/gil-puyat/Private - GP/private room copy.webp";
import doubleRoomImg from "../../../assets/images/branches/gil-puyat/Double - GP/Double sharing room1.webp";
import quadRoomImg from "../../../assets/images/branches/gil-puyat/Quadruple - GP/Pic quad.webp";
import guadalupeSharedRoomImg from "../../../assets/images/branches/guadalupe/2d-viewing/Guadalupe shared room.webp";

const DEFAULT_ROOM_LISTINGS = [
  {
    id: 1,
    title: 'Private Room',
    subtitle: 'Gil Puyat Branch',
    description: 'Your own space with complete privacy. Each room has its own toilet, shower, and kitchenette.',
    regularPrice: '₱15,000',
    price: '₱13,500',
    priceNote: '/room',
    discountPercent: 10,
    hasDiscount: true,
    popular: false,
    image: privateRoomImg,
    inclusions: ['Max 2 Pax', 'Private Restroom', 'Kitchenette', 'Lounge Area Access', 'Fully Furnished'],
    linkUrl: '/applicant/check-availability?branch=Gil%20Puyat&roomType=Private',
  },
  {
    id: 2,
    title: 'Double Sharing',
    subtitle: 'Gil Puyat Branch',
    description: 'Share with a roommate while enjoying your own space. Common areas per floor include lounge, toilet & shower.',
    regularPrice: '₱9,000',
    price: '₱7,200',
    priceNote: '/pax',
    discountPercent: 20,
    hasDiscount: true,
    popular: true,
    image: doubleRoomImg,
    inclusions: ['Max 2 Pax', 'Double Decker Bed', 'Shared Floor Amenities', 'Common Bathroom', 'Fully Furnished'],
    linkUrl: '/applicant/check-availability?branch=Gil%20Puyat&roomType=Shared',
  },
  {
    id: 3,
    title: 'Quadruple Sharing',
    subtitle: 'Gil Puyat & Guadalupe',
    description: 'Budget-friendly with a vibrant community atmosphere. Common areas per floor include lounge, toilet & shower.',
    regularPrice: '₱6,000',
    price: '₱5,400',
    priceNote: '/pax',
    discountPercent: 10,
    hasDiscount: true,
    popular: false,
    image: quadRoomImg,
    inclusions: ['Max 4 Pax', 'Double Decker Beds', 'Shared Floor Amenities', 'Common Bathroom', 'Aircon'],
    linkUrl: '/applicant/check-availability?roomType=Quadruple',
  },
];

export function RoomInventory() {
  const [apiRooms, setApiRooms] = useState([]);

  useEffect(() => {
    roomApi.getAll()
      .then((res) => {
        const items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
        if (items.length > 0) {
          setApiRooms(items);
        }
      })
      .catch((err) => {
        console.warn("Using fallback room listings (API offline):", err);
      });
  }, []);

  const roomListings = useMemo(() => {
    if (apiRooms.length === 0) return DEFAULT_ROOM_LISTINGS;

    // Group rooms by type or list top featured rooms
    const types = ["private", "double-sharing", "quadruple-sharing"];

    const picked = types.map((type, idx) => {
      const typeRooms = apiRooms.filter((r) => r.type === type);
      const popularRoom = typeRooms.find((r) => r.isPopular) || typeRooms[0];

      if (!popularRoom) return DEFAULT_ROOM_LISTINGS[idx];

      const defaultRegularRate = type === "private" ? 15000 : type === "double-sharing" ? 9000 : 6000;
      const defaultDiscountedRate = type === "private" ? 13500 : type === "double-sharing" ? 7200 : 5400;
      const defaultDiscountPct = type === "private" ? 10 : type === "double-sharing" ? 20 : 10;

      const regularRate = typeof popularRoom.regularLongRate === "number" && popularRoom.regularLongRate > 0
        ? popularRoom.regularLongRate
        : defaultRegularRate;

      const currentRate = typeof popularRoom.monthlyPrice === "number" && popularRoom.monthlyPrice > 0
        ? popularRoom.monthlyPrice
        : typeof popularRoom.price === "number" && popularRoom.price > 0
        ? popularRoom.price
        : defaultDiscountedRate;

      const discountPercentConfig = typeof popularRoom.longTermDiscountPercent === "number" && popularRoom.longTermDiscountPercent > 0
        ? popularRoom.longTermDiscountPercent
        : (regularRate > currentRate ? Math.round(((regularRate - currentRate) / regularRate) * 100) : defaultDiscountPct);

      const isDiscountEnabled = popularRoom.isDiscountEnabled !== false;
      const hasDiscount = isDiscountEnabled && regularRate > currentRate && discountPercentConfig > 0;

      const formattedRegularPrice = `₱${Number(regularRate).toLocaleString()}`;
      const formattedPrice = `₱${Number(currentRate).toLocaleString()}`;

      const defaultRoomImage =
        popularRoom.branch === "guadalupe"
          ? guadalupeSharedRoomImg
          : type === "private"
          ? privateRoomImg
          : type === "double-sharing"
          ? doubleRoomImg
          : quadRoomImg;

      const validImages = Array.isArray(popularRoom.images)
        ? popularRoom.images.filter((img) => (typeof img === "string" ? img.trim().length > 0 : Boolean(img?.url)))
        : [];
      const firstValidImage = validImages[0]
        ? (typeof validImages[0] === "string" ? validImages[0] : validImages[0]?.url || null)
        : null;

      const displayImg =
        firstValidImage ||
        (typeof popularRoom.image === "string" && popularRoom.image.trim().length > 0 ? popularRoom.image : null) ||
        defaultRoomImage;
      const mapTypeParam = (t) => {
        if (t === "private") return "Private";
        if (t === "double-sharing") return "Shared";
        if (t === "quadruple-sharing") return "Quadruple";
        return "All";
      };
      const branchParam = popularRoom.branch === "guadalupe" ? "Guadalupe" : "Gil Puyat";
      const typeParam = mapTypeParam(type);
      const computedLinkUrl = `/applicant/check-availability?branch=${encodeURIComponent(branchParam)}&roomType=${encodeURIComponent(typeParam)}`;

      return {
        id: popularRoom._id || idx + 1,
        title: formatTypeTitle(type),
        subtitle: popularRoom.branch === "guadalupe" ? "Guadalupe Branch" : "Gil Puyat Branch",
        description: popularRoom.description || DEFAULT_ROOM_LISTINGS[idx].description,
        regularPrice: formattedRegularPrice,
        price: formattedPrice,
        priceNote: type === "private" ? "/room" : "/pax",
        discountPercent: discountPercentConfig,
        hasDiscount,
        popular: Boolean(popularRoom.isPopular),
        image: displayImg,
        inclusions: popularRoom.amenities && popularRoom.amenities.length > 0
          ? popularRoom.amenities
          : DEFAULT_ROOM_LISTINGS[idx].inclusions,
        linkUrl: computedLinkUrl,
      };
    });

    return picked;
  }, [apiRooms]);

  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: 'var(--lp-bg)' }} id="rooms">
      <div className="max-w-screen-2xl mx-auto px-8 lg:px-12">
        {/* Header */}
        <ScrollReveal variant="fade-up">
          <div className="text-center mb-16">
            <p className="text-xs mb-3 tracking-widest uppercase font-medium" style={{ color: 'var(--lp-accent-text)' }}>
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
        </ScrollReveal>

        {/* Room Cards */}
        <ScrollRevealStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" staggerDelay={0.12}>
          {roomListings.map((room, cardIdx) => (
            <ScrollRevealItem key={room.id} className="h-full">
              <div
                role="article"
                className="group rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between h-full"
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
                {/* Image — priority on first card so it loads immediately */}
                <div className="relative h-72 overflow-hidden">
                  <ProgressiveImage
                    src={room.image}
                    alt={room.title}
                    priority={cardIdx === 0}
                    optimizerOpts={{ width: 480, quality: 75 }}
                    style={{ height: '100%', objectFit: 'cover' }}
                    className="group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Price Badge with Strikethrough & Discount Tag */}
                  <div
                    className="absolute top-4 left-4 z-10 backdrop-blur-md rounded-full px-3.5 py-1.5 flex items-center gap-1.5 shadow-sm"
                    style={{
                      backgroundColor: 'var(--lp-bg)',
                      boxShadow: 'var(--lp-card-shadow)',
                      border: '1px solid var(--lp-border)',
                    }}
                  >
                    {room.hasDiscount && (
                      <span
                        className="text-xs line-through font-normal"
                        style={{ color: 'var(--lp-text-secondary)' }}
                      >
                        {room.regularPrice}
                      </span>
                    )}
                    <span className="text-base sm:text-lg font-bold tracking-tight" style={{ color: 'var(--lp-text)' }}>
                      {room.price}
                    </span>
                    <span className="text-xs font-normal" style={{ color: 'var(--lp-text-muted)' }}>
                      {room.priceNote || '/mo'}
                    </span>
                    {room.hasDiscount && room.discountPercent > 0 && (
                      <span
                        className="ml-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: 'var(--lp-icon-bg)',
                          color: 'var(--lp-accent-text)',
                        }}
                      >
                        {room.discountPercent}% OFF
                      </span>
                    )}
                  </div>

                  {/* Corner Ribbon — high contrast text #0A1628 on gold */}
                  {room.popular && (
                    <span
                      className="absolute top-4 right-4 z-10 text-xs font-bold tracking-wider uppercase px-3.5 py-1.5 rounded-full shadow-sm"
                      style={{ backgroundColor: 'var(--lp-accent, #D4AF37)', color: '#0A1628' }}
                    >
                      ★ Most Popular
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-7 flex-1 flex flex-col justify-between" style={{ backgroundColor: 'var(--lp-bg-card)' }}>
                  <div>
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
                  </div>

                  {/* CTA Button — high contrast #0A1628 on gold */}
                  <Link
                    to={room.linkUrl || "/applicant/check-availability"}
                    className="flex items-center justify-center gap-2 w-full py-4 rounded-full text-sm font-medium transition-all duration-300 mt-2"
                    style={
                      room.popular
                        ? {
                            backgroundColor: 'var(--lp-accent, #D4AF37)',
                            color: '#0A1628',
                            fontWeight: '600',
                            boxShadow: '0 4px 12px rgba(212, 175, 55, 0.25)',
                          }
                        : {
                            border: '1.5px solid var(--lp-accent)',
                            color: 'var(--lp-accent-text)',
                            backgroundColor: 'transparent',
                            fontWeight: '500',
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!room.popular) {
                        e.currentTarget.style.backgroundColor = 'var(--lp-accent)';
                        e.currentTarget.style.color = '#0A1628';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!room.popular) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--lp-accent-text)';
                      }
                    }}
                  >
                    View Details
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </ScrollRevealItem>
          ))}
        </ScrollRevealStagger>

        {/* View All Link */}
        <ScrollReveal variant="fade-up" delay={0.2}>
          <div className="text-center mt-12">
            <Link
              to="/applicant/check-availability"
              className="inline-flex items-center gap-2 text-sm font-medium hover:gap-3 transition-all duration-300"
              style={{ color: 'var(--lp-accent-text)' }}
            >
              View All Available Rooms
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export default RoomInventory;

function formatTypeTitle(type) {
  if (type === "private") return "Private Room";
  if (type === "double-sharing") return "Double Sharing";
  if (type === "quadruple-sharing") return "Quadruple Sharing";
  return type ? type.replace("-", " ") : "Standard Room";
}