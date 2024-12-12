import { prisma } from "../database.js";
import { logger } from "../utils/logger.js";

// Centralized response handling with more robust methods
class ApiResponse {
    static success(data, message = 'Success', meta = {}) {
        return {
            success: true,
            message,
            data,
            ...meta
        };
    }

    static error(message = 'Internal server error', status = 500, details = {}) {
        return {
            success: false,
            message,
            status,
            ...details
        };
    }
}

// Enhanced validation helpers with more descriptive errors
const ValidationHelpers = {
    validatePagination(page = 1, limit = 10) {
        const parsedPage = Math.max(1, parseInt(page, 10));
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

        return {
            page: parsedPage,
            limit: parsedLimit,
            skip: (parsedPage - 1) * parsedLimit
        };
    },

    validateId(id, entityName = 'ID') {
        const parsed = parseInt(id, 10);
        if (isNaN(parsed) || parsed <= 0) {
            throw new Error(`Invalid ${entityName} provided`);
        }
        return parsed;
    }
};

// Centralized error handler with improved logging and error handling
const asyncHandler = (handler) => async (req, res) => {
    try {
        await handler(req, res);
    } catch (error) {
        logger.error(`Error in ${handler.name}:`, {
            message: error.message,
            stack: error.stack,
            path: req.path,
            method: req.method
        });

        const status = error.status || (error.code === 'P2025' ? 404 : 500);
        const response = ApiResponse.error(
            error.message || 'An unexpected error occurred',
            status,
            { path: req.path }
        );

        res.status(response.status).json(response);
    }
};

// Constants for common selections (unchanged)
const WASTE_TYPE_SELECT = {
    waste_type_id: true,
    waste_type_name: true,
    image: true,
};

const WASTE_SELECT = {
    waste_id: true,
    waste_name: true,
    image: true,
    description: true,
    waste_type_id: true,
};

// Optimized controller functions with improved error handling and logging
export const getAllWasteTypes = asyncHandler(async (req, res) => {
    const wasteTypes = await prisma.waste_type.findMany({
        select: WASTE_TYPE_SELECT,
        orderBy: { waste_type_name: 'asc' },
    });

    if (!wasteTypes.length) {
        const response = ApiResponse.error('No waste types found.', 404);
        return res.status(404).json(response);
    }

    res.json(ApiResponse.success(wasteTypes));
});

export const getWasteById = asyncHandler(async (req, res) => {
    const wasteTypeId = ValidationHelpers.validateId(req.params.id, 'Waste Type');

    const waste = await prisma.waste.findMany({
        where: { waste_type_id: wasteTypeId },
        select: {
            ...WASTE_SELECT,
            waste_type: {
                select: WASTE_TYPE_SELECT
            }
        },
        orderBy: { waste_name: 'asc' }
    });

    if (!waste.length) {
        const response = ApiResponse.error('No waste found for the given ID.', 404);
        return res.status(404).json(response);
    }

    res.json(ApiResponse.success(waste));
});

export const getWasteLists = asyncHandler(async (req, res) => {
    const { page, limit, skip } = ValidationHelpers.validatePagination(
        req.query.page,
        req.query.limit
    );
    const search = req.query.search?.trim();

    // Build where clause conditionally
    const where = search ? {
        waste_name: {
            contains: search,
            mode: 'insensitive'
        }
    } : undefined;

    // Execute queries in parallel with improved error tracking
    const [wasteData, totalWasteCount] = await Promise.all([
        prisma.waste.findMany({
            where,
            skip,
            take: limit,
            select: WASTE_SELECT,
            orderBy: { waste_name: 'asc' }
        }),
        prisma.waste.count({ where })
    ]);

    const pagination = {
        total: totalWasteCount,
        page,
        limit,
        totalPages: Math.ceil(totalWasteCount / limit)
    };

    res.json(ApiResponse.success({
        items: wasteData,
        pagination
    }));
});

export const findWasteName = asyncHandler(async (req, res) => {
    const name = req.query.name?.trim();

    if (!name) {
        const response = ApiResponse.error('Waste name is required.', 400);
        return res.status(400).json(response);
    }

    const waste = await prisma.waste.findMany({
        where: {
            waste_name: {
                contains: name,
                mode: 'insensitive'
            }
        },
        select: WASTE_SELECT,
        orderBy: { waste_name: 'asc' },
        take: 50
    });

    if (!waste.length) {
        const response = ApiResponse.error('No waste found with the given name.', 404);
        return res.status(404).json(response);
    }

    res.json(ApiResponse.success(waste));
});

// Simplified cache implementation with more flexibility
const createCache = () => {
    const cache = new Map();

    return {
        get: async (key) => {
            const item = cache.get(key);
            return item && item.expires > Date.now() ? item.value : null;
        },
        set: async (key, value, ttl = 3600) => {
            cache.set(key, {
                value,
                expires: Date.now() + (ttl * 1000)
            });
        },
        clear: async (key) => {
            cache.delete(key);
        }
    };
};

export const withCache = (getCacheKey, ttl = 3600) => async (req, res, next) => {
    const cache = createCache();

    try {
        const cacheKey = typeof getCacheKey === 'function'
            ? getCacheKey(req)
            : getCacheKey;

        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Attach cache method to response
        res.locals.cache = {
            set: async (data) => await cache.set(cacheKey, data, ttl)
        };

        next();
    } catch (error) {
        next(error);
    }
};