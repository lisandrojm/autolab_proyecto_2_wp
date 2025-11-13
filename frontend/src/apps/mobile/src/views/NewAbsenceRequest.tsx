import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1";

const NewAbsenceRequest = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    type: "vacation" as "vacation" | "compensatory" | "special_leave" | "extra",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.startDate || !formData.endDate) {
      setError("Please select start and end dates");
      return;
    }

    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      setError("End date must be after start date");
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      const tenantId = localStorage.getItem("tenantId");

      const response = await fetch(`${API_URL}/absence-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId || "",
        },
        body: JSON.stringify({
          ...formData,
          source: "mobile",
        }),
      });

      if (response.ok) {
        navigate("/mobile/absence-requests");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create request");
      }
    } catch (err) {
      console.error("Error creating request:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center">
          <button onClick={() => navigate("/mobile/absence-requests")} className="text-gray-600 mr-4">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">New Absence Request</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type of Absence</label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as "vacation" | "compensatory" | "special_leave" | "extra",
                })
              }
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="vacation">Vacation</option>
              <option value="compensatory">Compensatory</option>
              <option value="special_leave">Special Leave</option>
              <option value="extra">Extra</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              min={new Date().toISOString().split("T")[0]}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              min={formData.startDate || new Date().toISOString().split("T")[0]}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason (Optional)</label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={4}
              placeholder="Explain the reason for your absence request..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewAbsenceRequest;
