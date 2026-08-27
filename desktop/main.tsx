import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import StepConverter from "../app/step-converter";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Desktop root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <StepConverter />
  </StrictMode>,
);
