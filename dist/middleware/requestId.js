"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = void 0;
const uuid_1 = require("uuid");
const requestId = (req, res, next) => {
    // Generate unique request ID
    const id = req.headers['x-request-id'] || (0, uuid_1.v4)();
    // Add to request object
    req.requestId = id;
    // Add to response headers
    res.set('X-Request-ID', id);
    next();
};
exports.requestId = requestId;
//# sourceMappingURL=requestId.js.map