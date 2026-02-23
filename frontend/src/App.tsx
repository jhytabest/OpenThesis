import Dashboard01Page from "@/components/dashboard-01/page";
import { Login01Page } from "@/components/login-01-page";
import { Sidebar01Page } from "@/components/sidebar-01-page";

export default function App() {
  const path = window.location.pathname;

  if (path === "/login") {
    return <Login01Page />;
  }

  if (path === "/sidebar") {
    return <Sidebar01Page />;
  }

  return <Dashboard01Page />;
}
