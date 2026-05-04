import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env.development") });

const API_URL = "http://127.0.0.1:8080/api/v1";

async function testApi() {
  try {
    // 1. Login to get token
    console.log("Logging in...");
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: "admin@example.com", // Assuming this exists
      password: "admin123"
    });
    
    const token = loginRes.data.token;
    const tenantId = loginRes.data.user.tenantId;

    console.log(`Logged in. TenantId: ${tenantId}`);

    // 2. Fetch Micaela
    console.log("Fetching Micaela Sol Stoltzing...");
    const micaelaId = "6964224c888f8216c84879e2"; // From previous script
    const res = await axios.get(`${API_URL}/users/${micaelaId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-Id": tenantId
      }
    });

    console.log("API Response for Micaela:");
    console.log("Metadata projects count:", res.data.metadata?.projects?.length);
    if (res.data.metadata?.projects) {
      res.data.metadata.projects.forEach((p: any, i: number) => {
        console.log(`Project ${i}: ${p.nombre_proyecto} (ID: ${p._id}, ProjectId: ${p.projectId?._id || p.projectId})`);
      });
    }

  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testApi();
