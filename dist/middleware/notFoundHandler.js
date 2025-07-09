"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = void 0;
const errorHandler_1 = require("@/middleware/errorHandler");
const notFoundHandler = (req, res) => {
    const error = new errorHandler_1.NotFoundError(`Route ${req.originalUrl} not found`);
    res.status(error.statusCode).json({
        error: {
            message: error.message,
            code: error.code,
            timestamp: new Date().toISOString(),
            path: req.originalUrl,
            method: req.method
        }
    });
};
exports.notFoundHandler = notFoundHandler;
//# sourceMappingURL=notFoundHandler.js.map