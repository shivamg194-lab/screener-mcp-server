import { z } from "zod";

export const SearchCompaniesInputSchema = z
  .object({
    query: z
      .string()
      .min(1, "Query must not be empty")
      .max(100, "Query must not exceed 100 characters")
      .describe("Company name or ticker symbol to search for, e.g. 'TCS' or 'Tata Consultancy'"),
  })
  .strict();

const identifierField = z
  .string()
  .min(1)
  .max(100)
  .describe(
    "Company ticker (e.g. 'TCS', 'INFY'), company name (e.g. 'Tata Consultancy Services'), or a full/relative screener.in company URL/path."
  );

const consolidatedField = z
  .boolean()
  .default(true)
  .describe(
    "Use consolidated financials (includes subsidiaries) if true, standalone (parent company only) if false. Default: true."
  );

export const GetCompanyOverviewInputSchema = z
  .object({
    identifier: identifierField,
    consolidated: consolidatedField,
  })
  .strict();

export const GetFinancialStatementInputSchema = z
  .object({
    identifier: identifierField,
    statement: z
      .enum(["quarters", "profit-loss", "balance-sheet", "cash-flow", "ratios"])
      .describe(
        "Which financial statement/table to retrieve: 'quarters' (quarterly results), 'profit-loss' (annual P&L), 'balance-sheet', 'cash-flow', or 'ratios' (per-year efficiency ratios like debtor days, ROCE%)."
      ),
    consolidated: consolidatedField,
  })
  .strict();

export const GetPeerComparisonInputSchema = z
  .object({
    identifier: identifierField,
    consolidated: consolidatedField,
  })
  .strict();

export const GetTechnicalIndicatorInputSchema = z
  .object({
    ticker: z
      .string()
      .min(1)
      .max(30)
      .describe("Plain NSE/BSE ticker symbol, e.g. 'TCS', 'RITES', 'RELIANCE' (no exchange prefix, no .NS/.BO suffix)."),
    exchange: z
      .enum(["NSE", "BSE"])
      .default("NSE")
      .describe("Which exchange the ticker is listed on. Default: NSE."),
    indicator: z
      .enum(["RSI", "SMA", "EMA", "MACD"])
      .describe("Technical indicator to compute: RSI (momentum/overbought-oversold), SMA/EMA (moving averages), MACD (trend momentum, fixed 12/26/9)."),
    interval: z
      .enum(["1minute", "5minute", "15minute", "30minute", "60minute", "daily", "weekly", "monthly"])
      .default("15minute")
      .describe(
        "Candle interval. For a LIVE/current reading during market hours, use an intraday interval like '5minute' or '15minute' — the most recent candle is the live, still-forming one. Use 'daily'/'weekly'/'monthly' for longer-term/end-of-day analysis. Default: '15minute'."
      ),
    time_period: z
      .number()
      .int()
      .min(2)
      .max(200)
      .default(14)
      .describe("Number of periods used in the indicator calculation (e.g. 14 for standard RSI, 50 or 200 for common SMA/EMA). Ignored for MACD (fixed 12/26/9)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("How many most-recent data points to return (default 10, max 50)."),
  })
  .strict();

const nseSymbolField = z
  .string()
  .min(1)
  .max(30)
  .describe("Plain NSE ticker symbol, e.g. 'TCS', 'RITES' (no exchange suffix).");

export const GetNseQuoteInputSchema = z
  .object({
    symbol: nseSymbolField,
  })
  .strict();

export const GetNseAnnouncementsInputSchema = z
  .object({
    symbol: nseSymbolField,
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(10)
      .describe("How many recent announcements to return (default 10, max 30)."),
  })
  .strict();

export const GetNseCorporateActionsInputSchema = z
  .object({
    symbol: nseSymbolField,
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(10)
      .describe("How many recent/upcoming corporate actions to return (default 10, max 30)."),
  })
  .strict();

export const RunCustomScreenInputSchema = z
  .object({
    query: z
      .string()
      .min(3)
      .max(1000)
      .describe(
        "Screener.in query-builder syntax, e.g. \"Market Capitalization > 500 AND Return on equity > 22\". " +
          "Combine conditions with AND/OR. Common fields: Market Capitalization, Current Price, Price to Earning, " +
          "Return on equity, Return on capital employed, Debt to equity, Sales growth, Profit growth, Dividend yield, Book value."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Maximum number of result rows to return (default 25, max 100). Guest access is capped by Screener regardless of this value."),
  })
  .strict();
