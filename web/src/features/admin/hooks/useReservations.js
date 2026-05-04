/**
 * =============================================================================
 * USE RESERVATIONS HOOK
 * =============================================================================
 *
 * Custom hook for managing reservation data in admin dashboard.
 * Provides CRUD operations with loading and error states.
 *
 * Usage:
 *   const { reservations, loading, error, fetchReservations } = useReservations();
 *
 * Features:
 * - Fetch reservations (filtered by admin's branch automatically)
 * - Update reservation status
 * - Cancel reservations
 * - Automatic loading and error state management
 * =============================================================================
 */

import { useState, useCallback } from "react";
import { reservationApi } from "../../../shared/api/apiClient";

/**
 * Hook for managing reservation data
 * @returns {Object} Reservation state and methods
 */
export const useReservations = () => {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch all reservations (filtered by admin's branch on backend)
   */
  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await reservationApi.getAll();
      setReservations(response || []);
      return response;
    } catch (err) {
      setError(err.message || "Failed to fetch reservations");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update a reservation's status
   * @param {string} reservationId - ID of reservation to update
   * @param {Object} data - Update data (status, notes, etc.)
   */
  const updateReservation = useCallback(async (reservationId, data) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await reservationApi.update(reservationId, data);
      setReservations((prev) =>
        prev.map((res) => (res._id === reservationId ? updated : res)),
      );
      return updated;
    } catch (err) {
      setError(err.message || "Failed to update reservation");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Cancel a reservation
   * @param {string} reservationId - ID of reservation to cancel
   */
  const cancelReservation = useCallback(async (reservationId) => {
    setLoading(true);
    setError(null);
    try {
      await reservationApi.cancel(reservationId);
      setReservations((prev) =>
        prev.map((res) =>
          res._id === reservationId ? { ...res, status: "cancelled" } : res,
        ),
      );
    } catch (err) {
      setError(err.message || "Failed to cancel reservation");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    reservations,
    loading,
    error,
    setReservations,
    fetchReservations,
    updateReservation,
    cancelReservation,
  };
};
