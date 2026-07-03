import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import Generator from "@/pages/Generator";
import Images from "@/pages/Images";
import VideoEditor from "@/pages/VideoEditor";
import Experience from "@/pages/Experience";
import Trending from "@/pages/Trending";
import HistoryPage from "@/pages/HistoryPage";
import Admin from "@/pages/Admin";
import Leads from "@/pages/Leads";
import Funnel from "@/pages/Funnel";
import PublicQuiz from "@/pages/PublicQuiz";
import NotFound from "@/pages/not-found";
import { useAuth } from "@workspace/replit-auth-web";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function LoginScreen() {
  const { login } = useAuth();
  return (
    <div className="flex min-h-screen bg-background items-center justify-center">
      <div className="text-center space-y-6 max-w-sm w-full px-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">VibeManager</h1>
          <p className="text-sm text-muted-foreground mt-1">Conteúdo Viral com IA</p>
        </div>
        <button
          onClick={login}
          className="w-full py-3 px-6 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
        >
          Entrar
        </button>
      </div>
    </div>
  );
}

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-16 md:ml-56 min-h-screen">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/generator" component={Generator} />
          <Route path="/images" component={Images} />
          <Route path="/video" component={VideoEditor} />
          <Route path="/experience" component={Experience} />
          <Route path="/trending" component={Trending} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/leads" component={Leads} />
          <Route path="/funil" component={Funnel} />
          <Route path="/admin" component={Admin} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function AuthGate() {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAuthenticated) return <LoginScreen />;
  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            {/* Página pública do quiz — não exige login (é o que o paciente acessa) */}
            <Route path="/q/:slug" component={PublicQuiz} />
            {/* Todo o resto fica atrás da autenticação */}
            <Route>
              <AuthGate />
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
