import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface AbsenceRequest {
  _id: string;
  type: "vacation" | "compensatory" | "special_leave" | "extra";
  startDate: string;
  endDate: string;
  daysCount: number;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approverId?: {
    firstName?: string;
    lastName?: string;
  };
  rejectionReason?: string;
  postponeCount: number;
  replacementEmployeeId?: {
    firstName?: string;
    lastName?: string;
  };
  createdAt: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1";

const AbsenceRequests = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const token = localStorage.getItem("token");
      const tenantId = localStorage.getItem("tenantId");

      const response = await fetch(`${API_URL}/absence-requests/my`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId || "",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      }
    } catch (error) {
      console.error("Error loading requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this request?")) return;

    try {
      const token = localStorage.getItem("token");
      const tenantId = localStorage.getItem("tenantId");

      const response = await fetch(`${API_URL}/absence-requests/${id}/cancel`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId || "",
        },
      });

      if (response.ok) {
        loadRequests();
      }
    } catch (error) {
      console.error("Error cancelling request:", error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      vacation: "Vacation",
      compensatory: "Compensatory",
      special_leave: "Special Leave",
      extra: "Extra",
    };
    return labels[type as keyof typeof labels] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Absence Requests</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <button
          onClick={() => navigate("/mobile/absence-requests/new")}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors mb-6"
        >
          + New Request
        </button>

        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center">
              <p className="text-gray-500">No absence requests yet</p>
            </div>
          ) : (
            requests.map((request) => (
              <div key={request._id} className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm font-medium text-blue-600">{getTypeLabel(request.type)}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {new Date(request.startDate).toLocaleDateString()} -{" "}
                      {new Date(request.endDate).toLocaleDateString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">{request.daysCount} days</div>
                  </div>
                </div>

                {request.reason && (
                  <div className="mb-3">
                    <p className="text-sm text-gray-700">{request.reason}</p>
                  </div>
                )}

                {request.status === "approved" && request.replacementEmployeeId && (
                  <div className="bg-green-50 border border-green-200 rounded p-2 mb-3">
                    <p className="text-sm text-green-800">
                      Replacement: {request.replacementEmployeeId.firstName}{" "}
                      {request.replacementEmployeeId.lastName}
                    </p>
                  </div>
                )}

                {request.status === "rejected" && request.rejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                    <p className="text-sm text-red-800 font-medium">Rejection reason:</p>
                    <p className="text-sm text-red-700 mt-1">{request.rejectionReason}</p>
                  </div>
                )}

                {request.postponeCount > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-3">
                    <p className="text-sm text-yellow-800">Postponed {request.postponeCount} time(s)</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {new Date(request.createdAt).toLocaleDateString()}
                  </span>
                  {request.status === "pending" && (
                    <button
                      onClick={() => handleCancel(request._id)}
                      className="text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AbsenceRequests;
