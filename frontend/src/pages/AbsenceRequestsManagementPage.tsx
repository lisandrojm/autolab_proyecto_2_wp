import { useState, useEffect } from "react";
import { absenceRequestsAPI, AbsenceRequest } from "../api/absenceRequests";
import { areasAPI, Area } from "../api/areas";
import { usersAPI } from "../api/users";
import Swal from "sweetalert2";

interface User {
  _id: string;
  firstName?: string;
  lastName?: string;
  email: string;
}

const AbsenceRequestsManagementPage = () => {
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("pending");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");

  useEffect(() => {
    loadData();
  }, [selectedStatus, selectedArea, selectedType]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [requestsRes, areasRes, usersRes] = await Promise.all([
        absenceRequestsAPI.getAllRequests({
          status: selectedStatus || undefined,
          areaId: selectedArea || undefined,
          type: selectedType || undefined,
        }),
        areasAPI.getAreas(),
        usersAPI.getUsers(),
      ]);
      setRequests(requestsRes.data);
      setAreas(areasRes.data);
      setEmployees(usersRes.data);
    } catch (error) {
      console.error("Error loading data:", error);
      Swal.fire("Error", "Failed to load absence requests", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: AbsenceRequest) => {
    const { value: formValues } = await Swal.fire({
      title: "Approve Request",
      html: `
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Replacement Employee (Optional)</label>
            <select id="replacement" class="w-full px-3 py-2 border rounded-lg">
              <option value="">No replacement</option>
              ${employees
                .filter((emp) => emp._id !== request.employeeId._id)
                .map((emp) => `<option value="${emp._id}">${emp.firstName} ${emp.lastName}</option>`)
                .join("")}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Notes (Optional)</label>
            <textarea id="notes" class="w-full px-3 py-2 border rounded-lg" rows="3"></textarea>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Approve",
      confirmButtonColor: "#10b981",
      preConfirm: () => {
        const replacement = (document.getElementById("replacement") as HTMLSelectElement).value;
        const notes = (document.getElementById("notes") as HTMLTextAreaElement).value;
        return { replacement, notes };
      },
    });

    if (formValues) {
      try {
        await absenceRequestsAPI.approveRequest(request._id, {
          replacementEmployeeId: formValues.replacement || undefined,
          notes: formValues.notes || undefined,
        });
        Swal.fire("Approved!", "The request has been approved.", "success");
        loadData();
      } catch (error) {
        console.error("Error approving request:", error);
        Swal.fire("Error", "Failed to approve request", "error");
      }
    }
  };

  const handleReject = async (request: AbsenceRequest) => {
    const { value: reason } = await Swal.fire({
      title: "Reject Request",
      input: "textarea",
      inputLabel: "Rejection Reason",
      inputPlaceholder: "Enter the reason for rejection...",
      inputValidator: (value) => {
        if (!value) return "Please provide a reason";
        return null;
      },
      showCancelButton: true,
      confirmButtonText: "Reject",
      confirmButtonColor: "#ef4444",
    });

    if (reason) {
      try {
        await absenceRequestsAPI.rejectRequest(request._id, { rejectionReason: reason });
        Swal.fire("Rejected", "The request has been rejected.", "success");
        loadData();
      } catch (error) {
        console.error("Error rejecting request:", error);
        Swal.fire("Error", "Failed to reject request", "error");
      }
    }
  };

  const handlePostpone = async (request: AbsenceRequest) => {
    if (request.postponeCount >= 3) {
      Swal.fire("Cannot Postpone", "Maximum postpone limit reached (3)", "warning");
      return;
    }

    const result = await Swal.fire({
      title: "Postpone Request",
      text: `This will postpone the request (${request.postponeCount + 1}/3)`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Postpone",
      confirmButtonColor: "#f59e0b",
    });

    if (result.isConfirmed) {
      try {
        await absenceRequestsAPI.postponeRequest(request._id);
        Swal.fire("Postponed", "The request has been postponed.", "success");
        loadData();
      } catch (error) {
        console.error("Error postponing request:", error);
        Swal.fire("Error", "Failed to postpone request", "error");
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors]}`}>
        {status}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const labels = {
      vacation: "Vacation",
      compensatory: "Compensatory",
      special_leave: "Special Leave",
      extra: "Extra",
    };
    return (
      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
        {labels[type as keyof typeof labels]}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Absence Requests Management</h1>
        <p className="text-gray-600 mt-2">Manage and approve employee absence requests</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Area</label>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Areas</option>
              {areas.map((area) => (
                <option key={area._id} value={area._id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="vacation">Vacation</option>
              <option value="compensatory">Compensatory</option>
              <option value="special_leave">Special Leave</option>
              <option value="extra">Extra</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {requests.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No absence requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dates
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Days
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Area
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Postponed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((request) => (
                  <tr key={request._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {request.employeeId.firstName} {request.employeeId.lastName}
                      </div>
                      <div className="text-sm text-gray-500">{request.employeeId.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getTypeBadge(request.type)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{new Date(request.startDate).toLocaleDateString()}</div>
                      <div className="text-gray-500">to {new Date(request.endDate).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{request.daysCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {request.areaId?.name || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(request.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {request.postponeCount > 0 ? `${request.postponeCount}/3` : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {request.status === "pending" && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleApprove(request)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(request)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Reject
                          </button>
                          {request.postponeCount < 3 && (
                            <button
                              onClick={() => handlePostpone(request)}
                              className="text-yellow-600 hover:text-yellow-900"
                            >
                              Postpone
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AbsenceRequestsManagementPage;
