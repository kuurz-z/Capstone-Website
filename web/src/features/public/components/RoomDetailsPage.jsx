import "../styles/room-details.css";
import Footer from "../../../shared/components/Footer";
import Navbar from "../components/Navbar";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

function RoomDetailsPage({
  roomTitle,
  roomSubtitle,
  price,
  priceNote,
  minStay,
  beds,
  images,
  descriptions,
  amenities,
  otherRooms,
  onCheckAvailability,
  onReserveNow,
  branchType = "gil-puyat",
}) {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const branchName =
    branchType === "gil-puyat" ? "Gil Puyat Branch" : "Guadalupe Branch";
  const branchHomePath =
    branchType === "gil-puyat" ? "/gil-puyat" : "/guadalupe";
  const branchRoomsPath =
    branchType === "gil-puyat" ? "/gil-puyat/rooms" : "/guadalupe/rooms";

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % images.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className="room-details-page">
      {/* Navigation */}
      <Navbar
        type="branch"
        currentPage={branchType}
        onLoginClick={() => navigate("/signin")}
      />

      {/* Breadcrumb */}
      <div className="room-details-breadcrumb">
        <div className="room-details-container">
          <span
            onClick={() => navigate(branchHomePath)}
            className="breadcrumb-link"
          >
            Home
          </span>
          <span className="breadcrumb-separator">/</span>
          <span
            onClick={() => navigate(branchHomePath)}
            className="breadcrumb-link"
          >
            {branchName}
          </span>
          <span className="breadcrumb-separator">/</span>
          <span
            onClick={() => navigate(branchRoomsPath)}
            className="breadcrumb-link"
          >
            Room & Rates
          </span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">Room Details</span>
        </div>
      </div>

      {/* Header Section */}
      <section className="room-details-header">
        <div className="room-details-container">
          <div className="room-details-header-content">
            <div className="room-details-title-section">
              <h1>{roomTitle}</h1>
              <p className="room-details-subtitle">{roomSubtitle}</p>
            </div>
            <div className="room-details-price-section">
              <span className="room-details-main-price">
                ₱{price.toLocaleString()}
              </span>
              <span className="room-details-price-label">{priceNote}</span>
              <span className="room-details-price-details">
                {minStay} | {beds}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Image Carousel Section */}
      <section className="room-details-carousel-section">
        <div className="room-details-container">
          <div className="room-details-carousel-wrapper">
            <div className="room-details-carousel">
              <button
                className="room-details-carousel-btn room-details-carousel-prev"
                onClick={prevSlide}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="8"
                  height="14"
                  viewBox="0 0 8 14"
                  fill="none"
                >
                  <path
                    d="M7 13L1 7L7 1"
                    stroke="#364153"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div className="room-details-carousel-inner">
                <img
                  src={images[currentSlide]}
                  alt={`Room ${currentSlide + 1}`}
                />

                {/* Price Card Overlay */}
                <div className="room-details-price-card">
                  <span className="room-details-card-price">
                    ₱{price.toLocaleString()}
                  </span>
                  <span className="room-details-card-period">per month</span>
                  <button
                    className="room-details-btn-check-availability"
                    onClick={() => navigate("/applicant/check-availability")}
                  >
                    Check Availability
                  </button>
                </div>
              </div>

              <button
                className="room-details-carousel-btn room-details-carousel-next"
                onClick={nextSlide}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="8"
                  height="14"
                  viewBox="0 0 8 14"
                  fill="none"
                >
                  <path
                    d="M1 13L7 7L1 1"
                    stroke="#364153"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div className="room-details-carousel-indicators">
                {images.map((_, index) => (
                  <button
                    key={index}
                    className={`room-details-indicator ${index === currentSlide ? "active" : ""}`}
                    onClick={() => setCurrentSlide(index)}
                  ></button>
                ))}
              </div>
            </div>

            {/* <button className="room-details-btn-reserve" onClick={onReserveNow}>
              Reserve Now
            </button> */}
          </div>
        </div>
      </section>

      {/* Room Description Section */}
      <section className="room-details-description">
        <div className="room-details-container">
          <h2>Room Description</h2>
          {descriptions.map((desc, index) => (
            <p key={index}>{desc}</p>
          ))}
        </div>
      </section>

      {/* Services and Amenities Section */}
      <section className="room-details-amenities">
        <div className="room-details-container">
          <h2>Services and Amenities</h2>
          <div className="room-details-amenities-grid">
            {amenities.map((amenity, index) => (
              <div key={index} className="room-details-amenity-card">
                <div
                  className="room-details-amenity-icon"
                  dangerouslySetInnerHTML={{ __html: amenity.icon }}
                />
                <h4>{amenity.title}</h4>
                <p>{amenity.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Other Rooms Section */}
      {otherRooms && otherRooms.length > 0 && (
        <section className="room-details-other-rooms">
          <div className="room-details-container">
            <h2>Other Rooms</h2>
            <div className="room-details-other-rooms-grid">
              {otherRooms.map((room, index) => (
                <div key={index} className="room-details-other-room-card">
                  <div className="room-details-other-room-image">
                    <img src={room.image} alt={room.title} />
                    {room.badge && (
                      <span className="room-details-room-badge">
                        {room.badge}
                      </span>
                    )}
                  </div>
                  <div className="room-details-other-room-content">
                    <h3>{room.title}</h3>
                    <p className="room-details-other-room-price">
                      ₱{room.price.toLocaleString()}/month
                    </p>
                    <p className="room-details-other-room-details">
                      {room.minStay}
                    </p>
                    <p className="room-details-other-room-details">
                      {room.beds}
                    </p>
                    <button
                      className="room-details-btn-view-details"
                      onClick={room.onViewDetails}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}

export default RoomDetailsPage;
