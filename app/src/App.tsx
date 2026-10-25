import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { bootstrap } from './data/hooks';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ToastProvider } from './ui/Toast';
import { TodayPage } from './pages/Today';
import { WeekPlanPage } from './pages/WeekPlan';
import { RecipesPage } from './pages/Recipes';
import { RecipeDetailPage } from './pages/RecipeDetail';
import { EditRecipePage } from './pages/EditRecipe';
import { ShoppingPage } from './pages/Shopping';
import { FridgePage } from './pages/Fridge';
import { SettingsPage } from './pages/Settings';
import { ImportReviewPage } from './pages/ImportReview';
import { ScanReviewPage } from './pages/ScanReview';
import { CookPage } from './pages/Cook';
import { MealPhotoPage } from './pages/MealPhoto';
import { CookBar } from './ui/CookBar';

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    bootstrap()
      .then(() => setReady(true))
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  if (error) {
    return (
      <div className="page">
        <div className="banner warn">打开本地数据库失败：{error}。可以试试关掉应用重新打开。</div>
      </div>
    );
  }
  if (!ready) return null;

  return (
    <HashRouter>
      <ToastProvider>
        <div className="app">
          <ErrorBoundary>
          <CookBar />
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/week" element={<WeekPlanPage />} />
            <Route path="/recipes" element={<RecipesPage />} />
            <Route path="/recipes/new" element={<EditRecipePage />} />
            <Route path="/recipes/:id" element={<RecipeDetailPage />} />
            <Route path="/recipes/:id/edit" element={<EditRecipePage />} />
            <Route path="/shopping" element={<ShoppingPage />} />
            <Route path="/fridge" element={<FridgePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/import" element={<ImportReviewPage />} />
            <Route path="/scan" element={<ScanReviewPage />} />
            <Route path="/cook" element={<CookPage />} />
            <Route path="/meal" element={<MealPhotoPage />} />
            <Route path="/meal/:id" element={<MealPhotoPage />} />
            <Route path="*" element={<TodayPage />} />
          </Routes>
          </ErrorBoundary>
        </div>
      </ToastProvider>
    </HashRouter>
  );
}
