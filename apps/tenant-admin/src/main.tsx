import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { App as AntdApp, ConfigProvider } from "antd";
import type { Locale } from "antd/lib/locale";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import localeData from "dayjs/plugin/localeData";
import weekOfYear from "dayjs/plugin/weekOfYear";
import weekYear from "dayjs/plugin/weekYear";
import weekday from "dayjs/plugin/weekday";

import "./i18n"; // initialise i18next before rendering
import i18n, { getAntdLocale } from "./i18n";
import { DashboardPage, LoginPage } from "./App";
import "antd/dist/reset.css";
import "./index.css";

dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(weekOfYear);
dayjs.extend(weekYear);

function Root() {
  const [antdLocale, setAntdLocale] = useState<Locale>(getAntdLocale());

  useEffect(() => {
    const handler = () => setAntdLocale(getAntdLocale());
    i18n.on("languageChanged", handler);
    return () => { i18n.off("languageChanged", handler); };
  }, []);

  return (
    <ConfigProvider locale={antdLocale} theme={{ token: { colorPrimary: "#1677ff", borderRadius: 10 } }}>
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/dashboard" element={<Navigate to="/dashboard/overview" replace />} />
            <Route path="/dashboard/:tab" element={<DashboardPage />} />
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
