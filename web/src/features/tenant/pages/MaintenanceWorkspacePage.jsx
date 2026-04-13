import React, { useState } from "react";
import { ClipboardList, Plus, Wrench } from "lucide-react";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import {
  useCreateMaintenanceRequest,
  useMyMaintenanceRequests,
} from "../../../shared/hooks/queries/useMaintenance";
import MaintenancePageSkeleton from "../components/maintenance/MaintenancePageSkeleton";
import "../styles/tenant-common.css";

export default function MaintenanceWorkspacePage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    category: "other",
    title: "",
    description: "",
  });

  const { data: requestsData, isLoading } = useMyMaintenanceRequests(50);
  const createMutation = useCreateMaintenanceRequest();
  const requests = requestsData?.requests || [];

  const getStatusClass = (status) => {
    if (status === "Completed") return "badge-success";
    if (status === "In Progress") return "badge-info";
    return "badge-warning";
  };

  const handleSubmitRequest = async (event) => {
    event.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      setFormData({ category: "other", title: "", description: "" });
      setShowForm(false);
    } catch (error) {
      console.error("Failed to submit maintenance request:", error);
    }
  };

  if (isLoading) {
    return (
      <TenantLayout>
        <MaintenancePageSkeleton />
      </TenantLayout>
    );
  }

  return (
    <TenantLayout>
      <div className="tenant-page">
        <div className="page-header">
          <div>
            <h1>
              <Wrench size={22} /> Maintenance Requests
            </h1>
            <p>
              Submit issues, monitor progress, and keep a record of completed
              work.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((value) => !value)}
          >
            <Plus size={16} />
            {showForm ? "Close Form" : "New Request"}
          </button>
        </div>

        {showForm ? (
          <div className="section-card">
            <h2>Submit Maintenance Request</h2>
            <form className="maintenance-form" onSubmit={handleSubmitRequest}>
              <div className="form-group">
                <label htmlFor="maintenance-category">Category</label>
                <select
                  id="maintenance-category"
                  className="form-control"
                  value={formData.category}
                  onChange={(event) =>
                    setFormData({ ...formData, category: event.target.value })
                  }
                  required
                >
                  <option value="plumbing">Plumbing</option>
                  <option value="electrical">Electrical</option>
                  <option value="hardware">Hardware</option>
                  <option value="appliance">Appliance</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="maintenance-title">Title</label>
                <input
                  id="maintenance-title"
                  type="text"
                  className="form-control"
                  placeholder="Brief description"
                  value={formData.title}
                  onChange={(event) =>
                    setFormData({ ...formData, title: event.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="maintenance-description">Description</label>
                <textarea
                  id="maintenance-description"
                  className="form-control"
                  rows="4"
                  placeholder="Detailed description of the issue"
                  value={formData.description}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      description: event.target.value,
                    })
                  }
                  required
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="section-card">
          <h2>Request History</h2>
          <div className="maintenance-list">
            {requests.length === 0 ? (
              <div className="maintenance-empty-state">
                <ClipboardList size={30} />
                <div>
                  <strong>No maintenance requests yet</strong>
                  <p>
                    Use the new request button when you need help with repairs,
                    utilities, or room concerns.
                  </p>
                </div>
              </div>
            ) : (
              requests.map((request) => (
                <div
                  key={request.id || request._id}
                  className="maintenance-item"
                >
                  <div className="maintenance-info">
                    <h3>{request.title}</h3>
                    <p>
                      {request.category} |{" "}
                      {new Date(
                        request.date || request.createdAt || Date.now(),
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`badge ${getStatusClass(request.status)}`}>
                    {request.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </TenantLayout>
  );
}
