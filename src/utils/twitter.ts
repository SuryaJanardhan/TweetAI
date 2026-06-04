import { TwitterApi } from 'twitter-api-v2';
import { loadConfig } from '../config.js';
import { AppError } from './errors.js';

const config = loadConfig();
let twitterClient: TwitterApi | null = null;

// Initialize the client only if dry run is disabled and credentials are provided
if (!config.safety.dryRun && config.twitter) {
  try {
    twitterClient = new TwitterApi({
      appKey: config.twitter.apiKey,
      appSecret: config.twitter.apiSecret,
      accessToken: config.twitter.accessToken,
      accessSecret: config.twitter.accessSecret
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Twitter] Failed to initialize Twitter API Client:', error);
  }
}

export interface TweetResult {
  tweetId: string;
  text: string;
  dryRun: boolean;
}

export async function postTweet(text: string): Promise<TweetResult> {
  if (config.safety.dryRun) {
    const mockId = `dryrun_${Date.now()}`;
    // eslint-disable-next-line no-console
    console.log(`[Twitter DRY-RUN] Posting tweet: "${text}" (Simulated ID: ${mockId})`);
    return {
      tweetId: mockId,
      text,
      dryRun: true
    };
  }

  if (!twitterClient) {
    throw new AppError(
      500,
      'twitter_client_uninitialized',
      'Twitter API client is uninitialized. Ensure credentials are set and DRY_RUN is false.'
    );
  }

  try {
    // eslint-disable-next-line no-console
    console.log(`[Twitter] Posting tweet: "${text}"`);
    const { data } = await twitterClient.v2.tweet(text);
    return {
      tweetId: data.id,
      text,
      dryRun: false
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    // eslint-disable-next-line no-console
    console.error('[Twitter] API request failed:', err);
    throw new AppError(502, 'twitter_api_failed', `Twitter API call failed: ${err.message}`);
  }
}
