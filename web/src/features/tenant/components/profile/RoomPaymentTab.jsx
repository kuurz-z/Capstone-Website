import React from "react";
import { Link } from "react-router-dom";
import { Bed, MapPin, Clock, Check } from "lucide-react";
import { fmtDate } from "../../../../shared/utils/formatDate";

/**
 * Room & Payment tab content for ProfilePage.
 * Displays selected room info, reservation details, and payment breakdown.
 */

const RoomPaymentTab = ({
  selectedRoom,
  activeReservation,
  activeStatusLabel,
}) => (
  <div className="max-w-5xl">
    <div className="mb-8">
      <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1F2937" }}>
        Room & Payment
      </h1>
      <p className="text-sm text-gray-500">
        Your selected room, reservation, and payment details
      </p>
    </div>

    <div className="space-y-6">
      {/* Selected Room */}
      {selectedRoom && (
        <div
          className="bg-white rounded-xl p-6 border"
          style={{ borderColor: "#E8EBF0" }}
        >
          <h3
            className="font-semibold text-lg mb-4"
            style={{ color: "#1F2937" }}
          >
            Selected Room
          </h3>
          <div
            className="p-5 rounded-lg"
            style={{ backgroundColor: "#FEF3E7" }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4
                  className="text-2xl font-bold mb-1"
                  style={{ color: "#0C375F" }}
                >
                  Room {selectedRoom.roomNumber}
                </h4>
                <p className="text-sm text-gray-600 mb-2">
                  {selectedRoom.roomType}
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {selectedRoom.location} · Floor {selectedRoom.floor}
                  </span>
                </div>
              </div>
              <div
                className="w-14 h-14 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "#E7710F" }}
              >
                <Bed className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="pt-4 border-t" style={{ borderColor: "#E7710F30" }}>
              <p className="text-xs text-gray-500 mb-1">Monthly Rent</p>
              <p className="text-3xl font-bold" style={{ color: "#E7710F" }}>
                ₱{selectedRoom.price.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reservation details */}
      {activeReservation && (
        <div
          className="bg-white rounded-xl p-6 border"
          style={{ borderColor: "#E8EBF0" }}
        >
          <h3
            className="font-semibold text-lg mb-4"
            style={{ color: "#1F2937" }}
          >
            Reservation Details
          </h3>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                Reservation Status
              </p>
              <span
                className={`inline-block px-3 py-1.5 rounded-lg text-sm font-medium ${
                  activeStatusLabel === "confirmed" ||
                  activeStatusLabel === "active"
                    ? "bg-green-100 text-green-700"
                    : activeStatusLabel === "visit-completed"
                      ? "bg-blue-100 text-blue-700"
                      : activeStatusLabel === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                }`}
              >
                {activeStatusLabel}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                Move-In Date
              </p>
              <p className="text-lg font-semibold" style={{ color: "#1F2937" }}>
                {fmtDate(activeReservation.moveInDate)}
              </p>
            </div>
          </div>

          <div className="pt-6 border-t" style={{ borderColor: "#E8EBF0" }}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold">Payment Breakdown</h4>
              <span
                className="px-3 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: "#0C375F" }}
              >
                {activeReservation.paymentStatus || "Pending"}
              </span>
            </div>
            <div className="space-y-3 mb-6">
              {activeReservation.paymentVerified ? (
                <div
                  className="flex items-center justify-between p-4 rounded-lg"
                  style={{ backgroundColor: "#F0FDF4" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Security Deposit</p>
                      <p className="text-xs text-gray-500">Paid</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-green-600">
                    ₱{(activeReservation.totalAmount || 0).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div
                  className="flex items-center justify-between p-4 rounded-lg border"
                  style={{ borderColor: "#E8EBF0" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Payment Due</p>
                      <p className="text-xs text-gray-500">Pending</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold" style={{ color: "#E7710F" }}>
                    ₱{(activeReservation.totalAmount || 0).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
            {!activeReservation.paymentVerified && (
              <button
                className="w-full py-3 text-sm font-medium rounded-lg text-white transition-colors"
                style={{ backgroundColor: "#E7710F" }}
              >
                Pay Deposit - ₱
                {(activeReservation.totalAmount || 0).toLocaleString()}
              </button>
            )}
          </div>
        </div>
      )}

      {/* No active reservation */}
      {!activeReservation && (
        <div
          className="bg-white rounded-xl p-8 border text-center"
          style={{ borderColor: "#E8EBF0" }}
        >
          <Bed className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            No Active Reservation
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Start browsing rooms to make a reservation
          </p>
          <Link to="/tenant/check-availability">
            <button
              className="px-6 py-3 rounded-lg font-medium text-white"
              style={{ backgroundColor: "#E7710F" }}
            >
              Browse Available Rooms
            </button>
          </Link>
        </div>
      )}
    </div>
  </div>
);

export default RoomPaymentTab;
