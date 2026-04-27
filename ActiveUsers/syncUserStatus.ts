import mongoose from 'mongoose';
import dotenv from 'dotenv';
import xlsx from 'xlsx';
const { readFile, utils } = xlsx;
import path from 'path';
import User from '../server/src/models/User.ts';

dotenv.config();

/**
 * Script to synchronize user active status based on an Excel file.
 * Usage: node --loader tsx src/scripts/syncUserStatus.ts <path-to-excel> <tenant-name-or-id> [--dry-run]
 */

async function syncUserStatus() {
    const args = process.argv.slice(2);
    const excelPath = args[0];
    const isDryRun = args.includes('--dry-run');

    if (!excelPath) {
        console.error('Usage: node --loader tsx src/scripts/syncUserStatus.ts <path-to-excel> [--dry-run]');
        process.exit(1);
    }

    try {
        console.log('--- Connecting to Database ---');
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/staffms';
        const dbName = process.env.MONGO_DB_NAME;
        
        await mongoose.connect(uri, { dbName });
        console.log('Connected successfully.');

        // 1. Read Excel
        console.log(`Reading Excel: ${excelPath}`);
        const workbook = readFile(excelPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data: any[][] = utils.sheet_to_json(worksheet, { header: 1 });

        // Extract codes from first column (trim and ensure string format)
        const activeCodes = new Set(
            data
                .map(row => row[0])
                .filter(code => code !== undefined && code !== null && String(code).trim() !== '')
                .map(code => String(code).trim())
        );

        console.log(`Found ${activeCodes.size} unique active codes in Excel.`);

        if (activeCodes.size === 0) {
            console.error('No codes found in the first column of the Excel file.');
            process.exit(1);
        }

        // 2. Process Updates
        if (isDryRun) {
            console.log('--- DRY RUN MODE: No changes will be made ---');
            
            const totalUsers = await User.countDocuments({});
            const matchedUsers = await User.find({ 
                'metadata.numeroLegajoTango': { $in: Array.from(activeCodes) } 
            }, 'metadata.numeroLegajoTango');

            const matchedCodes = new Set(matchedUsers.map(u => u.metadata?.numeroLegajoTango).filter(Boolean));
            const toActivate = matchedCodes.size;

            console.log(`Total users in system: ${totalUsers}`);
            console.log(`Users matching active codes: ${toActivate}`);
            console.log(`Users to be deactivated (or remaining inactive): ${totalUsers - toActivate}`);

            // List codes from Excel that were NOT found in the DB (include names from Excel)
            const missingInDb = data.filter(row => {
                const code = String(row[0]).trim();
                return code && !matchedCodes.has(code) && code !== 'Legajo';
            });

            if (missingInDb.length > 0) {
                console.log('\n--- USERS FOUND IN EXCEL BUT NOT IN DATABASE ---');
                missingInDb.forEach(row => {
                    const code = String(row[0]).trim();
                    const lastName = row[1] || '';
                    const firstName = row[2] || '';
                    console.log(`${code} - ${lastName} ${firstName}`);
                });
                console.log(`\nTotal missing: ${missingInDb.length}`);
            } else {
                console.log('\nAll codes from Excel were found in the database.');
            }
        } else {
            console.log('--- Execution Starting (GLOBAL) ---');

            // Set everyone to inactive first
            const deactivateRes = await User.updateMany(
                {},
                { 
                    $set: { 
                        isActive: false, 
                        'metadata.activo': false 
                    } 
                }
            );
            console.log(`Step 1: Set ${deactivateRes.modifiedCount} users to INACTIVE.`);

            // Activate those in the list
            const activateRes = await User.updateMany(
                { 
                    'metadata.numeroLegajoTango': { $in: Array.from(activeCodes) } 
                },
                { 
                    $set: { 
                        isActive: true, 
                        'metadata.activo': true 
                    } 
                }
            );
            console.log(`Step 2: Set ${activateRes.modifiedCount} users to ACTIVE.`);
            
            console.log('Global sync completed successfully.');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error during synchronization:', error);
        process.exit(1);
    }
}

syncUserStatus();
