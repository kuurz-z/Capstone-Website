/**
 * Inquiry Controllers
 */

import dayjs from "dayjs";
import { Inquiry, User } from "../models/index.js";
import { sendInquiryResponseEmail } from "../config/email.js";
import auditLogger from "../utils/auditLogger.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../middleware/errorHandler.js";

export const getInquiryStats = async (req, res, next) => {
  try {
    const matchQuery = req.branchFilter
      ? { branch: req.branchFilter, isArchived: { $ne: true } }
      : { isArchived: { $ne: true } };

    // Get counts by status
    const statusCounts = await Inquiry.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Owners can request branch-wide counts across all branches.
    let branchCounts = [];
    if (req.isOwner) {
      branchCounts = await Inquiry.aggregate([
        { $match: { isArchived: { $ne: true } } },
        { $group: { _id: "$branch", count: { $sum: 1 } } },
      ]);
    }

    // Get total and recent counts
    const total = await Inquiry.countDocuments(matchQuery);
    const sevenDaysAgo = dayjs().subtract(7, "day").toDate();
    const recentCount = await Inquiry.countDocuments({
      ...matchQuery,
      createdAt: { $gte: sevenDaysAgo },
    });

    // Format response
    const stats = {
      total,
      recentCount,
      byStatus: { pending: 0, "in-progress": 0, resolved: 0, closed: 0 },
      byBranch: {},
    };

    statusCounts.forEach((item) => {
      if (item._id) stats.byStatus[item._id] = item.count;
    });
    branchCounts.forEach((item) => {
      if (item._id) stats.byBranch[item._id] = item.count;
    });

    res.json(stats);
  } catch (error) {
    next(error);
  }
};

export const getInquiriesByBranch = async (req, res, next) => {
  try {
    const { branch } = req.params;

    const validBranches = ["gil-puyat", "guadalupe", "general"];
    if (!validBranches.includes(branch)) {
      return res.status(400).json({
        error: "Invalid branch. Must be 'gil-puyat', 'guadalupe', or 'general'",
        code: "INVALID_BRANCH",
      });
    }

    const inquiries = await Inquiry.find({ branch })
      .sort({ createdAt: -1 })
      .populate("respondedBy", "firstName lastName email")
      .select("-__v");

    res.json(inquiries);
  } catch (error) {
    next(error);
  }
};

export const getInquiries = async (req, res, next) => {
  try {
    const {
      status,
      branch,
      search,
      page = 1,
      limit = 20,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    // Build query with branch filter
    const query = { isArchived: { $ne: true } }; // Exclude archived inquiries

    if (req.branchFilter) {
      query.branch = req.branchFilter;
    } else if (branch) {
      query.branch = branch;
    }

    if (status) {
      // Map frontend "responded" to backend "resolved"
      query.status = status === "responded" ? "resolved" : status;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: regex },
        { email: regex },
        { subject: regex },
      ];
    }

    // Pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOrder = order === "asc" ? 1 : -1;
    const sortOptions = { [sort]: sortOrder };

    const [inquiries, total] = await Promise.all([
      Inquiry.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate("respondedBy", "firstName lastName email")
        .select("-__v"),
      Inquiry.countDocuments(query),
    ]);


    res.json({
      inquiries,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum * limitNum < total,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInquiryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid inquiry ID format",
        code: "INVALID_INQUIRY_ID",
      });
    }

    const query = { _id: id };
    if (req.branchFilter) {
      query.branch = req.branchFilter;
    }

    const inquiry = await Inquiry.findOne(query)
      .populate("respondedBy", "firstName lastName email")
      .select("-__v");

    if (!inquiry) {
      return res.status(404).json({
        error: "Inquiry not found or access denied",
        code: "INQUIRY_NOT_FOUND",
      });
    }

    res.json(inquiry);
  } catch (error) {
    next(error);
  }
};

export const createInquiry = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message, branch } = req.body;

    if (!name || !email || !subject || !message || !branch) {
      return res.status(400).json({
        error:
          "Missing required fields: name, email, subject, message, and branch are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Invalid email format",
        code: "INVALID_EMAIL",
      });
    }

    const validBranches = ["gil-puyat", "guadalupe", "general"];
    if (!validBranches.includes(branch)) {
      return res.status(400).json({
        error: "Invalid branch. Must be 'gil-puyat', 'guadalupe', or 'general'",
        code: "INVALID_BRANCH",
      });
    }

    const inquiry = new Inquiry({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || "",
      subject: subject.trim(),
      message: message.trim(),
      branch,
      status: "pending",
    });

    await inquiry.save();

    res.status(201).json({
      message: "Inquiry submitted successfully. We will get back to you soon!",
      inquiryId: inquiry._id,
      inquiry,
    });
  } catch (error) {
    next(error);
  }
};

export const updateInquiry = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid inquiry ID format",
        code: "INVALID_INQUIRY_ID",
      });
    }

    const query = { _id: id };
    if (req.branchFilter) {
      query.branch = req.branchFilter;
    }

    const existingInquiry = await Inquiry.findOne(query);
    if (!existingInquiry) {
      return res.status(404).json({
        error: "Inquiry not found or access denied",
        code: "INQUIRY_NOT_FOUND",
      });
    }

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.createdAt;

    // Handle response submission using the model's respond method
    if (req.body.response && req.body.response.trim()) {
      const adminUser = await User.findOne({ firebaseUid: req.user.uid });
      if (!adminUser) {
        return res.status(403).json({
          error: "Admin user not found",
          code: "ADMIN_NOT_FOUND",
        });
      }

      // Use the model's respond method which sets status to "resolved"
      await existingInquiry.respond(req.body.response.trim(), adminUser._id);

      // Remove response from updateData since it's already handled
      delete updateData.response;
      delete updateData.status; // Status is set by respond() method

      // Send email notification to customer
      const branchName =
        existingInquiry.branch === "gil-puyat" ? "Gil Puyat" : "Guadalupe";
      const emailResult = await sendInquiryResponseEmail({
        to: existingInquiry.email,
        customerName: existingInquiry.name,
        inquirySubject: existingInquiry.message,
        response: req.body.response.trim(),
        branchName: branchName,
      });

      if (emailResult.success) {
      } else {
      }

    }

    // Apply any remaining updates (excluding response which is handled above)
    if (Object.keys(updateData).length > 0) {
      if (updateData.status) {
        const validStatuses = ["pending", "in-progress", "resolved", "closed"];
        if (!validStatuses.includes(updateData.status)) {
          return res.status(400).json({
            error:
              "Invalid status. Must be: pending, in-progress, resolved, or closed",
            code: "INVALID_STATUS",
          });
        }
      }

      await Inquiry.findByIdAndUpdate(id, updateData, {
        runValidators: true,
      });
    }

    // Fetch the updated inquiry with populated fields
    const inquiry = await Inquiry.findById(id).populate(
      "respondedBy",
      "firstName lastName email",
    );

    res.json({
      message: "Inquiry updated successfully",
      inquiry,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteInquiry = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid inquiry ID format",
        code: "INVALID_INQUIRY_ID",
      });
    }

    const query = { _id: id };
    if (req.branchFilter) {
      query.branch = req.branchFilter;
    }

    const inquiry = await Inquiry.findOne(query);
    if (!inquiry) {
      return res.status(404).json({
        error: "Inquiry not found or access denied",
        code: "INQUIRY_NOT_FOUND",
      });
    }

    // Store data for audit log before archiving
    const inquiryDataBeforeArchive = inquiry.toObject();

    // Soft delete using isArchived flag
    // Find the admin user for archivedBy reference
    const adminUser = await User.findOne({ firebaseUid: req.user.uid });

    inquiry.isArchived = true;
    inquiry.archivedAt = new Date();
    inquiry.archivedBy = adminUser?._id || null;
    await inquiry.save();

    // Log inquiry deletion/archive
    await auditLogger.logDeletion(
      req,
      "inquiry",
      id,
      inquiryDataBeforeArchive,
      "Inquiry archived",
    );

    res.json({
      message: "Inquiry archived successfully",
      archivedId: id,
      branch: inquiry.branch,
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to archive inquiry");
    next(error);
  }
};
