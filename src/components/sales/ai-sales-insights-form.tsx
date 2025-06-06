'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getSalesInsights, type SalesInsightsOutput } from '@/ai/flows/sales-insights';
import { Loader2, Lightbulb, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { mockSales as mockSalesData, generateCsvFromSales } from '@/lib/mock-data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function AiSalesInsightsForm() {
  const [salesDataCsv, setSalesDataCsv] = useState('');
  const [insights, setInsights] = useState<SalesInsightsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleLoadMockData = () => {
    const csv = generateCsvFromSales(mockSalesData);
    setSalesDataCsv(csv);
    toast({ title: "Mock Data Loaded", description: "Sample CSV sales data loaded into the textarea." });
  };

  const handleSubmit = async () => {
    if (!salesDataCsv.trim()) {
      setError('Sales data (CSV format) cannot be empty.');
      toast({ variant: "destructive", title: "Error", description: "Sales data cannot be empty." });
      return;
    }
    setIsLoading(true);
    setError(null);
    setInsights(null);
    try {
      // Ensure getSalesInsights is correctly set up to be called from the client
      // (Next.js handles Server Actions automatically)
      const result = await getSalesInsights({ salesData: salesDataCsv });
      setInsights(result);
      toast({ title: "Insights Generated", description: "AI sales insights have been successfully generated." });
    } catch (e: any) {
      console.error(e);
      const errorMessage = e.message || 'Failed to generate insights. Please check the data format and try again.';
      setError(errorMessage);
      toast({ variant: "destructive", title: "Error Generating Insights", description: errorMessage });
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-primary" />
            <CardTitle className="font-headline">Generate AI Sales Insights</CardTitle>
          </div>
          <CardDescription>
            Paste your historical sales data in CSV format below to get AI-powered insights.
            Or, load sample data to see how it works.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste your sales data in CSV format here..."
            value={salesDataCsv}
            onChange={(e) => setSalesDataCsv(e.target.value)}
            rows={10}
            className="font-code text-sm"
          />
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between gap-2">
          <Button variant="outline" onClick={handleLoadMockData} disabled={isLoading}>
            Load Sample Data
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Insights...
              </>
            ) : (
              'Get Insights'
            )}
          </Button>
        </CardFooter>
      </Card>

      {insights && (
        <Card className="shadow-lg animate-in fade-in duration-500">
          <CardHeader>
            <CardTitle className="font-headline">AI-Generated Sales Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg mb-1">Summary</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{insights.summary}</p>
            </div>
            <hr />
            <div>
              <h3 className="font-semibold text-lg mb-1">Top Selling Products</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{insights.topSellingProducts}</p>
            </div>
            <hr />
            <div>
              <h3 className="font-semibold text-lg mb-1">Underperforming Products</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{insights.underPerformingProducts}</p>
            </div>
            <hr />
            <div>
              <h3 className="font-semibold text-lg mb-1">Actionable Insights</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{insights.actionableInsights}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
