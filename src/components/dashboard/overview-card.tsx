import type { InventoryMetric } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface OverviewCardProps {
  metric: InventoryMetric;
}

export function OverviewCard({ metric }: OverviewCardProps) {
  const TrendIcon = metric.trendDirection === 'up' ? TrendingUp : metric.trendDirection === 'down' ? TrendingDown : Minus;
  const trendColor = metric.trendDirection === 'up' ? 'text-green-500' : metric.trendDirection === 'down' ? 'text-red-500' : 'text-muted-foreground';

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{metric.title}</CardTitle>
        <metric.icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold font-headline">{metric.value}</div>
        {metric.trend && (
          <p className={cn("text-xs mt-1 flex items-center", trendColor)}>
            <TrendIcon className="h-4 w-4 mr-1" />
            {metric.trend}
          </p>
        )}
        {metric.description && (
           <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
        )}
      </CardContent>
    </Card>
  );
}
