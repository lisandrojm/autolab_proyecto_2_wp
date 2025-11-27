import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useAuthStore } from "../stores/authStore";
import { BarChart3, TrendingUp, TrendingDown, Eye, Heart, Share, MessageCircle, DollarSign, Target, Users } from "lucide-react";

interface AnalyticsData {
  overview: {
    totalImpressions: number;
    totalEngagement: number;
    totalClicks: number;
    totalSpent: number;
    avgCTR: number;
    avgCPM: number;
  };
  trends: {
    period: string;
    impressions: number;
    engagement: number;
    clicks: number;
    spent: number;
  }[];
  topCampaigns: {
    id: string;
    name: string;
    impressions: number;
    engagement: number;
    roi: number;
  }[];
}

export const AnalyticsPage: React.FC = () => {
  const { t } = useTranslation();
  const { token, tenantId } = useAuthStore();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      // Simulated data for demo
      const mockData: AnalyticsData = {
        overview: {
          totalImpressions: 125430,
          totalEngagement: 8920,
          totalClicks: 2340,
          totalSpent: 4250,
          avgCTR: 1.87,
          avgCPM: 3.39,
        },
        trends: [
          { period: "2024-01-01", impressions: 15000, engagement: 1200, clicks: 320, spent: 450 },
          { period: "2024-01-02", impressions: 18000, engagement: 1450, clicks: 380, spent: 520 },
          { period: "2024-01-03", impressions: 22000, engagement: 1680, clicks: 420, spent: 610 },
          { period: "2024-01-04", impressions: 19500, engagement: 1520, clicks: 390, spent: 580 },
          { period: "2024-01-05", impressions: 25000, engagement: 1890, clicks: 480, spent: 720 },
          { period: "2024-01-06", impressions: 21000, engagement: 1620, clicks: 410, spent: 630 },
          { period: "2024-01-07", impressions: 24930, engagement: 1758, clicks: 450, spent: 730 },
        ],
        topCampaigns: [
          { id: "1", name: "Campaña Verano 2024", impressions: 45000, engagement: 3200, roi: 285 },
          { id: "2", name: "Black Friday Promo", impressions: 38000, engagement: 2800, roi: 320 },
          { id: "3", name: "Lanzamiento Producto", impressions: 32000, engagement: 2100, roi: 195 },
        ],
      };

      setAnalytics(mockData);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t("nav.analytics")}</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Analiza el rendimiento de tus campañas y contenido</p>
              </div>
              <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="90d">Últimos 90 días</option>
                <option value="1y">Último año</option>
              </select>
            </div>
          </div>

          {analytics && (
            <>
              {/* Overview Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Impresiones</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(analytics.overview.totalImpressions)}</p>
                  <div className="flex items-center space-x-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-blue-500" />
                    <span className="text-xs text-blue-600 dark:text-blue-400">+12.5%</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Heart className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Engagement</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(analytics.overview.totalEngagement)}</p>
                  <div className="flex items-center space-x-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-blue-500" />
                    <span className="text-xs text-blue-600 dark:text-blue-400">+8.3%</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <MessageCircle className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Clicks</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(analytics.overview.totalClicks)}</p>
                  <div className="flex items-center space-x-1 mt-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-600 dark:text-red-400">-2.1%</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Gastado</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(analytics.overview.totalSpent)}</p>
                  <div className="flex items-center space-x-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-blue-500" />
                    <span className="text-xs text-blue-600 dark:text-blue-400">+15.2%</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">CTR</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.overview.avgCTR}%</p>
                  <div className="flex items-center space-x-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-blue-500" />
                    <span className="text-xs text-blue-600 dark:text-blue-400">+0.3%</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">CPM</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(analytics.overview.avgCPM)}</p>
                  <div className="flex items-center space-x-1 mt-1">
                    <TrendingDown className="h-3 w-3 text-blue-500" />
                    <span className="text-xs text-blue-600 dark:text-blue-400">-5.7%</span>
                  </div>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                {/* Trends Chart */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tendencias de Rendimiento</h3>
                  <div className="h-64 flex items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 dark:text-gray-400">Gráfico de tendencias</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Integración con Chart.js pendiente</p>
                    </div>
                  </div>
                </div>

                {/* Top Campaigns */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Mejores Campañas</h3>
                  <div className="space-y-4">
                    {analytics.topCampaigns.map((campaign, index) => (
                      <div key={campaign.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center justify-center w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full">
                            <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{index + 1}</span>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white text-sm">{campaign.name}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-500">{formatNumber(campaign.impressions)} impresiones</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">ROI: {campaign.roi}%</p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">{formatNumber(campaign.engagement)} engagement</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Métricas de Rendimiento por Plataforma</h3>
                <div className="overflow-x-auto rounded border dark:border-slate-800">
                  <table className="w-full dark:bg-slate-800/80">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Plataforma</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Impresiones</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Engagement</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">CTR</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Gasto</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { platform: "Facebook", impressions: 45000, engagement: 3200, ctr: 2.1, spent: 1200, roi: 285 },
                        { platform: "Instagram", impressions: 38000, engagement: 4100, ctr: 3.2, spent: 980, roi: 320 },
                        { platform: "LinkedIn", impressions: 22000, engagement: 890, ctr: 1.8, spent: 750, roi: 195 },
                        { platform: "TikTok", impressions: 20430, engagement: 2730, ctr: 4.1, spent: 520, roi: 410 },
                      ].map((row) => (
                        <tr key={row.platform} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{row.platform}</td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{formatNumber(row.impressions)}</td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{formatNumber(row.engagement)}</td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{row.ctr}%</td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{formatCurrency(row.spent)}</td>
                          <td className="py-3 px-4">
                            <span className={`font-medium ${row.roi > 200 ? "text-blue-600 dark:text-blue-400" : "text-blue-600 dark:text-blue-400"}`}>{row.roi}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
