"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tableRoutes = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.tableRoutes = router;
router.get('/', (req, res) => res.status(501).json({ message: 'Table routes coming soon' }));
//# sourceMappingURL=tables.js.map