import React from "react";
import ReactDOMServer from "react-dom/server";
import { ManagerPreviewCockpit } from "../src/components/queue/ManagerPreviewCockpit";
import { Lead } from "../src/components/queue/CallerCockpit";

async function runTest() {
  console.log("=================================================");
  console.log("   PINSITE GATE TEST 5.1: ROLE GUARD & UI FLOW   ");
  console.log("=================================================\n");

  const mockLeadWithoutPreview: Lead = {
    id: "lead-test-123",
    name: "Apex Orthodontics",
    phone: "+919876543210",
    website: null,
    address: "Koregaon Park, Pune",
    niche: "Dental Care",
    area: "Koregaon Park",
    status: "new",
    assigned_to: null,
    attempts_count: 1,
    next_callback_at: null,
    last_called_at: null,
    decision_maker: "Dr. Sharma",
    active_preview_slug: null,
  };

  const mockLeadWithPreview: Lead = {
    ...mockLeadWithoutPreview,
    active_preview_slug: "apex-orthodontics-pune",
  };

  // Test 1: Caller Role Isolation (Must be COMPLETELY HIDDEN)
  console.log("[Test 1] Testing Caller Role Isolation...");
  const callerHtml = ReactDOMServer.renderToString(
    React.createElement(ManagerPreviewCockpit, {
      lead: mockLeadWithoutPreview,
      userRole: "caller",
      viewingAs: "caller",
    })
  );

  if (callerHtml !== "") {
    throw new Error(`Caller isolation breached! Rendered HTML: ${callerHtml}`);
  }
  console.log("  ✅ SUCCESS: ManagerPreviewCockpit is 100% INVISIBLE to caller role (0 bytes rendered).");

  // Test 2: Manager/Admin Role Rendering (Empty Preview State)
  console.log("\n[Test 2] Testing Manager Role Rendering (No Preview Yet)...");
  const managerHtmlEmpty = ReactDOMServer.renderToString(
    React.createElement(ManagerPreviewCockpit, {
      lead: mockLeadWithoutPreview,
      userRole: "manager",
      viewingAs: "manager",
    })
  );

  if (!managerHtmlEmpty.includes("Manager Website Engine")) {
    throw new Error("Manager engine header missing from manager view.");
  }
  if (!managerHtmlEmpty.includes("Generate Custom Preview")) {
    throw new Error("Generate Custom Preview button missing from manager view.");
  }
  console.log("  ✅ SUCCESS: Manager view renders 'Generate Custom Preview' CTA.");

  // Test 3: Admin Role Rendering with Active Preview (Full Controls)
  console.log("\n[Test 3] Testing Admin Role Rendering with Active Preview...");
  const adminHtmlActive = ReactDOMServer.renderToString(
    React.createElement(ManagerPreviewCockpit, {
      lead: mockLeadWithPreview,
      userRole: "admin",
      viewingAs: "manager",
    })
  );

  if (!adminHtmlActive.includes("pinsite.pro/preview/apex-orthodontics-pune")) {
    throw new Error("Live preview URL missing from active preview card.");
  }
  if (!adminHtmlActive.includes("Copy Pitch")) {
    throw new Error("Copy Pitch button missing.");
  }
  if (!adminHtmlActive.includes("WhatsApp Lead")) {
    throw new Error("WhatsApp Lead button missing.");
  }
  if (!adminHtmlActive.includes("Theme Palette")) {
    throw new Error("Granular Theme Palette dropdown missing.");
  }
  if (!adminHtmlActive.includes("Typography")) {
    throw new Error("Granular Typography dropdown missing.");
  }
  if (!adminHtmlActive.includes("Delete Preview")) {
    throw new Error("Delete Preview button missing.");
  }
  console.log("  ✅ SUCCESS: Full Cockpit suite rendered (Live URL, Copy, WhatsApp, Theme Switcher, Font Switcher, Delete Preview).");

  console.log("\n=================================================");
  console.log("   GATE TEST 5.1: PASSED (100% SUCCESS)         ");
  console.log("=================================================");
}

runTest().catch((err) => {
  console.error("❌ Gate Test 5.1 Failed:", err);
  process.exit(1);
});
