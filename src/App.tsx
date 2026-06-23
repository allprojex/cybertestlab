import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ProctorCheck from "./components/ProctorCheck";
import TestPage from "./pages/TestPage";
import ResultsPage from "./pages/ResultsPage";
import AdminPage from "./pages/AdminPage";
import AdminDrilldown from "./pages/AdminDrilldown";
import AdminLogin from "./pages/AdminLogin";
import Login from "./pages/Login";
import AdminReset from "./pages/AdminReset";
import AdminForgot from "./pages/AdminForgot";
import ResetPassword from "./pages/ResetPassword";
import Unsubscribe from "./pages/Unsubscribe";
import NotFound from "./pages/NotFound";
import PublicLink from "./pages/PublicLink";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="admin-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/proctor-check" element={<ProctorCheck />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin-reset" element={<AdminReset />} />
            <Route path="/admin-forgot" element={<AdminForgot />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/drilldown/:type" element={<AdminDrilldown />} />
            <Route path="/t/:token" element={<PublicLink />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
