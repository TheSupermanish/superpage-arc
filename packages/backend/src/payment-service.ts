import express from "express";
import cors from "cors";
import { configDotenv } from "dotenv";
import { handleMCPPaymentRequest } from "./api/mcp-payment-handler";

// Load environment variables
configDotenv();

const app = express();
const PORT = process.env.PAYMENT_SERVER_PORT || 3337;

// CORS Configuration
const corsOptions = {
    origin: [
      "http://localhost:1337",
      "http://localhost:2337",
      "http://localhost:3337",
      "http://127.0.0.1:1337",
      "http://127.0.0.1:2337",
      "http://127.0.0.1:3337",
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
  
  // Middleware
  app.use(cors(corsOptions as any));
  app.use(express.json());
  
  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "x402-payment-server" });
  });
  
  // MCP Payment Server
  app.post("/mcp", handleMCPPaymentRequest);
  
  // Start server
  app.listen(PORT, () => {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🚀 x402 Payment Server running on port ${PORT}`);
    console.log(`📍 Endpoints:`);
    console.log(`   - Health: http://localhost:${PORT}/health`);
    console.log(`   - MCP: http://localhost:${PORT}/mcp`);
    console.log(`${"=".repeat(80)}\n`);
  });