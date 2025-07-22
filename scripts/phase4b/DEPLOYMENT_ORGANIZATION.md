# Phase 4-B Deployment Organization

## Old Deployments Archived

### phase4b-old-deployment/
- Contains the first failed deployment attempt (missing ALTs)
- Programs: Vault (6YncMnRAwCpa...), Smart Dial (CCJrRNczvCGF...)
- Token: F4grjvNRa4rGZj5FukvU8YwmCV8J6zg5Wssfbt6TSfgM

### phase4b-old-deployment-20250722-111346/
- Contains the second deployment attempt (before ALT fix)
- Programs: Vault (C4N6rHoUxrFoXPny...), Smart Dial (6nwvggz3Hoi2...)
- Token: HD4QRxVDA9Ec4wEXH2obhtqmkUbpGof74EnZwqt1eyQH
- All Phase 3 steps were completed on this deployment

### phase4b-programs-old-deployment/
- The Anchor programs directory from the second deployment
- Contains built programs and IDLs

## Current Status

The workspace is now clean for a fresh deployment on the mainnet fork with proper ALTs:
- Fork is running with ALTs: AcL1Vo8oy1ULiavEcjSUcwfBSForXMudcZvDZy5nzJkU, 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1
- Ready to generate new keypairs and deploy programs

## Next Steps
1. Generate new keypairs for programs and deployer
2. Build and deploy programs
3. Create MIKO token
4. Complete Phase 3 setup
5. Test launch coordinator