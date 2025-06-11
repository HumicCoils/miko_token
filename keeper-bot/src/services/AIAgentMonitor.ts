import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';

const logger = createLogger('AIAgentMonitor');

export interface RewardTweet {
    symbol: string;
    tweetId: string;
    text: string;
    createdAt: Date;
}

export class AIAgentMonitor {
    private twitterClient: TwitterApi;
    private lastProcessedTweetId: string | null = null;
    
    constructor() {
        this.twitterClient = new TwitterApi(config.TWITTER_BEARER_TOKEN);
    }
    
    async getLatestRewardTweet(): Promise<RewardTweet | null> {
        try {
            return await withRetry(async () => {
                const tweets = await this.twitterClient.v2.userTimeline(config.AI_AGENT_TWITTER_ID, {
                    max_results: 10,
                    exclude: ['retweets', 'replies'],
                    'tweet.fields': ['created_at', 'text', 'id'],
                });
                
                if (!tweets.data || tweets.data.data.length === 0) {
                    logger.info('No tweets found from AI agent');
                    return null;
                }
                
                // Find the latest reward tweet
                for (const tweet of tweets.data.data) {
                    // Skip if we've already processed this tweet
                    if (this.lastProcessedTweetId && tweet.id <= this.lastProcessedTweetId) {
                        continue;
                    }
                    
                    if (this.isRewardTweet(tweet.text)) {
                        const symbol = this.extractSymbol(tweet.text);
                        if (symbol) {
                            const rewardTweet: RewardTweet = {
                                symbol,
                                tweetId: tweet.id,
                                text: tweet.text,
                                createdAt: new Date(tweet.created_at!),
                            };
                            
                            logger.info({ rewardTweet }, 'Found new reward tweet');
                            this.lastProcessedTweetId = tweet.id;
                            
                            return rewardTweet;
                        }
                    }
                }
                
                return null;
            }, {
                maxRetries: 3,
                delay: 2000,
                onRetry: (error, attempt) => {
                    logger.warn({ error, attempt }, 'Twitter API request failed, retrying...');
                }
            });
        } catch (error) {
            logger.error({ error }, 'Failed to get latest reward tweet');
            throw error;
        }
    }
    
    isRewardTweet(text: string): boolean {
        // Check for reward-related keywords and patterns
        const rewardPatterns = [
            /reward.*\$[A-Z]+/i,
            /distribut.*\$[A-Z]+/i,
            /holder.*reward.*\$[A-Z]+/i,
            /\$[A-Z]+.*reward/i,
            /today'?s?\s+reward.*\$[A-Z]+/i,
            /miko.*reward.*\$[A-Z]+/i,
        ];
        
        return rewardPatterns.some(pattern => pattern.test(text));
    }
    
    extractSymbol(text: string): string | null {
        // Extract token symbol from tweet text
        // Looking for patterns like $BONK, $WIF, etc.
        const symbolMatch = text.match(/\$([A-Z]{2,10})/);
        
        if (symbolMatch && symbolMatch[1]) {
            const symbol = symbolMatch[1];
            logger.debug({ symbol, text }, 'Extracted symbol from tweet');
            return symbol;
        }
        
        logger.warn({ text }, 'Could not extract symbol from tweet');
        return null;
    }
    
    setLastProcessedTweetId(tweetId: string): void {
        this.lastProcessedTweetId = tweetId;
        logger.info({ tweetId }, 'Updated last processed tweet ID');
    }
    
    getLastProcessedTweetId(): string | null {
        return this.lastProcessedTweetId;
    }
}