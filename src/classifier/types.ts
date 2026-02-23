/**
 * Shared types for the Ledgerling classifier pipeline.
 *
 * Exported here so both `serviceRegistry.ts` (which needs `MatchContext` in
 * `buildQuery` signatures) and `classifier.ts` (which builds and consumes it)
 * can import from the same canonical location without creating a circular dep.
 */

export interface MatchContext {
  /** HTTP/HTTPS URLs found in the original query */
  urls: string[]
  /** 0x... EVM wallet addresses found in the original query */
  walletAddresses: string[]
  /** IPv4 addresses found in the original query */
  ipAddresses: string[]
  /** Known crypto ticker/coin names present in the query */
  cryptoSymbols: string[]
  /** Original, un-normalised query */
  raw: string
}
