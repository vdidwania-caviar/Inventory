'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import {
  ChartContainer,
  ChartTooltipContent,
  ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SalesSummaryChartProps {
  data: { name: string; totalSales: number }[];
}

const chartConfig = {
  totalSales: {
    label: 'Total Sales',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;


export function SalesSummaryChart({ data }: SalesSummaryChartProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="font-headline">Sales Summary</CardTitle>
        <CardDescription>Monthly sales performance for the last 7 months.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                padding={{ left: 10, right: 10 }}
              />
              <YAxis tickFormatter={(value) => `$${value / 1000}k`} tickLine={false} axisLine={false} tickMargin={8}/>
              <Tooltip
                cursor={{ fill: 'hsl(var(--accent))', radius: 4 }}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Bar dataKey="totalSales" fill="var(--color-totalSales)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
