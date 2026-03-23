import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App as AntdApp, ConfigProvider, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";

import "antd/dist/reset.css";
import "./index.css";

const LoginPage = React.lazy(async () => import("./platform/pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const DashboardPage = React.lazy(async () =>
  import("./platform/pages/DashboardPage").then((module) => ({ default: module.DashboardPage }))
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#1677ff", borderRadius: 10 } }}>
      <AntdApp>
        <BrowserRouter>
          <React.Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><Spin size="large" /></div>}>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/dashboard/*" element={<DashboardPage />} />
            </Routes>
          </React.Suspense>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
