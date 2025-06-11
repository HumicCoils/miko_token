import { AIAgentMonitor } from '../../src/services/AIAgentMonitor';

describe('AIAgentMonitor', () => {
    let monitor: AIAgentMonitor;
    
    beforeEach(() => {
        monitor = new AIAgentMonitor();
    });
    
    describe('isRewardTweet', () => {
        it('should detect reward tweets', () => {
            const rewardTweets = [
                "Today's reward is $BONK! 🎉",
                "Distributing $WIF rewards to all holders",
                "MIKO holders reward: $SAMO",
                "$ORCA rewards coming soon",
                "Reward distribution complete for $BONK",
            ];
            
            rewardTweets.forEach(tweet => {
                expect(monitor.isRewardTweet(tweet)).toBe(true);
            });
        });
        
        it('should not detect non-reward tweets', () => {
            const nonRewardTweets = [
                "Just bought some $BONK",
                "The market is looking good today",
                "$BTC to the moon!",
                "Check out this new project",
            ];
            
            nonRewardTweets.forEach(tweet => {
                expect(monitor.isRewardTweet(tweet)).toBe(false);
            });
        });
    });
    
    describe('extractSymbol', () => {
        it('should extract symbols correctly', () => {
            const testCases = [
                { text: "Today's reward is $BONK!", expected: 'BONK' },
                { text: "Distributing $WIF to holders", expected: 'WIF' },
                { text: "$SAMO rewards are live", expected: 'SAMO' },
                { text: "Get your $ORCA tokens", expected: 'ORCA' },
            ];
            
            testCases.forEach(({ text, expected }) => {
                expect(monitor.extractSymbol(text)).toBe(expected);
            });
        });
        
        it('should return null for texts without symbols', () => {
            const textsWithoutSymbols = [
                "No symbols here",
                "Just regular text",
                "123 ABC no dollar sign",
            ];
            
            textsWithoutSymbols.forEach(text => {
                expect(monitor.extractSymbol(text)).toBeNull();
            });
        });
        
        it('should handle edge cases', () => {
            expect(monitor.extractSymbol("$")).toBeNull();
            expect(monitor.extractSymbol("$123")).toBeNull();
            expect(monitor.extractSymbol("$a")).toBeNull(); // Too short
            expect(monitor.extractSymbol("$VERYLONGSYMBOL")).toBeNull(); // Too long
        });
    });
    
    describe('lastProcessedTweetId', () => {
        it('should track last processed tweet ID', () => {
            expect(monitor.getLastProcessedTweetId()).toBeNull();
            
            const tweetId = '1234567890';
            monitor.setLastProcessedTweetId(tweetId);
            
            expect(monitor.getLastProcessedTweetId()).toBe(tweetId);
        });
    });
});