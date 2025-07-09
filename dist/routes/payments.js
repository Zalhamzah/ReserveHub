"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRoutes = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.paymentRoutes = router;
router.get('/', (req, res) => res.status(501).json({ message: 'Payment routes coming soon' }));
//# sourceMappingURL=payments.js.map