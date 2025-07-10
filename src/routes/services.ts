import { Router } from 'express';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { BusinessType } from '@prisma/client';
import { 
  PET_SHOP_SERVICES, 
  PET_HOTEL_ROOMS,
  PET_HOTEL_STAY_OPTIONS,
  getServicesByCategory, 
  getServicesByPetType,
  getHotelRoomsByPetType,
  getHotelRoomsByType,
  getAllServiceCategories,
  getAllPetTypes,
  calculateHotelStayPrice
} from '../data/petShopServices';

const router = Router();

// Get all services for a business
router.get('/business/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { category, petType } = req.query;

    const services = await prisma.service.findMany({
      where: {
        businessId,
        isActive: true,
        ...(category && { category: category as string }),
      },
      orderBy: {
        name: 'asc'
      }
    });

    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    logger.error('Error fetching services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch services'
    });
  }
});

// Get pet shop service templates (6 categories)
router.get('/templates/pet-shop', async (req, res) => {
  try {
    const { category, petType } = req.query;

    let services = PET_SHOP_SERVICES;

    if (category) {
      services = getServicesByCategory(category as any);
    }

    if (petType) {
      services = getServicesByPetType(petType as string);
    }

    res.json({
      success: true,
      data: {
        services,
        categories: getAllServiceCategories(),
        petTypes: getAllPetTypes()
      }
    });
  } catch (error) {
    logger.error('Error fetching pet shop service templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pet shop service templates'
    });
  }
});

// Get pet hotel rooms and options
router.get('/pet-hotel/rooms', async (req, res) => {
  try {
    const { petType, roomType } = req.query;

    let rooms = PET_HOTEL_ROOMS;

    if (petType) {
      rooms = getHotelRoomsByPetType(petType as string);
    }

    if (roomType) {
      rooms = getHotelRoomsByType(roomType as any);
    }

    res.json({
      success: true,
      data: {
        rooms,
        stayOptions: PET_HOTEL_STAY_OPTIONS,
        roomTypes: ['STANDARD', 'DELUXE', 'PREMIUM', 'VIP']
      }
    });
  } catch (error) {
    logger.error('Error fetching pet hotel rooms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pet hotel rooms'
    });
  }
});

// Calculate pet hotel stay price
router.post('/pet-hotel/calculate-price', async (req, res) => {
  try {
    const { roomId, nights, checkIn, checkOut } = req.body;

    if (!roomId || !nights) {
      return res.status(400).json({
        success: false,
        error: 'Room ID and number of nights are required'
      });
    }

    const room = PET_HOTEL_ROOMS.find(r => r.id === roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    const totalPrice = calculateHotelStayPrice(room, nights);
    const stayOption = PET_HOTEL_STAY_OPTIONS.find(option => 
      nights >= option.minNights && nights <= option.maxNights
    );

    res.json({
      success: true,
      data: {
        room,
        nights,
        pricePerNight: room.pricePerNight,
        subtotal: room.pricePerNight * nights,
        discount: stayOption?.discountPercentage || 0,
        totalPrice,
        stayOption: stayOption?.name,
        checkIn,
        checkOut
      }
    });
  } catch (error) {
    logger.error('Error calculating pet hotel price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate pet hotel price'
    });
  }
});

// Create services for a business from pet shop templates
router.post('/bulk-create-pet-shop', async (req, res) => {
  try {
    const { businessId, categories } = req.body;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID is required'
      });
    }

    // Check if business exists and is a pet shop
    const business = await prisma.business.findFirst({
      where: {
        id: businessId,
        businessType: BusinessType.PET_SHOP,
        isActive: true
      }
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Pet shop business not found'
      });
    }

    // Get services to create based on categories
    let servicesToCreate = PET_SHOP_SERVICES;
    if (categories && Array.isArray(categories)) {
      servicesToCreate = PET_SHOP_SERVICES.filter(service => 
        categories.includes(service.category)
      );
    }

    // Create services in database
    const createdServices = await Promise.all(
      servicesToCreate.map(async (serviceTemplate) => {
        return await prisma.service.create({
          data: {
            businessId,
            name: serviceTemplate.name,
            description: serviceTemplate.description,
            duration: serviceTemplate.duration,
            price: serviceTemplate.price,
            category: serviceTemplate.category,
            isActive: true,
            settings: {
              petTypes: serviceTemplate.petTypes,
              requirements: serviceTemplate.requirements || [],
              additionalInfo: serviceTemplate.additionalInfo
            }
          }
        });
      })
    );

    logger.info(`Created ${createdServices.length} pet shop services for business ${businessId}`);

    res.json({
      success: true,
      data: {
        created: createdServices.length,
        services: createdServices
      }
    });
  } catch (error) {
    logger.error('Error creating pet shop services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create pet shop services'
    });
  }
});

// Get service by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            businessType: true
          }
        }
      }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      data: service
    });
  } catch (error) {
    logger.error('Error fetching service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch service'
    });
  }
});

// Create a new service
router.post('/', async (req, res) => {
  try {
    const {
      businessId,
      name,
      description,
      duration,
      price,
      category,
      isActive = true,
      settings = {}
    } = req.body;

    if (!businessId || !name || !duration || !price) {
      return res.status(400).json({
        success: false,
        error: 'Business ID, name, duration, and price are required'
      });
    }

    const service = await prisma.service.create({
      data: {
        businessId,
        name,
        description,
        duration,
        price,
        category,
        isActive,
        settings
      }
    });

    logger.info(`Created service ${service.id} for business ${businessId}`);

    res.status(201).json({
      success: true,
      data: service
    });
  } catch (error) {
    logger.error('Error creating service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create service'
    });
  }
});

// Update a service
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const service = await prisma.service.update({
      where: { id },
      data: updateData
    });

    logger.info(`Updated service ${id}`);

    res.json({
      success: true,
      data: service
    });
  } catch (error) {
    logger.error('Error updating service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update service'
    });
  }
});

// Delete a service
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.service.delete({
      where: { id }
    });

    logger.info(`Deleted service ${id}`);

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete service'
    });
  }
});

export default router; 