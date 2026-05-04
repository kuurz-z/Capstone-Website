/**
 * =============================================================================
 * USE INQUIRIES HOOK
 * =============================================================================
 *
 * Custom hook for managing inquiry data in admin dashboard.
 * Provides CRUD operations with loading and error states.
 *
 * Usage:
 *   const { inquiries, loading, error, fetchInquiries, updateInquiry } = useInquiries();
 *
 * Features:
 * - Fetch inquiries with optional filters
 * - Update inquiry status
 * - Archive/restore inquiries
 * - Automatic loading and error state management
 * =============================================================================
 */

import { useState, useCallback } from "react";
import { inquiryApi } from "../../../shared/api/apiClient";

/**
 * Hook for managing inquiry data
 * @returns {Object} Inquiry state and methods
 */
export const useInquiries = () => {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch all inquiries with optional filters
   * @param {Object} filters - Optional filter parameters (status, branch, etc.)
   */
  const fetchInquiries = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await inquiryApi.getAll(filters);
      setInquiries(response.inquiries || response);
      return response;
    } catch (err) {
      setError(err.message || "Failed to fetch inquiries");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update an inquiry (status, response, etc.)
   * @param {string} inquiryId - ID of inquiry to update
   * @param {Object} data - Update data
   */
  const updateInquiry = useCallback(async (inquiryId, data) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await inquiryApi.update(inquiryId, data);
      setInquiries((prev) =>
        prev.map((inq) => (inq._id === inquiryId ? updated : inq)),
      );
      return updated;
    } catch (err) {
      setError(err.message || "Failed to update inquiry");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Archive an inquiry (soft delete)
   * @param {string} inquiryId - ID of inquiry to archive
   */
  const archiveInquiry = useCallback(async (inquiryId) => {
    setLoading(true);
    setError(null);
    try {
      await inquiryApi.archive(inquiryId);
      setInquiries((prev) => prev.filter((inq) => inq._id !== inquiryId));
    } catch (err) {
      setError(err.message || "Failed to archive inquiry");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    inquiries,
    loading,
    error,
    setInquiries,
    fetchInquiries,
    updateInquiry,
    archiveInquiry,
  };
};
