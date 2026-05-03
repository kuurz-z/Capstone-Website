/**
 * =============================================================================
 * USE TENANTS HOOK
 * =============================================================================
 *
 * Custom hook for managing tenant/user data in admin dashboard.
 * Provides CRUD operations with loading and error states.
 *
 * Usage:
 *   const { tenants, loading, error, fetchTenants } = useTenants();
 *
 * Features:
 * - Fetch tenants (filtered by admin's branch automatically)
 * - Update tenant information
 * - Get tenant statistics
 * - Automatic loading and error state management
 * =============================================================================
 */

import { useState, useCallback } from "react";
import { userApi } from "../../../shared/api/apiClient";

/**
 * Hook for managing tenant data
 * @returns {Object} Tenant state and methods
 */
export const useTenants = () => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  /**
   * Fetch all tenants (filtered by admin's branch on backend)
   * @param {Object} filters - Optional filter parameters
   */
  const fetchTenants = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await userApi.getAll(filters);
      setTenants(response || []);
      return response;
    } catch (err) {
      setError(err.message || "Failed to fetch tenants");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch tenant statistics for dashboard
   */
  const fetchStats = useCallback(async () => {
    try {
      const response = await userApi.getStats();
      setStats(response);
      return response;
    } catch (err) {
      console.error("Failed to fetch tenant stats:", err);
    }
  }, []);

  /**
   * Update a tenant's information
   * @param {string} tenantId - ID of tenant to update
   * @param {Object} data - Update data
   */
  const updateTenant = useCallback(async (tenantId, data) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await userApi.update(tenantId, data);
      setTenants((prev) =>
        prev.map((tenant) => (tenant._id === tenantId ? updated : tenant)),
      );
      return updated;
    } catch (err) {
      setError(err.message || "Failed to update tenant");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get a single tenant by ID
   * @param {string} tenantId - ID of tenant
   */
  const getTenantById = useCallback(async (tenantId) => {
    setLoading(true);
    setError(null);
    try {
      const tenant = await userApi.getById(tenantId);
      return tenant;
    } catch (err) {
      setError(err.message || "Failed to fetch tenant");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    tenants,
    loading,
    error,
    stats,
    setTenants,
    fetchTenants,
    fetchStats,
    updateTenant,
    getTenantById,
  };
};
