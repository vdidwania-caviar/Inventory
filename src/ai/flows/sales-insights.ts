'use server';

/**
 * @fileOverview Provides AI-powered sales insights based on historical sales data.
 *
 * - getSalesInsights - A function to analyze sales data and provide actionable insights.
 * - SalesInsightsInput - The input type for the getSalesInsights function.
 * - SalesInsightsOutput - The return type for the getSalesInsights function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SalesInsightsInputSchema = z.object({
  salesData: z
    .string()
    .describe('Historical sales data, preferably in CSV format.'),
});
export type SalesInsightsInput = z.infer<typeof SalesInsightsInputSchema>;

const SalesInsightsOutputSchema = z.object({
  summary: z.string().describe('A summary of the sales data.'),
  topSellingProducts: z
    .string()
    .describe('A list of the top-selling products.'),
  underPerformingProducts: z
    .string()
    .describe('A list of underperforming products.'),
  actionableInsights: z
    .string()
    .describe('Actionable insights based on the sales data.'),
});
export type SalesInsightsOutput = z.infer<typeof SalesInsightsOutputSchema>;

export async function getSalesInsights(input: SalesInsightsInput): Promise<SalesInsightsOutput> {
  return salesInsightsFlow(input);
}

const salesInsightsPrompt = ai.definePrompt({
  name: 'salesInsightsPrompt',
  input: {schema: SalesInsightsInputSchema},
  output: {schema: SalesInsightsOutputSchema},
  prompt: `You are an AI assistant specializing in sales data analysis. Analyze the following sales data and provide a summary, identify top-selling and underperforming products, and offer actionable insights.

Sales Data:
{{{salesData}}}`,
});

const salesInsightsFlow = ai.defineFlow(
  {
    name: 'salesInsightsFlow',
    inputSchema: SalesInsightsInputSchema,
    outputSchema: SalesInsightsOutputSchema,
  },
  async input => {
    const {output} = await salesInsightsPrompt(input);
    return output!;
  }
);
