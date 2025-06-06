import { AiSalesInsightsForm } from '@/components/sales/ai-sales-insights-form';

export default function AiInsightsPage() {
  return (
    <div className="space-y-6">
       <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">AI Sales Insights Tool</h1>
      </div>
      <p className="text-muted-foreground">
        Use this tool to analyze your sales data and uncover valuable trends, identify top-performing and underperforming products, and receive actionable recommendations.
      </p>
      <AiSalesInsightsForm />
    </div>
  );
}
