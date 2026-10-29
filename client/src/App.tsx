import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import Transactions, { TransactionDetails } from "@/pages/Transactions";
import LinkDetection from "@/pages/LinkDetection";
import EmailDetection from "@/pages/EmailDetection";
import { Alerts, Audit, Experiments, Models, Monitoring, Pipeline, Settings } from "@/pages/Operations";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return <DashboardLayout><Switch>
    <Route path="/" component={Home} />
    <Route path="/transactions" component={Transactions} />
    <Route path="/transactions/:id" component={TransactionDetails} />
    <Route path="/link-detection" component={LinkDetection} />
    <Route path="/email-detection" component={EmailDetection} />
    <Route path="/pipeline" component={Pipeline} />
    <Route path="/monitoring" component={Monitoring} />
    <Route path="/models" component={Models} />
    <Route path="/experiments" component={Experiments} />
    <Route path="/alerts" component={Alerts} />
    <Route path="/audit" component={Audit} />
    <Route path="/settings" component={Settings} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch></DashboardLayout>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
