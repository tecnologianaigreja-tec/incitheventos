import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import EventsListPage from "./pages/EventsListPage";
import LandingPage from "./pages/LandingPage";
import RegistrationPage from "./pages/RegistrationPage";
import OrderStatusPage from "./pages/OrderStatusPage";
import QRCodePage from "./pages/QRCodePage";
import CertificateValidationPage from "./pages/CertificateValidationPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminEvents from "./pages/admin/AdminEvents";
import AdminEventEditor from "./pages/admin/AdminEventEditor";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminRegistrations from "./pages/admin/AdminRegistrations";
import AdminCheckin from "./pages/admin/AdminCheckin";
import AdminCertificates from "./pages/admin/AdminCertificates";
import AdminExport from "./pages/admin/AdminExport";
import AdminSiteSettings from "./pages/admin/AdminSiteSettings";
import AdminLabelEditor from "./pages/admin/AdminLabelEditor";
import CheckinLoginPage from "./pages/CheckinLoginPage";
import CheckinOperatorPage from "./pages/CheckinOperatorPage";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<EventsListPage />} />
          <Route path="/evento/:slug" element={<LandingPage />} />
          <Route path="/evento/:slug/inscricao" element={<RegistrationPage />} />
          <Route path="/pedido/:orderCode" element={<OrderStatusPage />} />
          <Route path="/inscricao/:registrationCode/qrcode" element={<QRCodePage />} />
          <Route path="/certificado/validar" element={<CertificateValidationPage />} />
          <Route path="/certificado/validar/:code" element={<CertificateValidationPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/checkin/login" element={<CheckinLoginPage />} />
          <Route path="/checkin" element={<CheckinOperatorPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="eventos" element={<AdminEvents />} />
            <Route path="eventos/novo" element={<AdminEventEditor />} />
            <Route path="eventos/:eventId" element={<AdminEventEditor />} />
            <Route path="pedidos" element={<AdminOrders />} />
            <Route path="inscritos" element={<AdminRegistrations />} />
            <Route path="checkin" element={<AdminCheckin />} />
            <Route path="certificados" element={<AdminCertificates />} />
            <Route path="exportacao" element={<AdminExport />} />
            <Route path="configuracoes" element={<AdminSiteSettings />} />
            <Route path="etiquetas" element={<AdminLabelEditor />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
