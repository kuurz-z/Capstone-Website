/*
import { ClipboardList, Plus, Wrench } from "lucide-react";
import TenantLayout from "../../../shared/layouts/TenantLayout";
import { useMyMaintenanceRequests, useCreateMaintenanceRequest } from "../../../shared/hooks/queries/useMaintenance";
import MaintenancePageSkeleton from "../components/maintenance/MaintenancePageSkeleton";
import "../styles/tenant-common.css";

const MaintenancePage = () => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    category: "other",
    title: "",
    description: "",
  });

  const { data: requestsData, isLoading: loading } = useMyMaintenanceRequests(50);
  const requests = requestsData?.requests || [];
  const createMutation = useCreateMaintenanceRequest();

  if (loading) {
    return (
      <TenantLayout>
        <MaintenancePageSkeleton />
      </TenantLayout>
    );
  }

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      setFormData({ category: "other", title: "", description: "" });
      setShowForm(false);
    } catch (error) {
      console.error("Failed to submit maintenance request:", error);
    }
  };

  const getStatusClass = (status) => {
    return status === "Completed"
      ? "badge-success"
      : status === "In Progress"
        ? "badge-info"
        : "badge-warning";
  };

  return (
    <TenantLayout>
      <div className="tenant-page">
        <div className="page-header">
          <div>
            <h1>
              <Wrench size={22} /> Maintenance Requests
            </h1>
            <p>Submit issues, monitor progress, and keep a record of completed work.</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus size={16} /> {showForm ? "Close Form" : "New Request"}
          </button>
        </div>

        {showForm && (
          <div className="section-card">
            <h2>Submit Maintenance Request</h2>
            <form className="maintenance-form" onSubmit={handleSubmitRequest}>
              <div className="form-group">
                <label>Category</label>
                <select
                  className="form-control"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
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
                <label>Title</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Brief description"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  className="form-control"
                  rows="4"
                  placeholder="Detailed description of the issue"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                ></textarea>
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
        )}

        <div className="section-card">
          <h2>Request History</h2>
          <div className="maintenance-list">
            {requests.length === 0 ? (
              <div className="maintenance-empty-state">
                <ClipboardList size={30} />
                <div>
                  <strong>No maintenance requests yet</strong>
                    {request.category} •{" "}
                    Use the new request button when you need help with repairs,
                  </p>
                </div>
                <span className={`badge ${getStatusClass(request.status)}`}>
                  {request.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TenantLayout>
  );
};

*/
export { default } from "./MaintenanceWorkspacePage";
