/**
 * ============================================================================
 * MAINTENANCE REQUEST CONTROLLER
 * ============================================================================
 *
 * Handles maintenance requests with branch isolation and predictive analytics.
 * Supports request tracking and completion metrics for forecasting.
 *
 * ============================================================================
 */

import { MaintenanceRequest, Reservation } from "../models/index.js";
import {
  sendSuccess,
  AppError,
} from "../middleware/errorHandler.js";

/**
 * Get maintenance requests for logged-in tenant
 * @route GET /api/maintenance/my-requests?limit=50&status=pending
 * @access Private (Tenant only)
 */
export const getMyRequests = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { branch } = req.user;
    const { limit = 50, status } = req.query;

    const query = { userId, branch, isArchived: false };
    if (status) query.status = status;

    const requests = await MaintenanceRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit), 100))
      .lean();

    sendSuccess(res, {
      count: requests.length,
      requests: requests.map((r) => ({
        id: r._id,
        title: r.title,
        category: r.category,
        description: r.description,
        status: r.status,
        urgency: r.urgency,
        date: r.createdAt,
        completedAt: r.completedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all maintenance requests by branch (Admin/Staff)
 * @route GET /api/maintenance/branch?limit=50&status=pending
 * @access Private (Admin only)
 */
export const getByBranch = async (req, res, next) => {
  try {
    const { branch } = req.user;
    const { limit = 50, status, category } = req.query;

    const query = { branch, isArchived: false };
    if (status) query.status = status;
    if (category) query.category = category;

    const requests = await MaintenanceRequest.find(query)
      .sort({ urgency: -1, createdAt: 1 })
      .limit(Math.min(parseInt(limit), 100))
      .lean();

    sendSuccess(res, { count: requests.length, requests });
  } catch (error) {
    next(error);
  }
};

/**
 * Create maintenance request
 * @route POST /api/maintenance/requests
 * @access Private (Tenant only)
 */
export const createRequest = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { branch } = req.user;
    const { category, title, description, urgency } = req.body;

    if (!category || !title || !description) {
      throw new AppError(
        "Missing required fields: category, title, description",
        400,
        "MISSING_REQUIRED_FIELDS",
      );
    }

    const reservation = await Reservation.findOne({
      userId, branch, status: "checked-in",
    });

    if (!reservation) {
      throw new AppError("No active stay found", 404, "NO_ACTIVE_STAY");
    }

    const request = new MaintenanceRequest({
      reservationId: reservation._id,
      userId, branch, category, title, description,
      urgency: urgency || "medium",
    });

    await request.save();

    sendSuccess(res, {
      request: {
        id: request._id,
        title: request.title,
        category: request.category,
        status: request.status,
        date: request.createdAt,
      },
    }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get maintenance request details
 * @route GET /api/maintenance/requests/:requestId
 * @access Private
 */
export const getRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.uid;

    const request = await MaintenanceRequest.findById(requestId);
    if (!request) {
      throw new AppError("Request not found", 404, "REQUEST_NOT_FOUND");
    }

    if (
      request.userId.toString() !== userId &&
      req.user.role !== "branch_admin" &&
      req.user.role !== "owner"
    ) {
      throw new AppError("Access denied", 403, "FORBIDDEN");
    }

    sendSuccess(res, {
      id: request._id,
      title: request.title,
      category: request.category,
      description: request.description,
      status: request.status,
      urgency: request.urgency,
      date: request.createdAt,
      completedAt: request.completedAt,
      completionNote: request.completionNote,
      assignedTo: request.assignedTo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update maintenance request status (Admin/Staff)
 * @route PATCH /api/maintenance/requests/:requestId
 * @access Private (Admin only)
 */
export const updateRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { status, completionNote } = req.body;
    const staffId = req.user.uid;
    const { branch } = req.user;

    const request = await MaintenanceRequest.findById(requestId);
    if (!request || request.branch !== branch) {
      throw new AppError("Request not found", 404, "REQUEST_NOT_FOUND");
    }

    if (status === "in-progress" && !request.assignedTo) {
      await request.start(staffId);
    } else if (status === "completed") {
      await request.complete(completionNote);
    } else if (status) {
      request.status = status;
      await request.save();
    }

    sendSuccess(res, {
      request: {
        id: request._id,
        status: request.status,
        completedAt: request.completedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get completion statistics by branch (for forecasting)
 * @route GET /api/maintenance/stats/completion
 * @access Private (Admin only)
 */
export const getCompletionStats = async (req, res, next) => {
  try {
    const { branch } = req.user;
    const { days = 30 } = req.query;

    const stats = await MaintenanceRequest.getCompletionStats(
      branch,
      parseInt(days),
    );

    sendSuccess(res, { branch, period: `${days} days`, stats });
  } catch (error) {
    next(error);
  }
};

/**
 * Get issue frequency for predictive maintenance
 * @route GET /api/maintenance/stats/issue-frequency
 * @access Private (Admin only)
 */
export const getIssueFrequency = async (req, res, next) => {
  try {
    const { branch } = req.user;
    const { limit = 12, months = 6 } = req.query;

    const frequency = await MaintenanceRequest.getIssueFrequency(
      branch,
      parseInt(limit),
      parseInt(months),
    );

    sendSuccess(res, { branch, period: `${months} months`, frequency });
  } catch (error) {
    next(error);
  }
};

export default {
  getMyRequests,
  getByBranch,
  createRequest,
  getRequest,
  updateRequest,
  getCompletionStats,
  getIssueFrequency,
};
