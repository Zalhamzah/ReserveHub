import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestTables() {
  try {
    const businessId = 'cmcvm0c700001183pd3xmxx4e';
    
    // Check if business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, businessType: true }
    });
    
    if (!business) {
      console.log('❌ Business not found:', businessId);
      return;
    }
    
    console.log('✅ Business found:', business.name, `(${business.businessType})`);
    
    // Check existing tables
    const existingTables = await prisma.table.findMany({
      where: { businessId },
      select: { id: true, number: true, capacity: true }
    });
    
    console.log(`📊 Found ${existingTables.length} existing tables`);
    
    if (existingTables.length === 0) {
      console.log('🔧 Creating test tables...');
      
      // Create tables based on business type
      const tablesToCreate = [];
      
      if (business.businessType === 'RESTAURANT') {
        tablesToCreate.push(
          { number: 'T1', capacity: 2 },
          { number: 'T2', capacity: 4 },
          { number: 'T3', capacity: 4 },
          { number: 'T4', capacity: 6 },
          { number: 'T5', capacity: 8 },
          { number: 'B1', capacity: 6 }, // Booth
          { number: 'B2', capacity: 4 }, // Booth
          { number: 'C1', capacity: 2 }, // Counter
          { number: 'C2', capacity: 2 }, // Counter
          { number: 'O1', capacity: 4 }  // Outdoor
        );
      } else if (business.businessType === 'SALON') {
        tablesToCreate.push(
          { number: 'S1', capacity: 1 }, // Single station
          { number: 'S2', capacity: 1 },
          { number: 'S3', capacity: 1 },
          { number: 'S4', capacity: 1 },
          { number: 'D1', capacity: 2 }, // Double station
          { number: 'D2', capacity: 2 },
          { number: 'P1', capacity: 1 }, // Private room
          { number: 'P2', capacity: 1 }
        );
      } else if (business.businessType === 'PET_SHOP') {
        tablesToCreate.push(
          { number: 'G1', capacity: 1 }, // Grooming station
          { number: 'G2', capacity: 1 },
          { number: 'G3', capacity: 1 },
          { number: 'V1', capacity: 1 }, // Vet station
          { number: 'V2', capacity: 1 },
          { number: 'T1', capacity: 1 }, // Training room
          { number: 'T2', capacity: 1 },
          { number: 'C1', capacity: 2 }  // Consultation room
        );
      } else {
        // Default tables for other business types
        tablesToCreate.push(
          { number: 'T1', capacity: 2 },
          { number: 'T2', capacity: 4 },
          { number: 'T3', capacity: 4 },
          { number: 'T4', capacity: 6 }
        );
      }
      
      // Create tables
      for (const tableData of tablesToCreate) {
        await prisma.table.create({
          data: {
            businessId,
            number: tableData.number,
            capacity: tableData.capacity,
            type: 'REGULAR',
            shape: 'SQUARE',
            isActive: true,
            isAvailable: true
          }
        });
        console.log(`✅ Created table ${tableData.number} (capacity: ${tableData.capacity})`);
      }
      
      console.log(`🎉 Successfully created ${tablesToCreate.length} tables for ${business.name}`);
    } else {
      console.log('📋 Existing tables:');
      existingTables.forEach(table => {
        console.log(`  - ${table.number} (capacity: ${table.capacity})`);
      });
    }
    
    // Check if there are any users for the business
    const systemUser = await prisma.user.findFirst({
      where: { businessId, role: 'ADMIN' }
    });
    
    if (!systemUser) {
      console.log('🔧 Creating system user...');
      await prisma.user.create({
        data: {
          email: 'system@reservehub.com',
          password: '$2b$10$dummy.hash.for.system.user',
          firstName: 'System',
          lastName: 'User',
          role: 'ADMIN',
          businessId,
          emailVerified: true
        }
      });
      console.log('✅ Created system user');
    }
    
    console.log('✅ All setup complete!');
    
  } catch (error) {
    console.error('❌ Error creating test tables:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestTables(); 