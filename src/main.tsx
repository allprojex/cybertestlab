import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { fetchBranding } from "./hooks/useBranding";

fetchBranding();

createRoot(document.getElementById("root")!).render(<App />);
