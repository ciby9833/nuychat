import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<App title="Platform Admin" subtitle="平台管理台基础骨架" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

