import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./appearance.css";
import "./brand.css";
import { brand } from "./brand";
document.title = brand.appName;
document.documentElement.dataset.brand = brand.id;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
