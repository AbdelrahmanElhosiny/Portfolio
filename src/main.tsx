import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import ScrollToHashElement from "./components/ScrollToHashElement.ts";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToHashElement />
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
