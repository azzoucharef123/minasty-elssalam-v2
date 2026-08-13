"use strict";

const { PrismaClient } = require("@prisma/client");

/**
 * Shared Prisma client instance.
 *
 * Instantiating PrismaClient multiple times can exhaust database connection
 * pools, especially in serverless or containerized environments with limited
 * resources. This shared module ensures the app uses a single connection pool.
 */
const prisma = new PrismaClient();

module.exports = prisma;
