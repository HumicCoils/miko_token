import { TwitterMonitor } from '../../src/modules/TwitterMonitor';
import { Config } from '../../src/config/config';
import * as fs from 'fs';
import * as path from 'path';

describe('TwitterMonitor - First Monday Calculation', () => {
  let monitor: TwitterMonitor;
  let mockConfig: Config;

  beforeEach(() => {
    // Create minimal mock config
    mockConfig = {
      apis: {
        twitter: {
          enabled: false,
          api_key: 'mock',
          api_secret: 'mock',
          access_token: 'mock',
          access_secret: 'mock',
          account_handle: 'project_miko'
        }
      }
    } as Config;

    monitor = new TwitterMonitor(mockConfig);
  });

  describe('VC:4.FIRST_MONDAY - First Monday calculation', () => {
    const testCases = [
      {
        name: 'Launch on Monday',
        launchDate: new Date('2025-01-20T12:00:00Z'), // Monday
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
      },
      {
        name: 'Launch on Tuesday',
        launchDate: new Date('2025-01-21T12:00:00Z'), // Tuesday
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
      },
      {
        name: 'Launch on Wednesday',
        launchDate: new Date('2025-01-22T12:00:00Z'), // Wednesday
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
      },
      {
        name: 'Launch on Thursday',
        launchDate: new Date('2025-01-23T12:00:00Z'), // Thursday
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
      },
      {
        name: 'Launch on Friday',
        launchDate: new Date('2025-01-24T12:00:00Z'), // Friday
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
      },
      {
        name: 'Launch on Saturday',
        launchDate: new Date('2025-01-25T12:00:00Z'), // Saturday
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
      },
      {
        name: 'Launch on Sunday',
        launchDate: new Date('2025-01-26T12:00:00Z'), // Sunday
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Tomorrow (Monday)
      },
      {
        name: 'Launch on Monday at 00:00 UTC',
        launchDate: new Date('2025-01-20T00:00:00Z'), // Monday midnight
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
      },
      {
        name: 'Launch on Monday at 23:59 UTC',
        launchDate: new Date('2025-01-20T23:59:00Z'), // Monday late
        expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
      }
    ];

    testCases.forEach(testCase => {
      it(testCase.name, () => {
        const timestamp = Math.floor(testCase.launchDate.getTime() / 1000);
        monitor.setLaunchTimestamp(timestamp);
        
        const firstMonday = monitor.getFirstMondayAfterLaunch();
        
        expect(firstMonday).not.toBeNull();
        expect(firstMonday!.toISOString()).toBe(testCase.expectedFirstMonday.toISOString());
        
        // Verify it's a Monday
        expect(firstMonday!.getUTCDay()).toBe(1);
        
        // Verify it's at 03:00 UTC
        expect(firstMonday!.getUTCHours()).toBe(3);
        expect(firstMonday!.getUTCMinutes()).toBe(0);
        expect(firstMonday!.getUTCSeconds()).toBe(0);
      });
    });

    it('should return null if no launch timestamp is set', () => {
      const firstMonday = monitor.getFirstMondayAfterLaunch();
      expect(firstMonday).toBeNull();
    });
  });

  describe('isTimeToCheck', () => {
    it('should return false before first Monday', () => {
      // Set launch to last Monday
      const lastMonday = new Date('2025-01-13T12:00:00Z');
      monitor.setLaunchTimestamp(Math.floor(lastMonday.getTime() / 1000));
      
      // Mock current time to be before next Monday
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-19T12:00:00Z')); // Sunday
      
      expect(monitor.isTimeToCheck()).toBe(false);
      
      jest.useRealTimers();
    });

    it('should return true on Monday at 03:00 UTC after first Monday', () => {
      // Set launch to two weeks ago
      const twoWeeksAgo = new Date('2025-01-06T12:00:00Z');
      monitor.setLaunchTimestamp(Math.floor(twoWeeksAgo.getTime() / 1000));
      
      // Mock current time to be Monday 03:00 UTC
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-20T03:00:00Z'));
      
      expect(monitor.isTimeToCheck()).toBe(true);
      
      jest.useRealTimers();
    });

    it('should return false on Monday but wrong time', () => {
      // Set launch to two weeks ago
      const twoWeeksAgo = new Date('2025-01-06T12:00:00Z');
      monitor.setLaunchTimestamp(Math.floor(twoWeeksAgo.getTime() / 1000));
      
      // Mock current time to be Monday but at 04:00 UTC (too late)
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-20T04:00:00Z'));
      
      expect(monitor.isTimeToCheck()).toBe(false);
      
      jest.useRealTimers();
    });
  });

  describe('extractSymbolFromText', () => {
    const testCases = [
      { text: 'Reward token is $PEPE!', expected: 'PEPE' },
      { text: '$BONK rewards this week', expected: 'BONK' },
      { text: 'Switching to $SOL.', expected: 'SOL' },
      { text: 'New token: $MEME123', expected: 'MEME123' },
      { text: '$DOGE, the people\'s coin!', expected: 'DOGE' },
      { text: 'no symbol here', expected: null },
      { text: '$ SPACED not valid', expected: null },
      { text: '$lowercase not valid', expected: null },
      { text: '$TOOLONGTOKEN12345', expected: null },
      { text: 'Multiple $FIRST and $SECOND', expected: 'FIRST' }, // Gets first one
    ];

    testCases.forEach(({ text, expected }) => {
      it(`should extract "${expected}" from "${text}"`, () => {
        const result = monitor.extractSymbolFromText(text);
        expect(result).toBe(expected);
      });
    });
  });

  describe('VC:4.FIRST_MONDAY verification artifact', () => {
    it('should generate verification artifact', async () => {
      // Recreate test cases for verification
      const verificationTestCases = [
        {
          name: 'Launch on Monday',
          launchDate: new Date('2025-01-20T12:00:00Z'), // Monday
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
        },
        {
          name: 'Launch on Tuesday',
          launchDate: new Date('2025-01-21T12:00:00Z'), // Tuesday
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
        },
        {
          name: 'Launch on Wednesday',
          launchDate: new Date('2025-01-22T12:00:00Z'), // Wednesday
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
        },
        {
          name: 'Launch on Thursday',
          launchDate: new Date('2025-01-23T12:00:00Z'), // Thursday
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
        },
        {
          name: 'Launch on Friday',
          launchDate: new Date('2025-01-24T12:00:00Z'), // Friday
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
        },
        {
          name: 'Launch on Saturday',
          launchDate: new Date('2025-01-25T12:00:00Z'), // Saturday
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
        },
        {
          name: 'Launch on Sunday',
          launchDate: new Date('2025-01-26T12:00:00Z'), // Sunday
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Tomorrow (Monday)
        },
        {
          name: 'Launch on Monday at 00:00 UTC',
          launchDate: new Date('2025-01-20T00:00:00Z'), // Monday midnight
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
        },
        {
          name: 'Launch on Monday at 23:59 UTC',
          launchDate: new Date('2025-01-20T23:59:00Z'), // Monday late
          expectedFirstMonday: new Date('2025-01-27T03:00:00Z') // Next Monday
        }
      ];
      
      const verificationResults = verificationTestCases.map(testCase => {
        const timestamp = Math.floor(testCase.launchDate.getTime() / 1000);
        monitor.setLaunchTimestamp(timestamp);
        const firstMonday = monitor.getFirstMondayAfterLaunch();
        
        return {
          launchDate: testCase.launchDate.toISOString(),
          launchDayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][testCase.launchDate.getUTCDay()],
          calculatedFirstMonday: firstMonday?.toISOString(),
          expectedFirstMonday: testCase.expectedFirstMonday.toISOString(),
          matches: firstMonday?.toISOString() === testCase.expectedFirstMonday.toISOString()
        };
      });

      const allPassed = verificationResults.every(r => r.matches);

      const artifact = {
        vc_id: 'VC:4.FIRST_MONDAY',
        observed: {
          testResults: verificationResults,
          totalTests: verificationResults.length,
          passedTests: verificationResults.filter(r => r.matches).length
        },
        expected: {
          rule: 'If launch on Monday, first Monday = launch + 7 days; else first Monday = next Monday after launch',
          time: '03:00:00 UTC',
          dayOfWeek: 1 // Monday
        },
        passed: allPassed,
        checked_at: new Date().toISOString(),
        notes: allPassed ? 'All first Monday calculations correct' : 'Some calculations failed'
      };

      // Write artifact
      const artifactPath = path.join(process.cwd(), 'verification', 'vc4-first-monday.json');
      const artifactDir = path.dirname(artifactPath);
      
      if (!fs.existsSync(artifactDir)) {
        fs.mkdirSync(artifactDir, { recursive: true });
      }
      
      fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
      
      expect(artifact.passed).toBe(true);
    });
  });
});