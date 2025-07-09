"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRoutes = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.analyticsRoutes = router;
router.get('/', (req, res) => res.status(501).json({ message: 'Analytics routes coming soon' }));
//# sourceMappingURL=analytics.js.map